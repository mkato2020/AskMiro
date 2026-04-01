"""
services/value_estimator.py
────────────────────────────
Sector-aware, size-hinted monthly contract value estimator.
Cost: £0 — pure heuristics.

Replaces the flat scoring-formula estimates with defensible sector models.
Adds confidence bands so the UI can show "~£3,500/mo (estimated)" vs "£3,500/mo".
"""
from __future__ import annotations
import re
from typing import Optional

# ── Base monthly value by sector (median London commercial cleaning rate) ────
# Derived from industry benchmarks: BICS, CSSA, BICSc rate cards 2024
_SECTOR_BASE: dict[str, int] = {
    'healthcare':           3_500,   # CQC-registered — high spec + compliance
    'education':            2_800,   # schools/colleges — large footprint
    'hospitality':          2_000,   # restaurants, hotels — daily clean
    'gyms':                 2_200,   # gyms, leisure centres — high traffic
    'gym_leisure':          2_200,
    'offices':              2_500,   # standard commercial office
    'office':               2_500,
    'industrial':           1_800,   # warehouse, factory — lower spec
    'industrial_warehouse': 1_800,
    'retail':               1_500,   # shops — lighter spec
    'residential_blocks':   1_200,   # block management — communal areas only
    'residential_block':    1_200,
    'charity':              1_000,   # charities — constrained budgets
    'property_management':  1_500,
    'automotive':           1_600,   # car dealerships, bodyshops
    'public_sector':        2_200,
    'other':                1_500,
}

# ── Multi-site multiplier ────────────────────────────────────────────────────
_MULTISITE_MULTIPLIER = 2.2   # group contract premium

# ── Central London borough premium ──────────────────────────────────────────
# Prime boroughs command ~50% higher cleaning rates (higher rents, higher spec)
_CENTRAL_BOROUGHS = {
    'Westminster', 'City of London', 'Camden', 'Islington',
    'Kensington and Chelsea', 'Hammersmith and Fulham',
}
_CENTRAL_BOROUGH_MULTIPLIER = 1.5

# ── Review count / size proxy ────────────────────────────────────────────────
# More Google reviews → larger / more established venue → bigger contract
def _size_factor(review_count: Optional[int]) -> float:
    if not review_count:
        return 1.0
    if review_count >= 500:  return 2.0
    if review_count >= 200:  return 1.6
    if review_count >= 100:  return 1.3
    if review_count >= 50:   return 1.15
    if review_count >= 20:   return 1.05
    return 1.0

# ── Sector-specific size indicators in evidence text ────────────────────────
_SIZE_HINTS = [
    (r'\b(\d{3,5})\s*(?:sq\s*m|sqm|m²|square metres?)\b',   'sqm'),
    (r'\b(\d+)\s*(?:bed(?:room)?s?|beds)\b',                 'beds'),      # care homes
    (r'\b(\d+)\s*(?:storey|stories|floors?)\b',              'floors'),
    (r'\b(\d+)\s*(?:unit|units|flat|flats)\b',               'units'),     # residential blocks
    (r'\b(\d+)\s*(?:seat|seats|cover|covers)\b',             'covers'),    # restaurants
]

def _parse_size_hint(text: str) -> tuple[Optional[int], str]:
    """Extract first numeric size hint from evidence text."""
    for pattern, hint_type in _SIZE_HINTS:
        m = re.search(pattern, text or '', re.IGNORECASE)
        if m:
            try:
                return int(m.group(1).replace(',', '')), hint_type
            except ValueError:
                pass
    return None, ''

def _sqm_to_monthly(sqm: int, sector: str) -> int:
    """Rough £/sqm/month rate by sector (cleaning cost, not contract value)."""
    rates = {
        'healthcare': 2.8, 'education': 1.8, 'hospitality': 3.2,
        'offices': 2.2, 'office': 2.2, 'industrial': 0.9, 'retail': 1.6,
        'gyms': 2.5, 'gym_leisure': 2.5, 'residential_block': 0.6,
    }
    rate = rates.get(sector, 1.5)
    return int(sqm * rate)

def _beds_to_monthly(beds: int, sector: str) -> int:
    """Care home / hotel: per-bed cleaning cost estimate."""
    if sector == 'healthcare':
        return beds * 180   # care home, ~£180/bed/month
    return beds * 80        # hotel, ~£80/bed/month

def _floors_to_monthly(floors: int, sector: str) -> int:
    """Multi-floor office/hotel estimate."""
    base = _SECTOR_BASE.get(sector, 1_500)
    return base * max(1, int(floors * 0.6))   # each floor adds ~60% base

def _units_to_monthly(units: int) -> int:
    """Residential block communal cleaning per unit."""
    return units * 35   # ~£35/unit/month for communal cleaning

def _covers_to_monthly(covers: int) -> int:
    """Restaurant seat count proxy."""
    return max(800, covers * 12)   # ~£12/cover/month

