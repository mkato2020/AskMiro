"""
cleaning.py — AskMiro Lead Intelligence OS
Layer 2: Data cleaning and normalization.
Transforms raw ingested data into high-quality structured prospect records.
Pure functions — stateless, testable, no DB dependencies.
"""

import re
import logging
from typing import Optional, Tuple

from config import SECTOR_PRIORITY, PRIORITY_BOROUGHS, SECONDARY_BOROUGHS

logger = logging.getLogger(__name__)


# ── Postcode extraction ───────────────────────────────────────────────────────

# UK postcode regex — covers all valid formats
_POSTCODE_RE = re.compile(
    r'\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b',
    re.IGNORECASE
)

def extract_postcode(address: str) -> Optional[str]:
    """Extract and normalise UK postcode from an address string."""
    if not address:
        return None
    match = _POSTCODE_RE.search(address)
    if match:
        raw = match.group(1).upper().strip()
        # Normalise spacing: ensure single space before inward code
        parts = raw.replace(" ", "")
        return f"{parts[:-3]} {parts[-3:]}"
    return None


# ── Borough normalisation ────────────────────────────────────────────────────

# Maps common abbreviations / Google variants → canonical borough name
_BOROUGH_ALIASES: dict[str, str] = {
    "city of london":               "City of London",
    "the city":                     "City of London",
    "westminster":                  "Westminster",
    "city of westminster":          "Westminster",
    "camden":                       "Camden",
    "islington":                    "Islington",
    "hackney":                      "Hackney",
    "tower hamlets":                "Tower Hamlets",
    "southwark":                    "Southwark",
    "lambeth":                      "Lambeth",
    "wandsworth":                   "Wandsworth",
    "hammersmith":                  "Hammersmith and Fulham",
    "hammersmith and fulham":       "Hammersmith and Fulham",
    "kensington":                   "Kensington and Chelsea",
    "kensington and chelsea":       "Kensington and Chelsea",
    "rbkc":                         "Kensington and Chelsea",
    "greenwich":                    "Greenwich",
    "lewisham":                     "Lewisham",
    "newham":                       "Newham",
    "redbridge":                    "Redbridge",
    "waltham forest":               "Waltham Forest",
    "haringey":                     "Haringey",
    "barnet":                       "Barnet",
    "ealing":                       "Ealing",
    "hounslow":                     "Hounslow",
    "richmond":                     "Richmond upon Thames",
    "richmond upon thames":         "Richmond upon Thames",
    "kingston":                     "Kingston upon Thames",
    "kingston upon thames":         "Kingston upon Thames",
    "merton":                       "Merton",
    "sutton":                       "Sutton",
    "croydon":                      "Croydon",
    "bromley":                      "Bromley",
    "bexley":                       "Bexley",
    "havering":                     "Havering",
    "barking":                      "Barking and Dagenham",
    "barking and dagenham":         "Barking and Dagenham",
    "enfield":                      "Enfield",
    "harrow":                       "Harrow",
    "hillingdon":                   "Hillingdon",
    "brent":                        "Brent",
}


def normalize_borough(raw_borough: str) -> str:
    """Normalise a borough string to canonical form."""
    if not raw_borough:
        return "Unknown"
    key = raw_borough.lower().strip()
    return _BOROUGH_ALIASES.get(key, raw_borough.title().strip())


def infer_borough_from_address(address: str) -> Optional[str]:
    """
    Attempt to infer borough from an address string by scanning for borough names.
    Returns None if no match found.
    """
    if not address:
        return None
    addr_lower = address.lower()
    for alias, canonical in _BOROUGH_ALIASES.items():
        if alias in addr_lower:
            return canonical
    return None


# ── Sector normalisation ─────────────────────────────────────────────────────

# Maps Google Places types (and raw scraper terms) → AskMiro normalised sectors
_SECTOR_MAP: dict[str, str] = {
    # Offices / commercial
    "establishment":         "other",
    "point_of_interest":     "other",
    "office":                "offices",
    "coworking":             "coworking",
    "coworking space":       "coworking",
    "serviced office":       "serviced_offices",
    "serviced offices":      "serviced_offices",
    "business park":         "offices",
    # Healthcare
    "health":                "healthcare",
    "doctor":                "healthcare",
    "dentist":               "healthcare",
    "dental":                "healthcare",
    "hospital":              "healthcare",
    "physiotherapist":       "healthcare",
    "pharmacy":              "healthcare",
    "clinic":                "healthcare",
    "medical centre":        "healthcare",
    "veterinary_care":       "healthcare",
    # Education
    "school":                "education",
    "university":            "education",
    "college":               "education",
    "nursery":               "education",
    "primary_school":        "education",
    "secondary_school":      "education",
    # Property / residential
    "property management":   "property_management",
    "property_management":   "property_management",
    "apartment building":    "residential_blocks",
    "residential":           "residential_blocks",
    "housing":               "residential_blocks",
    "block management":      "property_management",
    # Gyms
    "gym":                   "gyms",
    "fitness centre":        "gyms",
    "fitness_centre":        "gyms",
    "gym and health":        "gyms",
    # Hospitality
    "hotel":                 "hospitality",
    "restaurant":            "hospitality",
    "cafe":                  "hospitality",
    "bar":                   "hospitality",
    "food":                  "hospitality",
    "meal_delivery":         "hospitality",
    "meal_takeaway":         "hospitality",
    "lodging":               "hospitality",
    # Retail
    "store":                 "retail",
    "shop":                  "retail",
    "shopping_mall":         "retail",
    "supermarket":           "retail",
    "clothing_store":        "retail",
    "furniture_store":       "retail",
    "department_store":      "retail",
    "retail park":           "retail",
    # Automotive
    "car_dealer":            "automotive",
    "car dealership":        "automotive",
    "car_rental":            "automotive",
    "car_wash":              "automotive",
    "car_repair":            "automotive",
    "dealership":            "automotive",
    # Industrial / warehouse
    "warehouse":             "industrial",
    "storage":               "industrial",
    "industrial":            "industrial",
    "moving_company":        "industrial",
    # Salons / beauty
    "beauty_salon":          "salons",
    "hair_care":             "salons",
    "salon":                 "salons",
    "spa":                   "salons",
    # Community
    "community centre":      "community_venues",
    "community_centre":      "community_venues",
    "place_of_worship":      "religious_centres",
    "church":                "religious_centres",
    "mosque":                "religious_centres",
    "temple":                "religious_centres",
}


