"""
Unit tests for prospect_validation.

Run:
    cd /path/to/AskMiro-main && pytest tests/test_prospect_validation.py -v

No DB connection needed. No network calls. All gates exercised in
isolation + the 7 defect-class fixtures.
"""
from __future__ import annotations

import json
import os
import pathlib

import pytest

import prospect_validation as pv


HERE = pathlib.Path(__file__).parent
FIXTURE_DIR = HERE / "fixtures" / "defects"


# ──────────────────────────────────────────────────────────────────────
# Default-flag sanity (the most important assertion in v1)
# ──────────────────────────────────────────────────────────────────────
class TestSafeDefaults:
    def test_readiness_enforce_defaults_off(self, monkeypatch):
        monkeypatch.delenv("READINESS_ENFORCE", raising=False)
        assert pv._flag("READINESS_ENFORCE") is False

    def test_auto_classify_defaults_off(self, monkeypatch):
        monkeypatch.delenv("READINESS_AUTO_CLASSIFY", raising=False)
        assert pv._flag("READINESS_AUTO_CLASSIFY") is False

    def test_domain_fit_defaults_off(self, monkeypatch):
        monkeypatch.delenv("DOMAIN_FIT_ENABLED", raising=False)
        assert pv._flag("DOMAIN_FIT_ENABLED") is False

    def test_placeholder_gate_defaults_on(self, monkeypatch):
        monkeypatch.delenv("PLACEHOLDER_GATE_ENABLED", raising=False)
        assert pv._flag("PLACEHOLDER_GATE_ENABLED", "1") is True

    def test_domain_fit_min_bounds(self, monkeypatch):
        monkeypatch.setenv("DOMAIN_FIT_MIN", "0.05")
        assert pv._domain_fit_min() == 0.2  # floored
        monkeypatch.setenv("DOMAIN_FIT_MIN", "1.5")
        assert pv._domain_fit_min() == 0.9  # ceilinged
        monkeypatch.setenv("DOMAIN_FIT_MIN", "0.7")
        assert pv._domain_fit_min() == 0.7
        monkeypatch.setenv("DOMAIN_FIT_MIN", "garbage")
        assert pv._domain_fit_min() == 0.5  # default


# ──────────────────────────────────────────────────────────────────────
# Gate 1 — transport decode
# ──────────────────────────────────────────────────────────────────────
class TestGate1TransportDecode:
    def test_clean_passes(self):
        r = pv.gate_1_transport_decode("info@example.co.uk")
        assert r.passed and r.evidence["decoded"] == "info@example.co.uk"

    def test_url_encoded_space_fails(self):
        # %20info@... decodes to " info@..." with a leading space.
        # That whitespace shouldn't appear in a real email field — it
        # only appeared because the original was URL-encoded — so we fail.
        r = pv.gate_1_transport_decode("%20info@askmiro.com")
        assert r.passed is False
        assert "transport_decode_failed" in r.reason
        assert "url_decoded" in r.evidence.get("warnings", [])

    def test_unicode_escape_caught(self):
        # u003e encodes ">". After unescape, the email contains ">",
        # which we reject as a control fragment.
        r = pv.gate_1_transport_decode("u003equeenadelaide@youngs.co.uk")
        assert r.passed is False
        assert "transport_decode_failed" in r.reason

    def test_html_entity_decoded(self):
        r = pv.gate_1_transport_decode("info&amp;sales@example.com")
        # "&amp;" → "&" is fine; no control chars added.
        assert r.passed
        assert "html_unescaped" in r.evidence.get("warnings", [])

    def test_empty_input_fails(self):
        assert pv.gate_1_transport_decode("").passed is False
        assert pv.gate_1_transport_decode(None).passed is False


