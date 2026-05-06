// Cleaners module backend for AskMiro_Ops_v4.gs
// ============================================================
// INSTALLATION:
//   1. In AskMiro_Ops_v4.gs → routeGet() switch, add:
//        case 'cleaners':         return getCleaners(params, auth);
//        case 'cleaner':          return getCleaner(params.id, auth);
//
//   2. In routePost() switch, add:
//        case 'cleaner.create':   return createCleaner(body, auth);
//        case 'cleaner.update':   return updateCleaner(body, auth);
//        case 'cleaner.archive':  return archiveCleaner(body, auth);
//        case 'cleaner.delete':   return deleteCleaner(body, auth);
//        case 'cleaner.setupSheet': return setupCleanersSheet(auth);
//
//   3. Paste all functions below into AskMiro_Ops_v4.gs
//      (anywhere after the helper functions section)
//
//   4. Run setupCleanersSheet() once from the GAS editor
//      to create the Cleaners tab with correct headers.
// ============================================================
// ── GET ALL CLEANERS ──────────────────────────────────────────
function getCleaners(params, auth) {
  var rows = getTableRows('Cleaners');
  // Optional: filter out archived if ?status=active
  if (params && params.status === 'active') {
    rows = rows.filter(function(r) { return r.status !== 'Archived'; });
  }
  // Sort by fullName by default
  rows.sort(function(a, b) {
    return (a.fullName || '').localeCompare(b.fullName || '');
  });
  return rows;
}
// ── GET SINGLE CLEANER ────────────────────────────────────────
function getCleaner(id, auth) {
  var row = getRowById('Cleaners', id);
  if (!row) throw new Error('Cleaner not found: ' + id);
  return row;
}
// ── CREATE CLEANER ────────────────────────────────────────────
function createCleaner(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.firstName && !body.fullName) throw new Error('First name is required');
  var now = new Date().toISOString();
  // Build fullName from parts if not provided
  if (!body.fullName) {
    body.fullName = ((body.firstName || '') + ' ' + (body.lastName || '')).trim();
  }
  // Generate stable human-readable ID: CLN-0001, CLN-0002 ...
  var existing = getTableRows('Cleaners');
  var maxNum = 0;
  existing.forEach(function(r) {
    var m = (r.id || '').match(/^CLN-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  var newNum = String(maxNum + 1).padStart(4, '0');
  body.id = 'CLN-' + newNum;
  body.createdAt = now;
  body.updatedAt = now;
  body.createdBy = auth.userId;
  // Default status
  if (!body.status) body.status = 'Active';
  appendRow('Cleaners', body);
  auditLog(auth.userId, 'CREATE', 'Cleaner', body.id, null, body);
  invalidateCache('Cleaners');
  return { ok: true, id: body.id, cleaner: body };
}
// ── UPDATE CLEANER ────────────────────────────────────────────
function updateCleaner(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.id) throw new Error('Cleaner id required');
  var before = getRowById('Cleaners', body.id);
  if (!before) throw new Error('Cleaner not found: ' + body.id);
  body.updatedAt  = new Date().toISOString();
  body.updatedBy  = auth.userId;
  // Sanitise time fields
  if (body.availableStartTime) body.availableStartTime = _formatTimeParam(body.availableStartTime);
  if (body.availableEndTime)   body.availableEndTime   = _formatTimeParam(body.availableEndTime);
  // Rebuild fullName if first/last changed
  if ((body.firstName || body.lastName) && !body.fullName) {
    body.fullName = ((body.firstName || before.firstName || '') + ' ' + (body.lastName || before.lastName || '')).trim();
  }
  var updated = updateRow('Cleaners', body.id, body);
  if (!updated) throw new Error('Row not found for id: ' + body.id);
  auditLog(auth.userId, 'UPDATE', 'Cleaner', body.id, before, body);
  invalidateCache('Cleaners');
  return { ok: true, id: body.id };
}
// ── ARCHIVE CLEANER ───────────────────────────────────────────
function archiveCleaner(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.id) throw new Error('Cleaner id required');
  var before = getRowById('Cleaners', body.id);
  if (!before) throw new Error('Cleaner not found: ' + body.id);
  updateRow('Cleaners', body.id, {
    status:    'Archived',
    updatedAt: new Date().toISOString(),
    updatedBy: auth.userId
  });
  auditLog(auth.userId, 'ARCHIVE', 'Cleaner', body.id, { status: before.status }, { status: 'Archived' });
  invalidateCache('Cleaners');
  return { ok: true, id: body.id };
}
// ── DELETE CLEANER (hard, admin only) ─────────────────────────
function deleteCleaner(body, auth) {
  requireRole(auth, 'Owner');
  if (!body.id) throw new Error('Cleaner id required');
  var tab  = getTab('Cleaners');
  var data = tab.getDataRange().getValues();
  var hdrs = data[0].map(function(h) { return String(h).trim(); });
  var idCol = hdrs.indexOf('id');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === body.id) {
      tab.deleteRow(i + 1);
      auditLog(auth.userId, 'DELETE', 'Cleaner', body.id, null, null);
      invalidateCache('Cleaners');
      return { ok: true, id: body.id };
    }
  }
  throw new Error('Cleaner row not found: ' + body.id);
}
// ── SETUP SHEET ───────────────────────────────────────────────
// Run this ONCE from the GAS editor: Run → setupCleanersSheet()
function setupCleanersSheet() {
  var ss  = getSheet();
  var tab = ss.getSheetByName('Cleaners');
  if (tab) {
    Logger.log('Cleaners sheet already exists.');
    return { ok: true, message: 'Already exists' };
  }
  tab = ss.insertSheet('Cleaners');
  var headers = [
    // Core Identity
    'id', 'fullName', 'firstName', 'lastName', 'phone', 'email', 'profilePhoto',
    'status', 'cleanerType',
    // Location
    'homePostcode', 'borough', 'city', 'maxTravelDistanceMiles', 'areasCovered', 'willingToTravel',
    // Capability
    'servicesOffered', 'yearsExperience',
    'commercialExperience', 'domesticExperience', 'educationSectorExperience',
    'medicalCleaningExperience', 'dealershipCleaningExperience', 'communalCleaningExperience',
    // Compliance
    'dbsStatus', 'rightToWorkChecked', 'referencesChecked', 'hasInsurance', 'complianceStatus',
    // Availability
    'availabilityType', 'availableDays', 'availableStartTime', 'availableEndTime',
    'emergencyCover', 'startDateAvailable', 'currentlyAvailable',
    // Transport
    'transportMode', 'hasDrivingLicence', 'hasOwnVehicle',
    // Commercial
    'hourlyRate', 'preferredMinimumShiftHours', 'payrollType', 'invoiceRequired',
    // Operations
    'uniformSize', 'trainingCompleted', 'notes', 'tags', 'lastWorkedDate',
    'performanceRating', 'reliabilityRating', 'source',
    // Relations (future)
    'preferredSites', 'blacklistedSites', 'currentAssignedSiteId', 'lastJobId', 'lastTimesheetId',
    // Meta
    'createdAt', 'updatedAt', 'createdBy', 'updatedBy'
  ];
  // Write headers in row 1
  tab.getRange(1, 1, 1, headers.length).setValues([headers]);
  // Style header row
  var hRange = tab.getRange(1, 1, 1, headers.length);
  hRange.setBackground('#0D1C2E');
  hRange.setFontColor('#FFFFFF');
  hRange.setFontWeight('bold');
  hRange.setFontSize(11);
  // Freeze header
  tab.setFrozenRows(1);
  // Set column widths for readability
  tab.setColumnWidth(1, 90);   // id
  tab.setColumnWidth(2, 160);  // fullName
  tab.setColumnWidth(3, 100);  // firstName
  tab.setColumnWidth(4, 100);  // lastName
  tab.setColumnWidth(5, 130);  // phone
  tab.setColumnWidth(6, 200);  // email
  Logger.log('✅ Cleaners sheet created with ' + headers.length + ' columns.');
  return { ok: true, message: 'Cleaners sheet created', columns: headers.length };
}
// ── SEED SHEET (optional, run once for testing) ───────────────
// Run from GAS editor: Run → seedCleanersSheet()
// ── Run once from GAS editor: adds Mike Kato + Romel as Employee cleaners + payroll workers ──
function addMikeAndRomel() {
  var auth = { userId: 'system', role: 'Owner' };
  var today = new Date().toISOString().split('T')[0];

  var people = [
    {
      firstName: 'Mike', lastName: 'Kato', fullName: 'Mike Kato',
      email: 'info@askmiro.com', phone: '020 8073 0621',
      status: 'Active', cleanerType: 'Employee',
      homePostcode: '', borough: '', city: 'London',
      availabilityType: 'Full-time', availableDays: 'Mon–Fri',
      availableStartTime: '06:00', availableEndTime: '22:00',
      servicesOffered: 'Office Cleaning|Commercial|Deep Clean|Management',
      commercialExperience: 'Yes', domesticExperience: 'Yes',
      dbsStatus: 'Enhanced', rightToWorkChecked: 'Yes', referencesChecked: 'Yes',
      complianceStatus: 'Ready', currentlyAvailable: 'Yes', emergencyCover: 'Yes',
      hourlyRate: '15.00', payrollType: 'PAYE', invoiceRequired: 'No',
      trainingCompleted: 'Yes', source: 'Director', notes: 'Director / Owner',
      tags: 'management|director|owner', startDate: today,
      niNumber: '', taxCode: '1257L'
    },
    {
      firstName: 'Romel', lastName: '', fullName: 'Romel',
      email: '', phone: '',
      status: 'Active', cleanerType: 'Employee',
      homePostcode: '', borough: '', city: 'London',
      availabilityType: 'Full-time', availableDays: 'Mon–Fri',
      availableStartTime: '06:00', availableEndTime: '22:00',
      servicesOffered: 'Office Cleaning|Commercial|Deep Clean',
      commercialExperience: 'Yes', domesticExperience: 'Yes',
      dbsStatus: 'Enhanced', rightToWorkChecked: 'Yes', referencesChecked: 'Yes',
      complianceStatus: 'Ready', currentlyAvailable: 'Yes', emergencyCover: 'Yes',
      hourlyRate: '13.85', payrollType: 'PAYE', invoiceRequired: 'No',
      trainingCompleted: 'Yes', source: 'Direct', notes: 'Full-time employee',
      tags: 'full-time|employee', startDate: today,
      niNumber: '', taxCode: '1257L'
    }
  ];

  var results = [];

  people.forEach(function(p) {
    // 1 — Add to Cleaners sheet
    var cleanerResult = createCleaner({
      firstName: p.firstName, lastName: p.lastName, fullName: p.fullName,
      email: p.email, phone: p.phone, status: p.status, cleanerType: p.cleanerType,
      city: p.city, homePostcode: p.homePostcode, borough: p.borough,
      availabilityType: p.availabilityType, availableDays: p.availableDays,
      availableStartTime: p.availableStartTime, availableEndTime: p.availableEndTime,
      servicesOffered: p.servicesOffered,
      commercialExperience: p.commercialExperience, domesticExperience: p.domesticExperience,
      dbsStatus: p.dbsStatus, rightToWorkChecked: p.rightToWorkChecked,
      referencesChecked: p.referencesChecked, complianceStatus: p.complianceStatus,
      currentlyAvailable: p.currentlyAvailable, emergencyCover: p.emergencyCover,
      hourlyRate: p.hourlyRate, payrollType: p.payrollType, invoiceRequired: p.invoiceRequired,
      trainingCompleted: p.trainingCompleted, source: p.source,
      notes: p.notes, tags: p.tags
    }, auth);

    // 2 — Add to Labour_Workers sheet
    var workerResult = createLabourWorker({
      name: p.fullName,
      role: p.firstName === 'Mike' ? 'Director' : 'Cleaner',
      defaultHourlyRate: p.hourlyRate,
      phone: p.phone, email: p.email,
      status: 'active',
      niNumber: p.niNumber, taxCode: p.taxCode,
      startDate: p.startDate,
      paymentMethod: 'BACS', payrollType: p.payrollType
    }, auth);

    results.push({ name: p.fullName, cleanerId: cleanerResult.id, workerId: workerResult.worker_id });
  });

  Logger.log('✅ Added: ' + JSON.stringify(results));
  return { ok: true, added: results };
}

