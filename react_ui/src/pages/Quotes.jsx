import {useState,useEffect,useMemo,useCallback,useRef} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {fetchQuoteIntelligence,fetchCleanerMatch,fetchFeasibility} from '../api'
import {gasClient,quoteFormToGas} from '../gasClient'

const fmtCur=v=>'£'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtPct=v=>(v||0).toFixed(1)+'%'
const SEGMENTS=['Office','Retail','Medical','Educational','Residential','Industrial','Hospitality','Other']
const STATUS_COLORS={draft:'#f59e0b',sent:'#3b82f6',won:'#10b981',lost:'#ef4444',expired:'#6b7280'}
const _e=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

function buildEmailHtml(d){
  const F="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
  const lineRows=d.items.map((li,i)=>{const bg=i%2===0?'#FFFFFF':'#F9FAFB';return'<tr style="background:'+bg+'"><td style="font-family:'+F+';font-size:13px;color:#4B5563;padding:12px 18px;border-bottom:1px solid #F3F4F6">'+_e(li.description)+'</td><td style="font-family:'+F+';font-size:13px;color:#111827;font-weight:500;padding:12px 18px;text-align:right;border-bottom:1px solid #F3F4F6">£'+li.amount.toFixed(2)+'</td></tr>'}).join('')
  const scopeRows=d.scopeItems.map((s,i)=>{const bg=i%2===0?'#FFFFFF':'#F9FAFB';return'<tr style="background:'+bg+'"><td style="width:44px;padding:13px 0 13px 16px;vertical-align:top;border-bottom:1px solid #F3F4F6"><div style="width:22px;height:22px;background:#F0FDFA;border:1.5px solid #CCFBF1;border-radius:50%;text-align:center;line-height:19px;font-size:12px;color:#0D9488;font-weight:700">✓</div></td><td style="padding:13px 18px 13px 10px;font-family:'+F+';font-size:14px;color:#1F2937;line-height:1.6;border-bottom:1px solid #F3F4F6">'+_e(s)+'</td></tr>'}).join('')
  return'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><title>AskMiro Cleaning Services</title></head><body style="margin:0;padding:0;background:#F1F5F9"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'
    +'<tr><td style="height:4px;background:linear-gradient(90deg,#0D9488,#14B8A6);border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>'
    +'<tr><td style="background:#0A1628;padding:26px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:14px;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="40" height="40" alt="AskMiro" style="display:block;border:0;border-radius:8px" border="0"></td><td style="vertical-align:middle"><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div><div style="font-family:'+F+';font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div></td></tr></table></td><td align="right" style="vertical-align:middle"><div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px"><span style="font-family:'+F+';font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.6px">Booking Confirmation</span></div></td></tr></table></td></tr>'
    +'<tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">'
    +'<p style="margin:0 0 22px;font-family:'+F+';font-size:16px;font-weight:600;color:#111827">Hi '+_e(d.firstName)+',</p>'
    +'<p style="margin:0 0 6px;font-family:'+F+';font-size:11px;font-weight:700;color:#0D9488;letter-spacing:1.5px;text-transform:uppercase">Your booking is confirmed</p>'
    +'<h1 style="margin:0 0 6px;font-family:'+F+';font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.8px;line-height:1.15">'+_e(d.serviceType)+'</h1>'
    +'<p style="margin:0 0 28px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">Thank you for choosing AskMiro. Everything is locked in for your '+_e(d.serviceType.toLowerCase())+'. Below you\'ll find the full details, scope of work, and your quote breakdown.</p>'
    +(d.jobDateShort?'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-radius:12px;overflow:hidden;background:#0A1628"><tr><td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Date</div><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">'+_e(d.jobDateShort)+'</div><div style="font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">'+_e(d.jobDay)+'</div></td><td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Time</div><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">'+_e(d.timeFmt)+'</div><div style="font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">Start time</div></td><td align="center" style="padding:22px 18px"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Total</div><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">£'+Math.round(d.gross)+'</div><div style="font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">All-inclusive</div></td></tr></table>':'')
    +(d.site?'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px"><tr><td style="background:#F0FDFA;border:1px solid #CCFBF1;border-radius:10px;padding:16px 20px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">🏠</td><td style="font-family:'+F+';font-size:13.5px;color:#0F766E;line-height:1.7"><strong>'+_e(d.site)+'</strong>'+(d.propDetails?'<br>'+_e(d.propDetails):'')+'</td></tr></table></td></tr></table>':'')
    +'<p style="margin:24px 0 12px;font-family:'+F+';font-size:11px;font-weight:700;color:#111827;letter-spacing:0.8px;text-transform:uppercase">Quote Breakdown</p>'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">'+lineRows+'<tr style="background:#111827"><td style="font-family:'+F+';font-size:14px;font-weight:700;color:#FFFFFF;padding:16px 18px">Total</td><td style="font-family:'+F+';font-size:22px;font-weight:800;color:#FFFFFF;padding:16px 18px;text-align:right;letter-spacing:-0.5px">£'+d.gross.toFixed(2)+'</td></tr></table>'
    +(scopeRows?'<p style="margin:24px 0 12px;font-family:'+F+';font-size:11px;font-weight:700;color:#111827;letter-spacing:0.8px;text-transform:uppercase">What\'s included</p><table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">'+scopeRows+'</table>':'')
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px"><tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px 20px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">💳</td><td style="font-family:'+F+';font-size:13.5px;color:#92400E;line-height:1.7"><strong>No upfront payment required.</strong> You can settle the £'+d.gross.toFixed(2)+' once the job is completed and you\'re happy with the standard. A full invoice and receipt will be provided on the day.</td></tr></table></td></tr></table>'
    +(d.paymentLink?'<table cellpadding="0" cellspacing="0" style="margin:28px 0" width="100%"><tr><td align="center"><table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#0D9488"><a href="'+_e(d.paymentLink)+'" style="display:block;padding:15px 36px;font-family:'+F+';font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;white-space:nowrap">Pay £'+d.gross.toFixed(2)+' — Secure Payment</a></td><td width="12">&nbsp;</td><td style="border-radius:8px;border:1.5px solid #E5E7EB"><a href="tel:02080730621" style="display:block;padding:14px 22px;font-family:'+F+';font-size:13px;font-weight:600;color:#1F2937;text-decoration:none;white-space:nowrap">☎ 020 8073 0621</a></td></tr></table><p style="margin:10px 0 0;font-family:'+F+';font-size:11px;color:#94A3B8">Payment is optional before the job. You can also pay on the day.</p></td></tr></table>':'')
    +'<p style="margin:0 0 18px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">If anything changes or you have any questions at all, just reply to this email or give me a call.</p>'
    +'<p style="margin:0 0 18px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">Looking forward to getting this done for you.</p>'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:40px"><tr><td style="padding-top:28px;border-top:1px solid #E5E7EB"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="vertical-align:middle;padding-right:14px;width:34px"><img src="https://www.askmiro.com/favicon-32x32.png" width="30" height="30" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td><td style="vertical-align:middle"><div style="font-family:'+F+';font-size:15px;font-weight:700;color:#111827;line-height:1.2">Mike Kato</div><div style="font-family:'+F+';font-size:12px;color:#0D9488;font-weight:600;margin-top:2px">Co-founder — AskMiro Cleaning Services</div></td></tr></table><table cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td style="padding-right:22px"><a href="tel:02080730621" style="font-family:'+F+';font-size:12px;color:#4B5563;text-decoration:none"><span style="color:#0D9488;margin-right:4px">☎</span>020 8073 0621</a></td><td style="padding-right:22px"><a href="mailto:info@askmiro.com" style="font-family:'+F+';font-size:12px;color:#4B5563;text-decoration:none"><span style="color:#0D9488;margin-right:4px">✉</span>info@askmiro.com</a></td><td><a href="https://www.askmiro.com" style="font-family:'+F+';font-size:12px;color:#0D9488;font-weight:600;text-decoration:none">www.askmiro.com</a></td></tr></table><table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px"><tr><td style="padding:10px 16px;background:#F0FDFA;border:1px solid #CCFBF1;border-radius:8px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:18px;font-family:'+F+';font-size:11px;color:#0D9488;font-weight:600">✓ Fully Insured</td><td style="padding-right:18px;font-family:'+F+';font-size:11px;color:#0D9488;font-weight:600">✓ COSHH Compliant</td><td style="padding-right:18px;font-family:'+F+';font-size:11px;color:#0D9488;font-weight:600">✓ ISO Standards</td><td style="font-family:'+F+';font-size:11px;color:#0D9488;font-weight:600">✓ London &amp; UK</td></tr></table></td></tr></table></td></tr></table></td></tr>'
    +'<tr><td style="background:#111827;border-radius:0 0 12px 12px;padding:22px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:'+F+';font-size:13px;font-weight:700;color:rgba(255,255,255,0.75)">AskMiro Cleaning Services</div><div style="font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.28);margin-top:3px">A trading name of Miro Partners Ltd • London &amp; UK</div></td><td align="right" style="vertical-align:top"><a href="https://www.askmiro.com" style="font-family:'+F+';font-size:12px;color:#14B8A6;text-decoration:none;font-weight:700">www.askmiro.com</a></td></tr><tr><td colspan="2" style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)"><p style="font-family:'+F+';font-size:10px;color:rgba(255,255,255,0.18);margin:14px 0 0;line-height:1.7">Sent by Mike Kato on behalf of AskMiro Cleaning Services. Reply to: info@askmiro.com.<br>We will never share your details with third parties.</p></td></tr></table></td></tr>'
    +'</table></td></tr></table></body></html>'
}

