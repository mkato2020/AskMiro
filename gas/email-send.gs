// ============================================================
// AskMiro GAS — email-send.gs
// Handles the 'email.send' action in your Google Apps Script.
//
// HOW TO USE:
//   1. Open your GAS project at script.google.com
//   2. Paste this code into a new file called email-send.gs
//   3. In your main doGet / router, add:
//        if (action === 'email.send') return handleEmailSend(e);
//   4. Deploy a new version of the web app
//
// ATTACHMENT NOTES:
//   Attachments are sent via the Netlify /api/send-email endpoint
//   (email.js routes to Netlify when attachments are present).
//   This GAS handler is used for attachment-free emails only,
//   but it is written to accept and forward attachments as well
//   via the doPost path if you want GAS to be the single sender.
// ============================================================

/**
 * Route entry — call this from your main doGet/doPost router.
 * Usage in router:
 *   if (action === 'email.send') return handleEmailSend(params, rawBody);
 *
 * @param {Object} params   - e.parameter (for doGet path)
 * @param {string} rawBody  - raw JSON string body (for doPost path, optional)
 */
function handleEmailSend(params, rawBody) {
  try {
    // Support both JSONP-POST (body in _body param) and real doPost
    let data = {};
    if (rawBody) {
      data = JSON.parse(rawBody);
    } else if (params._body) {
      data = JSON.parse(params._body);
    } else {
      data = params;
    }

    const to       = data.to       || '';
    const subject  = data.subject  || '(no subject)';
    const template = data.template || 'Custom';
    const replyTo  = data.replyTo  || 'info@askmiro.com';
    const fromName = data.fromName || 'AskMiro Cleaning Services';

    if (!to || !to.includes('@')) {
      return _jsonpOk({ error: 'Invalid recipient' });
    }

    // Build HTML body — use pre-built htmlBody if provided, else build from fields
    let htmlBody = data.htmlBody || '';
    if (!htmlBody && data.fields) {
      const fields = typeof data.fields === 'string' ? JSON.parse(data.fields) : data.fields;
      htmlBody = buildEmailHtml(template, fields, subject);
    }

    // Build GmailApp options
    const options = {
      name:       fromName,
      replyTo:    replyTo,
      bcc:        'info@askmiro.com',
      htmlBody:   htmlBody,
    };

    // ── ATTACHMENTS ──────────────────────────────────────────
    // attachments: [{ name, mimeType, data (base64) }]
    if (data.attachments && data.attachments.length) {
      const blobs = data.attachments.map(function(a) {
        const bytes = Utilities.base64Decode(a.data);
        return Utilities.newBlob(bytes, a.mimeType || 'application/octet-stream', a.name);
      });
      options.attachments = blobs;
    }

    // ── List-Unsubscribe headers (bulk only) ─────────────────
    if (data.listUnsubscribe) {
      options.headers = {
        'List-Unsubscribe':      data.listUnsubscribe,
        'List-Unsubscribe-Post': data.listUnsubscribePost || 'List-Unsubscribe=One-Click',
      };
    }

    GmailApp.sendEmail(to, subject, '', options);

    // Log to Sent sheet (optional — remove if you don't have this sheet)
    _logSentEmail(to, subject, template);

    return _jsonpOk({ ok: true, to: to });

  } catch (err) {
    Logger.log('handleEmailSend error: ' + err.message);
    return _jsonpOk({ error: err.message });
  }
}

// ── LOG HELPER ────────────────────────────────────────────────
function _logSentEmail(to, subject, template) {
  try {
    const ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
    const sheet = ss.getSheetByName('SentEmails');
    if (!sheet) return; // sheet doesn't exist — skip silently
    sheet.appendRow([
      new Date(),
      to,
      subject,
      template,
      Session.getActiveUser().getEmail(),
    ]);
  } catch (_) {}
}

// ── JSONP RESPONSE HELPER ─────────────────────────────────────
// Mirrors the pattern used in your main GAS router.
function _jsonpOk(payload) {
  // The callback name is passed as ?callback=xxx from the API layer.
  // In a real doGet handler you'd do:
  //   const cb = e.parameter.callback;
  //   return ContentService.createTextOutput(cb + '(' + JSON.stringify(payload) + ')')
  //     .setMimeType(ContentService.MimeType.JAVASCRIPT);
  //
  // Return the raw payload here so the router can wrap it.
  return payload;
}

// ── MINIMAL HTML BUILDER ──────────────────────────────────────
// Only used as a fallback when email.js doesn't send a pre-built htmlBody.
// In practice email.js always sends htmlBody for the attachment path.
function buildEmailHtml(template, fields, subject) {
  const name   = fields.contact_name || fields.name || 'there';
  const notes  = fields.notes        || '';
  const site   = fields.site         || '';

  return '<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1F2937;font-size:15px;line-height:1.7">'
    + '<p>Hi ' + name + ',</p>'
    + (notes ? '<p>' + notes.replace(/\n/g, '<br>') + '</p>' : '')
    + '<p>Best regards,<br><strong>Mike Kato</strong><br>Co-founder — AskMiro Cleaning Services<br>'
    + '<a href="mailto:info@askmiro.com">info@askmiro.com</a> &nbsp;|&nbsp; 020 8073 0621</p>'
    + '</body></html>';
}
