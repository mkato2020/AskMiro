"""
Unit tests for finance_compliance — the UK statutory finance engine.

Run:
    cd /path/to/AskMiro-main && pytest tests/test_finance_compliance.py -v

No DB, no network. Pure-logic coverage of every statutory rule, plus
regression tests that lock in Miro Partners Ltd's verified FY1/FY2 numbers
(reconciled against the Tide bank statement + supplier receipts). Because
this engine ships in a SaaS sold on accuracy, the statutory maths must be
provably correct — a wrong filing date or CT figure is a real-world penalty.
"""
from __future__ import annotations
from datetime import date
import pytest

import finance_compliance as fc


# ── fixtures ─────────────────────────────────────────────────────────────────
def miro_profile(**over):
    base = dict(
        name="Miro Partners Ltd", company_number="16315754",
        incorporation_date=date(2025, 3, 14),
        accounts_due_override=date(2026, 12, 14),
        confirmation_statement_due_override=date(2027, 3, 11),
        vat_registered=False, employees=0, balance_sheet_total=0.0,
    )
    base.update(over)
    return fc.CompanyProfile(**base)


# ── ARD computation ──────────────────────────────────────────────────────────
class TestARD:
    def test_default_ard_is_month_end_of_first_anniversary(self):
        p = fc.CompanyProfile(name="X", company_number="1", incorporation_date=date(2025, 3, 14))
        assert fc.compute_ard(p) == date(2026, 3, 31)

    def test_incorporation_on_month_end(self):
        p = fc.CompanyProfile(name="X", company_number="1", incorporation_date=date(2025, 1, 31))
        assert fc.compute_ard(p) == date(2026, 1, 31)

    def test_ard_override_wins(self):
        p = fc.CompanyProfile(name="X", company_number="1",
                              incorporation_date=date(2025, 3, 14), ard_override=date(2026, 4, 30))
        assert fc.compute_ard(p) == date(2026, 4, 30)


# ── filing deadlines ─────────────────────────────────────────────────────────
class TestDeadlines:
    def test_first_accounts_due_21_months_after_incorporation(self):
        p = fc.CompanyProfile(name="X", company_number="1", incorporation_date=date(2025, 3, 14))
        assert fc.first_accounts_deadline(p) == date(2026, 12, 14)

    def test_accounts_due_override_wins(self):
        assert fc.first_accounts_deadline(miro_profile()) == date(2026, 12, 14)

    def test_ct_payment_and_filing_in_assessment(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(), today=date(2026, 5, 22))
        # ARD 31 Mar 2026 → CT payment 9m+1d, CT return 12m.
        assert a["filing_deadlines"]["corporation_tax_payment"]["due"] == "2027-01-01"
        assert a["filing_deadlines"]["corporation_tax_return"]["due"] == "2027-03-31"
        assert a["filing_deadlines"]["confirmation_statement"]["due"] == "2027-03-11"


# ── CT period splitting ──────────────────────────────────────────────────────
class TestCTPeriods:
    def test_long_first_period_splits_into_12m_plus_stub(self):
        periods = fc.ct_periods(date(2025, 3, 14), date(2026, 3, 31))
        assert len(periods) == 2
        assert periods[0] == (date(2025, 3, 14), date(2026, 3, 13))
        assert periods[1] == (date(2026, 3, 14), date(2026, 3, 31))

    def test_short_period_not_split(self):
        periods = fc.ct_periods(date(2025, 4, 1), date(2026, 3, 31))
        assert len(periods) == 1


# ── corporation tax bands ────────────────────────────────────────────────────
class TestCorporationTax:
    def test_nil_on_zero_or_loss(self):
        assert fc.corporation_tax(0) == (0.0, 0.0)
        assert fc.corporation_tax(-100) == (0.0, 0.0)

    def test_small_profits_rate_19pct(self):
        rate, due = fc.corporation_tax(10_000)
        assert rate == 0.19 and due == 1900.0

    def test_small_profits_boundary_50k(self):
        rate, due = fc.corporation_tax(50_000)
        assert rate == 0.19 and due == 9500.0

    def test_main_rate_25pct_above_250k(self):
        rate, due = fc.corporation_tax(300_000)
        assert rate == 0.25 and due == 75_000.0

    def test_marginal_relief_band(self):
        rate, due = fc.corporation_tax(100_000)
        # Effective rate sits strictly between small and main rates.
        assert 0.19 < rate < 0.25
        assert 19_000 < due < 25_000


# ── VAT threshold ────────────────────────────────────────────────────────────
class TestVAT:
    def test_below_threshold(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(rolling_12m_turnover=570), today=date(2026, 5, 22))
        assert a["vat"]["status"] == "below_threshold"
        assert a["vat"]["headroom"] == pytest.approx(89_430.0)

    def test_approaching_at_80pct(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(rolling_12m_turnover=75_000), today=date(2026, 5, 22))
        assert a["vat"]["status"] == "approaching"

    def test_threshold_breached(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(rolling_12m_turnover=95_000), today=date(2026, 5, 22))
        assert a["vat"]["status"] == "threshold_breached"
        assert any("Register for VAT" in act["title"] for act in a["actions"])

    def test_registered_short_circuits(self):
        a = fc.assess(miro_profile(vat_registered=True),
                      fc.FinancialPeriod(rolling_12m_turnover=120_000), today=date(2026, 5, 22))
        assert a["vat"]["status"] == "registered"


