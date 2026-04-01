"""
export_leads_pdf.py — AskMiro Lead Intelligence OS
Exports top scored leads to a branded AskMiro PDF report.

Usage:
    python export_leads_pdf.py                        # top 100 leads, score >= 55
    python export_leads_pdf.py --limit 200            # top 200
    python export_leads_pdf.py --min-score 70         # higher bar
    python export_leads_pdf.py --sector healthcare    # filter by sector
    python export_leads_pdf.py --borough Lambeth      # filter by borough
    python export_leads_pdf.py --out my_leads.pdf     # custom output path
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

BASE_DIR   = Path(__file__).resolve().parent
EXPORTS_DIR = BASE_DIR / "exports"
EXPORTS_DIR.mkdir(exist_ok=True)

# ── AskMiro brand colours (from askmiro.com) ──────────────────────────────────
TEAL        = colors.HexColor("#0A9688")   # Primary teal
TEAL_MID    = colors.HexColor("#0DBDAD")   # Teal mid
TEAL_LIGHT  = colors.HexColor("#14D4C2")   # Teal light
NAVY        = colors.HexColor("#0D1C2E")   # Dark navy
NAVY_MID    = colors.HexColor("#0e2438")   # Navy mid
BG_BASE     = colors.HexColor("#F4F8FB")   # Background base
SURFACE     = colors.white                 # Surface white
MID_GREY    = colors.HexColor("#546E7A")
LIGHT_GREY  = colors.HexColor("#ECEFF1")
BLACK       = colors.HexColor("#1A2332")

# Tinted panel backgrounds for score bands
SCORE_PANEL = {
    "priority": (colors.HexColor("#0D1C2E"), colors.HexColor("#E0FAF8")),   # 80+
    "strong":   (colors.HexColor("#0A9688"), colors.HexColor("#E8F5E9")),   # 70-79
    "good":     (colors.HexColor("#0DBDAD"), colors.HexColor("#F0FDFC")),   # 60-69
    "warm":     (MID_GREY, LIGHT_GREY),                                      # <60
}

def _score_band(score):
    if score >= 80: return "priority"
    if score >= 70: return "strong"
    if score >= 60: return "good"
    return "warm"


# ── Styles ────────────────────────────────────────────────────────────────────
def _styles():
    def s(name, **kw):
        defaults = dict(fontName="Helvetica", fontSize=9, textColor=BLACK,
                        leading=12, spaceBefore=0, spaceAfter=0)
        defaults.update(kw)
        return ParagraphStyle(name, **defaults)

    return {
        "logo_word":    s("lw", fontName="Helvetica-Bold", fontSize=18,
                          textColor=SURFACE, leading=22),
        "logo_tag":     s("lt", fontName="Helvetica", fontSize=8,
                          textColor=TEAL_MID, leading=10),
        "report_title": s("rt", fontName="Helvetica-Bold", fontSize=22,
                          textColor=SURFACE, leading=26),
        "report_sub":   s("rs", fontName="Helvetica", fontSize=10,
                          textColor=colors.HexColor("#B2DFDB"), leading=14),
        "filter_pill":  s("fp", fontName="Helvetica-Bold", fontSize=9,
                          textColor=TEAL_MID, leading=12),
        "stat_num":     s("sn", fontName="Helvetica-Bold", fontSize=20,
                          textColor=TEAL, leading=24, alignment=TA_CENTER),
        "stat_label":   s("sl", fontName="Helvetica", fontSize=7,
                          textColor=MID_GREY, leading=10, alignment=TA_CENTER),
        "section_title":s("st", fontName="Helvetica-Bold", fontSize=13,
                          textColor=NAVY, leading=16, spaceBefore=4, spaceAfter=4),
        "lead_name":    s("ln", fontName="Helvetica-Bold", fontSize=10,
                          textColor=NAVY, leading=13),
        "lead_detail":  s("ld", fontName="Helvetica", fontSize=8,
                          textColor=MID_GREY, leading=11),
        "lead_action":  s("la", fontName="Helvetica-Bold", fontSize=8,
                          textColor=TEAL, leading=11),
        "tbl_head":     s("th", fontName="Helvetica-Bold", fontSize=8,
                          textColor=SURFACE, leading=10),
        "tbl_cell":     s("tc", fontName="Helvetica", fontSize=8,
                          textColor=BLACK, leading=10),
        "intro":        s("in", fontName="Helvetica", fontSize=8,
                          textColor=MID_GREY, leading=13),
        "footer":       s("ft", fontName="Helvetica", fontSize=7,
                          textColor=MID_GREY, leading=9, alignment=TA_CENTER),
    }


# ── Data ──────────────────────────────────────────────────────────────────────
def _fetch_leads(limit, min_score, sector=None, borough=None):
    sys.path.insert(0, str(BASE_DIR))
    from database import db_connection

    cond   = ["priority_score >= ?"]
    params = [min_score]
    if sector:
        cond.append("normalized_sector = ?")
        params.append(sector)
    if borough:
        cond.append("LOWER(borough) = LOWER(?)")
        params.append(borough)

    params.append(limit)
    with db_connection() as conn:
        rows = conn.execute(f"""
            SELECT business_name, normalized_sector, borough, address,
                   phone, website, rating, review_count,
                   priority_score, high_value_target, likely_multi_site,
                   next_best_action, score_reason,
                   buying_signal_score, timing_urgency,
                   trigger_summary, recommended_offer, recommended_channel,
                   ai_business_type, ai_decision_maker_type, google_maps_url
            FROM lead_records
            WHERE {" AND ".join(cond)}
            ORDER BY priority_score DESC, high_value_target DESC, buying_signal_score DESC
            LIMIT ?
        """, params).fetchall()
    return [dict(r) for r in rows]


def _fetch_stats():
    sys.path.insert(0, str(BASE_DIR))
    from database import db_connection
    with db_connection() as conn:
        def n(sql): return conn.execute(sql).fetchone()["n"]
        return {
            "total":    n("SELECT COUNT(*) AS n FROM lead_records"),
            "ge60":     n("SELECT COUNT(*) AS n FROM lead_records WHERE priority_score >= 60"),
            "ge80":     n("SELECT COUNT(*) AS n FROM lead_records WHERE priority_score >= 80"),
            "hvt":      n("SELECT COUNT(*) AS n FROM lead_records WHERE high_value_target = 1"),
            "pipeline": n("SELECT COUNT(*) AS n FROM pipeline_leads"),
        }


# ── Cover page ────────────────────────────────────────────────────────────────
def _cover(st, stats, filters, lead_count):
    story = []
    W = A4[0] - 30*mm   # usable width

    # ── Header banner ─────────────────────────────────────────────────────────
    logo_tbl = Table(
        [[Paragraph("AskMiro", st["logo_word"]),
          Paragraph("askmiro.com", st["logo_tag"].clone("lt2", alignment=TA_RIGHT,
                    textColor=colors.HexColor("#80CBC4")))]],
        colWidths=[W*0.6, W*0.4]
    )
    logo_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), NAVY),
        ("TOPPADDING",    (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING",   (0,0), (0,-1), 8),  ("RIGHTPADDING",  (-1,0), (-1,-1), 8),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(logo_tbl)
    story.append(Spacer(1, 0.5*mm))

    # ── Teal accent strip ─────────────────────────────────────────────────────
    accent = Table([[""]], colWidths=[W])
    accent.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), TEAL),
        ("TOPPADDING",    (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    story.append(accent)
    story.append(Spacer(1, 8*mm))

    # ── Title block ───────────────────────────────────────────────────────────
    story.append(Paragraph("Lead Intelligence Report", st["report_title"].clone(
        "rt2", textColor=NAVY, fontSize=22)))
    story.append(Spacer(1, 1*mm))
    story.append(Paragraph(
        "Managed Commercial Cleaning &mdash; London &amp; UK",
        st["report_sub"].clone("rs2", textColor=MID_GREY)
    ))
    story.append(Spacer(1, 2*mm))

    # Filters / scope line
    ts = datetime.now().strftime("%d %B %Y")
    filter_parts = [f"Generated: {ts}", f"Leads included: {lead_count}"]
    if filters.get("sector"):  filter_parts.append(f"Sector: {filters['sector']}")
    if filters.get("borough"): filter_parts.append(f"Borough: {filters['borough']}")
    story.append(Paragraph("  |  ".join(filter_parts),
                            st["filter_pill"]))
    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=TEAL))
    story.append(Spacer(1, 6*mm))

    # ── Stat boxes ────────────────────────────────────────────────────────────
    def cell(num, label):
        return [Paragraph(str(num), st["stat_num"]),
                Paragraph(label,    st["stat_label"])]

    col = W / 5
    stat_tbl = Table(
        [[cell(f"{stats['total']:,}", "Total Records"),
          cell(f"{stats['ge60']:,}", "Score \u2265 60"),
          cell(f"{stats['ge80']:,}", "Score \u2265 80"),
          cell(f"{stats['hvt']:,}",  "High-Value Targets"),
          cell(f"{stats['pipeline']:,}", "In Pipeline")]],
        colWidths=[col]*5
    )
    stat_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), BG_BASE),
        ("BOX",           (0,0), (-1,-1), 0.75, TEAL),
        ("INNERGRID",     (0,0), (-1,-1), 0.5,  SURFACE),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(stat_tbl)
    story.append(Spacer(1, 8*mm))

    # ── About ─────────────────────────────────────────────────────────────────
    story.append(Paragraph("About This Report", st["section_title"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_GREY))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "This report lists the highest-scoring commercial prospects for AskMiro Cleaning "
        "Services, ranked by a composite priority score (0\u2013100) combining sector "
        "priority, London borough targeting, contact completeness, Google rating and review "
        "volume, and buying signal detection. Each lead shows a recommended next action "
        "and outreach channel.",
        st["intro"]
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        "<b>Score bands &mdash;</b> "
        "<font color='#0D1C2E'><b>80\u2013100 Priority</b></font>  "
        "<font color='#0A9688'><b>70\u201379 Strong</b></font>  "
        "<font color='#0DBDAD'><b>60\u201369 Good</b></font>  "
        "<font color='#546E7A'>Below 60 Warm</font>",
        st["intro"].clone("legend", fontSize=8)
    ))
    return story


# ── Sector summary table ──────────────────────────────────────────────────────
def _sector_table(leads, st):
    from collections import defaultdict
    buckets = defaultdict(lambda: {"count": 0, "score_sum": 0, "hvt": 0, "phone": 0})
    for r in leads:
        sec = (r.get("normalized_sector") or "other").replace("_", " ").title()
        buckets[sec]["count"]     += 1
        buckets[sec]["score_sum"] += r.get("priority_score", 0)
        buckets[sec]["hvt"]       += int(bool(r.get("high_value_target")))
        buckets[sec]["phone"]     += int(bool(r.get("phone")))

    rows = sorted(
        [(s, v["count"], round(v["score_sum"]/v["count"], 1), v["hvt"], v["phone"])
         for s, v in buckets.items()],
        key=lambda x: -x[1]
    )

    W = A4[0] - 30*mm
    story = [
        Spacer(1, 4*mm),
        Paragraph("Sector Breakdown", st["section_title"]),
        HRFlowable(width="100%", thickness=0.5, color=LIGHT_GREY),
        Spacer(1, 2*mm),
    ]

    header = [Paragraph(h, st["tbl_head"]) for h in
              ["Sector", "Leads", "Avg Score", "HVTs", "With Phone"]]
    data = [header] + [
        [Paragraph(sec, st["tbl_cell"]),
         Paragraph(str(cnt), st["tbl_cell"]),
         Paragraph(str(avg), st["tbl_cell"]),
         Paragraph(str(hvt), st["tbl_cell"]),
         Paragraph(str(ph),  st["tbl_cell"])]
        for sec, cnt, avg, hvt, ph in rows
    ]

    widths = [W*0.40, W*0.13, W*0.17, W*0.15, W*0.15]
    tbl = Table(data, colWidths=widths)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0),  NAVY),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [BG_BASE, SURFACE]),
        ("BOX",           (0,0), (-1,-1), 0.5, colors.HexColor("#CFD8DC")),
        ("INNERGRID",     (0,0), (-1,-1), 0.25, colors.HexColor("#ECEFF1")),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(tbl)
    return story


# ── Lead card ─────────────────────────────────────────────────────────────────
_ACTION_LABELS = {
    "call_first":        "Call First",
    "cold_email":        "Cold Email",
    "linkedin_search":   "LinkedIn",
    "low_priority_hold": "Hold",
    "skip":              "Skip",
}

def _lead_card(lead, st, idx):
    score  = lead.get("priority_score", 0)
    band   = _score_band(score)
    fg, bg = SCORE_PANEL[band]

    name    = lead.get("business_name") or "—"
    sector  = (lead.get("normalized_sector") or "other").replace("_", " ").title()
    borough = lead.get("borough") or "—"
    address = (lead.get("address") or "—")[:60]
    phone   = lead.get("phone") or "—"
    website = (lead.get("website") or "")[:45] or "—"
    rating  = lead.get("rating")
    reviews = lead.get("review_count")
    action  = _ACTION_LABELS.get(lead.get("next_best_action") or "", lead.get("next_best_action") or "—")
    channel = lead.get("recommended_channel") or "—"
    signal  = lead.get("buying_signal_score") or 0
    urgency = (lead.get("timing_urgency") or "low").capitalize()
    trigger = (lead.get("trigger_summary") or "")[:90]
    offer   = (lead.get("recommended_offer") or "")[:90]
    dm      = lead.get("ai_decision_maker_type") or "Facilities Manager"

    rating_str = f"{rating:.1f}/5  ({reviews or 0} reviews)" if rating else "No rating"

    badges = []
    if lead.get("high_value_target"):  badges.append("HVT")
    if lead.get("likely_multi_site"):  badges.append("Multi-site")
    badge_str = ("  " + "  ".join(f"[{b}]" for b in badges)) if badges else ""

    W = A4[0] - 30*mm

    # Name row: name left, score right
    name_row = Table(
        [[Paragraph(f"{idx}. {name}", st["lead_name"]),
          Paragraph(f"<b>{score}</b>{badge_str}",
                    st["lead_name"].clone("sc", alignment=TA_RIGHT, textColor=fg))]],
        colWidths=[W*0.75, W*0.25]
    )
    name_row.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
    ]))

    lines = [
        f"<b>Sector:</b> {sector}  |  <b>Borough:</b> {borough}  |  <b>Decision maker:</b> {dm}",
        f"<b>Address:</b> {address}",
        f"<b>Phone:</b> {phone}  |  <b>Website:</b> {website}",
        f"<b>Rating:</b> {rating_str}  |  <b>Signal score:</b> {signal}  |  <b>Urgency:</b> {urgency}",
    ]
    if trigger:
        lines.append(f"<b>Trigger:</b> {trigger}")
    if offer:
        lines.append(f"<b>Offer:</b> {offer}")

    content = (
        [name_row]
        + [Paragraph(l, st["lead_detail"]) for l in lines]
        + [Spacer(1, 3),
           Paragraph(f"Next action: {action}  |  Channel: {channel}", st["lead_action"])]
    )

    card = Table([[content]], colWidths=[W])
    card.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), bg),
        ("BOX",           (0,0), (-1,-1), 0.75, fg),
        ("LEFTPADDING",   (0,0), (-1,-1), 7),
        ("RIGHTPADDING",  (0,0), (-1,-1), 7),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    return KeepTogether([card, Spacer(1, 3.5)])


# ── Page footer ───────────────────────────────────────────────────────────────
def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MID_GREY)
    canvas.drawString(15*mm, 9*mm,
                      "AskMiro Cleaning Services  |  askmiro.com  |  Confidential")
    canvas.drawCentredString(A4[0]/2, 9*mm, f"Page {doc.page}")
    canvas.drawRightString(A4[0]-15*mm, 9*mm,
                           datetime.now().strftime("%d %b %Y"))
    # Bottom rule
    canvas.setStrokeColor(TEAL)
    canvas.setLineWidth(1)
    canvas.line(15*mm, 12*mm, A4[0]-15*mm, 12*mm)
    canvas.restoreState()


# ── Build ─────────────────────────────────────────────────────────────────────
def build_pdf(leads, stats, out_path, filters):
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=14*mm,  bottomMargin=20*mm,
        title="AskMiro Lead Intelligence Report",
        author="AskMiro OS",
        subject="Commercial Cleaning Prospects — London",
    )

    st    = _styles()
    story = []

    story += _cover(st, stats, filters, len(leads))
    story += _sector_table(leads, st)
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(f"Top {len(leads)} Leads — Ranked by Priority Score",
                            st["section_title"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_GREY))
    story.append(Spacer(1, 3*mm))
    for i, lead in enumerate(leads, 1):
        story.append(_lead_card(lead, st, i))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Export top leads to branded AskMiro PDF")
    parser.add_argument("--limit",     type=int, default=100)
    parser.add_argument("--min-score", type=int, default=55)
    parser.add_argument("--sector",    type=str, default=None)
    parser.add_argument("--borough",   type=str, default=None)
    parser.add_argument("--out",       type=str, default=None)
    args = parser.parse_args()

    leads = _fetch_leads(args.limit, args.min_score, args.sector, args.borough)
    if not leads:
        print("No leads found matching those filters.")
        sys.exit(1)

    stats = _fetch_stats()
    ts    = datetime.now().strftime("%Y%m%d_%H%M%S")
    out   = Path(args.out) if args.out else EXPORTS_DIR / f"askmiro_leads_{ts}.pdf"

    build_pdf(leads, stats, out, {"sector": args.sector, "borough": args.borough})
    print(f"PDF exported: {out}  ({len(leads)} leads)")


if __name__ == "__main__":
    main()
