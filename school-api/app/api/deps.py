from __future__ import annotations

import uuid
from collections.abc import Generator
from dataclasses import dataclass

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.constants import Role
from app.core.db import SessionLocal, service_session, set_rls
from app.core.errors import Forbidden, TenantMismatch, TenantRequired, Unauthorized
from app.models.user import User
from app.repositories.users import effective_roles, get_membership
from app.security.jwt import decode_token
from app.security.rbac import has_permission

bearer = HTTPBearer(auto_error=False)

PLATFORM_PERMISSIONS = {"tenants.manage", "subscriptions.manage", "platform.manage", "audit.read_all"}


@dataclass
class RequestContext:
    """Authenticated request: tenant, user and role resolved from the session.

    Never from client parameters. ``tenant_id`` is None only for platform
    (super-admin) sessions. ``roles`` is the effective set: the session's
    primary role plus extra grants; permission checks pass when ANY role
    grants the permission, while tenant scoping still applies per endpoint.
    """

    db: Session
    user: User
    tenant_id: uuid.UUID | None
    role: str
    ip: str | None
    user_agent: str | None
    request_id: str
    roles: frozenset[str] = frozenset()
    access_jti: str | None = None
    refresh_jti: str | None = None


def _request_meta(request: Request) -> tuple[str | None, str | None, str]:
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    return ip, request.headers.get("User-Agent"), request.headers.get("X-Request-ID", "-")


def get_service_db():
    """Session for public flows (login, token verification). RLS is bypassed
    here because no tenant is known yet; the auth service scopes explicitly."""
    db = SessionLocal()
    try:
        set_rls(db, None, bypass=True)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _validate_session(claims: dict) -> tuple[User, uuid.UUID | None, str, frozenset[str]]:
    """Re-validate the session against live data. Any mismatch fails closed:
    deleted/disabled users, revoked memberships and changed roles all force a
    fresh login instead of serving a stale token."""
    try:
        user_id = uuid.UUID(claims.get("sub", ""))
    except ValueError:
        raise Unauthorized("Invalid session.")
    claimed_role = claims.get("role", "")
    raw_tenant = claims.get("tenant_id")
    try:
        claimed_tenant = uuid.UUID(raw_tenant) if raw_tenant else None
    except ValueError:
        raise TenantMismatch()
    with service_session() as sdb:
        set_rls(sdb, None, bypass=True)
        user = sdb.get(User, user_id)
        if user is None:
            raise Unauthorized("Account no longer exists.")
        if user.status != "active":
            raise Forbidden("Account is disabled.")
        if claimed_tenant is not None:
            membership = get_membership(sdb, user.id, claimed_tenant)
            if membership is None:
                raise TenantMismatch()
            if membership.status != "active":
                raise Forbidden("School access is disabled.")
            if membership.role != claimed_role:
                raise Unauthorized("Role changed. Please log in again.")
        else:
            if claimed_role != Role.SUPER_ADMIN:
                raise Unauthorized("Invalid session.")
            from app.repositories.users import is_platform_admin
            if not is_platform_admin(sdb, user.id):
                raise Forbidden("Platform access was revoked.")
        roles = frozenset(effective_roles(sdb, user, claimed_tenant, claimed_role))
        # Detach a snapshot; the live row is re-loaded in the request session.
        sdb.expunge(user)
        return user, claimed_tenant, claimed_role, roles


def get_request_context(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> Generator[RequestContext, None, None]:
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise Unauthorized("Missing bearer token.")
    claims = decode_token(creds.credentials, expected_type="access")
    snapshot, tenant_id, role, roles = _validate_session(claims)

    db = SessionLocal()
    try:
        set_rls(db, tenant_id, bypass=(tenant_id is None and role == Role.SUPER_ADMIN))
        user = db.get(User, snapshot.id)
        if user is None:  # pragma: no cover - deleted mid-request
            raise Unauthorized("Account no longer exists.")
        ip, ua, rid = _request_meta(request)
        ctx = RequestContext(db=db, user=user, tenant_id=tenant_id, role=role,
                             ip=ip, user_agent=ua, request_id=rid, roles=roles,
                             access_jti=claims.get("jti"), refresh_jti=claims.get("rid"))
        yield ctx
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _granted(ctx: RequestContext, permission: str) -> bool:
    return any(has_permission(role, permission) for role in ctx.roles)


def require_roles(*roles: str):
    def dep(ctx: RequestContext = Depends(get_request_context)) -> RequestContext:
        if not (set(roles) & set(ctx.roles)):
            raise Forbidden("Your role cannot access this endpoint.", resource="role")
        return ctx

    return dep


def _check_tenant_scope(permission: str, ctx: RequestContext) -> None:
    if permission in PLATFORM_PERMISSIONS:
        # Platform endpoints need a platform session: tenant sessions never
        # manage the platform, even when the user holds a platform grant.
        if ctx.tenant_id is not None or Role.SUPER_ADMIN not in ctx.roles:
            raise Forbidden("Platform endpoints require a super-admin.", resource=permission)
    elif ctx.tenant_id is None:
        # Super-admins stay out of tenant rows: aggregates only, per contract.
        raise TenantRequired()


def require_perm(permission: str):
    def dep(ctx: RequestContext = Depends(get_request_context)) -> RequestContext:
        if not _granted(ctx, permission):
            raise Forbidden(f"Missing permission: {permission}.", resource=permission)
        _check_tenant_scope(permission, ctx)
        return ctx

    return dep


def require_any(*permissions: str):
    def dep(ctx: RequestContext = Depends(get_request_context)) -> RequestContext:
        granted = [p for p in permissions if _granted(ctx, p)]
        if not granted:
            raise Forbidden(f"Missing one of: {', '.join(permissions)}.", resource="permission")
        # Tenant scope follows the granted permission actually used.
        for perm in granted:
            try:
                _check_tenant_scope(perm, ctx)
                return ctx
            except TenantRequired:
                continue
        raise TenantRequired()

    return dep
