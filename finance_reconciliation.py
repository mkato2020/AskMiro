"""
finance_reconciliation.py — the accuracy guarantee
═══════════════════════════════════════════════════════════════════════════════
"100% accuracy" in accounting is not a promise a tool can make about the world —
it's a property you ENFORCE: every figure must tie back to the bank, to the
penny, and anything that doesn't balance is flagged, not guessed.

This module is the gate. Given a bank statement's opening + closing balance and
the list of booked movements, it proves the books are complete and correct:

        opening + Σ(money in) − Σ(money out) − Σ(fees)  ==  closing

If that identity holds to the penny AND every line is categorised, the period is
RECONCILED and downstream figures (P&L, CT, VAT, DLA) can be trusted. If it
doesn't, the system reports the exact discrepancy and withholds trust — it never
ships an unreconciled number into a filing.

Pure + testable. No DB, no network. Money handled in integer pence to eliminate
floating-point error entirely (the classic source of "out by 1p").
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

PENNY = 1  # integer pence is the unit of truth


def to_pence(gbp: float) -> int:
    """Convert pounds to integer pence with correct rounding (banker-safe)."""
    return int(round(float(gbp) * 100))


def to_gbp(pence: int) -> float:
    return round(pence / 100, 2)


@dataclass
class Movement:
    date: str
    description: str
    direction: Literal["in", "out", "fee"]
    amount_pence: int
    category: str = ""
    source_ref: str = ""          # bank line / receipt / invoice — the audit trail

    @classmethod
    def gbp(cls, date, description, direction, amount, category="", source_ref=""):
        return cls(date, description, direction, to_pence(amount), category, source_ref)


@dataclass
class Reconciliation:
    reconciled: bool
    opening_pence: int
    closing_pence: int
    computed_closing_pence: int
    discrepancy_pence: int
    total_in_pence: int
    total_out_pence: int
    total_fees_pence: int
    uncategorised: list = field(default_factory=list)
    unsourced: list = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "reconciled": self.reconciled,
            "opening_balance": to_gbp(self.opening_pence),
            "closing_balance_statement": to_gbp(self.closing_pence),
            "closing_balance_computed": to_gbp(self.computed_closing_pence),
            "discrepancy": to_gbp(self.discrepancy_pence),
            "total_in": to_gbp(self.total_in_pence),
            "total_out": to_gbp(self.total_out_pence),
            "total_fees": to_gbp(self.total_fees_pence),
            "uncategorised_count": len(self.uncategorised),
            "unsourced_count": len(self.unsourced),
            "uncategorised": self.uncategorised,
            "verdict": ("RECONCILED — books tie to bank to the penny; figures are trustworthy."
                        if self.reconciled else
                        f"NOT RECONCILED — out by £{to_gbp(abs(self.discrepancy_pence))}. "
                        "Do not file until resolved."),
        }


def reconcile(opening_gbp: float, closing_gbp: float, movements: list) -> Reconciliation:
    """Prove the ledger ties to the bank statement. All maths in integer pence."""
    opening = to_pence(opening_gbp)
    closing = to_pence(closing_gbp)
    total_in = sum(m.amount_pence for m in movements if m.direction == "in")
    total_out = sum(m.amount_pence for m in movements if m.direction == "out")
    total_fees = sum(m.amount_pence for m in movements if m.direction == "fee")

    computed_closing = opening + total_in - total_out - total_fees
    discrepancy = computed_closing - closing

    uncategorised = [f"{m.date} {m.description} (£{to_gbp(m.amount_pence)})"
                     for m in movements if not m.category]
    unsourced = [f"{m.date} {m.description}" for m in movements if not m.source_ref]

    reconciled = (discrepancy == 0) and (len(uncategorised) == 0)

    return Reconciliation(
        reconciled=reconciled, opening_pence=opening, closing_pence=closing,
        computed_closing_pence=computed_closing, discrepancy_pence=discrepancy,
        total_in_pence=total_in, total_out_pence=total_out, total_fees_pence=total_fees,
        uncategorised=uncategorised, unsourced=unsourced,
    )


# ── Miro Partners — the verified Tide statement, encoded as the source of truth ─
# 27 Feb 2026 → 27 May 2026, account 26672911. Proves the mechanism: this MUST
# reconcile to the penny, and a unit test asserts it forever.
def miro_tide_27feb_27may() -> Reconciliation:
    M = Movement.gbp
    movements = [
        # ── money in ──
        M("2026-04-22", "Tide Payout — Tiana job", "in", 220.00, "Sales Receipt", "tide:S322222225D6XMM"),
        M("2026-05-05", "Tide Payout — Toby job (net of card fee)", "in", 344.64, "Sales Receipt", "tide:S322222225H7NP9"),
        M("2026-04-01", "Capital introduced (MY BUSINESS ACC)", "in", 40.00, "Director Loan", "tide:dom-in"),
        M("2026-04-24", "Capital introduced (MY BUSINESS ACC)", "in", 100.00, "Director Loan", "tide:dom-in"),
        M("2026-05-13", "Capital introduced (MY BUSINESS ACC)", "in", 150.00, "Director Loan", "tide:dom-in"),
        # ── money out ──
        M("2026-03-03", "Simply Business insurance", "out", 39.79, "Insurance", "tide:DD-101"),
        M("2026-04-02", "Simply Business insurance", "out", 39.82, "Insurance", "tide:DD-102"),
        M("2026-05-05", "Simply Business insurance", "out", 39.82, "Insurance", "tide:DD-103"),
        M("2026-04-22", "Transfer to director — carpet cleaner", "out", 60.00, "Director Loan", "tide:dom-out"),
        M("2026-04-22", "Transfer to director — supplies", "out", 40.00, "Director Loan", "tide:dom-out"),
        M("2026-05-01", "Transfer to director — supplies", "out", 100.00, "Director Loan", "tide:dom-out"),
        M("2026-05-03", "Transfer to director — supplies", "out", 51.00, "Director Loan", "tide:dom-out"),
        M("2026-05-05", "Transfer to director — supplies", "out", 50.00, "Director Loan", "tide:dom-out"),
        M("2026-05-18", "Transfer to director — supplies", "out", 200.00, "Director Loan", "tide:dom-out"),
        M("2026-05-20", "Transfer to director — supplies", "out", 20.00, "Director Loan", "tide:dom-out"),
        M("2026-05-26", "Transfer to director — supplies", "out", 20.00, "Director Loan", "tide:dom-out"),
        M("2026-05-26", "Transfer to director — supplies", "out", 20.00, "Director Loan", "tide:dom-out"),
        # ── fees ──
        M("2026-05-18", "Tide transfer fee", "fee", 0.20, "Bank Charges", "tide:fee"),
        M("2026-05-20", "Tide transfer fee", "fee", 0.20, "Bank Charges", "tide:fee"),
        M("2026-05-26", "Tide transfer fee", "fee", 0.20, "Bank Charges", "tide:fee"),
        M("2026-05-26", "Tide transfer fee", "fee", 0.20, "Bank Charges", "tide:fee"),
    ]
    return reconcile(40.00, 213.41, movements)


if __name__ == "__main__":
    import json
    print(json.dumps(miro_tide_27feb_27may().as_dict(), indent=2))