# ── Public confidence labels ─────────────────────────────────────────────────
def _confidence_label(rationale_key: str) -> str:
    high   = {'sqm', 'beds', 'covers'}
    medium = {'floors', 'units', 'multisite', 'review_size'}
    if rationale_key in high:   return 'estimated'
    if rationale_key in medium: return 'estimated'
    return 'rough'


def estimate(
    sector:           str,
    entity_kind:      str   = 'company',
    review_count:     int   = 0,
    has_multisite:    bool  = False,
    evidence_text:    str   = '',
    cqc_regulated:    bool  = False,
    contract_value:   float = 0.0,
    contract_months:  int   = 0,
    borough:          str   = '',
) -> dict:
    """
    Estimate monthly cleaning contract value.

    Returns:
        {
          'monthly_gbp':   int,
          'annual_gbp':    int,
          'confidence':    str,    # 'rough' | 'estimated' | 'confident'
          'rationale':     str,
          'low_gbp':       int,    # 20% below
          'high_gbp':      int,    # 40% above
        }
    """
    sector_key = (sector or 'other').lower().replace(' ', '_').replace('-', '_')

    # ── Priority 0: Use actual contract value if available ───────────────────
    if contract_value and contract_value > 0:
        months = max(1, contract_months) if contract_months else 12
        base_monthly  = int(contract_value / months)
        base_monthly  = max(500, min(base_monthly, 35_000))
        annual        = base_monthly * 12
        return {
            'monthly_gbp':  base_monthly,
            'annual_gbp':   annual,
            'confidence':   'confident',
            'rationale':    f"Actual contract value £{contract_value:,.0f} ÷ {months} months",
            'low_gbp':      int(base_monthly * 0.9),
            'high_gbp':     int(base_monthly * 1.1),
        }

    # ── Try size-based calculation first ────────────────────────────────────
    size_val, hint_type = _parse_size_hint(evidence_text)
    base_monthly = None
    rationale_key = 'sector_base'
    rationale_txt = f"Sector average for {sector or 'general commercial'}"

    if size_val and hint_type == 'sqm' and size_val > 50:
        base_monthly  = _sqm_to_monthly(size_val, sector_key)
        rationale_key = 'sqm'
        rationale_txt = f"{size_val:,} sqm × sector rate"

    elif size_val and hint_type == 'beds':
        base_monthly  = _beds_to_monthly(size_val, sector_key)
        rationale_key = 'beds'
        rationale_txt = f"{size_val} beds × per-bed rate"

    elif size_val and hint_type == 'floors' and size_val > 1:
        base_monthly  = _floors_to_monthly(size_val, sector_key)
        rationale_key = 'floors'
        rationale_txt = f"{size_val}-storey building"

    elif size_val and hint_type == 'units':
        base_monthly  = _units_to_monthly(size_val)
        rationale_key = 'units'
        rationale_txt = f"{size_val} units (block management)"

    elif size_val and hint_type == 'covers':
        base_monthly  = _covers_to_monthly(size_val)
        rationale_key = 'covers'
        rationale_txt = f"{size_val} covers (restaurant)"

    # ── Fallback to sector base + size factor ────────────────────────────────
    if base_monthly is None:
        base = _SECTOR_BASE.get(sector_key, 1_500)
        sf   = _size_factor(review_count)
        base_monthly  = int(base * sf)
        if sf > 1.1:
            rationale_key = 'review_size'
            rationale_txt = f"Sector average scaled by venue size ({review_count} reviews)"

    # ── CQC premium ──────────────────────────────────────────────────────────
    if cqc_regulated:
        base_monthly = int(base_monthly * 1.25)
        rationale_txt += " + CQC compliance premium (+25%)"

    # ── Multi-site uplift ────────────────────────────────────────────────────
    if has_multisite:
        base_monthly  = int(base_monthly * _MULTISITE_MULTIPLIER)
        rationale_key = 'multisite'
        rationale_txt += f" × {_MULTISITE_MULTIPLIER}x (multi-site group contract)"

    # ── Central borough premium ──────────────────────────────────────────────
    if borough and borough in _CENTRAL_BOROUGHS:
        base_monthly  = int(base_monthly * _CENTRAL_BOROUGH_MULTIPLIER)
        rationale_txt += f" × {_CENTRAL_BOROUGH_MULTIPLIER}x (central London premium)"

    # ── Cap sanity bounds ────────────────────────────────────────────────────
    base_monthly = max(500, min(base_monthly, 35_000))

    annual = base_monthly * 12
    confidence = _confidence_label(rationale_key)

    return {
        'monthly_gbp':  base_monthly,
        'annual_gbp':   annual,
        'confidence':   confidence,
        'rationale':    rationale_txt,
        'low_gbp':      int(base_monthly * 0.8),
        'high_gbp':     int(base_monthly * 1.4),
    }


def format_value_display(monthly_gbp: int, confidence: str) -> str:
    """Format for UI display: '~£3,500/mo' or '£3,500/mo'."""
    prefix = '~' if confidence == 'rough' else ''
    return f"{prefix}£{monthly_gbp:,}/mo"
