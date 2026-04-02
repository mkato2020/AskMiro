"""
ops_tables.py -- Operational database tables for AskMiro Business OS.

Creates all finance, operations, payroll, and SEO tables idempotently.
Called from database.py on startup.
"""

import logging
import db_pg

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Table creation
# ---------------------------------------------------------------------------

def ensure_ops_tables(conn):
    """Create all operational tables if they do not already exist."""

    log.info("Ensuring operational tables exist ...")

    # 1. fin_invoices
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS fin_invoices (
            id              SERIAL PRIMARY KEY,
            invoice_number  TEXT UNIQUE,
            customer_name   TEXT NOT NULL,
            site_id         TEXT,
            contract_id     TEXT,
            entity_id       INTEGER,
            invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
            due_date        DATE NOT NULL,
            billing_period_from DATE,
            billing_period_to   DATE,
            payment_terms   INTEGER DEFAULT 30,
            subtotal_net    NUMERIC(12,2) DEFAULT 0,
            vat_amount      NUMERIC(12,2) DEFAULT 0,
            total_gross     NUMERIC(12,2) DEFAULT 0,
            amount_paid     NUMERIC(12,2) DEFAULT 0,
            balance_due     NUMERIC(12,2) DEFAULT 0,
            status          TEXT DEFAULT 'Draft'
                            CHECK (status IN ('Draft','Issued','Sent','Paid','Overdue','Void')),
            line_items_json JSONB DEFAULT '[]',
            notes           TEXT,
            created_at      TIMESTAMP DEFAULT NOW(),
            updated_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 2. fin_expenses
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS fin_expenses (
            id              SERIAL PRIMARY KEY,
            expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
            category        TEXT NOT NULL,
            subcategory     TEXT,
            description     TEXT NOT NULL,
            supplier        TEXT,
            site_id         TEXT,
            contract_id     TEXT,
            entity_id       INTEGER,
            amount_gross    NUMERIC(12,2) NOT NULL,
            amount_net      NUMERIC(12,2),
            amount_vat      NUMERIC(12,2),
            receipt_ref     TEXT,
            recurring       TEXT DEFAULT 'No' CHECK (recurring IN ('Yes','No')),
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 3. fin_transactions
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS fin_transactions (
            id              SERIAL PRIMARY KEY,
            transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
            type            TEXT NOT NULL
                            CHECK (type IN ('income','expense','invoice','payment','credit_note','adjustment')),
            category        TEXT,
            description     TEXT NOT NULL,
            party           TEXT,
            amount_gross    NUMERIC(12,2) NOT NULL,
            amount_net      NUMERIC(12,2),
            amount_vat      NUMERIC(12,2),
            external_ref    TEXT,
            site_id         TEXT,
            entity_id       INTEGER,
            linked_invoice_id INTEGER REFERENCES fin_invoices(id),
            notes           TEXT,
            status          TEXT DEFAULT 'active' CHECK (status IN ('active','void')),
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 4. fin_payments
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS fin_payments (
            id              SERIAL PRIMARY KEY,
            invoice_id      INTEGER NOT NULL REFERENCES fin_invoices(id),
            amount          NUMERIC(12,2) NOT NULL,
            date_received   DATE NOT NULL DEFAULT CURRENT_DATE,
            payment_method  TEXT DEFAULT 'BACS'
                            CHECK (payment_method IN ('BACS','Cheque','Card','Cash','Other')),
            reference       TEXT,
            notes           TEXT,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 5. fin_snapshots
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS fin_snapshots (
            id              SERIAL PRIMARY KEY,
            snapshot_month  TEXT NOT NULL,
            site_id         TEXT,
            contract_id     TEXT,
            entity_id       INTEGER,
            invoiced_revenue    NUMERIC(12,2) DEFAULT 0,
            cash_received       NUMERIC(12,2) DEFAULT 0,
            labour_cost         NUMERIC(12,2) DEFAULT 0,
            supplies_cost       NUMERIC(12,2) DEFAULT 0,
            travel_cost         NUMERIC(12,2) DEFAULT 0,
            subcontractor_cost  NUMERIC(12,2) DEFAULT 0,
            other_cost          NUMERIC(12,2) DEFAULT 0,
            total_cost          NUMERIC(12,2) DEFAULT 0,
            gross_profit        NUMERIC(12,2) DEFAULT 0,
            gross_margin_pct    NUMERIC(5,2)  DEFAULT 0,
            risk_flag       TEXT DEFAULT 'nodata'
                            CHECK (risk_flag IN ('healthy','watch','risk','loss','nodata')),
            recommendation  TEXT,
            created_at      TIMESTAMP DEFAULT NOW(),
            UNIQUE(snapshot_month, site_id)
        )
    """)

    # 6. ops_cleaners
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS ops_cleaners (
            id                  SERIAL PRIMARY KEY,
            full_name           TEXT NOT NULL,
            email               TEXT,
            phone               TEXT,
            home_postcode       TEXT,
            borough             TEXT,
            cleaner_type        TEXT DEFAULT 'Employee'
                                CHECK (cleaner_type IN ('Employee','Subcontractor','Agency','Trial')),
            status              TEXT DEFAULT 'Active'
                                CHECK (status IN ('Active','Inactive','Archived','Trial')),
            performance_rating  NUMERIC(3,1) DEFAULT 0,
            hourly_rate         NUMERIC(8,2) DEFAULT 12.50,
            availability_type   TEXT DEFAULT 'Full-time',
            currently_available TEXT DEFAULT 'Yes',
            emergency_cover     TEXT DEFAULT 'No',
            transport_mode      TEXT DEFAULT 'Public Transport',
            has_own_vehicle     TEXT DEFAULT 'No',
            services_offered    TEXT,
            compliance_status   TEXT DEFAULT 'Pending'
                                CHECK (compliance_status IN ('Ready','Pending','Expiring','Blocked')),
            dbs_status          TEXT DEFAULT 'None'
                                CHECK (dbs_status IN ('Enhanced','Basic','None','Expired')),
            notes               TEXT,
            last_worked_date    DATE,
            created_at          TIMESTAMP DEFAULT NOW(),
            updated_at          TIMESTAMP DEFAULT NOW()
        )
    """)

    # 7. ops_jobs
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS ops_jobs (
            id          SERIAL PRIMARY KEY,
            site_id     TEXT,
            entity_id   INTEGER,
            client_name TEXT,
            job_date    DATE NOT NULL DEFAULT CURRENT_DATE,
            start_time  TEXT DEFAULT '06:00',
            end_time    TEXT,
            staff_name  TEXT,
            cleaner_id  INTEGER REFERENCES ops_cleaners(id),
            status      TEXT DEFAULT 'Scheduled'
                        CHECK (status IN ('Scheduled','InProgress','Complete','Missed','Cancelled')),
            clock_in    TIMESTAMP,
            clock_out   TIMESTAMP,
            notes       TEXT,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)

    # 8. ops_inspections
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS ops_inspections (
            id              SERIAL PRIMARY KEY,
            site_id         TEXT,
            entity_id       INTEGER,
            client_name     TEXT,
            inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
            inspector       TEXT,
            score           INTEGER CHECK (score >= 0 AND score <= 100),
            notes           TEXT,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 9. ops_incidents
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS ops_incidents (
            id              SERIAL PRIMARY KEY,
            site_id         TEXT,
            entity_id       INTEGER,
            client_name     TEXT,
            incident_date   DATE NOT NULL DEFAULT CURRENT_DATE,
            incident_type   TEXT NOT NULL
                            CHECK (incident_type IN ('Complaint','Near Miss','Accident','Reclean')),
            description     TEXT NOT NULL,
            status          TEXT DEFAULT 'Open' CHECK (status IN ('Open','Resolved')),
            resolution      TEXT,
            resolved_at     TIMESTAMP,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 10. pay_workers
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS pay_workers (
            id                  SERIAL PRIMARY KEY,
            cleaner_id          INTEGER REFERENCES ops_cleaners(id),
            full_name           TEXT NOT NULL,
            role                TEXT DEFAULT 'Cleaner'
                                CHECK (role IN ('Cleaner','Supervisor','Team Leader','Driver','Office')),
            phone               TEXT,
            email               TEXT,
            address             TEXT,
            date_of_birth       DATE,
            start_date          DATE,
            ni_number           TEXT,
            tax_code            TEXT DEFAULT '1257L',
            default_hourly_rate NUMERIC(8,2) DEFAULT 12.50,
            payment_method      TEXT DEFAULT 'BACS'
                                CHECK (payment_method IN ('BACS','Cash','Cheque')),
            payroll_type        TEXT DEFAULT 'PAYE'
                                CHECK (payroll_type IN ('PAYE','Self-employed','Agency')),
            status              TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
            created_at          TIMESTAMP DEFAULT NOW(),
            updated_at          TIMESTAMP DEFAULT NOW()
        )
    """)

    # 11. pay_entries
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS pay_entries (
            id          SERIAL PRIMARY KEY,
            worker_id   INTEGER NOT NULL REFERENCES pay_workers(id),
            worker_name TEXT,
            role        TEXT,
            entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
            entry_type  TEXT DEFAULT 'Basic Hours'
                        CHECK (entry_type IN (
                            'Basic Hours','Overtime x1.5','Overtime x2',
                            'Night Shift','Holiday Pay','Training','Other'
                        )),
            hours_worked NUMERIC(5,2) NOT NULL,
            hourly_rate  NUMERIC(8,2) NOT NULL,
            total_pay    NUMERIC(10,2) NOT NULL,
            status       TEXT DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','paid')),
            site_id      TEXT,
            contract_id  TEXT,
            notes        TEXT,
            created_at   TIMESTAMP DEFAULT NOW()
        )
    """)

    # 12. seo_articles
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS seo_articles (
            id              SERIAL PRIMARY KEY,
            title           TEXT NOT NULL,
            slug            TEXT UNIQUE,
            target_keyword  TEXT,
            content_type    TEXT DEFAULT 'blog'
                            CHECK (content_type IN ('blog','page','social','email','landing')),
            status          TEXT DEFAULT 'draft'
                            CHECK (status IN ('draft','published','scheduled','review')),
            html_content    TEXT,
            meta_description TEXT,
            word_count      INTEGER DEFAULT 0,
            published_at    TIMESTAMP,
            github_commit_url TEXT,
            live_url        TEXT,
            created_at      TIMESTAMP DEFAULT NOW(),
            updated_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 13. seo_keywords
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS seo_keywords (
            id          SERIAL PRIMARY KEY,
            keyword     TEXT NOT NULL,
            intent      TEXT DEFAULT 'informational'
                        CHECK (intent IN ('informational','commercial','transactional')),
            position    INTEGER,
            volume      INTEGER,
            difficulty  INTEGER,
            tracked     BOOLEAN DEFAULT TRUE,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)

    # 14. fin_settings
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS fin_settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TIMESTAMP DEFAULT NOW()
        )
    """)
    db_pg.execute(conn, """
        INSERT INTO fin_settings (key, value) VALUES
            ('vat_rate', '20'),
            ('default_payment_terms', '30'),
            ('target_margin_healthy', '35'),
            ('target_margin_watch', '20')
        ON CONFLICT (key) DO NOTHING
    """)

    # 15. compliance_documents — full document management for UK cleaning compliance
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS compliance_documents (
            id              SERIAL PRIMARY KEY,
            category        TEXT NOT NULL,
            subcategory     TEXT,
            document_name   TEXT NOT NULL,
            description     TEXT,
            file_path       TEXT,
            file_size_bytes INTEGER,
            file_type       TEXT,
            status          TEXT DEFAULT 'missing'
                            CHECK (status IN ('missing','draft','current','expired','review','uploaded')),
            required        BOOLEAN DEFAULT TRUE,
            expiry_date     DATE,
            renewal_freq    TEXT CHECK (renewal_freq IN ('annual','biannual','quarterly','monthly','one-off',NULL)),
            last_reviewed   DATE,
            reviewed_by     TEXT,
            entity_id       INTEGER,
            cleaner_id      INTEGER,
            site_id         TEXT,
            notes           TEXT,
            created_at      TIMESTAMP DEFAULT NOW(),
            updated_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # 16. compliance_categories — reference table of required documents
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS compliance_categories (
            id          SERIAL PRIMARY KEY,
            category    TEXT NOT NULL,
            subcategory TEXT,
            doc_name    TEXT NOT NULL,
            description TEXT,
            required    BOOLEAN DEFAULT TRUE,
            renewal_freq TEXT,
            priority    INTEGER DEFAULT 5,
            UNIQUE(category, doc_name)
        )
    """)

    # Seed compliance requirements for UK cleaning company
    _seed_compliance_requirements(conn)

    # 17. contracts
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS contracts (
            id SERIAL PRIMARY KEY,
            opportunity_id INTEGER,
            entity_id BIGINT,
            site_name TEXT,
            site_address TEXT,
            site_postcode TEXT,
            service_type TEXT DEFAULT 'Regular Cleaning',
            cleaning_frequency TEXT DEFAULT '5 days/week',
            hours_per_week NUMERIC(5,1),
            monthly_value_gbp NUMERIC(10,2),
            annual_value_gbp NUMERIC(10,2),
            contract_start DATE,
            contract_end DATE,
            renewal_date DATE,
            notice_period_days INTEGER DEFAULT 30,
            payment_terms INTEGER DEFAULT 30,
            sla_response_hours INTEGER DEFAULT 4,
            assigned_cleaners JSONB DEFAULT '[]',
            status TEXT DEFAULT 'active',
            margin_pct NUMERIC(5,2),
            risk_flag TEXT DEFAULT 'healthy',
            staffing_status TEXT DEFAULT 'unassigned',
            launch_readiness TEXT DEFAULT 'pending',
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # 18. contract_schedules
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS contract_schedules (
            id SERIAL PRIMARY KEY,
            contract_id INTEGER NOT NULL,
            day_of_week INTEGER,
            start_time TEXT DEFAULT '06:00',
            end_time TEXT,
            cleaner_id INTEGER,
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # 19. quote_cost_breakdowns
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS quote_cost_breakdowns (
            id SERIAL PRIMARY KEY,
            quote_id BIGINT,
            entity_id BIGINT,
            hours_per_week NUMERIC(5,1),
            days_per_week INTEGER DEFAULT 5,
            hourly_rate NUMERIC(8,2),
            llw_rate NUMERIC(8,2),
            on_costs_pct NUMERIC(5,2),
            monthly_labour NUMERIC(10,2),
            monthly_supplies NUMERIC(10,2) DEFAULT 0,
            monthly_travel NUMERIC(10,2) DEFAULT 0,
            monthly_other NUMERIC(10,2) DEFAULT 0,
            monthly_revenue NUMERIC(10,2),
            monthly_cost NUMERIC(10,2),
            gross_margin_pct NUMERIC(5,2),
            scenario TEXT DEFAULT 'balanced',
            sector_avg_margin NUMERIC(5,2),
            feasibility_score INTEGER,
            matched_cleaners JSONB,
            risk_level TEXT DEFAULT 'normal',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # 20. cleaner_coverage
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS cleaner_coverage (
            id SERIAL PRIMARY KEY,
            cleaner_id INTEGER NOT NULL,
            postcode_district TEXT NOT NULL,
            travel_minutes INTEGER,
            distance_km NUMERIC(5,1),
            preferred BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(cleaner_id, postcode_district)
        )
    """)

    # 21. intelligence_alerts
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS intelligence_alerts (
            id SERIAL PRIMARY KEY,
            alert_type TEXT NOT NULL,
            severity TEXT DEFAULT 'warning',
            entity_id BIGINT,
            contract_id INTEGER,
            cleaner_id INTEGER,
            opportunity_id INTEGER,
            title TEXT NOT NULL,
            detail TEXT,
            action_url TEXT,
            module TEXT,
            acknowledged BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP
        )
    """)

    # ── ALTER ops_cleaners: add new columns for coverage/intelligence ──
    for col_sql in [
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS home_latitude DOUBLE PRECISION",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS home_longitude DOUBLE PRECISION",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS max_travel_minutes INTEGER DEFAULT 60",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS preferred_sectors TEXT DEFAULT ''",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS reliability_score NUMERIC(3,1) DEFAULT 5.0",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS performance_score NUMERIC(3,1) DEFAULT 5.0",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS assigned_hours NUMERIC(5,1) DEFAULT 0",
        "ALTER TABLE ops_cleaners ADD COLUMN IF NOT EXISTS transport_mode_v2 TEXT DEFAULT 'public_transport'",
    ]:
        try:
            db_pg.execute(conn, col_sql)
        except Exception:
            pass

    # ── Performance indexes ──────────────────────────────────────────────
    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_fin_invoices_status ON fin_invoices(status)",
        "CREATE INDEX IF NOT EXISTS idx_fin_invoices_due_date ON fin_invoices(due_date)",
        "CREATE INDEX IF NOT EXISTS idx_fin_invoices_invoice_date ON fin_invoices(invoice_date)",
        "CREATE INDEX IF NOT EXISTS idx_fin_invoices_entity_id ON fin_invoices(entity_id)",
        "CREATE INDEX IF NOT EXISTS idx_fin_expenses_expense_date ON fin_expenses(expense_date)",
        "CREATE INDEX IF NOT EXISTS idx_fin_expenses_site_id ON fin_expenses(site_id)",
        "CREATE INDEX IF NOT EXISTS idx_fin_expenses_category ON fin_expenses(category)",
        "CREATE INDEX IF NOT EXISTS idx_fin_transactions_date ON fin_transactions(transaction_date)",
        "CREATE INDEX IF NOT EXISTS idx_fin_transactions_type ON fin_transactions(type)",
        "CREATE INDEX IF NOT EXISTS idx_ops_jobs_job_date ON ops_jobs(job_date)",
        "CREATE INDEX IF NOT EXISTS idx_ops_jobs_status ON ops_jobs(status)",
        "CREATE INDEX IF NOT EXISTS idx_ops_jobs_cleaner_id ON ops_jobs(cleaner_id)",
        "CREATE INDEX IF NOT EXISTS idx_ops_inspections_date ON ops_inspections(inspection_date)",
        "CREATE INDEX IF NOT EXISTS idx_ops_incidents_status ON ops_incidents(status)",
        "CREATE INDEX IF NOT EXISTS idx_pay_entries_worker_id ON pay_entries(worker_id)",
        "CREATE INDEX IF NOT EXISTS idx_pay_entries_entry_date ON pay_entries(entry_date)",
        "CREATE INDEX IF NOT EXISTS idx_pay_entries_status ON pay_entries(status)",
        "CREATE INDEX IF NOT EXISTS idx_seo_articles_status ON seo_articles(status)",
        "CREATE INDEX IF NOT EXISTS idx_compliance_docs_category ON compliance_documents(category)",
        "CREATE INDEX IF NOT EXISTS idx_compliance_docs_status ON compliance_documents(status)",
        # New table indexes
        "CREATE INDEX IF NOT EXISTS idx_contracts_entity ON contracts(entity_id)",
        "CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)",
        "CREATE INDEX IF NOT EXISTS idx_contracts_postcode ON contracts(site_postcode)",
        "CREATE INDEX IF NOT EXISTS idx_contracts_renewal ON contracts(renewal_date)",
        "CREATE INDEX IF NOT EXISTS idx_sched_contract ON contract_schedules(contract_id)",
        "CREATE INDEX IF NOT EXISTS idx_sched_cleaner ON contract_schedules(cleaner_id)",
        "CREATE INDEX IF NOT EXISTS idx_coverage_postcode ON cleaner_coverage(postcode_district)",
        "CREATE INDEX IF NOT EXISTS idx_coverage_cleaner ON cleaner_coverage(cleaner_id)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_type ON intelligence_alerts(alert_type)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_active ON intelligence_alerts(acknowledged, created_at DESC)",
    ]:
        try:
            db_pg.execute(conn, idx_sql)
        except Exception:
            pass

    # ── Email Deliverability tables ────────────────────────────────────
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS email_suppression_list (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            reason TEXT,
            smtp_code TEXT,
            suppressed_at TIMESTAMPTZ DEFAULT NOW(),
            active BOOLEAN DEFAULT TRUE
        )
    """)
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS email_bounce_log (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            entity_id INTEGER,
            smtp_code TEXT,
            smtp_message TEXT,
            bounce_type TEXT,
            action_taken TEXT,
            recorded_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS email_send_log (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            entity_id INTEGER,
            template_type TEXT,
            subject TEXT,
            sent_at TIMESTAMPTZ DEFAULT NOW(),
            delivery_status TEXT DEFAULT 'sent',
            smtp_response TEXT
        )
    """)
    # Add deliverability columns to entity_emails
    for col in [
        "ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS bounced BOOLEAN DEFAULT FALSE",
        "ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0",
        "ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'unknown'",
        "ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ",
    ]:
        try:
            db_pg.execute(conn, col)
        except Exception:
            pass

    log.info("All operational tables verified.")


# ---------------------------------------------------------------------------
# Invoice numbering
# ---------------------------------------------------------------------------

def next_invoice_number(conn):
    """Generate next invoice number like INV-000001."""
    val = db_pg.fetchval(
        conn,
        "SELECT COALESCE(MAX(id), 0) + 1 FROM fin_invoices",
    )
    return f"INV-{val:06d}"


# ---------------------------------------------------------------------------
# Overdue detection
# ---------------------------------------------------------------------------

def mark_overdue_invoices(conn):
    """Mark invoices past due date as Overdue."""
    db_pg.execute(conn, """
        UPDATE fin_invoices
        SET status = 'Overdue', updated_at = NOW()
        WHERE status IN ('Issued', 'Sent')
          AND due_date < CURRENT_DATE
    """)


# ---------------------------------------------------------------------------
# Profitability snapshots
# ---------------------------------------------------------------------------

def recalculate_snapshots(conn, month=None):
    """Recalculate P&L snapshots for all sites (or a specific month).

    Returns the number of site-months processed.
    """
    month_filter = ""
    params = ()
    if month:
        month_filter = "AND TO_CHAR(i.invoice_date, 'YYYY-MM') = %s"
        params = (month,)

    revenue_rows = db_pg.fetchall(conn, f"""
        SELECT i.site_id,
               TO_CHAR(i.invoice_date, 'YYYY-MM') AS month,
               SUM(i.total_gross) AS revenue
        FROM fin_invoices i
        WHERE i.status IN ('Paid','Issued','Sent','Overdue')
          AND i.site_id IS NOT NULL
          {month_filter}
        GROUP BY i.site_id, TO_CHAR(i.invoice_date, 'YYYY-MM')
    """, params)

    for r in revenue_rows:
        sid = r["site_id"]
        m = r["month"]
        rev = float(r["revenue"] or 0)

        costs = db_pg.fetchone(conn, """
            SELECT
                COALESCE(SUM(CASE WHEN category = 'Labour'
                    THEN amount_gross ELSE 0 END), 0) AS labour,
                COALESCE(SUM(CASE WHEN category = 'Supplies & Consumables'
                    THEN amount_gross ELSE 0 END), 0) AS supplies,
                COALESCE(SUM(CASE WHEN category = 'Travel & Transport'
                    THEN amount_gross ELSE 0 END), 0) AS travel,
                COALESCE(SUM(CASE WHEN category = 'Subcontractors'
                    THEN amount_gross ELSE 0 END), 0) AS subcontractors,
                COALESCE(SUM(CASE WHEN category NOT IN (
                    'Labour','Supplies & Consumables',
                    'Travel & Transport','Subcontractors'
                ) THEN amount_gross ELSE 0 END), 0) AS other
            FROM fin_expenses
            WHERE site_id = %s
              AND TO_CHAR(expense_date, 'YYYY-MM') = %s
        """, (sid, m))

        labour = float(costs["labour"] or 0)
        supplies = float(costs["supplies"] or 0)
        travel = float(costs["travel"] or 0)
        subs = float(costs["subcontractors"] or 0)
        other = float(costs["other"] or 0)
        total_cost = labour + supplies + travel + subs + other
        gross_profit = rev - total_cost
        margin = (gross_profit / rev * 100) if rev > 0 else 0

        if rev == 0:
            risk = "nodata"
        elif margin >= 35:
            risk = "healthy"
        elif margin >= 20:
            risk = "watch"
        elif margin >= 0:
            risk = "risk"
        else:
            risk = "loss"

        db_pg.execute(conn, """
            INSERT INTO fin_snapshots
                (snapshot_month, site_id, invoiced_revenue,
                 labour_cost, supplies_cost, travel_cost,
                 subcontractor_cost, other_cost, total_cost,
                 gross_profit, gross_margin_pct, risk_flag)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (snapshot_month, site_id) DO UPDATE SET
                invoiced_revenue   = EXCLUDED.invoiced_revenue,
                labour_cost        = EXCLUDED.labour_cost,
                supplies_cost      = EXCLUDED.supplies_cost,
                travel_cost        = EXCLUDED.travel_cost,
                subcontractor_cost = EXCLUDED.subcontractor_cost,
                other_cost         = EXCLUDED.other_cost,
                total_cost         = EXCLUDED.total_cost,
                gross_profit       = EXCLUDED.gross_profit,
                gross_margin_pct   = EXCLUDED.gross_margin_pct,
                risk_flag          = EXCLUDED.risk_flag
        """, (m, sid, rev, labour, supplies, travel, subs, other,
              total_cost, gross_profit, margin, risk))

    log.info("Recalculated %d site-month snapshots.", len(revenue_rows))
    return len(revenue_rows)


# ---------------------------------------------------------------------------
# Compliance document requirements seed
# ---------------------------------------------------------------------------

_COMPLIANCE_DOCS = [
    # Company & Legal
    ("Company & Legal", None, "Certificate of Incorporation", "Companies House registration certificate", True, "one-off", 1),
    ("Company & Legal", None, "Articles of Association", "Company governance document", True, "one-off", 1),
    ("Company & Legal", None, "Memorandum of Association", "Signed founding document", True, "one-off", 2),
    ("Company & Legal", None, "Register of Directors & Shareholders", "Official internal register", True, "annual", 3),
    ("Company & Legal", None, "Registered Office Documentation", "Proof of business address", True, "one-off", 3),
    # Tax & HMRC
    ("Tax & HMRC", "Corporation Tax", "Corporation Tax Registration", "HMRC CT registration certificate", True, "one-off", 1),
    ("Tax & HMRC", "PAYE", "PAYE Registration", "Employer PAYE scheme registration", True, "one-off", 1),
    ("Tax & HMRC", "VAT", "VAT Registration Certificate", "Required when turnover exceeds £85,000", False, "one-off", 2),
    ("Tax & HMRC", "NI", "Employer NI Registration", "National Insurance contributions setup", True, "one-off", 2),
    ("Tax & HMRC", "Accounts", "Annual Accounts & CT600", "Corporation Tax return filed to HMRC", True, "annual", 1),
    ("Tax & HMRC", "Accounts", "Confirmation Statement (CS01)", "Annual Companies House filing", True, "annual", 2),
    ("Tax & HMRC", "Accounts", "Business Bank Account Documentation", "Separate business account evidence", True, "one-off", 3),
    # Insurance
    ("Insurance", None, "Employers' Liability Insurance", "Legal requirement — min £10m cover", True, "annual", 1),
    ("Insurance", None, "Public Liability Insurance", "Min £5m cover for commercial cleaning", True, "annual", 1),
    ("Insurance", None, "Professional Indemnity Insurance", "Protection against negligence claims", True, "annual", 2),
    ("Insurance", None, "Insurance Certificate (client copy)", "Proof of cover for client tenders", True, "annual", 1),
    # Health & Safety
    ("Health & Safety", "Core Policy", "Health & Safety Policy", "Written H&S policy (required if 5+ employees)", True, "annual", 1),
    ("Health & Safety", "Core Policy", "H&S Statement of Intent", "Signed company commitment to H&S", True, "annual", 1),
    ("Health & Safety", "Risk Assessments", "Generic Cleaning Risk Assessment", "Standard cleaning tasks risk assessment", True, "annual", 1),
    ("Health & Safety", "Risk Assessments", "Slips, Trips & Falls Risk Assessment", "Major hazard area for cleaning", True, "annual", 2),
    ("Health & Safety", "Risk Assessments", "Work at Height Risk Assessment", "Window cleaning, high dusting", True, "annual", 2),
    ("Health & Safety", "Risk Assessments", "Lone Working Risk Assessment", "If staff work alone on site", True, "annual", 2),
    ("Health & Safety", "Risk Assessments", "MSD Risk Assessment", "Musculoskeletal disorder prevention", True, "annual", 3),
    ("Health & Safety", "Method Statements", "Method Statement — Office Cleaning", "Safe working procedure", True, "annual", 2),
    ("Health & Safety", "Method Statements", "Method Statement — Deep Clean", "Safe working procedure", True, "annual", 2),
    ("Health & Safety", "Method Statements", "Method Statement — Kitchen/Washroom", "Safe working procedure", True, "annual", 2),
    ("Health & Safety", "Reporting", "Accident & Incident Report Template", "Recording template (RIDDOR compliant)", True, "one-off", 1),
    ("Health & Safety", "Reporting", "First Aid Box Inventory", "Contents list and replenishment log", True, "quarterly", 3),
    ("Health & Safety", "Reporting", "Emergency Procedures Document", "Evacuation, fire, incident response", True, "annual", 2),
    # COSHH
    ("COSHH", None, "COSHH Risk Assessments", "For all chemicals/substances used", True, "annual", 1),
    ("COSHH", None, "Chemical Safety Data Sheets (SDS)", "For every cleaning product", True, "one-off", 1),
    ("COSHH", None, "Chemical Inventory Register", "Full list of hazardous substances", True, "quarterly", 2),
    ("COSHH", None, "COSHH Training Records", "Employee COSHH training evidence", True, "annual", 1),
    ("COSHH", None, "PPE Assessment & Records", "Gloves, aprons, eye protection", True, "annual", 2),
    ("COSHH", None, "Spillage & Contamination Procedure", "Emergency response documentation", True, "one-off", 2),
    # Employment
    ("Employment", "Contracts", "Employment Contract Template", "Standard employment agreement", True, "one-off", 1),
    ("Employment", "Contracts", "Subcontractor Agreement Template", "For self-employed cleaners (IR35 aware)", True, "one-off", 1),
    ("Employment", "Policies", "Disciplinary & Grievance Procedure", "Formal staff processes", True, "one-off", 2),
    ("Employment", "Policies", "Equal Opportunities Policy", "Anti-discrimination statement", True, "one-off", 3),
    ("Employment", "Policies", "Absence & Sickness Policy", "Sick leave procedures", True, "one-off", 3),
    ("Employment", "Staff Records", "Right to Work Check Template", "Passport/visa verification", True, "one-off", 1),
    ("Employment", "Staff Records", "DBS Check Record Template", "Criminal record check tracking", True, "one-off", 1),
    ("Employment", "Staff Records", "Induction Checklist Template", "New starter documentation", True, "one-off", 2),
    ("Employment", "Staff Records", "Training Record Template", "H&S, COSHH, BICSc training log", True, "one-off", 2),
    ("Employment", "Payroll", "Payslip Template", "HMRC-compliant wage slip", True, "one-off", 1),
    ("Employment", "Payroll", "National Minimum Wage Records", "Wage compliance documentation", True, "annual", 2),
    ("Employment", "Payroll", "Pension Auto-Enrolment Records", "Workplace pension evidence", True, "annual", 2),
    # Client Contracts
    ("Client Contracts", None, "Cleaning Services Agreement Template", "Master service contract", True, "one-off", 1),
    ("Client Contracts", None, "Scope of Work Template", "Detailed services specification", True, "one-off", 1),
    ("Client Contracts", None, "Service Level Agreement (SLA) Template", "Performance standards document", True, "one-off", 1),
    ("Client Contracts", None, "Terms & Conditions", "Payment, liability, insurance, termination", True, "one-off", 1),
    ("Client Contracts", None, "Pricing Schedule Template", "Cost breakdown and rates", True, "one-off", 2),
    ("Client Contracts", None, "Contract Variation Form Template", "For agreed changes", True, "one-off", 3),
    # TUPE
    ("TUPE", None, "TUPE Transfer Information Request", "Template to request incumbent data", True, "one-off", 2),
    ("TUPE", None, "TUPE Consultation Records Template", "Employee consultation documentation", True, "one-off", 2),
    ("TUPE", None, "TUPE Transfer Agreement Template", "Formal transfer documentation", True, "one-off", 2),
    ("TUPE", None, "Employee Transfer Letter Template", "Notification to affected staff", True, "one-off", 2),
    # Data Protection
    ("Data Protection", None, "Data Protection Policy (GDPR)", "Company GDPR compliance policy", True, "annual", 1),
    ("Data Protection", None, "Privacy Notice — Employees", "Staff data processing notice", True, "one-off", 2),
    ("Data Protection", None, "Privacy Notice — Clients", "Client data processing notice", True, "one-off", 2),
    ("Data Protection", None, "Data Processing Agreement Template", "For handling client data", True, "one-off", 3),
    # Quality & Audit
    ("Quality & Audit", None, "Quality Inspection Checklist", "Site inspection template", True, "one-off", 2),
    ("Quality & Audit", None, "Client Satisfaction Survey Template", "Feedback collection form", True, "one-off", 3),
    ("Quality & Audit", None, "Non-Conformance Report Template", "Issues and corrective actions", True, "one-off", 3),
    ("Quality & Audit", None, "Internal Audit Checklist", "Annual compliance review template", True, "annual", 2),
    # Waste & Environmental
    ("Waste & Environmental", None, "Waste Carrier License", "If removing waste from client premises", False, "annual", 3),
    ("Waste & Environmental", None, "Environmental Risk Assessment", "Chemical disposal procedures", True, "annual", 3),
    ("Waste & Environmental", None, "Recycling & Sustainability Policy", "Green cleaning practices", False, "one-off", 4),
    # Vehicles
    ("Vehicles & Equipment", None, "Vehicle Insurance Certificates", "For company vehicles", False, "annual", 3),
    ("Vehicles & Equipment", None, "Vehicle MOT Certificates", "Current roadworthiness", False, "annual", 3),
    ("Vehicles & Equipment", None, "Equipment Safety Inspection Log", "Maintenance documentation", True, "quarterly", 3),
]


def _seed_compliance_requirements(conn):
    """Seed the compliance_categories reference table with UK cleaning requirements."""
    for cat, sub, name, desc, req, freq, prio in _COMPLIANCE_DOCS:
        db_pg.execute(conn, """
            INSERT INTO compliance_categories (category, subcategory, doc_name, description, required, renewal_freq, priority)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (category, doc_name) DO NOTHING
        """, (cat, sub, name, desc, req, freq, prio))
