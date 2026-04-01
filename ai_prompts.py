"""
ai_prompts.py — AskMiro Lead Intelligence OS
Central prompt library. All prompts versioned and named.
Separation of concern: business logic owns prompts, ai_client owns transport.
"""


# ── System personas ──────────────────────────────────────────────────────────

SYSTEM_CLASSIFIER = """
You are a senior commercial intelligence analyst specialising in the UK B2B cleaning market.
Your role is to classify business records to help AskMiro Cleaning Services identify
the best commercial cleaning prospects in London.

Always respond with valid JSON only. No preamble. No explanation outside the JSON.
"""

SYSTEM_SCORER = """
You are a B2B sales strategist helping a London commercial cleaning company prioritise leads.
Evaluate each prospect for commercial cleaning contract potential.

Always respond with valid JSON only. No preamble. No explanation outside the JSON.
"""

SYSTEM_WEBSITE = """
You are a competitive intelligence analyst. Analyse business website text to help
a commercial cleaning company understand a prospect's profile, scale, and likely pain points.

Always respond with valid JSON only. No preamble. No explanation outside the JSON.
"""

SYSTEM_OUTREACH = """
You are a senior B2B sales copywriter for AskMiro Cleaning Services, a managed commercial
cleaning company based in London. You write persuasive, professional, concise outreach
that resonates with facilities managers, operations directors, and property managers.

Never sound spammy. Be direct, specific, and credible.
Always respond with valid JSON only. No preamble. No explanation outside the JSON.
"""

SYSTEM_HANDOFF = """
You are an operations director helping onboard a new cleaning contract.
Generate structured notes to brief the operations team on a new client.

Always respond with valid JSON only. No preamble. No explanation outside the JSON.
"""


# ── Classification prompt ─────────────────────────────────────────────────────

def build_classification_prompt(
    business_name: str,
    raw_sector:    str,
    address:       str,
    borough:       str,
    website:       str | None,
    phone:         str | None,
    rating:        float | None,
    review_count:  int | None,
) -> str:
    return f"""
Classify this London business as a commercial cleaning prospect for AskMiro Cleaning Services.

Business: {business_name}
Google types: {raw_sector}
Address: {address}
Borough: {borough}
Website: {website or 'none'}
Phone: {phone or 'none'}
Rating: {rating or 'unknown'} ({review_count or 0} reviews)

Return JSON with these exact keys:
{{
  "business_type":       "string — the real-world business type (e.g. 'Car Dealership', 'NHS Dental Clinic')",
  "sub_sector":          "string — one of: offices, serviced_offices, coworking, healthcare, education, gyms, hospitality, retail, automotive, industrial, residential_blocks, property_management, salons, community_venues, religious_centres, other",
  "decision_maker_type": "string — likely decision maker title (e.g. 'Facilities Manager', 'Practice Manager', 'Building Manager')",
  "is_cleaning_target":  true or false,
  "note":                "string — one sentence explaining your reasoning"
}}
""".strip()


# ── AI scoring signal prompt ──────────────────────────────────────────────────

def build_score_signal_prompt(
    business_name:   str,
    sector:          str,
    borough:         str,
    has_website:     bool,
    has_phone:       bool,
    rating:          float | None,
    review_count:    int | None,
    website_summary: str | None,
    ai_business_type: str | None,
) -> str:
    return f"""
Score this London business as a commercial cleaning contract prospect for AskMiro.

Business: {business_name}
Sector: {sector}
Borough: {borough}
Has website: {has_website}
Has phone: {has_phone}
Rating: {rating or 'unknown'} ({review_count or 0} reviews)
Business type: {ai_business_type or 'unknown'}
Website summary: {website_summary or 'not available'}

Return JSON with these exact keys:
{{
  "ai_signal_score":      integer 0-100,
  "commercial_relevance": "High" | "Medium" | "Low",
  "contract_potential":   "High" | "Medium-High" | "Medium" | "Low",
  "is_serious_prospect":  true or false,
  "reason":               "string — 1-2 sentences on why this score"
}}
""".strip()


# ── Website intelligence prompt ───────────────────────────────────────────────

def build_website_prompt(business_name: str, website_text: str) -> str:
    return f"""
Analyse this website text for a London business called "{business_name}".
AskMiro is a managed commercial cleaning company considering this as a prospect.

Website text (truncated to 2000 chars):
---
{website_text[:2000]}
---

Return JSON with these exact keys:
{{
  "summary":       "string — 2-3 sentence business summary",
  "business_type": "string — specific business type inferred",
  "is_premium":    true or false,
  "is_multi_site": true or false,
  "is_regulated":  true or false,
  "is_healthcare": true or false,
  "is_education":  true or false,
  "pain_points":   "string — likely cleaning pain points for this type of business"
}}
""".strip()


