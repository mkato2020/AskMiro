"""
cleaner_matcher.py — Postcode-based cleaner matching engine for AskMiro OS

Matches cleaners to job sites by proximity, availability, skills, reliability,
and cost. Uses haversine distance between London postcode district centroids.
"""

from __future__ import annotations

import math
import re
import logging
from typing import Optional

import db_pg

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# London postcode district centroids  (lat, lon)
# Source: ONS Postcode Directory centroid averages
# ------------------------------------------------------------------
POSTCODE_CENTROIDS: dict[str, tuple[float, float]] = {
    # --- EC (City of London / Eastern Central) ---
    "EC1": (51.5230, -0.1097),
    "EC2": (51.5170, -0.0850),
    "EC3": (51.5125, -0.0815),
    "EC4": (51.5140, -0.1040),
    # --- WC (Western Central) ---
    "WC1": (51.5220, -0.1200),
    "WC2": (51.5120, -0.1210),
    # --- W (West) ---
    "W1":  (51.5150, -0.1440),
    "W2":  (51.5130, -0.1780),
    "W3":  (51.5090, -0.2630),
    "W4":  (51.4890, -0.2620),
    "W5":  (51.5100, -0.3060),
    "W6":  (51.4910, -0.2290),
    "W7":  (51.5110, -0.3190),
    "W8":  (51.5010, -0.1920),
    "W9":  (51.5240, -0.1870),
    "W10": (51.5240, -0.2110),
    "W11": (51.5130, -0.2050),
    "W12": (51.5070, -0.2370),
    "W13": (51.5140, -0.3220),
    "W14": (51.4930, -0.2110),
    # --- SW (South West) ---
    "SW1": (51.4980, -0.1380),
    "SW2": (51.4530, -0.1230),
    "SW3": (51.4910, -0.1660),
    "SW4": (51.4610, -0.1390),
    "SW5": (51.4910, -0.1870),
    "SW6": (51.4740, -0.1950),
    "SW7": (51.4960, -0.1730),
    "SW8": (51.4740, -0.1250),
    "SW9": (51.4640, -0.1150),
    "SW10": (51.4820, -0.1850),
    "SW11": (51.4640, -0.1680),
    "SW12": (51.4440, -0.1500),
    "SW13": (51.4710, -0.2430),
    "SW14": (51.4620, -0.2610),
    "SW15": (51.4440, -0.2310),
    "SW16": (51.4160, -0.1360),
    "SW17": (51.4280, -0.1630),
    "SW18": (51.4460, -0.1900),
    "SW19": (51.4150, -0.1970),
    "SW20": (51.4070, -0.2160),
    # --- SE (South East) ---
    "SE1":  (51.5010, -0.0880),
    "SE2":  (51.4870, 0.1060),
    "SE3":  (51.4640, 0.0180),
    "SE4":  (51.4560, -0.0370),
    "SE5":  (51.4730, -0.0920),
    "SE6":  (51.4350, -0.0150),
    "SE7":  (51.4850, 0.0500),
    "SE8":  (51.4780, -0.0280),
    "SE9":  (51.4470, 0.0670),
    "SE10": (51.4830, 0.0020),
    "SE11": (51.4910, -0.1060),
    "SE12": (51.4440, 0.0340),
    "SE13": (51.4570, -0.0150),
    "SE14": (51.4700, -0.0440),
    "SE15": (51.4680, -0.0660),
    "SE16": (51.4940, -0.0490),
    "SE17": (51.4880, -0.0920),
    "SE18": (51.4870, 0.0690),
    "SE19": (51.4160, -0.0780),
    "SE20": (51.4110, -0.0540),
    "SE21": (51.4360, -0.0860),
    "SE22": (51.4520, -0.0710),
    "SE23": (51.4330, -0.0520),
    "SE24": (51.4510, -0.0990),
    "SE25": (51.3970, -0.0600),
    "SE26": (51.4260, -0.0460),
    "SE27": (51.4310, -0.1010),
    "SE28": (51.4970, 0.1000),
    # --- N (North) ---
    "N1":  (51.5390, -0.0990),
    "N2":  (51.5870, -0.1640),
    "N3":  (51.5960, -0.1810),
    "N4":  (51.5660, -0.0990),
    "N5":  (51.5520, -0.0970),
    "N6":  (51.5730, -0.1450),
    "N7":  (51.5530, -0.1170),
    "N8":  (51.5780, -0.1100),
    "N9":  (51.6280, -0.0630),
    "N10": (51.5870, -0.1350),
    "N11": (51.6090, -0.1310),
    "N12": (51.6130, -0.1770),
    "N13": (51.6190, -0.1070),
    "N14": (51.6370, -0.1220),
    "N15": (51.5800, -0.0770),
    "N16": (51.5600, -0.0730),
    "N17": (51.5960, -0.0680),
    "N18": (51.6180, -0.0710),
    "N19": (51.5620, -0.1280),
    "N20": (51.6170, -0.1810),
    "N21": (51.6410, -0.1030),
    "N22": (51.5980, -0.1090),
    # --- NW (North West) ---
    "NW1":  (51.5330, -0.1410),
    "NW2":  (51.5640, -0.2160),
    "NW3":  (51.5520, -0.1700),
    "NW4":  (51.5920, -0.2220),
    "NW5":  (51.5530, -0.1370),
    "NW6":  (51.5410, -0.1960),
    "NW7":  (51.6170, -0.2260),
    "NW8":  (51.5300, -0.1720),
    "NW9":  (51.5800, -0.2560),
    "NW10": (51.5410, -0.2340),
    "NW11": (51.5810, -0.1940),
    # --- E (East) ---
    "E1":  (51.5170, -0.0580),
    "E2":  (51.5290, -0.0580),
    "E3":  (51.5260, -0.0310),
    "E4":  (51.6310, -0.0120),
    "E5":  (51.5570, -0.0550),
    "E6":  (51.5240, 0.0470),
    "E7":  (51.5440, 0.0290),
    "E8":  (51.5400, -0.0590),
    "E9":  (51.5430, -0.0420),
    "E10": (51.5630, -0.0120),
    "E11": (51.5660, 0.0060),
    "E12": (51.5580, 0.0430),
    "E13": (51.5270, 0.0290),
    "E14": (51.5040, -0.0160),
    "E15": (51.5390, 0.0020),
    "E16": (51.5090, 0.0310),
    "E17": (51.5870, -0.0170),
    "E18": (51.5890, 0.0370),
    # --- BR (Bromley) ---
    "BR1": (51.4060, 0.0190),
    "BR2": (51.3870, 0.0280),
    "BR3": (51.4090, -0.0090),
    "BR4": (51.3750, 0.0340),
    "BR5": (51.3890, 0.0720),
    "BR6": (51.3640, 0.0580),
    "BR7": (51.4050, 0.0430),
    "BR8": (51.3870, 0.1110),
    # --- CR (Croydon) ---
    "CR0": (51.3720, -0.0990),
    "CR2": (51.3490, -0.0830),
    "CR3": (51.3070, -0.0780),
    "CR4": (51.3970, -0.1580),
    "CR5": (51.3220, -0.1350),
    "CR6": (51.3170, -0.0680),
    "CR7": (51.3960, -0.0990),
    "CR8": (51.3380, -0.1150),
    # --- DA (Dartford) ---
    "DA1":  (51.4460, 0.2080),
    "DA2":  (51.4400, 0.2310),
    "DA3":  (51.3990, 0.2650),
    "DA4":  (51.3850, 0.2150),
    "DA5":  (51.4430, 0.1690),
    "DA6":  (51.4560, 0.1450),
    "DA7":  (51.4660, 0.1380),
    "DA8":  (51.4730, 0.1590),
    "DA9":  (51.4580, 0.2340),
    "DA10": (51.4540, 0.2540),
    "DA11": (51.4420, 0.3420),
    "DA12": (51.4270, 0.3510),
    "DA13": (51.4050, 0.3150),
    "DA14": (51.4290, 0.1090),
    "DA15": (51.4460, 0.1190),
    "DA16": (51.4630, 0.1100),
    "DA17": (51.4810, 0.1250),
    "DA18": (51.4940, 0.1190),
    # --- EN (Enfield) ---
    "EN1":  (51.6530, -0.0780),
    "EN2":  (51.6640, -0.0940),
    "EN3":  (51.6660, -0.0380),
    "EN4":  (51.6570, -0.1580),
    "EN5":  (51.6520, -0.1930),
    "EN6":  (51.6820, -0.1820),
    "EN7":  (51.6970, -0.0780),
    "EN8":  (51.7060, -0.0420),
    "EN9":  (51.7110, -0.0110),
    "EN10": (51.7150, -0.0430),
    "EN11": (51.7300, -0.0330),
    # --- HA (Harrow) ---
    "HA0": (51.5490, -0.3040),
    "HA1": (51.5790, -0.3370),
    "HA2": (51.5720, -0.3570),
    "HA3": (51.5890, -0.3080),
    "HA4": (51.5720, -0.3960),
    "HA5": (51.5970, -0.3780),
    "HA6": (51.6080, -0.3870),
    "HA7": (51.6070, -0.3290),
    "HA8": (51.6000, -0.2650),
    "HA9": (51.5580, -0.2840),
    # --- IG (Ilford / Barking) ---
    "IG1":  (51.5590, 0.0720),
    "IG2":  (51.5730, 0.0780),
    "IG3":  (51.5640, 0.0950),
    "IG4":  (51.5830, 0.0690),
    "IG5":  (51.5810, 0.0860),
    "IG6":  (51.5890, 0.0870),
    "IG7":  (51.6080, 0.0590),
    "IG8":  (51.6020, 0.0370),
    "IG9":  (51.6180, 0.0300),
    "IG10": (51.6400, 0.0310),
    "IG11": (51.5380, 0.0800),
    # --- KT (Kingston) ---
    "KT1":  (51.4100, -0.3000),
    "KT2":  (51.4170, -0.2830),
    "KT3":  (51.3990, -0.2720),
    "KT4":  (51.3830, -0.2520),
    "KT5":  (51.3930, -0.2990),
    "KT6":  (51.3870, -0.3090),
    "KT7":  (51.3780, -0.3320),
    "KT8":  (51.3950, -0.3510),
    "KT9":  (51.3640, -0.2960),
    "KT10": (51.3630, -0.3340),
    "KT11": (51.3310, -0.3660),
    "KT12": (51.3740, -0.3760),
    "KT13": (51.3630, -0.4250),
    "KT14": (51.3480, -0.4660),
    "KT15": (51.3650, -0.4870),
    "KT16": (51.3710, -0.5130),
    "KT17": (51.3510, -0.2410),
    "KT18": (51.3280, -0.2560),
    "KT19": (51.3570, -0.2550),
    "KT20": (51.3040, -0.2400),
    "KT21": (51.3120, -0.2940),
    "KT22": (51.3020, -0.3310),
    # --- RM (Romford) ---
    "RM1":  (51.5770, 0.1790),
    "RM2":  (51.5720, 0.2080),
    "RM3":  (51.5800, 0.2210),
    "RM4":  (51.6150, 0.1860),
    "RM5":  (51.5840, 0.1650),
    "RM6":  (51.5640, 0.1410),
    "RM7":  (51.5670, 0.1700),
    "RM8":  (51.5560, 0.1260),
    "RM9":  (51.5420, 0.1130),
    "RM10": (51.5520, 0.1480),
    "RM11": (51.5730, 0.2230),
    "RM12": (51.5590, 0.2210),
    "RM13": (51.5240, 0.1660),
    "RM14": (51.5550, 0.2610),
    "RM15": (51.5090, 0.2650),
    "RM16": (51.4840, 0.2840),
    "RM17": (51.4760, 0.3180),
    "RM18": (51.4770, 0.3520),
    "RM19": (51.4810, 0.2740),
    "RM20": (51.4710, 0.2870),
    # --- SM (Sutton) ---
    "SM1": (51.3640, -0.1930),
    "SM2": (51.3460, -0.1990),
    "SM3": (51.3570, -0.2150),
    "SM4": (51.3770, -0.1960),
    "SM5": (51.3600, -0.1690),
    "SM6": (51.3510, -0.1550),
    "SM7": (51.3290, -0.2100),
    # --- TW (Twickenham) ---
    "TW1":  (51.4490, -0.3280),
    "TW2":  (51.4400, -0.3470),
    "TW3":  (51.4630, -0.3640),
    "TW4":  (51.4610, -0.3860),
    "TW5":  (51.4790, -0.3820),
    "TW6":  (51.4720, -0.4530),
    "TW7":  (51.4730, -0.3390),
    "TW8":  (51.4840, -0.3120),
    "TW9":  (51.4630, -0.2890),
    "TW10": (51.4390, -0.2970),
    "TW11": (51.4250, -0.3320),
    "TW12": (51.4140, -0.3580),
    "TW13": (51.4420, -0.3970),
    "TW14": (51.4530, -0.4090),
    "TW15": (51.4340, -0.4360),
    "TW16": (51.4190, -0.4240),
    "TW17": (51.4060, -0.4080),
    "TW18": (51.4260, -0.4600),
    "TW19": (51.4400, -0.4900),
    "TW20": (51.4290, -0.5400),
    # --- UB (Uxbridge / Southall) ---
    "UB1":  (51.5120, -0.3720),
    "UB2":  (51.5060, -0.3920),
    "UB3":  (51.4930, -0.4380),
    "UB4":  (51.5050, -0.4170),
    "UB5":  (51.5330, -0.3750),
    "UB6":  (51.5370, -0.3450),
    "UB7":  (51.4970, -0.4700),
    "UB8":  (51.5360, -0.4770),
    "UB9":  (51.5660, -0.4810),
    "UB10": (51.5480, -0.4510),
    "UB11": (51.5030, -0.4560),
}


