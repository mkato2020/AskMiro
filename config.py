"""
config.py — AskMiro Lead Intelligence OS
Central configuration. Environment-aware. Never hardcode secrets inline.
"""

import os
from pathlib import Path
from dataclasses import dataclass
from typing import List

# Load .env file automatically so API keys work without shell exports
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env", override=True)
except ImportError:
    pass  # dotenv optional — fall back to env vars already in shell

BASE_DIR = Path(__file__).parent.resolve()
DATA_DIR = BASE_DIR / "data"
LOGS_DIR = BASE_DIR / "logs"
EXPORTS_DIR = BASE_DIR / "exports"
for _d in (DATA_DIR, LOGS_DIR, EXPORTS_DIR):
    _d.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "askmiro.db"

GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", os.getenv("GOOGLE_MAPS_API_KEY", "")).strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AI_PROVIDER = os.getenv("AI_PROVIDER", "mock")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")

# PostgreSQL
PG_DSN = os.getenv("PG_DSN", "dbname=askmiro_warehouse host=localhost")

# External connector API keys
COMPANIES_HOUSE_API_KEY = os.getenv("COMPANIES_HOUSE_API_KEY", "")
COMPANIES_HOUSE_ENV     = os.getenv("COMPANIES_HOUSE_ENV", "sandbox")  # "sandbox" or "live"
CONTRACTS_FINDER_CLIENT_ID = os.getenv("CONTRACTS_FINDER_CLIENT_ID", "")
CONTRACTS_FINDER_CLIENT_SECRET = os.getenv("CONTRACTS_FINDER_CLIENT_SECRET", "")
CHARITY_COMMISSION_API_KEY = os.getenv("CHARITY_COMMISSION_API_KEY", "")
CQC_SUBSCRIPTION_KEY = os.getenv("CQC_SUBSCRIPTION_KEY", "")

SCRAPER_REQUEST_DELAY_SECONDS = 0.5
SCRAPER_MAX_RETRIES = 5
SCRAPER_RETRY_BACKOFF_BASE = 1.5
SCRAPER_RESULTS_PER_QUERY = 20

@dataclass
class ScoringWeights:
    has_phone: int = 10
    has_website: int = 10
    rating: int = 15
    review_count: int = 15
    target_sector: int = 20
    target_borough: int = 15
    ai_signal: int = 15

SCORING_WEIGHTS = ScoringWeights()
BUYING_SIGNAL_WEIGHTS = {
    "move_signal": 20, "expansion_signal": 15, "refurb_signal": 12,
    "hiring_signal": 15, "compliance_signal": 10, "review_signal": 6,
    "multi_site_signal": 18,
}
BUYING_SIGNAL_CAP = 40