// ── LIFECYCLE EMAIL: JOB COMPLETION ──────────────────────────
function buildCompletionEmailHtml(d){
  const F="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
  const scopeDone=d.scopeItems.map((s,i)=>{const bg=i%2===0?'#FFFFFF':'#F9FAFB';return'<tr style="background:'+bg+'"><td style="width:44px;padding:12px 0 12px 16px;vertical-align:top;border-bottom:1px solid #F3F4F6"><div style="width:22px;height:22px;background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:50%;text-align:center;line-height:19px;font-size:12px;color:#166534;font-weight:700">✓</div></td><td style="padding:12px 18px 12px 10px;font-family:'+F+';font-size:14px;color:#1F2937;line-height:1.6;border-bottom:1px solid #F3F4F6;text-decoration:line-through;text-decoration-color:#BBF7D0">'+_e(s)+'</td></tr>'}).join('')
  return'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Job Complete — AskMiro</title></head><body style="margin:0;padding:0;background:#F1F5F9"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'
    +'<tr><td style="height:4px;background:linear-gradient(90deg,#0D9488,#14B8A6);border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>'
    +'<tr><td style="background:#0A1628;padding:26px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:14px;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="40" height="40" alt="AskMiro" style="display:block;border:0;border-radius:8px" border="0"></td><td style="vertical-align:middle"><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div><div style="font-family:'+F+';font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div></td></tr></table></td><td align="right" style="vertical-align:middle"><div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px"><span style="font-family:'+F+';font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.6px">Job Complete</span></div></td></tr></table></td></tr>'
    +'<tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px"><tr><td style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:18px 22px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:32px;vertical-align:top;padding-right:14px;font-size:22px;line-height:1">✔</td><td><div style="font-family:'+F+';font-size:15px;font-weight:700;color:#166534;margin-bottom:4px">Your '+_e(d.serviceType.toLowerCase())+' is complete</div><div style="font-family:'+F+';font-size:13px;color:#166534;opacity:0.8">'+_e(d.site||'Your property')+'</div></td></tr></table></td></tr></table>'
    +'<p style="margin:0 0 22px;font-family:'+F+';font-size:16px;font-weight:600;color:#111827">Hi '+_e(d.firstName)+',</p>'
    +'<p style="margin:0 0 20px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">Thank you for trusting AskMiro with your cleaning. Our team has completed all work at your property and everything has been left to the highest standard.</p>'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-radius:12px;overflow:hidden;background:#0A1628"><tr><td align="center" style="padding:20px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Service</div><div style="font-family:'+F+';font-size:15px;font-weight:700;color:#FFFFFF">'+_e(d.serviceType)+'</div></td><td align="center" style="padding:20px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Date</div><div style="font-family:'+F+';font-size:15px;font-weight:700;color:#FFFFFF">'+_e(d.jobDateShort||'Today')+'</div></td><td align="center" style="padding:20px 18px"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Total</div><div style="font-family:'+F+';font-size:15px;font-weight:700;color:#FFFFFF">£'+Math.round(d.gross)+'</div></td></tr></table>'
    +(scopeDone?'<p style="margin:0 0 10px;font-family:'+F+';font-size:11px;font-weight:700;color:#0D9488;letter-spacing:1.5px;text-transform:uppercase">Work Completed</p><table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">'+scopeDone+'</table>':'')
    +(d.paymentLink?'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px"><tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:18px 22px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">💳</td><td><div style="font-family:'+F+';font-size:14px;font-weight:600;color:#92400E;margin-bottom:4px">Payment Outstanding</div><div style="font-family:'+F+';font-size:13px;color:#92400E;opacity:0.8;margin-bottom:12px">Please complete your payment of £'+d.gross.toFixed(2)+' at your convenience.</div><a href="'+_e(d.paymentLink)+'" style="display:inline-block;background:#0D9488;color:#FFFFFF;font-family:'+F+';font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;padding:10px 28px">Pay Now →</a></td></tr></table></td></tr></table>':'')
    +'<p style="margin:0 0 20px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">If you have any feedback or would like to book another service, don\'t hesitate to get in touch!</p>'
    +'<table cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tr><td style="padding-right:10px"><a href="https://www.askmiro.com/contact" style="display:inline-block;background:#0A1628;color:#FFFFFF;font-family:'+F+';font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;padding:12px 28px">Book Again</a></td><td><a href="https://www.askmiro.com" style="display:inline-block;background:transparent;color:#0A1628;font-family:'+F+';font-size:13px;font-weight:600;text-decoration:none;border:1px solid #E5E7EB;border-radius:8px;padding:11px 24px">Leave a Review</a></td></tr></table>'
    +'</td></tr>'
    +'<tr><td style="background:#0A1628;padding:24px 36px;border-radius:0 0 12px 12px"><p style="margin:0 0 6px;font-family:'+F+';font-size:13px;font-weight:600;color:rgba(255,255,255,0.45)">AskMiro Professional Cleaning</p><p style="margin:0;font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.25)">London, United Kingdom · Fully Insured · DBS Checked</p></td></tr></table></td></tr></table></body></html>'
}

// ── LIFECYCLE EMAIL: PAYMENT RECEIVED ───────────────────────
function buildPaymentEmailHtml(d){
  const F="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
  const payDate=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
  return'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Payment Received — AskMiro</title></head><body style="margin:0;padding:0;background:#F1F5F9"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'
    +'<tr><td style="height:4px;background:linear-gradient(90deg,#0D9488,#14B8A6);border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>'
    +'<tr><td style="background:#0A1628;padding:26px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:14px;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="40" height="40" alt="AskMiro" style="display:block;border:0;border-radius:8px" border="0"></td><td style="vertical-align:middle"><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div><div style="font-family:'+F+';font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div></td></tr></table></td><td align="right" style="vertical-align:middle"><div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px"><span style="font-family:'+F+';font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.6px">Payment Receipt</span></div></td></tr></table></td></tr>'
    +'<tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px"><tr><td style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:22px 24px;text-align:center"><div style="font-size:28px;margin-bottom:8px">✔</div><div style="font-family:'+F+';font-size:18px;font-weight:800;color:#166534;margin-bottom:4px">Payment Received</div><div style="font-family:'+F+';font-size:28px;font-weight:800;color:#166534;letter-spacing:-1px">£'+d.gross.toFixed(2)+'</div></td></tr></table>'
    +'<p style="margin:0 0 22px;font-family:'+F+';font-size:16px;font-weight:600;color:#111827">Hi '+_e(d.firstName)+',</p>'
    +'<p style="margin:0 0 22px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">Thank you for your payment! This email confirms we\'ve received your payment in full. Please keep this email as your receipt.</p>'
    +'<p style="margin:0 0 10px;font-family:'+F+';font-size:11px;font-weight:700;color:#0D9488;letter-spacing:1.5px;text-transform:uppercase">Payment Details</p>'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">'
    +'<tr style="background:#F9FAFB"><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#4B5563;border-bottom:1px solid #F3F4F6">Client</td><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #F3F4F6">'+_e(d.client)+'</td></tr>'
    +'<tr><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#4B5563;border-bottom:1px solid #F3F4F6">Service</td><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #F3F4F6">'+_e(d.serviceType)+'</td></tr>'
    +'<tr style="background:#F9FAFB"><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#4B5563;border-bottom:1px solid #F3F4F6">Date Paid</td><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #F3F4F6">'+payDate+'</td></tr>'
    +(d.vat>0?'<tr><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#4B5563;border-bottom:1px solid #F3F4F6">Subtotal</td><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#111827;text-align:right;border-bottom:1px solid #F3F4F6">£'+d.subtotal.toFixed(2)+'</td></tr><tr style="background:#F9FAFB"><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#4B5563;border-bottom:1px solid #F3F4F6">VAT (20%)</td><td style="padding:12px 18px;font-family:'+F+';font-size:13px;color:#111827;text-align:right;border-bottom:1px solid #F3F4F6">£'+d.vat.toFixed(2)+'</td></tr>':'')
    +'<tr style="background:#F0FDFA"><td style="padding:14px 18px;font-family:'+F+';font-size:14px;font-weight:700;color:#111827">Total Paid</td><td style="padding:14px 18px;font-family:'+F+';font-size:16px;font-weight:800;color:#0D9488;text-align:right">£'+d.gross.toFixed(2)+'</td></tr></table>'
    +'<p style="margin:0 0 20px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">If you need an official invoice or have any questions, please don\'t hesitate to contact us.</p>'
    +'<table cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tr><td><a href="https://www.askmiro.com/contact" style="display:inline-block;background:#0A1628;color:#FFFFFF;font-family:'+F+';font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;padding:12px 28px">Contact Us</a></td></tr></table>'
    +'</td></tr>'
    +'<tr><td style="background:#0A1628;padding:24px 36px;border-radius:0 0 12px 12px"><p style="margin:0 0 6px;font-family:'+F+';font-size:13px;font-weight:600;color:rgba(255,255,255,0.45)">AskMiro Professional Cleaning</p><p style="margin:0;font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.25)">London, United Kingdom · Fully Insured · DBS Checked</p></td></tr></table></td></tr></table></body></html>'
}

