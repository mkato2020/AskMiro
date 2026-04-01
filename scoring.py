"""scoring.py — hybrid scoring with buying signals."""
import math, logging
from config import SCORING_WEIGHTS, SECTOR_PRIORITY, PRIORITY_BOROUGHS, SECONDARY_BOROUGHS
from ai_client import call_ai
from ai_prompts import SYSTEM_SCORER, build_score_signal_prompt
from database import update_lead_score, get_leads_for_scoring
logger=logging.getLogger(__name__)

def _score_contact_completeness(has_phone, has_website):
    score=0; notes=[]
    if has_phone: score += SCORING_WEIGHTS.has_phone; notes.append('has phone')
    if has_website: score += SCORING_WEIGHTS.has_website; notes.append('has website')
    return score, ', '.join(notes) if notes else 'no contact details'

def _score_rating(rating, review_count):
    r_score=round(((rating or 0)/5.0)*SCORING_WEIGHTS.rating) if rating else 0
    rc_score=round(min(math.log10((review_count or 0)+1)/3.0,1.0)*SCORING_WEIGHTS.review_count) if review_count else 0
    return r_score+rc_score, f"rating={rating or 0:.1f}/5 ({review_count or 0} reviews)"

def _score_sector(sector):
    p=SECTOR_PRIORITY.get(sector,4)
    if p==1: return SCORING_WEIGHTS.target_sector, f'priority-1 sector ({sector})'
    if p==2: return round(SCORING_WEIGHTS.target_sector*0.65), f'priority-2 sector ({sector})'
    if p==3: return round(SCORING_WEIGHTS.target_sector*0.35), f'priority-3 sector ({sector})'
    return 0, f'non-target sector ({sector})'

def _score_borough(b):
    if b in PRIORITY_BOROUGHS: return SCORING_WEIGHTS.target_borough, f'priority borough ({b})'
    if b in SECONDARY_BOROUGHS: return round(SCORING_WEIGHTS.target_borough*0.5), f'secondary borough ({b})'
    return 0, f'non-target borough ({b})'

def _get_ai_signal(row):
    response=call_ai(system_prompt=SYSTEM_SCORER,user_prompt=build_score_signal_prompt(row.get('business_name',''),row.get('normalized_sector',''),row.get('borough',''),bool(row.get('has_website')),bool(row.get('has_phone')),row.get('rating'),row.get('review_count'),row.get('website_summary'),row.get('ai_business_type')),prompt_type='score',max_tokens=300)
    data=response.as_json()
    if not data: return round(SCORING_WEIGHTS.ai_signal*0.5), 'AI signal unavailable — using neutral score'
    n=round((data.get('ai_signal_score',50)/100.0)*SCORING_WEIGHTS.ai_signal)
    if not data.get('is_serious_prospect', True): n=min(n,5)
    return n, data.get('reason','')

def _next_best_action(score, has_phone, has_website, urgency='low'):
    if urgency=='high' and has_phone: return 'call_first'
    if score >= 80: return 'call_first' if has_phone else 'cold_email'
    if score >= 60: return 'cold_email' if has_website else 'linkedin_search'
    if score >= 40: return 'linkedin_search'
    return 'low_priority_hold'

def score_lead(row, use_ai=True):
    if row.get('ai_is_cleaning_target') is False:
        return {'priority_score':0,'score_reason':'AI classified as not a cleaning target','high_value_target':False,'likely_multi_site':False,'next_best_action':'skip'}
    c,cn=_score_contact_completeness(bool(row.get('has_phone')), bool(row.get('has_website')))
    r,rn=_score_rating(row.get('rating'), row.get('review_count'))
    s,sn=_score_sector(row.get('normalized_sector','other'))
    b,bn=_score_borough(row.get('borough',''))
    ai,ar=_get_ai_signal(row) if use_ai else (round(SCORING_WEIGHTS.ai_signal*0.6),'rule-based only (AI disabled)')
    signal=min(int(row.get('buying_signal_score') or 0), 40)
    multi_bonus=5 if (row.get('multi_site_signal') or row.get('likely_multi_site')) else 0
    total=min(c+r+s+b+ai+signal+multi_bonus,100)
    high= total>=70 and row.get('normalized_sector') in {'offices','serviced_offices','coworking','healthcare','automotive','property_management','education','residential_blocks'}
    reason=' | '.join(x for x in [cn,rn,sn,bn,f'signals={signal}',ar] if x)
    return {'priority_score': total, 'score_reason': reason, 'high_value_target': high, 'likely_multi_site': bool(row.get('multi_site_signal') or row.get('likely_multi_site')), 'next_best_action': _next_best_action(total,bool(row.get('has_phone')),bool(row.get('has_website')),row.get('timing_urgency') or 'low')}

def run_scoring_batch(limit=1000, use_ai=True):
    rows=get_leads_for_scoring(limit=limit); processed=0
    for row in rows:
        result=score_lead(dict(row), use_ai=use_ai)
        update_lead_score(row['place_id'], result['priority_score'], result['score_reason'], result['high_value_target'], result['likely_multi_site'], result['next_best_action'])
        processed += 1
        if processed % 100 == 0: logger.info('Scoring progress: %d/%d', processed, len(rows))
    logger.info('Scoring complete. %d leads scored.', processed)
    return processed
