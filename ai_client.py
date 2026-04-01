"""
ai_client.py — AskMiro Lead Intelligence OS
Provider-agnostic AI client.
Supports OpenAI, Anthropic, or mock mode (no API key required for dev/testing).
All callers use call_ai() — swap provider in config without touching business logic.
"""

import json
import logging
import time
import re
from typing import Optional

from config import AI_PROVIDER, AI_MODEL, OPENAI_API_KEY, ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)


# ── Response wrapper ─────────────────────────────────────────────────────────

class AIResponse:
    def __init__(self, content: str, model: str, provider: str, tokens_used: int = 0):
        self.content = content
        self.model = model
        self.provider = provider
        self.tokens_used = tokens_used

    def as_json(self) -> Optional[dict]:
        """Attempt to parse content as JSON. Returns None on failure."""
        try:
            text = self.content.strip()
            if text.startswith("```"):
                text = re.sub(r'^```[a-z]*\n?', '', text)
                text = re.sub(r'\n?```$', '', text.strip())
            return json.loads(text)
        except (json.JSONDecodeError, Exception):
            return None

    def __repr__(self):
        return f"<AIResponse provider={self.provider} tokens={self.tokens_used} len={len(self.content)}>"


# ── OpenAI provider ──────────────────────────────────────────────────────────

def _call_openai(system_prompt: str, user_prompt: str, model: str, max_tokens: int) -> AIResponse:
    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.3,
        )
        content = response.choices[0].message.content or ""
        tokens = response.usage.total_tokens if response.usage else 0
        return AIResponse(content, model=model, provider="openai", tokens_used=tokens)
    except ImportError:
        raise RuntimeError("openai package not installed. Run: pip install openai")
    except Exception as e:
        raise RuntimeError(f"OpenAI API error: {e}") from e


# ── Anthropic provider ───────────────────────────────────────────────────────

def _call_anthropic(system_prompt: str, user_prompt: str, model: str, max_tokens: int) -> AIResponse:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        content = response.content[0].text if response.content else ""
        tokens = response.usage.input_tokens + response.usage.output_tokens
        return AIResponse(content, model=model, provider="anthropic", tokens_used=tokens)
    except ImportError:
        raise RuntimeError("anthropic package not installed. Run: pip install anthropic")
    except Exception as e:
        raise RuntimeError(f"Anthropic API error: {e}") from e


# ── Mock provider (development / no API key) ─────────────────────────────────

_MOCK_RESPONSES = {
    "classify": json.dumps({
        "business_type": "Commercial Office Building",
        "sub_sector": "offices",
        "decision_maker_type": "Facilities Manager",
        "is_cleaning_target": True,
        "note": "Mock: Large commercial premises likely to require regular contract cleaning."
    }),
    "score": json.dumps({
        "ai_signal_score": 75,
        "commercial_relevance": "High",
        "contract_potential": "Medium-High",
        "is_serious_prospect": True,
        "reason": "Mock: Established business with good reviews and website in target sector."
    }),
    "website": json.dumps({
        "summary": "Mock: A professional services business operating from a London premises.",
        "business_type": "Professional Services",
        "is_premium": False,
        "is_multi_site": False,
        "is_regulated": False,
        "pain_points": "Mock: Office hygiene, communal area presentation, compliance documentation."
    }),
    "outreach": json.dumps({
        "cold_email": "Mock cold email — replace with real AI-generated version.",
        "call_opener": "Mock call opener — replace with real AI-generated version.",
        "linkedin_intro": "Mock LinkedIn intro — replace with real AI-generated version.",
        "follow_up_email": "Mock follow-up email — replace with real AI-generated version.",
        "site_visit_brief": "Mock site visit brief — replace with real AI-generated version."
    }),
    "handoff": json.dumps({
        "client_summary": "Mock: New client onboarded.",
        "handoff_summary": "Mock: Handoff to operations team.",
        "service_notes": "Mock: Standard commercial cleaning contract.",
        "first_clean_checklist": "Mock: Full deep clean, check all areas.",
        "risk_flags": "Mock: None identified."
    }),
    "signal": json.dumps({
        "move_signal": False,
        "expansion_signal": True,
        "refurb_signal": False,
        "hiring_signal": True,
        "compliance_signal": False,
        "review_signal": False,
        "multi_site_signal": False,
        "buying_signal_types": ["expansion", "hiring"],
        "timing_urgency": "medium",
        "likely_buyer_role": "Facilities Manager",
        "trigger_summary": "Mock: Signs of growth and hiring suggest a cleaning review is plausible soon.",
        "recommended_offer": "Recurring commercial cleaning with supervisor-led quality checks.",
        "recommended_channel": "email + phone",
        "reason": "Mock: Growing operator with clear operational signals."
    }),
}


def _call_mock(prompt_type: str) -> AIResponse:
    """Return a deterministic mock response for local development."""
    key = next((k for k in _MOCK_RESPONSES if k in prompt_type.lower()), "classify")
    content = _MOCK_RESPONSES.get(key, '{"mock": true}')
    time.sleep(0.05)
    return AIResponse(content, model="mock", provider="mock", tokens_used=0)


# ── Public interface ─────────────────────────────────────────────────────────

def call_ai(
    system_prompt: str,
    user_prompt: str,
    prompt_type: str = "classify",
    max_tokens: int = 600,
    retries: int = 2,
) -> AIResponse:
    """
    Route an AI call to the configured provider.
    Falls back to mock on repeated failure.
    """
    provider = AI_PROVIDER.lower()

    for attempt in range(1, retries + 2):
        try:
            if provider == "openai":
                return _call_openai(system_prompt, user_prompt, AI_MODEL, max_tokens)
            elif provider == "anthropic":
                return _call_anthropic(system_prompt, user_prompt, AI_MODEL, max_tokens)
            else:
                return _call_mock(prompt_type)
        except Exception as e:
            if attempt > retries:
                logger.error("AI call failed after %d attempts: %s. Falling back to mock.", retries + 1, e)
                return _call_mock(prompt_type)
            wait = 2.0 ** attempt
            logger.warning("AI call attempt %d failed: %s. Retrying in %.1fs", attempt, e, wait)
            time.sleep(wait)

    return _call_mock(prompt_type)
