-- ============================================================
-- AskMiro v2 — Sales Execution OS Migration
-- Run: psql -d askmiro_warehouse -f migrations/v2_sales_execution.sql
-- ============================================================

-- ── New enum values ──────────────────────────────────────────
ALTER TYPE signal_type ADD VALUE IF NOT EXISTS 'new_development';
ALTER TYPE source_system ADD VALUE IF NOT EXISTS 'planning_applications';
ALTER TYPE source_system ADD VALUE IF NOT EXISTS 'manual';

-- ── Extend existing tables ───────────────────────────────────

-- entities: dedup support
ALTER TABLE entities ADD COLUMN IF NOT EXISTS merged_into_id   BIGINT REFERENCES entities(id);
ALTER TABLE entities ADD COLUMN IF NOT EXISTS is_canonical     BOOLEAN DEFAULT TRUE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS dedup_hash       TEXT;

-- entities: improved sector classification
ALTER TABLE entities ADD COLUMN IF NOT EXISTS sector_confidence FLOAT DEFAULT 0.5;

-- signals: planning relevance + feed dedup
ALTER TABLE signals ADD COLUMN IF NOT EXISTS planning_relevant  BOOLEAN;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS planning_relevance_score FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS planning_category  TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS feed_dedup_key     TEXT;

-- contacts: upgrade existing table with enrichment metadata
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role_category     TEXT;   -- 'facilities_manager','registered_manager','director','operations','practice_manager','unknown'
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source            TEXT DEFAULT 'manual';  -- 'companies_house','cqc','manual','inferred'
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS confidence        FLOAT DEFAULT 0.5;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enriched_at       TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_decision_maker BOOLEAN DEFAULT FALSE;

-- opportunity_scores: confidence bands
ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS value_confidence  TEXT DEFAULT 'rough'; -- 'rough','estimated','confident'
ALTER TABLE opportunity_scores ADD COLUMN IF NOT EXISTS value_rationale   TEXT;

-- ── New tables ───────────────────────────────────────────────

