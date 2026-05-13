// ============================================================
// AskMiro GAS — readiness.gs
// Outreach Readiness Gate + Mail Direction Pre-Classifier
//
// PURPOSE:
//   1. classify_mail_direction(thread) — runs BEFORE any reply
//      classification (rule-based or AI). Determines whether a
//      thread message is human, machine, bounce, OOO, etc.
//
//   2. readiness_gate(entity) — checks the entity's
//      outreach_readiness_status in Postgres before any email
//      is sent. Blocks sends if status is not READY_FOR_OUTREACH.
//
//   3. bounce_handler(thread) — detects bounce DSNs and writes
//      back to Postgres + email_suppressions.
//
//   4. triggerReadinessScore(entityId) — fires the Railway API
//      to rescore a single entity after enrichment completes.
//
// HOW TO USE:
//   In outreach.gs, wrap every send with:
//     if (!readiness_gate(entity)) return;
//
//   In scanOutreachReplies(), replace the bare from-check with:
//     const direction = classify_mail_direction(thread);
//     if (direction !== 'INBOUND_HUMAN') { handleNonHuman(thread, direction); continue; }
//
// ROUTER ENTRY (from your main doGet/doPost):
//   if (action === 'readiness.score') return handleReadinessScore(params);
// ============================================================


// ── Mail direction patterns ──────────────────────────────────────────────────

const _MD = {
  // Bounce / DSN
  BOUNCE_FROM: /^(mailer-daemon|postmaster|mail-daemon|bounce|daemon|noreply.*bounce)/i,
  BOUNCE_SUBJECT: /^(delivery status notification|undeliverable|mail delivery failed|returned mail|failure notice|delivery failure|non-delivery report|could not be delivered)/i,
  BOUNCE_HEADERS: ['x-failed-recipients', 'x-original-to', 'auto-submitted'],

  // Out-of-office / vacation
  OOO_SUBJECT: /^(out of (office|office:)|auto(matic)? reply|automatic response|vacation (reply|response)|away (from the office|message)|i am (out|away|on leave)|on annual leave)/i,
  OOO_FROM:    /^(autoreply|auto-reply|noreply|no-reply|donotreply)/i,

  // Machine/automated
  MACHINE_FROM: /^(noreply|no-reply|donotreply|do-not-reply|no\.reply|notifications?|alerts?|updates?|automated?|system|bot@|mailer@|info-bounce)/i,
  MACHINE_SUBJECT: /^(re:\s*)?(notification|your (account|booking|order|receipt|invoice)|thank you for (your enquiry|contacting)|confirmation|alert|ticket #|case #|\[automated\]|\[auto\])/i,

  // Unsubscribe signal in body or subject
  UNSUBSCRIBE_SUBJECT: /(unsubscribe|remove me|opt.?out|stop (emailing|contacting)|take me off|please remove)/i,

  // AskMiro own emails (already sent / follow-ups we're seeing in thread)
  OWN_DOMAINS: ['askmiro.com', 'askmirocleaning.co.uk'],
};


/**
 * Classify the most recent inbound message in a thread.
 *
 * Returns one of:
 *   OUTBOUND_ASKMIRO           — our own message (not a reply)
 *   INBOUND_HUMAN              — a real human reply
 *   INBOUND_MACHINE            — automated notification / system message
 *   BOUNCE                     — DSN / mail delivery failure
 *   OUT_OF_OFFICE              — auto vacation reply
 *   AUTO_REPLY                 — generic auto-responder
 *   UNSUBSCRIBE                — opt-out signal
 *   DELIVERY_STATUS_NOTIFICATION — formal DSN report
 *   UNKNOWN                    — can't classify
 *
 * @param {GmailThread} thread
 * @returns {{ direction: string, from: string, subject: string, bounced_to: string|null }}
 */
function classify_mail_direction(thread) {
  const messages = thread.getMessages();
  // We want the most recent message that isn't from us
  let msg = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const from = messages[i].getFrom() || '';
    const isOwn = _MD.OWN_DOMAINS.some(d => from.includes(d));
    if (!isOwn) { msg = messages[i]; break; }
  }

  if (!msg) {
    return { direction: 'OUTBOUND_ASKMIRO', from: '', subject: '', bounced_to: null };
  }

  const from    = (msg.getFrom() || '').toLowerCase();
  const subject = (msg.getSubject() || '').toLowerCase().trim();
  const body    = msg.getPlainBody() || '';

  // ── 1. Bounce detection ────────────────────────────────────────────────────
  if (_MD.BOUNCE_FROM.test(from) || _MD.BOUNCE_SUBJECT.test(subject)) {
    const bouncedTo = _extract_bounced_address(body, subject);
    return { direction: 'BOUNCE', from, subject, bounced_to: bouncedTo };
  }

  // Check for DSN headers (best-effort via raw headers)
  try {
    const rawHeaders = msg.getRawContent().split('\n').slice(0, 60).join('\n').toLowerCase();
    if (rawHeaders.includes('content-type: message/delivery-status') ||
        rawHeaders.includes('x-failed-recipients') ||
        rawHeaders.includes('final-recipient')) {
      const bouncedTo = _extract_bounced_address(body, subject);
      return { direction: 'DELIVERY_STATUS_NOTIFICATION', from, subject, bounced_to: bouncedTo };
    }
  } catch (_) {}

  // ── 2. Unsubscribe ─────────────────────────────────────────────────────────
  if (_MD.UNSUBSCRIBE_SUBJECT.test(subject) ||
      _MD.UNSUBSCRIBE_SUBJECT.test(body.slice(0, 400))) {
    return { direction: 'UNSUBSCRIBE', from, subject, bounced_to: null };
  }

  // ── 3. Out of office ──────────────────────────────────────────────────────
  if (_MD.OOO_SUBJECT.test(subject) || _MD.OOO_FROM.test(from)) {
    return { direction: 'OUT_OF_OFFICE', from, subject, bounced_to: null };
  }

  // ── 4. Generic machine / automated ───────────────────────────────────────
  if (_MD.MACHINE_FROM.test(from) || _MD.MACHINE_SUBJECT.test(subject)) {
    return { direction: 'INBOUND_MACHINE', from, subject, bounced_to: null };
  }

  // ── 5. If from an AskMiro address — it's our own ─────────────────────────
  if (_MD.OWN_DOMAINS.some(d => from.includes(d))) {
    return { direction: 'OUTBOUND_ASKMIRO', from, subject, bounced_to: null };
  }

  // ── 6. Default: human reply ───────────────────────────────────────────────
  return { direction: 'INBOUND_HUMAN', from, subject, bounced_to: null };
}