# ── Outreach generation prompt ────────────────────────────────────────────────

def build_outreach_prompt(
    business_name:    str,
    sector:           str,
    borough:          str,
    business_type:    str,
    decision_maker:   str,
    score:            int,
    website_summary:  str | None,
    pain_points:      str | None,
    company_type:     str | None = None,
    contract_access:  str | None = None,
) -> str:
    # Build type-specific strategic context to guide the AI's angle
    type_context = ""
    if company_type == "Managing Agent":
        type_context = """
STRATEGIC ANGLE — Managing Agent:
This company manages multiple properties on behalf of landlords. A single relationship
can unlock cleaning contracts across 5–50+ sites. Lead with efficiency, compliance,
and the fact AskMiro handles multi-site portfolios under one account manager.
Key hook: "One contract. Every building in your portfolio covered."
Decision maker typically holds the service-charge budget and prefers a single,
accountable supplier over per-building ad-hoc arrangements.
"""
    elif company_type == "Main Contractor / Developer":
        type_context = """
STRATEGIC ANGLE — Main Contractor / Developer:
This company delivers construction or development projects. They need reliable
post-build cleans (builders clean + sparkle clean) before handover, plus ongoing
maintenance cleans during fit-out phases. Time-critical — missing a handover date
has financial penalties for them.
Key hook: "Ready on handover day. Every time."
Decision maker is typically the project manager or contracts director. Urgency and
reliability beat price. Reference our same-day response for emergency situations.
"""
    elif company_type == "Facilities Management Company":
        type_context = """
STRATEGIC ANGLE — FM Company / Subcontract Opportunity:
This is a facilities management company that likely holds cleaning contracts
they may subcontract out. Pitch AskMiro as a reliable cleaning subcontractor —
emphasise COSHH compliance, insurance, TUPE capability, and no-fuss CRM reporting.
Key hook: "Your cleaning subcontractor of choice across London."
Decision maker is likely a contracts manager or FM director. They want to eliminate
risk (complaints, staff issues, compliance gaps) not just find the cheapest price.
"""
    elif company_type == "Direct Client":
        type_context = """
STRATEGIC ANGLE — Direct Client:
This company is the end-user of cleaning services — they pay directly and care about
quality, consistency, and reliability. Emphasise AskMiro's supervisor-led checks,
consistent named teams, and eco-conscious methods.
Key hook: "The same trusted team. Every visit."
Decision maker is typically a facilities manager, office manager, or operations director.
Contrast with agency cleaning horror stories (different cleaners every week, no supervision).
"""
    elif company_type == "Partner":
        type_context = """
STRATEGIC ANGLE — Referral / Partner Opportunity:
This company is in a complementary sector (e.g. security, catering, maintenance)
and could refer clients to AskMiro or co-bid on contracts. Pitch a referral
partnership or preferred supplier relationship rather than a direct sale.
Key hook: "Let's grow together — refer cleaning work, earn a commission."
Decision maker is likely a director or business development manager.
"""

    contract_line = f"\nContract access route: {contract_access}" if contract_access else ""
    type_line     = f"\nRelationship type: {company_type}" if company_type else ""

    return f"""
Generate a personalised outreach pack for AskMiro Cleaning Services to use with this prospect.

Prospect: {business_name}
Type: {business_type}
Sector: {sector}
Borough: {borough}
Likely decision maker: {decision_maker}
Priority score: {score}/100
Business summary: {website_summary or 'Not available'}
Likely pain points / reason to target: {pain_points or 'Standard commercial cleaning needs'}{type_line}{contract_line}
{type_context}
AskMiro offers: managed commercial cleaning, consistent teams, COSHH compliance,
£10M liability cover, eco-conscious methods, supervisor-led quality checks.
Phone: 020 8073 0621. Website: www.askmiro.com

IMPORTANT — Sender identity for all emails:
  Name: Mike Kato
  Title: Business Development, AskMiro Cleaning Services
  Email: office@askmiro.com | Phone: 020 8073 0621
Sign off emails as Mike Kato (personal name, NOT generic like "The AskMiro Team").
Recipients must feel they're hearing from a real person, not a company inbox.

Return JSON with these exact keys:
{{
  "cold_email":       "string — professional 3-paragraph cold email. Subject line on first line prefixed SUBJECT:",
  "call_opener":      "string — 3-4 sentence phone call opener",
  "full_call_script": "string — complete call script with sections: OPENER (10 seconds — who you are + reason for call) | QUALIFY (2 short questions about their current cleaning setup) | PITCH (30-second value pitch specific to this business type and {borough}) | OBJECTIONS: handle 'we already have a cleaner' + 'not interested' + 'send me an email' | CLOSE (specific ask — site visit or quote)",
  "linkedin_intro":   "string — 2-sentence LinkedIn connection request",
  "follow_up_email":  "string — 2-paragraph follow-up for non-reply after 5 days",
  "site_visit_brief": "string — internal briefing note for site visit"
}}
""".strip()


