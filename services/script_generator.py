"""
services/script_generator.py
──────────────────────────────
AI-powered call script generator.
Cost: ~£0.001/script (claude-haiku-4-5) — on-demand only, never batched.

Design principles:
  - NEVER called in batch across all entities
  - ONLY called when user clicks "Generate Script" button
  - Results cached in generated_scripts table forever (until manually regenerated)
  - Input hash detects stale cache (entity data changed)
  - Falls back to template-based script if AI unavailable

Prompt design:
  - Compact structured inputs (minimize tokens)
  - JSON-only response (no prose, no explanation)
  - Hard word limits in prompt
  - Total prompt budget: ~350 tokens input, ~300 tokens output
"""
from __future__ import annotations
import hashlib
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db_pg
from datetime import datetime, timezone
from typing import Optional

# ── Model config ─────────────────────────────────────────────────────────────
_MODEL        = 'claude-haiku-4-5'   # cheapest, fast enough
_MAX_TOKENS   = 400                  # script output is short
_TEMPERATURE  = 0.4                  # some variance but consistent structure

# ── Role labels by category ───────────────────────────────────────────────────
_ROLE_LABEL = {
    'facilities_manager':  'Facilities Manager',
    'registered_manager':  'Registered Manager',
    'practice_manager':    'Practice Manager',
    'operations':          'Operations or General Manager',
    'director':            'Director or Owner',
    'procurement':         'Procurement or Contracts Manager',
    'finance':             'Finance Director',
    'unknown':             'whoever handles facilities or operations',
}

# ── Template fallback (zero cost, used when AI unavailable) ──────────────────
_TEMPLATE_SCRIPTS = {
    'public_procurement': {
        'opener':       "Hi, is that the facilities or procurement team?",
        'reason':       "I'm calling about your recent contract listing — we specialise in commercial cleaning for exactly this type of contract.",
        'pain_hook':    "Public sector compliance and audit trails are something we handle as standard — not an add-on.",
        'credibility':  "We hold [ISO 9001 / Safe Contractor] and work across several similar public sector sites in London.",
        'qualifying_q': "Is the specification already written, or are you still in the scoping phase?",
        'objection_resp': "Completely understand — if you're happy with your current supplier, we'd just ask for the chance to quote when the contract comes up for review. Would that be okay?",
        'next_step_ask': "Could I arrange a 15-minute call to understand the brief before you finalise suppliers?",
        'contact_ask':  "Ask for the Facilities Manager or Procurement lead.",
    },
    'move_signal': {
        'opener':       "Hi, could I speak with whoever handles your facilities or office management?",
        'reason':       "I noticed you've recently moved premises — we help businesses get their new space properly set up with a cleaning programme from day one.",
        'pain_hook':    "The problem with new premises is that the previous tenant's cleaner usually doesn't follow — so there's often a gap. We can fill that immediately.",
        'credibility':  "We've helped dozens of businesses across London transition into new offices without any gap in cleaning.",
        'qualifying_q': "Have you sorted a cleaning contract for the new site yet, or is that still open?",
        'objection_resp': "No problem — if you're sorted, great. If things don't work out or you want a second opinion in a few months, I'd love to come and do a free site survey.",
        'next_step_ask': "Could I come and do a free 20-minute walk-through this week?",
        'contact_ask':  "Ask for the Office Manager or Facilities Manager.",
    },
    'regulated_healthcare_facility': {
        'opener':       "Hi, could I speak with your Registered Manager or Facilities lead?",
        'reason':       "I'm calling because you're CQC-registered — hygiene standards in your environment are non-negotiable, and we work exclusively with regulated healthcare providers.",
        'pain_hook':    "CQC inspections flag cleanliness as a key concern. If your current cleaning isn't inspection-ready, that's a real risk to your rating.",
        'credibility':  "We clean multiple CQC-registered sites across London and understand the documentation and audit trail requirements.",
        'qualifying_q': "When was your last CQC inspection, and is cleanliness something that came up?",
        'objection_resp': "I understand — we're not asking you to switch today. Just a free audit of your current cleaning programme to see if there are any gaps before your next inspection.",
        'next_step_ask': "Can I arrange a free compliance cleaning audit this week?",
        'contact_ask':  "Ask for the Registered Manager.",
    },
    'default': {
        'opener':       "Hi, could I speak with whoever handles your facilities or cleaning contract?",
        'reason':       "I'm calling from a commercial cleaning company — we work with a lot of businesses like yours in this area and wanted to introduce ourselves.",
        'pain_hook':    "A lot of businesses we speak to are either locked into contracts that aren't working or paying more than they should. We offer a free review.",
        'credibility':  "We've been operating across London for several years and work across offices, healthcare, hospitality, and more.",
        'qualifying_q': "When does your current cleaning contract come up for review?",
        'objection_resp': "Completely understand — when does your current contract expire? We'd love to quote when it does.",
        'next_step_ask': "Could I send you a quick overview and arrange a call when it's more convenient?",
        'contact_ask':  "Ask for the Facilities Manager or Office Manager.",
    },
}


