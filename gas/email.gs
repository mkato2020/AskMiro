// ── EMAIL TEMPLATE BUILDER ────────────────────────────────────
function buildEmailTemplate(tmpl, f, subject) {
  var teal = '#0D9488', navy = '#0C1929', charcoal = '#1F2937', slate = '#475569';
  var muted = '#94A3B8', border = '#E2E8F0', offWhite = '#F8FAFC';
  var phone = '020 8073 0621', emailAddr = 'info@askmiro.com', web = 'www.askmiro.com';
  var company = 'AskMiro Cleaning Services', trading = 'A trading name of Miro Partners Ltd';
  var sortCode = '04-06-05', accNum = '26672911', accName = 'Miro Partners Ltd';
  var name = f.name || 'there', site = f.site || '[Site Name]', amount = f.amount || '';
  var senderName = f.senderName || 'AskMiro Team', senderRole = f.senderRole || 'AskMiro Cleaning Services';
  var logo = '<table cellpadding="0" cellspacing="0"><tr><td style="background:#0D9488;border-radius:9px;width:40px;height:40px;text-align:center;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="32" height="32" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td></tr></table>';
  function sig() {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:32px"><tr><td style="border-top:2px solid ' + teal + ';padding-top:20px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:top">' + logo + '</td><td style="vertical-align:top"><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:' + charcoal + '">' + senderName + '</div><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:' + teal + ';letter-spacing:1px;text-transform:uppercase;margin:3px 0 8px">' + senderRole + '</div><div style="font-family:Arial,sans-serif;font-size:12px;color:' + slate + '">&#9742; <a href="tel:02080730621" style="color:' + slate + ';text-decoration:none">' + phone + '</a> &nbsp;|&nbsp; &#9993; <a href="mailto:' + emailAddr + '" style="color:' + slate + ';text-decoration:none">' + emailAddr + '</a> &nbsp;|&nbsp; <a href="https://' + web + '" style="color:' + teal + ';text-decoration:none;font-weight:600">' + web + '</a></div></td></tr></table><div style="margin-top:12px;background:' + offWhite + ';border:1px solid ' + border + ';border-radius:8px;padding:8px 14px;font-family:Arial,sans-serif;font-size:10px;color:' + muted + '">&#10003; COSHH Compliant &nbsp;&nbsp; &#10003; Fully Insured &nbsp;&nbsp; &#10003; ISO Quality Standards &nbsp;&nbsp; &#10003; London &amp; UK Coverage</div></td></tr></table>';
  }
  function wrap(label, accent, bodyContent) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#E8EDF4;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#E8EDF4;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + navy + ';border-radius:12px 0 0 0;padding:24px 28px;width:52%;vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">' + logo + '</td><td style="vertical-align:middle"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;color:#fff">AskMiro</div><div style="font-family:Arial,sans-serif;font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px">Cleaning Services</div></td></tr></table></td><td style="background:' + accent + ';border-radius:0 12px 0 0;padding:24px 28px;vertical-align:bottom;text-align:right"><div style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.85)">' + label + '</div></td></tr><tr><td colspan="2" style="background:' + accent + ';height:3px;font-size:3px;line-height:3px">&nbsp;</td></tr></table></td></tr><tr><td style="background:#fff;padding:36px 36px 28px;border-left:1px solid ' + border + ';border-right:1px solid ' + border + '">' + bodyContent + sig() + '</td></tr><tr><td style="background:' + navy + ';border-radius:0 0 12px 12px;padding:18px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,0.6)">' + company + '</div><div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px">' + trading + ' &bull; London &amp; UK</div></td><td align="right"><a href="https://' + web + '" style="font-family:Arial,sans-serif;font-size:12px;color:' + teal + ';text-decoration:none;font-weight:700">' + web + '</a></td></tr></table><p style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.2);margin:10px 0 0;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px">Sent by ' + senderName + ' on behalf of ' + company + '. If received in error please notify ' + emailAddr + '.</p></td></tr></table></td></tr></table></body></html>';
  }
  function p(t)      { return '<p style="font-family:Arial,sans-serif;font-size:14px;color:' + slate + ';line-height:1.85;margin:0 0 16px">' + t + '</p>'; }
  function h(t)      { return '<h1 style="font-family:Georgia,serif;font-size:23px;font-weight:700;color:' + charcoal + ';margin:0 0 4px;letter-spacing:-0.5px">' + t + '</h1>'; }
  function sub(t)    { return '<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + teal + ';letter-spacing:1.2px;text-transform:uppercase;margin:0 0 22px">' + t + '</p>'; }
  function gr(n)     { return '<p style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:' + charcoal + ';margin:0 0 18px">Dear ' + n + ',</p>'; }
  function sm(t)     { return '<p style="font-family:Arial,sans-serif;font-size:11px;color:' + muted + ';line-height:1.7;margin:0">' + t + '</p>'; }
  function divider() { return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="height:1px;background:' + border + '">&nbsp;</td></tr></table>'; }
  function amber(html) { return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#92400E;line-height:1.7">' + html + '</td></tr></table>'; }
  function blockquote(text) { return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:18px"><tr><td style="width:4px;background:' + teal + ';border-radius:4px">&nbsp;</td><td style="padding:12px 16px;background:' + offWhite + ';border:1px solid ' + border + ';border-left:none;border-radius:0 8px 8px 0;font-family:Georgia,serif;font-size:13px;color:' + charcoal + ';font-style:italic;line-height:1.7">&ldquo;' + text + '&rdquo;</td></tr></table>'; }
  function cta(label, href, color) { return '<table cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:' + (color || teal) + ';border-radius:8px"><a href="' + href + '" style="display:block;padding:14px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none">' + label + '</a></td><td width="10">&nbsp;</td><td style="border:2px solid ' + border + ';border-radius:8px"><a href="tel:02080730621" style="display:block;padding:12px 20px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:' + slate + ';text-decoration:none">&#9742; ' + phone + '</a></td></tr></table>'; }
  function checklist(items) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="background:' + offWhite + ';border:1px solid ' + border + ';border-radius:10px;padding:16px 18px;margin-bottom:20px"><tbody>'
      + items.map(function(item) { return '<tr><td style="vertical-align:top;padding:0 10px 8px 0;width:22px"><div style="width:20px;height:20px;background:' + teal + ';border-radius:50%;text-align:center;line-height:21px;font-size:11px;color:white;font-weight:700">&#10003;</div></td><td style="vertical-align:top;padding-bottom:8px;font-family:Arial,sans-serif;font-size:13px;color:' + slate + ';line-height:1.6">' + item + '</td></tr>'; }).join('')
      + '</tbody></table>';
  }
  function statBand(stats) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="border-radius:10px;overflow:hidden;margin-bottom:22px"><tr>'
      + stats.map(function(s, i) { return '<td align="center" style="background:linear-gradient(135deg,' + navy + ',#122440);padding:16px;' + (i < stats.length - 1 ? 'border-right:1px solid rgba(255,255,255,0.08)' : '') + '"><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-bottom:4px">' + s.label + '</div><div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#fff">' + s.value + '</div>' + (s.sub ? '<div style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">' + s.sub + '</div>' : '') + '</td>'; }).join('')
      + '</tr></table>';
  }
  function dataTable(rows, total) {
    var r = rows.map(function(r) { return '<tr style="border-bottom:1px solid ' + border + '"><td style="font-family:Arial,sans-serif;font-size:13px;color:' + slate + ';padding:10px 14px">' + r[0] + '</td><td style="font-family:Arial,sans-serif;font-size:13px;color:' + (r[3] ? teal : charcoal) + ';font-weight:' + (r[2] ? '700' : '400') + ';padding:10px 14px;text-align:right">' + r[1] + '</td></tr>'; }).join('');
    var t = total ? '<tr style="background:' + navy + '"><td style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;padding:12px 14px">' + total[0] + '</td><td style="font-family:Georgia,serif;font-size:19px;font-weight:700;color:#fff;padding:12px 14px;text-align:right">' + total[1] + '</td></tr>' : '';
    return '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ' + border + ';border-radius:10px;overflow:hidden;margin-bottom:22px">' + r + t + '</table>';
  }
  // ── INTRODUCTION ─────────────────────────────────────────
  if (tmpl === 'Introduction') {
    var introBody;
    if (f.customIntro && f.customIntro.trim().length > 0) {
      introBody = f.customIntro.trim().split(/\n\s*\n/).map(function(chunk) { return p(chunk.replace(/\n/g, '<br>')); }).join('');
    } else {
      introBody = p('We are <strong>' + company + '</strong> &mdash; a managed commercial cleaning company serving offices, warehouses, schools, healthcare facilities, and automotive dealerships across London and the UK.')
        + p('Unlike typical contractors, we don&rsquo;t just supply staff &mdash; we <strong>manage the entire service end-to-end</strong>: consistent teams, supervisor oversight, quality checklists, and a single point of contact.');
    }
    return wrap('Client Introduction', teal,
      h('Professional Cleaning. Properly Managed.') + sub('AskMiro Cleaning Services &mdash; London &amp; UK') + gr(name) + introBody
      + checklist(['<strong>Consistent, site-trained teams</strong> &mdash; the same people every visit, not rotating agency staff','<strong>Supervisor oversight &amp; written quality inspections</strong> &mdash; we check the work so you never have to','<strong>COSHH-compliant processes</strong> &mdash; full risk assessments and RAMS documentation as standard','<strong>Eco-conscious products</strong> &mdash; biodegradable chemicals and dilution control systems','<strong>Absence cover guaranteed</strong> &mdash; replacements arranged, your schedule is never disrupted','<strong>Single point of contact</strong> &mdash; reach our team directly, not a call centre'])
      + blockquote('We don&rsquo;t just supply cleaners &mdash; we manage the service. Our clients don&rsquo;t worry about cleaning because we handle everything, every time.')
      + p('We&rsquo;d love to arrange a <strong>free, no-obligation site visit</strong>. Most proposals are returned within 48 hours with a fixed monthly rate and no hidden costs.')
      + cta('&#128197; Book a Free Site Visit', 'mailto:' + emailAddr + '?subject=Site Visit Request', teal)
      + divider() + sm(company + ' is fully insured, COSHH compliant, and covered by public liability insurance.')
    );
  }
  // ── PROPOSAL / QUOTE ─────────────────────────────────────
  if (tmpl === 'Proposal / Quote') {
    // Body field: use what the sender typed, or fall back to the default copy
    var defaultPQBody = 'Thank you for your time during our site visit to <strong>' + site + '</strong>. We’re pleased to present our proposal for managed commercial cleaning services.'
      + '<br><br>What’s included in your service:<br>'
      + '✓ Dedicated cleaning team — inducted and briefed to your site specification<br>'
      + '✓ All professional equipment, chemicals and consumables supplied<br>'
      + '✓ COSHH risk assessments and full RAMS documentation<br>'
      + '✓ Monthly supervisor quality inspection with written report<br>'
      + '✓ Absence cover — your schedule is never disrupted';
    var pqBodyRaw = (f.body || '').trim();
    var pqBodyHtml = pqBodyRaw.length > 0
      ? pqBodyRaw.split(/\n{2,}/).map(function(chunk) {
          var lines = chunk.split('\n');
          var isChecks = lines.every(function(l) { return /^[\u2713\u2714\u2022\-]/.test(l.trim()); });
          if (isChecks) {
            return checklist(lines.map(function(l) { return l.replace(/^[\u2713\u2714\u2022\-]\s*/, ''); }));
          }
          return p(lines.join('<br>'));
        }).join('')
      : p(defaultPQBody);
    return wrap('Cleaning Proposal', '#0F766E',
      h('Your Cleaning Proposal.') + sub('Prepared following our site visit &mdash; valid for 30 days') + gr(name)
      + pqBodyHtml
      + statBand([{ label:'Monthly Investment', value: amount ? '&pound;' + amount : 'TBC', sub:'Fixed &mdash; no hidden costs' },{ label:'Visits per Week', value: f.visits || 'TBC', sub: f.days || '' },{ label:'Hours per Visit', value: f.hours ? f.hours + 'hrs' : 'TBC', sub:'Dedicated team' }])
      + amber('<strong>&#9200; This proposal is valid for 30 days from the date of this email.</strong><br>Reply to confirm and we can have your service live within <strong>5&ndash;7 working days</strong>.')
      + cta('&#10003; Accept This Proposal', 'mailto:' + emailAddr + '?subject=Accepting Proposal', '#0F766E')
      + divider() + sm('All prices exclusive of VAT. Payment terms: 30 days from invoice.')
    );
  }
  // ── FOLLOW-UP ────────────────────────────────────────────
  if (tmpl === 'Follow-up') {
    return wrap('Proposal Follow-up', '#D97706',
      h('Just Checking In.') + sub('Regarding our recent proposal') + gr(name)
      + p('We hope you&rsquo;re well. We&rsquo;re following up on the proposal we sent for cleaning services at <strong>' + site + '</strong>.')
      + p('If the proposal works for you, simply reply and we can get things moving. If you&rsquo;d like anything adjusted, we&rsquo;re happy to revisit scope, frequency, or pricing.')
      + blockquote('Every client has our commitment: if something isn&rsquo;t right, we fix it within 24 hours. That&rsquo;s not a policy &mdash; it&rsquo;s simply how we operate.')
      + checklist(['No long-term lock-in for initial contracts','Service live within 5&ndash;7 working days of confirmation','Dedicated account contact &mdash; not a call centre','Consistent teams, not rotating agency staff'])
      + cta('&#9993; Reply to This Email', 'mailto:' + emailAddr, '#D97706')
      + divider() + sm('To stop follow-up emails please reply with &ldquo;Unsubscribe&rdquo;.')
    );
  }
  // ── WELCOME ONBOARD ──────────────────────────────────────
  if (tmpl === 'Welcome Onboard') {
    return wrap('Welcome Onboard', '#059669',
      h('Welcome to AskMiro.') + sub('We&rsquo;re delighted to be working with you') + gr(name)
      + p('On behalf of everyone at ' + company + ' &mdash; <strong>welcome aboard</strong>. Your service is confirmed and our team is ready to get started.')
      + dataTable([['Site Address', site],['Service Start', f.startDate || '&mdash;'],['Schedule', f.schedule || '&mdash;'],['Team Size', f.team ? f.team + ' dedicated cleaners' : '&mdash;'],['Monthly Fee', amount ? '&pound;' + amount + ' + VAT' : '&mdash;', true, true],['Invoice Day','Last working day of each month'],['Contact', phone + ' &mdash; ' + emailAddr]])
      + checklist(['<strong>Site briefing</strong> &mdash; our team visits before the first clean to walk the site','<strong>Schedule confirmation</strong> &mdash; your full cleaning schedule sent in writing','<strong>Direct contact</strong> &mdash; you will have a dedicated contact number','<strong>First invoice</strong> &mdash; issued at the end of your first month'])
      + blockquote('We work hard to be the kind of cleaning company you never have to think about.')
      + cta('&#9742; Call Us &mdash; ' + phone, 'tel:02080730621', '#059669')
      + divider() + sm('Welcome confirmation sent by ' + company + '. Please retain this email for your records.')
    );
  }
  // ── INVOICE ──────────────────────────────────────────────
  if (tmpl === 'Invoice') {
    var net = parseFloat(amount || 0);
    var vatPct = parseFloat(f.vatRate || 0);
    var vatAmt = (net * vatPct / 100).toFixed(2);
    var total = (net + parseFloat(vatAmt)).toFixed(2);
    var invNum = f.invNum || '&mdash;', period = f.period || '&mdash;';
    var issueDate = f.issueDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMMM yyyy');
    var tableRows = [['Invoice Number', invNum],['Service Period', period],['Site', site],['Issue Date', issueDate],['Payment Due', f.dueDate || '30 days from invoice date']];
    if (vatPct > 0) {
      tableRows.push(['Subtotal', amount ? '&pound;' + net.toFixed(2) : '&mdash;']);
      tableRows.push(['VAT (' + vatPct + '%)', amount ? '&pound;' + vatAmt : '&mdash;']);
    }
    return wrap('Invoice', navy,
      h('Invoice ' + invNum + '.') + sub(period + (site ? ' &mdash; ' + site : '')) + gr(name)
      + p('Please find attached your invoice for cleaning services at <strong>' + site + '</strong> for <strong>' + period + '</strong>. Your PDF invoice is attached to this email.')
      + dataTable(tableRows, ['Total Due', amount ? '&pound;' + total : '&mdash;'])
      + amber('<strong>Bank Transfer Details</strong><br><br><table cellpadding="0" cellspacing="0"><tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#92400E;padding-right:24px;line-height:2">Account Name<br>Sort Code<br>Account Number<br>Reference</td><td style="font-family:Arial,sans-serif;font-size:13px;color:' + charcoal + ';font-weight:700;line-height:2">' + accName + '<br>' + sortCode + '<br>' + accNum + '<br>' + invNum + '</td></tr></table>')
      + p('Payment is due within <strong>30 days</strong>. For queries please reply or call ' + phone + '.')
      + (vatPct === 0 ? sm('Not VAT registered &mdash; no VAT is charged on this invoice. AskMiro Cleaning Services is below the compulsory VAT registration threshold.') : '')
      + divider() + sm('Late payments may be subject to statutory interest under the Late Payment of Commercial Debts (Interest) Act 1998.')
    );
  }
  // ── CONTRACT RENEWAL ─────────────────────────────────────
  if (tmpl === 'Contract Renewal') {
    return wrap('Service Renewal', '#7C3AED',
      h('Your Service Agreement Is Up for Renewal.') + sub('We&rsquo;d love to continue working with you') + gr(name)
      + p('Your current service agreement for <strong>' + site + '</strong> is due for renewal on <strong>' + (f.renewDate || '&mdash;') + '</strong>. We&rsquo;d love to continue working with you.')
      + dataTable([['Site', site],['Renewal Date', f.renewDate || '&mdash;'],['Schedule', f.schedule || '&mdash;'],['Monthly Fee', amount ? '&pound;' + amount + ' + VAT' : '&mdash;', true, true],['Contract Term','12 months from renewal date']])
      + p('Simply reply with <em>&ldquo;Confirmed&rdquo;</em> and we will keep everything running without interruption.')
      + checklist(['No paperwork required &mdash; a reply to this email is your confirmation','Same dedicated team, same schedule, same quality standard','Happy to discuss any changes to scope or frequency','12-month term from renewal date'])
      + blockquote('It has been a genuine pleasure working with you. We will continue working hard to earn your trust.')
      + cta('&#10003; Confirm Renewal', 'mailto:' + emailAddr + '?subject=Renewal Confirmed', '#7C3AED')
      + divider() + sm('To discuss changes please call ' + phone + ' or reply to this email.')
    );
  }
  // ── REFERRAL / INTRODUCTION FOLLOW-UP ────────────────────
  if (tmpl === 'Referral / Introduction Follow-Up') {
    var contactName  = f.contact_name  || 'there';
    var meetingDate  = f.meeting_date  || '';
    var location     = f.location      || '';
    var defaultBody = 'Great meeting you' + (meetingDate ? ' on ' + meetingDate : '') + (location ? ' at ' + location : '') + '.\n\n'
      + 'Thank you again for offering to share my details with the homeowners \u2014 I really appreciate it.\n\n'
      + 'If any of the buyers need help with move-in cleaning, after-builders cleaning, or regular home cleaning once they settle in, we would be very happy to assist.\n\n'
      + 'We\u2019re a local cleaning company based nearby and currently helping homeowners across South West London with reliable and flexible cleaning services.\n\n'
      + 'If helpful, I can also send over a short one-page introduction or flyer that your team can easily share with the buyers.\n\n'
      + 'Thanks again and nice to meet you.';
    var bodyRaw  = (f.body && f.body.trim().length > 0) ? f.body : defaultBody;
    var bodyText = bodyRaw
      .replace(/\{\{contact_name\}\}/g, contactName)
      .replace(/\{\{meeting_date\}\}/g,  meetingDate)
      .replace(/\{\{location\}\}/g,       location);
    var bodyHtml = bodyText.split(/\n\n+/).map(function(chunk) {
      return p(chunk.replace(/\n/g, '<br>'));
    }).join('');
    return wrap('Referral / Introduction Follow-Up', teal,
      h('Great meeting you.') + sub(meetingDate ? 'Following our meeting on ' + meetingDate : 'Thank you for the introduction') + gr(contactName)
      + bodyHtml
      + '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">We can help with</p>'
      + checklist([
          '<strong>Move-in &amp; move-out cleaning</strong> &mdash; thorough clean after key handover, before buyers move in',
          '<strong>End-of-tenancy cleaning</strong> &mdash; deep clean to deposit-return standard',
          '<strong>After-builders &amp; post-renovation cleaning</strong> &mdash; dust, debris, and builder residue',
          '<strong>Regular home cleaning</strong> &mdash; weekly or fortnightly across South West London',
          '<strong>Deep cleaning &amp; sparkle cleans</strong> &mdash; one-off intensive clean, any property type',
          '<strong>Office &amp; commercial cleaning</strong> &mdash; managed service with consistent teams',
          '<strong>School &amp; education cleaning</strong> &mdash; term-time and holiday programmes',
          '<strong>Medical, dental &amp; healthcare</strong> &mdash; clinical-grade sanitisation protocols',
          '<strong>Retail &amp; hospitality</strong> &mdash; after-hours for shops, restaurants, cafes, pubs',
          '<strong>Gym &amp; leisure facilities</strong> &mdash; high-touch sanitisation and daily maintenance',
          '<strong>Automotive &amp; car dealerships</strong> &mdash; showroom, workshop, and forecourt',
          '<strong>Warehouses &amp; industrial units</strong> &mdash; floor maintenance and welfare facilities',
          '<strong>Residential blocks &amp; communal areas</strong> &mdash; entrance halls, stairwells, shared spaces'
        ])
      + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#F0FDFA;border:1px solid #CCFBF1;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#0F766E;line-height:1.7">&#9432; We can also send over a branded one-page introduction your team can share directly with buyers. Just reply and we&rsquo;ll get it over to you.</td></tr></table>'
      + cta('&#9993; Get in Touch', 'mailto:' + emailAddr, teal)
      + divider() + sm(company + ' &mdash; London &amp; UK. Residential &amp; commercial cleaning. Fully insured.')
    );
  }
  // ── DEEP CLEAN QUOTE REPLY ────────────────────────────────
  if (tmpl === 'Deep Clean Quote Reply') {
    var isFixed    = (f.quote_type || 'provisional') === 'fixed';
    var clientName = f.name     || 'there';
    var property   = f.property || 'the property';
    var priceRaw   = (f.price   || '').trim();
    var priceStr   = priceRaw ? '&pound;' + priceRaw : 'TBC';
    var duration   = f.duration || 'TBC';
    var slots      = [f.avail1, f.avail2, f.avail3].filter(Boolean);
    var extras     = (f.extras  || '').trim();
    var qualQ      = (f.qual_q  || '').trim();
    var bandBg     = isFixed ? 'linear-gradient(135deg,' + navy + ',#122440)' : 'linear-gradient(135deg,#78350F,#92400E)';
    var priceLabel = isFixed ? 'Quoted Price' : 'Estimated Range';
    var priceSub   = isFixed ? 'all materials &amp; equipment included' : 'subject to site visit / photos';
    var priceFontSz = priceRaw.length > 7 ? '24px' : '34px';
    var priceBand = '<table cellpadding="0" cellspacing="0" width="100%" style="border-radius:12px;overflow:hidden;margin-bottom:24px"><tr>'
      + '<td align="center" style="background:' + bandBg + ';padding:22px 20px;border-right:1px solid rgba(255,255,255,0.08)">'
      + '<div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-bottom:6px">' + priceLabel + '</div>'
      + '<div style="font-family:Georgia,serif;font-size:' + priceFontSz + ';font-weight:700;color:#fff;letter-spacing:-1px">' + priceStr + '</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">' + priceSub + '</div>'
      + '</td>'
      + '<td align="center" style="background:' + bandBg + ';padding:22px 20px">'
      + '<div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-bottom:6px">Duration</div>'
      + '<div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#fff">' + duration + '</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">professional deep clean team</div>'
      + '</td></tr></table>';
    var visitNotice = !isFixed
      ? '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#1E40AF;line-height:1.7">'
        + '<strong>&#128247; To confirm a fixed price</strong> &mdash; we&rsquo;d welcome a quick site visit, or a few photos of the kitchen, bathrooms, and any areas of particular concern. This lets us give you an exact figure with confidence.</td></tr></table>'
      : '';
    var qualHtml = (!isFixed && qualQ)
      ? '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">A couple of quick questions</p>'
        + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#3D5A74;line-height:1.85">'
        + qualQ.replace(/\n/g, '<br>')
        + '<br><br><span style="font-size:12px;color:#6B8FA8">This simply helps us plan the safest products and approach for the clean.</span>'
        + '</td></tr></table>'
      : '';
    var slotsHtml = '';
    if (slots.length > 0) {
      var slotsLabel = isFixed ? 'Available dates' : 'Provisional availability';
      slotsHtml = '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">' + slotsLabel + '</p>'
        + '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ' + border + ';border-radius:10px;overflow:hidden;margin-bottom:20px">'
        + slots.map(function(s, i) {
            return '<tr' + (i < slots.length - 1 ? ' style="border-bottom:1px solid #F3F4F6"' : '') + '>'
              + '<td style="padding:12px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:' + charcoal + '">'
              + '&#128197; ' + s + '</td></tr>';
          }).join('')
        + '</table>';
    }
    var extrasHtml = extras
      ? '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#92400E;line-height:1.7"><strong>Additional notes:</strong> ' + extras + '</td></tr></table>'
      : '';
    var scopeHtml = isFixed
      ? '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">What\u2019s included</p>'
        + checklist([
            '<strong>Kitchen</strong> \u2014 oven &amp; hob, extractor hood &amp; filters, behind &amp; under appliances, inside cupboards &amp; drawers, fridge interior, tile grout, microwave, dishwasher filter, kettle descale',
            '<strong>Bathrooms</strong> \u2014 limescale from taps, showerheads &amp; screens, tile grout &amp; silicone, behind &amp; around toilet, shower tray/bath descale &amp; disinfect, inside cabinets, extraction fan covers, mirrors &amp; chrome',
            '<strong>Living areas</strong> \u2014 under &amp; behind furniture, skirting boards, light switches &amp; door frames, sofa &amp; cushion vacuuming, TV &amp; electronics, windows &amp; sills',
            '<strong>Bedrooms</strong> \u2014 under bed vacuuming, wardrobe interiors &amp; drawers, bed frames &amp; headboards, lampshades &amp; picture frames',
            '<strong>Whole house</strong> \u2014 internal windows &amp; tracks, skirting boards throughout, doors, frames &amp; handles, light fittings, under movable furniture, radiators, ceiling corners &amp; cobwebs',
          ])
      : '';
    var ctaLabel   = isFixed ? '&#128197; Confirm Your Booking' : '&#128247; Send Photos / Request Site Visit';
    var ctaSubject = isFixed ? 'Confirming Deep Clean Booking'  : 'Deep Clean \u2014 Photos / Site Visit Request';
    var closingP   = isFixed
      ? 'To confirm a date, simply reply to this email or call us directly. We\u2019ll send confirmation with arrival time and any final access details.'
      : 'Once we\u2019ve seen the property we can confirm a fixed price and get a date in the diary. We currently have availability within the next two weeks.';
    var closingChecklist = isFixed
      ? checklist([
          '<strong>All materials &amp; professional equipment included</strong> \u2014 nothing for you to provide',
          '<strong>Eco-conscious, low-odour products</strong> \u2014 safe for families and pets',
          '<strong>Fully insured team</strong> \u2014 &pound;10M public liability cover',
          '<strong>Satisfaction guaranteed</strong> \u2014 if anything is missed we\u2019ll return within 48 hours',
        ])
      : checklist([
          'No obligation \u2014 the site visit or photo review is completely free',
          '<strong>Eco-conscious, low-odour products</strong> \u2014 safe for families and pets',
          '<strong>Fully insured team</strong> \u2014 &pound;10M public liability cover',
          'Fixed price confirmed before any work begins \u2014 no surprises',
        ]);
    var heroH    = isFixed ? 'Your deep clean quote.'       : 'We can help \u2014 here\u2019s your estimate.';
    var heroSub  = (isFixed ? 'One-off deep clean \u00b7 ' : 'Provisional estimate \u00b7 ') + property;
    var openingP = isFixed
      ? 'Thank you for your enquiry. We\u2019ve reviewed the scope and are pleased to confirm we can carry out a full deep clean of <strong>' + property + '</strong> on a fixed-price basis.'
      : 'Thank you for getting in touch and for outlining the scope so clearly \u2014 it\u2019s really helpful to have that detail upfront. Yes, we\u2019d be very happy to help with a one-off deep clean for <strong>' + property + '</strong>.';
    var footerSm = isFixed
      ? 'All prices include materials and labour. Payment due on completion. Parking access required at the property.'
      : 'All prices include materials and labour. Final price confirmed after site visit or photo review. No work begins until you\u2019re happy with the fixed quote.';
    var dcBodyRaw = (f.body || '').trim();
    var dcBodyHtml = dcBodyRaw.length > 0
      ? dcBodyRaw.split(/\n{2,}/).map(function(chunk) { return p(chunk.replace(/\n/g, '<br>')); }).join('')
      : p(openingP);
    return wrap('Deep Clean Quote', teal,
      h(heroH) + sub(heroSub) + gr(clientName)
      + dcBodyHtml
      + priceBand
      + visitNotice
      + scopeHtml
      + qualHtml
      + slotsHtml
      + extrasHtml
      + p(closingP)
      + cta(ctaLabel, 'mailto:' + emailAddr + '?subject=' + encodeURIComponent(ctaSubject), teal)
      + divider()
      + closingChecklist
      + divider()
      + sm(footerSm)
    );
  }
  // ── COLD OUTREACH (Lead Intelligence OS) ─────────────────
  if (tmpl === 'Cold Outreach') {
    var bizName  = f.business_name || 'there';
    var sector   = f.sector   || '';
    var borough  = f.borough  || 'London';
    // Render AI-generated body — respect paragraph breaks
    var rawBody  = (f.cold_email || '').trim();
    var bodyHtml;
    if (rawBody.length > 0) {
      bodyHtml = rawBody
        .split(/\n{2,}/)
        .map(function(chunk) { return p(chunk.replace(/\n/g, '<br>')); })
        .join('');
    } else {
      bodyHtml = p('I wanted to reach out regarding managed commercial cleaning for <strong>' + bizName + '</strong>.')
        + p('We work with ' + (sector ? sector + ' businesses' : 'organisations') + ' across ' + borough + ' and would welcome the chance to have a brief conversation or arrange a no-obligation site visit.');
    }
    var sectorCreds = sector
      ? 'We currently work with ' + sector + ' clients across London — COSHH compliant, fully insured, and audit-ready.'
      : 'We work with offices, residential blocks, healthcare, automotive, and education clients across London.';
    return wrap('Cold Outreach', teal,
      h('Managed commercial cleaning — done properly.') + sub('AskMiro Cleaning Services \u00b7 ' + borough) + bodyHtml
      + divider()
      + checklist([
          '<strong>Consistent, site-trained teams</strong> \u2014 same people every visit, not rotating agency staff',
          '<strong>Managed quality checks</strong> \u2014 supervisor oversight and written inspection reports',
          '<strong>COSHH-compliant documentation</strong> \u2014 RAMS and safety data sheets as standard',
          '<strong>&pound;10M public liability</strong> \u2014 fully insured, certificates on request',
          '<strong>Fixed monthly pricing</strong> \u2014 no hidden costs, no surprise invoices',
        ])
      + sm(sectorCreds)
      + cta('&#128197; Book a Free Site Visit', 'mailto:' + emailAddr + '?subject=Site Visit Request \u2014 ' + bizName, teal)
      + divider()
      + sm('To stop receiving these emails please reply with \u201cUnsubscribe\u201d.')
    );
  }
  // ── GENERAL EMAIL ────────────────────────────────────────
  var rawBody = (f.body || '').trim();
  var bodyHtml = rawBody.length > 0
    ? rawBody.split(/\n{2,}/).map(function(chunk) {
        return p(chunk.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>'));
      }).join('')
    : p('Please write your message in the Message field.');
  return wrap(subject || 'Message', teal,
    gr(f.to_name || 'there') +
    bodyHtml +
    divider() +
    sm("If you have any questions, please don't hesitate to get in touch.")
  );
}
// ── EMAIL WRAPPERS ────────────────────────────────────────────
function buildPlainEmail(subject, message, settings) {
  var email = settings.emailFrom || 'info@askmiro.com', company = settings.company || 'AskMiro Cleaning Services';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="background:linear-gradient(135deg,#0F172A,#1E3A5F);border-radius:12px 12px 0 0;padding:22px 32px"><table width="100%"><tr><td><table><tr><td style="background:#0D9488;border-radius:7px;width:32px;height:32px;text-align:center;vertical-align:middle"><svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></td><td style="padding-left:9px;font-size:16px;font-weight:800;color:white">AskMiro</td></tr></table></td></tr></table></td></tr><tr><td style="background:#fff;padding:32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0"><p style="font-size:14px;color:#475569;line-height:1.75;white-space:pre-line">' + message.replace(/</g,'&lt;') + '</p><table style="margin-top:24px;padding-top:16px;border-top:2px solid #0D9488;width:100%"><tr><td style="padding-right:12px;vertical-align:top;width:48px"><div style="width:40px;height:40px;background:#0D9488;border-radius:7px;text-align:center;line-height:40px"><svg width="24" height="24" viewBox="0 0 32 32" fill="none" style="vertical-align:middle"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div></td><td style="vertical-align:top"><div style="font-weight:700;font-size:14px;color:#1F2937">Mike Kato</div><div style="font-size:12px;color:#0D9488;font-weight:600">Co-Founder, ' + company + '</div><div style="font-size:12px;color:#475569;margin-top:3px">📞 <a href="tel:07549354362" style="color:#475569;text-decoration:none">07549 354 362</a> &nbsp;|&nbsp; ✉ <a href="mailto:' + email + '" style="color:#475569;text-decoration:none">' + email + '</a></div></td></tr></table></td></tr><tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:12px 32px;text-align:center"><p style="font-size:11px;color:#94A3B8;margin:0">' + company + ' &nbsp;|&nbsp; A trading name of Miro Partners Ltd &nbsp;|&nbsp; London & UK</p></td></tr></table></td></tr></table></body></html>';
}
function emailWrapper(headerBg, headerContent, bodyContent, settings) {
  var company = settings.companyName || 'AskMiro Cleaning Services';
  var email   = settings.emailFrom   || 'info@askmiro.com';
  var year    = new Date().getFullYear();
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + company + '</title></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:\'Helvetica Neue\',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="background:' + headerBg + ';border-radius:12px 12px 0 0;padding:28px 36px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><table cellpadding="0" cellspacing="0"><tr><td style="background:#0F766E;border-radius:8px;padding:8px 10px"><span style="font-family:Arial,sans-serif;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">M</span></td><td style="padding-left:10px"><div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.3px">' + company + '</div><div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:1px">Professional Cleaning Services</div></td></tr></table></td><td align="right">' + headerContent + '</td></tr></table></td></tr><tr><td style="background:#ffffff;padding:36px 36px 28px">' + bodyContent + '</td></tr><tr><td style="background:#1F2937;border-radius:0 0 12px 12px;padding:20px 36px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-size:12px;color:rgba(255,255,255,0.5)">&copy; ' + year + ' ' + company + '</div><div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px"><a href="mailto:' + email + '" style="color:#5EEAD4;text-decoration:none">' + email + '</a> &nbsp;&bull;&nbsp; www.askmiro.com</div></td><td align="right"><div style="font-size:10px;color:rgba(255,255,255,0.3)">Sent via AskMiro Ops</div></td></tr></table></td></tr></table></td></tr></table></body></html>';
}
function buildInvoiceEmail(inv, settings) {
  var amount   = parseFloat(inv.amount || 0).toLocaleString('en-GB', { minimumFractionDigits:2, maximumFractionDigits:2 });
  var dueDate  = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : 'Upon receipt';
  var month = inv.month || '', invId = inv.id || '';
  var isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
  var hdr = '<div style="text-align:right"><div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px">Invoice</div><div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">' + invId + '</div><div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">' + month + '</div></div>';
  var bdy = '<p style="margin:0 0 6px;font-size:14px;color:#94A3B8;font-weight:500">Dear Client,</p><h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#1F2937;letter-spacing:-0.5px">Your invoice is ready for payment</h1><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td style="background:#F0FDF9;border:2px solid #0D9488;border-radius:10px;padding:20px 24px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0D9488;margin-bottom:4px">Amount Due</div><div style="font-size:40px;font-weight:900;color:#0F766E;letter-spacing:-2px;line-height:1">&pound;' + amount + '</div><div style="font-size:13px;color:#475569;margin-top:8px">' + (isOverdue ? '<span style="background:#FEF2F2;color:#DC2626;border-radius:4px;padding:2px 8px;font-weight:700;font-size:11px">&#9888; OVERDUE</span>' : '<span style="background:#ECFDF5;color:#059669;border-radius:4px;padding:2px 8px;font-weight:700;font-size:11px">&#9679; PAYMENT DUE</span>') + ' &nbsp; Due by <strong>' + dueDate + '</strong></div></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden"><tr style="background:#F8FAFC"><td style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:1px solid #E5E7EB">Invoice Details</td><td style="padding:10px 16px;border-bottom:1px solid #E5E7EB"></td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Invoice Number</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;text-align:right;font-family:monospace">' + invId + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Service Period</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;text-align:right">' + month + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Site</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;text-align:right">' + (inv.siteId || '&mdash;') + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569">Payment Due</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:' + (isOverdue ? '#DC2626' : '#059669') + ';text-align:right">' + dueDate + '</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td align="center" style="background:#0D9488;border-radius:8px;padding:14px 24px"><a href="mailto:' + (settings.emailFrom || 'info@askmiro.com') + '?subject=Payment%20for%20' + invId + '" style="font-size:15px;font-weight:700;color:#fff;text-decoration:none;display:block">&#10003; &nbsp; Confirm Payment or Query &rarr;</a></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 18px"><tr><td><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#D97706;margin-bottom:8px">&#9432; Payment Instructions</div><div style="font-size:13px;color:#92400E;line-height:1.7">Please make payment by bank transfer. Quote reference <strong>' + invId + '</strong> on your transfer.<br>For payment details or queries, reply to this email or contact us at <strong>' + (settings.emailFrom || 'info@askmiro.com') + '</strong></div></td></tr></table><p style="font-size:13px;color:#94A3B8;margin:0">Thank you for your business. We look forward to continuing to provide you with exceptional cleaning services.</p><p style="font-size:13px;color:#475569;margin:16px 0 0;font-weight:600">The AskMiro Team</p>';
  return emailWrapper('#1F2937', hdr, bdy, settings);
}
function buildQuoteEmail(q, settings) {
  var revenue = parseFloat(q.revenueMonthly || 0).toLocaleString('en-GB', { minimumFractionDigits:2, maximumFractionDigits:2 });
  var annual  = parseFloat(q.annualValue    || 0).toLocaleString('en-GB', { minimumFractionDigits:0, maximumFractionDigits:0 });
  var hrs = q.hoursPerWeek || '&mdash;';
  var hdr = '<div style="text-align:right"><div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px">Cleaning Proposal</div><div style="font-size:14px;font-weight:700;color:#5EEAD4;margin-top:3px">' + (q.id || '') + '</div></div>';
  var items = ['Professional cleaning to agreed specification','Fully trained, vetted and uniformed staff','All cleaning equipment and eco-friendly materials','Dedicated account manager (Mike Kato)','Regular quality audits and reporting','Flexible scheduling to suit your business'];
  var bdy = '<p style="margin:0 0 6px;font-size:14px;color:#94A3B8;font-weight:500">Dear ' + q.clientName + ',</p><h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1F2937;letter-spacing:-0.5px">Your Cleaning Proposal</h1><p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">Thank you for considering AskMiro Cleaning Services for <strong>' + (q.siteAddress || 'your premises') + '</strong>. We are delighted to present the following proposal.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td style="background:#0D9488;border-radius:10px;padding:20px 24px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.7);margin-bottom:4px">Monthly Service Fee</div><div style="font-size:40px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:1">&pound;' + revenue + '</div><div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px">&pound;' + annual + '/year &nbsp;&bull;&nbsp; ' + hrs + ' hrs/week</div></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden"><tr style="background:#F8FAFC"><td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:1px solid #E5E7EB">Proposal Summary</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6;width:50%">Site</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;border-bottom:1px solid #F3F4F6">' + (q.siteAddress || '&mdash;') + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Service Hours</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;border-bottom:1px solid #F3F4F6">' + hrs + ' hrs/week</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Monthly Fee</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0D9488;border-bottom:1px solid #F3F4F6">&pound;' + revenue + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569">Annual Value</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937">&pound;' + annual + '</td></tr></table><div style="margin-bottom:24px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;margin-bottom:12px">What\'s Included</div>' + items.map(function(item) { return '<div style="display:flex;align-items:center;margin-bottom:8px"><span style="background:#CCFBF1;color:#0D9488;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-right:10px">&#10003;</span><span style="font-size:13px;color:#475569">' + item + '</span></div>'; }).join('') + '</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr><td align="center" style="background:#0D9488;border-radius:8px;padding:14px 24px"><a href="mailto:' + (settings.emailFrom || 'info@askmiro.com') + '?subject=Re:%20Proposal%20' + (q.id || '') + '" style="font-size:15px;font-weight:700;color:#fff;text-decoration:none;display:block">Accept This Proposal &rarr;</a></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td align="center" style="border:2px solid #E5E7EB;border-radius:8px;padding:12px 24px"><a href="mailto:' + (settings.emailFrom || 'info@askmiro.com') + '?subject=Query:%20Proposal%20' + (q.id || '') + '" style="font-size:14px;font-weight:600;color:#475569;text-decoration:none;display:block">Have a question? Reply to this email</a></td></tr></table>' + (q.notes ? '<div style="background:#F8FAFC;border-left:3px solid #0D9488;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;font-size:13px;color:#475569;line-height:1.6"><strong>Notes:</strong> ' + q.notes + '</div>' : '') + '<p style="font-size:13px;color:#94A3B8;margin:0;line-height:1.6">This proposal is valid for 30 days. We look forward to the opportunity to work with you.</p><p style="font-size:13px;color:#475569;margin:16px 0 0;font-weight:600">Mike Kato<br><span style="font-weight:400;color:#94A3B8">AskMiro Cleaning Services &nbsp;&bull;&nbsp; ' + (settings.emailFrom || 'info@askmiro.com') + '</span></p>';
  return emailWrapper('#0D9488', hdr, bdy, settings);
}
// ══════════════════════════════════════════════════════════════
// WEBHOOKS
// ══════════════════════════════════════════════════════════════
function webhookLead(params) {
  try {
    const name  = (params.contactName || params.name  || '').trim();
    const email = (params.email || '').trim();
    if (!name || !email) return { ok: false, error: 'Missing required fields' };
    const id      = genId('LEAD');
    const segment = params.segment || mapSegment(params.serviceType || params.sector || '');
    const lead = {
      id,
      companyName:        (params.companyName || params.company || name).trim(),
      contactName:        name,
      email,
      phone:              (params.phone || '').trim(),
      segment,
      source:             params.source || 'Website',
      status:             'New',
      annualValue:        '',
      notes:              buildNotes(params),
      serviceType:        params.serviceType || params.sector || '',
      postcode:           (params.postcode || '').trim().toUpperCase(),
      frequency:          params.frequency || '',
      additionalServices: params.additionalServices || '',
      createdAt:          new Date().toISOString(),
      createdBy:          'WEBHOOK',
      updatedAt:          '',
      updatedBy:          ''
    };
    appendRow('Leads', lead);
    auditLog('WEBHOOK', 'CREATE', 'Lead', id, null, lead);

    // ── Run Intelligence Engine + create Draft Quote in OPS ───────────
    // Every website lead with a service type gets a priced draft quote
    // so it surfaces immediately in OPS Quotes as a priority request.
    var quoteId = null;
    try {
      var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
      ensureIntelligenceSheets(ss);
      var leadForIntel = normaliseLead({
        name:              lead.contactName,
        email:             lead.email,
        phone:             lead.phone,
        postcode:          lead.postcode,
        facilityType:      params.serviceType || params.sector || params.facilityType || 'other',
        cleaningFrequency: params.frequency   || params.cleaningFrequency || 'weekly',
        requirements:      (params.message    || params.requirements || lead.notes || '').trim(),
        premisesSize:      params.premisesSize || params.areaMq || '',
        premisesSizeUnit:  params.premisesSizeUnit || 'm2',
        source:            'web_form'
      });
      var intel = runIntelligenceEngine(ss, leadForIntel);
      intel     = handleOneOffClean(leadForIntel, intel);
      quoteId   = createDraftQuote(ss, leadForIntel, intel, id);
      Logger.log('webhookLead: draft quote created → ' + quoteId + ' for lead ' + id);
    } catch(qErr) {
      Logger.log('webhookLead: quote creation failed (non-blocking) — ' + qErr.message);
    }

    try {
      const settings = getSettingsObj();
      GmailApp.sendEmail(settings.emailFrom || 'info@askmiro.com',
        '🔔 New Website Lead: ' + lead.companyName, '', {
          htmlBody: buildLeadNotificationEmail(lead, params, settings),
          name:     'AskMiro Ops',
          replyTo:  email
        });
    } catch(emailErr) { Logger.log('Notification email failed: ' + emailErr.message); }
    try {
      sendInboxAutoReply(email, lead.contactName, 'Your cleaning enquiry');
    } catch(arErr) { Logger.log('Auto-reply failed: ' + arErr.message); }

    // ── Mirror lead to AskMiro OS — hardcoded fallback URL so it always fires ──
    try {
      const settings = getSettingsObj();
      const osUrl = settings.OS_WEBHOOK_URL || 'https://askmiro-api-production.up.railway.app';
      UrlFetchApp.fetchAll([{
        url: osUrl + '/api/webhook/lead',
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          name:         lead.contactName,
          email:        lead.email,
          phone:        lead.phone,
          business:     lead.companyName,
          address:      lead.postcode,
          message:      lead.notes,
          source:       'website',
          sector:       lead.serviceType,
          frequency:    params.frequency || '',
          premisesSize: params.premisesSize || '',
          gas_lead_id:  lead.id,
          gas_quote_id: quoteId || ''
        }),
        muteHttpExceptions: true
      }]);
    } catch(osErr) { Logger.log('OS mirror failed (non-blocking): ' + osErr.message); }

    return { ok: true, id, quoteId: quoteId, message: 'Lead created successfully' };
  } catch(err) { logError(err); return { ok: false, error: err.message }; }
}