# ── dormancy ─────────────────────────────────────────────────────────────────
class TestDormancy:
    def test_truly_empty_period_is_dormant_candidate(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(), today=date(2026, 5, 22))
        assert a["accounts_basis"]["dormant_candidate"] is True

    def test_single_expense_breaks_dormancy(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(expenses=39.79, expense_records=1),
                      today=date(2026, 5, 22))
        assert a["accounts_basis"]["dormant_candidate"] is False

    def test_director_loan_movement_breaks_dormancy(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(directors_loan_inflow=40),
                      today=date(2026, 5, 22))
        assert a["accounts_basis"]["dormant_candidate"] is False


# ── director's loan netting + s455 ───────────────────────────────────────────
class TestDirectorsLoan:
    def test_net_owed_by_director_and_s455(self):
        fy = fc.FinancialPeriod(directors_loan_outflow=561, directors_loan_inflow=371.84)
        a = fc.assess(miro_profile(), fy, today=date(2026, 5, 27))
        dl = a["directors_loan"]
        assert dl["net_owed_by_director"] == pytest.approx(189.16)
        assert dl["s455_risk_estimate"] == pytest.approx(63.84, abs=0.01)
        assert any("director's loan" in act["title"].lower() for act in a["actions"])

    def test_net_in_directors_favour_has_no_s455(self):
        fy = fc.FinancialPeriod(directors_loan_outflow=100, directors_loan_inflow=400)
        a = fc.assess(miro_profile(), fy, today=date(2026, 5, 27))
        assert a["directors_loan"]["net_owed_by_director"] == 0.0
        assert a["directors_loan"]["s455_risk_estimate"] == 0.0
        # A low-priority reconcile action, not a high-priority s455 warning.
        dla_actions = [x for x in a["actions"] if "director" in x["title"].lower()]
        assert dla_actions and dla_actions[0]["priority"] == "low"


# ── micro-entity eligibility ─────────────────────────────────────────────────
class TestMicroEntity:
    def test_small_company_is_micro_eligible(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(revenue=570), today=date(2026, 5, 22))
        assert a["accounts_basis"]["micro_entity_eligible"] is True

    def test_large_turnover_not_micro(self):
        a = fc.assess(miro_profile(employees=50, balance_sheet_total=999_999),
                      fc.FinancialPeriod(revenue=2_000_000), today=date(2026, 5, 22))
        assert a["accounts_basis"]["micro_entity_eligible"] is False


# ── books completeness ───────────────────────────────────────────────────────
class TestBooksCompleteness:
    def test_completeness_score_in_range(self):
        a = fc.assess(miro_profile(), fc.FinancialPeriod(revenue=570, income_records=2,
                      expense_records=8, has_bank_records=True), today=date(2026, 5, 22))
        assert 0 <= a["books_completeness"]["score_pct"] <= 100


# ── REGRESSION: Miro Partners verified numbers ───────────────────────────────
# These lock in the figures reconciled from the Tide statement + receipts.
# If a future refactor changes them, that's a real-world filing error.
class TestMiroRegression:
    def test_fy1_not_dormant_micro_entity_loss(self):
        # FY1: one insurance premium £39.79 on 3 Mar 2026.
        a = fc.assess(miro_profile(),
                      fc.FinancialPeriod(revenue=0, expenses=39.79, expense_records=1,
                                         has_bank_records=True), today=date(2026, 5, 22))
        assert a["accounts_basis"]["dormant_candidate"] is False
        assert a["accounts_basis"]["recommended_filing"] == "Micro-entity accounts (FRS 105)"
        assert a["profit_and_tax"]["profit"] == pytest.approx(-39.79)

    def test_fy2_reconciled_profit_and_dla(self):
        # Revenue £570; deductible £167.64; DLA out £561, in £371.84.
        fy2 = fc.FinancialPeriod(revenue=570, expenses=167.64, rolling_12m_turnover=570,
                                 income_records=2, expense_records=11, has_bank_records=True,
                                 directors_loan_outflow=561, directors_loan_inflow=371.84,
                                 directors_loan_records=9)
        a = fc.assess(miro_profile(), fy2, today=date(2026, 5, 27))
        assert a["profit_and_tax"]["profit"] == pytest.approx(402.36)
        assert a["profit_and_tax"]["corporation_tax_estimate"] == pytest.approx(76.45, abs=0.01)
        assert a["directors_loan"]["net_owed_by_director"] == pytest.approx(189.16)
        assert a["vat"]["status"] == "below_threshold"


# ── contract: output shape is stable for the API/UI ──────────────────────────
def test_assessment_contract_keys():
    a = fc.assess(miro_profile(), fc.FinancialPeriod(), today=date(2026, 5, 22))
    for key in ("disclaimer", "company", "accounting_period", "filing_deadlines",
                "profit_and_tax", "vat", "accounts_basis", "books_completeness",
                "directors_loan", "actions"):
        assert key in a, f"missing top-level key: {key}"
    assert isinstance(a["actions"], list)
