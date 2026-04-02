"""
db_compat.py — Postgres compatibility layer for AskMiro OS
===========================================================
Wraps psycopg2 to behave identically to the SQLite db_connection():
  - Accepts ? placeholders (auto-converted to %s)
  - Returns dicts (RealDictCursor)
  - Same contextmanager API

Usage: identical to database.py db_connection() — just swap the import.
"""
from __future__ import annotations

import os
import re
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from urllib.parse import urlparse

import psycopg2
import psycopg2.extras


def _pg_connect(dsn: str, **kwargs):
    """Connect to Postgres, parsing URI into keyword args for compatibility."""
    if dsn.startswith("postgresql://") or dsn.startswith("postgres://"):
        p = urlparse(dsn)
        return psycopg2.connect(
            dbname=p.path.lstrip("/"),
            user=p.username,
            password=p.password,
            host=p.hostname,
            port=p.port or 5432,
            **kwargs,
        )
    return psycopg2.connect(dsn, **kwargs)


def _get_dsn() -> str:
    """Resolve DATABASE_URL → psycopg2 DSN. Handles Render/Supabase URLs."""
    url = os.getenv("DATABASE_URL", "").strip()
    # Render/Supabase give postgres:// — psycopg2 needs postgresql://
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def _convert_placeholders(sql: str) -> str:
    """Convert SQLite ? placeholders to Postgres %s."""
    return re.sub(r'\?', '%s', sql)


def _normalize_sql(sql: str) -> str:
    """Translate SQLite-specific DDL/DML to Postgres equivalents."""
    # AUTOINCREMENT primary key
    sql = re.sub(
        r'INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT',
        'SERIAL PRIMARY KEY',
        sql,
        flags=re.IGNORECASE,
    )
    # datetime('now') — SQLite timestamp function → Postgres NOW()
    # Handles both plain  datetime('now')  and wrapped  (datetime('now'))
    sql = re.sub(r"\(datetime\('now'\)\)", "NOW()", sql, flags=re.IGNORECASE)
    sql = re.sub(r"datetime\('now'\)", "NOW()", sql, flags=re.IGNORECASE)
    # INSERT OR IGNORE → INSERT … ON CONFLICT DO NOTHING
    if re.search(r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', sql, flags=re.IGNORECASE):
        sql = re.sub(r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', 'INSERT INTO', sql, flags=re.IGNORECASE)
        if not re.search(r'\bON\s+CONFLICT\b', sql, flags=re.IGNORECASE):
            sql = sql.rstrip().rstrip(';') + ' ON CONFLICT DO NOTHING'
    return sql


class _PgCursor:
    """Thin wrapper around psycopg2 cursor — mirrors sqlite3.Cursor API used in database.py."""

    def __init__(self, cursor):
        self._cur = cursor
        self.lastrowid: Optional[int] = None
        self.rowcount: int = 0

    def execute(self, sql: str, params=()):
        self._cur.execute(_convert_placeholders(_normalize_sql(sql)), params)
        self.rowcount = self._cur.rowcount
        if self._cur.description is None:
            self.lastrowid = getattr(self._cur, 'lastrowid', None)
            # For INSERT … RETURNING id
        return self

    def executemany(self, sql: str, param_list):
        self._cur.executemany(_convert_placeholders(_normalize_sql(sql)), param_list)
        self.rowcount = self._cur.rowcount
        return self

    def fetchone(self) -> Optional[dict]:
        row = self._cur.fetchone()
        return dict(row) if row else None

    def fetchall(self) -> list[dict]:
        rows = self._cur.fetchall()
        return [dict(r) for r in rows]

    def __iter__(self):
        for row in self._cur:
            yield dict(row)

    @property
    def description(self):
        return self._cur.description


class _PgConn:
    """Thin wrapper around psycopg2 connection — mirrors sqlite3.Connection API."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql: str, params=()):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        wrapped = _PgCursor(cur)
        wrapped.execute(sql, params)
        return wrapped

    def executemany(self, sql: str, param_list):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        wrapped = _PgCursor(cur)
        wrapped.executemany(sql, param_list)
        return wrapped

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def cursor(self):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return _PgCursor(cur)


@contextmanager
def pg_connection() -> Iterator[_PgConn]:
    """
    Drop-in replacement for database.db_connection().
    Yields a _PgConn that accepts ? placeholders and returns dicts.
    Auto-commits on success, rolls back on error.
    """
    dsn = _get_dsn()
    conn = _pg_connect(dsn)
    conn.autocommit = False
    wrapped = _PgConn(conn)
    try:
        yield wrapped
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def is_postgres_available() -> bool:
    """Check if DATABASE_URL is set and Postgres is reachable."""
    try:
        dsn = _get_dsn()
        if not dsn:
            return False
        conn = _pg_connect(dsn, connect_timeout=3)
        conn.close()
        return True
    except Exception:
        return False