# ── Operations handoff prompt ─────────────────────────────────────────────────

def build_handoff_prompt(
    client_name:       str,
    site_address:      str,
    service_type:      str,
    cleaning_frequency: str,
    contract_value:    float | None,
    sector:            str,
    business_type:     str | None,
    website_summary:   str | None,
    pain_points:       str | None,
) -> str:
    return f"""
Generate an operations handoff pack for a new AskMiro cleaning contract.

Client: {client_name}
Address: {site_address}
Service: {service_type}
Frequency: {cleaning_frequency}
Monthly value: £{contract_value or 'TBC'}
Sector: {sector}
Business type: {business_type or 'unknown'}
Business summary: {website_summary or 'Not available'}
Known pain points: {pain_points or 'Standard'}

Return JSON with these exact keys:
{{
  "client_summary":        "string — 2-3 sentence client overview for the ops team",
  "handoff_summary":       "string — what the sales team promised, key contract terms to honour",
  "service_notes":         "string — specific service delivery notes for this site",
  "first_clean_checklist": "string — numbered checklist for the first clean visit",
  "risk_flags":            "string — any compliance, access, safety or reputation risks to flag"
}}
""".strip()


# ── Sales copilot prompts ────────────────────────────────────────────────────

def build_copilot_weekly_plan_prompt(lead_summaries: str) -> str:
    return f"""
You are the sales director at AskMiro Cleaning Services, a London commercial cleaning company.

Here are the top-scored leads available for outreach this week:
{lead_summaries}

Your job is to select and prioritise the best 100 leads for this week's outreach effort.

Criteria:
- Sector commercial value (offices, healthcare, automotive, residential blocks rank highest)
- Borough proximity for potential physical visit clusters
- Completeness (has phone AND website scores higher)
- Rating and review count as proxy for establishment size
- High-value target flags

Return a brief strategic plan as plain text:
1. Top 5 priority leads with reason
2. Recommended sector focus this week
3. Recommended borough cluster for in-person visits
4. Suggested outreach channel mix (email / phone / LinkedIn)
5. Any patterns worth noting in the dataset
""".strip()


SYSTEM_SIGNALS = """
You are a senior commercial buying-signals analyst for a London commercial cleaning company.
Detect whether a business is showing signs of an upcoming cleaning buying decision.
Always respond with valid JSON only.
"""

def build_signal_prompt(business_name: str, sector: str, borough: str, website_summary: str | None, website_pain_points: str | None, ai_business_type: str | None, ai_classification_note: str | None, address: str | None, rating: float | None, review_count: int | None) -> str:
    return f"""
Analyse this lead for near-term commercial cleaning buying signals.

Business: {business_name}
Sector: {sector}
Borough: {borough}
Address: {address or 'unknown'}
Business type: {ai_business_type or 'unknown'}
Classification note: {ai_classification_note or 'none'}
Website summary: {website_summary or 'none'}
Website pain points: {website_pain_points or 'none'}
Rating: {rating or 'unknown'}
Review count: {review_count or 0}

Return JSON with these exact keys:
{{
  "move_signal": true or false,
  "expansion_signal": true or false,
  "refurb_signal": true or false,
  "hiring_signal": true or false,
  "compliance_signal": true or false,
  "review_signal": true or false,
  "multi_site_signal": true or false,
  "buying_signal_types": ["list", "of", "signal_names"],
  "timing_urgency": "high" | "medium" | "low",
  "likely_buyer_role": "string",
  "trigger_summary": "string",
  "recommended_offer": "string",
  "recommended_channel": "string",
  "reason": "string"
}}
""".strip()
