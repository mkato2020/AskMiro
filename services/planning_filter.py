"""
services/planning_filter.py
────────────────────────────
Rules-based planning application relevance filter for commercial cleaning sales.
Cost: £0  (zero AI calls — pure regex + keyword scoring)

Only planning records that represent genuine cleaning opportunities are kept.
Everything else — tree works, signage, minor amendments, domestic extensions — is filtered out.
"""
from __future__ import annotations
import re
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db_pg
from datetime import datetime

# ── INCLUDE keywords (at least one required) ────────────────────────────────
# These indicate a commercially interesting planning application
_INCLUDE = [
    # New builds & significant development
    r'\bnew build\b', r'\bnewly? built\b', r'\bground[- ]up\b',
    r'\berection of\b', r'\bnew commercial\b', r'\bnew office\b',
    r'\bnew hospital\b', r'\bnew clinic\b', r'\bnew school\b',
    r'\bnew gym\b', r'\bnew hotel\b', r'\bnew restaurant\b',
    r'\bnew warehouse\b', r'\bnew industrial\b',
    r'\bnew student\b', r'\bnew residential block\b',
    # Conversions (often trigger new cleaning contracts)
    r'\bchange of use\b', r'\bconversion\b', r'\bconvert(?:ed)?\b',
    r'\bfrom.*?class [abc]\b', r'\bto class [a-eg]\b',
    r'\bclass e\b', r'\bclass b\b',                # commercial use classes
    # Fit-out & refurbishment
    r'\bfit[- ]out\b', r'\bfitting out\b', r'\bfitted out\b',
    r'\brefurbish\b', r'\brefurb\b', r'\brenovation\b', r'\brenovat\b',
    r'\bstrip[- ]out\b', r'\binternal alteration\b',
    r'\binternal refit\b', r'\bworkplace\b',
    # Sector-specific (high cleaning value)
    r'\boffice\b', r'\boffices\b',
    r'\bmedical cent(?:re|er)\b', r'\bhealth cent(?:re|er)\b',
    r'\bprimary care\b', r'\bsurgery\b', r'\bclinic\b',
    r'\bhospital\b', r'\bnursing home\b', r'\bcare home\b',
    r'\bdental\b', r'\bveterinary\b', r'\bpharmacy\b',
    r'\bschool\b', r'\bcollege\b', r'\buniversity\b', r'\bacademy\b',
    r'\bnursery\b', r'\bpre[- ]school\b',
    r'\bgym\b', r'\bfitness cent(?:re|er)\b', r'\bleisure cent(?:re|er)\b',
    r'\bsports hall\b', r'\bswimming pool\b',
    r'\bhotel\b', r'\brestaurant\b', r'\bcafe\b', r'\bpub\b',
    r'\bbar\b', r'\bnight ?club\b', r'\btakeaway\b',
    r'\bwarehouse\b', r'\bindustrial unit\b', r'\bfactory\b',
    r'\bworkshop\b', r'\blight industrial\b',
    r'\bretail\b', r'\bshopping\b', r'\bsupermarket\b',
    r'\bshowroom\b', r'\bdealership\b',
    r'\bstudent accommodation\b', r'\bco[- ]living\b',
    r'\bserviced apartment\b', r'\bflats?\b',               # residential blocks OK
    r'\bdwelling\b',
    # Size indicators (more likely to need professional cleaning)
    r'\b\d{3,},?\d{0,3}\s*sq(?:uare)?\s*(?:m|metre|meter|ft|feet)\b',
    r'\b\d{2,}\s*(?:storey|story|floor)\b',
    r'\bmixed[- ]use\b',
    # Development activity
    r'\bdemolition\b', r'\bdemolish\b',
    r'\bextension\b',                                       # commercial extensions OK
    r'\bpermit(?:ted)? development\b',
]
_INCLUDE_RX = [re.compile(p, re.IGNORECASE) for p in _INCLUDE]