def _build_input_hash(entity_data: dict) -> str:
    """Hash the key input fields to detect when cache is stale."""
    key_fields = {k: entity_data.get(k) for k in [
        'canonical_name', 'sector', 'borough', 'signal_type', 'signal_evidence',
        'contact_role', 'review_pain_score', 'has_renewal_window'
    ]}
    return hashlib.md5(json.dumps(key_fields, sort_keys=True).encode()).hexdigest()[:12]


def _build_prompt(data: dict) -> str:
    """
    Build a compact JSON prompt. Hard limit: ~300 tokens input.
    """
    # Compact input — strip whitespace, truncate long fields
    name    = (data.get('canonical_name') or 'the business')[:50]
    sector  = (data.get('sector') or 'commercial')[:25]
    borough = (data.get('borough') or 'London')[:20]
    stype   = (data.get('signal_type') or 'general_interest')[:30]
    sevid   = (data.get('signal_evidence') or '')[:100]
    role    = (data.get('contact_role') or 'facilities manager')[:30]
    review  = data.get('review_pain_score', 0)
    renewal = data.get('has_renewal_window', False)
    value   = data.get('monthly_value_gbp', 0)
    multisite = data.get('has_multisite', False)

    # Build pain context
    context_parts = []
    if stype == 'public_procurement':
        context_parts.append("live government tender")
    if stype == 'move_signal':
        context_parts.append("recently moved premises, no cleaner yet")
    if stype == 'regulated_healthcare_facility':
        context_parts.append("CQC-registered, hygiene compliance mandatory")
    if stype == 'new_development':
        context_parts.append("new development, building not yet occupied")
    if stype == 'review_signal' and review > 0.4:
        context_parts.append(f"Google reviews mention cleanliness issues (pain score {review:.1f})")
    if stype == 'compliance_signal':
        context_parts.append("compliance pressure creating buying urgency")
    if multisite:
        context_parts.append("multiple sites — group contract opportunity")
    if renewal:
        context_parts.append("contract renewal window approaching")
    if sevid:
        context_parts.append(f"signal: {sevid[:80]}")

    context = "; ".join(context_parts) or "general commercial cleaning prospect"

    prompt = f"""You are a B2B sales coach for a commercial cleaning company in London.
Write a phone call script for this lead. Be concise and specific.

Lead: {name} | Sector: {sector} | Location: {borough}
Contact target: {role}
Key context: {context}
{"Estimated value: ~£" + str(value) + "/mo" if value else ""}

Return ONLY valid JSON with these exact fields (strict word limits):
{{
  "opener": "opening line to check you have the right person (max 15 words)",
  "reason_for_call": "specific reason referencing their situation (max 30 words)",
  "pain_hook": "sector-specific pain point relevant to cleaning (max 35 words)",
  "credibility": "short credibility statement referencing similar sector clients (max 25 words)",
  "qualifying_q": "one qualifying question to understand their situation (max 20 words)",
  "objection_resp": "response to 'we already have a cleaner' (max 40 words)",
  "next_step_ask": "specific next step ask (max 20 words)",
  "contact_ask": "who to ask for if transferred (max 15 words)"
}}"""
    return prompt


def _get_anthropic_client():
    """Lazily import anthropic client."""
    try:
        import anthropic
        api_key = os.environ.get('ANTHROPIC_API_KEY') or os.environ.get('CLAUDE_API_KEY')
        if not api_key:
            return None
        return anthropic.Anthropic(api_key=api_key)
    except ImportError:
        return None


