"""buying_signals.py — buying signal orchestration layer."""
import logging
from config import BUYING_SIGNAL_WEIGHTS, BUYING_SIGNAL_CAP
from database import get_leads_for_signal_detection, update_buying_signals
from signal_rules import detect_rule_signals
from signal_ai import infer_ai_signals
logger=logging.getLogger(__name__)
BOOLEAN_FIELDS=['move_signal','expansion_signal','refurb_signal','hiring_signal','compliance_signal','review_signal','multi_site_signal']

def _merge(rule_data, ai_data):
    merged={f: bool(rule_data.get(f) or ai_data.get(f)) for f in BOOLEAN_FIELDS}
    merged_types=set(rule_data.get('buying_signal_types') or []) | set(ai_data.get('buying_signal_types') or [])
    merged['buying_signal_types']=sorted(merged_types)
    merged['timing_urgency']=ai_data.get('timing_urgency') or rule_data.get('timing_urgency') or 'low'
    merged['likely_buyer_role']=ai_data.get('likely_buyer_role') or rule_data.get('likely_buyer_role')
    merged['trigger_summary']=ai_data.get('trigger_summary') or rule_data.get('trigger_summary')
    merged['recommended_offer']=ai_data.get('recommended_offer') or rule_data.get('recommended_offer')
    merged['recommended_channel']=ai_data.get('recommended_channel') or rule_data.get('recommended_channel')
    return merged

def calculate_buying_signal_score(payload):
    score=sum(weight for field,weight in BUYING_SIGNAL_WEIGHTS.items() if payload.get(field))
    score += {'high':5,'medium':2,'low':0}.get((payload.get('timing_urgency') or 'low').lower(),0)
    return min(score, BUYING_SIGNAL_CAP)

def detect_signals_for_row(row, use_ai=True):
    rule_data=detect_rule_signals(row)
    ai_data=infer_ai_signals(row) if use_ai else {}
    merged=_merge(rule_data, ai_data)
    merged['buying_signal_score']=calculate_buying_signal_score(merged)
    merged['buying_signal_types']=', '.join(merged['buying_signal_types'])
    return merged

def run_buying_signals_batch(limit=500,use_ai=True,force=False):
    rows=get_leads_for_signal_detection(limit=limit, force=force); processed=0
    for row in rows:
        payload=detect_signals_for_row(dict(row), use_ai=use_ai)
        update_buying_signals(row['place_id'], payload)
        processed += 1
        if processed % 50 == 0: logger.info('Buying signal progress: %d/%d', processed, len(rows))
    logger.info('Buying signals complete. %d leads processed.', processed)
    return processed
