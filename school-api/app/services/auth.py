from __future__ import annotations

"""Authentication: global login, membership picker, tenant-scoped sessions.

Flow: ``login`` verifies the password, then —
- exactly one active membership → tenant token pair, done;
- several → a short-lived select token + membership list; the client calls
  ``select_tenant`` to finish;
- none, but a platform super-admin grant → platform pair (no tenant);
- none → the account has no access yet.

Every issued pair re-validates membership on each request (see
``app.api.deps``) and on every refresh, so revoking a membership or
changing a role takes effect immediately.
"""

import datetime as dt
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import Role, TokenPurpose, UserStatus
from app.core.errors import Expired, Forbidden, InvalidToken, Unauthorized
from app.integrations.email import send_email
from app.models.base import utcnow
from app.models.tenant import Tenant
from app.schemas.auth import MembershipOption
from app.models.user import OneTimeToken, RefreshToken, TenantMembership, User
from app.repositories.users import (
    find_by_email, get_membership, is_platform_admin,
)
from app.security.jwt import create_access_token, create_refresh_token, decode_token
from app.security.password import hash_password, random_token, sha256_hex, validate_password_strength, verify_password
from app.services.audit import Action, log_event

SELECT_TTL = dt.timedelta(minutes=15)


@dataclass
class LoginResult:
    user: User
    access_token: str | None = None
    refresh_token: str | None = None
    memberships: list[MembershipOption] = field(default_factory=list)
    select_token: str | None = None
    requires_selection: bool = False
    can_access_platform: bool = False


def _request_meta(meta: dict | None) -> tuple[str | None, str | None]:
    meta = meta or {}
    return meta.get("ip"), meta.get("user_agent")


def _token_pair(db: Session, user: User, tenant_id: uuid.UUID | None, role: str,
                meta: dict | None) -> tuple[str, str]:
    ip, ua = _request_meta(meta)
    refresh, jti = create_refresh_token(user_id=user.id, tenant_id=tenant_id, role=role)
    access = create_access_token(user_id=user.id, role=role, tenant_id=tenant_id, refresh_jti=jti)
    db.add(RefreshToken(
        user_id=user.id, jti=jti, token_hash=sha256_hex(refresh),
        expires_at=utcnow() + dt.timedelta(days=settings.REFRESH_TOKEN_DAYS),
        ip=ip, user_agent=ua,
    ))
    db.flush()
    return access, refresh


def _membership_summaries(db: Session, user_id: uuid.UUID) -> list[MembershipOption]:
    rows = db.scalars(select(TenantMembership).where(
        TenantMembership.user_id == user_id,
        TenantMembership.status == UserStatus.ACTIVE,
    ).order_by(TenantMembership.created_at)).all()
    out = []
    for m in rows:
        tenant = db.get(Tenant, m.tenant_id)
        out.append(MembershipOption(
            tenant_id=m.tenant_id,
            tenant_slug=tenant.slug if tenant else None,
            tenant_name=tenant.name if tenant else None,
            role=m.role,
        ))
    return out