# ── EXCLUDE keywords (hard stop — any match removes record) ─────────────────
_EXCLUDE = [
    # Purely domestic / trivial
    r'\btree\b', r'\btrees\b', r'\btree works?\b', r'\btree preservation\b',
    r'\bTPO\b', r'\bhedge\b', r'\bshrub\b', r'\bgarden\b',
    r'\blawn\b', r'\blandscaping only\b',
    r'\bfence\b', r'\bwall\b', r'\bgate\b', r'\bgarden wall\b',
    r'\bpatio\b', r'\bdriveway\b', r'\bhard standing\b',
    r'\bbike shed\b', r'\bbin store\b',
    # Signage / advertising only
    r'\badvertising sign\b', r'\billuminated sign\b',
    r'\bfascia sign\b', r'\bsignage only\b',
    r'^[^.]{0,100}sign[^a-z]',                              # "sign" as main topic early in text
    # Minor domestic works
    r'\bloft conversion\b', r'\bsingle storey rear\b',
    r'\brear extension to dwellinghouse\b',
    r'\bdwelling ?house\b',
    r'\bhouse extension\b', r'\bhome extension\b',
    r'\bgarden shed\b', r'\bsummer house\b',
    r'\bporch\b',
    # Telecom / utility
    r'\bmast\b', r'\bantenna\b', r'\btelecom\b',
    r'\butility cabinet\b', r'\belectric vehicle\b', r'\bEV charger\b',
    r'\bsolar panel\b',                                     # unless part of larger development
    # Conditions / non-material amendments (no new build)
    r'\bnon[- ]material amendment\b',
    r'\bcondition\s+\d+\b',                                 # "discharge of condition 3"
    r'\bdischarge of condition\b',
    r'\bdetails required by condition\b',
    r'\bvariation of condition\b',                          # unless it includes something interesting
    r'\bdetails pursuant to\b',
    r'\bapproved in accordance with\b',
    # Parking / highways only
    r'\bparking only\b', r'\bdouble yellow\b', r'\btraffic order\b',
    # Domestic-only residential (not blocks)
    r'\b1\s*(?:x\s*)?(?:bedroom|bed)\s*(?:flat|dwelling|unit)\b',  # single flat
    r'\bconversion of\s+(?:a\s+)?house\s+to\s+(?:\d+\s+)?flats\b', # house→flats (too small usually)
]
_EXCLUDE_RX = [re.compile(p, re.IGNORECASE) for p in _EXCLUDE]

# ── Weak-positive boosters (raise score without being required) ──────────────
_BOOST = {
    'change_of_use':      (r'\bchange of use\b',           0.25),
    'fit_out':            (r'\bfit[- ]out\b',              0.25),
    'healthcare':         (r'\b(?:clinic|hospital|care home|medical|dental|cqc|nhs|nursing)\b', 0.30),
    'education':          (r'\b(?:school|college|university|academy|nursery)\b', 0.20),
    'hospitality':        (r'\b(?:hotel|restaurant|pub|bar|gym|leisure)\b', 0.15),
    'office':             (r'\boffice(?:s)?\b',            0.15),
    'industrial':         (r'\b(?:warehouse|industrial|factory|workshop)\b', 0.15),
    'new_build':          (r'\b(?:erection of|new build|ground[- ]up)\b', 0.20),
    'large_scale':        (r'\b\d{3,},?\d{0,3}\s*sq',     0.15),
    'demolition':         (r'\bdemolition\b',              0.10),
    'residential_block':  (r'\b(?:\d{2,}\s*flats?|student accommodation|co[- ]living|serviced apartment)\b', 0.15),
}

# ── Category inference ───────────────────────────────────────────────────────
_CATEGORY_RULES = [
    ('healthcare',        r'\b(?:clinic|hospital|care home|medical|dental|cqc|nhs|nursing home|pharmacy|vet(?:erinary)?|surgery)\b'),
    ('education',         r'\b(?:school|college|university|academy|nursery|pre[- ]school)\b'),
    ('hospitality',       r'\b(?:hotel|restaurant|pub|bar|cafe|takeaway|night ?club)\b'),
    ('gym_leisure',       r'\b(?:gym|fitness|leisure cent|sports hall|swimming pool|yoga|pilates)\b'),
    ('office',            r'\boffice(?:s)?\b'),
    ('industrial',        r'\b(?:warehouse|industrial unit|factory|workshop|light industrial)\b'),
    ('retail',            r'\b(?:retail|shopping|supermarket|showroom|dealership)\b'),
    ('residential_block', r'\b(?:student accommodation|co[- ]living|serviced apartment|\d{2,}\s*flats?|block of flats)\b'),
    ('fit_out',           r'\bfit[- ]out\b'),
    ('conversion',        r'\bchange of use\b'),
    ('new_build',         r'\b(?:erection of|new build)\b'),
]
_CATEGORY_RX = [(cat, re.compile(p, re.IGNORECASE)) for cat, p in _CATEGORY_RULES]