// ── LIFECYCLE EMAIL: JOB REMINDER ───────────────────────────
function buildReminderEmailHtml(d){
  const F="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
  const tips=['Clear surfaces and countertops where possible','Ensure access to water and electricity','Secure any valuables or fragile items','Let us know about any areas requiring special attention']
  const tipRows=tips.map((t,i)=>{const bg=i%2===0?'#FFFFFF':'#F9FAFB';return'<tr style="background:'+bg+'"><td style="width:44px;padding:12px 0 12px 16px;vertical-align:top;border-bottom:1px solid #F3F4F6"><div style="width:22px;height:22px;background:#F0FDFA;border:1.5px solid #CCFBF1;border-radius:50%;text-align:center;line-height:22px;font-size:11px;color:#0D9488;font-weight:700">'+(i+1)+'</div></td><td style="padding:12px 18px 12px 10px;font-family:'+F+';font-size:14px;color:#1F2937;line-height:1.6;border-bottom:1px solid #F3F4F6">'+t+'</td></tr>'}).join('')
  return'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Booking Reminder — AskMiro</title></head><body style="margin:0;padding:0;background:#F1F5F9"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'
    +'<tr><td style="height:4px;background:linear-gradient(90deg,#0D9488,#14B8A6);border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>'
    +'<tr><td style="background:#0A1628;padding:26px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:14px;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="40" height="40" alt="AskMiro" style="display:block;border:0;border-radius:8px" border="0"></td><td style="vertical-align:middle"><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div><div style="font-family:'+F+';font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div></td></tr></table></td><td align="right" style="vertical-align:middle"><div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px"><span style="font-family:'+F+';font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.6px">Booking Reminder</span></div></td></tr></table></td></tr>'
    +'<tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px"><tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:18px 22px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:32px;vertical-align:top;padding-right:14px;font-size:22px;line-height:1">📅</td><td><div style="font-family:'+F+';font-size:15px;font-weight:700;color:#1E40AF;margin-bottom:4px">Your booking is coming up</div><div style="font-family:'+F+';font-size:13px;color:#1E40AF;opacity:0.8">'+_e(d.serviceType)+' — '+_e(d.site||'Your property')+'</div></td></tr></table></td></tr></table>'
    +'<p style="margin:0 0 22px;font-family:'+F+';font-size:16px;font-weight:600;color:#111827">Hi '+_e(d.firstName)+',</p>'
    +'<p style="margin:0 0 22px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">Just a friendly reminder that your '+_e(d.serviceType.toLowerCase())+' is scheduled soon. Here are the details:</p>'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-radius:12px;overflow:hidden;background:#0A1628"><tr><td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Date</div><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">'+_e(d.jobDateShort||'TBC')+'</div><div style="font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">'+_e(d.jobDay||'')+'</div></td><td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Time</div><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">'+_e(d.timeFmt||'TBC')+'</div><div style="font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">Start time</div></td><td align="center" style="padding:22px 18px"><div style="font-family:'+F+';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Total</div><div style="font-family:'+F+';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">£'+Math.round(d.gross)+'</div><div style="font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">All-inclusive</div></td></tr></table>'
    +'<p style="margin:0 0 10px;font-family:'+F+';font-size:11px;font-weight:700;color:#0D9488;letter-spacing:1.5px;text-transform:uppercase">How to Prepare</p>'
    +'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">'+tipRows+'</table>'
    +(d.site?'<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px"><tr><td style="background:#F0FDFA;border:1px solid #CCFBF1;border-radius:10px;padding:16px 20px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">🏠</td><td><div style="font-family:'+F+';font-size:14px;font-weight:600;color:#111827;margin-bottom:3px">'+_e(d.site)+'</div>'+(d.propDetails?'<div style="font-family:'+F+';font-size:13px;color:#4B5563;line-height:1.5">'+_e(d.propDetails)+'</div>':'')+'</td></tr></table></td></tr></table>':'')
    +'<p style="margin:0 0 20px;font-family:'+F+';font-size:15px;color:#1F2937;line-height:1.8">Need to reschedule or have any questions? Please contact us as soon as possible and we\'ll do our best to accommodate.</p>'
    +'<table cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tr><td style="padding-right:10px"><a href="https://www.askmiro.com/contact" style="display:inline-block;background:#0A1628;color:#FFFFFF;font-family:'+F+';font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;padding:12px 28px">Contact Us</a></td><td><a href="tel:+4402080730621" style="display:inline-block;background:transparent;color:#0A1628;font-family:'+F+';font-size:13px;font-weight:600;text-decoration:none;border:1px solid #E5E7EB;border-radius:8px;padding:11px 24px">Call Us</a></td></tr></table>'
    +'</td></tr>'
    +'<tr><td style="background:#0A1628;padding:24px 36px;border-radius:0 0 12px 12px"><p style="margin:0 0 6px;font-family:'+F+';font-size:13px;font-weight:600;color:rgba(255,255,255,0.45)">AskMiro Professional Cleaning</p><p style="margin:0;font-family:'+F+';font-size:11px;color:rgba(255,255,255,0.25)">London, United Kingdom · Fully Insured · DBS Checked</p></td></tr></table></td></tr></table></body></html>'
}

// ── Helpers ──────────────────────────────────────────────────
function scoreColor(v){return v>=70?'#10b981':v>=40?'#f59e0b':'#ef4444'}
function marginBadgeColor(yours,avg){return yours>=avg?'#10b981':'#ef4444'}
function riskLabel(margin){return margin>=30?'Low':margin>=20?'Medium':'High'}
function riskColor(margin){return margin>=30?'#10b981':margin>=20?'#f59e0b':'#ef4444'}

