"""
seed_chain_operators.py — One-shot idempotent seed for chain_operators
                          and sector_shared_domains.

NOT executed automatically. Operator runs:
    python seed_chain_operators.py            # apply
    python seed_chain_operators.py --dry-run  # show what would happen

Reads CHAIN_OPERATORS and SHARED_DOMAINS lists below. Each row uses
INSERT ... ON CONFLICT DO NOTHING, so re-running is safe and reports
"inserted: N, skipped: M".

Cost: £0. No external API. Pure DB inserts.
"""
from __future__ import annotations
import argparse
import sys
import logging

logger = logging.getLogger("seed_chain_operators")
logging.basicConfig(level=logging.INFO, format="%(message)s")


# ──────────────────────────────────────────────────────────────────────
# Seed data (per docs/SCRAPER_ENHANCER_V1_PLAN.md §1.7)
# ──────────────────────────────────────────────────────────────────────
CHAIN_OPERATORS = [
    # Pubs
    ("pub", "Mitchells & Butlers", "mbplc.com",
     ["Crown Carveries", "Toby Carvery", "Harvester", "All Bar One",
      "Browns", "O'Neill's"]),
    ("pub", "Greene King", "greeneking.co.uk",
     ["Hungry Horse", "Farmhouse Inns", "Chef & Brewer", "Flaming Grill"]),
    ("pub", "Young's", "youngs.co.uk", []),
    ("pub", "Fuller's", "fullers.co.uk", ["Fuller Smith Turner"]),
    ("pub", "Marston's", "marstons.co.uk", []),
    ("pub", "JD Wetherspoon", "jdwetherspoon.com", ["Wetherspoons"]),
    ("pub", "Stonegate", "stonegategroup.co.uk",
     ["Slug & Lettuce", "Walkabout", "Yates's"]),

    # Healthcare
    ("healthcare", "NHS shared infrastructure", "nhs.net", []),
    ("healthcare", "NHS web", "nhs.uk", []),
    ("healthcare", "Bupa", "bupa.co.uk",
     ["Bupa Centre", "Bupa Health Clinic"]),
    ("healthcare", "Nuffield Health", "nuffieldhealth.com", []),
    ("healthcare", "HCA Healthcare", "hcahealthcare.co.uk", []),
    ("healthcare", "Spire", "spirehealthcare.com", []),

    # Estate agents
    ("estate_agent", "Foxtons", "foxtons.co.uk", []),
    ("estate_agent", "Winkworth", "winkworth.co.uk", []),
    ("estate_agent", "Kinleigh Folkard & Hayward", "kfh.co.uk", ["KFH"]),
    ("estate_agent", "Dexters", "dexters.co.uk", []),
    ("estate_agent", "Savills", "savills.co.uk", []),
    ("estate_agent", "Knight Frank", "knightfrank.co.uk", []),

    # Gyms
    ("gym", "PureGym", "puregym.com", []),
    ("gym", "The Gym Group", "thegymgroup.com", []),
    ("gym", "Anytime Fitness", "anytimefitness.co.uk", []),
    ("gym", "Fitness First", "fitnessfirst.co.uk", []),
    ("gym", "David Lloyd", "davidlloyd.co.uk", []),

    # Dealerships
    ("dealership", "BMW UK", "bmw.co.uk", ["BMW"]),
    ("dealership", "Audi UK", "audi.co.uk", ["Audi"]),
    ("dealership", "Mercedes-Benz UK", "mercedes-benz.co.uk",
     ["Mercedes", "Mercedes-Benz"]),
    ("dealership", "Ford UK", "ford.co.uk", []),
    ("dealership", "Volkswagen UK", "volkswagen.co.uk",
     ["VW", "Volkswagen"]),

    # Property management
    ("property_management", "Rendall & Rittner", "rendallandrittner.co.uk", []),
    ("property_management", "FirstPort", "firstport.co.uk", []),
    ("property_management", "Mainstay", "mainstaygroup.co.uk", []),

    # Serviced offices
    ("serviced_office", "Regus / IWG", "regus.co.uk", ["IWG", "Regus"]),
    ("serviced_office", "WeWork", "wework.com", []),
]

SHARED_DOMAINS = [
    ("healthcare", "nhs.net", 0.95),
    ("healthcare", "nhs.uk", 0.90),
    ("education", "ac.uk", 0.85),
    ("education", "sch.uk", 0.85),
    ("government", "gov.uk", 0.95),
    ("government", "police.uk", 0.95),
]


# ──────────────────────────────────────────────────────────────────────
def _seed_chains(conn, dry_run: bool) -> tuple[int, int]:
    import db_pg  # type: ignore
    inserted = skipped = 0
    for sector, chain_name, root_domain, aliases in CHAIN_OPERATORS:
        if dry_run:
            logger.info("DRY: would insert chain %s / %s",
                        chain_name, root_domain)
            inserted += 1
            continue
        # ON CONFLICT DO NOTHING returns the inserted row only when it
        # actually wrote. We use RETURNING + check via fetchone.
        row = db_pg.fetchone(
            conn,
            "INSERT INTO chain_operators "
            "(sector, chain_name, root_domain, name_aliases) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (root_domain, chain_name) DO NOTHING "
            "RETURNING id",
            (sector, chain_name, root_domain, aliases),
        )
        if row:
            inserted += 1
        else:
            skipped += 1
    return inserted, skipped


def _seed_shared(conn, dry_run: bool) -> tuple[int, int]:
    import db_pg  # type: ignore
    inserted = skipped = 0
    for sector, root_domain, confidence in SHARED_DOMAINS:
        if dry_run:
            logger.info("DRY: would insert shared %s / %s @ %s",
                        sector, root_domain, confidence)
            inserted += 1
            continue
        row = db_pg.fetchone(
            conn,
            "INSERT INTO sector_shared_domains "
            "(sector, root_domain, confidence) "
            "VALUES (%s, %s, %s) "
            "ON CONFLICT (sector, root_domain) DO NOTHING "
            "RETURNING id",
            (sector, root_domain, confidence),
        )
        if row:
            inserted += 1
        else:
            skipped += 1
    return inserted, skipped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="Show what would happen, no DB writes")
    args = ap.parse_args()

    try:
        import db_pg  # type: ignore
    except Exception as e:
        logger.error("db_pg import failed: %s", e)
        return 2

    if args.dry_run:
        logger.info("=== DRY RUN — no DB writes ===")
        c_ins, c_skip = _seed_chains(None, dry_run=True)
        s_ins, s_skip = _seed_shared(None, dry_run=True)
        logger.info("chain_operators: %d would insert", c_ins)
        logger.info("sector_shared_domains: %d would insert", s_ins)
        return 0

    try:
        with db_pg.transaction() as conn:
            # Pre-flight: tables must exist (migration 011 must have run)
            row = db_pg.fetchone(
                conn,
                "SELECT to_regclass('public.chain_operators') AS a, "
                "       to_regclass('public.sector_shared_domains') AS b",
            )
            if not (row and row.get("a") and row.get("b")):
                logger.error(
                    "chain_operators / sector_shared_domains not present. "
                    "Run migration 011 first."
                )
                return 3

            c_ins, c_skip = _seed_chains(conn, dry_run=False)
            s_ins, s_skip = _seed_shared(conn, dry_run=False)

        logger.info("chain_operators       : inserted=%d skipped=%d",
                    c_ins, c_skip)
        logger.info("sector_shared_domains : inserted=%d skipped=%d",
                    s_ins, s_skip)
        return 0
    except Exception as e:
        logger.error("seed failed: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