// seedCleanersSheet() removed — was accidentally populating live DB with fake data.
// Run removeSeedCleaners() once from GAS editor to clean up any rows it added.

function removeSeedCleaners() {
  var SEED_EMAILS = [
    'maria.santos@email.com',
    'james.okafor@email.com',
    'ana.lima@email.com',
    'tomasz.k@email.com',
    'blessing.osei@email.com',
    'iryna.p@email.com',
    'david.mensah@email.com',
    'fatima.alr@email.com',
    'patrick.ob@email.com',
    'grace.nkomo@email.com',
    'aleksander.w@email.com',
    'sandra.oduya@email.com'
  ];
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  var tab   = ss.getSheetByName('Cleaners');
  if (!tab) { Logger.log('No Cleaners sheet found.'); return { removed: 0 }; }
  var data  = tab.getDataRange().getValues();
  var hdrs  = data[0];
  var emailCol = hdrs.indexOf('email');
  if (emailCol < 0) { Logger.log('No email column found.'); return { removed: 0 }; }
  var removed = 0;
  // Delete bottom-up so row indices stay valid
  for (var i = data.length - 1; i >= 1; i--) {
    if (SEED_EMAILS.indexOf(data[i][emailCol]) !== -1) {
      tab.deleteRow(i + 1);
      removed++;
    }
  }
  invalidateCache('Cleaners');
  Logger.log('✅ Removed ' + removed + ' seed cleaners.');
  return { ok: true, removed: removed };
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC CLEANER APPLICATION — no auth token required
// Called by join-our-team.html via JSONP GET
//
// INSTALLATION: In AskMiro_Ops_v4.gs → doGet(), before the auth
// check, add this block (same pattern as webhook.lead):
//
//   var action = e.parameter && e.parameter.action;
//   if (action === 'cleaner.apply') return applyAsCleaner(e.parameter, cb);
//
// That single line goes at the TOP of doGet(), before handleRequest().
// ═══════════════════════════════════════════════════════════════
function applyAsCleaner(params, cb) {
  try {
    var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
    // ── Ensure sheet exists ───────────────────────────────────
    var tab = ss.getSheetByName('Cleaners');
    if (!tab) {
      setupCleanersSheet({ userId: 'system', role: 'Admin' });
      tab = ss.getSheetByName('Cleaners');
    }
    // ── Build cleaner object (maps form fields → sheet cols) ──
    var now  = new Date().toISOString();
    var auth = { userId: 'public-form', role: 'Public' };
    // Auto-generate ID
    var existing = getTableRows('Cleaners');
    var nextNum  = existing.length + 1;
    var newId    = 'CLN-' + String(nextNum).padStart(4, '0');
    // Safety: ensure unique even if sheet has gaps
    var usedIds  = existing.map(function(r){ return r.id; });
    while (usedIds.indexOf(newId) !== -1) {
      nextNum++;
      newId = 'CLN-' + String(nextNum).padStart(4, '0');
    }
    var cleaner = {
      id:                          newId,
      firstName:                   (params.firstName   || '').trim(),
      lastName:                    (params.lastName    || '').trim(),
      fullName:                    ((params.firstName || '') + ' ' + (params.lastName || '')).trim(),
      phone:                       (params.phone       || '').trim(),
      email:                       (params.email       || '').trim(),
      status:                      'Trial',
      cleanerType:                 params.cleanerType  || 'Subcontractor',
      homePostcode:                (params.homePostcode|| '').toUpperCase().trim(),
      borough:                     params.borough      || '',
      city:                        'London',
      maxTravelDistanceMiles:      params.maxTravelDistanceMiles || '5',
      areasCovered:                params.borough      || '',
      willingToTravel:             params.maxTravelDistanceMiles && parseInt(params.maxTravelDistanceMiles) > 0 ? 'Yes' : 'No',
      servicesOffered:             params.servicesOffered || '',
      commercialExperience:        params.commercialExperience        || 'No',
      domesticExperience:          params.domesticExperience          || 'No',
      medicalCleaningExperience:   params.medicalCleaningExperience   || 'No',
      educationSectorExperience:   params.educationSectorExperience   || 'No',
      dealershipCleaningExperience:params.dealershipCleaningExperience|| 'No',
      communalCleaningExperience:  params.communalCleaningExperience  || 'No',
      yearsExperience:             params.yearsExperience             || '0',
      hourlyRate:                  params.hourlyRate                  || '',
      availabilityType:            params.availabilityType            || '',
      availableDays:               params.availableDays               || '',
      availableStartTime:          _formatTimeParam(params.availableStartTime),
      availableEndTime:            _formatTimeParam(params.availableEndTime),
      startDateAvailable:          params.startDateAvailable          || 'Immediately',
      emergencyCover:              params.emergencyCover              || 'No',
      currentlyAvailable:          'Yes',
      transportMode:               params.transportMode               || '',
      hasDrivingLicence:           params.hasDrivingLicence           || 'No',
      hasOwnVehicle:               params.hasOwnVehicle               || 'No',
      dbsStatus:                   params.dbsStatus                   || 'None',
      rightToWorkChecked:          params.rightToWorkChecked          || 'No',
      referencesChecked:           'No',
      hasInsurance:                'No',
      complianceStatus:            'Pending',
      payrollType:                 params.payrollType                 || 'Self-employed',
      invoiceRequired:             params.invoiceRequired             || 'No',
      uniformSize:                 '',
      trainingCompleted:           'No',
      performanceRating:           '',
      reliabilityRating:           '',
      notes:                       params.notes                       || '',
      tags:                        'new-applicant',
      source:                      'Web Application Form',
      lastWorkedDate:              '',
      createdAt:                   now,
      updatedAt:                   now
    };
    // ── Write to sheet ────────────────────────────────────────
    appendRow('Cleaners', cleaner);
    invalidateCache('Cleaners');
    // ── Relay to AskMiro OS Postgres ─────────────────────────
    try {
      var OS_ENDPOINT = 'https://askmiro-api-production.up.railway.app/api/public/join-team';
      var relayPayload = JSON.stringify({
        fullName:           cleaner.fullName,
        email:              cleaner.email,
        phone:              cleaner.phone,
        homePostcode:       cleaner.homePostcode,
        borough:            cleaner.borough,
        cleanerType:        cleaner.cleanerType,
        servicesOffered:    cleaner.servicesOffered,
        availabilityType:   cleaner.availabilityType,
        currentlyAvailable: 'Yes',
        complianceStatus:   'Pending',
        dbsStatus:          cleaner.dbsStatus,
        transportMode:      cleaner.transportMode,
        hourlyRate:         cleaner.hourlyRate || 12.50,
        emergencyCover:     cleaner.emergencyCover,
        notes:              'Applied via Web Form. GAS ID: ' + newId
      });
      var relayOptions = {
        method: 'post',
        contentType: 'application/json',
        payload: relayPayload,
        muteHttpExceptions: true
      };
      var relayRes = UrlFetchApp.fetch(OS_ENDPOINT, relayOptions);
      var relayData = JSON.parse(relayRes.getContentText());
      Logger.log('✅ OS relay: ' + JSON.stringify(relayData));
    } catch(relayErr) {
      Logger.log('⚠️ OS relay failed (non-critical, Sheet write succeeded): ' + relayErr);
    }
    // ── Log it ───────────────────────────────────────────────
    auditLog('public-form', 'CREATE', 'Cleaner', newId, null, cleaner);
    // ── Send confirmation to applicant (if they gave email) ─────
    if (cleaner.email) {
      try {
        GmailApp.sendEmail(cleaner.email, 'Application received — AskMiro Cleaning Services', '', {
          name:     'AskMiro Cleaning Services',
          replyTo:  'info@askmiro.com',
          htmlBody: buildCleanerConfirmationEmail(cleaner),
        });
      } catch(mailErr) {
        Logger.log('⚠️ Confirmation email to applicant failed: ' + mailErr);
      }
    }
    // ── Send notification email to AskMiro ───────────────────
    try {
      MailApp.sendEmail({
        to:      'info@askmiro.com',
        subject: '🧹 New Cleaner Application — ' + cleaner.fullName + ' (' + cleaner.homePostcode + ')',
        htmlBody:
          '<p><strong>New cleaner application received via the website.</strong></p>' +
          '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">' +
          '<tr><td style="padding:6px 12px;color:#666">Name</td><td style="padding:6px 12px"><strong>' + cleaner.fullName + '</strong></td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">Phone</td><td style="padding:6px 12px">' + cleaner.phone + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">' + (cleaner.email || '—') + '</td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">Postcode</td><td style="padding:6px 12px">' + cleaner.homePostcode + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Services</td><td style="padding:6px 12px">' + cleaner.servicesOffered.replace(/\|/g, ', ') + '</td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">Availability</td><td style="padding:6px 12px">' + cleaner.availabilityType + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Transport</td><td style="padding:6px 12px">' + cleaner.transportMode + '</td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">DBS</td><td style="padding:6px 12px">' + cleaner.dbsStatus + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Sheet ID</td><td style="padding:6px 12px;color:#0A9688"><strong>' + newId + '</strong></td></tr>' +
          '</table>' +
          '<p style="margin-top:16px;color:#666;font-size:13px">Added to Cleaners tab in AskMiro Ops as status: <strong>Trial</strong></p>'
      });
    } catch(mailErr) {
      Logger.log('⚠️ Notification email failed: ' + mailErr);
    }
    var result = { ok: true, id: newId, message: 'Application received' };
    return cb
      ? ContentService.createTextOutput(cb + '(' + JSON.stringify(result) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log('❌ applyAsCleaner error: ' + err);
    var errResult = { ok: false, error: err.toString() };
    return cb
      ? ContentService.createTextOutput(cb + '(' + JSON.stringify(errResult) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(JSON.stringify(errResult)).setMimeType(ContentService.MimeType.JSON);
  }
}
// ═══════════════════════════════════════════════════════════════
// BACKFILL — Pull all existing Sheet cleaners into Postgres
// Run once from GAS editor: backfillCleanersToPostgres()
// ═══════════════════════════════════════════════════════════════
function backfillCleanersToPostgres() {
  var OS_ENDPOINT = 'https://askmiro-api-production.up.railway.app/api/public/join-team';
  var rows = getTableRows('Cleaners');
  var results = { ok: 0, duplicate: 0, error: 0 };

  Logger.log('Starting backfill of ' + rows.length + ' cleaners to Postgres...');

  rows.forEach(function(cleaner) {
    if (!cleaner.fullName && !cleaner.firstName) return; // skip empty rows
    try {
      var payload = JSON.stringify({
        fullName:           cleaner.fullName || ((cleaner.firstName || '') + ' ' + (cleaner.lastName || '')).trim(),
        email:              cleaner.email || '',
        phone:              cleaner.phone || '',
        homePostcode:       cleaner.homePostcode || '',
        borough:            cleaner.borough || '',
        cleanerType:        cleaner.cleanerType || 'Subcontractor',
        servicesOffered:    cleaner.servicesOffered || '',
        availabilityType:   cleaner.availabilityType || 'Full-time',
        currentlyAvailable: cleaner.currentlyAvailable || 'Yes',
        complianceStatus:   cleaner.complianceStatus || 'Pending',
        dbsStatus:          cleaner.dbsStatus || 'None',
        transportMode:      cleaner.transportMode || '',
        hourlyRate:         cleaner.hourlyRate || 12.50,
        emergencyCover:     cleaner.emergencyCover || 'No',
        notes:              'Backfilled from GAS Sheet. GAS ID: ' + (cleaner.id || 'unknown') + '. Original status: ' + (cleaner.status || 'unknown')
      });
      var options = {
        method: 'post',
        contentType: 'application/json',
        payload: payload,
        muteHttpExceptions: true
      };
      var res = UrlFetchApp.fetch(OS_ENDPOINT, options);
      var data = JSON.parse(res.getContentText());
      if (data.status === 'duplicate') {
        results.duplicate++;
        Logger.log('⏭ Duplicate: ' + (cleaner.fullName || cleaner.email));
      } else if (data.status === 'ok') {
        results.ok++;
        Logger.log('✅ Synced: ' + (cleaner.fullName || cleaner.email) + ' → Postgres ID: ' + data.cleaner_id);
      } else {
        results.error++;
        Logger.log('❌ Error for ' + (cleaner.fullName || cleaner.email) + ': ' + JSON.stringify(data));
      }
      Utilities.sleep(200); // avoid hammering the API
    } catch(err) {
      results.error++;
      Logger.log('❌ Exception for ' + (cleaner.fullName || cleaner.email) + ': ' + err);
    }
  });

  Logger.log('Backfill complete: ' + JSON.stringify(results));
  return results;
}

// ═══════════════════════════════════════════════════════════════
// BRANDED EMAIL — Cleaner Application Confirmation
// Called inside applyAsCleaner() when applicant has provided email
// ═══════════════════════════════════════════════════════════════
function buildCleanerConfirmationEmail(cleaner) {
  var teal = '#0D9488', navy = '#0C1929', charcoal = '#1F2937', slate = '#475569';
  var muted = '#94A3B8', border = '#E2E8F0', offWhite = '#F8FAFC';
  var phone = '020 8073 0621', emailAddr = 'info@askmiro.com', web = 'www.askmiro.com';
  var company = 'AskMiro Cleaning Services';
  var name = cleaner.firstName || 'there';
  var logo = '<table cellpadding="0" cellspacing="0"><tr><td style="background:#0D9488;border-radius:9px;width:40px;height:40px;text-align:center;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="32" height="32" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td></tr></table>';
  function p(t)   { return '<p style="font-family:Arial,sans-serif;font-size:14px;color:' + slate + ';line-height:1.85;margin:0 0 16px">' + t + '</p>'; }
  function h(t)   { return '<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:' + charcoal + ';margin:0 0 4px;letter-spacing:-0.5px">' + t + '</h1>'; }
  function sub(t) { return '<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + teal + ';letter-spacing:1.2px;text-transform:uppercase;margin:0 0 22px">' + t + '</p>'; }
  function gr(n)  { return '<p style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:' + charcoal + ';margin:0 0 18px">Dear ' + n + ',</p>'; }
  function sm(t)  { return '<p style="font-family:Arial,sans-serif;font-size:11px;color:' + muted + ';line-height:1.7;margin:0">' + t + '</p>'; }
  function div()  { return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="height:1px;background:' + border + '">&nbsp;</td></tr></table>'; }
  function cta(label, href) { return '<table cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:' + teal + ';border-radius:8px"><a href="' + href + '" style="display:block;padding:13px 26px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none">' + label + '</a></td></tr></table>'; }
  function infoBox(rows) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="background:' + offWhite + ';border:1px solid ' + border + ';border-radius:10px;overflow:hidden;margin-bottom:20px">'
      + rows.map(function(r, i) {
          return '<tr' + (i % 2 === 1 ? ' style="background:#fff"' : '') + '>'
            + '<td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:12px;color:' + muted + ';font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:40%">' + r[0] + '</td>'
            + '<td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:' + charcoal + ';font-weight:600">' + r[1] + '</td>'
            + '</tr>';
        }).join('')
      + '</table>';
  }
  function sig() {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px"><tr><td style="border-top:2px solid ' + teal + ';padding-top:18px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:top">' + logo + '</td><td style="vertical-align:top"><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:' + charcoal + '">AskMiro Team</div><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:' + teal + ';letter-spacing:1px;text-transform:uppercase;margin:3px 0 8px">AskMiro Cleaning Services</div><div style="font-family:Arial,sans-serif;font-size:12px;color:' + slate + '">&#9742; <a href="tel:02080730621" style="color:' + slate + ';text-decoration:none">' + phone + '</a> &nbsp;|&nbsp; &#9993; <a href="mailto:' + emailAddr + '" style="color:' + slate + ';text-decoration:none">' + emailAddr + '</a> &nbsp;|&nbsp; <a href="https://' + web + '" style="color:' + teal + ';text-decoration:none;font-weight:600">' + web + '</a></div></td></tr></table></td></tr></table>';
  }
  function wrap(bodyContent) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#E8EDF4;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#E8EDF4;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + navy + ';border-radius:12px 0 0 0;padding:24px 28px;width:52%;vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">' + logo + '</td><td style="vertical-align:middle"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;color:#fff">AskMiro</div><div style="font-family:Arial,sans-serif;font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px">Cleaning Services</div></td></tr></table></td><td style="background:' + teal + ';border-radius:0 12px 0 0;padding:24px 28px;vertical-align:bottom;text-align:right"><div style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.85)">Application Received</div></td></tr><tr><td colspan="2" style="background:' + teal + ';height:3px;font-size:3px;line-height:3px">&nbsp;</td></tr></table></td></tr><tr><td style="background:#fff;padding:36px 36px 28px;border-left:1px solid ' + border + ';border-right:1px solid ' + border + '">' + bodyContent + sig() + '</td></tr><tr><td style="background:' + navy + ';border-radius:0 0 12px 12px;padding:18px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,0.6)">' + company + '</div><div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px">London &amp; UK</div></td><td align="right"><a href="https://' + web + '" style="font-family:Arial,sans-serif;font-size:12px;color:' + teal + ';text-decoration:none;font-weight:700">' + web + '</a></td></tr></table></td></tr></table></td></tr></table></body></html>';
  }
  var services = (cleaner.servicesOffered || '').replace(/\|/g, ', ');
  var infoRows = [
    ['Name',         cleaner.fullName    || '—'],
    ['Phone',        cleaner.phone       || '—'],
    ['Postcode',     cleaner.homePostcode|| '—'],
    ['Services',     services            || '—'],
    ['Availability', cleaner.availabilityType || '—'],
    ['Reference',    cleaner.id          || '—'],
  ];
  return wrap(
    h('Application received — we\'ll be in touch.') +
    sub('AskMiro Cleaning Services · London') +
    gr(name) +
    p('Thank you for applying to join the AskMiro cleaning team. We\'ve received your application and a member of our team will call you within <strong>48 hours</strong> to discuss opportunities in your area.') +
    p('Here\'s a summary of what you submitted:') +
    infoBox(infoRows) +
    p('In the meantime, if you have any questions please don\'t hesitate to give us a call or send us an email.') +
    cta('&#9742; Call us: 020 8073 0621', 'tel:02080730621') +
    div() +
    sm('This is an automated confirmation. Please do not reply directly to this email — contact us at ' + emailAddr + ' or call ' + phone + '.')
  );
}
// ═══════════════════════════════════════════════════════════════
// BRANDED EMAIL — Auto-reply for incoming inbox emails
// 
// INSTALLATION: In AskMiro_Ops_v4.gs, find where you process
// incoming Gmail messages (the inbox polling function).
// After logging/storing the email, call:
//
//   sendInboxAutoReply(senderEmail, senderName, originalSubject);
//
// Then add this function below. Also add this line to routePost():
//   case 'inbox.autoreply': return triggerAutoReply(body, auth);
// ═══════════════════════════════════════════════════════════════
function buildInboxAutoReplyEmail(senderName, originalSubject) {
  var teal = '#0D9488', navy = '#0C1929', charcoal = '#1F2937', slate = '#475569';
  var muted = '#94A3B8', border = '#E2E8F0', offWhite = '#F8FAFC';
  var phone = '020 8073 0621', emailAddr = 'info@askmiro.com', web = 'www.askmiro.com';
  var company = 'AskMiro Cleaning Services';
  var name = senderName || 'there';
  var logo = '<table cellpadding="0" cellspacing="0"><tr><td style="background:#0D9488;border-radius:9px;width:40px;height:40px;text-align:center;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="32" height="32" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td></tr></table>';
  function p(t)   { return '<p style="font-family:Arial,sans-serif;font-size:14px;color:' + slate + ';line-height:1.85;margin:0 0 16px">' + t + '</p>'; }
  function h(t)   { return '<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:' + charcoal + ';margin:0 0 4px;letter-spacing:-0.5px">' + t + '</h1>'; }
  function sub(t) { return '<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + teal + ';letter-spacing:1.2px;text-transform:uppercase;margin:0 0 22px">' + t + '</p>'; }
  function gr(n)  { return '<p style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:' + charcoal + ';margin:0 0 18px">Dear ' + n + ',</p>'; }
  function sm(t)  { return '<p style="font-family:Arial,sans-serif;font-size:11px;color:' + muted + ';line-height:1.7;margin:0">' + t + '</p>'; }
  function div()  { return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="height:1px;background:' + border + '">&nbsp;</td></tr></table>'; }
  function cta(label, href) { return '<table cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:' + teal + ';border-radius:8px"><a href="' + href + '" style="display:block;padding:13px 26px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none">' + label + '</a></td><td width="10">&nbsp;</td><td style="border:2px solid ' + border + ';border-radius:8px"><a href="tel:02080730621" style="display:block;padding:11px 18px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:' + slate + ';text-decoration:none">&#9742; ' + phone + '</a></td></tr></table>'; }
  function checklist(items) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="background:' + offWhite + ';border:1px solid ' + border + ';border-radius:10px;padding:14px 16px;margin-bottom:20px"><tbody>'
      + items.map(function(item) { return '<tr><td style="vertical-align:top;padding:0 10px 7px 0;width:22px"><div style="width:20px;height:20px;background:' + teal + ';border-radius:50%;text-align:center;line-height:21px;font-size:11px;color:white;font-weight:700">&#10003;</div></td><td style="vertical-align:top;padding-bottom:7px;font-family:Arial,sans-serif;font-size:13px;color:' + slate + ';line-height:1.6">' + item + '</td></tr>'; }).join('')
      + '</tbody></table>';
  }
  function sig() {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px"><tr><td style="border-top:2px solid ' + teal + ';padding-top:18px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:top">' + logo + '</td><td style="vertical-align:top"><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:' + charcoal + '">AskMiro Team</div><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:' + teal + ';letter-spacing:1px;text-transform:uppercase;margin:3px 0 8px">AskMiro Cleaning Services</div><div style="font-family:Arial,sans-serif;font-size:12px;color:' + slate + '">&#9742; <a href="tel:02080730621" style="color:' + slate + ';text-decoration:none">' + phone + '</a> &nbsp;|&nbsp; &#9993; <a href="mailto:' + emailAddr + '" style="color:' + slate + ';text-decoration:none">' + emailAddr + '</a> &nbsp;|&nbsp; <a href="https://' + web + '" style="color:' + teal + ';text-decoration:none;font-weight:600">' + web + '</a></div></td></tr></table></td></tr></table>';
  }
  function wrap(bodyContent) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#E8EDF4;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#E8EDF4;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + navy + ';border-radius:12px 0 0 0;padding:24px 28px;width:52%;vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">' + logo + '</td><td style="vertical-align:middle"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;color:#fff">AskMiro</div><div style="font-family:Arial,sans-serif;font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px">Cleaning Services</div></td></tr></table></td><td style="background:' + teal + ';border-radius:0 12px 0 0;padding:24px 28px;vertical-align:bottom;text-align:right"><div style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.85)">We\'ll be in touch</div></td></tr><tr><td colspan="2" style="background:' + teal + ';height:3px;font-size:3px;line-height:3px">&nbsp;</td></tr></table></td></tr><tr><td style="background:#fff;padding:36px 36px 28px;border-left:1px solid ' + border + ';border-right:1px solid ' + border + '">' + bodyContent + sig() + '</td></tr><tr><td style="background:' + navy + ';border-radius:0 0 12px 12px;padding:18px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,0.6)">' + company + '</div><div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px">London &amp; UK</div></td><td align="right"><a href="https://' + web + '" style="font-family:Arial,sans-serif;font-size:12px;color:' + teal + ';text-decoration:none;font-weight:700">' + web + '</a></td></tr></table></td></tr></table></td></tr></table></body></html>';
  }
  var subjectLine = originalSubject ? 'Re: ' + originalSubject : 'your enquiry';
  return wrap(
    h('Thanks for getting in touch.') +
    sub('AskMiro Cleaning Services · London') +
    gr(name) +
    p('Thank you for your message — we\'ve received it and a member of our team will get back to you within <strong>4 business hours</strong>. If your enquiry is urgent, please call us directly on <strong>020 8073 0621</strong>.') +
    p('Here\'s a quick overview of what we offer while you wait:') +
    checklist([
      '<strong>Managed commercial cleaning</strong> — offices, residential blocks, healthcare, automotive & more',
      '<strong>Consistent, site-trained teams</strong> — same people every visit, not rotating agency staff',
      '<strong>Free site visit & fixed monthly quote</strong> — no hidden costs, turnaround within 24 hours',
      '<strong>COSHH-compliant & fully insured</strong> — £10M public liability cover, audit-ready documentation',
    ]) +
    cta('&#128197; Request a Free Quote', 'https://www.askmiro.com/get-quote.html') +
    div() +
    sm('This is an automated acknowledgement of your message. You do not need to resend — we have it. Contact us at ' + emailAddr + ' or call ' + phone + '.')
  );
}
// ── Trigger auto-reply (called after a new inbox email is stored)
// Usage: sendInboxAutoReply('client@email.com', 'Sarah', 'Cleaning enquiry')
function sendInboxAutoReply(toEmail, senderName, originalSubject) {
  if (!toEmail || toEmail.indexOf('@') === -1) return;
  // Don't auto-reply to yourself or noreply addresses
  var skip = ['noreply', 'no-reply', 'donotreply', 'askmiro.com', 'googlemail', 'mailer-daemon'];
  for (var i = 0; i < skip.length; i++) {
    if (toEmail.toLowerCase().indexOf(skip[i]) !== -1) return;
  }
  try {
    GmailApp.sendEmail(toEmail, 'Re: ' + (originalSubject || 'Your enquiry — AskMiro'), '', {
      name:     'AskMiro Cleaning Services',
      replyTo:  'info@askmiro.com',
      htmlBody: buildInboxAutoReplyEmail(senderName, originalSubject),
    });
    Logger.log('✅ Auto-reply sent to ' + toEmail);
  } catch(e) {
    Logger.log('⚠️ Auto-reply failed for ' + toEmail + ': ' + e);
  }
}
// ============================================================
// FINANCE MODULE v2.0 — Full Founder Finance Operating System
// Sheets: Finance_Transactions | Finance_Invoices |
//         Finance_Expenses | Finance_Snapshots |
//         Finance_Settings | Finance_Categories
// ============================================================

// ── READ ENDPOINTS ────────────────────────────────────────────

function getFinanceDashboard(params, auth) {
  requireRole(auth, 'Finance');
  var now       = new Date();
  var thisMonth = Utilities.formatDate(now, 'UTC', 'yyyy-MM');
  var lastMonth = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth()-1, 1), 'UTC', 'yyyy-MM');
  var today     = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd');
  var settings  = _getFinanceSettings();

  var invs = getTableRows('Finance_Invoices');
  var exps = getTableRows('Finance_Expenses');
  var txns = getTableRows('Finance_Transactions');

  var thisInvs  = invs.filter(function(i) { return (i.invoiceDate||'').slice(0,7) === thisMonth && i.status !== 'Void'; });
  var lastInvs  = invs.filter(function(i) { return (i.invoiceDate||'').slice(0,7) === lastMonth && i.status !== 'Void'; });
  var thisExps  = exps.filter(function(e) { return (e.expenseDate||'').slice(0,7) === thisMonth; });
  var lastExps  = exps.filter(function(e) { return (e.expenseDate||'').slice(0,7) === lastMonth; });

  var invoicedRev   = thisInvs.reduce(function(s,i) { return s + parseFloat(i.totalAmount||0); }, 0);
  var lastRev       = lastInvs.reduce(function(s,i) { return s + parseFloat(i.totalAmount||0); }, 0);
  var cashIn        = txns.filter(function(t) { return t.type === 'payment' && (t.transactionDate||'').slice(0,7) === thisMonth; })
                         .reduce(function(s,t) { return s + parseFloat(t.amountGross||0); }, 0);
  var totalExpenses = thisExps.reduce(function(s,e) { return s + parseFloat(e.amountGross||0); }, 0);
  var lastExpenses  = lastExps.reduce(function(s,e) { return s + parseFloat(e.amountGross||0); }, 0);
  var grossProfit   = invoicedRev - totalExpenses;
  var grossMargin   = invoicedRev > 0 ? r2(grossProfit / invoicedRev * 100) : 0;

  var outstanding = invs.filter(function(i) { return i.status === 'Issued' || i.status === 'Sent'; });
  var overdue     = invs.filter(function(i) { return (i.status === 'Issued' || i.status === 'Sent' || i.status === 'Overdue') && i.dueDate && i.dueDate < today; });
  var outAmt      = outstanding.reduce(function(s,i) { return s + parseFloat(i.balanceDue||i.totalAmount||0); }, 0);
  var overAmt     = overdue.reduce(function(s,i) { return s + parseFloat(i.balanceDue||i.totalAmount||0); }, 0);

  var healthy = parseFloat(settings.targetMarginHealthy || 35);
  var watch   = parseFloat(settings.targetMarginWatch   || 20);
  var alerts  = [];
  if (overdue.length > 0) alerts.push({ level:'r', msg: overdue.length + ' invoice(s) overdue — £' + r2(overAmt) });
  if (invoicedRev > 0 && grossMargin < watch)   alerts.push({ level:'r', msg: 'Margin ' + grossMargin + '% — below risk threshold (' + watch + '%)' });
  else if (invoicedRev > 0 && grossMargin < healthy) alerts.push({ level:'a', msg: 'Margin ' + grossMargin + '% — watch zone (target ' + healthy + '%)' });
  if (totalExpenses === 0 && invoicedRev > 0)   alerts.push({ level:'a', msg: 'No expenses logged — margin may be overstated' });

  var recentInvs  = invs.sort(function(a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); }).slice(0,5);
  var recentExps  = exps.sort(function(a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); }).slice(0,5);

  return {
    thisMonth: thisMonth,
    invoicedRevenue: r2(invoicedRev),
    revenueMoM: lastRev > 0 ? r2((invoicedRev - lastRev) / lastRev * 100) : null,
    cashIn: r2(cashIn),
    totalExpenses: r2(totalExpenses),
    expensesMoM: lastExpenses > 0 ? r2((totalExpenses - lastExpenses) / lastExpenses * 100) : null,
    grossProfit: r2(grossProfit),
    grossMargin: grossMargin,
    outstandingCount: outstanding.length,
    outstandingAmount: r2(outAmt),
    overdueCount: overdue.length,
    overdueAmount: r2(overAmt),
    alerts: alerts,
    recentInvoices: recentInvs,
    recentExpenses: recentExps,
    settings: settings
  };
}

