-- ============================================================
-- AskMiro Commercial Intelligence Warehouse — PostgreSQL Schema
-- ============================================================

-- Note: pg_trgm not available in conda build; fuzzy matching done in Python (rapidfuzz)

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
    CREATE TYPE entity_kind AS ENUM (
        'company', 'facility', 'property_manager', 'charity', 'unknown'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE source_system AS ENUM (
        'google_maps', 'companies_house', 'cqc', 'contracts_finder',
        'charity_commission', 'nhs_ods', 'london_datastore', 'openstreetmap', 'manual'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE pipeline_stage AS ENUM (
        'new', 'enriched', 'ready_to_contact', 'contacted',
        'replied', 'meeting_or_site_visit', 'quote_prepared',
        'quote_sent', 'negotiating', 'won', 'lost', 'dormant'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE activity_type AS ENUM (
        'note', 'call', 'email', 'meeting', 'site_visit',
        'stage_changed', 'quote_sent', 'signal_detected', 'enriched'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE signal_type AS ENUM (
        'move_signal', 'expansion_signal', 'refurb_signal',
        'hiring_signal', 'compliance_signal', 'review_signal',
        'multi_site_signal', 'public_procurement', 'regulated_healthcare_facility',
        'charity_venue', 'companies_house_match'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE contact_channel AS ENUM (
        'phone', 'email', 'linkedin', 'in_person', 'letter'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE document_type AS ENUM (
        'quote', 'proposal', 'contract', 'invoice', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BRONZE LAYER — Raw ingestion
-- ============================================================

CREATE TABLE IF NOT EXISTS ingest_runs (
    id              SERIAL PRIMARY KEY,
    source          source_system NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    record_count    INT DEFAULT 0,
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS raw_source_records (
    id              BIGSERIAL PRIMARY KEY,
    source          source_system NOT NULL,
    source_record_id TEXT NOT NULL,
    ingest_run_id   INT REFERENCES ingest_runs(id),
    payload         JSONB NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_source ON raw_source_records(source);
CREATE INDEX IF NOT EXISTS idx_raw_payload ON raw_source_records USING GIN(payload);

-- ============================================================
-- SILVER LAYER — Normalised geography + entities
-- ============================================================

CREATE TABLE IF NOT EXISTS addresses (
    id          BIGSERIAL PRIMARY KEY,
    line1       TEXT,
    line2       TEXT,
    line3       TEXT,
    city        TEXT DEFAULT 'London',
    borough     TEXT,
    postcode    TEXT,
    latitude    DOUBLE PRECISION,
    longitude   DOUBLE PRECISION,
    country     TEXT DEFAULT 'United Kingdom',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_borough ON addresses(borough);
CREATE INDEX IF NOT EXISTS idx_addresses_postcode ON addresses(postcode);
CREATE INDEX IF NOT EXISTS idx_addresses_postcode_district ON addresses(SPLIT_PART(postcode, ' ', 1));

CREATE TABLE IF NOT EXISTS entities (
    id                  BIGSERIAL PRIMARY KEY,
    entity_kind         entity_kind NOT NULL DEFAULT 'unknown',
    canonical_name      TEXT NOT NULL,
    normalized_name     TEXT NOT NULL,
    sector              TEXT,
    sub_sector          TEXT,
    company_number      TEXT UNIQUE,
    charity_number      TEXT UNIQUE,
    cqc_location_id     TEXT UNIQUE,
    primary_website     TEXT,
    website_domain      TEXT,
    primary_phone       TEXT,
    primary_email       TEXT,
    hvt                 BOOLEAN NOT NULL DEFAULT FALSE,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_dedup
    ON entities(entity_kind, normalized_name, COALESCE(company_number, ''));
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(normalized_name); -- trigram matching done in Python
CREATE INDEX IF NOT EXISTS idx_entities_sector ON entities(sector);
CREATE INDEX IF NOT EXISTS idx_entities_hvt ON entities(hvt) WHERE hvt = TRUE;
CREATE INDEX IF NOT EXISTS idx_entities_company_number ON entities(company_number) WHERE company_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS entity_locations (
    id          BIGSERIAL PRIMARY KEY,
    entity_id   BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    address_id  BIGINT NOT NULL REFERENCES addresses(id),
    is_primary  BOOLEAN NOT NULL DEFAULT TRUE,
    location_type TEXT DEFAULT 'trading',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(entity_id, address_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_locations_entity ON entity_locations(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_locations_primary ON entity_locations(entity_id, is_primary) WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS entity_source_links (
    id              BIGSERIAL PRIMARY KEY,
    entity_id       BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    source          source_system NOT NULL,
    source_record_id TEXT NOT NULL,
    confidence      SMALLINT DEFAULT 100 CHECK (confidence BETWEEN 0 AND 100),
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_esl_entity ON entity_source_links(entity_id);
CREATE INDEX IF NOT EXISTS idx_esl_source_record ON entity_source_links(source, source_record_id);

CREATE TABLE IF NOT EXISTS contacts (
    id              BIGSERIAL PRIMARY KEY,
    entity_id       BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    full_name       TEXT,
    job_title       TEXT,
    phone           TEXT,
    email           TEXT,
    linkedin_url    TEXT,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_entity ON contacts(entity_id);

CREATE TABLE IF NOT EXISTS companies_house_profiles (
    id                  BIGSERIAL PRIMARY KEY,
    entity_id           BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    company_number      TEXT NOT NULL UNIQUE,
    company_name        TEXT,
    company_status      TEXT,
    company_type        TEXT,
    date_of_creation    DATE,
    date_of_cessation   DATE,
    sic_codes           TEXT[],
    registered_postcode TEXT,
    raw_payload         JSONB,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GOLD LAYER — Signals + opportunity scores
-- ============================================================

CREATE TABLE IF NOT EXISTS signals (
    id              BIGSERIAL PRIMARY KEY,
    entity_id       BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    signal_type     signal_type NOT NULL,
    strength        SMALLINT NOT NULL DEFAULT 50 CHECK (strength BETWEEN 0 AND 100),
    evidence        TEXT,
    source          source_system,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_signals_entity ON signals(entity_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_active ON signals(entity_id, active) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS opportunity_scores (
    id                              BIGSERIAL PRIMARY KEY,
    entity_id                       BIGINT NOT NULL UNIQUE REFERENCES entities(id) ON DELETE CASCADE,
    fit_score                       SMALLINT NOT NULL DEFAULT 0,   -- 0-25: sector fit
    facility_score                  SMALLINT NOT NULL DEFAULT 0,   -- 0-20: facility type
    buyer_signal_score              SMALLINT NOT NULL DEFAULT 0,   -- 0-25: buying signals
    contactability_score            SMALLINT NOT NULL DEFAULT 0,   -- 0-15: reachability
    scale_score                     SMALLINT NOT NULL DEFAULT 0,   -- 0-10: size/scale
    freshness_score                 SMALLINT NOT NULL DEFAULT 0,   -- 0-5: data recency
    total_score                     SMALLINT NOT NULL DEFAULT 0,   -- 0-100: sum
    score_band                      CHAR(1),                       -- A/B/C/D
    next_best_action                TEXT,
    estimated_contract_value_gbp    INT,
    estimated_monthly_value_gbp     INT,
    scored_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opp_scores_total ON opportunity_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_scores_band ON opportunity_scores(score_band);

-- ============================================================
-- SALES LAYER — Pipeline + activities
-- ============================================================

CREATE TABLE IF NOT EXISTS opportunities (
    id                  BIGSERIAL PRIMARY KEY,
    entity_id           BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    title               TEXT,
    current_stage       pipeline_stage NOT NULL DEFAULT 'new',
    owner               TEXT,
    next_followup_at    TIMESTAMPTZ,
    last_touched_at     TIMESTAMPTZ,
    loss_reason         TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_entity ON opportunities(entity_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(current_stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON opportunities(owner);
CREATE INDEX IF NOT EXISTS idx_opportunities_followup ON opportunities(next_followup_at) WHERE next_followup_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS opportunity_stage_history (
    id              BIGSERIAL PRIMARY KEY,
    opportunity_id  BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    from_stage      pipeline_stage,
    to_stage        pipeline_stage NOT NULL,
    actor           TEXT DEFAULT 'system',
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_history_opp ON opportunity_stage_history(opportunity_id);

CREATE TABLE IF NOT EXISTS activity_log (
    id              BIGSERIAL PRIMARY KEY,
    opportunity_id  BIGINT REFERENCES opportunities(id) ON DELETE SET NULL,
    entity_id       BIGINT REFERENCES entities(id) ON DELETE SET NULL,
    activity_type   activity_type NOT NULL,
    channel         contact_channel,
    actor           TEXT DEFAULT 'user',
    subject         TEXT,
    body            TEXT,
    details         JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_opp ON activity_log(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(activity_type);

CREATE TABLE IF NOT EXISTS quotes (
    id                  BIGSERIAL PRIMARY KEY,
    opportunity_id      BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    quote_value_gbp     NUMERIC(10,2),
    quote_date          DATE,
    valid_until         DATE,
    service_description TEXT,
    status              TEXT DEFAULT 'draft',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outcomes (
    id              BIGSERIAL PRIMARY KEY,
    opportunity_id  BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    outcome         TEXT NOT NULL,  -- 'won' or 'lost'
    contract_value_gbp NUMERIC(10,2),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id              BIGSERIAL PRIMARY KEY,
    opportunity_id  BIGINT REFERENCES opportunities(id) ON DELETE SET NULL,
    entity_id       BIGINT REFERENCES entities(id) ON DELETE SET NULL,
    document_type   document_type NOT NULL DEFAULT 'other',
    filename        TEXT,
    storage_path    TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_entities_updated_at
        BEFORE UPDATE ON entities
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_addresses_updated_at
        BEFORE UPDATE ON addresses
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_opportunities_updated_at
        BEFORE UPDATE ON opportunities
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_contacts_updated_at
        BEFORE UPDATE ON contacts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_lead_board AS
SELECT
    e.id                AS entity_id,
    e.canonical_name    AS business_name,
    e.entity_kind,
    e.sector,
    e.sub_sector,
    e.primary_phone     AS phone,
    e.primary_website   AS website,
    e.hvt,
    e.active,
    a.borough,
    a.postcode,
    a.latitude,
    a.longitude,
    os.total_score,
    os.score_band,
    os.fit_score,
    os.facility_score,
    os.buyer_signal_score,
    os.contactability_score,
    os.scale_score,
    os.freshness_score,
    os.estimated_monthly_value_gbp,
    os.next_best_action,
    COALESCE(sig_agg.signal_types, '{}') AS signals,
    o.id                AS opportunity_id,
    o.current_stage,
    o.owner,
    o.next_followup_at,
    o.last_touched_at
FROM entities e
LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
LEFT JOIN addresses a ON a.id = el.address_id
LEFT JOIN opportunity_scores os ON os.entity_id = e.id
LEFT JOIN opportunities o ON o.entity_id = e.id
LEFT JOIN (
    SELECT entity_id, ARRAY_AGG(DISTINCT signal_type::TEXT) AS signal_types
    FROM signals WHERE active = TRUE
    GROUP BY entity_id
) sig_agg ON sig_agg.entity_id = e.id;

CREATE OR REPLACE VIEW v_pipeline_board AS
SELECT
    o.id                AS opportunity_id,
    o.entity_id,
    o.title,
    o.current_stage,
    o.owner,
    o.next_followup_at,
    o.last_touched_at,
    o.loss_reason,
    e.canonical_name    AS business_name,
    e.sector,
    e.primary_phone     AS phone,
    e.primary_website   AS website,
    e.hvt,
    a.borough,
    a.postcode,
    os.total_score,
    os.score_band,
    os.estimated_monthly_value_gbp,
    q.quote_value_gbp
FROM opportunities o
JOIN entities e ON e.id = o.entity_id
LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
LEFT JOIN addresses a ON a.id = el.address_id
LEFT JOIN opportunity_scores os ON os.entity_id = e.id
LEFT JOIN LATERAL (
    SELECT quote_value_gbp FROM quotes WHERE opportunity_id = o.id
    ORDER BY created_at DESC LIMIT 1
) q ON TRUE;

CREATE OR REPLACE VIEW v_borough_summary AS
SELECT
    a.borough,
    COUNT(DISTINCT e.id)                            AS entity_count,
    COUNT(DISTINCT o.id)                            AS opportunity_count,
    AVG(os.total_score)::NUMERIC(5,1)               AS avg_score,
    COUNT(DISTINCT e.id) FILTER (WHERE e.hvt)       AS hvt_count,
    SUM(os.estimated_monthly_value_gbp)             AS total_pipeline_value_gbp
FROM addresses a
JOIN entity_locations el ON el.address_id = a.id AND el.is_primary = TRUE
JOIN entities e ON e.id = el.entity_id AND e.active = TRUE
LEFT JOIN opportunity_scores os ON os.entity_id = e.id
LEFT JOIN opportunities o ON o.entity_id = e.id
GROUP BY a.borough
ORDER BY avg_score DESC;