# ------------------------------------------------------------------
# Haversine distance
# ------------------------------------------------------------------
_EARTH_RADIUS_KM = 6371.0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in km between two points."""
    r_lat1, r_lon1 = math.radians(lat1), math.radians(lon1)
    r_lat2, r_lon2 = math.radians(lat2), math.radians(lon2)
    dlat = r_lat2 - r_lat1
    dlon = r_lon2 - r_lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(r_lat1) * math.cos(r_lat2) * math.sin(dlon / 2) ** 2
    return _EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


# ------------------------------------------------------------------
# Postcode helpers
# ------------------------------------------------------------------
_DISTRICT_RE = re.compile(r"^([A-Z]{1,2}\d{1,2})[A-Z]?\s*\d[A-Z]{2}$", re.IGNORECASE)
_DISTRICT_ONLY_RE = re.compile(r"^([A-Z]{1,2}\d{1,2})[A-Z]?$", re.IGNORECASE)


def extract_district(postcode: str) -> str:
    """
    Extract the district from a UK postcode.

    Examples:
        "SW11 3RB"  -> "SW11"
        "EC2A 1NT"  -> "EC2"
        "W1D 4FA"   -> "W1"
        "SW1A"      -> "SW1"
    """
    pc = postcode.strip().upper()
    m = _DISTRICT_RE.match(pc)
    if m:
        return m.group(1).upper()
    m = _DISTRICT_ONLY_RE.match(pc)
    if m:
        return m.group(1).upper()
    # Fallback: split on space, take outward code, strip trailing alpha
    outward = pc.split()[0] if " " in pc else pc
    stripped = re.sub(r"[A-Z]+$", "", outward)
    return stripped.upper() if stripped else pc.upper()


# ------------------------------------------------------------------
# Travel time estimation
# ------------------------------------------------------------------
_TRAVEL_PARAMS: dict[str, tuple[float, float]] = {
    # (minutes_per_km, base_minutes)
    "public_transport": (3.0, 15.0),
    "driving":          (2.0, 10.0),
    "cycling":          (4.0, 5.0),
    "walking":          (12.0, 0.0),
}


def estimate_travel_minutes(distance_km: float, mode: str = "public_transport") -> int:
    """Rough travel time estimate based on distance and transport mode."""
    params = _TRAVEL_PARAMS.get(mode.lower(), _TRAVEL_PARAMS["public_transport"])
    minutes_per_km, base = params
    return int(round(base + distance_km * minutes_per_km))


# ------------------------------------------------------------------
# Scoring helpers
# ------------------------------------------------------------------
def _proximity_score(distance_km: float) -> float:
    """0-100 where 100 = very close. Brackets:
    <2km=100, <5km=85, <10km=65, <15km=45, <25km=25, >=25km=10."""
    if distance_km < 2:
        return 100.0
    if distance_km < 5:
        return 85.0
    if distance_km < 10:
        return 65.0
    if distance_km < 15:
        return 45.0
    if distance_km < 25:
        return 25.0
    return 10.0


def _availability_score(assigned_hours: float, hours_needed: float, max_capacity: float = 40.0) -> float:
    """0-100 based on remaining capacity. 100 = lots of room, 0 = at or over capacity."""
    remaining = max_capacity - assigned_hours
    if remaining <= 0:
        return 0.0
    if hours_needed > 0 and remaining < hours_needed:
        return 10.0
    ratio = remaining / max_capacity
    return min(100.0, round(ratio * 100, 1))


def _skill_score(preferred_sectors: str, sector: Optional[str]) -> float:
    """0-100. 100 = direct sector match, 50 = no preference set, 0 = mismatch."""
    if not sector:
        return 50.0  # no sector filter — neutral
    if not preferred_sectors:
        return 50.0  # cleaner has no preference listed — neutral
    sectors_list = [s.strip().lower() for s in preferred_sectors.split(",")]
    if sector.lower() in sectors_list:
        return 100.0
    return 20.0  # has preferences but doesn't match


def _reliability_score(raw_score: float) -> float:
    """Normalize 0-10 scale to 0-100."""
    return min(100.0, max(0.0, round(raw_score * 10, 1)))


def _cost_score(pay_rate: float, avg_rate: float) -> float:
    """0-100. Lower rate relative to average = higher score."""
    if avg_rate <= 0:
        return 50.0
    ratio = pay_rate / avg_rate
    if ratio <= 0.8:
        return 100.0
    if ratio <= 0.95:
        return 80.0
    if ratio <= 1.05:
        return 60.0
    if ratio <= 1.2:
        return 40.0
    return 20.0


def _overall_score(
    proximity: float,
    availability: float,
    reliability: float,
    skill: float,
    cost: float,
) -> float:
    """Weighted composite: proximity 35%, availability 25%, reliability 15%, skill 15%, cost 10%."""
    return round(
        proximity * 0.35
        + availability * 0.25
        + reliability * 0.15
        + skill * 0.15
        + cost * 0.10,
        1,
    )


def _match_quality(score: float) -> str:
    if score >= 70:
        return "strong"
    if score >= 50:
        return "moderate"
    return "weak"


def _build_warnings(distance_km: float, travel_minutes: int, assigned_hours: float,
                    preferred_sectors: str, sector: Optional[str]) -> list[str]:
    warnings: list[str] = []
    if travel_minutes > 45:
        warnings.append(f"Long commute ({travel_minutes} min)")
    elif travel_minutes > 30:
        warnings.append(f"Moderate commute ({travel_minutes} min)")
    if assigned_hours >= 35:
        warnings.append("Near capacity")
    if assigned_hours >= 40:
        warnings.append("At full capacity")
    if sector and preferred_sectors:
        sectors_list = [s.strip().lower() for s in preferred_sectors.split(",")]
        if sector.lower() not in sectors_list:
            warnings.append("No sector experience")
    elif sector and not preferred_sectors:
        warnings.append("Sector preference unknown")
    return warnings


# ------------------------------------------------------------------
# Core matcher
# ------------------------------------------------------------------
def match_cleaners(
    conn,
    site_postcode: str,
    hours_needed: float = 0,
    days_needed: Optional[list] = None,
    sector: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """
    Match active cleaners to a job site by postcode proximity and scoring.

    Returns a ranked list of the top `limit` candidates with full scoring
    breakdown, warnings, and match quality rating.
    """
    district = extract_district(site_postcode)
    site_coords = POSTCODE_CENTROIDS.get(district)
    if not site_coords:
        logger.warning("Unknown postcode district '%s' from '%s' — cannot match", district, site_postcode)
        return []

    site_lat, site_lon = site_coords

    # Fetch active cleaners with a home postcode
    cleaners = db_pg.fetchall(conn, """
        SELECT id, full_name, home_postcode, hourly_rate,
               COALESCE(assigned_hours, 0)        AS assigned_hours,
               COALESCE(reliability_score, 5.0)    AS reliability_score,
               COALESCE(preferred_sectors, '')      AS preferred_sectors,
               COALESCE(transport_mode, 'Public Transport') AS transport_mode,
               COALESCE(transport_mode_v2, 'public_transport') AS transport_mode_v2
        FROM ops_cleaners
        WHERE status = 'Active'
          AND home_postcode IS NOT NULL
          AND home_postcode != ''
    """)

    if not cleaners:
        logger.info("No active cleaners with home postcodes found")
        return []

    # Compute average pay rate for cost scoring
    rates = [c["hourly_rate"] for c in cleaners if c.get("hourly_rate")]
    avg_rate = sum(rates) / len(rates) if rates else 12.50

    scored: list[dict] = []

    for c in cleaners:
        try:
            c_district = extract_district(c["home_postcode"])
            c_coords = POSTCODE_CENTROIDS.get(c_district)
            if not c_coords:
                logger.debug("Skipping cleaner %s — unknown district '%s'", c["id"], c_district)
                continue

            dist_km = round(haversine(c_coords[0], c_coords[1], site_lat, site_lon), 2)

            # Use cleaner's preferred transport mode for travel estimate
            mode = (c.get("transport_mode_v2") or "public_transport").lower().replace(" ", "_")
            travel_min = estimate_travel_minutes(dist_km, mode)

            prox = _proximity_score(dist_km)
            avail = _availability_score(c["assigned_hours"], hours_needed)
            rel = _reliability_score(c["reliability_score"])
            skl = _skill_score(c["preferred_sectors"], sector)
            cst = _cost_score(c["hourly_rate"] or 12.50, avg_rate)
            overall = _overall_score(prox, avail, rel, skl, cst)

            warnings = _build_warnings(dist_km, travel_min, c["assigned_hours"],
                                       c["preferred_sectors"], sector)

            scored.append({
                "cleaner_id": c["id"],
                "full_name": c["full_name"],
                "home_postcode": c["home_postcode"],
                "pay_rate": float(c["hourly_rate"] or 12.50),
                "assigned_hours": float(c["assigned_hours"]),
                "distance_km": dist_km,
                "travel_minutes": travel_min,
                "scores": {
                    "proximity": prox,
                    "availability": avail,
                    "reliability": rel,
                    "skill": skl,
                    "cost": cst,
                    "overall": overall,
                },
                "match_quality": _match_quality(overall),
                "warnings": warnings,
            })
        except Exception:
            logger.exception("Error scoring cleaner %s", c.get("id"))
            continue

    # Sort descending by overall score, then by distance as tiebreaker
    scored.sort(key=lambda x: (-x["scores"]["overall"], x["distance_km"]))

    return scored[:limit]


# ------------------------------------------------------------------
# Coverage summary for a postcode district
# ------------------------------------------------------------------
def coverage_summary(conn, postcode_district: str) -> dict:
    """
    Summarize cleaner coverage for a given postcode district.

    Returns total_cleaners_nearby, available_cleaners, avg_distance_km,
    and coverage_strength.
    """
    district = postcode_district.strip().upper()
    coords = POSTCODE_CENTROIDS.get(district)
    if not coords:
        logger.warning("Unknown district '%s' for coverage summary", district)
        return {
            "postcode_district": district,
            "total_cleaners_nearby": 0,
            "available_cleaners": 0,
            "avg_distance_km": None,
            "coverage_strength": "none",
        }

    site_lat, site_lon = coords

    cleaners = db_pg.fetchall(conn, """
        SELECT id, home_postcode,
               COALESCE(assigned_hours, 0) AS assigned_hours,
               COALESCE(transport_mode_v2, 'public_transport') AS transport_mode_v2
        FROM ops_cleaners
        WHERE status = 'Active'
          AND home_postcode IS NOT NULL
          AND home_postcode != ''
    """)

    nearby: list[dict] = []
    for c in cleaners:
        try:
            c_district = extract_district(c["home_postcode"])
            c_coords = POSTCODE_CENTROIDS.get(c_district)
            if not c_coords:
                continue
            dist_km = haversine(c_coords[0], c_coords[1], site_lat, site_lon)
            mode = (c.get("transport_mode_v2") or "public_transport").lower().replace(" ", "_")
            travel_min = estimate_travel_minutes(dist_km, mode)
            if travel_min <= 30:
                nearby.append({
                    "id": c["id"],
                    "distance_km": dist_km,
                    "assigned_hours": float(c["assigned_hours"]),
                })
        except Exception:
            logger.exception("Error in coverage check for cleaner %s", c.get("id"))
            continue

    total_nearby = len(nearby)
    available = [n for n in nearby if n["assigned_hours"] < 35]
    distances = [n["distance_km"] for n in nearby]
    avg_dist = round(sum(distances) / len(distances), 2) if distances else None

    if total_nearby >= 5 and len(available) >= 3:
        strength = "strong"
    elif total_nearby >= 2 and len(available) >= 1:
        strength = "moderate"
    elif total_nearby >= 1:
        strength = "weak"
    else:
        strength = "none"

    return {
        "postcode_district": district,
        "total_cleaners_nearby": total_nearby,
        "available_cleaners": len(available),
        "avg_distance_km": avg_dist,
        "coverage_strength": strength,
    }


# ------------------------------------------------------------------
# Compute and persist coverage for a single cleaner
# ------------------------------------------------------------------
def compute_cleaner_coverage(conn, cleaner_id: int, max_travel_minutes: int = 60) -> int:
    """
    Calculate distances from a cleaner's home postcode to all known districts.
    Insert/update rows in cleaner_coverage for districts within max_travel_minutes.

    Returns the number of reachable districts written.
    """
    row = db_pg.fetchone(conn, """
        SELECT home_postcode,
               COALESCE(transport_mode_v2, 'public_transport') AS transport_mode_v2,
               COALESCE(max_travel_minutes, %s) AS max_travel_minutes
        FROM ops_cleaners
        WHERE id = %s
    """, (max_travel_minutes, cleaner_id))

    if not row or not row.get("home_postcode"):
        logger.warning("Cleaner %s has no home postcode — skipping coverage", cleaner_id)
        return 0

    home_district = extract_district(row["home_postcode"])
    home_coords = POSTCODE_CENTROIDS.get(home_district)
    if not home_coords:
        logger.warning("Unknown home district '%s' for cleaner %s", home_district, cleaner_id)
        return 0

    mode = (row.get("transport_mode_v2") or "public_transport").lower().replace(" ", "_")
    effective_max = row.get("max_travel_minutes") or max_travel_minutes

    written = 0
    for district, (lat, lon) in POSTCODE_CENTROIDS.items():
        dist_km = round(haversine(home_coords[0], home_coords[1], lat, lon), 1)
        travel_min = estimate_travel_minutes(dist_km, mode)

        if travel_min > effective_max:
            continue

        try:
            db_pg.execute(conn, """
                INSERT INTO cleaner_coverage (cleaner_id, postcode_district, travel_minutes, distance_km)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (cleaner_id, postcode_district)
                DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes,
                              distance_km   = EXCLUDED.distance_km,
                              created_at    = NOW()
            """, (cleaner_id, district, travel_min, dist_km))
            written += 1
        except Exception:
            logger.exception("Failed to upsert coverage for cleaner %s district %s", cleaner_id, district)
            continue

    logger.info("Cleaner %s: wrote %d reachable districts (max %d min via %s)",
                cleaner_id, written, effective_max, mode)
    return written