function getFinanceTransactions(params, auth) {
  requireRole(auth, 'Finance');
  var rows = getTableRows('Finance_Transactions');
  if (params.month)    rows = rows.filter(function(r) { return (r.transactionDate||'').slice(0,7) === params.month; });
  if (params.type)     rows = rows.filter(function(r) { return r.type  === params.type; });
  if (params.status)   rows = rows.filter(function(r) { return r.status === params.status; });
  if (params.siteId)   rows = rows.filter(function(r) { return r.linkedSiteId === params.siteId; });
  if (params.category) rows = rows.filter(function(r) { return r.category === params.category; });
  return rows.sort(function(a,b) { return (b.transactionDate||'').localeCompare(a.transactionDate||''); });
}

function getFinanceInvoices(params, auth) {
  requireRole(auth, 'Finance');
  var today = new Date().toISOString().slice(0,10);
  var rows  = getTableRows('Finance_Invoices').map(function(i) {
    if ((i.status === 'Issued' || i.status === 'Sent') && i.dueDate && i.dueDate < today) i.status = 'Overdue';
    return i;
  });
  if (params.status)     rows = rows.filter(function(r) { return r.status     === params.status; });
  if (params.contractId) rows = rows.filter(function(r) { return r.contractId === params.contractId; });
  if (params.siteId)     rows = rows.filter(function(r) { return r.siteId     === params.siteId; });
  if (params.month)      rows = rows.filter(function(r) { return (r.invoiceDate||'').slice(0,7) === params.month; });
  return rows.sort(function(a,b) { return (b.invoiceDate||'').localeCompare(a.invoiceDate||''); });
}