def _primary_tenant(db: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    """Best-effort tenant for audit rows emitted outside any session
    (password reset, invite accept): prefer an active membership."""
    m = db.scalar(select(TenantMembership).where(
        TenantMembership.user_id == user_id).order_by(
        (TenantMembership.status == UserStatus.ACTIVE).desc(),
        TenantMembership.created_at).limit(1))
    return m.tenant_id if m else None


def resolve_login_user(db: Session, email: str) -> User:
    user = find_by_email(db, email)
    if user is None:
        raise Unauthorized("Invalid email or password.")
    if user.status == UserStatus.DISABLED:
        raise Forbidden("Account is disabled.")
    return user


def login(db: Session, email: str, password: str, meta: dict | None) -> LoginResult:
    user = resolve_login_user(db, email)
    if not user.password_hash or not verify_password(password, user.password_hash):
        raise Unauthorized("Invalid email or password.")
    summaries = _membership_summaries(db, user.id)
    platform = is_platform_admin(db, user.id)
    ip, ua = _request_meta(meta)

    if len(summaries) == 1 and not platform:
        m = summaries[0]
        access, refresh = _token_pair(db, user, m.tenant_id, m.role, meta)
        log_event(db, actor_id=user.id, actor_role=m.role, tenant_id=m.tenant_id,
                  action=Action.LOGIN, resource_type="auth", ip=ip, user_agent=ua)
        return LoginResult(user=user, access_token=access, refresh_token=refresh,
                           memberships=summaries)
    if not summaries and platform and not _has_pending_invite(db, user.id):
        access, refresh = _token_pair(db, user, None, Role.SUPER_ADMIN, meta)
        log_event(db, actor_id=user.id, actor_role=Role.SUPER_ADMIN, tenant_id=None,
                  action=Action.LOGIN, resource_type="auth", ip=ip, user_agent=ua)
        return LoginResult(user=user, access_token=access, refresh_token=refresh,
                           can_access_platform=True)
    if not summaries:
        if _has_pending_invite(db, user.id):
            raise Unauthorized("Invitation has not been accepted yet.")
        raise Unauthorized("This account has no school access yet.")
    select_token = _issue_ott(db, user, TokenPurpose.SELECT, SELECT_TTL)
    log_event(db, actor_id=user.id, actor_role=None, tenant_id=None,
              action=Action.LOGIN, resource_type="auth", ip=ip, user_agent=ua,
              extra={"pending_selection": True, "options": len(summaries)})
    return LoginResult(user=user, memberships=summaries, select_token=select_token,
                       requires_selection=True, can_access_platform=platform)


def _has_pending_invite(db: Session, user_id: uuid.UUID) -> bool:
    return db.scalar(select(TenantMembership.id).where(
        TenantMembership.user_id == user_id,
        TenantMembership.status == UserStatus.INVITED).limit(1)) is not None


def select_tenant(db: Session, select_token: str, tenant_id: uuid.UUID | None,
                  meta: dict | None) -> tuple[User, str, str]:
    """Finish a multi-membership login. ``tenant_id=None`` selects the
    platform session (super-admin grant required)."""
    _, user = _consume_ott(db, select_token, TokenPurpose.SELECT)
    if user.status != UserStatus.ACTIVE:
        raise InvalidToken("Account is no longer active.")
    ip, ua = _request_meta(meta)
    if tenant_id is None:
        if not is_platform_admin(db, user.id):
            raise Forbidden("No platform access.")
        access, refresh = _token_pair(db, user, None, Role.SUPER_ADMIN, meta)
        log_event(db, actor_id=user.id, actor_role=Role.SUPER_ADMIN, tenant_id=None,
                  action=Action.TENANT_SELECTED, resource_type="auth", ip=ip, user_agent=ua,
                  extra={"platform": True})
        return user, access, refresh
    membership = get_membership(db, user.id, tenant_id)
    if membership is None or membership.status != UserStatus.ACTIVE:
        raise Forbidden("No active membership in this school.")
    access, refresh = _token_pair(db, user, tenant_id, membership.role, meta)
    log_event(db, actor_id=user.id, actor_role=membership.role, tenant_id=tenant_id,
              action=Action.TENANT_SELECTED, resource_type="auth", ip=ip, user_agent=ua)
    return user, access, refresh


def refresh(db: Session, refresh_token: str, meta: dict | None) -> tuple[User, str, str]:
    claims = decode_token(refresh_token, expected_type="refresh")
    row = db.scalar(select(RefreshToken).where(RefreshToken.jti == claims.get("jti")))
    if row is None or row.revoked_at is not None or row.expires_at <= utcnow():
        raise InvalidToken("Refresh token is invalid or expired.")
    if row.token_hash != sha256_hex(refresh_token):
        raise InvalidToken("Refresh token mismatch.")
    user = db.get(User, row.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise InvalidToken("Account is no longer active.")
    tenant_id = uuid.UUID(claims["tenant_id"]) if claims.get("tenant_id") else None
    role = claims.get("role", "")
    if tenant_id is not None:
        membership = get_membership(db, user.id, tenant_id)
        if membership is None or membership.status != UserStatus.ACTIVE:
            raise InvalidToken("School access was revoked.")
        if membership.role != role:
            raise InvalidToken("Role changed. Please log in again.")
        role = membership.role
    else:
        if role != Role.SUPER_ADMIN or not is_platform_admin(db, user.id):
            raise InvalidToken("Platform access was revoked.")
    # Rotation: revoke the presented token, issue a fresh pair.
    row.revoked_at = utcnow()
    access, new_refresh = _token_pair(db, user, tenant_id, role, meta)
    return user, access, new_refresh


def logout(db: Session, user: User, tenant_id: uuid.UUID | None, role: str,
           refresh_token: str | None, all_sessions: bool, meta: dict | None) -> int:
    now = utcnow()
    count = 0
    if all_sessions:
        rows = db.scalars(select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))).all()
    elif refresh_token:
        try:
            claims = decode_token(refresh_token, expected_type="refresh")
        except InvalidToken:
            claims = {}
        rows = db.scalars(select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.jti == claims.get("jti", ""),
            RefreshToken.revoked_at.is_(None))).all()
    else:
        rows = []
    for row in rows:
        row.revoked_at = now
        count += 1
    ip, ua = _request_meta(meta)
    log_event(db, actor_id=user.id, actor_role=role, tenant_id=tenant_id,
              action=Action.LOGOUT, resource_type="auth", ip=ip, user_agent=ua,
              extra={"sessions_revoked": count, "all": all_sessions})
    return count