/**
 * Extract the bounced recipient address from a DSN body.
 * @param {string} body
 * @param {string} subject
 * @returns {string|null}
 */
function _extract_bounced_address(body, subject) {
  // RFC 3464 Final-Recipient field
  const finalRecipient = body.match(/final-recipient[^:]*:\s*[^;]+;\s*([^\s\n]+)/i);
  if (finalRecipient) return finalRecipient[1].trim();

  // Common pattern: "your message to X@Y could not be delivered"
  const toPattern = body.match(/(?:message to|delivery to|failed to deliver to)\s+<?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?/i);
  if (toPattern) return toPattern[1].trim();

  // Look for email address in subject
  const subjectEmail = subject.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  if (subjectEmail) return subjectEmail[1].trim();

  return null;
}


// ── Readiness Gate ────────────────────────────────────────────────────────────

/**
 * Check entity's readiness status before sending.
 * Blocks send if not READY_FOR_OUTREACH.
 *
 * @param {{ place_id: string, entity_id: number|null, email: string }} entity
 * @returns {{ allowed: boolean, reason: string, status: string|null }}
 */
function readiness_gate(entity) {
  try {
    const endpoint = CFG.RAILWAY_URL + '/api/outreach/readiness/queue';
    const params = {
      status: 'READY_FOR_OUTREACH',
      limit: 1,
    };

    // Check by entity_id if available
    if (entity.entity_id) {
      const checkUrl = CFG.RAILWAY_URL + '/api/leads/entity/' + entity.entity_id;
      const res = _apiGet(checkUrl);
      if (res && res.outreach_readiness_status) {
        const status = res.outreach_readiness_status;
        if (status === 'READY_FOR_OUTREACH') {
          return { allowed: true, reason: 'ok', status };
        }
        if (status && status.startsWith('SUPPRESSED')) {
          return { allowed: false, reason: 'suppressed:' + status, status };
        }
        if (status === 'SUPPRESSED_BAD_EMAIL' || status === 'NEEDS_EMAIL_VERIFICATION') {
          return { allowed: false, reason: 'deliverability:' + status, status };
        }
        // Not yet scored or in enrichment — allow with warning (don't block ops)
        if (!status || status === 'NEEDS_CONTACT_ENRICHMENT') {
          Logger.log('readiness_gate: unscored entity %s — allowing with caution', entity.entity_id);
          return { allowed: true, reason: 'unscored_allow', status };
        }
        return { allowed: false, reason: 'not_ready:' + status, status };
      }
    }

    // No entity_id — fall back to email-level suppression check only
    if (entity.email) {
      const suppressed = _check_email_suppressed(entity.email);
      if (suppressed) {
        return { allowed: false, reason: 'email_suppressed', status: 'SUPPRESSED_BAD_EMAIL' };
      }
    }

    return { allowed: true, reason: 'no_readiness_data', status: null };
  } catch (err) {
    Logger.log('readiness_gate error: %s — allowing send (fail-open)', err.message);
    return { allowed: true, reason: 'gate_error_fail_open', status: null };
  }
}


