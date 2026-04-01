"""
run_connectors.py — CLI to run data connectors
Usage:
    python run_connectors.py --source cqc [--limit 50]
    python run_connectors.py --source companies_house [--limit 500]
    python run_connectors.py --source contracts_finder [--limit 200]
    python run_connectors.py --source charity_commission [--limit 5000]
    python run_connectors.py --all
"""

import argparse
import logging
import sys

import config
import db_pg

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
logger = logging.getLogger(__name__)


CONNECTOR_MAP = {
    'cqc': {
        'class': 'connectors.cqc.CQCConnector',
        'args': {'api_key': config.CQC_SUBSCRIPTION_KEY},
    },
    'companies_house': {
        'class': 'connectors.companies_house.CompaniesHouseConnector',
        'args': {'api_key': config.COMPANIES_HOUSE_API_KEY},
    },
    'contracts_finder': {
        'class': 'connectors.contracts_finder.ContractsFinderConnector',
        'args': {
            'client_id': config.CONTRACTS_FINDER_CLIENT_ID,
            'client_secret': config.CONTRACTS_FINDER_CLIENT_SECRET,
        },
    },
    'planning_applications': {
        'class': 'connectors.planning_applications.PlanningApplicationsConnector',
        'args': {},
    },
    'charity_commission': {
        'class': 'connectors.charity_commission.CharityCommissionConnector',
        'args': {'api_key': config.CHARITY_COMMISSION_API_KEY},
    },
}


def _load_connector(name: str):
    """Dynamically import and instantiate a connector class."""
    spec = CONNECTOR_MAP.get(name)
    if not spec:
        raise ValueError(f"Unknown connector: {name!r}. Choose from: {list(CONNECTOR_MAP)}")
    module_path, class_name = spec['class'].rsplit('.', 1)
    import importlib
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    return cls(**spec['args'])


def run_connector(name: str, limit: int = None):
    connector = _load_connector(name)
    if not connector.is_configured():
        logger.warning(f"{name}: not configured (missing API key/credentials) — skipping")
        return 0

    logger.info(f"Running connector: {name}" + (f" (limit={limit})" if limit else ""))
    conn = db_pg.get_conn()
    try:
        kwargs = {'limit': limit} if limit else {}
        count = connector.run(conn, **kwargs)
        logger.info(f"{name}: completed — {count:,} records processed")
        return count
    except Exception as e:
        logger.error(f"{name}: failed — {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Run AskMiro data connectors')
    ap.add_argument('--source', choices=list(CONNECTOR_MAP), help='Connector to run')
    ap.add_argument('--all', action='store_true', help='Run all connectors')
    ap.add_argument('--limit', type=int, default=None, help='Max records to process')
    args = ap.parse_args()

    if not args.source and not args.all:
        ap.print_help()
        sys.exit(1)

    sources = list(CONNECTOR_MAP) if args.all else [args.source]
    for src in sources:
        try:
            run_connector(src, limit=args.limit)
        except Exception as e:
            logger.error(f"Connector {src} failed: {e}")