function getFinanceExpenses(params, auth) {
  requireRole(auth, 'Finance');
  var rows = getTableRows('Finance_Expenses');
  if (params.month)      rows = rows.filter(function(r) { return (r.expenseDate||'').slice(0,7) === params.month; });
  if (params.category)   rows = rows.filter(function(r) { return r.category       === params.category; });
  if (params.siteId)     rows = rows.filter(function(r) { return r.linkedSiteId   === params.siteId; });
  if (params.contractId) rows = rows.filter(function(r) { return r.linkedContractId === params.contractId; });
  return rows.sort(function(a,b) { return (b.expenseDate||'').localeCompare(a.expenseDate||''); });
}

function getFinanceSnapshots(params, auth) {
  requireRole(auth, 'Finance');
  var rows = getTableRows('Finance_Snapshots');
  if (params.month)      rows = rows.filter(function(r) { return r.snapshotMonth  === params.month; });
  if (params.contractId) rows = rows.filter(function(r) { return r.contractId     === params.contractId; });
  if (params.siteId)     rows = rows.filter(function(r) { return r.siteId         === params.siteId; });
  return rows.sort(function(a,b) { return (b.snapshotMonth||'').localeCompare(a.snapshotMonth||''); });
}

function getFinanceSettings(params, auth) {
  requireRole(auth, 'Finance');
  return _getFinanceSettings();
}