/**
 * Check if an email is on the suppression list via the Railway API.
 * @param {string} email
 * @returns {boolean}
 */
function _check_email_suppressed(email) {
  try {
    const url = CFG.RAILWAY_URL + '/api/email/suppression-list?email=' + encodeURIComponent(email);
    const res = _apiGet(url);
    return !!(res && res.suppressed);
  } catch (_) {
    return false;  // fail-open
  }
}


// ── Bounce Handler ────────────────────────────────────────────────────────────

/**
 * Process a detected bounce from a thread.
 * Writes event to outreach_events and flags the entity in Postgres.
 *
 * @param {GmailThread} thread
 * @param {{ direction: string, bounced_to: string|null }} classification
 * @param {string} placeId  — AskMiro place_id / entity identifier
 */
function handleBounce(thread, classification, placeId) {
  const bouncedEmail = classification.bounced_to || _extract_email_from_thread_recipients(thread);
  if (!bouncedEmail) {
    Logger.log('handleBounce: could not identify bounced address in thread %s', thread.getId());
    return;
  }

  Logger.log('handleBounce: bounce detected for %s (thread %s)', bouncedEmail, thread.getId());

  // 1. Write outreach_event to Postgres via Railway API
  _log_outreach_event({
    place_id:   placeId,
    event_type: 'BOUNCE_DETECTED',
    direction:  classification.direction,
    email:      bouncedEmail,
    thread_id:  thread.getId(),
    detail:     'Bounce DSN received — email suppressed',
  });

  // 2. Add to email_suppressions via Railway API
  try {
    const url = CFG.RAILWAY_URL + '/api/email/suppression';
    _apiPost(url, {
      email:  bouncedEmail,
      reason: 'bounce_dsn',
      source: 'gas_bounce_handler',
    });
  } catch (err) {
    Logger.log('handleBounce: suppression API call failed: %s', err.message);
  }

  // 3. Update entity outreach_readiness_status to SUPPRESSED_BAD_EMAIL
  try {
    const url = CFG.RAILWAY_URL + '/api/outreach/readiness/entity/by-email';
    _apiPost(url, {
      email:  bouncedEmail,
      status: 'SUPPRESSED_BAD_EMAIL',
      reason: 'bounce_dsn',
    });
  } catch (err) {
    Logger.log('handleBounce: readiness update failed: %s', err.message);
  }

  // 4. Archive the bounce thread (remove from Inbox)
  try {
    thread.removeLabel(GmailApp.getUserLabelByName('AskMiro Outreach'));
    thread.addLabel(_ensure_label('AskMiro Bounces'));
    thread.moveToArchive();
  } catch (_) {}
}


/**
 * Handle non-human thread classifications (machine, OOO, bounce, unsubscribe).
 * Called from scanOutreachReplies() in outreach.gs.
 *
 * @param {GmailThread} thread
 * @param {{ direction: string, bounced_to: string|null }} classification
 * @param {string} placeId
 */