def _call_ai(prompt: str) -> Optional[dict]:
    """Call Claude and return parsed JSON. Returns None on any failure."""
    client = _get_anthropic_client()
    if not client:
        return None

    try:
        response = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            temperature=_TEMPERATURE,
            messages=[{'role': 'user', 'content': prompt}],
        )
        text = response.content[0].text.strip()
        # Strip any markdown fences
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        return json.loads(text)
    except Exception as e:
        print(f"[script_generator] AI call failed: {e}")
        return None


def _template_fallback(signal_type: str) -> dict:
    """Return a template-based script as fallback."""
    return _TEMPLATE_SCRIPTS.get(signal_type, _TEMPLATE_SCRIPTS['default']).copy()


def _assemble_full_script(parts: dict) -> str:
    """Concatenate script parts into readable display text."""
    lines = [
        f"📞 OPENER: {parts.get('opener', '')}",
        f"\n🎯 REASON: {parts.get('reason_for_call', '')}",
        f"\n💡 PAIN HOOK: {parts.get('pain_hook', '')}",
        f"\n✅ CREDIBILITY: {parts.get('credibility', '')}",
        f"\n❓ QUESTION: {parts.get('qualifying_q', '')}",
        f"\n🔄 OBJECTION: {parts.get('objection_resp', '')}",
        f"\n👉 NEXT STEP: {parts.get('next_step_ask', '')}",
        f"\n👤 ASK FOR: {parts.get('contact_ask', '')}",
    ]
    return '\n'.join(lines)


