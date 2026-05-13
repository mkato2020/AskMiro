"""
migrations/runner.py — Controlled Migration Runner
====================================================
Single, audited path for schema changes. No raw psql, no Railway SQL pad.

USAGE:
  python -m migrations.runner list                   # list all migrations + status
  python -m migrations.runner status 010             # show details of one migration
  python -m migrations.runner up 010 --dry-run       # print the SQL that would run
  python -m migrations.runner up 010 --confirm       # apply migration 010
  python -m migrations.runner down 010 --confirm     # revert migration 010
  python -m migrations.runner verify                 # checksum-verify all applied migrations

ALSO REACHABLE VIA:
  POST /api/admin/migrations/run    body: { version: 10, dry_run: true|false }
  GET  /api/admin/migrations/list

RULES:
  - Each migration is wrapped in a single transaction.
  - Already-applied migrations are refused.
  - Modified-after-apply migrations are refused (checksum drift).
  - Down-migrations require a matching `NNN_<name>.down.sql` file.
  - Migration #0 (schema_migrations table itself) bootstraps automatically.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Allow running as `python migrations/runner.py` or `python -m migrations.runner`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db_pg

logger = logging.getLogger("migrations")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

MIGRATIONS_DIR = Path(__file__).resolve().parent
_VERSION_RE = re.compile(r"^(\d{3})_([a-z0-9_]+)\.sql$")
_DOWN_RE    = re.compile(r"^(\d{3})_([a-z0-9_]+)\.down\.sql$")

# ── Bootstrap: schema_migrations table ─────────────────────────────────────────
_BOOTSTRAP_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by  TEXT NOT NULL DEFAULT 'system',
    notes       TEXT
);
"""


# ══════════════════════════════════════════════════════════════════════════════
# File discovery + checksums
# ══════════════════════════════════════════════════════════════════════════════

def _discover_migrations() -> dict[int, dict]:
    """
    Find all NNN_name.sql files (and matching down files).
    Returns { version: { name, up_path, down_path, checksum } }.
    """
    out: dict[int, dict] = {}
    for f in sorted(MIGRATIONS_DIR.glob("*.sql")):
        m = _VERSION_RE.match(f.name)
        if not m:
            continue
        version = int(m.group(1))
        name = m.group(2)
        down = MIGRATIONS_DIR / f"{m.group(1)}_{name}.down.sql"
        out[version] = {
            "version":   version,
            "name":      name,
            "up_path":   f,
            "down_path": down if down.exists() else None,
            "checksum":  _checksum(f),
        }
    return out


def _checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ══════════════════════════════════════════════════════════════════════════════
# State queries
# ══════════════════════════════════════════════════════════════════════════════

def _ensure_bootstrap(conn) -> None:
    db_pg.execute(conn, _BOOTSTRAP_SQL)


def _applied_migrations(conn) -> dict[int, dict]:
    rows = db_pg.fetchall(conn, """
        SELECT version, name, checksum, applied_at, applied_by
        FROM schema_migrations
        ORDER BY version
    """)
    return {r["version"]: dict(r) for r in rows}


# ══════════════════════════════════════════════════════════════════════════════
# Commands
# ══════════════════════════════════════════════════════════════════════════════

def list_migrations() -> list[dict]:
    """List all migrations and their applied/pending/drift status."""
    discovered = _discover_migrations()
    with db_pg.transaction() as conn:
        _ensure_bootstrap(conn)
        applied = _applied_migrations(conn)

    out = []
    all_versions = sorted(set(discovered) | set(applied))
    for v in all_versions:
        disc = discovered.get(v)
        app  = applied.get(v)

        if disc and app:
            if disc["checksum"] == app["checksum"]:
                status = "APPLIED"
            else:
                status = "DRIFT"
        elif disc and not app:
            status = "PENDING"
        elif app and not disc:
            status = "ORPHAN"
        else:
            status = "UNKNOWN"

        out.append({
            "version":    v,
            "name":       (disc or app)["name"],
            "status":     status,
            "applied_at": app["applied_at"].isoformat() if app else None,
            "applied_by": app["applied_by"] if app else None,
            "has_down":   bool(disc and disc.get("down_path")),
        })
    return out