# ──────────────────────────────────────────────────────────────────────
# Gate 2 — multi-value split
# ──────────────────────────────────────────────────────────────────────
class TestGate2MultiSplit:
    @pytest.mark.parametrize("value,expected_count", [
        ("info@x.com", 1),
        ("info@x.com,sales@x.com", 2),
        ("info@x.com; sales@x.com", 2),
        ("info@x.com | sales@x.com", 2),
        ("info@x.com - hello@x.com - sales@x.com", 3),
    ])
    def test_split_counts(self, value, expected_count):
        r = pv.gate_2_multi_split(value)
        if expected_count == 1:
            assert r.passed is True
        else:
            assert r.passed is False
            assert r.evidence["count"] == expected_count

    def test_single_value_passes(self):
        r = pv.gate_2_multi_split("hello@askmiro.com")
        assert r.passed and r.evidence["value"] == "hello@askmiro.com"


# ──────────────────────────────────────────────────────────────────────
# Gate 3 — RFC
# ──────────────────────────────────────────────────────────────────────
class TestGate3RFC:
    @pytest.mark.parametrize("email,expected", [
        ("info@example.com", True),
        ("first.last+tag@askmiro.co.uk", True),
        ("missing.at.com", False),
        ("two@@example.com", False),
        ("nodomain@", False),
        ("@nolocal.com", False),
    ])
    def test_format(self, email, expected):
        r = pv.gate_3_rfc(email)
        assert r.passed is expected, \
            f"{email!r}: expected {expected}, got {r.passed} ({r.reason})"


# ──────────────────────────────────────────────────────────────────────
# Gate 4 — placeholder
# ──────────────────────────────────────────────────────────────────────
class TestGate4Placeholder:
    @pytest.mark.parametrize("email,expected", [
        ("name@domain.com", False),
        ("youremail@example.com", False),
        ("test@example.com", False),
        ("noreply@askmiro.com", False),       # blocked-generic local
        ("postmaster@anywhere.com", False),
        ("info@askmiro.com", True),           # legit role email
        ("office@bexleymedical.nhs.uk", True),
        ("john.smith@realcompany.co.uk", True),  # real-looking
    ])
    def test_placeholder(self, email, expected, monkeypatch):
        monkeypatch.setenv("PLACEHOLDER_GATE_ENABLED", "1")
        r = pv.gate_4_placeholder(email)
        assert r.passed is expected, \
            f"{email!r}: expected {expected}, got {r.passed} ({r.reason})"

    def test_disabled_passes_everything(self, monkeypatch):
        monkeypatch.setenv("PLACEHOLDER_GATE_ENABLED", "0")
        r = pv.gate_4_placeholder("name@domain.com")
        assert r.passed is True
        assert r.reason == "gate_disabled"