// ── Client upload webhook — called by netlify/functions/client-upload.js ──
function webhookClientUpload(params) {
  try {
    const refId       = params.refId       || '';
    const clientName  = params.clientName  || '';
    const clientEmail = params.clientEmail || '';
    const fileCount   = params.fileCount   || '0';
    const fileNames   = params.fileNames   || '';
    const note        = params.note        || '';

    // Append a note to the matching lead if refId provided
    if (refId) {
      const sh    = getSheet().getSheetByName('Leads');
      const data  = sh.getDataRange().getValues();
      const hdr   = data[0];
      const idCol = hdr.indexOf('id');
      const ntCol = hdr.indexOf('notes');
      const utCol = hdr.indexOf('updatedAt');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]).trim() === refId.trim()) {
          const existing  = ntCol >= 0 ? String(data[i][ntCol]) : '';
          const dateStr   = new Date().toLocaleDateString('en-GB');
          const fileLinks = params.fileLinks || '';
          // Build one line per file with URL if available
          // Use [FILE] prefix (ASCII-safe, no emoji encoding issues)
          var fileEntries;
          if (fileLinks) {
            fileEntries = fileLinks.split('|||').map(function(entry) {
              var parts = entry.split('::');
              return parts.length === 2
                ? '[FILE] ' + dateStr + ': ' + parts[0] + ' -> ' + parts[1]
                : '[FILE] ' + dateStr + ': ' + entry;
            }).join('\n');
          } else {
            fileEntries = '[FILE] ' + dateStr + ': ' + fileCount + ' file(s) - ' + fileNames;
          }
          var addition = fileEntries + (note ? '\n   Note: ' + note : '');
          if (ntCol >= 0) sh.getRange(i + 1, ntCol + 1).setValue(existing ? existing + '\n' + addition : addition);
          if (utCol >= 0) sh.getRange(i + 1, utCol + 1).setValue(new Date().toISOString());
          invalidateCache('Leads');
          break;
        }
      }
    }

    // Also log to AuditLog
    auditLog('WEBHOOK', 'UPLOAD', 'Lead', refId || 'unknown', null, {
      clientName, clientEmail, fileCount, fileNames, note
    });

    Logger.log('✓ webhookClientUpload: ' + fileCount + ' file(s) from ' + clientName + ' | ref: ' + refId);
    return { ok: true };
  } catch(err) { logError(err); return { ok: false, error: err.message }; }
}