def status(version: int) -> dict:
    """Detailed status of a single migration."""
    discovered = _discover_migrations()
    if version not in discovered:
        raise ValueError(f"Migration {version:03d} not found in {MIGRATIONS_DIR}")
    d = discovered[version]
    with db_pg.transaction() as conn:
        _ensure_bootstrap(conn)
        applied = _applied_migrations(conn).get(version)

    return {
        "version":           d["version"],
        "name":              d["name"],
        "up_path":           str(d["up_path"]),
        "down_path":         str(d["down_path"]) if d["down_path"] else None,
        "checksum":          d["checksum"],
        "applied":           applied is not None,
        "applied_checksum":  applied["checksum"]  if applied else None,
        "applied_at":        applied["applied_at"].isoformat() if applied else None,
        "applied_by":        applied["applied_by"] if applied else None,
        "drift":             applied is not None and applied["checksum"] != d["checksum"],
        "sql_preview":       d["up_path"].read_text()[:400],
    }


def up(
    version: int,
    actor: str = "cli",
    dry_run: bool = False,
    confirm: bool = False,
) -> dict:
    """Apply a single migration."""
    discovered = _discover_migrations()
    if version not in discovered:
        raise ValueError(f"Migration {version:03d} not found")
    d = discovered[version]

    with db_pg.transaction() as conn:
        _ensure_bootstrap(conn)
        applied = _applied_migrations(conn)

        if version in applied:
            if applied[version]["checksum"] == d["checksum"]:
                return {
                    "ok":       True,
                    "version":  version,
                    "action":   "skipped",
                    "reason":   "already_applied",
                    "applied_at": applied[version]["applied_at"].isoformat(),
                }
            return {
                "ok":     False,
                "error":  "checksum_drift",
                "applied_checksum": applied[version]["checksum"],
                "file_checksum":    d["checksum"],
                "remedy": "Create a new migration number — do not modify applied migrations.",
            }

        sql = d["up_path"].read_text()
        statement_count = len([s for s in sql.split(";") if s.strip()])

        if dry_run:
            return {
                "ok":              True,
                "version":         version,
                "action":          "dry_run",
                "statements":      statement_count,
                "file":            str(d["up_path"]),
                "sql_preview":     sql[:1200],
            }

        if not confirm:
            return {
                "ok":     False,
                "error":  "confirmation_required",
                "remedy": "Pass --confirm (CLI) or {\"confirm\": true} (API) to apply.",
            }

        logger.info("Applying migration %03d_%s (%d statements)…",
                    version, d["name"], statement_count)

        # Apply: wrap in our own savepoint-style block (the outer db_pg.transaction
        # already provides a transaction)
        try:
            db_pg.execute(conn, sql)
            db_pg.execute(conn, """
                INSERT INTO schema_migrations (version, name, checksum, applied_by)
                VALUES (%s, %s, %s, %s)
            """, (version, d["name"], d["checksum"], actor))
        except Exception as exc:
            # The outer transaction will rollback automatically on exception
            logger.error("Migration %03d FAILED: %s", version, exc)
            raise

    logger.info("Migration %03d_%s applied successfully.", version, d["name"])
    return {
        "ok":         True,
        "version":    version,
        "action":     "applied",
        "name":       d["name"],
        "statements": statement_count,
        "actor":      actor,
    }


