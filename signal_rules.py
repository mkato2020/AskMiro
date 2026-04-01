"""signal_rules.py — deterministic buying signal detection."""
import re

MOVE_PATTERNS=[r"moving to",r"relocat",r"new headquarters",r"new office",r"handover"]
EXPANSION_PATTERNS=[r"opening soon",r"now open",r"new branch",r"new location",r"expanding",r"growth",r"launch"]
REFURB_PATTERNS=[r"refurb",r"renovat",r"fit[- ]?out",r"workspace refresh",r"showroom refresh"]
HIRING_PATTERNS=[r"facilities manager",r"office manager",r"workplace manager",r"building manager",r"operations manager",r"estates manager",r"practice manager"]
COMPLIANCE_SECTORS={"healthcare","education","hospitality","automotive"}
MULTI_SITE_PATTERNS=[r"locations",r"our clinics",r"branches",r"sites",r"campuses",r"across london",r"multiple locations"]
REVIEW_DIRTY_PATTERNS=[r"dirty",r"unclean",r"messy",r"dusty",r"toilet",r"hygiene",r"filthy"]

def _text(row):
    return ' '.join(str(row.get(k) or '') for k in ['business_name','normalized_sector','website_summary','website_pain_points','ai_business_type','ai_classification_note','website_business_type','source_query']).lower()

def _match_any(text, patterns):
    return any(re.search(p, text, re.I) for p in patterns)

def detect_rule_signals(row):
    text=_text(row); sector=(row.get('normalized_sector') or '').lower(); name=(row.get('business_name') or '').lower(); reviews=int(row.get('review_count') or 0); rating=float(row.get('rating') or 0)
    move_signal=_match_any(text, MOVE_PATTERNS)
    expansion_signal=_match_any(text, EXPANSION_PATTERNS)
    refurb_signal=_match_any(text, REFURB_PATTERNS)
    hiring_signal=_match_any(text, HIRING_PATTERNS)
    compliance_signal=sector in COMPLIANCE_SECTORS or any(x in text for x in ['cqc','ofsted','infection','compliance','audit'])
    review_signal=_match_any(text, REVIEW_DIRTY_PATTERNS) or (rating and rating<4.0 and reviews>=25)
    multi_site_signal=_match_any(text, MULTI_SITE_PATTERNS) or any(k in name for k in ['group','holdings','management','services']) or bool(row.get('likely_multi_site'))
    types=[]
    for key,flag in {'move':move_signal,'expansion':expansion_signal,'refurb':refurb_signal,'hiring':hiring_signal,'compliance':compliance_signal,'review':review_signal,'multi_site':multi_site_signal}.items():
        if flag: types.append(key)
    urgency='high' if move_signal or expansion_signal or hiring_signal else 'medium' if compliance_signal or refurb_signal or multi_site_signal else 'low'
    offer_map={'healthcare':'Clinical cleaning programme with documented infection-control procedures.','education':'School and nursery cleaning programme with safeguarding-aware teams.','property_management':'Communal area and block management cleaning with bin-store hygiene checks.','residential_blocks':'Communal cleaning package for lobbies, lifts, stairs, and bin stores.','automotive':'Showroom and workshop cleaning programme with presentation-first standards.','offices':'Managed office cleaning with washroom checks and touchpoint hygiene.','serviced_offices':'Day porter and flexible janitorial support for shared offices.','coworking':'Managed workspace cleaning with high-traffic touchpoint coverage.'}
    recommended_offer=offer_map.get(sector,'Managed commercial cleaning with consistent teams and supervisor-led quality checks.')
    recommended_channel='email + phone' if row.get('has_phone') and row.get('has_website') else 'phone' if row.get('has_phone') else 'email' if row.get('has_website') else 'linkedin'
    buyer=row.get('ai_decision_maker_type') or ('Practice Manager' if sector=='healthcare' else 'School Business Manager' if sector=='education' else 'Property Manager' if sector in {'property_management','residential_blocks'} else 'Facilities Manager')
    return {'move_signal':move_signal,'expansion_signal':expansion_signal,'refurb_signal':refurb_signal,'hiring_signal':hiring_signal,'compliance_signal':compliance_signal,'review_signal':review_signal,'multi_site_signal':multi_site_signal,'buying_signal_types':types,'timing_urgency':urgency,'recommended_offer':recommended_offer,'recommended_channel':recommended_channel,'likely_buyer_role':buyer,'trigger_summary': '; '.join(types[:4]) if types else 'No strong rule-based buying signal detected.'}