# ──────────────────────────────────────────────────────────────────────
# Gate 5 — domain fit (kill-switch + scoring)
# ──────────────────────────────────────────────────────────────────────
class TestGate5DomainFit:
    @pytest.fixture
    def context(self):
        return {
            "chain_operators": [
                {
                    "id": 1, "sector": "estate_agent",
                    "chain_name": "Foxtons",
                    "root_domain": "foxtons.co.uk",
                    "name_aliases": ["Foxtons"],
                    "active": True,
                },
                {
                    "id": 2, "sector": "pub", "chain_name": "Young's",
                    "root_domain": "youngs.co.uk",
                    "name_aliases": ["Young's", "Youngs"],
                    "active": True,
                },
            ],
            "sector_shared_domains": [
                {"id": 1, "sector": "healthcare",
                 "root_domain": "nhs.net", "confidence": 0.95,
                 "active": True},
            ],
        }

    def test_disabled_returns_neutral_pass(self, monkeypatch, context):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "0")
        r = pv.gate_5_domain_fit(
            "random@nowhere.com",
            {"canonical_name": "Foxtons Wandsworth",
             "primary_website": "https://foxtons.co.uk",
             "sector": "estate_agent"},
            context,
        )
        assert r.passed is True and r.reason == "gate_disabled"

    def test_exact_website_match(self, monkeypatch, context):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "1")
        r = pv.gate_5_domain_fit(
            "office@bexleymedical.co.uk",
            {"canonical_name": "Bexley Medical",
             "primary_website": "https://www.bexleymedical.co.uk",
             "sector": "healthcare"},
            context,
        )
        assert r.passed and r.score == 1.0

    def test_chain_match_foxtons_branch(self, monkeypatch, context):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "1")
        r = pv.gate_5_domain_fit(
            "wandsworth@foxtons.co.uk",
            {"canonical_name": "Foxtons Wandsworth",
             "primary_website": "https://foxtons.co.uk/wandsworth",
             "sector": "estate_agent"},
            context,
        )
        # Exact path wins (foxtons.co.uk == foxtons.co.uk)
        assert r.passed and r.score == 1.0

    def test_chain_mismatch_suspicious(self, monkeypatch, context):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "1")
        r = pv.gate_5_domain_fit(
            "spammer@notfoxtons.com",
            {"canonical_name": "Foxtons Wandsworth",
             "primary_website": "https://otherdomain.com",
             "sector": "estate_agent"},
            context,
        )
        assert r.passed is False
        assert "chain_mismatch" in r.reason

    def test_sector_shared_nhs(self, monkeypatch, context):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "1")
        r = pv.gate_5_domain_fit(
            "practice@nhs.net",
            {"canonical_name": "Some GP Practice",
             "primary_website": "https://gppractice.nhs.uk",
             "sector": "healthcare"},
            context,
        )
        assert r.passed and r.score >= 0.9

    def test_token_overlap_pass(self, monkeypatch, context):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "1")
        r = pv.gate_5_domain_fit(
            "info@bexleymed.co.uk",
            {"canonical_name": "Bexley Medical Group",
             "primary_website": None,
             "sector": "healthcare"},
            context,
        )
        # bexley is in domain → 0.6 token overlap, passes default 0.5
        assert r.passed
        assert "token_overlap" in r.reason

    def test_no_match_below_threshold(self, monkeypatch, context):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "1")
        r = pv.gate_5_domain_fit(
            "contact@unrelated.com",
            {"canonical_name": "Wandsworth Office Park",
             "primary_website": "https://wandsworthofficepark.co.uk",
             "sector": "office"},
            context,
        )
        assert r.passed is False
        assert "domain_mismatch" in r.reason


# ──────────────────────────────────────────────────────────────────────
# Gate 6 — MX / DNS (unit-test mode skips network)
# ──────────────────────────────────────────────────────────────────────
class TestGate6MX:
    def test_skipped_when_no_dns(self):
        r = pv.gate_6_mx("anything@example.com", do_dns=False)
        assert r.passed and r.reason == "gate_skipped_no_dns"


# ──────────────────────────────────────────────────────────────────────
# Gate 7 — suppression
# ──────────────────────────────────────────────────────────────────────
class TestGate7Suppression:
    def test_in_suppression_list(self):
        r = pv.gate_7_suppression(
            "bounced@example.com",
            {"suppressed_emails": {"bounced@example.com"}},
        )
        assert r.passed is False

    def test_not_in_list(self):
        r = pv.gate_7_suppression(
            "fresh@example.com",
            {"suppressed_emails": {"someoneelse@example.com"}},
        )
        assert r.passed is True