SECTOR_PRIORITY = {
    "offices":1,"serviced_offices":1,"coworking":1,"property_management":1,"residential_blocks":1,
    "healthcare":1,"education":1,"automotive":2,"gyms":2,"hospitality":2,"industrial":2,
    "retail":3,"salons":3,"community_venues":3,"religious_centres":3,"other":4,
}
PRIORITY_BOROUGHS = ["City of London","Westminster","Camden","Islington","Hackney","Tower Hamlets","Southwark","Lambeth","Wandsworth","Hammersmith and Fulham","Kensington and Chelsea","Greenwich","Lewisham","Newham","Redbridge","Waltham Forest","Haringey","Barnet"]
SECONDARY_BOROUGHS = ["Ealing","Hounslow","Richmond upon Thames","Kingston upon Thames","Merton","Sutton","Croydon","Bromley","Bexley","Havering","Barking and Dagenham","Enfield","Harrow","Hillingdon","Brent"]
PIPELINE_STATUSES = ["new","shortlisted","contacted","follow_up","replied","meeting_booked","quoted","negotiating","won","lost","dormant"]
SCRAPER_BOROUGHS = ["Barking and Dagenham","Barnet","Bexley","Brent","Bromley","Camden","Croydon","Ealing","Enfield","Greenwich","Hackney","Hammersmith and Fulham","Haringey","Harrow","Havering","Hillingdon","Hounslow","Islington","Kensington and Chelsea","Kingston upon Thames","Lambeth","Lewisham","Merton","Newham","Redbridge","Richmond upon Thames","Southwark","Sutton","Tower Hamlets","Waltham Forest","Wandsworth","Westminster"]
SCRAPER_SECTORS = ["school","private school","nursery","college","training centre","language school","hospital","medical clinic","dental clinic","dentist","orthodontist","care home","nursing home","physiotherapy clinic","office building","business centre","serviced office","coworking space","corporate office","gym","fitness centre","pilates studio","yoga studio","sports centre","leisure centre","hotel","hostel","restaurant","cafe","bar","pub","apartment building","residential block","student accommodation","property management company","facilities management company","estate management company","shopping centre","retail park","supermarket","department store","warehouse","distribution centre","industrial estate","storage facility","factory","car dealership","vehicle showroom","garage","car service centre","beauty salon","hair salon","spa","aesthetic clinic","nail salon","community centre","library","conference centre","event venue","religious centre","church","mosque","temple"]
# ── CRM Sync — Lead Intelligence → GAS CRM pipeline ─────────────────────────
# Set in .env:
#   GAS_ENDPOINT=https://script.google.com/macros/s/<deployment_id>/exec
#   GAS_TOKEN=<your_ops_access_token>
GAS_ENDPOINT   = os.getenv("GAS_ENDPOINT", "")
GAS_TOKEN      = os.getenv("GAS_TOKEN", "")
CRM_MIN_SCORE  = int(os.getenv("CRM_MIN_SCORE", "65"))   # minimum score to push
CRM_BATCH_SIZE = int(os.getenv("CRM_BATCH_SIZE", "25"))   # max leads per scheduler run

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE = LOGS_DIR / "askmiro.log"

# Estimated monthly contract values (£) by sector — used for pipeline value calculations
SECTOR_CONTRACT_ESTIMATES = {
    'offices': 2500, 'coworking': 2000, 'serviced_offices': 3500,
    'healthcare': 3500, 'education': 2500, 'hospitality': 1500,
    'gyms': 1800, 'property_management': 4500, 'residential_blocks': 4000,
    'automotive': 1500, 'industrial': 2200, 'community_venues': 900,
    'religious_centres': 700, 'retail': 1100, 'salons': 800, 'other': 1000,
}

# London postcode prefixes for filtering national datasets.
# Used by .startswith() in existing code — keep for backward compat.
LONDON_POSTCODE_PREFIXES = (
    'E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC',
    'BR', 'CR', 'DA', 'EN', 'HA', 'IG', 'KT', 'RM', 'SM', 'TW', 'UB', 'WD',
)

import re as _re
# Stricter check: single-letter areas (E, N, W) must be followed by a digit
# to avoid false matches like WV (Wolverhampton), WR (Worcester), NE (Newcastle)
_LONDON_PC_RE = _re.compile(
    r'^(EC|NW|SE|SW|WC|BR|CR|DA|HA|IG|KT|RM|SM|TW|UB|WD|E\d|N\d|W\d|EN\d)',
    _re.IGNORECASE,
)

def is_london_postcode(postcode: str) -> bool:
    """Return True if postcode belongs to Greater London."""
    return bool(_LONDON_PC_RE.match((postcode or '').strip()))

# Sector → entity_kind mapping for migration
SECTOR_TO_KIND = {
    'healthcare': 'facility',
    'education': 'facility',
    'offices': 'company',
    'coworking': 'company',
    'serviced_offices': 'company',
    'property_management': 'property_manager',
    'residential_blocks': 'property_manager',
    'industrial': 'company',
    'religious_centres': 'charity',
    'community_venues': 'facility',
    'hospitality': 'facility',
    'gyms': 'facility',
    'automotive': 'facility',
    'retail': 'facility',
    'salons': 'facility',
}