def score_planning_description(description: str) -> dict:
    """
    Score a planning application description for cleaning-sales relevance.

    Returns:
        {
          'is_relevant': bool,
          'relevance_score': float,   # 0.0 – 1.0
          'category': str,
          'include_reasons': list[str],
          'exclude_reasons': list[str],
          'evidence_snippet': str,
        }
    """
    if not description:
        return _irrelevant([], ['no_description'])

    text = description.strip()
    snippet = text[:150]

    # ── Hard excludes first (zero tolerance) ──
    exclude_hits = []
    for rx in _EXCLUDE_RX:
        m = rx.search(text)
        if m:
            exclude_hits.append(rx.pattern[:40])
    if exclude_hits:
        return _irrelevant([], exclude_hits[:3], snippet)

    # ── Must have at least one include match ──
    include_hits = []
    for rx in _INCLUDE_RX:
        m = rx.search(text)
        if m:
            include_hits.append(rx.pattern[:40])
    if not include_hits:
        return _irrelevant([], ['no_commercial_keywords'], snippet)

    # ── Score boosters ──
    score = 0.40   # base for passing include + exclude filters
    for key, (pattern, weight) in _BOOST.items():
        if re.search(pattern, text, re.IGNORECASE):
            score += weight

    score = min(1.0, score)

    # ── Category inference ──
    category = 'other'
    for cat, rx in _CATEGORY_RX:
        if rx.search(text):
            category = cat
            break

    return {
        'is_relevant':     True,
        'relevance_score': round(score, 3),
        'category':        category,
        'include_reasons': include_hits[:5],
        'exclude_reasons': [],
        'evidence_snippet': snippet,
    }


def _irrelevant(include, exclude, snippet='') -> dict:
    return {
        'is_relevant':     False,
        'relevance_score': 0.0,
        'category':        'excluded',
        'include_reasons': include,
        'exclude_reasons': exclude[:3],
        'evidence_snippet': snippet,
    }


# ── Batch scorer ─────────────────────────────────────────────────────────────

def run_planning_filter(conn=None, dry_run: bool = False) -> dict:
    """
    Score all planning signals and write results to planning_relevance table.
    Also marks low-relevance signals as planning_relevant=FALSE on signals table.

    Returns: {total, relevant, filtered, categories}
    """
    own_conn = conn is None
    if own_conn:
        conn = db_pg.get_conn()

    try:
        # Fetch all planning signals that haven't been scored yet
        rows = db_pg.fetchall(conn, """
            SELECT s.id, s.entity_id, s.evidence
            FROM signals s
            WHERE s.signal_type = 'new_development'
              AND s.active = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM planning_relevance pr WHERE pr.signal_id = s.id
              )
            ORDER BY s.id
        """)

        total = len(rows)
        relevant = 0
        filtered = 0
        category_counts: dict[str, int] = {}

        for r in rows:
            result = score_planning_description(r['evidence'] or '')

            if not dry_run:
                # Write to planning_relevance table
                db_pg.execute(conn, """
                    INSERT INTO planning_relevance
                        (signal_id, entity_id, is_relevant, relevance_score, category,
                         include_reasons, exclude_reasons, evidence_snippet, scored_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT DO NOTHING
                """, (
                    r['id'], r['entity_id'],
                    result['is_relevant'], result['relevance_score'],
                    result['category'],
                    result['include_reasons'], result['exclude_reasons'],
                    result['evidence_snippet'],
                ))

                # Backfill planning_relevant flag on signals table
                db_pg.execute(conn, """
                    UPDATE signals SET
                        planning_relevant = %s,
                        planning_relevance_score = %s,
                        planning_category = %s
                    WHERE id = %s
                """, (
                    result['is_relevant'],
                    result['relevance_score'],
                    result['category'],
                    r['id'],
                ))

            if result['is_relevant']:
                relevant += 1
                cat = result['category']
                category_counts[cat] = category_counts.get(cat, 0) + 1
            else:
                filtered += 1

        if not dry_run:
            conn.commit()

        return {
            'total':      total,
            'relevant':   relevant,
            'filtered':   filtered,
            'categories': category_counts,
        }
    finally:
        if own_conn:
            conn.close()


# ── Quick relevance check for single evidence string (used by API) ───────────
def is_relevant(evidence: str) -> bool:
    return score_planning_description(evidence)['is_relevant']


if __name__ == '__main__':
    print("Running planning relevance filter...")
    stats = run_planning_filter()
    print(f"Total:    {stats['total']}")
    print(f"Relevant: {stats['relevant']}")
    print(f"Filtered: {stats['filtered']}")
    print("Categories:")
    for cat, n in sorted(stats['categories'].items(), key=lambda x: -x[1]):
        print(f"  {cat}: {n}")