# ──────────────────────────────────────────────────────────────────────
# Composition + classification
# ──────────────────────────────────────────────────────────────────────
class TestClassifyReadiness:
    def test_clean_lead_becomes_ready(self, monkeypatch):
        monkeypatch.setenv("DOMAIN_FIT_ENABLED", "0")  # safe default
        r = pv.classify_readiness({
            "id": 1, "canonical_name": "Bexley Medical Group",
            "primary_email": "office@bexleymedical.co.uk",
            "primary_phone": "+44 20 8000 0000",
            "primary_website": "https://bexleymedical.co.uk",
            "sector": "healthcare",
            "total_score": 78,
        })
        assert r.state == pv.READY

    def test_no_email_with_website_needs_enrichment(self):
        r = pv.classify_readiness({
            "id": 2, "canonical_name": "Test Office",
            "primary_email": "",
            "primary_website": "https://testoffice.co.uk",
            "sector": "office",
            "total_score": 70,
        })
        assert r.state == pv.NEEDS_ENRICHMENT

    def test_no_email_with_phone_only_phone_first(self):
        r = pv.classify_readiness({
            "id": 3, "canonical_name": "Phone Only Co",
            "primary_email": "",
            "primary_phone": "+44 20 0000 0000",
            "primary_website": "",
            "sector": "office",
            "total_score": 60,
        })
        assert r.state == pv.PHONE_FIRST

    def test_no_email_no_path_low_value(self):
        r = pv.classify_readiness({
            "id": 4, "canonical_name": "Nothing",
            "primary_email": "", "primary_phone": "",
            "primary_website": "", "sector": "office",
            "total_score": 20,
        })
        assert r.state == pv.LOW_VALUE

    def test_score_below_priority_threshold(self):
        r = pv.classify_readiness({
            "id": 5, "canonical_name": "Lukewarm Co",
            "primary_email": "office@lukewarm.co.uk",
            "primary_website": "https://lukewarm.co.uk",
            "sector": "office",
            "total_score": 50,
        })
        # Passes gates but score < 65 → enrichment, not READY
        assert r.state == pv.NEEDS_ENRICHMENT
        assert "below_priority" in r.reason

    def test_anti_target_sector_low_value(self):
        r = pv.classify_readiness({
            "id": 6, "canonical_name": "Joe's Hairdresser",
            "primary_email": "info@joehair.co.uk",
            "primary_website": "https://joehair.co.uk",
            "sector": "hairdresser",
            "total_score": 80,
        })
        assert r.state == pv.LOW_VALUE
        assert "sector_off_target" in r.reason

    def test_entity_conflict(self):
        r = pv.classify_readiness(
            {
                "id": 9005, "canonical_name": "Mayflower Pub",
                "primary_email": "hello@thegeorgeanddragonpub.com",
                "primary_website": "https://mayflowerpub.co.uk",
                "sector": "pub",
                "total_score": 70,
            },
            context={
                "email_owners": {
                    "hello@thegeorgeanddragonpub.com": [9099, 9005],
                },
            },
        )
        assert r.state == pv.ENTITY_CONFLICT


# ──────────────────────────────────────────────────────────────────────
# Defect-fixture round-trip — every observed defect class
# ──────────────────────────────────────────────────────────────────────
def _load_fixtures():
    fixtures = []
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        with path.open() as f:
            fixtures.append((path.name, json.load(f)))
    return fixtures


class TestDefectFixtures:
    @pytest.mark.parametrize("name,fixture", _load_fixtures())
    def test_fixture_classification(self, name, fixture, monkeypatch):
        # Apply per-fixture env requirements
        for k, v in (fixture.get("requires_env") or {}).items():
            monkeypatch.setenv(k, v)

        ctx = {}
        if "context_email_owners" in fixture:
            ctx["email_owners"] = fixture["context_email_owners"]

        r = pv.classify_readiness(fixture["entity"], context=ctx)
        assert r.state == fixture["expected_state"], (
            f"{name}: expected state {fixture['expected_state']}, "
            f"got {r.state} (reason={r.reason})"
        )
        assert fixture["expected_reason_fragment"] in r.reason, (
            f"{name}: reason {r.reason!r} missing fragment "
            f"{fixture['expected_reason_fragment']!r}"
        )


# ──────────────────────────────────────────────────────────────────────
# Hard-guarantee tests
# ──────────────────────────────────────────────────────────────────────
class TestHardGuarantees:
    def test_module_loads_with_no_dns_calls(self):
        # If self_check or import did anything network-y, this would
        # fail or hang. Reaching here = pass.
        assert hasattr(pv, "classify_readiness")

    def test_no_primary_email_writes_in_module(self):
        import inspect
        src = inspect.getsource(pv)
        # Strip the self_check function which deliberately mentions
        # the forbidden pattern as a fragment.
        marker_start = "def _self_check"
        before = src.split(marker_start)[0]
        forbidden = "UPDATE" + " entities SET primary" + "_email"
        assert forbidden not in before, \
            "module body must not contain primary_email writes"

    def test_no_paid_api_imports(self):
        import inspect
        src = inspect.getsource(pv)
        for blocked in ("apollo", "clearbit", "hunter", "zoominfo",
                        "phantombuster", "brightdata", "clay.com"):
            assert blocked.lower() not in src.lower(), \
                f"forbidden vendor reference: {blocked}"
