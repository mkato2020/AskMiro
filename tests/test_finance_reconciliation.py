"""
Unit tests for finance_reconciliation — the accuracy gate.

Run:
    cd /path/to/AskMiro-main && pytest tests/test_finance_reconciliation.py -v

Proves the reconciliation identity (opening + in − out − fees == closing) and
that the system correctly REFUSES to trust unbalanced or uncategorised books.
Integer-pence maths means no floating-point "out by 1p" is possible.
"""
from __future__ import annotations
import finance_reconciliation as r


class TestPence:
    def test_round_trip(self):
        assert r.to_pence(39.82) == 3982
        assert r.to_gbp(3982) == 39.82

    def test_no_float_drift_on_known_trap(self):
        # 0.1 + 0.2 != 0.3 in float; in pence it's exact.
        assert r.to_pence(0.1) + r.to_pence(0.2) == r.to_pence(0.3)


class TestReconcile:
    def test_balanced_ledger_reconciles(self):
        movs = [
            r.Movement.gbp("2026-04-01", "sale", "in", 100.00, "Sales", "ref1"),
            r.Movement.gbp("2026-04-02", "supplies", "out", 30.00, "Supplies", "ref2"),
            r.Movement.gbp("2026-04-03", "fee", "fee", 0.20, "Bank Charges", "ref3"),
        ]
        rec = r.reconcile(10.00, 79.80, movs)  # 10 + 100 - 30 - 0.20 = 79.80
        assert rec.reconciled is True
        assert rec.discrepancy_pence == 0

    def test_one_penny_out_is_caught(self):
        movs = [r.Movement.gbp("2026-04-01", "sale", "in", 100.00, "Sales", "ref1")]
        rec = r.reconcile(0.00, 99.99, movs)  # should be 100.00
        assert rec.reconciled is False
        assert rec.discrepancy_pence == 1          # exactly 1p, detected
        assert "NOT RECONCILED" in rec.as_dict()["verdict"]

    def test_uncategorised_line_blocks_reconciliation(self):
        # Balances perfectly, but one line has no category → not trustworthy.
        movs = [r.Movement.gbp("2026-04-01", "mystery", "out", 50.00, "", "ref1")]
        rec = r.reconcile(50.00, 0.00, movs)
        assert rec.discrepancy_pence == 0          # arithmetic balances
        assert rec.reconciled is False             # but blocked on categorisation
        assert len(rec.uncategorised) == 1

    def test_unsourced_lines_reported(self):
        movs = [r.Movement.gbp("2026-04-01", "sale", "in", 100.00, "Sales", "")]
        rec = r.reconcile(0.00, 100.00, movs)
        assert len(rec.unsourced) == 1             # flagged for audit trail


class TestMiroRegression:
    """The real Tide statement MUST reconcile to the penny, forever."""
    def test_tide_statement_reconciles_exactly(self):
        rec = r.miro_tide_27feb_27may()
        assert rec.reconciled is True
        assert rec.discrepancy_pence == 0
        assert rec.as_dict()["closing_balance_computed"] == 213.41

    def test_tide_totals_match_statement(self):
        rec = r.miro_tide_27feb_27may()
        # Compare in integer pence — the whole point of the module (float would
        # give 680.43 + 0.8 = 681.2299999...). Statement: paid in 854.64, out 681.23.
        assert rec.total_in_pence == r.to_pence(854.64)
        assert rec.total_out_pence + rec.total_fees_pence == r.to_pence(681.23)

    def test_every_line_is_categorised_and_sourced(self):
        rec = r.miro_tide_27feb_27may()
        assert rec.uncategorised == []
        assert rec.unsourced == []