def down(
    version: int,
    actor: str = "cli",
    dry_run: bool = False,
    confirm: bool = False,
) -> dict:
    """Revert a single migration."""
    discovered = _discover_migrations()
    if version not in discovered:
        raise ValueError(f"Migration {version:03d} not found")
    d = discovered[version]
    if not d["down_path"]:
        return {
            "ok":     False,
            "error":  "no_down_migration",
            "remedy": f"Create {version:03d}_{d['name']}.down.sql before reverting.",
        }

    with db_pg.transaction() as conn:
        _ensure_bootstrap(conn)
        applied = _applied_migrations(conn)
        if version not in applied:
            return {"ok": True, "version": version, "action": "skipped",
                    "reason": "not_applied"}

        sql = d["down_path"].read_text()

        if dry_run:
            return {"ok": True, "version": version, "action": "dry_run_down",
                    "sql_preview": sql[:1200]}

        if not confirm:
            return {"ok": False, "error": "confirmation_required"}

        logger.warning("Reverting migration %03d_%s…", version, d["name"])
        db_pg.execute(conn, sql)
        # The down SQL should DELETE its own row from schema_migrations, but as a
        # safety net we delete here too (idempotent — no error if already gone)
        db_pg.execute(conn, "DELETE FROM schema_migrations WHERE version = %s", (version,))

    return {"ok": True, "version": version, "action": "reverted", "actor": actor}


def verify() -> dict:
    """Verify checksums of all applied migrations against their files."""
    discovered = _discover_migrations()
    with db_pg.transaction() as conn:
        _ensure_bootstrap(conn)
        applied = _applied_migrations(conn)

    issues = []
    for v, app in applied.items():
        d = discovered.get(v)
        if not d:
            issues.append({"version": v, "issue": "applied_but_file_missing"})
            continue
        if d["checksum"] != app["checksum"]:
            issues.append({"version": v, "issue": "checksum_drift",
                           "expected": app["checksum"],
                           "actual":   d["checksum"]})

    return {"ok": len(issues) == 0, "applied_count": len(applied), "issues": issues}


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def _print_list(rows: list[dict]) -> None:
    print("\n  VER  NAME                          STATUS    APPLIED_AT             ACTOR")
    print("  ───  ────────────────────────────  ────────  ─────────────────────  ──────────")
    for r in rows:
        ver = f"{r['version']:03d}"
        name = r["name"][:28].ljust(28)
        status = r["status"].ljust(8)
        applied = (r["applied_at"] or "—")[:19].ljust(19)
        actor = r["applied_by"] or "—"
        marker = "  " if r["has_down"] else " ⚠"  # warn if no down migration
        print(f"  {ver}  {name}  {status}  {applied}    {actor}{marker}")
    print("\n  ⚠ = no down-migration file present\n")


def _main():
    p = argparse.ArgumentParser(prog="migrate", description="AskMiro migration runner")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="List all migrations")

    s = sub.add_parser("status", help="Show migration details")
    s.add_argument("version", type=int)

    u = sub.add_parser("up", help="Apply migration")
    u.add_argument("version", type=int)
    u.add_argument("--dry-run", action="store_true")
    u.add_argument("--confirm", action="store_true")
    u.add_argument("--actor",   default=os.getenv("USER", "cli"))

    dn = sub.add_parser("down", help="Revert migration")
    dn.add_argument("version", type=int)
    dn.add_argument("--dry-run", action="store_true")
    dn.add_argument("--confirm", action="store_true")
    dn.add_argument("--actor",   default=os.getenv("USER", "cli"))

    sub.add_parser("verify", help="Verify checksums of applied migrations")

    args = p.parse_args()

    if args.cmd == "list":
        _print_list(list_migrations())
    elif args.cmd == "status":
        import json
        print(json.dumps(status(args.version), indent=2, default=str))
    elif args.cmd == "up":
        import json
        res = up(args.version, actor=args.actor,
                 dry_run=args.dry_run, confirm=args.confirm)
        print(json.dumps(res, indent=2, default=str))
        sys.exit(0 if res.get("ok") else 1)
    elif args.cmd == "down":
        import json
        res = down(args.version, actor=args.actor,
                   dry_run=args.dry_run, confirm=args.confirm)
        print(json.dumps(res, indent=2, default=str))
        sys.exit(0 if res.get("ok") else 1)
    elif args.cmd == "verify":
        import json
        res = verify()
        print(json.dumps(res, indent=2, default=str))
        sys.exit(0 if res.get("ok") else 1)


if __name__ == "__main__":
    _main()
