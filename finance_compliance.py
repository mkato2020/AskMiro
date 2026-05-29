"""
finance_compliance.py — UK statutory finance intelligence for AskMiro OS
═══════════════════════════════════════════════════════════════════════════════
The "accountant brain". Given a company profile + financial figures, it computes
the company's real position against UK statutory obligations:

  • Accounting periods + Accounting Reference Date (ARD)
  • Companies House annual-accounts filing deadline
  • Corporation Tax (CT600) filing + payment deadlines
  • Confirmation statement (CS01) timing
  • VAT registration threshold (rolling 12-month) tracking
  • Corporation Tax estimate (small-profits rate)
  • Micro-entity (FRS 105) eligibility + dormancy detection
  • Books-of-account completeness assessment
  • A prioritised, plain-English action list

Design goals (this ships in a SaaS we intend to sell, so):
  • PURE + TESTABLE — no DB, no network. Inputs in, assessment out.
  • SOURCED — every statutory constant cites the rule it encodes.
  • HONEST — where a fact can't be derived (e.g. was FY1 dormant?), it returns
    a QUESTION for the operator, never a fabricated answer.
  • OVERRIDABLE — authoritative Companies House-stated dates always win over
    computed ones (CH can shift dates; we never argue with the register).

⚠️  This is decision-support, not regulated accountancy advice. Figures are
    estimates to be confirmed with a qualified accountant before filing.
═══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional
import calendar

# ── UK statutory constants (FY 2024/25 onward) ──────────────────────────────
VAT_REGISTRATION_THRESHOLD = 90_000      # GOV.UK, from 1 Apr 2024
VAT_DEREGISTRATION_THRESHOLD = 88_000
VAT_STANDARD_RATE = 0.20
CT_SMALL_PROFITS_RATE = 0.19             # profits ≤ £50,000
CT_MAIN_RATE = 0.25                      # profits ≥ £250,000 (marginal relief between)
CT_SMALL_PROFITS_LIMIT = 50_000
CT_MAIN_RATE_LIMIT = 250_000
# Micro-entity (FRS 105) — must meet 2 of 3 (Companies Act 2006 s384A)
MICRO_TURNOVER = 632_000
MICRO_BALANCE_SHEET = 316_000
MICRO_EMPLOYEES = 10
# Small company (FRS 102 1A) thresholds — for context
SMALL_TURNOVER = 10_200_000

DISCLAIMER = ("Estimates for decision-support only — not regulated accountancy "
              "advice. Confirm with a qualified accountant before filing.")


# ── helpers ──────────────────────────────────────────────────────────────────
def _last_day_of_month(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])

def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)

def _parse(d) -> Optional[date]:
    if d is None or d == "":
        return None
    if isinstance(d, date):
        return d
    return date.fromisoformat(str(d)[:10])

def _fmt(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None

def _days_until(target: Optional[date], today: date) -> Optional[int]:
    return (target - today).days if target else None


@dataclass
class CompanyProfile:
    name: str
    company_number: str
    incorporation_date: date
    # Authoritative Companies House-stated dates (override computed values).
    ard_override: Optional[date] = None
    accounts_due_override: Optional[date] = None
    confirmation_statement_due_override: Optional[date] = None
    vat_registered: bool = False
    employees: int = 0
    balance_sheet_total: float = 0.0


@dataclass
class FinancialPeriod:
    """Figures for one accounting period."""
    revenue: float = 0.0
    expenses: float = 0.0               # DEDUCTIBLE, receipt-backed expenses only
    rolling_12m_turnover: float = 0.0   # for VAT threshold (most recent 12 months)
    income_records: int = 0             # count of income transactions on file
    expense_records: int = 0
    has_bank_records: bool = False
    # Money paid to a director's personal account WITHOUT a supplier receipt.
    # Not a P&L expense — a director's loan movement. Overdrawn DLA at year-end,
    # unrepaid within 9 months, triggers s455 tax at 33.75% (CTA 2010 s455).
    directors_loan_outflow: float = 0.0
    directors_loan_records: int = 0


# ── ARD + period logic (Companies Act 2006) ──────────────────────────────────
def compute_ard(profile: CompanyProfile) -> date:
    """Default ARD = last day of the month of the FIRST anniversary of
    incorporation (CA2006 s391). CH-stated override always wins."""
    if profile.ard_override:
        return profile.ard_override
    first_anniv = _add_months(profile.incorporation_date, 12)
    return _last_day_of_month(first_anniv)


def first_accounts_deadline(profile: CompanyProfile) -> date:
    """First annual accounts due 21 months after incorporation (CA2006 s442)."""
    if profile.accounts_due_override:
        return profile.accounts_due_override
    return _add_months(profile.incorporation_date, 21)


def ct_periods(incorp: date, ard: date) -> list[tuple[date, date]]:
    """A Corporation Tax accounting period cannot exceed 12 months. The first
    (long) Companies House period is therefore split into a 12-month CT period
    plus a stub for HMRC (CTA 2009 s9-10)."""
    total_days = (ard - incorp).days + 1
    if total_days <= 366:
        return [(incorp, ard)]
    twelve_end = _add_months(incorp, 12) - timedelta(days=1)
    return [(incorp, twelve_end), (twelve_end + timedelta(days=1), ard)]


def corporation_tax(profit: float) -> tuple[float, float]:
    """Returns (rate_used, tax_due). Small-profits rate for profit ≤ £50k."""
    if profit <= 0:
        return 0.0, 0.0
    if profit <= CT_SMALL_PROFITS_LIMIT:
        return CT_SMALL_PROFITS_RATE, round(profit * CT_SMALL_PROFITS_RATE, 2)
    if profit >= CT_MAIN_RATE_LIMIT:
        return CT_MAIN_RATE, round(profit * CT_MAIN_RATE, 2)
    # Marginal relief band — effective rate between 19% and 25%
    marginal = CT_MAIN_RATE * profit - (3/200) * (CT_MAIN_RATE_LIMIT - profit)
    return round(marginal / profit, 4), round(marginal, 2)


# ── the assessment ───────────────────────────────────────────────────────────
def assess(profile: CompanyProfile, fy: FinancialPeriod, today: Optional[date] = None) -> dict:
    today = today or date.today()
    ard = compute_ard(profile)
    period_start = profile.incorporation_date
    accounts_due = first_accounts_deadline(profile)

    # CT deadlines: filing 12 months after period end; payment 9m+1d after end.
    ct_filing_due = _add_months(ard, 12)
    ct_payment_due = _add_months(ard, 9) + timedelta(days=1)

    # Confirmation statement (CS01): review date = anniversary of incorporation;
    # due within 14 days. CH override wins.
    if profile.confirmation_statement_due_override:
        cs_due = profile.confirmation_statement_due_override
    else:
        review = _add_months(profile.incorporation_date, 12)
        cs_due = review + timedelta(days=14)

    # Dormancy: ANY transaction (incl. a director's-loan movement or a single
    # insurance premium) means the period is NOT dormant.
    period_has_activity = (fy.revenue > 0 or fy.expenses > 0 or
                           fy.income_records > 0 or fy.expense_records > 0 or
                           fy.directors_loan_outflow > 0 or fy.directors_loan_records > 0)
    dormant_candidate = not period_has_activity

    # Profit + CT estimate
    profit = round(fy.revenue - fy.expenses, 2)
    ct_rate, ct_due_amount = corporation_tax(profit)

    # VAT threshold position
    vat_used_pct = round(fy.rolling_12m_turnover / VAT_REGISTRATION_THRESHOLD * 100, 1) if VAT_REGISTRATION_THRESHOLD else 0
    vat_headroom = round(VAT_REGISTRATION_THRESHOLD - fy.rolling_12m_turnover, 2)
    if profile.vat_registered:
        vat_status = "registered"
    elif fy.rolling_12m_turnover >= VAT_REGISTRATION_THRESHOLD:
        vat_status = "threshold_breached"   # must register within 30 days
    elif vat_used_pct >= 80:
        vat_status = "approaching"
    else:
        vat_status = "below_threshold"

    # Micro-entity eligibility (2 of 3)
    micro_tests = [fy.revenue <= MICRO_TURNOVER,
                   profile.balance_sheet_total <= MICRO_BALANCE_SHEET,
                   profile.employees <= MICRO_EMPLOYEES]
    micro_eligible = sum(micro_tests) >= 2

    # Books-of-account completeness (CA2006 s386 — adequate records)
    checks = {
        "income_recorded": fy.income_records > 0 or fy.revenue > 0,
        "expenses_recorded": fy.expense_records > 0 or not period_has_activity,
        "bank_records_present": fy.has_bank_records,
        "company_profile_complete": bool(profile.company_number and profile.incorporation_date),
    }
    completeness = round(sum(1 for v in checks.values() if v) / len(checks) * 100)

    # ── prioritised actions ──────────────────────────────────────────────────
    actions = []
    d_acc = _days_until(accounts_due, today)
    if d_acc is not None:
        urgency = "high" if d_acc < 60 else "medium" if d_acc < 180 else "low"
        actions.append({
            "priority": urgency,
            "title": f"File first annual accounts with Companies House",
            "due": _fmt(accounts_due), "days_left": d_acc,
            "detail": (f"Covers {_fmt(period_start)} → {_fmt(ard)}. "
                       + ("If the company did NOT trade in this period you can file "
                          "DORMANT accounts (form AA02) — far simpler and no Corporation "
                          "Tax due. Confirm whether any income or expense occurred before "
                          f"{_fmt(ard)}." if dormant_candidate else
                          f"Micro-entity accounts (FRS 105) — you qualify." if micro_eligible else
                          "Small-company accounts (FRS 102 1A).")),
        })
    if not dormant_candidate:
        d_ct = _days_until(ct_payment_due, today)
        actions.append({
            "priority": "high" if (d_ct or 999) < 90 else "medium",
            "title": "Pay Corporation Tax (then file CT600)",
            "due": _fmt(ct_payment_due), "days_left": d_ct,
            "detail": (f"Estimated CT on £{profit:,.0f} profit ≈ £{ct_due_amount:,.0f} "
                       f"at {ct_rate*100:.0f}%. Payment due {_fmt(ct_payment_due)}; "
                       f"CT600 filing due {_fmt(ct_filing_due)}."),
        })
    d_cs = _days_until(cs_due, today)
    if d_cs is not None:
        actions.append({
            "priority": "high" if d_cs < 30 else "low",
            "title": "File confirmation statement (CS01)",
            "due": _fmt(cs_due), "days_left": d_cs,
            "detail": "Annual confirmation of company details — separate from accounts. £34 online.",
        })
    if vat_status == "threshold_breached":
        actions.append({"priority": "high", "title": "Register for VAT within 30 days",
                        "due": None, "days_left": None,
                        "detail": f"Rolling 12-month turnover £{fy.rolling_12m_turnover:,.0f} "
                                  f"exceeds the £{VAT_REGISTRATION_THRESHOLD:,.0f} threshold."})
    elif vat_status == "approaching":
        actions.append({"priority": "medium", "title": "Monitor VAT threshold",
                        "due": None, "days_left": None,
                        "detail": f"At {vat_used_pct}% of the £{VAT_REGISTRATION_THRESHOLD:,.0f} "
                                  f"threshold (£{vat_headroom:,.0f} headroom on a rolling 12-month basis)."})
    if completeness < 100:
        missing = [k for k, v in checks.items() if not v]
        actions.append({"priority": "medium", "title": "Complete books of account",
                        "due": None, "days_left": None,
                        "detail": "Missing: " + ", ".join(m.replace("_", " ") for m in missing)
                                  + ". Companies Act 2006 s386 requires adequate accounting records."})

    # Director's loan exposure — transfers to a director without supplier receipts.
    dla = round(fy.directors_loan_outflow, 2)
    if dla > 0:
        s455 = round(dla * 0.3375, 2)
        actions.append({
            "priority": "high",
            "title": f"Provide receipts for £{dla:,.0f} paid to director, or treat as a loan",
            "due": _fmt(_add_months(ard, 9)), "days_left": _days_until(_add_months(ard, 9), today),
            "detail": (f"£{dla:,.0f} was transferred to a director's personal account with no supplier "
                       f"receipt on file. These are NOT deductible expenses until itemised receipts exist. "
                       f"Untreated, this is an overdrawn director's loan: if not repaid or evidenced within "
                       f"9 months of year-end, HMRC charges s455 tax of ~£{s455:,.0f} (33.75%). "
                       f"Send the supplier receipts to reclassify as expenses, or repay the company."),
        })

    order = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda a: (order.get(a["priority"], 3), a.get("days_left") or 9999))

    return {
        "disclaimer": DISCLAIMER,
        "company": {
            "name": profile.name, "company_number": profile.company_number,
            "incorporation_date": _fmt(profile.incorporation_date),
            "vat_registered": profile.vat_registered,
        },
        "accounting_period": {
            "start": _fmt(period_start), "end": _fmt(ard),
            "ard": _fmt(ard),
            "ct_periods": [{"from": _fmt(a), "to": _fmt(b)} for a, b in ct_periods(period_start, ard)],
        },
        "filing_deadlines": {
            "companies_house_accounts": {"due": _fmt(accounts_due), "days_left": _days_until(accounts_due, today)},
            "corporation_tax_payment": {"due": _fmt(ct_payment_due), "days_left": _days_until(ct_payment_due, today)},
            "corporation_tax_return": {"due": _fmt(ct_filing_due), "days_left": _days_until(ct_filing_due, today)},
            "confirmation_statement": {"due": _fmt(cs_due), "days_left": _days_until(cs_due, today)},
        },
        "profit_and_tax": {
            "revenue": round(fy.revenue, 2), "expenses": round(fy.expenses, 2),
            "profit": profit, "ct_rate_pct": round(ct_rate * 100, 1),
            "corporation_tax_estimate": ct_due_amount,
        },
        "vat": {
            "status": vat_status, "rolling_12m_turnover": round(fy.rolling_12m_turnover, 2),
            "threshold": VAT_REGISTRATION_THRESHOLD, "used_pct": vat_used_pct, "headroom": vat_headroom,
        },
        "accounts_basis": {
            "dormant_candidate": dormant_candidate,
            "micro_entity_eligible": micro_eligible,
            "recommended_filing": ("Dormant accounts (AA02) — confirm no trading first" if dormant_candidate
                                   else "Micro-entity accounts (FRS 105)" if micro_eligible
                                   else "Small-company accounts (FRS 102 1A)"),
        },
        "books_completeness": {"score_pct": completeness, "checks": checks},
        "directors_loan": {
            "outflow_unevidenced": round(fy.directors_loan_outflow, 2),
            "records": fy.directors_loan_records,
            "s455_risk_estimate": round(fy.directors_loan_outflow * 0.3375, 2) if fy.directors_loan_outflow > 0 else 0.0,
            "note": ("Transfers to a director without supplier receipts. Provide receipts to reclassify "
                     "as deductible expenses, or repay within 9 months of year-end to avoid s455 tax."),
        },
        "actions": actions,
    }


# ── standalone sanity check (run: python finance_compliance.py) ──────────────
if __name__ == "__main__":
    import json
    miro = CompanyProfile(
        name="Miro Partners Ltd", company_number="16315754",
        incorporation_date=date(2025, 3, 14),
        accounts_due_override=date(2026, 12, 14),
        confirmation_statement_due_override=date(2027, 3, 11),
        vat_registered=False, employees=0,
    )
    # FY1 (to 31 Mar 2026): NOT dormant — one insurance premium £39.79 on 3 Mar 2026.
    fy1 = FinancialPeriod(revenue=0, expenses=39.79, rolling_12m_turnover=570,
                          income_records=0, expense_records=1, has_bank_records=True)
    print("── FY1 (14 Mar 2025 → 31 Mar 2026) ──")
    print(json.dumps(assess(miro, fy1, today=date(2026, 5, 22)), indent=2))