function getFinanceCategories(params, auth) {
  requireRole(auth, 'Finance');
  return getTableRows('Finance_Categories');
}

function _getFinanceSettings() {
  var rows = getTableRows('Finance_Settings');
  var s = {};
  rows.forEach(function(r) { if (r.key) s[r.key] = r.value; });
  return Object.assign({ vatRate:'20', targetMarginHealthy:'35', targetMarginWatch:'20',
    invoicePrefix:'INV', defaultPaymentTerms:'30', currency:'GBP' }, s);
}

// ── WRITE ENDPOINTS ───────────────────────────────────────────

function createFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['transactionDate','type','amountGross','category'], 'FinanceTransaction');
  var id  = genId('FTX');
  var now = new Date().toISOString();
  var gross = parseFloat(body.amountGross);
  var net   = parseFloat(body.amountNet  || r2(gross / 1.2));
  var vat   = parseFloat(body.amountVat  || r2(gross - net));
  var row   = Object.assign({ id:id, status:body.status||'paid', amountNet:r2(net),
    amountVat:r2(vat), createdBy:auth.userId, createdAt:now, updatedAt:now }, body);
  appendRow('Finance_Transactions', row);
  auditLog(auth.userId, 'CREATE', 'FinanceTransaction', id, null, row);
  return { ok:true, id:id };
}

function updateFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'FinanceTransactionUpdate');
  body.updatedAt = new Date().toISOString();
  updateRow('Finance_Transactions', body.id, body);
  auditLog(auth.userId, 'UPDATE', 'FinanceTransaction', body.id, null, body);
  return { ok:true };
}

function voidFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'FinanceTransactionVoid');
  updateRow('Finance_Transactions', body.id, { status:'void', updatedAt:new Date().toISOString() });
  auditLog(auth.userId, 'VOID', 'FinanceTransaction', body.id, null, body);
  return { ok:true };
}

function createFinanceInvoice(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['customerName','invoiceDate','dueDate','totalAmount'], 'FinanceInvoice');
  var settings  = _getFinanceSettings();
  var id        = genId('INV2');
  var invoiceNo = _nextInvoiceNumber(settings.invoicePrefix || 'INV');
  var gross     = parseFloat(body.totalAmount);
  var vatRate   = parseFloat(settings.vatRate || 20) / 100;
  var net       = parseFloat(body.subtotal   || r2(gross / (1 + vatRate)));
  var vat       = parseFloat(body.vatAmount  || r2(gross - net));
  var now       = new Date().toISOString();
  var row = Object.assign({
    id:id, invoiceNumber:invoiceNo, status:'Draft',
    subtotal:r2(net), vatAmount:r2(vat), balanceDue:r2(gross), amountPaid:'0',
    paymentTerms: settings.defaultPaymentTerms || '30',
    createdBy:auth.userId, createdAt:now
  }, body);
  appendRow('Finance_Invoices', row);
  // Mirror to transactions ledger
  appendRow('Finance_Transactions', {
    id:genId('FTX'), transactionDate:body.invoiceDate, type:'invoice', status:'draft',
    amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
    category:'Contract Revenue', description:'Invoice '+invoiceNo+' — '+body.customerName,
    supplierOrCustomer:body.customerName, linkedContractId:body.contractId||'',
    linkedSiteId:body.siteId||'', linkedInvoiceId:id,
    createdBy:auth.userId, createdAt:now, updatedAt:now
  });
  auditLog(auth.userId, 'CREATE', 'FinanceInvoice', id, null, row);
  return { ok:true, id:id, invoiceNumber:invoiceNo };
}

function markFinanceInvoiceSent(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'InvoiceSent');
  var now = new Date().toISOString();
  updateRow('Finance_Invoices', body.id, { status:'Issued', sentAt:now });
  auditLog(auth.userId, 'SEND', 'FinanceInvoice', body.id, null, body);
  return { ok:true };
}

function recordFinancePayment(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['invoiceId','amountGross','transactionDate'], 'FinancePayment');
  var inv = getRowById('Finance_Invoices', body.invoiceId);
  if (!inv) throw new Error('Invoice not found: ' + body.invoiceId);
  var total     = parseFloat(inv.totalAmount || 0);
  var paid      = parseFloat(inv.amountPaid  || 0);
  var newPaid   = r2(paid + parseFloat(body.amountGross));
  var newBal    = r2(Math.max(0, total - newPaid));
  var status    = newBal <= 0 ? 'Paid' : 'Partial';
  var now       = new Date().toISOString();
  updateRow('Finance_Invoices', body.invoiceId, {
    status:status, balanceDue:newBal, amountPaid:newPaid,
    paidAt:status==='Paid'?now:(inv.paidAt||'')
  });
  var txnId = genId('FTX');
  var gross = parseFloat(body.amountGross);
  appendRow('Finance_Transactions', {
    id:txnId, transactionDate:body.transactionDate, type:'payment', status:'paid',
    amountNet:r2(gross/1.2), amountVat:r2(gross - gross/1.2), amountGross:r2(gross),
    paymentMethod:body.paymentMethod||'BACS', category:'Contract Revenue',
    description:'Payment for ' + inv.invoiceNumber + ' — ' + (inv.customerName||''),
    supplierOrCustomer:inv.customerName||'',
    linkedInvoiceId:body.invoiceId, linkedContractId:inv.contractId||'',
    linkedSiteId:inv.siteId||'', externalRef:body.reference||'', notes:body.notes||'',
    createdBy:auth.userId, createdAt:now, updatedAt:now
  });
  auditLog(auth.userId, 'PAYMENT', 'FinanceInvoice', body.invoiceId, null, body);
  return { ok:true, txnId:txnId, newBalance:newBal, invoiceStatus:status };
}

function createFinanceExpense(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['expenseDate','category','amountGross','description'], 'FinanceExpense');
  var id    = genId('EXP');
  var gross = parseFloat(body.amountGross);
  var net   = parseFloat(body.amountNet  || r2(gross / 1.2));
  var vat   = parseFloat(body.amountVat  || r2(gross - net));
  var now   = new Date().toISOString();
  var row   = Object.assign({
    id:id, amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
    approvalStatus:'Approved', enteredBy:auth.userId, createdAt:now
  }, body);
  appendRow('Finance_Expenses', row);
  appendRow('Finance_Transactions', {
    id:genId('FTX'), transactionDate:body.expenseDate, type:'expense', status:'paid',
    amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
    paymentMethod:body.paymentMethod||'', category:body.category,
    description:body.description, supplierOrCustomer:body.supplier||'',
    linkedContractId:body.linkedContractId||'', linkedSiteId:body.linkedSiteId||'',
    externalRef:body.receiptRef||'', createdBy:auth.userId, createdAt:now, updatedAt:now
  });
  auditLog(auth.userId, 'CREATE', 'FinanceExpense', id, null, row);
  return { ok:true, id:id };
}

function updateFinanceExpense(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'FinanceExpenseUpdate');
  updateRow('Finance_Expenses', body.id, body);
  auditLog(auth.userId, 'UPDATE', 'FinanceExpense', body.id, null, body);
  return { ok:true };
}