def generate_script(conn, entity_id: int, signal_id: Optional[int] = None,
                    force_regenerate: bool = False) -> dict:
    """
    Generate (or return cached) call script for an entity.

    Returns:
        {
          'script_id': int,
          'entity_id': int,
          'source': 'ai' | 'template' | 'cached',
          'opener', 'reason_for_call', 'pain_hook', 'credibility',
          'qualifying_q', 'objection_resp', 'next_step_ask', 'contact_ask',
          'full_script': str,
          'generated_at': str,
        }
    """
    # ── Check cache first ────────────────────────────────────────────────────
    if not force_regenerate:
        cached = db_pg.fetchone(conn, """
            SELECT gs.*,
                   e.canonical_name as entity_name,
                   c.full_name || ' (' || c.job_title || ')' as contact_hint
            FROM generated_scripts gs
            JOIN entities e ON e.id = gs.entity_id
            LEFT JOIN contacts c ON c.entity_id = gs.entity_id AND c.is_primary = TRUE
            WHERE gs.entity_id = %s AND gs.is_stale = FALSE
            ORDER BY COALESCE(gs.regenerated_at, gs.generated_at) DESC
            LIMIT 1
        """, (entity_id,))
        if cached:
            result = dict(cached)
            result['source'] = 'cached'
            result['full_script'] = result.get('full_script') or _assemble_full_script(result)
            return result

    # ── Gather entity context ────────────────────────────────────────────────
    entity = db_pg.fetchone(conn, """
        SELECT e.id, e.canonical_name, e.sector, e.primary_phone, e.primary_website,
               a.borough,
               os.total_score, os.estimated_monthly_value_gbp,
               s.signal_type, s.strength, s.evidence as signal_evidence,
               rp.estimated_renewal, rp.call_now_flag,
               ra.pain_score as review_pain_score
        FROM entities e
        LEFT JOIN LATERAL (
            SELECT addr.borough FROM entity_locations el
            JOIN addresses addr ON addr.id = el.address_id
            WHERE el.entity_id = e.id AND el.is_primary = TRUE LIMIT 1
        ) a ON TRUE
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        LEFT JOIN signals s ON s.entity_id = e.id AND s.active = TRUE
            AND s.id = COALESCE(%s, (
                SELECT id FROM signals WHERE entity_id = e.id AND active = TRUE
                ORDER BY strength DESC LIMIT 1
            ))
        LEFT JOIN renewal_predictions rp ON rp.entity_id = e.id
        LEFT JOIN review_analysis ra ON ra.entity_id = e.id
        WHERE e.id = %s
        LIMIT 1
    """, (signal_id, entity_id))

    if not entity:
        return {'error': 'entity not found'}

    # ── Get best contact ──────────────────────────────────────────────────────
    contact = db_pg.fetchone(conn, """
        SELECT full_name, job_title, role_category FROM contacts
        WHERE entity_id = %s ORDER BY is_primary DESC, confidence DESC LIMIT 1
    """, (entity_id,))

    contact_role = 'facilities manager'
    if contact:
        contact_role = contact['job_title'] or contact['role_category'].replace('_', ' ')

    # ── Multi-site check ─────────────────────────────────────────────────────
    has_multisite = db_pg.fetchval(conn, """
        SELECT EXISTS (
            SELECT 1 FROM signals
            WHERE entity_id = %s AND signal_type = 'multi_site_signal' AND active = TRUE
        )
    """, (entity_id,))

    data = {
        'canonical_name':     entity['canonical_name'],
        'sector':             entity['sector'],
        'borough':            entity['borough'],
        'signal_type':        entity['signal_type'],
        'signal_evidence':    entity['signal_evidence'],
        'contact_role':       contact_role,
        'review_pain_score':  float(entity['review_pain_score'] or 0),
        'has_renewal_window': bool(entity['call_now_flag']),
        'monthly_value_gbp':  entity['estimated_monthly_value_gbp'] or 0,
        'has_multisite':      bool(has_multisite),
    }

    input_hash = _build_input_hash(data)

    # ── Try AI first, fall back to template ──────────────────────────────────
    prompt  = _build_prompt(data)
    ai_result = _call_ai(prompt)
    source  = 'ai'
    tokens  = None

    if not ai_result:
        ai_result = _template_fallback(entity['signal_type'] or 'default')
        source = 'template'

    # Normalise field names (AI may return 'reason' instead of 'reason_for_call')
    if 'reason' in ai_result and 'reason_for_call' not in ai_result:
        ai_result['reason_for_call'] = ai_result.pop('reason')

    full_script = _assemble_full_script(ai_result)

    # ── Store in cache ────────────────────────────────────────────────────────
    existing = db_pg.fetchval(conn, """
        SELECT id FROM generated_scripts WHERE entity_id = %s
        LIMIT 1
    """, (entity_id,))

    now = datetime.now(timezone.utc)
    if existing:
        db_pg.execute(conn, """
            UPDATE generated_scripts SET
                signal_id      = %s,
                signal_type    = %s,
                opener         = %s,
                reason_for_call = %s,
                pain_hook      = %s,
                credibility    = %s,
                qualifying_q   = %s,
                objection_resp = %s,
                next_step_ask  = %s,
                contact_ask    = %s,
                full_script    = %s,
                model          = %s,
                tokens_used    = %s,
                input_hash     = %s,
                regenerated_at = %s,
                is_stale       = FALSE
            WHERE entity_id = %s
        """, (
            signal_id, entity['signal_type'],
            ai_result.get('opener'), ai_result.get('reason_for_call'),
            ai_result.get('pain_hook'), ai_result.get('credibility'),
            ai_result.get('qualifying_q'), ai_result.get('objection_resp'),
            ai_result.get('next_step_ask'), ai_result.get('contact_ask'),
            full_script, _MODEL if source == 'ai' else 'template',
            tokens, input_hash, now, entity_id,
        ))
        script_id = existing
    else:
        script_id = db_pg.fetchval(conn, """
            INSERT INTO generated_scripts
                (entity_id, signal_id, signal_type, opener, reason_for_call,
                 pain_hook, credibility, qualifying_q, objection_resp,
                 next_step_ask, contact_ask, full_script, model, tokens_used,
                 input_hash, generated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            entity_id, signal_id, entity['signal_type'],
            ai_result.get('opener'), ai_result.get('reason_for_call'),
            ai_result.get('pain_hook'), ai_result.get('credibility'),
            ai_result.get('qualifying_q'), ai_result.get('objection_resp'),
            ai_result.get('next_step_ask'), ai_result.get('contact_ask'),
            full_script, _MODEL if source == 'ai' else 'template',
            tokens, input_hash, now,
        ))

    conn.commit()

    return {
        'script_id':        script_id,
        'entity_id':        entity_id,
        'entity_name':      entity['canonical_name'],
        'source':           source,
        'opener':           ai_result.get('opener'),
        'reason_for_call':  ai_result.get('reason_for_call'),
        'pain_hook':        ai_result.get('pain_hook'),
        'credibility':      ai_result.get('credibility'),
        'qualifying_q':     ai_result.get('qualifying_q'),
        'objection_resp':   ai_result.get('objection_resp'),
        'next_step_ask':    ai_result.get('next_step_ask'),
        'contact_ask':      ai_result.get('contact_ask'),
        'full_script':      full_script,
        'generated_at':     now.isoformat(),
    }