def normalize_sector(raw_sector: str) -> str:
    """
    Map raw sector string (Google types CSV or scraper term) to normalised sector.
    Tries each token in the raw string.
    """
    if not raw_sector:
        return "other"

    raw_lower = raw_sector.lower().strip()

    # Direct hit
    if raw_lower in _SECTOR_MAP:
        return _SECTOR_MAP[raw_lower]

    # Token scan (Google types are comma-separated)
    for token in re.split(r'[,\s]+', raw_lower):
        token = token.strip()
        if token in _SECTOR_MAP:
            return _SECTOR_MAP[token]

    # Substring fallback
    for key, value in _SECTOR_MAP.items():
        if key in raw_lower:
            return value

    return "other"


# ── Phone normalisation ───────────────────────────────────────────────────────

def clean_phone(phone: str) -> Optional[str]:
    """Normalise phone number to E.164-style UK format where possible."""
    if not phone:
        return None
    # Strip everything except digits and leading +
    digits = re.sub(r'[^\d+]', '', phone.strip())
    if not digits:
        return None
    # UK domestic → international
    if digits.startswith('0'):
        digits = '+44' + digits[1:]
    return digits if len(digits) >= 10 else None


# ── Website normalisation ─────────────────────────────────────────────────────

def clean_website(website: str) -> Optional[str]:
    """Normalise and validate a website URL."""
    if not website:
        return None
    url = website.strip().lower()
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    # Very basic structural check
    if '.' not in url.split('//')[1]:
        return None
    return url


# ── Business name normalisation ──────────────────────────────────────────────

def clean_business_name(name: str) -> str:
    """Title-case and strip excess whitespace from business name."""
    if not name:
        return ""
    return re.sub(r'\s+', ' ', name.strip())


# ── Composite cleaning pass ───────────────────────────────────────────────────

def clean_raw_record(row: dict) -> dict:
    """
    Apply all cleaning transforms to a raw_lead row dict.
    Returns a dict suitable for constructing a LeadRecord.
    Pure function — does not touch the database.

    Handles both raw_leads schema (name/primary_type/search_term/user_rating_count/borough)
    and any pre-mapped dicts that already use the LeadRecord field names.
    """
    address       = row.get("address", "") or ""

    # raw_leads uses 'name'; pre-mapped dicts may use 'business_name'
    business_name = clean_business_name(row.get("name") or row.get("business_name", ""))

    # raw_leads uses 'primary_type'; pre-mapped dicts may use 'raw_sector'
    raw_sector    = row.get("primary_type") or row.get("raw_sector") or ""

    # raw_leads has a 'borough' column — use it directly, fall back to address inference
    raw_borough   = (row.get("borough") or "").strip()
    if not raw_borough:
        raw_borough = infer_borough_from_address(address) or ""

    # raw_leads uses 'user_rating_count'; pre-mapped dicts may use 'review_count'
    review_count  = row.get("user_rating_count") if row.get("user_rating_count") is not None \
                    else row.get("review_count")

    # raw_leads uses 'search_term'; pre-mapped dicts may use 'source_query'
    source_query  = row.get("search_term") or row.get("source_query") or ""

    postcode      = extract_postcode(address)
    borough       = normalize_borough(raw_borough) if raw_borough else "Unknown"
    norm_sector   = normalize_sector(raw_sector)
    phone         = clean_phone(row.get("phone"))
    website       = clean_website(row.get("website"))

    return {
        "place_id":            row["place_id"],
        "business_name":       business_name,
        "raw_sector":          raw_sector,
        "normalized_sector":   norm_sector,
        "borough":             borough,
        "address":             address,
        "postcode":            postcode,
        "latitude":            row.get("latitude"),
        "longitude":           row.get("longitude"),
        "website":             website,
        "phone":               phone,
        "rating":              row.get("rating"),
        "review_count":        review_count,
        "google_maps_url":     row.get("google_maps_url"),
        "source_query":        source_query,
        "source_system":       row.get("source_system", "google_places"),
        "date_collected":      row.get("date_collected", ""),
        "has_phone":           bool(phone),
        "has_website":         bool(website),
        "postcode_extracted":  bool(postcode),
    }
