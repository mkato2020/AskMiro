"""
auth.py — Google OAuth + session middleware for AskMiro OS
==========================================================
Protects all routes behind Google login. Only whitelisted emails can access.

Config (env vars):
  GOOGLE_CLIENT_ID     — OAuth client ID from Google Cloud Console
  GOOGLE_CLIENT_SECRET — OAuth client secret
  SESSION_SECRET       — Random string for signing session cookies
  AUTH_ALLOWED_EMAILS  — Comma-separated list of allowed emails (or '*' for any Google account)
  AUTH_ENABLED         — Set to 'false' to disable auth entirely (dev mode)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from fastapi import Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() not in ("false", "0", "no")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
SESSION_SECRET = os.getenv("SESSION_SECRET", "askmiro-dev-secret-change-me")
ALLOWED_EMAILS = [
    e.strip().lower()
    for e in os.getenv("AUTH_ALLOWED_EMAILS", "*").split(",")
    if e.strip()
]
SESSION_COOKIE = "askmiro_session"
SESSION_MAX_AGE = 86400 * 7  # 7 days

# Paths that don't require auth
PUBLIC_PATHS = {
    "/api/health",
    "/api/webhook/lead",
    "/api/webhook/gas-status",
    "/api/public/join-team",
    "/auth/login",
    "/auth/callback",
    "/auth/status",
}
PUBLIC_PREFIXES = ("/assets/", "/favicon", "/icons")


def _is_public(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    for p in PUBLIC_PREFIXES:
        if path.startswith(p):
            return True
    return False


# ── Session helpers (signed cookie) ──────────────────────────────────────────

def _sign(data: dict) -> str:
    """Create a signed session token."""
    from itsdangerous import URLSafeTimedSerializer
    s = URLSafeTimedSerializer(SESSION_SECRET)
    return s.dumps(data)


def _unsign(token: str) -> Optional[dict]:
    """Verify and decode a session token."""
    from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
    s = URLSafeTimedSerializer(SESSION_SECRET)
    try:
        return s.loads(token, max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def get_session(request: Request) -> Optional[dict]:
    """Extract session data from the request cookie."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return _unsign(token)


def set_session(response: Response, data: dict) -> Response:
    """Set session cookie on a response."""
    token = _sign(data)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=os.getenv("RENDER", "") != "",  # secure in production
    )
    return response


def clear_session(response: Response) -> Response:
    response.delete_cookie(SESSION_COOKIE)
    return response


# ── OAuth flow routes ────────────────────────────────────────────────────────

def register_auth_routes(app):
    """Register /auth/* routes on the FastAPI app."""

    @app.get("/auth/login")
    def auth_login(request: Request):
        """Redirect to Google OAuth consent screen."""
        if not AUTH_ENABLED or not GOOGLE_CLIENT_ID:
            return RedirectResponse("/")

        from authlib.integrations.starlette_client import OAuth
        oauth = OAuth()
        oauth.register(
            name="google",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
        # Build callback URL
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("host", request.url.netloc)
        redirect_uri = f"{scheme}://{host}/auth/callback"
        return oauth.google.authorize_redirect(request, redirect_uri)

    @app.get("/auth/callback")
    async def auth_callback(request: Request):
        """Handle Google OAuth callback."""
        if not AUTH_ENABLED or not GOOGLE_CLIENT_ID:
            return RedirectResponse("/")

        from authlib.integrations.starlette_client import OAuth
        oauth = OAuth()
        oauth.register(
            name="google",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

        try:
            token = await oauth.google.authorize_access_token(request)
            user_info = token.get("userinfo")
            if not user_info:
                user_info = await oauth.google.userinfo(token=token)
        except Exception as exc:
            logger.error("OAuth callback failed: %s", exc)
            return JSONResponse({"error": "Authentication failed"}, status_code=401)

        email = (user_info.get("email") or "").lower()
        name = user_info.get("name", email)
        picture = user_info.get("picture", "")

        # Check allowed emails
        if "*" not in ALLOWED_EMAILS and email not in ALLOWED_EMAILS:
            logger.warning("Auth: rejected login from %s", email)
            return JSONResponse(
                {"error": f"Access denied for {email}. Contact admin."},
                status_code=403,
            )

        logger.info("Auth: %s (%s) logged in", name, email)

        response = RedirectResponse("/")
        set_session(response, {"email": email, "name": name, "picture": picture})
        return response

    @app.get("/auth/status")
    def auth_status(request: Request):
        """Check current auth state — used by frontend."""
        if not AUTH_ENABLED:
            return {"authenticated": True, "auth_required": False, "user": {"email": "dev@local", "name": "Dev Mode"}}

        session = get_session(request)
        if session:
            return {"authenticated": True, "auth_required": True, "user": session}
        return {"authenticated": False, "auth_required": bool(GOOGLE_CLIENT_ID)}

    @app.get("/auth/logout")
    def auth_logout():
        """Clear session and redirect to login."""
        response = RedirectResponse("/auth/login")
        clear_session(response)
        return response


# ── Middleware ────────────────────────────────────────────────────────────────

class AuthMiddleware(BaseHTTPMiddleware):
    """Block unauthenticated requests to non-public paths."""

    async def dispatch(self, request: Request, call_next):
        if not AUTH_ENABLED or not GOOGLE_CLIENT_ID:
            return await call_next(request)

        path = request.url.path

        if _is_public(path):
            return await call_next(request)

        session = get_session(request)
        if session:
            return await call_next(request)

        # API calls get 401, browser requests get redirected
        if path.startswith("/api/"):
            return JSONResponse({"error": "Not authenticated"}, status_code=401)

        return RedirectResponse("/auth/login")