export default function Quotes({openLead}){
  const qc=useQueryClient()
  // ── DATA FROM GAS (single source of truth) ───────────────
  const {data:quotesRaw,isLoading}=useQuery({queryKey:['quotes'],queryFn:()=>gasClient.quotes.list()})
  const quotes=Array.isArray(quotesRaw)?quotesRaw:(quotesRaw?.quotes||[])
  const {data:settings}=useQuery({queryKey:['fin-settings'],queryFn:gasClient.finance.settings,staleTime:300000})
  const [tab,setTab]=useState('all')
  const [showBuilder,setShowBuilder]=useState(true)
  const [saving,setSaving]=useState(false)
  const [saveMsg,setSaveMsg]=useState(null)
  const [selectedQuote,setSelectedQuote]=useState(null)

  // Settings with defaults (GAS returns mapped snake_case aliases via gasClient)
  const llwDefault=settings?.llw_rate||13.85
  const onCosts=settings?.on_costs_pct||36
  const minMargin=settings?.min_margin_pct||20
  const vatRate=settings?.vat_rate||0  // Company not VAT registered below threshold

  // Form state — llw is editable per-quote (override from settings)
  const SERVICE_TYPES=['End of Tenancy Clean','Deep Clean','Regular Clean','Move-In Clean','Office Clean','One-Off Clean','Other']
  const [form,setForm]=useState({client:'',site:'',postcode:'',segment:'Office',mode:'Hourly Rate',hrs:20,days:5,rate:18.50,llw:llwDefault,fixedMonthly:0,supplies:200,other:0,notes:'',
    // One-off fields
    serviceType:'End of Tenancy Clean',clientEmail:'',jobDate:'',jobTime:'10:00',propDetails:'',paymentLink:'',vatPct:0,scope:'',
    lineItems:[{desc:'',amt:''}],fixedTotal:''
  })
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}))
  // Keep llw in sync with settings on first load (only if user hasn't changed it)
  const llw=Number(form.llw)||llwDefault
  useEffect(()=>{
    if(settings?.llw_rate&&form.llw===13.85) upd('llw',settings.llw_rate)
  },[settings?.llw_rate]) // eslint-disable-line

  // Intelligence state
  const [intel,setIntel]=useState(null)
  const [intelLoading,setIntelLoading]=useState(false)
  const [intelError,setIntelError]=useState(null)
  const [showIntel,setShowIntel]=useState(true)

  const isOneOff=form.mode==='One-off Job'
  const isFixed=form.mode==='Fixed Monthly'

  // Line item helpers
  const addLine=()=>setForm(p=>({...p,lineItems:[...p.lineItems,{desc:'',amt:''}]}))
  const removeLine=(i)=>setForm(p=>({...p,lineItems:p.lineItems.filter((_,idx)=>idx!==i)}))
  const updLine=(i,k,v)=>setForm(p=>({...p,lineItems:p.lineItems.map((li,idx)=>idx===i?{...li,[k]:v}:li)}))

  // Live calculator
  const calc=useMemo(()=>{
    if(isOneOff){
      const lineTotal=form.lineItems.reduce((s,li)=>s+Number(li.amt||0),0)
      const subtotal=Number(form.fixedTotal)||lineTotal
      const vat=subtotal*(form.vatPct/100)
      const gross=subtotal+vat
      return{subtotal,vat,gross,lineTotal,margin:100,revenue:subtotal,monthlyHrs:0,labour:0,totalCosts:0,revenueVat:gross,grossMargin:subtotal}
    }
    if(isFixed){
      const revenue=Number(form.fixedMonthly)||0
      const revenueVat=revenue*(1+vatRate/100)
      const totalCosts=Number(form.supplies)+Number(form.other)
      const grossMargin=revenue-totalCosts
      const margin=revenue>0?((grossMargin)/revenue)*100:0
      return{monthlyHrs:0,labour:0,totalCosts,revenue,revenueVat,margin,grossMargin,subtotal:revenue,vat:revenue*vatRate/100,gross:revenueVat}
    }
    const monthlyHrs=form.hrs*(form.days/5)*4.33
    const labour=monthlyHrs*llw*(1+onCosts/100)
    const totalCosts=labour+Number(form.supplies)+Number(form.other)
    const revenue=monthlyHrs*Number(form.rate)
    const revenueVat=revenue*(1+vatRate/100)
    const margin=revenue>0?((revenue-totalCosts)/revenue)*100:0
    const grossMargin=revenue-totalCosts
    return{monthlyHrs,labour,totalCosts,revenue,revenueVat,margin,grossMargin,subtotal:revenue,vat:revenue*vatRate/100,gross:revenueVat}
  },[form,llw,onCosts,vatRate,isOneOff,isFixed])

  const marginOk=calc.margin>=minMargin
  const marginColor=marginOk?'#10b981':'#ef4444'

  // ── Intelligence fetch ─────────────────────────────────────
  const fetchIntel=useCallback(async()=>{
    const pc=form.postcode?.trim()
    if(!pc||!form.hrs) return
    setIntelLoading(true)
    setIntelError(null)
    try{
      const [quoteIntel,feasibility,cleanerMatch]=await Promise.allSettled([
        fetchQuoteIntelligence('',pc,form.segment,form.hrs,calc.revenue),
        fetchFeasibility(pc,form.hrs,form.segment),
        fetchCleanerMatch(pc,form.hrs,form.segment,3)
      ])
      setIntel({
        quote:quoteIntel.status==='fulfilled'?quoteIntel.value:null,
        feasibility:feasibility.status==='fulfilled'?feasibility.value:null,
        cleaners:cleanerMatch.status==='fulfilled'?cleanerMatch.value:null,
      })
    }catch(err){
      setIntelError(err.message||'Intelligence lookup failed')
      setIntel(null)
    }finally{
      setIntelLoading(false)
    }
  },[form.postcode,form.segment,form.hrs,calc.revenue])

  // Debounced auto-fetch when key fields change
  const debounceRef=useRef(null)
  useEffect(()=>{
    if(!form.postcode?.trim()||!form.hrs) return
    if(debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current=setTimeout(()=>fetchIntel(),900)
    return()=>{if(debounceRef.current) clearTimeout(debounceRef.current)}
  },[form.postcode,form.segment,form.hrs,form.rate,fetchIntel])

  // Scenario cards
  const scenarios=useMemo(()=>{
    if(!calc.totalCosts) return null
    const cost=calc.totalCosts
    const buildScenario=(label,targetMargin)=>{
      const price=cost/(1-targetMargin/100)
      const margin=price>0?((price-cost)/price)*100:0
      return{label,price,margin,risk:riskLabel(margin)}
    }
    return[buildScenario('Aggressive',15),buildScenario('Balanced',25),buildScenario('Protected',35)]
  },[calc.totalCosts])

  // ── Save as Draft ────────────────────────────────────────
  const saveQuote=useCallback(async()=>{
    if(!form.client?.trim()){setSaveMsg({type:'error',text:'Client name is required'});return}
    setSaving(true);setSaveMsg(null)
    try{
      // Build GAS-compatible payload (camelCase, matches Quotes sheet schema)
      const payload=quoteFormToGas(form,calc,llw,onCosts,isOneOff)
      // ── Save to GAS (single source of truth for quotes) ──
      const data=await gasClient.quotes.save(payload)
      if(!data?.ok&&!data?.id) throw new Error(data?.error||'Save failed')
      setSaveMsg({type:'success',text:`Quote ${(data.id||'').substring(0,8)} saved to GAS`})
      qc.invalidateQueries({queryKey:['quotes']})
      // Reset form
      setForm({client:'',site:'',postcode:'',segment:'Office',mode:'Hourly Rate',hrs:20,days:5,rate:18.50,llw:llwDefault,fixedMonthly:0,supplies:200,other:0,notes:'',serviceType:'End of Tenancy Clean',clientEmail:'',jobDate:'',jobTime:'10:00',propDetails:'',paymentLink:'',vatPct:0,scope:'',lineItems:[{desc:'',amt:''}],fixedTotal:''})
      setIntel(null)
    }catch(err){
      setSaveMsg({type:'error',text:err.message||'Save failed'})
    }finally{setSaving(false)}
  },[form,llw,onCosts,qc])

  // ── Load into builder ────────────────────────────────────
  const loadIntoBuilder=useCallback((q)=>{
    const mode=q.mode==='fixed'?'Fixed Monthly':q.mode==='one_off'?'One-off Job':'Hourly Rate'
    setForm({
      client:q.client_name||q.client||q.customer||'',
      site:q.site_address||q.site||q.address||'',
      postcode:q.site_postcode||q.postcode||'',
      segment:q.sector||q.segment||'Office',
      mode,
      hrs:Number(q.hours_per_week||q.hoursPerWeek||20),
      days:Number(q.days_per_week||q.daysPerWeek||5),
      rate:Number(q.client_rate||q.hourlyRate||18.50),
      llw:Number(q.llw_rate||q.llwRate||llwDefault),
      fixedMonthly:Number(q.fixed_monthly||q.fixedMonthly||0),
      supplies:Number(q.supplies_month||q.suppliesCost||200),
      other:Number(q.other_costs_month||q.otherCosts||0),
      notes:q.notes||''
    })
    setSelectedQuote(null)
    setShowBuilder(true)
    setSaveMsg({type:'success',text:`Loaded "${q.client_name||q.client||''}" into builder — edit and save as new version`})
  },[])

  // ── PDF / Email generators (open in new window) ──────────
  const _esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const _buildData=(f,c)=>{
    const items=f.lineItems.filter(li=>li.desc&&li.amt).map(li=>({description:li.desc,amount:Number(li.amt)}))
    const firstName=f.client.split(' ')[0]
    const jobDateFmt=f.jobDate?new Date(f.jobDate+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):''
    const jobDateShort=f.jobDate?new Date(f.jobDate+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''
    const jobDay=f.jobDate?new Date(f.jobDate+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long'}):''
    const timeFmt=f.jobTime?(()=>{const p=f.jobTime.split(':'),h=parseInt(p[0],10),m=p[1]||'00',ap=h>=12?'PM':'AM';return(h>12?h-12:h||12)+(m!=='00'?':'+m:'')+' '+ap})():''
    const scopeItems=(f.scope||'').split('\n').map(s=>s.trim()).filter(s=>s)
    const today=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})
    const validUntil=new Date(Date.now()+14*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})
    return{...f,items,firstName,jobDateFmt,jobDateShort,jobDay,timeFmt,scopeItems,today,validUntil,subtotal:c.subtotal,vat:c.vat,gross:c.gross}
  }

  const previewQuotePdf=(f,c)=>{
    const d=_buildData(f,c)
    const lineRows=d.items.map(li=>'<tr><td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;font-size:14px;color:#1E293B"><div style="font-weight:600">'+_esc(li.description)+'</div></td><td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;text-align:right;font-weight:600;font-size:14px;white-space:nowrap">£'+li.amount.toFixed(2)+'</td></tr>').join('')
    const scopeHtml=d.scopeItems.length?'<div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:10px;padding:16px 20px;margin-bottom:24px"><div style="font-size:11px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Full Scope of Work</div><ul style="font-size:13px;color:#1E293B;line-height:1.8;padding-left:20px">'+d.scopeItems.map(s=>'<li style="margin-bottom:2px">'+_esc(s)+'</li>').join('')+'</ul></div>':''
    const vatLabel=d.vatPct>0?'VAT ('+d.vatPct+'%)':'VAT (0% — below threshold)'
    const html='<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8"><title>Quote — '+_esc(d.client)+'</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"DM Sans",-apple-system,sans-serif;background:#fff;color:#1E293B;line-height:1.6}@page{size:A4;margin:0}@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}.page{max-width:794px;margin:0 auto;padding:48px 56px}</style></head><body>'
      +'<div class="no-print" style="background:#0D9488;padding:12px 24px;display:flex;gap:12px;align-items:center;justify-content:center"><button onclick="window.print()" style="background:#fff;color:#0D9488;border:none;padding:10px 32px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Save as PDF</button><button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:10px 32px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit">Close</button></div>'
      +'<div class="page">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #0D9488"><div><div style="font-family:Outfit,sans-serif;font-weight:800;font-size:28px;color:#0D9488;letter-spacing:-0.5px">AskMiro</div><div style="font-size:13px;color:#64748B;margin-top:4px">Managed Cleaning Services</div><div style="font-size:12px;color:#94A3B8;margin-top:2px">020 8073 0621 • info@askmiro.com • www.askmiro.com</div></div><div style="text-align:right"><div style="font-family:Outfit,sans-serif;font-weight:700;font-size:22px;color:#1E293B">QUOTE &amp; BOOKING<br>CONFIRMATION</div><div style="font-size:13px;color:#64748B;margin-top:4px">Date: '+d.today+'</div><div style="font-size:13px;color:#64748B">Valid until: '+d.validUntil+'</div></div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px"><div style="background:#F8FAFC;border-radius:10px;padding:20px"><div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Prepared for</div><div style="font-size:16px;font-weight:700;color:#1E293B">'+_esc(d.client)+'</div>'+(d.site?'<div style="font-size:13px;color:#64748B;margin-top:4px">'+_esc(d.site)+'</div>':'')+(d.clientEmail?'<div style="font-size:13px;color:#64748B;margin-top:2px">'+_esc(d.clientEmail)+'</div>':'')+'</div>'
      +'<div style="background:#F0FDFA;border-radius:10px;padding:20px"><div style="font-size:10px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Service Details</div><div style="font-size:16px;font-weight:700;color:#1E293B">'+_esc(d.serviceType)+'</div>'+(d.jobDateFmt?'<div style="font-size:13px;font-weight:600;color:#0F766E;margin-top:4px">'+_esc(d.jobDateFmt)+(d.timeFmt?', '+_esc(d.timeFmt):'')+'</div>':'')+(d.propDetails?'<div style="font-size:13px;color:#64748B;margin-top:4px">'+_esc(d.propDetails)+'</div>':'')+'</div></div>'
      +'<table style="width:100%;border-collapse:collapse;margin-bottom:24px"><thead><tr><th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #E2E8F0;background:#F8FAFC">Description</th><th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #E2E8F0;background:#F8FAFC">Amount</th></tr></thead><tbody>'+lineRows+'</tbody></table>'
      +'<div style="display:flex;justify-content:flex-end;margin-bottom:32px"><div style="width:300px;background:#F8FAFC;border-radius:10px;padding:16px 20px"><div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px"><span style="color:#64748B">Subtotal (net)</span><span style="font-weight:600">£'+d.subtotal.toFixed(2)+'</span></div><div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px"><span style="color:#64748B">'+vatLabel+'</span><span style="font-weight:600">£'+d.vat.toFixed(2)+'</span></div><div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:2px solid #0D9488;font-size:18px"><span style="font-weight:700;color:#1E293B">Total</span><span style="font-weight:800;color:#0D9488">£'+d.gross.toFixed(2)+'</span></div></div></div>'
      +scopeHtml
      +'<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px 20px;margin-bottom:24px"><div style="font-size:11px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Payment Terms</div><div style="font-size:13px;color:#78350F;line-height:1.7">No upfront payment required. Payment of <strong>£'+d.gross.toFixed(2)+'</strong> is due upon completion of the job, once you are satisfied with the standard of work. A full invoice and receipt will be provided on the day for your records.</div></div>'
      +(d.paymentLink?'<div style="text-align:center;margin-bottom:32px"><a href="'+_esc(d.paymentLink)+'" target="_blank" style="display:inline-block;background:#0D9488;color:#fff;font-family:Outfit,sans-serif;font-weight:700;font-size:16px;padding:16px 56px;border-radius:10px;text-decoration:none;box-shadow:0 4px 14px rgba(13,148,136,0.35)">Pay Now — £'+d.gross.toFixed(2)+'</a><div style="font-size:11px;color:#94A3B8;margin-top:8px">Secure payment via Tide</div></div>':'')
      +'<div style="border-top:1px solid #E2E8F0;padding-top:20px;display:flex;justify-content:space-between;align-items:center"><div style="font-size:11px;color:#94A3B8;line-height:1.6">AskMiro Cleaning Services<br>SW11, London<br>Company registered in England &amp; Wales</div><div style="font-size:11px;color:#94A3B8;text-align:right;line-height:1.6">Reliable. Thorough. Local.<br>www.askmiro.com<br>020 8073 0621</div></div></div></body></html>'
    const w=window.open('','_blank','width=850,height=1100')
    if(w){w.document.write(html);w.document.close()}
  }

  const previewEmail=(f,c)=>{
    const d=_buildData(f,c)
    const html=buildEmailHtml(d)
    const w=window.open('','_blank','width=700,height=900')
    if(w){w.document.write(html);w.document.close()}
  }

  const downloadEmail=(f,c)=>{
    const d=_buildData(f,c)
    const html=buildEmailHtml(d)
    const blob=new Blob([html],{type:'text/html'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url;a.download='email-'+d.client.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.html';a.click()
    URL.revokeObjectURL(url)
  }

  // Send email via Netlify Resend
  const sendClientEmail=async(f,c)=>{
    const d=_buildData(f,c)
    if(!d.client){alert('Client name required');return}
    if(!d.clientEmail||!d.clientEmail.includes('@')){alert('Client email required');return}
    if(d.gross<=0){alert('Add line items or total first');return}
    const itemList=d.items.map(li=>'  • '+li.description+' — £'+li.amount.toFixed(2)).join('\n')
    if(!confirm('Send booking confirmation with PDF to '+d.clientEmail+'?\n\nClient: '+d.client+'\nService: '+d.serviceType+'\n\n'+itemList+'\n\nTotal: £'+d.gross.toFixed(2)))return
    try{
      const res=await fetch('/api/send-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:d.client,email:d.clientEmail,site:d.site||'',serviceType:d.serviceType,jobDate:f.jobDate||'',jobTime:f.jobTime||'',propDetails:d.propDetails||'',notes:f.notes||'',payLink:f.paymentLink||'',vatRate:d.vatPct||0,scopeItems:d.scopeItems,items:d.items,subtotal:d.subtotal,vat:d.vat,gross:d.gross,fromName:'Mike Kato'})})
      const result=await res.json()
      if(result.sent)alert('Email + PDF sent to '+d.clientEmail)
      else alert('Send failed: '+(result.error||'Unknown error'))
    }catch(e){alert('Send failed: '+e.message)}
  }

  // Lifecycle email previews
  const previewCompletionEmail=(f,c)=>{
    const d=_buildData(f,c)
    const html=buildCompletionEmailHtml(d)
    const w=window.open('','_blank');w.document.write(html);w.document.close()
  }
  const previewPaymentEmail=(f,c)=>{
    const d=_buildData(f,c)
    const html=buildPaymentEmailHtml(d)
    const w=window.open('','_blank');w.document.write(html);w.document.close()
  }
  const previewReminderEmail=(f,c)=>{
    const d=_buildData(f,c)
    const html=buildReminderEmailHtml(d)
    const w=window.open('','_blank');w.document.write(html);w.document.close()
  }

  const canShowIntel=!!form.postcode?.trim()&&form.hrs>0

  // Filter quotes
  const filtered=tab==='all'?quotes:tab==='web'?quotes.filter(q=>q.source==='web'||q.intel):quotes.filter(q=>q.status===tab)

  return(
    <div style={{padding:'28px 36px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
            <span style={{background:'var(--teal)',color:'white',fontSize:'0.65rem',fontWeight:700,padding:'3px 10px',borderRadius:4,textTransform:'uppercase'}}>Quotes</span>
            <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>Quote Builder</h1>
          </div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{quotes.length} quotes</span>
          <button onClick={()=>setShowBuilder(!showBuilder)} style={{background:'var(--teal)',color:'white',border:'none',borderRadius:'var(--r-sm)',padding:'8px 16px',fontSize:'0.8rem',fontWeight:600,cursor:'pointer'}}>
            {showBuilder?'Hide Builder':'+ New Quote'}
          </button>
        </div>
      </div>

      {/* Builder */}
      {showBuilder&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:20,marginBottom:28}}>
          {/* Form */}
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:28}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}>
              <span style={{background:'#3b82f6',color:'white',fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>Builder</span>
              <span style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>New Quote</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <Field label="Client Name *" value={form.client} onChange={v=>upd('client',v)}/>
              <Field label="Site Address *" value={form.site} onChange={v=>upd('site',v)}/>
              <Field label="Postcode *" value={form.postcode} onChange={v=>upd('postcode',v)} placeholder="e.g. SW1A 1AA"/>
              <SelectField label="Segment" value={form.segment} onChange={v=>upd('segment',v)} options={SEGMENTS}/>
              <SelectField label="Mode" value={form.mode} onChange={v=>upd('mode',v)} options={['Hourly Rate','Fixed Monthly','One-off Job']}/>
            </div>

            {/* ── Hourly Rate fields (4-col grid matching Ops) ── */}
            {!isOneOff&&!isFixed&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:16,marginTop:16}}>
                <Field label="Hrs / Week" value={form.hrs} onChange={v=>upd('hrs',Number(v))} type="number"/>
                <SelectField label="Days / Week" value={form.days} onChange={v=>upd('days',Number(v))} options={[1,2,3,4,5,6,7]}/>
                <Field label="Client Rate (£/hr)" value={form.rate} onChange={v=>upd('rate',v)} type="number" step="0.5"/>
                <Field label="LLW Rate (£/hr)" value={form.llw} onChange={v=>upd('llw',v)} type="number" step="0.01"/>
              </div>
            )}

            {/* ── Fixed Monthly field ── */}
            {isFixed&&(
              <div style={{marginTop:16}}>
                <Field label="Fixed Monthly (£)" value={form.fixedMonthly} onChange={v=>upd('fixedMonthly',v)} type="number" step="10"/>
              </div>
            )}

            {/* ── Shared cost fields (supplies/other) for hourly + fixed ── */}
            {!isOneOff&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
                <Field label="Supplies / Month (£)" value={form.supplies} onChange={v=>upd('supplies',v)} type="number"/>
                <Field label="Other Costs / Month (£)" value={form.other} onChange={v=>upd('other',v)} type="number"/>
              </div>
            )}

            {/* ── One-off Job Fields ── */}
            {isOneOff&&(
              <div style={{marginTop:16}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
                  <SelectField label="Service Type" value={form.serviceType} onChange={v=>upd('serviceType',v)} options={SERVICE_TYPES}/>
                  <Field label="Client Email" value={form.clientEmail} onChange={v=>upd('clientEmail',v)} type="email" placeholder="client@email.com"/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:16}}>
                  <Field label="Job Date" value={form.jobDate} onChange={v=>upd('jobDate',v)} type="date"/>
                  <Field label="Job Time" value={form.jobTime} onChange={v=>upd('jobTime',v)} type="time"/>
                  <SelectField label="VAT" value={String(form.vatPct)} onChange={v=>upd('vatPct',Number(v))} options={[{v:'0',l:'0% (below threshold)'},{v:'20',l:'20%'}]}/>
                </div>
                <Field label="Property Details" value={form.propDetails} onChange={v=>upd('propDetails',v)} placeholder="e.g. 1 bed flat, 1 bath, furnished"/>

                {/* Line Items */}
                <div style={{background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:14,marginTop:16}}>
                  <div style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Line Items</div>
                  {form.lineItems.map((li,i)=>(
                    <div key={i} style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                      <input value={li.desc} onChange={e=>updLine(i,'desc',e.target.value)} placeholder="e.g. End of tenancy deep clean" style={{flex:3,padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.82rem',color:'var(--text-1)',fontFamily:'inherit'}}/>
                      <input type="number" value={li.amt} onChange={e=>updLine(i,'amt',e.target.value)} placeholder="£ Amount" step="1" style={{flex:1,padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.82rem',color:'var(--text-1)',fontFamily:'inherit'}}/>
                      <button onClick={()=>removeLine(i)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:16,padding:'0 6px'}}>✕</button>
                    </div>
                  ))}
                  <button onClick={addLine} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'6px 14px',fontSize:'0.75rem',fontWeight:600,color:'var(--text-muted)',cursor:'pointer',marginTop:4}}>+ Add Line</button>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
                  <Field label="Fixed Total (£, overrides lines)" value={form.fixedTotal} onChange={v=>upd('fixedTotal',v)} type="number" placeholder="Leave blank to use line item total"/>
                  <Field label="Payment Link (Tide)" value={form.paymentLink} onChange={v=>upd('paymentLink',v)} placeholder="https://pay.tide.co/..."/>
                </div>

                <div style={{marginTop:16}}>
                  <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Scope of Work <span style={{fontWeight:400,color:'var(--text-muted)'}}>(one item per line)</span></label>
                  <textarea value={form.scope} onChange={e=>upd('scope',e.target.value)} placeholder={"Cobweb removal from ceilings and walls\nSkirting boards, door frames, radiators\nKitchen units deep clean\n..."} style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.82rem',color:'var(--text-1)',minHeight:90,resize:'vertical',fontFamily:'inherit'}}/>
                </div>
              </div>
            )}

            <div style={{marginTop:16}}>
              <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Notes</label>
              <textarea value={form.notes} onChange={e=>upd('notes',e.target.value)} placeholder="Scope, access notes, special requirements..." style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.82rem',color:'var(--text-1)',minHeight:70,resize:'vertical',fontFamily:'inherit'}}/>
            </div>
          </div>

          {/* Live Calculator — dark navy panel matching Ops builder */}
          <div style={{background:'#0A1628',borderRadius:'var(--r-lg)',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            {/* Panel header */}
            <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:'0.55rem',fontWeight:700,color:'#14B8A6',letterSpacing:'2px',textTransform:'uppercase'}}>
                  {isOneOff?'ONE-OFF':'MARGIN'}
                </div>
                <div style={{fontSize:'0.9rem',fontWeight:700,color:'#fff',marginTop:2}}>Live Calculator</div>
              </div>
              <span style={{fontSize:'0.6rem',fontWeight:700,padding:'3px 9px',borderRadius:20,
                background:isOneOff?'rgba(13,148,136,0.2)':marginOk?'rgba(16,185,129,0.18)':'rgba(239,68,68,0.18)',
                color:isOneOff?'#2DD4BF':marginOk?'#34D399':'#F87171',
                border:`1px solid ${isOneOff?'rgba(13,148,136,0.35)':marginOk?'rgba(16,185,129,0.35)':'rgba(239,68,68,0.35)'}`
              }}>
                {isOneOff?'Job':marginOk?'Healthy':'Below floor'}
              </span>
            </div>

            <div style={{padding:'20px',flex:1,display:'flex',flexDirection:'column'}}>

            {isOneOff?(
              <>
                {/* Big total */}
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:'2.6rem',fontWeight:900,color:'#14B8A6',letterSpacing:'-1px',lineHeight:1}}>
                    £{calc.gross.toFixed(2)}
                  </div>
                  <div style={{fontSize:'0.7rem',color:'rgba(255,255,255,0.4)',marginTop:4}}>
                    total {form.vatPct>0?'(inc. VAT)':'(no VAT)'}
                  </div>
                </div>

                {/* Breakdown */}
                <div style={{borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:14,display:'flex',flexDirection:'column',gap:7}}>
                  {form.lineItems.filter(li=>li.desc&&li.amt).map((li,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem'}}>
                      <span style={{color:'rgba(255,255,255,0.45)'}}>{li.desc}</span>
                      <span style={{color:'rgba(255,255,255,0.7)',fontWeight:600}}>£{Number(li.amt).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.08)',marginTop:4,paddingTop:8,display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem'}}>
                      <span style={{color:'rgba(255,255,255,0.5)'}}>Subtotal (net)</span>
                      <span style={{color:'#fff',fontWeight:700}}>£{calc.subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem'}}>
                      <span style={{color:'rgba(255,255,255,0.5)'}}>{form.vatPct>0?`VAT (${form.vatPct}%)`:'VAT (0% — below threshold)'}</span>
                      <span style={{color:'rgba(255,255,255,0.6)',fontWeight:600}}>£{calc.vat.toFixed(2)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.9rem',paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                      <span style={{color:'#fff',fontWeight:700}}>Total</span>
                      <span style={{color:'#14B8A6',fontWeight:900}}>£{calc.gross.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{marginTop:'auto',paddingTop:20,display:'flex',flexDirection:'column',gap:7}}>
                  <button onClick={saveQuote} disabled={saving} style={{width:'100%',padding:'11px',background:'rgba(255,255,255,0.08)',color:'#fff',border:'1px solid rgba(255,255,255,0.18)',borderRadius:'var(--r-sm)',fontSize:'0.82rem',fontWeight:700,cursor:saving?'wait':'pointer',opacity:saving?0.7:1}}>
                    {saving?'Saving…':'✓ Save Quote'}
                  </button>
                  <button onClick={()=>sendClientEmail(form,calc)} style={{width:'100%',padding:'11px',background:'#0D9488',color:'white',border:'none',borderRadius:'var(--r-sm)',fontSize:'0.82rem',fontWeight:700,cursor:'pointer',letterSpacing:'0.02em'}}>
                    ✈ Send Booking Email
                  </button>
                  <button onClick={()=>previewQuotePdf(form,calc)} style={{width:'100%',padding:'9px',background:'rgba(20,184,166,0.12)',color:'#14B8A6',border:'1.5px solid rgba(20,184,166,0.35)',borderRadius:'var(--r-sm)',fontSize:'0.78rem',fontWeight:700,cursor:'pointer'}}>
                    Preview Quote PDF
                  </button>
                  <button onClick={()=>previewEmail(form,calc)} style={{width:'100%',padding:'9px',background:'transparent',border:'1px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.65)',borderRadius:'var(--r-sm)',fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}>
                    Preview Email
                  </button>
                  {saveMsg&&<div style={{fontSize:'0.72rem',fontWeight:600,textAlign:'center',color:saveMsg.type==='success'?'#34D399':'#F87171'}}>{saveMsg.text}</div>}
                  <div style={{marginTop:8,paddingTop:12,borderTop:'1px solid rgba(255,255,255,0.07)'}}>
                    <div style={{fontSize:'0.6rem',fontWeight:700,color:'rgba(255,255,255,0.3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:7}}>Lifecycle</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}>
                      <button onClick={()=>previewCompletionEmail(form,calc)} style={{padding:'7px 4px',background:'rgba(22,163,74,0.12)',border:'1px solid rgba(22,163,74,0.3)',color:'#4ADE80',borderRadius:'var(--r-sm)',fontSize:'0.68rem',fontWeight:700,cursor:'pointer'}}>✔ Done</button>
                      <button onClick={()=>previewPaymentEmail(form,calc)} style={{padding:'7px 4px',background:'rgba(22,163,74,0.12)',border:'1px solid rgba(22,163,74,0.3)',color:'#4ADE80',borderRadius:'var(--r-sm)',fontSize:'0.68rem',fontWeight:700,cursor:'pointer'}}>Paid</button>
                      <button onClick={()=>previewReminderEmail(form,calc)} style={{padding:'7px 4px',background:'rgba(37,99,235,0.12)',border:'1px solid rgba(37,99,235,0.3)',color:'#60A5FA',borderRadius:'var(--r-sm)',fontSize:'0.68rem',fontWeight:700,cursor:'pointer'}}>Remind</button>
                    </div>
                  </div>
                </div>
              </>
            ):(
              <>
                {/* Big margin % */}
                <div style={{marginBottom:18}}>
                  <div style={{fontSize:'3rem',fontWeight:900,letterSpacing:'-1.5px',lineHeight:1,
                    color:calc.margin<0?'#F87171':calc.margin<minMargin?'#FBBF24':'#34D399'}}>
                    {fmtPct(calc.margin)}
                  </div>
                  <div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.4)',marginTop:3}}>gross margin</div>
                  <div style={{fontSize:'1.1rem',fontWeight:800,color:'#14B8A6',marginTop:6,letterSpacing:'-0.3px'}}>
                    {fmtCur(calc.revenue)}/mo
                  </div>
                </div>

                {/* Breakdown */}
                <div style={{borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:14,display:'flex',flexDirection:'column',gap:7}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem'}}>
                    <span style={{color:'rgba(255,255,255,0.45)'}}>Revenue (ex. VAT)</span>
                    <span style={{color:'#fff',fontWeight:600}}>{fmtCur(calc.revenue)}</span>
                  </div>
                  {vatRate>0&&(
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem'}}>
                      <span style={{color:'rgba(255,255,255,0.45)'}}>Revenue (inc. VAT {vatRate}%)</span>
                      <span style={{color:'#fff',fontWeight:600}}>{fmtCur(calc.revenueVat)}</span>
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem'}}>
                    <span style={{color:'rgba(255,255,255,0.45)'}}>Labour cost</span>
                    <span style={{color:'rgba(255,255,255,0.7)',fontWeight:600}}>{fmtCur(calc.labour)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem'}}>
                    <span style={{color:'rgba(255,255,255,0.45)'}}>Supplies + Other</span>
                    <span style={{color:'rgba(255,255,255,0.7)',fontWeight:600}}>{fmtCur(Number(form.supplies)+Number(form.other))}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem',paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                    <span style={{color:'rgba(255,255,255,0.6)',fontWeight:600}}>Direct cost total</span>
                    <span style={{color:'#fff',fontWeight:700}}>{fmtCur(calc.totalCosts)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                    <span style={{color:'rgba(255,255,255,0.8)',fontWeight:700}}>Gross margin</span>
                    <span style={{fontWeight:800,color:calc.margin<0?'#F87171':calc.margin<minMargin?'#FBBF24':'#34D399'}}>
                      {calc.grossMargin<0?'£-'+Math.abs(Math.round(calc.grossMargin)).toLocaleString('en-GB'):fmtCur(calc.grossMargin)}
                    </span>
                  </div>
                  {vatRate===0&&calc.revenue>0&&(
                    <div style={{marginTop:6,fontSize:'0.65rem',color:'rgba(255,255,255,0.3)',fontStyle:'italic'}}>
                      Not VAT registered — no VAT charged
                    </div>
                  )}
                </div>

                {/* Margin guard alerts */}
                {calc.margin<0&&calc.revenue>0&&(
                  <div style={{marginTop:12,padding:'9px 12px',background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'var(--r-sm)',fontSize:'0.73rem',color:'#FCA5A5',fontWeight:700}}>
                    Critical: negative margin ({fmtPct(calc.margin)}). Raise rate or reduce cost.
                  </div>
                )}
                {calc.margin>=0&&calc.margin<minMargin&&calc.revenue>0&&(
                  <div style={{marginTop:12,padding:'9px 12px',background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.25)',borderRadius:'var(--r-sm)',fontSize:'0.73rem',color:'#FCD34D',fontWeight:600}}>
                    Below {minMargin}% floor — review before sending.
                  </div>
                )}

                {/* Action buttons — recurring contract */}
                <div style={{marginTop:'auto',paddingTop:20,display:'flex',flexDirection:'column',gap:7}}>
                  <button onClick={saveQuote} disabled={saving} style={{width:'100%',padding:'11px',background:'#0D9488',color:'white',border:'none',borderRadius:'var(--r-sm)',fontSize:'0.82rem',fontWeight:700,cursor:saving?'wait':'pointer',opacity:saving?0.7:1}}>
                    {saving?'Saving…':'✓ Save Quote'}
                  </button>
                  <button onClick={()=>previewQuotePdf(form,calc)} style={{width:'100%',padding:'9px',background:'rgba(20,184,166,0.12)',color:'#14B8A6',border:'1.5px solid rgba(20,184,166,0.35)',borderRadius:'var(--r-sm)',fontSize:'0.78rem',fontWeight:700,cursor:'pointer'}}>
                    Preview Proposal PDF
                  </button>
                  <button onClick={()=>previewEmail(form,calc)} style={{width:'100%',padding:'9px',background:'transparent',border:'1px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.65)',borderRadius:'var(--r-sm)',fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}>
                    Preview Email
                  </button>
                  {saveMsg&&<div style={{fontSize:'0.72rem',fontWeight:600,textAlign:'center',color:saveMsg.type==='success'?'#34D399':'#F87171'}}>{saveMsg.text}</div>}
                </div>
              </>
            )}

            {/* Footer hint */}
            <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid rgba(255,255,255,0.06)',fontSize:'0.62rem',color:'rgba(255,255,255,0.25)',lineHeight:1.6}}>
              {isOneOff?'One-off job pricing — no recurring calculations.'
                :<>LLW: £{llw.toFixed(2)}/hr · On-costs: {onCosts}% · Min margin: {minMargin}%{vatRate===0?' · Not VAT reg':` · VAT: ${vatRate}%`}</>}
            </div>

            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          INTELLIGENCE PANEL
         ══════════════════════════════════════════════════════════ */}
      {showBuilder&&canShowIntel&&(
        <div style={{marginBottom:28}}>
          {/* Toggle header */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:showIntel?16:0,cursor:'pointer'}} onClick={()=>setShowIntel(!showIntel)}>
            <span style={{background:'#8b5cf6',color:'white',fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>Intelligence</span>
            <span style={{fontSize:'0.95rem',fontWeight:700,color:'var(--text-1)'}}>Commercial Intelligence</span>
            <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{showIntel?'▼':'▶'}</span>
            {intelLoading&&<span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>Loading...</span>}
            {!intel&&!intelLoading&&(
              <button onClick={e=>{e.stopPropagation();fetchIntel()}} style={{marginLeft:'auto',background:'#8b5cf6',color:'white',border:'none',borderRadius:'var(--r-sm)',padding:'5px 14px',fontSize:'0.72rem',fontWeight:600,cursor:'pointer'}}>
                Check Intelligence
              </button>
            )}
          </div>

          {showIntel&&intelError&&(
            <div style={{padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#dc2626',marginBottom:16}}>
              Intelligence error: {intelError}
            </div>
          )}

          {showIntel&&intel&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

              {/* ── Sector Benchmark Card ── */}
              <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                  <span style={{background:'#6366f1',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Benchmark</span>
                  <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Sector Benchmark</span>
                </div>
                {intel.quote?.benchmark?(
                  <>
                    <div style={{fontSize:'0.82rem',color:'var(--text-1)',marginBottom:8}}>
                      Avg margin for <strong>{form.segment}</strong> in <strong>{intel.quote.benchmark.borough||'area'}</strong>: <strong>{fmtPct(intel.quote.benchmark.avg_margin)}</strong>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <span style={{fontSize:'0.82rem',color:'var(--text-1)'}}>Your quote margin:</span>
                      <span style={{fontSize:'1.1rem',fontWeight:800,color:marginBadgeColor(calc.margin,intel.quote.benchmark.avg_margin||20)}}>{fmtPct(calc.margin)}</span>
                      {calc.margin>=(intel.quote.benchmark.avg_margin||20)
                        ?<span style={{fontSize:'0.65rem',background:'#10b98118',color:'#10b981',padding:'2px 8px',borderRadius:10,fontWeight:600}}>Above avg</span>
                        :<span style={{fontSize:'0.65rem',background:'#ef444418',color:'#ef4444',padding:'2px 8px',borderRadius:10,fontWeight:600}}>Below avg</span>
                      }
                    </div>
                    {intel.quote.benchmark.note&&(
                      <div style={{fontSize:'0.72rem',color:'var(--text-muted)',fontStyle:'italic',lineHeight:1.5}}>{intel.quote.benchmark.note}</div>
                    )}
                  </>
                ):(
                  <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>No benchmark data available for this sector/area.</div>
                )}
              </div>

              {/* ── Feasibility Score Card ── */}
              <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                  <span style={{background:'#0ea5e9',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Feasibility</span>
                  <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Feasibility Score</span>
                </div>
                {intel.feasibility?.score!=null?(
                  <>
                    <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:12}}>
                      <div style={{width:56,height:56,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:scoreColor(intel.feasibility.score)+'20',border:`3px solid ${scoreColor(intel.feasibility.score)}`}}>
                        <span style={{fontSize:'1.2rem',fontWeight:900,color:scoreColor(intel.feasibility.score)}}>{Math.round(intel.feasibility.score)}</span>
                      </div>
                      <div>
                        {intel.feasibility.coverage_label&&<div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text-1)'}}>{intel.feasibility.coverage_label}</div>}
                        {intel.feasibility.cleaners_nearby!=null&&<div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{intel.feasibility.cleaners_nearby} cleaners nearby</div>}
                        {intel.feasibility.travel_burden&&<div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>Travel: {intel.feasibility.travel_burden}</div>}
                      </div>
                    </div>
                    {intel.feasibility.warnings?.length>0&&(
                      <div style={{marginTop:4}}>
                        {intel.feasibility.warnings.map((w,i)=>(
                          <div key={i} style={{fontSize:'0.72rem',color:'#f59e0b',marginBottom:3}}>• {w}</div>
                        ))}
                      </div>
                    )}
                  </>
                ):(
                  <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>No feasibility data available.</div>
                )}
              </div>

              {/* ── Scenario Cards ── */}
              {scenarios&&(
                <div style={{gridColumn:'1 / -1',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                    <span style={{background:'#f59e0b',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Scenarios</span>
                    <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Pricing Scenarios</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
                    {scenarios.map((s,i)=>{
                      const isBalanced=i===1
                      return(
                        <div key={s.label} style={{
                          background:isBalanced?'#8b5cf610':'var(--bg-base)',
                          border:isBalanced?'2px solid #8b5cf6':'1px solid var(--border)',
                          borderRadius:'var(--r-lg)',padding:18,textAlign:'center',position:'relative'
                        }}>
                          {isBalanced&&<div style={{position:'absolute',top:-9,left:'50%',transform:'translateX(-50%)',background:'#8b5cf6',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 10px',borderRadius:10,textTransform:'uppercase'}}>Recommended</div>}
                          <div style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-1)',marginBottom:6,marginTop:isBalanced?4:0}}>{s.label}</div>
                          <div style={{fontSize:'1.5rem',fontWeight:900,color:'var(--text-1)',lineHeight:1}}>{fmtCur(s.price)}</div>
                          <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginBottom:8}}>/month</div>
                          <div style={{display:'flex',justifyContent:'center',gap:10}}>
                            <span style={{fontSize:'0.72rem',color:riskColor(s.margin),fontWeight:700}}>{fmtPct(s.margin)} margin</span>
                            <span style={{fontSize:'0.65rem',background:riskColor(s.margin)+'18',color:riskColor(s.margin),padding:'2px 8px',borderRadius:10,fontWeight:600}}>{s.risk} risk</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Top Matched Cleaners ── */}
              <div style={{gridColumn:'1 / -1',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                  <span style={{background:'#10b981',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Match</span>
                  <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Top Matched Cleaners</span>
                </div>
                {intel.cleaners?.matches?.length>0?(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    {intel.cleaners.matches.slice(0,3).map((c,i)=>(
                      <div key={c.id||i} style={{background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                          <span style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-1)'}}>{c.name||'Unnamed'}</span>
                          {c.match_quality&&(
                            <span style={{fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:10,
                              background:c.match_quality==='strong'?'#10b98118':c.match_quality==='good'?'#f59e0b18':'#ef444418',
                              color:c.match_quality==='strong'?'#10b981':c.match_quality==='good'?'#f59e0b':'#ef4444',
                              textTransform:'uppercase'
                            }}>{c.match_quality}</span>
                          )}
                        </div>
                        <div style={{fontSize:'0.72rem',color:'var(--text-muted)',lineHeight:1.7}}>
                          {c.distance!=null&&<div>Distance: {typeof c.distance==='number'?c.distance.toFixed(1)+' mi':c.distance}</div>}
                          {c.travel_time!=null&&<div>Travel: {c.travel_time} min</div>}
                          {c.pay_rate!=null&&<div>Pay rate: £{Number(c.pay_rate).toFixed(2)}/hr</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ):(
                  <div style={{padding:'12px 14px',background:'#fef3c718',border:'1px solid #fef3c7',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#f59e0b',fontWeight:600}}>
                    No strong cleaner matches for this postcode/hours combination. Consider expanding the search or recruiting in this area.
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* Quote History */}
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{background:'#6366f1',color:'white',fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>History</span>
            <span style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>Recent Quotes</span>
            <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{filtered.length} shown</span>
          </div>
          <div style={{display:'flex',gap:6}}>
            {[['all','All'],['web','Web Leads']].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{padding:'5px 14px',borderRadius:20,border:tab===k?'none':'1px solid var(--border)',background:tab===k?'var(--teal)':'transparent',color:tab===k?'white':'var(--text-muted)',fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}>
                {l} ({k==='all'?quotes.length:quotes.filter(q=>q.source==='web'||q.intel).length})
              </button>
            ))}
          </div>
        </div>

        {isLoading?(
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)',fontSize:'0.85rem'}}>Loading quotes...</div>
        ):filtered.length===0?(
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)',fontSize:'0.85rem'}}>No quotes yet. Use the builder above to create one.</div>
        ):(
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                {['ID','V','Client','Site','Revenue/Mo','Margin','Status','Date'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q,i)=>{
                const rev=q.monthly_revenue||q.revenue||q.quote_value_gbp||0
                const mgn=q.margin_pct!=null?q.margin_pct:(q.margin||0)
                const client=q.client_name||q.client||q.customer||'—'
                const site=q.site_address||q.site||q.address||'—'
                return(
                <tr key={q.id||i} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}} onClick={()=>setSelectedQuote(q)}>
                  <td style={{padding:'10px',color:'var(--text-1)',fontWeight:600,fontFamily:'monospace',fontSize:'0.75rem'}}>
                    {q.id?.substring(0,18)||'—'}
                    {(q.source==='web'||q.intel)&&<span style={{marginLeft:6,background:'var(--teal)',color:'white',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,fontWeight:700}}>Intel</span>}
                  </td>
                  <td style={{padding:'10px',color:'var(--text-muted)'}}>{q.version||'v1'}</td>
                  <td style={{padding:'10px',color:'var(--text-1)',fontWeight:600}}>{client}</td>
                  <td style={{padding:'10px',color:'var(--text-muted)'}}>{site}</td>
                  <td style={{padding:'10px',color:'var(--text-1)'}}>{rev?fmtCur(rev)+'/mo':'£0/mo'}</td>
                  <td style={{padding:'10px',color:mgn>minMargin?'#10b981':'#ef4444',fontWeight:600}}>{mgn?fmtPct(mgn):'0.0%'}</td>
                  <td style={{padding:'10px'}}><span style={{padding:'2px 10px',borderRadius:12,fontSize:'0.72rem',fontWeight:600,color:STATUS_COLORS[q.status]||'#6b7280',background:(STATUS_COLORS[q.status]||'#6b7280')+'18'}}>{q.status||'draft'}</span></td>
                  <td style={{padding:'10px',color:'var(--text-muted)',fontSize:'0.78rem'}}>{q.created_at?new Date(q.created_at).toLocaleDateString():'—'}</td>
                </tr>)
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          QUOTE DETAIL MODAL
         ══════════════════════════════════════════════════════════ */}
      {selectedQuote&&(()=>{
        const q=selectedQuote
        const rev=q.monthly_revenue||q.revenue||q.quote_value_gbp||0
        const cost=q.monthly_cost||q.directCost||0
        const mgn=q.margin_pct!=null?q.margin_pct:(q.margin||0)
        const client=q.client_name||q.client||q.customer||'—'
        const site=q.site_address||q.site||q.address||'—'
        const postcode=q.site_postcode||q.postcode||''
        const marginColor=mgn>=minMargin?'#10b981':mgn>=10?'#f59e0b':'#ef4444'
        const belowFloor=mgn<minMargin
        return(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}} onClick={()=>setSelectedQuote(null)}>
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',width:600,maxHeight:'85vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
              {/* Branded header */}
              <div style={{background:'linear-gradient(135deg,#0f172a,#134e4a)',padding:'20px 24px',borderRadius:'var(--r-lg) var(--r-lg) 0 0'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:'0.95rem',color:'#5eead4'}}>AskMiro Cleaning Services</div>
                    <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.5)',marginTop:2}}>Proposal for {client} · {site}</div>
                  </div>
                  <button onClick={()=>setSelectedQuote(null)} style={{background:'none',border:'none',color:'rgba(255,255,255,0.6)',fontSize:'1.2rem',cursor:'pointer',padding:4}}>✕</button>
                </div>
              </div>

              <div style={{padding:'20px 24px'}}>
                {/* ID + Status */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                  <div style={{fontFamily:'monospace',fontSize:'0.78rem',color:'var(--text-muted)'}}>
                    {q.id?.substring(0,24)} · v{q.version||1}
                    {(q.source==='web'||q.intel)&&<span style={{marginLeft:8,background:'var(--teal)',color:'white',fontSize:'0.55rem',padding:'2px 6px',borderRadius:3,fontWeight:700}}>Intel</span>}
                  </div>
                  <span style={{padding:'3px 12px',borderRadius:12,fontSize:'0.72rem',fontWeight:600,color:STATUS_COLORS[q.status]||'#6b7280',background:(STATUS_COLORS[q.status]||'#6b7280')+'18'}}>{q.status||'draft'}</span>
                </div>

                {/* Financial breakdown */}
                <div style={{border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden',marginBottom:16}}>
                  <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',background:'var(--bg-base)'}}>
                    <CalcRow label="Hours/week" value={`${q.hours_per_week||q.hoursPerWeek||'—'}h`}/>
                    <CalcRow label="Days/week" value={q.days_per_week||q.daysPerWeek||'—'}/>
                    <CalcRow label="Client Rate" value={`£${Number(q.client_rate||q.hourlyRate||0).toFixed(2)}/hr`}/>
                    {postcode&&<CalcRow label="Postcode" value={postcode}/>}
                    <CalcRow label="Sector" value={q.sector||q.segment||'—'}/>
                  </div>
                  <div style={{padding:'14px 18px'}}>
                    <CalcRow label="Monthly Revenue" value={fmtCur(rev)} bold/>
                    <CalcRow label="Direct Cost" value={fmtCur(cost)} muted/>
                    <CalcRow label="Gross Margin" value={<span style={{color:marginColor,fontWeight:700}}>{fmtPct(mgn)} ({fmtCur(rev-cost)}/mo)</span>}/>
                  </div>
                </div>

                {/* Margin warning */}
                {belowFloor&&(
                  <div style={{padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--r-sm)',marginBottom:16,fontSize:'0.78rem',color:'#dc2626',fontWeight:700}}>
                    Below {minMargin}% floor — owner must approve before sending.
                  </div>
                )}

                {/* Notes */}
                {q.notes&&(
                  <div style={{padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',marginBottom:16,fontSize:'0.82rem',color:'var(--text-muted)',lineHeight:1.6}}>
                    {q.notes}
                  </div>
                )}

                {/* Actions */}
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:8,borderTop:'1px solid var(--border)'}}>
                  <button onClick={()=>setSelectedQuote(null)} style={{padding:'8px 16px',borderRadius:'var(--r-sm)',border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.8rem',fontWeight:600,cursor:'pointer'}}>Close</button>
                  <button onClick={()=>loadIntoBuilder(q)} style={{padding:'8px 16px',borderRadius:'var(--r-sm)',border:'1px solid var(--border)',background:'transparent',color:'var(--text-1)',fontSize:'0.8rem',fontWeight:600,cursor:'pointer'}}>✎ Edit in Builder</button>
                  {!belowFloor&&(
                    <button onClick={()=>{if(q.entity_id)openLead(q.entity_id);setSelectedQuote(null)}} style={{padding:'8px 16px',borderRadius:'var(--r-sm)',border:'none',background:'var(--teal)',color:'white',fontSize:'0.8rem',fontWeight:700,cursor:'pointer'}}>Open Lead</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Field({label,value,onChange,type='text',step,placeholder}){
  return(
    <div>
      <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
      <input type={type} step={step} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.85rem',color:'var(--text-1)',fontFamily:'inherit'}}/>
    </div>
  )
}
function SelectField({label,value,onChange,options}){
  return(
    <div>
      <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.85rem',color:'var(--text-1)',fontFamily:'inherit'}}>
        {options.map(o=>{const isObj=typeof o==='object';return<option key={isObj?o.v:o} value={isObj?o.v:o}>{isObj?o.l:o}</option>})}
      </select>
    </div>
  )
}
function CalcRow({label,value,bold,muted}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'0.82rem'}}>
      <span style={{color:muted?'var(--text-muted)':'var(--text-1)',fontWeight:bold?700:400}}>{label}</span>
      <span style={{color:'var(--text-1)',fontWeight:bold?700:400}}>{value}</span>
    </div>
  )
}