def list_sessions(db: Session, user: User, current_jti: str | None) -> list[dict]:
    rows = db.scalars(select(RefreshToken).where(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None),
        RefreshToken.expires_at > utcnow(),
    ).order_by(RefreshToken.created_at.desc())).all()
    return [{
        "id": r.id, "ip": r.ip, "user_agent": r.user_agent,
        "created_at": r.created_at, "expires_at": r.expires_at,
        "current": current_jti is not None and r.jti == current_jti,
    } for r in rows]


def revoke_session(db: Session, user: User, session_id: uuid.UUID) -> None:
    row = db.scalar(select(RefreshToken).where(RefreshToken.id == session_id, RefreshToken.user_id == user.id))
    if row is None or row.revoked_at is not None:
        from app.core.errors import NotFound
        raise NotFound("Session not found.", resource="session")
    row.revoked_at = utcnow()


def revoke_all_sessions(db: Session, user: User, *, except_jti: str | None = None) -> None:
    rows = db.scalars(select(RefreshToken).where(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))).all()
    for row in rows:
        if except_jti is not None and row.jti == except_jti:
            continue
        row.revoked_at = utcnow()


def change_password(db: Session, user: User, tenant_id: uuid.UUID | None, role: str,
                    current_password: str, new_password: str, current_jti: str | None,
                    meta: dict | None) -> None:
    if not verify_password(current_password, user.password_hash):
        raise Unauthorized("Current password is incorrect.")
    if (err := validate_password_strength(new_password)) is not None:
        from app.core.errors import ValidationFailed
        raise ValidationFailed(err)
    user.password_hash = hash_password(new_password)
    revoke_all_sessions(db, user, except_jti=current_jti)
    ip, ua = _request_meta(meta)
    log_event(db, actor_id=user.id, actor_role=role, tenant_id=tenant_id,
              action=Action.PASSWORD_CHANGED, resource_type="auth", ip=ip, user_agent=ua)


def _issue_ott(db: Session, user: User, purpose: str, ttl: dt.timedelta) -> str:
    # Invalidate previous unused tokens of the same purpose.
    prior = db.scalars(select(OneTimeToken).where(
        OneTimeToken.user_id == user.id, OneTimeToken.purpose == purpose,
        OneTimeToken.used_at.is_(None))).all()
    for row in prior:
        row.used_at = utcnow()
    raw = random_token()
    db.add(OneTimeToken(user_id=user.id, purpose=purpose, token_hash=sha256_hex(raw),
                        expires_at=utcnow() + ttl))
    db.flush()
    return raw


def _consume_ott(db: Session, token: str, purpose: str) -> tuple[OneTimeToken, User]:
    row = db.scalar(select(OneTimeToken).where(OneTimeToken.token_hash == sha256_hex(token)))
    if row is None or row.purpose != purpose:
        raise InvalidToken("Invalid token.")
    if row.used_at is not None:
        raise InvalidToken("Token has already been used.")
    if row.expires_at <= utcnow():
        raise Expired("Token has expired.")
    user = db.get(User, row.user_id)
    if user is None:
        raise InvalidToken("Invalid token.")
    row.used_at = utcnow()
    return row, user


