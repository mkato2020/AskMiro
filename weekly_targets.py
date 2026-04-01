"""weekly_targets.py — ranked weekly target selection."""
from database import db_connection

def _rows(sql, params=()):
    with db_connection() as conn: return [dict(r) for r in conn.execute(sql, params).fetchall()]

def immediate_opportunity_leads(limit=100):
    return _rows("SELECT place_id,business_name,normalized_sector,borough,priority_score,buying_signal_score,timing_urgency,trigger_summary,recommended_offer,recommended_channel,phone,website FROM lead_records WHERE COALESCE(ai_is_cleaning_target,1)=1 AND pipeline_status NOT IN ('won','lost') AND timing_urgency='high' ORDER BY priority_score DESC,buying_signal_score DESC LIMIT ?", (limit,))

def strategic_multi_site_targets(limit=50):
    return _rows("SELECT place_id,business_name,normalized_sector,borough,priority_score,buying_signal_score,trigger_summary,recommended_offer FROM lead_records WHERE multi_site_signal=1 OR likely_multi_site=1 ORDER BY priority_score DESC,buying_signal_score DESC LIMIT ?", (limit,))

def route_cluster_targets(limit=50):
    return _rows("SELECT borough, normalized_sector, COUNT(*) AS lead_count, ROUND(AVG(priority_score),1) AS avg_score, SUM(CASE WHEN timing_urgency='high' THEN 1 ELSE 0 END) AS urgent FROM lead_records WHERE pipeline_status NOT IN ('won','lost') AND priority_score >= 60 GROUP BY borough, normalized_sector HAVING lead_count >= 2 ORDER BY urgent DESC, avg_score DESC, lead_count DESC LIMIT ?", (limit,))

def regulated_premium_targets(limit=25):
    return _rows("SELECT place_id,business_name,normalized_sector,borough,priority_score,buying_signal_score,trigger_summary,recommended_offer FROM lead_records WHERE compliance_signal=1 AND rating >= 4.2 AND review_count >= 10 ORDER BY priority_score DESC LIMIT ?", (limit,))