function generateFinanceRecurring(body, auth) {
  requireRole(auth, 'Finance');
  var targetMonth = body.targetMonth || new Date().toISOString().slice(0,7);
  var allExps     = getTableRows('Finance_Expenses');
  var now         = new Date().toISOString();

  // Collect unique recurring templates (latest entry per category+description+supplier)
  var templates = [];
  var seen      = {};
  var recExps   = allExps.filter(function(e) { return e.recurringFlag === 'Yes'; })
    .sort(function(a,b) { return (b.expenseDate||'').localeCompare(a.expenseDate||''); });
  recExps.forEach(function(e) {
    var key = (e.category||'') + '||' + (e.description||'').toLowerCase().trim() + '||' + (e.supplier||'').toLowerCase().trim();
    if (!seen[key]) { seen[key] = true; templates.push(e); }
  });
  if (!templates.length) return { ok:true, generated:0, skipped:0 };

  // Find already-generated entries for this month (by generatedFromId or matching key+month)
  var thisMonthExps = allExps.filter(function(e) { return (e.expenseDate||'').slice(0,7) === targetMonth; });
  var alreadyKeys   = {};
  thisMonthExps.filter(function(e) { return e.recurringFlag === 'Yes'; }).forEach(function(e) {
    var key = (e.category||'') + '||' + (e.description||'').toLowerCase().trim() + '||' + (e.supplier||'').toLowerCase().trim();
    alreadyKeys[key] = true;
  });

  var generated = 0;
  var skipped   = 0;
  var expDate   = targetMonth + '-01';

  templates.forEach(function(tmpl) {
    var key = (tmpl.category||'') + '||' + (tmpl.description||'').toLowerCase().trim() + '||' + (tmpl.supplier||'').toLowerCase().trim();
    if (alreadyKeys[key]) { skipped++; return; }
    var id    = genId('EXP');
    var gross = parseFloat(tmpl.amountGross||0);
    var net   = parseFloat(tmpl.amountNet   || r2(gross / 1.2));
    var vat   = parseFloat(tmpl.amountVat   || r2(gross - net));
    var row   = {
      id:id, expenseDate:expDate, category:tmpl.category, subcategory:tmpl.subcategory||'',
      description:tmpl.description, supplier:tmpl.supplier||'', amountNet:r2(net),
      amountVat:r2(vat), amountGross:r2(gross), paymentMethod:tmpl.paymentMethod||'',
      linkedSiteId:tmpl.linkedSiteId||'', linkedContractId:tmpl.linkedContractId||'',
      receiptRef:'', recurringFlag:'Yes', approvalStatus:'Approved',
      enteredBy:auth.userId, createdAt:now
    };
    appendRow('Finance_Expenses', row);
    appendRow('Finance_Transactions', {
      id:genId('FTX'), transactionDate:expDate, type:'expense', status:'paid',
      amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
      paymentMethod:tmpl.paymentMethod||'', category:tmpl.category,
      description:tmpl.description, supplierOrCustomer:tmpl.supplier||'',
      linkedContractId:tmpl.linkedContractId||'', linkedSiteId:tmpl.linkedSiteId||'',
      externalRef:'', createdBy:auth.userId, createdAt:now, updatedAt:now
    });
    generated++;
  });

  auditLog(auth.userId, 'GENERATE_RECURRING', 'FinanceExpense', null, null, { targetMonth:targetMonth, generated:generated });
  return { ok:true, generated:generated, skipped:skipped };
}

function recalculateFinanceSnapshots(body, auth) {
  requireRole(auth, 'Finance');
  var month    = body.month || new Date().toISOString().slice(0,7);
  var invs     = getTableRows('Finance_Invoices').filter(function(i) { return (i.invoiceDate||'').slice(0,7) === month && i.status !== 'Void'; });
  var exps     = getTableRows('Finance_Expenses').filter(function(e) { return (e.expenseDate||'').slice(0,7) === month; });
  var payments = getTableRows('Finance_Transactions').filter(function(t) { return t.type === 'payment' && (t.transactionDate||'').slice(0,7) === month; });
  var settings = _getFinanceSettings();
  var healthy  = parseFloat(settings.targetMarginHealthy || 35);
  var watch    = parseFloat(settings.targetMarginWatch   || 20);

  var siteIds = {};
  invs.forEach(function(i) { if (i.siteId) siteIds[i.siteId] = true; });
  exps.forEach(function(e) { if (e.linkedSiteId) siteIds[e.linkedSiteId] = true; });

  var snapshots = [];
  Object.keys(siteIds).forEach(function(siteId) {
    var si = invs.filter(function(i) { return i.siteId === siteId; });
    var se = exps.filter(function(e) { return e.linkedSiteId === siteId; });
    var sp = payments.filter(function(t) { return t.linkedSiteId === siteId; });

    function sumCat(cat) {
      return se.filter(function(e){return e.category===cat;})
               .reduce(function(s,e){return s+parseFloat(e.amountGross||0);},0);
    }

    var invoicedRevenue   = si.reduce(function(s,i){return s+parseFloat(i.totalAmount||0);},0);
    var cashReceived      = sp.reduce(function(s,t){return s+parseFloat(t.amountGross||0);},0);
    var labourCost        = sumCat('Labour');
    var suppliesCost      = sumCat('Supplies & Consumables');
    var travelCost        = sumCat('Travel & Transport');
    var subcontractorCost = sumCat('Subcontractors');
    var otherCost         = Math.max(0, se.reduce(function(s,e){return s+parseFloat(e.amountGross||0);},0) - labourCost - suppliesCost - travelCost - subcontractorCost);
    var totalCost         = labourCost + suppliesCost + travelCost + subcontractorCost + otherCost;
    var grossProfit       = invoicedRevenue - totalCost;
    var grossMarginPct    = invoicedRevenue > 0 ? r2(grossProfit / invoicedRevenue * 100) : 0;

    var riskFlag = 'healthy', recommendation = '';
    if (totalCost === 0 && invoicedRevenue > 0) { riskFlag = 'nodata'; recommendation = 'No cost data logged — margin overstated. Add labour and supply costs.'; }
    else if (grossMarginPct < 0)        { riskFlag = 'loss';    recommendation = 'Loss-making contract — review pricing and delivery costs immediately.'; }
    else if (grossMarginPct < watch)    { riskFlag = 'risk';    recommendation = 'Margin below ' + watch + '% risk threshold — investigate cost drivers.'; }
    else if (grossMarginPct < healthy)  { riskFlag = 'watch';   recommendation = 'Margin in watch zone — monitor closely this month.'; }

    var snap = {
      id:genId('SNAP'), snapshotMonth:month, siteId:siteId,
      contractId: si[0] ? (si[0].contractId||'') : '',
      invoicedRevenue:r2(invoicedRevenue), cashReceived:r2(cashReceived),
      labourCost:r2(labourCost), suppliesCost:r2(suppliesCost),
      travelCost:r2(travelCost), subcontractorCost:r2(subcontractorCost),
      otherCost:r2(otherCost), totalCost:r2(totalCost),
      grossProfit:r2(grossProfit), grossMarginPct:grossMarginPct,
      riskFlag:riskFlag, recommendation:recommendation,
      computedAt:new Date().toISOString()
    };
    snapshots.push(snap);

    // Remove old snapshot for this month/site and re-append
    var ss2 = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Finance_Snapshots');
    if (ss2) {
      var data = ss2.getDataRange().getValues();
      var hdr  = data[0];
      var mIdx = hdr.indexOf('snapshotMonth');
      var sIdx = hdr.indexOf('siteId');
      for (var i = data.length-1; i >= 1; i--) {
        if (data[i][mIdx] === month && data[i][sIdx] === siteId) ss2.deleteRow(i+1);
      }
    }
    appendRow('Finance_Snapshots', snap);
  });

  invalidateCache();
  return { ok:true, count:snapshots.length, month:month };
}

function financeAssistant(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['question'], 'FinanceAssistant');
  var now      = new Date();
  var month    = Utilities.formatDate(now, 'UTC', 'yyyy-MM');
  var today    = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd');
  var settings = _getFinanceSettings();
  var invs     = getTableRows('Finance_Invoices');
  var exps     = getTableRows('Finance_Expenses');
  var txns     = getTableRows('Finance_Transactions');
  var snaps    = getTableRows('Finance_Snapshots');
  var answer   = _financeAI(body.question.toLowerCase(), invs, exps, txns, snaps, settings, month, today);
  return { ok:true, answer:answer, ts:now.toISOString() };
}

