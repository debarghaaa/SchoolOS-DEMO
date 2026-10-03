from __future__ import annotations

"""Supabase presence-feed sessions for the school-os overview islands.

Browsers cannot be trusted to assert their own role/tenant, so the islands
never talk to Supabase anonymously: they exchange the validated FastAPI
session here for a GoTrue access token whose ``app_metadata`` carries the
claims RLS enforces (``tenant_id``, ``role``, ``classes``). The Supabase
users are shadow accounts — the human authenticates only via FastAPI, and
each exchange rotates a random password the human never sees.

Effective feed role follows the broadest applicable role (a teacher with a
school-admin grant reads as an admin); teacher sessions additionally carry
their assigned class labels so RLS can scope the student feed.
"""

import secrets

import httpx
from sqlalchemy import select

from app.api.deps import RequestContext
from app.core.config import settings
from app.core.errors import Forbidden, NotSupported, UpstreamError
from app.models import ClassMember, SchoolClass, Teacher

# Broadest first: the feed role is the first of these the session holds.
_ROLE_PRIORITY = ("school-admin", "teacher", "parent", "student")

_GOTRUE_TIMEOUT = 10.0


def feed_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY)


def effective_feed_role(roles: frozenset[str]) -> str:
    for role in _ROLE_PRIORITY:
        if role in roles:
            return role
    raise Forbidden("No tenant role available for the presence feed.")


def teacher_class_labels(ctx: RequestContext) -> list[str]:
    """Labels like ``Grade 10-A`` matching the feed's class convention."""
    teacher_id = ctx.db.scalar(select(Teacher.id).where(
        Teacher.tenant_id == ctx.tenant_id, Teacher.user_id == ctx.user.id,
        Teacher.deleted_at.is_(None)))
    if teacher_id is None:
        return []
    rows = ctx.db.execute(select(SchoolClass.grade_level, SchoolClass.section)
                          .join(ClassMember, ClassMember.class_id == SchoolClass.id)
                          .where(ClassMember.teacher_id == teacher_id,
                                 SchoolClass.tenant_id == ctx.tenant_id,
                                 SchoolClass.deleted_at.is_(None))).all()
    return sorted({f"{grade}-{section}" for grade, section in rows})


def feed_claims(ctx: RequestContext) -> dict:
    if ctx.tenant_id is None:
        raise Forbidden("Platform sessions cannot open the tenant presence feed.")
    roles = ctx.roles or frozenset({ctx.role})
    role = effective_feed_role(roles)
    return {
        "tenant_id": str(ctx.tenant_id),
        "role": role,
        "classes": teacher_class_labels(ctx) if role == "teacher" else [],
    }


def _admin_headers() -> dict[str, str]:
    key = settings.SUPABASE_SERVICE_KEY or ""
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _ensure_user(client: httpx.Client, email: str, password: str, claims: dict) -> str:
    """Create-or-refresh the shadow GoTrue user; returns its id."""
    base = (settings.SUPABASE_URL or "").rstrip("/")
    try:
        listing = client.get(f"{base}/auth/v1/admin/users",
                             params={"page": 1, "per_page": 1000}, headers=_admin_headers())
        listing.raise_for_status()
        found = next((u for u in listing.json().get("users", [])
                      if str(u.get("email", "")).lower() == email.lower()), None)
        payload = {"password": password, "email_confirm": True, "app_metadata": claims}
        if found is None:
            created = client.post(f"{base}/auth/v1/admin/users",
                                  json={"email": email, **payload}, headers=_admin_headers())
            created.raise_for_status()
            return str(created.json()["id"])
        updated = client.put(f"{base}/auth/v1/admin/users/{found['id']}",
                             json=payload, headers=_admin_headers())
        updated.raise_for_status()
        return str(found["id"])
    except (httpx.HTTPError, KeyError) as exc:
        raise UpstreamError(f"Supabase user sync failed: {exc}") from exc


def _password_grant(client: httpx.Client, email: str, password: str) -> dict:
    base = (settings.SUPABASE_URL or "").rstrip("/")
    try:
        resp = client.post(f"{base}/auth/v1/token?grant_type=password",
                           json={"email": email, "password": password},
                           headers={"apikey": settings.SUPABASE_SERVICE_KEY or ""})
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        raise UpstreamError(f"Supabase sign-in failed: {exc}") from exc


def mint_feed_token(ctx: RequestContext, client: httpx.Client | None = None) -> dict:
    """Exchange the FastAPI session for a Supabase feed session."""
    if not feed_configured():
        raise NotSupported("Supabase presence feed is not configured.")
    claims = feed_claims(ctx)
    password = secrets.token_urlsafe(32)
    owned = client is None
    client = client or httpx.Client(timeout=_GOTRUE_TIMEOUT)
    try:
        user_id = _ensure_user(client, ctx.user.email, password, claims)
        tokens = _password_grant(client, ctx.user.email, password)
    finally:
        if owned:
            client.close()
    return {
        "access_token": tokens["access_token"],
        "token_type": tokens.get("token_type", "bearer"),
        "expires_in": int(tokens.get("expires_in", 3600)),
        "supabase_user_id": user_id,
    }