def request_password_reset(db: Session, email: str) -> None:
    """Always succeeds silently to avoid account enumeration."""
    try:
        user = resolve_login_user(db, email)
    except Exception:
        return
    if user.status != UserStatus.ACTIVE:
        return
    raw = _issue_ott(db, user, TokenPurpose.RESET, dt.timedelta(minutes=settings.PASSWORD_RESET_MINUTES))
    link = f"{settings.FRONTEND_URL}/reset-password?token={raw}"
    send_email(user.email, "Reset your SchoolOS password",
               f"Use the following link within {settings.PASSWORD_RESET_MINUTES} minutes:\n{link}\n\nToken: {raw}")


def confirm_password_reset(db: Session, token: str, new_password: str, meta: dict | None) -> None:
    from app.core.errors import ValidationFailed
    if (err := validate_password_strength(new_password)) is not None:
        raise ValidationFailed(err)
    _, user = _consume_ott(db, token, TokenPurpose.RESET)
    user.password_hash = hash_password(new_password)
    revoke_all_sessions(db, user)
    ip, ua = _request_meta(meta)
    log_event(db, actor_id=user.id, actor_role=None, tenant_id=_primary_tenant(db, user.id),
              action=Action.PASSWORD_RESET, resource_type="auth", ip=ip, user_agent=ua)


def request_email_verification(db: Session, email: str) -> None:
    try:
        user = resolve_login_user(db, email)
    except Exception:
        return
    if user.status != UserStatus.ACTIVE or user.email_verified_at is not None:
        return
    raw = _issue_ott(db, user, TokenPurpose.VERIFY, dt.timedelta(hours=settings.EMAIL_VERIFY_HOURS))
    link = f"{settings.FRONTEND_URL}/verify-email?token={raw}"
    send_email(user.email, "Verify your SchoolOS email",
               f"Confirm your email address using this link:\n{link}\n\nToken: {raw}")


def confirm_email_verification(db: Session, token: str, meta: dict | None) -> User:
    _, user = _consume_ott(db, token, TokenPurpose.VERIFY)
    user.email_verified_at = utcnow()
    ip, ua = _request_meta(meta)
    log_event(db, actor_id=user.id, actor_role=None, tenant_id=_primary_tenant(db, user.id),
              action=Action.EMAIL_VERIFIED, resource_type="auth", ip=ip, user_agent=ua)
    return user


def issue_invite(db: Session, user: User) -> str:
    return _issue_ott(db, user, TokenPurpose.INVITE, dt.timedelta(hours=settings.EMAIL_VERIFY_HOURS))


def accept_invite(db: Session, token: str, first_name: str, last_name: str,
                  password: str, meta: dict | None) -> User:
    from app.core.errors import ValidationFailed
    if (err := validate_password_strength(password)) is not None:
        raise ValidationFailed(err)
    _, user = _consume_ott(db, token, TokenPurpose.INVITE)
    if user.status != UserStatus.DISABLED or user.password_hash:
        raise InvalidToken("Invitation is no longer valid.")
    user.first_name = first_name
    user.last_name = last_name
    user.password_hash = hash_password(password)
    user.status = UserStatus.ACTIVE
    user.email_verified_at = utcnow()
    invited = db.scalars(select(TenantMembership).where(
        TenantMembership.user_id == user.id,
        TenantMembership.status == UserStatus.INVITED)).all()
    for m in invited:
        m.status = UserStatus.ACTIVE
    ip, ua = _request_meta(meta)
    log_event(db, actor_id=user.id, actor_role=None, tenant_id=_primary_tenant(db, user.id),
              action=Action.INVITE_ACCEPTED, resource_type="user", resource_id=str(user.id),
              ip=ip, user_agent=ua)
    return user


def is_super_admin_role(role: str) -> bool:
    return role == Role.SUPER_ADMIN


__all__ = ["LoginResult", "SELECT_TTL", "accept_invite", "change_password",
           "confirm_email_verification", "confirm_password_reset", "is_super_admin_role",
           "issue_invite", "list_sessions", "login", "logout", "refresh",
           "request_email_verification", "request_password_reset", "resolve_login_user",
           "revoke_all_sessions", "revoke_session", "select_tenant"]