function _financeAI(q, invs, exps, txns, snaps, settings, month, today) {
  var healthy = parseFloat(settings.targetMarginHealthy || 35);
  var watch   = parseFloat(settings.targetMarginWatch   || 20);

  if (q.includes('revenue') || q.includes('invoiced') || q.includes('billed')) {
    var mi = invs.filter(function(i){return (i.invoiceDate||'').slice(0,7)===month && i.status!=='Void';});
    if (!mi.length) return 'No invoices issued in ' + month + ' yet. Create invoices to track revenue.';
    var tot = mi.reduce(function(s,i){return s+parseFloat(i.totalAmount||0);},0);
    return 'Invoiced revenue for ' + month + ': \xA3' + tot.toFixed(2) + ' across ' + mi.length + ' invoice(s). This is billed revenue — use "cash received" for actual cash in.';
  }
  if (q.includes('cash') || q.includes('received') || q.includes('cash in')) {
    var mp = txns.filter(function(t){return t.type==='payment'&&(t.transactionDate||'').slice(0,7)===month;});
    if (!mp.length) return 'No payments recorded in ' + month + '. Record payments against invoices to track cash in.';
    var tot = mp.reduce(function(s,t){return s+parseFloat(t.amountGross||0);},0);
    return 'Cash received in ' + month + ': \xA3' + tot.toFixed(2) + ' across ' + mp.length + ' payment(s).';
  }
  if (q.includes('overdue')) {
    var od = invs.filter(function(i){return (i.status==='Issued'||i.status==='Sent'||i.status==='Overdue')&&i.dueDate&&i.dueDate<today;});
    if (!od.length) return 'No overdue invoices at this time.';
    var tot = od.reduce(function(s,i){return s+parseFloat(i.balanceDue||i.totalAmount||0);},0);
    var detail = od.map(function(i){return i.invoiceNumber+' (\xA3'+parseFloat(i.balanceDue||i.totalAmount||0).toFixed(0)+', due '+i.dueDate+')';}).join('; ');
    return od.length+' overdue invoice(s) totalling \xA3'+tot.toFixed(2)+':\n'+detail+'\n\nAction: chase these immediately.';
  }
  if (q.includes('outstanding') || q.includes('unpaid')) {
    var up = invs.filter(function(i){return i.status==='Issued'||i.status==='Sent'||i.status==='Overdue';});
    if (!up.length) return 'No outstanding invoices — all are paid or in draft.';
    var tot = up.reduce(function(s,i){return s+parseFloat(i.balanceDue||i.totalAmount||0);},0);
    var od2 = up.filter(function(i){return i.status==='Overdue';}).length;
    return up.length+' outstanding invoice(s) totalling \xA3'+tot.toFixed(2)+'. Of these, '+od2+' are overdue.';
  }
  if (q.includes('margin') || q.includes('profit') || q.includes('profitable')) {
    var ms = snaps.filter(function(s){return s.snapshotMonth===month;});
    if (!ms.length) return 'No profitability data for '+month+'. Log expenses and run "Recalculate Snapshots" to compute margins.';
    var sorted = ms.slice().sort(function(a,b){return parseFloat(a.grossMarginPct||0)-parseFloat(b.grossMarginPct||0);});
    var out = 'Profitability — '+month+':\n';
    sorted.forEach(function(s){
      var flag = parseFloat(s.grossMarginPct)<watch?' [RISK]':parseFloat(s.grossMarginPct)<healthy?' [WATCH]':'';
      out += '\u2022 '+s.siteId+': '+s.grossMarginPct+'% margin'+flag+'\n';
    });
    if (sorted[0] && sorted[0].recommendation) out += '\nAlert: '+sorted[0].recommendation;
    return out;
  }
  if (q.includes('expense') || q.includes('cost') || q.includes('spend')) {
    var me = exps.filter(function(e){return (e.expenseDate||'').slice(0,7)===month;});
    if (!me.length) return 'No expenses logged for '+month+'. Add expenses to calculate accurate margins.';
    var catMap = {};
    me.forEach(function(e){catMap[e.category]=(catMap[e.category]||0)+parseFloat(e.amountGross||0);});
    var tot = me.reduce(function(s,e){return s+parseFloat(e.amountGross||0);},0);
    var sorted = Object.entries(catMap).sort(function(a,b){return b[1]-a[1];});
    var out = 'Expenses for '+month+': \xA3'+tot.toFixed(2)+' total.\nBreakdown:\n';
    sorted.forEach(function(kv){out+='\u2022 '+kv[0]+': \xA3'+kv[1].toFixed(2)+'\n';});
    return out;
  }
  if (q.includes('biggest') || q.includes('largest') || q.includes('top')) {
    var allE = exps.slice().sort(function(a,b){return parseFloat(b.amountGross||0)-parseFloat(a.amountGross||0);}).slice(0,5);
    if (!allE.length) return 'No expenses recorded yet.';
    var out = 'Top 5 expenses:\n';
    allE.forEach(function(e){out+='\u2022 '+e.description+' ('+e.category+'): \xA3'+parseFloat(e.amountGross||0).toFixed(2)+' on '+e.expenseDate+'\n';});
    return out;
  }
  var hasInvs  = invs.length > 0;
  var hasExps  = exps.length > 0;
  var hasSnaps = snaps.length > 0;
  var tips = [];
  if (!hasInvs)  tips.push('no invoices yet — create invoices to track revenue');
  if (!hasExps)  tips.push('no expenses yet — add expenses to calculate margins');
  if (!hasSnaps) tips.push('no profitability snapshots — run Recalculate after adding data');
  var msg = 'I can answer questions about your finance data. Try:\n\u2022 "What is my revenue this month?"\n\u2022 "Which invoices are overdue?"\n\u2022 "What are my biggest costs?"\n\u2022 "Which contracts have the lowest margin?"\n\u2022 "What is my cash position this month?"';
  if (tips.length) msg += '\n\nNote: ' + tips.join('; ') + '.';
  return msg;
}

// ── SETUP ─────────────────────────────────────────────────────

function setupFinanceSheets(body, auth) {
  if (auth) requireRole(auth, 'Owner');
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var defs = {
    'Finance_Transactions': ['id','transactionDate','type','subtype','status','amountNet','amountVat','amountGross','paymentMethod','category','description','supplierOrCustomer','linkedLeadId','linkedQuoteId','linkedContractId','linkedSiteId','linkedInvoiceId','createdBy','createdAt','updatedAt','notes','externalRef'],
    'Finance_Invoices':     ['id','invoiceNumber','invoiceDate','dueDate','contractId','siteId','customerName','billingPeriodFrom','billingPeriodTo','lineItemsJson','subtotal','vatAmount','totalAmount','amountPaid','balanceDue','status','sentAt','paidAt','paymentTerms','notes','createdBy','createdAt'],
    'Finance_Expenses':     ['id','expenseDate','category','subcategory','supplier','description','amountNet','amountVat','amountGross','linkedContractId','linkedSiteId','recurringFlag','approvalStatus','receiptUrl','receiptRef','paymentMethod','enteredBy','createdAt'],
    'Finance_Snapshots':    ['id','snapshotMonth','contractId','siteId','invoicedRevenue','cashReceived','labourCost','suppliesCost','travelCost','subcontractorCost','otherCost','totalCost','grossProfit','grossMarginPct','riskFlag','recommendation','computedAt'],
    'Finance_Settings':     ['key','value','updatedAt'],
    'Finance_Categories':   ['category','subcategory','type','active']
  };
  var created = [];
  Object.keys(defs).forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      var sheet = ss.insertSheet(name);
      sheet.getRange(1,1,1,defs[name].length).setValues([defs[name]]);
      created.push(name);
    }
  });
  var setSheet = ss.getSheetByName('Finance_Settings');
  if (setSheet && setSheet.getLastRow() <= 1) {
    var now = new Date().toISOString();
    setSheet.getRange(2,1,6,3).setValues([
      ['vatRate','20',now],['targetMarginHealthy','35',now],
      ['targetMarginWatch','20',now],['invoicePrefix','INV',now],
      ['defaultPaymentTerms','30',now],['currency','GBP',now]
    ]);
  }
  var catSheet = ss.getSheetByName('Finance_Categories');
  if (catSheet && catSheet.getLastRow() <= 1) {
    catSheet.getRange(2,1,14,4).setValues([
      ['Labour','Direct Labour','expense','Yes'],
      ['Subcontractors','Subcontractor Costs','expense','Yes'],
      ['Supplies & Consumables','Cleaning Products','expense','Yes'],
      ['Travel & Transport','Site Travel','expense','Yes'],
      ['Equipment','Tools & Equipment','expense','Yes'],
      ['Admin & Software','Software','expense','Yes'],
      ['Marketing','Digital Marketing','expense','Yes'],
      ['Insurance','Public Liability','expense','Yes'],
      ['Training & Compliance','Staff Training','expense','Yes'],
      ['One-off Job Costs','One-off','expense','Yes'],
      ['Miscellaneous','Other','expense','Yes'],
      ['Contract Revenue','Monthly Contract','income','Yes'],
      ['One-off Revenue','One-off Job','income','Yes'],
      ['Other Income','Misc Income','income','Yes']
    ]);
  }
  invalidateCache();
  return { ok:true, created:created };
}

function _nextInvoiceNumber(prefix) {
  var rows = getTableRows('Finance_Invoices');
  var max  = 0;
  rows.forEach(function(r) {
    if (r.invoiceNumber && r.invoiceNumber.toString().startsWith(prefix+'-')) {
      var n = parseInt(r.invoiceNumber.toString().replace(prefix+'-','')) || 0;
      if (n > max) max = n;
    }
  });
  return prefix + '-' + String(max + 1).padStart(4, '0');
}

// Run this directly from GAS editor to create Finance sheets
function runSetupFinanceSheets() {
  var result = setupFinanceSheets({}, null);
  Logger.log('Finance sheets setup: ' + JSON.stringify(result));
}

// ============================================================
// LABOUR & PAYROLL — GAS Functions