function handleWebQuoteSubmission(params) {
  try {
    const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
    ensureIntelligenceSheets(ss);
    const lead    = normaliseLead(params);
    const leadId  = storeWebLead(ss, lead);
    let   intel   = runIntelligenceEngine(ss, lead);
    intel         = handleOneOffClean(lead, intel);
    const quoteId = createDraftQuote(ss, lead, intel, leadId);
    notifyOwnerNewWebLead(lead, leadId, quoteId, getSettingsObj());
    return { ok: true, leadId, quoteId };
  } catch(e) { Logger.log('handleWebQuoteSubmission ERROR: ' + e.message); logError(e); return { ok: false, error: e.message }; }
}
// ══════════════════════════════════════════════════════════════
// INTELLIGENCE ENGINE
// ══════════════════════════════════════════════════════════════
function runIntelligenceEngine(ss, lead) {
  const settings   = loadSettings(ss);
  const benchmarks = loadBenchmarks(ss);
  const bm         = getBenchmarkForFacility(benchmarks, lead.facilityType);
  let areaMq = lead.areaMq > 0 ? lead.areaMq : (bm.typicalM2 || 150);
  const minsPerM2       = bm.minsPerM2 || settings.defaultMinsPerM2 || 0.5;
  const intensity       = resolveIntensity(lead.requirements);
  const intensityMult   = { low: 0.85, normal: 1.0, high: 1.20 }[intensity] || 1.0;
  const hoursPerVisit   = Math.max(Math.ceil((areaMq * minsPerM2 * intensityMult / 60) * 4) / 4, settings.minHoursPerVisit || 2);
  const visitsPerWeek   = resolveFrequency(lead.cleaningFrequency);
  const hoursPerWeek    = +(hoursPerVisit * visitsPerWeek).toFixed(2);
  const hoursPerMonth   = +(hoursPerWeek * 4.333).toFixed(2);
  const llwRate            = settings.llwRate    || CFG.LLW_RATE;
  const oncostPct          = settings.oncostPct  || CFG.ONCOST_PCT;
  const labourCostPerMonth = +(hoursPerMonth * llwRate * (1 + oncostPct)).toFixed(2);
  const suppliesPerMonth   = Math.max(+(areaMq * (bm.suppliesPerM2PerMonth || settings.defaultSuppliesPerM2 || 0.08)).toFixed(2), settings.minSuppliesPerMonth || 15);
  const travelAllowance    = resolveTravelAllowance(lead.postcode, settings);
  const directCostPerMonth = +(labourCostPerMonth + suppliesPerMonth + travelAllowance).toFixed(2);
  const scenarios = {
    aggressive: calcScenario(directCostPerMonth, 0.19, llwRate, hoursPerMonth, settings),
    balanced:   calcScenario(directCostPerMonth, 0.25, llwRate, hoursPerMonth, settings),
    protected:  calcScenario(directCostPerMonth, 0.30, llwRate, hoursPerMonth, settings)
  };
  const risks = assessRisks({ areaMq, hoursPerWeek, visitsPerWeek, suppliesPerMonth, directCostPerMonth, scenarios, lead, settings, bm, travelAllowance, llwRate, hoursPerMonth });
  const sensitivity = {
    wage5pct:  calcScenario(labourCostPerMonth * 1.05 + suppliesPerMonth + travelAllowance, 0.25, llwRate * 1.05, hoursPerMonth, settings),
    wage10pct: calcScenario(labourCostPerMonth * 1.10 + suppliesPerMonth + travelAllowance, 0.25, llwRate * 1.10, hoursPerMonth, settings)
  };
  return { areaMq, intensity, hoursPerVisit, visitsPerWeek, hoursPerWeek, hoursPerMonth, llwRate, labourCostPerMonth, suppliesPerMonth, travelAllowance, directCostPerMonth, scenarios, risks, riskCount: risks.filter(r => r.severity === 'high').length, sensitivity, generatedAt: new Date().toISOString(), dataQuality: lead.areaMq > 0 ? 'actual' : 'estimated' };
}
function calcScenario(directCost, marginPct, llwRate, hoursPerMonth, settings) {
  const safePct         = Math.max(marginPct, settings.absoluteMinMarginPct || 0.12);
  const revenuePerMonth = +(directCost / (1 - safePct)).toFixed(2);
  const profitPerMonth  = +(revenuePerMonth - directCost).toFixed(2);
  return {
    marginPct:       +(safePct * 100).toFixed(1),
    effectiveMargin: +((profitPerMonth / revenuePerMonth) * 100).toFixed(1),
    revenuePerMonth,
    revenuePerWeek:  +(revenuePerMonth / 4.333).toFixed(2),
    profitPerMonth,
    hourlyRate:      hoursPerMonth > 0 ? +(revenuePerMonth / hoursPerMonth).toFixed(2) : 0
  };
}
function assessRisks(ctx) {
  const risks = [];
  const { areaMq, hoursPerWeek, visitsPerWeek, suppliesPerMonth, directCostPerMonth, scenarios, lead, settings, bm, travelAllowance, llwRate, hoursPerMonth } = ctx;
  const req = (lead.requirements || '').toLowerCase();
  if ((req.includes('deep') || req.includes('intensive')) && visitsPerWeek < 2)
    risks.push({ code:'DEEP_CLEAN_FREQ_MISMATCH', severity:'high', message:'Deep clean requested but frequency is low — confirm if one-off or ongoing', action:'Clarify scope before pricing' });
  const travelPct = travelAllowance / directCostPerMonth;
  if (travelPct > 0.10)
    risks.push({ code:'TRAVEL_HIGH', severity:'medium', message:'Travel allowance is ' + (travelPct*100).toFixed(0) + '% of direct cost', action:'Verify site location and consider travel surcharge' });
  if (scenarios.aggressive.hourlyRate < llwRate * 1.05 * (1 + (settings.oncostPct || CFG.ONCOST_PCT)) * 1.10)
    risks.push({ code:'WAGE_SENSITIVITY', severity:'high', message:'Aggressive scenario margin erodes below minimum with 5% wage rise', action:'Use Balanced or Protected scenario for this contract' });
  if (suppliesPerMonth < (settings.minSuppliesPerMonth || 15))
    risks.push({ code:'SUPPLIES_BELOW_MIN', severity:'medium', message:'Supplies estimate £' + suppliesPerMonth.toFixed(2) + ' is below £' + (settings.minSuppliesPerMonth || 15) + ' minimum', action:'Apply minimum supplies floor before quoting' });
  if (hoursPerWeek < 4)
    risks.push({ code:'SMALL_JOB', severity:'low', message:'Job is small (' + hoursPerWeek + ' hrs/week) — minimum charge may apply', action:'Confirm minimum contract value with client' });
  if (!lead.areaMq || lead.areaMq <= 0)
    risks.push({ code:'AREA_ESTIMATED', severity:'low', message:'Premises size not provided — hours estimated from facility type benchmark', action:'Request actual m² before finalising quote' });
  if (lead.cleaningFrequency === 'one-off' || lead.cleaningFrequency === 'once')
    risks.push({ code:'ONE_OFF_CLEAN', severity:'medium', message:'One-off clean — no recurring revenue. Price at Protected scenario minimum.', action:'Consider one-off premium of 10-15% and no contract discount' });
  return risks;
}
function resolveFrequency(freq) {
  const map = { 'daily':5,'5x':5,'5x week':5,'five times':5,'3x':3,'3x week':3,'three times':3,'twice':2,'2x':2,'2x week':2,'weekly':1,'once a week':1,'fortnightly':0.5,'every two weeks':0.5,'monthly':0.23,'one-off':1,'once':1,'other':1 };
  return map[(freq || 'weekly').toLowerCase().trim()] || 1;
}
function resolveIntensity(requirements) {
  const req = (requirements || '').toLowerCase();
  const hi  = ['deep clean','intensive','medical grade','clinical','sanitise','sanitize','disinfect','heavy duty','grout','oven','kitchen','post-construction','builders clean'];
  const lo  = ['light','minimal','tidy','quick','basic'];
  if (hi.some(w => req.includes(w))) return 'high';
  if (lo.some(w => req.includes(w))) return 'low';
  return 'normal';
}
function resolveTravelAllowance(postcode, settings) {
  if (!postcode) return settings.travelLondonInner || 20;
  const pc = postcode.replace(/\s/g, '').toUpperCase();
  if (/^(EC|WC|E1W|SE1|SW1|W1|WC2|N1|NW1|NW3|SE11)/i.test(pc)) return settings.travelLondonInner || 20;
  if (/^(SW|SE|N|NW|E|W|EN|HA|TW|KT|SM|CR|BR|DA|IG|RM|UB|SL|WD)/i.test(pc)) return settings.travelLondonOuter || 35;
  return settings.travelOutOfLondon || 55;
}
function handleOneOffClean(lead, intel) {
  if (lead.cleaningFrequency === 'one-off' || lead.cleaningFrequency === 'once') {
    ['aggressive','balanced','protected'].forEach(function(k) {
      intel.scenarios[k].revenuePerMonth = +(intel.scenarios[k].revenuePerMonth * 1.12).toFixed(2);
      intel.scenarios[k].revenuePerWeek  = +(intel.scenarios[k].revenuePerWeek  * 1.12).toFixed(2);
    });
    intel.oneOffPremiumApplied = true;
  }
  return intel;
}
function normaliseLead(payload) {
  let areaMq = parseFloat(payload.premisesSize) || 0;
  const unit = (payload.premisesSizeUnit || '').toLowerCase();
  if (unit === 'sqft' || unit === 'sq ft' || unit === 'ft') areaMq = +(areaMq * CFG.SQ_FT_TO_M2).toFixed(1);
  return {
    name:              (payload.name              || '').trim(),
    email:             (payload.email             || '').trim().toLowerCase(),
    phone:             (payload.phone             || '').trim(),
    postcode:          (payload.postcode          || '').trim().toUpperCase(),
    facilityType:      (payload.facilityType      || 'other').toLowerCase().trim(),
    cleaningFrequency: (payload.cleaningFrequency || 'weekly').toLowerCase().trim(),
    requirements:      (payload.requirements      || '').trim(),
    areaMq,
    premisesSizeRaw:   payload.premisesSize       || '',
    premisesSizeUnit:  unit                       || 'm2',
    source:            payload.source             || 'web_form',
    submittedAt:       new Date().toISOString()
  };
}
function storeWebLead(ss, lead) {
  const id  = genId('LEAD');
  const row = { id, companyName: lead.name, contactName: lead.name, email: lead.email, phone: lead.phone, segment: mapSegment(lead.facilityType), source: 'Website', status: 'New', notes: buildNotes({ sector: lead.facilityType, frequency: lead.cleaningFrequency, postcode: lead.postcode, areaMq: lead.areaMq > 0 ? lead.areaMq + 'm\u00B2' : '', message: lead.requirements }), createdAt: lead.submittedAt, createdBy: 'WEBHOOK', updatedAt: '', updatedBy: '' };
  appendRow(SHEET_LEADS, row);
  auditLog('WEBHOOK', 'CREATE', 'Lead', id, null, row);
  return id;
}
function createDraftQuote(ss, lead, intel, leadId) {
  const id  = genId('QUOTE');
  const now = new Date().toISOString();
  const riskSummary = intel.risks.map(r => '[' + r.severity.toUpperCase() + '] ' + r.code + ': ' + r.message).join(' | ');
  const row = { id, leadId, source:'web_form', clientName:lead.name, email:lead.email, phone:lead.phone, postcode:lead.postcode, siteAddress:lead.postcode, facilityType:lead.facilityType, segment:mapSegment(lead.facilityType), hoursPerWeek:intel.hoursPerWeek, status:'Draft', version:1, createdAt:now, createdBy:'INTEL', updatedAt:now, updatedBy:'INTEL', intel_dataQuality:intel.dataQuality, intel_hoursPerWeek:intel.hoursPerWeek, intel_visitsPerWeek:intel.visitsPerWeek, intel_hoursPerMonth:intel.hoursPerMonth, intel_suppliesPM:intel.suppliesPerMonth, intel_directCostPM:intel.directCostPerMonth, intel_aggressivePM:intel.scenarios.aggressive.revenuePerMonth, intel_aggressiveWeekly:intel.scenarios.aggressive.revenuePerWeek, intel_aggressiveHourly:intel.scenarios.aggressive.hourlyRate, intel_balancedPM:intel.scenarios.balanced.revenuePerMonth, intel_balancedWeekly:intel.scenarios.balanced.revenuePerWeek, intel_balancedHourly:intel.scenarios.balanced.hourlyRate, intel_protectedPM:intel.scenarios.protected.revenuePerMonth, intel_protectedWeekly:intel.scenarios.protected.revenuePerWeek, intel_protectedHourly:intel.scenarios.protected.hourlyRate, intel_sens5PM:intel.sensitivity.wage5pct.revenuePerMonth, intel_sens5Weekly:intel.sensitivity.wage5pct.revenuePerWeek, intel_sens5Hourly:intel.sensitivity.wage5pct.hourlyRate, intel_sens10PM:intel.sensitivity.wage10pct.revenuePerMonth, intel_sens10Weekly:intel.sensitivity.wage10pct.revenuePerWeek, intel_sens10Hourly:intel.sensitivity.wage10pct.hourlyRate, intel_riskCount:intel.riskCount, intel_riskFlags:riskSummary, chosenScenario:'' };
  appendRow(SHEET_QUOTES, row);
  auditLog('INTEL', 'CREATE', 'Quote', id, null, { source:'web_form', leadId });
  return id;
}