-- Planning relevance scores (separate table to avoid wide signals)
CREATE TABLE IF NOT EXISTS planning_relevance (
    id              SERIAL PRIMARY KEY,
    signal_id       BIGINT REFERENCES signals(id) ON DELETE CASCADE,
    entity_id       BIGINT REFERENCES entities(id) ON DELETE CASCADE,
    is_relevant     BOOLEAN NOT NULL DEFAULT FALSE,
    relevance_score FLOAT NOT NULL DEFAULT 0,          -- 0.0–1.0
    category        TEXT,                              -- 'new_build','conversion','fit_out','hospitality','healthcare','education','industrial','residential_block','retail','other'
    include_reasons TEXT[],                            -- why it's kept
    exclude_reasons TEXT[],                            -- why it's rejected
    evidence_snippet TEXT,                             -- 120-char extract from application description
    scored_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planning_relevance_signal   ON planning_relevance(signal_id);
CREATE INDEX IF NOT EXISTS idx_planning_relevance_entity   ON planning_relevance(entity_id);
CREATE INDEX IF NOT EXISTS idx_planning_relevance_relevant ON planning_relevance(is_relevant) WHERE is_relevant = TRUE;

-- Entity merge candidates (dedup candidates flagged for review)
CREATE TABLE IF NOT EXISTS entity_merge_candidates (
    id              SERIAL PRIMARY KEY,
    entity_id_a     BIGINT REFERENCES entities(id),
    entity_id_b     BIGINT REFERENCES entities(id),
    similarity_score FLOAT NOT NULL,                   -- 0.0–1.0
    match_reasons   TEXT[],                            -- ['name','phone','address','company_number']
    status          TEXT NOT NULL DEFAULT 'pending',   -- 'pending','merged','rejected','deferred'
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id_a, entity_id_b)
);
CREATE INDEX IF NOT EXISTS idx_merge_candidates_status ON entity_merge_candidates(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_merge_candidates_score  ON entity_merge_candidates(similarity_score DESC);

-- Generated call scripts (AI, on-demand, cached)
CREATE TABLE IF NOT EXISTS generated_scripts (
    id              SERIAL PRIMARY KEY,
    entity_id       BIGINT REFERENCES entities(id) ON DELETE CASCADE,
    signal_id       BIGINT REFERENCES signals(id) ON DELETE SET NULL,
    signal_type     TEXT,
    -- Structured script fields
    opener          TEXT,                -- "Hi, is that [role]?"  ≤20 words
    reason_for_call TEXT,                -- specific signal-based reason  ≤30 words
    pain_hook       TEXT,                -- sector pain angle  ≤35 words
    credibility     TEXT,                -- "we clean X similar sites..."  ≤25 words
    qualifying_q    TEXT,                -- key qualifying question  ≤20 words
    objection_resp  TEXT,                -- "we already have a cleaner" response  ≤40 words
    next_step_ask   TEXT,                -- "can we arrange 15 min visit?"  ≤20 words
    contact_ask     TEXT,                -- who to ask for by name/role  ≤15 words
    full_script     TEXT,                -- concatenated for display
    -- Metadata
    model           TEXT DEFAULT 'claude-haiku-4-5',
    tokens_used     INT,
    input_hash      TEXT,               -- hash of input to detect stale cache
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    regenerated_at  TIMESTAMPTZ,
    is_stale        BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_scripts_entity   ON generated_scripts(entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scripts_entity_signal ON generated_scripts(entity_id, COALESCE(signal_id, -1));

-- Review pain analysis (keyword-based, no AI cost)
CREATE TABLE IF NOT EXISTS review_analysis (
    id                          SERIAL PRIMARY KEY,
    entity_id                   BIGINT REFERENCES entities(id) ON DELETE CASCADE UNIQUE,
    pain_score                  FLOAT NOT NULL DEFAULT 0,   -- 0.0–1.0 cleaning pain severity
    pain_themes                 TEXT[],                     -- ['dirty','hygiene','toilets','smell',...]
    key_snippets                TEXT[],                     -- ≤3 extracted review phrases for sales use
    total_reviews_analyzed      INT DEFAULT 0,
    negative_cleaning_reviews   INT DEFAULT 0,
    analysis_method             TEXT DEFAULT 'keyword',    -- 'keyword','hybrid','ai'
    evidence_text               TEXT,                      -- raw snippet analyzed (truncated)
    analyzed_at                 TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_analysis_pain ON review_analysis(pain_score DESC) WHERE pain_score > 0.3;

-- Contract renewal window predictions
CREATE TABLE IF NOT EXISTS renewal_predictions (
    id                  SERIAL PRIMARY KEY,
    entity_id           BIGINT REFERENCES entities(id) ON DELETE CASCADE UNIQUE,
    estimated_renewal   DATE,                       -- first of estimated renewal month
    confidence          TEXT NOT NULL DEFAULT 'speculative',  -- 'high','medium','low','speculative'
    rationale           TEXT,                       -- human-readable explanation
    evidence_source     TEXT,                       -- 'cqc_registration','company_age','planning_date','sector_cycle'
    days_until_renewal  INT,                        -- computed from estimated_renewal
    call_now_flag       BOOLEAN DEFAULT FALSE,      -- TRUE if renewal within 90 days
    predicted_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_renewal_call_now ON renewal_predictions(call_now_flag) WHERE call_now_flag = TRUE;
CREATE INDEX IF NOT EXISTS idx_renewal_date     ON renewal_predictions(estimated_renewal ASC NULLS LAST);

-- Outreach sequence templates
CREATE TABLE IF NOT EXISTS outreach_sequences (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    signal_type     TEXT,                           -- NULL = generic, else matches signal_type
    description     TEXT,
    total_steps     INT NOT NULL DEFAULT 5,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Sequence step templates
CREATE TABLE IF NOT EXISTS outreach_steps (
    id              SERIAL PRIMARY KEY,
    sequence_id     INT REFERENCES outreach_sequences(id) ON DELETE CASCADE,
    step_number     INT NOT NULL,
    channel         TEXT NOT NULL,                  -- 'call','email','linkedin','visit','note'
    day_offset      INT NOT NULL DEFAULT 0,         -- days after sequence start
    objective       TEXT,                           -- what you want from this step
    action_template TEXT,                           -- suggested script/message stub
    subject_template TEXT,                          -- for email steps
    UNIQUE(sequence_id, step_number)
);

-- Entity-level sequence instances
CREATE TABLE IF NOT EXISTS entity_sequences (
    id              SERIAL PRIMARY KEY,
    entity_id       BIGINT REFERENCES entities(id) ON DELETE CASCADE,
    sequence_id     INT REFERENCES outreach_sequences(id),
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    current_step    INT DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'active',  -- 'active','paused','completed','converted','dropped'
    next_action_due TIMESTAMPTZ,
    UNIQUE(entity_id, sequence_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_sequences_entity   ON entity_sequences(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_sequences_status   ON entity_sequences(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_entity_sequences_due      ON entity_sequences(next_action_due) WHERE status = 'active';

-- Outreach activity log (per-touch history)
CREATE TABLE IF NOT EXISTS outreach_activities (
    id                  SERIAL PRIMARY KEY,
    entity_id           BIGINT REFERENCES entities(id) ON DELETE CASCADE,
    entity_sequence_id  INT REFERENCES entity_sequences(id) ON DELETE SET NULL,
    activity_type       TEXT NOT NULL,              -- 'call','email','linkedin','visit','note'
    outcome             TEXT,                       -- 'no_answer','spoke','meeting_booked','not_interested','callback','emailed','bounced','left_voicemail'
    notes               TEXT,
    duration_seconds    INT,
    contacted_name      TEXT,
    next_followup_at    TIMESTAMPTZ,
    logged_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_activities_entity ON outreach_activities(entity_id);
CREATE INDEX IF NOT EXISTS idx_outreach_activities_logged ON outreach_activities(logged_at DESC);

-- Daily task list (generated each morning)
CREATE TABLE IF NOT EXISTS daily_tasks (
    id                  SERIAL PRIMARY KEY,
    task_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    entity_id           BIGINT REFERENCES entities(id) ON DELETE CASCADE,
    entity_sequence_id  INT REFERENCES entity_sequences(id) ON DELETE SET NULL,
    task_type           TEXT NOT NULL,              -- 'call','email','linkedin','follow_up','reactivate','new_lead'
    priority            SMALLINT NOT NULL DEFAULT 5, -- 1=highest, 10=lowest
    reason              TEXT,                       -- why this task was generated
    status              TEXT NOT NULL DEFAULT 'pending',  -- 'pending','done','snoozed','skipped'
    snoozed_until       DATE,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_date   ON daily_tasks(task_date, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_daily_tasks_entity ON daily_tasks(entity_id);

-- ── Seed outreach sequence templates ────────────────────────

INSERT INTO outreach_sequences(name, signal_type, description, total_steps) VALUES
('Gov Contract Fast-Track',     'public_procurement',           'Time-sensitive tender pursuit — 5 steps over 10 days', 5),
('New Premises',                'move_signal',                  'New premises — pitch before they lock in a cleaner', 5),
('Healthcare Compliance',       'regulated_healthcare_facility','CQC registered — hygiene urgency angle', 5),
('Multi-Site Strategic',        'multi_site_signal',            'Multiple locations — pitch group contract', 6),
('Planning Fit-Out',            'new_development',              'New development — contact during fit-out window', 5),
('Review Pain',                 'review_signal',                'Poor cleanliness reviews — pitch as the solution', 5),
('Compliance Pressure',         'compliance_signal',            'Compliance-driven buying urgency', 5),
('Renewal Window',              NULL,                           'Contract renewal approaching — warm outreach', 4),
('Cold Outreach — Generic',     NULL,                           'Standard 5-touch cold sequence', 5)
ON CONFLICT (name) DO NOTHING;

-- Gov Contract sequence steps
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 1, 'call',     0,  'Confirm tender is open + who handles FM', 'Call today. Ask: "Is the [tender name] contract still open for bids?"', NULL
FROM outreach_sequences WHERE name = 'Gov Contract Fast-Track'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 2, 'email',    1,  'Send company profile + capability statement', 'Send 1-page capability statement. Reference tender value and your sector experience.', 'Re: [Tender Name] — Commercial Cleaning Capability'
FROM outreach_sequences WHERE name = 'Gov Contract Fast-Track'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 3, 'call',     3,  'Confirm email received + request site visit', 'Follow up on email. Ask for 20-min site visit to scope.', NULL
FROM outreach_sequences WHERE name = 'Gov Contract Fast-Track'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 4, 'email',    6,  'Submit formal expression of interest', 'Send EOI with pricing framework. Use sector reference sites.', 'Expression of Interest — [Company Name] Cleaning Contract'
FROM outreach_sequences WHERE name = 'Gov Contract Fast-Track'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 5, 'call',     10, 'Close: arrange site survey or confirm bid submission', 'Final push. Confirm timeline. Offer site survey this week.', NULL
FROM outreach_sequences WHERE name = 'Gov Contract Fast-Track'
ON CONFLICT DO NOTHING;

-- New Premises sequence steps
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 1, 'call',     0,  'Confirm move + offer immediate quote', 'Call FM/ops. "Congratulations on the move — we specialise in post-move cleaning for [sector]."', NULL
FROM outreach_sequences WHERE name = 'New Premises'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 2, 'email',    1,  'Send move-in cleaning checklist + pricing', 'Send move-in guide. Attach pricing template. Reference similar site nearby.', 'Move-In Cleaning Package — [Company Name]'
FROM outreach_sequences WHERE name = 'New Premises'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 3, 'call',     4,  'Follow up — is interim clean needed?', 'Call back. Ask about handover clean timeline.', NULL
FROM outreach_sequences WHERE name = 'New Premises'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 4, 'email',    7,  'Send formal quote with 3-month trial offer', 'Formal quote email. Include 3-month trial option.', 'Cleaning Quote — New Premises at [Address]'
FROM outreach_sequences WHERE name = 'New Premises'
ON CONFLICT DO NOTHING;
INSERT INTO outreach_steps(sequence_id, step_number, channel, day_offset, objective, action_template, subject_template)
SELECT id, 5, 'call',     14, 'Decision follow-up', 'Final call. Ask for a decision or site visit date.', NULL
FROM outreach_sequences WHERE name = 'New Premises'
ON CONFLICT DO NOTHING;

COMMIT;
