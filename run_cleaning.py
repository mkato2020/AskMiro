"""
run_cleaning.py — AskMiro Lead Intelligence OS
Promotes raw_leads -> lead_records with cleaning and normalisation applied.
"""

import argparse
import logging
from datetime import datetime

from database import init_db, get_uncleaned_raw_leads, get_all_raw_leads, upsert_lead_record
from cleaning import clean_raw_record
from models import LeadRecord
from logger_setup import setup_logging

logger = logging.getLogger(__name__)


def _safe_parse_datetime(value):
    """
    Parse a datetime safely.
    Returns a datetime object when possible, otherwise current UTC time.
    """
    if isinstance(value, datetime):
        return value

    if value is None:
        return datetime.utcnow()

    text = str(value).strip()
    if not text:
        return datetime.utcnow()

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.utcnow()


def main():
    parser = argparse.ArgumentParser(
        description="AskMiro Cleaning — raw -> structured leads"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5000,
        help="Max records to clean this run",
    )
    parser.add_argument(
        "--reprocess",
        action="store_true",
        help="Reprocess ALL raw leads (overwrites existing lead_records — use after schema/mapping fixes)",
    )
    args = parser.parse_args()

    setup_logging()
    init_db()

    if args.reprocess:
        rows = get_all_raw_leads(limit=args.limit)
        logger.info("Reprocess mode: cleaning all %d raw leads...", len(rows))
    else:
        rows = get_uncleaned_raw_leads(limit=args.limit)
        if not rows:
            logger.info("No new raw leads to clean.")
            print("✓ Nothing to clean — all raw leads already processed.")
            return
    logger.info("Cleaning %d raw leads...", len(rows))
    processed = 0

    for row in rows:
        cleaned = clean_raw_record(dict(row))

        lead = LeadRecord(
            place_id=cleaned.get("place_id"),
            business_name=cleaned.get("business_name", ""),
            raw_sector=cleaned.get("raw_sector", ""),
            normalized_sector=cleaned.get("normalized_sector", ""),
            borough=cleaned.get("borough", ""),
            address=cleaned.get("address", ""),
            postcode=cleaned.get("postcode", ""),
            latitude=cleaned.get("latitude"),
            longitude=cleaned.get("longitude"),
            website=cleaned.get("website", ""),
            phone=cleaned.get("phone", ""),
            rating=cleaned.get("rating", 0),
            review_count=cleaned.get("review_count", 0),
            google_maps_url=cleaned.get("google_maps_url", ""),
            source_query=cleaned.get("source_query", ""),
            source_system=cleaned.get("source_system", "csv_import"),
            date_collected=_safe_parse_datetime(cleaned.get("date_collected")),
            has_phone=cleaned.get("has_phone", 0),
            has_website=cleaned.get("has_website", 0),
            postcode_extracted=cleaned.get("postcode_extracted", 0),
        )

        upsert_lead_record(lead)
        processed += 1

        if processed % 500 == 0:
            logger.info("Cleaning progress: %d/%d", processed, len(rows))

    logger.info("Cleaning complete. %d records promoted to lead_records.", processed)
    print(f"✓ Cleaned and promoted {processed} leads.")


if __name__ == "__main__":
    main()
