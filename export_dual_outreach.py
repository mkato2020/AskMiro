"""
export_dual_outreach.py — AskMiro Dual-Channel Outreach Export
Exports top leads with both CALL and EMAIL scripts ready to use.

Usage:
  python export_dual_outreach.py              # top 200 leads
  python export_dual_outreach.py --limit 500  # custom limit
  python export_dual_outreach.py --sector estate_agents
  python export_dual_outreach.py --generate   # generate missing outreach first
"""

import argparse
import csv
import os
import sys
import sqlite3
from datetime import datetime

DB_PATH     = "data/askmiro.db"
EXPORT_DIR  = "exports"


def export(limit=200, sector=None, generate_missing=False):
    os.makedirs(EXPORT_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    sector_filter = f"AND lr.normalized_sector LIKE '%{sector}%'" if sector else ""

    rows = conn.execute(f"""
        SELECT
            lr.place_id,
            lr.business_name,
            lr.normalized_sector,
            lr.borough,
            lr.address,
            lr.phone,
            lr.email,
            lr.website,
            lr.priority_score,
            lr.ai_business_type,
            lr.ai_decision_maker_type,
            lr.buying_signal_score,
            lr.trigger_summary,
            lr.recommended_offer,
            CASE WHEN lr.email IS NOT NULL AND lr.email != '' AND lr.email NOT LIKE 'info@%' AND lr.email NOT LIKE 'enquiries@%' AND lr.email NOT LIKE 'contact@%' THEN 1 WHEN lr.email IS NOT NULL AND lr.email != '' THEN 2 ELSE 3 END as email_priority,
            op.cold_email,
            op.call_opener,
            op.full_call_script,
            op.follow_up_email,
            op.generated_at
        FROM lead_records lr
        LEFT JOIN outreach_packages op ON lr.place_id = op.place_id
        WHERE lr.priority_score >= 70
          AND lr.ai_is_cleaning_target = 1
          AND (lr.phone IS NOT NULL AND lr.phone != '')
          {sector_filter}
        ORDER BY lr.priority_score DESC, lr.buying_signal_score DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()

    rows = [dict(r) for r in rows]

    # Split into channels
    has_both    = [r for r in rows if r["email"] and r["call_opener"]]
    call_only   = [r for r in rows if r["phone"] and not r["email"]]
    email_only  = [r for r in rows if r["email"] and not r["phone"]]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")

    # ── Export 1: Master dual-channel list ──────────────────────────────
    master_file = f"{EXPORT_DIR}/dual_outreach_{timestamp}.csv"
    with open(master_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Priority", "Business Name", "Sector", "Borough", "Address",
            "Phone", "Email", "Email Type", "Website", "Score", "Signal Score",
            "Decision Maker", "Business Type", "Trigger", "Recommended Offer",
            "Channel 1 (CALL)", "Channel 2 (EMAIL)",
            "Call Opener", "Full Call Script",
            "Email Subject", "Email Body", "Follow Up Email",
        ])
        for i, r in enumerate(rows, 1):
            # Parse email subject/body
            cold_email = r.get("cold_email") or ""
            subject = ""
            body = cold_email
            if "SUBJECT:" in cold_email:
                lines = cold_email.split("\n", 2)
                for j, line in enumerate(lines):
                    if line.startswith("SUBJECT:"):
                        subject = line.replace("SUBJECT:", "").strip()
                        body = "\n".join(lines[j+1:]).strip()
                        break

            email_type = ""
            email = r.get("email") or ""
            if email:
                generic_prefixes = ("info@","enquiries@","contact@","hello@","admin@","office@","reception@","mail@","general@","post@")
                email_type = "generic" if any(email.startswith(p) for p in generic_prefixes) else "direct"

            ch1 = "CALL" if r.get("phone") else ""
            ch2 = "EMAIL" if r.get("email") else ""

            writer.writerow([
                i,
                r["business_name"],
                r["normalized_sector"],
                r["borough"],
                r["address"],
                r.get("phone",""),
                email,
                email_type,
                r.get("website",""),
                r["priority_score"],
                r.get("buying_signal_score",""),
                r.get("ai_decision_maker_type",""),
                r.get("ai_business_type",""),
                r.get("trigger_summary",""),
                r.get("recommended_offer",""),
                ch1,
                ch2,
                r.get("call_opener","— run outreach generator —"),
                r.get("full_call_script",""),
                subject,
                body,
                r.get("follow_up_email",""),
            ])

    # ── Export 2: Call list only (clean, printable) ──────────────────────
    call_file = f"{EXPORT_DIR}/call_list_{timestamp}.csv"
    with open(call_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "#", "Business Name", "Phone", "Borough", "Sector",
            "Score", "Decision Maker", "Call Opener", "Full Call Script"
        ])
        call_rows = [r for r in rows if r.get("phone")]
        for i, r in enumerate(call_rows, 1):
            writer.writerow([
                i,
                r["business_name"],
                r["phone"],
                r["borough"],
                r["normalized_sector"],
                r["priority_score"],
                r.get("ai_decision_maker_type",""),
                r.get("call_opener","— generate outreach first —"),
                r.get("full_call_script",""),
            ])

    # ── Export 3: Email list only (clean) ───────────────────────────────
    email_file = f"{EXPORT_DIR}/email_list_{timestamp}.csv"
    with open(email_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "#", "Business Name", "Email", "Email Type", "Borough",
            "Score", "Subject", "Email Body", "Follow Up"
        ])
        email_rows = [r for r in rows if r.get("email")]
        for i, r in enumerate(email_rows, 1):
            cold_email = r.get("cold_email") or ""
            subject = ""
            body = cold_email
            if "SUBJECT:" in cold_email:
                lines = cold_email.split("\n", 2)
                for j, line in enumerate(lines):
                    if line.startswith("SUBJECT:"):
                        subject = line.replace("SUBJECT:", "").strip()
                        body = "\n".join(lines[j+1:]).strip()
                        break
            email = r.get("email","")
            generic_prefixes = ("info@","enquiries@","contact@","hello@","admin@","office@","reception@","mail@","general@","post@")
            email_type = "generic" if any(email.startswith(p) for p in generic_prefixes) else "direct"
            writer.writerow([
                i, r["business_name"], email, email_type,
                r["borough"], r["priority_score"],
                subject, body, r.get("follow_up_email",""),
            ])

    # ── Summary ──────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  AskMiro Dual-Channel Outreach Export")
    print(f"{'='*60}")
    print(f"  Total leads exported:  {len(rows):,}")
    print(f"  With phone (callable): {len([r for r in rows if r.get('phone')]):,}")
    print(f"  With email:            {len([r for r in rows if r.get('email')]):,}")
    print(f"  Direct emails:         {len([r for r in rows if r.get('email') and not any(r['email'].startswith(p) for p in ('info@','enquiries@','contact@','hello@','admin@','office@'))]):,}")
    print(f"  Both channels:         {len([r for r in rows if r.get('phone') and r.get('email')]):,}")
    print(f"  Missing scripts:       {len([r for r in rows if not r.get('call_opener')]):,}  ← run: python run_pipeline.py --outreach")
    print(f"\n  Files saved:")
    print(f"  📋 Master:  {master_file}")
    print(f"  📞 Calls:   {call_file}")
    print(f"  ✉️  Emails:  {email_file}")
    print(f"{'='*60}\n")

    return master_file, call_file, email_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit",    type=int,  default=200)
    parser.add_argument("--sector",   type=str,  default=None)
    parser.add_argument("--generate", action="store_true", help="Generate missing outreach scripts first")
    args = parser.parse_args()

    if args.generate:
        print("Generating missing outreach scripts first...")
        from outreach_generator import generate_outreach_batch
        generated = generate_outreach_batch(limit=args.limit)
        print(f"Generated {generated} new outreach packages.")

    export(limit=args.limit, sector=args.sector)
