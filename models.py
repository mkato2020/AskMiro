"""
models.py — AskMiro Lead Intelligence OS
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Optional

@dataclass
class RawLead:
    place_id: str; business_name: str; raw_sector: str; address: str
    latitude: Optional[float]; longitude: Optional[float]; website: Optional[str]
    phone: Optional[str]; rating: Optional[float]; review_count: Optional[int]
    google_maps_url: Optional[str]; source_query: str; source_system: str
    date_collected: datetime = field(default_factory=datetime.utcnow); id: Optional[int] = None

@dataclass
class LeadRecord:
    place_id: str; business_name: str; raw_sector: str; normalized_sector: str; borough: str; address: str
    postcode: Optional[str]; latitude: Optional[float]; longitude: Optional[float]; website: Optional[str]
    phone: Optional[str]; rating: Optional[float]; review_count: Optional[int]; google_maps_url: Optional[str]
    source_query: str; source_system: str; date_collected: datetime
    has_phone: bool=False; has_website: bool=False; postcode_extracted: bool=False
    ai_business_type: Optional[str]=None; ai_sub_sector: Optional[str]=None; ai_decision_maker_type: Optional[str]=None
    ai_is_cleaning_target: Optional[bool]=None; ai_classification_note: Optional[str]=None
    priority_score: int=0; score_reason: Optional[str]=None; high_value_target: bool=False; likely_multi_site: bool=False; next_best_action: Optional[str]=None
    website_summary: Optional[str]=None; website_business_type: Optional[str]=None; website_pain_points: Optional[str]=None; website_scraped_at: Optional[datetime]=None
    buying_signal_score: int=0; buying_signal_types: Optional[str]=None
    move_signal: bool=False; expansion_signal: bool=False; refurb_signal: bool=False; hiring_signal: bool=False; compliance_signal: bool=False; review_signal: bool=False; multi_site_signal: bool=False
    trigger_summary: Optional[str]=None; recommended_offer: Optional[str]=None; recommended_channel: Optional[str]=None; timing_urgency: Optional[str]=None; likely_buyer_role: Optional[str]=None
    pipeline_status: str="raw"; created_at: datetime=field(default_factory=datetime.utcnow); updated_at: datetime=field(default_factory=datetime.utcnow); id: Optional[int]=None

@dataclass
class PipelineLead:
    place_id: str; business_name: str; sector: str; borough: str; owner: Optional[str]
    status: str="new"; contact_date: Optional[date]=None; contact_channel: Optional[str]=None; outreach_message_id: Optional[str]=None
    reply_status: Optional[str]=None; quote_status: Optional[str]=None; last_activity: Optional[datetime]=None; next_follow_up: Optional[date]=None; notes: Optional[str]=None
    created_at: datetime=field(default_factory=datetime.utcnow); updated_at: datetime=field(default_factory=datetime.utcnow); id: Optional[int]=None

@dataclass
class OutreachPackage:
    place_id: str; cold_email: str; call_opener: str; full_call_script: str = ""; linkedin_intro: str = ""; follow_up_email: str = ""; site_visit_brief: str = ""
    generated_at: datetime=field(default_factory=datetime.utcnow); model_used: Optional[str]=None; id: Optional[int]=None

@dataclass
class Contract:
    place_id: str; client_name: str; site_address: str; service_type: str; cleaning_frequency: str
    contract_value_gbp: Optional[float]; contract_start_date: Optional[date]; contract_end_date: Optional[date]
    assigned_team: Optional[str]; service_notes: Optional[str]; operations_notes: Optional[str]; qa_schedule: Optional[str]
    account_status: str="active"; ai_handoff_summary: Optional[str]=None; ai_first_clean_checklist: Optional[str]=None; ai_risk_flags: Optional[str]=None
    created_at: datetime=field(default_factory=datetime.utcnow); updated_at: datetime=field(default_factory=datetime.utcnow); id: Optional[int]=None

@dataclass
class ScraperJob:
    query: str; borough: str; sector: str; status: str="pending"; results_count: int=0; error_msg: Optional[str]=None
    started_at: Optional[datetime]=None; completed_at: Optional[datetime]=None; id: Optional[int]=None