function handleNonHumanThread(thread, classification, placeId) {
  const dir = classification.direction;

  if (dir === 'BOUNCE' || dir === 'DELIVERY_STATUS_NOTIFICATION') {
    handleBounce(thread, classification, placeId);
    return;
  }

  if (dir === 'UNSUBSCRIBE') {
    _log_outreach_event({
      place_id:   placeId,
      event_type: 'UNSUBSCRIBE_DETECTED',
      direction:  dir,
      thread_id:  thread.getId(),
      detail:     'Unsubscribe signal in reply',
    });
    // Trigger suppression for the entity
    try {
      _apiPost(CFG.RAILWAY_URL + '/api/outreach/readiness/entity/by-place', {
        place_id: placeId,
        status:   'SUPPRESSED_BAD_EMAIL',
        reason:   'unsubscribe_request',
      });
    } catch (_) {}
    return;
  }

  if (dir === 'OUT_OF_OFFICE') {
    // Log it but take no action — resume follow-up on schedule
    _log_outreach_event({
      place_id:   placeId,
      event_type: 'MACHINE_MAIL_DETECTED',
      direction:  dir,
      thread_id:  thread.getId(),
      detail:     'OOO auto-reply — no action, follow-up sequence continues',
    });
    return;
  }

  if (dir === 'INBOUND_MACHINE') {
    _log_outreach_event({
      place_id:   placeId,
      event_type: 'MACHINE_MAIL_DETECTED',
      direction:  dir,
      thread_id:  thread.getId(),
      detail:     'Machine reply filtered — not counted as human response',
    });
    return;
  }

  // OUTBOUND_ASKMIRO or UNKNOWN — log only
  _log_outreach_event({
    place_id:   placeId,
    event_type: 'MACHINE_MAIL_DETECTED',
    direction:  dir || 'UNKNOWN',
    thread_id:  thread.getId(),
    detail:     'Non-human direction: ' + dir,
  });
}


// ── Railway API helpers ───────────────────────────────────────────────────────

/**
 * Log an outreach event to the Railway API → outreach_events table.
 * Non-fatal — logs errors but doesn't throw.
 */
function _log_outreach_event(payload) {
  try {
    _apiPost(CFG.RAILWAY_URL + '/api/outreach/event', payload);
  } catch (err) {
    Logger.log('_log_outreach_event failed: %s', err.message);
  }
}


function _apiGet(url) {
  const res = UrlFetchApp.fetch(url, {
    method:             'GET',
    headers:            { 'Authorization': 'Bearer ' + CFG.OPS_TOKEN },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}


function _apiPost(url, payload) {
  const res = UrlFetchApp.fetch(url, {
    method:             'POST',
    headers:            { 'Authorization': 'Bearer ' + CFG.OPS_TOKEN, 'Content-Type': 'application/json' },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 400) {
    throw new Error('API error ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  }
  return JSON.parse(res.getContentText());
}


function _extract_email_from_thread_recipients(thread) {
  try {
    const msgs = thread.getMessages();
    for (const msg of msgs) {
      const to = msg.getTo() || '';
      const match = to.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
      if (match) return match[1];
    }
  } catch (_) {}
  return null;
}


function _ensure_label(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}


// ── API-triggered rescore ─────────────────────────────────────────────────────

/**
 * Trigger Railway readiness rescore for a single entity.
 * Called from the main doGet/doPost router when action='readiness.score'.
 */
function handleReadinessScore(params) {
  const entityId = params.entity_id || params.entityId || '';
  if (!entityId) return { error: 'entity_id required' };

  try {
    const res = UrlFetchApp.fetch(
      CFG.RAILWAY_URL + '/api/outreach/readiness/entity/' + entityId,
      {
        method:             'POST',
        headers:            { 'Authorization': 'Bearer ' + CFG.OPS_TOKEN },
        muteHttpExceptions: true,
      }
    );
    const body = JSON.parse(res.getContentText());
    return { ok: true, entity_id: entityId, results: body };
  } catch (err) {
    return { error: err.message };
  }
}
