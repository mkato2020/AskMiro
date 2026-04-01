"""signal_ai.py — AI-assisted buying signal inference."""
import logging
from ai_client import call_ai
from ai_prompts import SYSTEM_SIGNALS, build_signal_prompt
logger=logging.getLogger(__name__)

def infer_ai_signals(row):
    response=call_ai(system_prompt=SYSTEM_SIGNALS,user_prompt=build_signal_prompt(row.get('business_name',''),row.get('normalized_sector',''),row.get('borough',''),row.get('website_summary'),row.get('website_pain_points'),row.get('ai_business_type'),row.get('ai_classification_note'),row.get('address'),row.get('rating'),row.get('review_count')),prompt_type='signal',max_tokens=500)
    data=response.as_json()
    if not data:
        logger.warning('Signal AI parse failed for %s', row.get('place_id'))
        return {'buying_signal_types': [], 'timing_urgency':'low','likely_buyer_role': row.get('ai_decision_maker_type') or 'Facilities Manager','trigger_summary':'AI signal inference unavailable.','recommended_offer':'Managed commercial cleaning with consistent teams and supervisor-led quality checks.','recommended_channel':'email','reason':'AI parse failed'}
    return data
