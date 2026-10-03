from __future__ import annotations

"""Tenant user administration. Users are global; everything here manages the
(tentant, user) membership plus the global profile columns."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, or_, select

from app.core.config import settings
from app.core.constants import Role, UserStatus
from app.core.errors import Duplicate, Forbidden, NotFound, ValidationFailed
from app.integrations.email import send_email
from app.models.user import Role as RoleRow, TenantMembership, User, UserRole
from app.repositories.users import find_by_email
from app.security.password import hash_password, validate_password_strength
from app.services.audit import Action, log_ctx
from app.services.auth import issue_invite

if TYPE_CHECKING:
    from app.api.deps import RequestContext
    from app.schemas.users import InviteCreate, UserCreate, UserUpdate

TENANT_ROLES = (Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT, Role.PARENT)
MEMBERSHIP_STATUSES = (UserStatus.ACTIVE, UserStatus.DISABLED, UserStatus.INVITED)


def to_read(user: User, membership: TenantMembership | None) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "status": user.status,
        "email_verified_at": user.email_verified_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": membership.role if membership else None,
        "membership_status": membership.status if membership else None,
    }


def list_users(ctx: RequestContext, *, page: int, size: int, role: str | None,
               status: str | None, q: str | None):
    stmt = (select(User, TenantMembership)
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .where(TenantMembership.tenant_id == ctx.tenant_id))
    if role:
        stmt = stmt.where(TenantMembership.role == role)
    if status:
        stmt = stmt.where(TenantMembership.status == status)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(like),
                             func.lower(User.first_name).like(like),
                             func.lower(User.last_name).like(like)))
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(ctx.db.execute(stmt.order_by(User.created_at.desc())
                               .offset((page - 1) * size).limit(size)).all())
    return [to_read(u, m) for u, m in rows], total


def get_user(ctx: RequestContext, user_id: uuid.UUID) -> tuple[User, TenantMembership]:
    row = ctx.db.execute(select(User, TenantMembership)
                         .join(TenantMembership, TenantMembership.user_id == User.id)
                         .where(User.id == user_id,
                                TenantMembership.tenant_id == ctx.tenant_id)).first()
    if row is None:
        raise NotFound("User not found.", resource="user")
    return row[0], row[1]


def _check_role(role: str) -> None:
    if role not in TENANT_ROLES:
        raise ValidationFailed(f"Role must be one of: {', '.join(TENANT_ROLES)}.")


def create_user(ctx: RequestContext, data: UserCreate) -> tuple[dict, str | None]:
    _check_role(data.role)
    email = data.email.lower()
    existing = find_by_email(ctx.db, email)
    invite_token = None

    if existing is not None:
        user = existing
        prior = ctx.db.scalar(select(TenantMembership).where(
            TenantMembership.user_id == user.id,
            TenantMembership.tenant_id == ctx.tenant_id))
        if prior is not None:
            raise Duplicate("A user with this email already exists in this school.")
        # An existing account joins immediately: it already has credentials.
        membership = TenantMembership(tenant_id=ctx.tenant_id, user_id=user.id,
                                      role=data.role, status=UserStatus.ACTIVE)
        ctx.db.add(membership)
        ctx.db.flush()
        send_email(email, "You were added to a school on SchoolOS",
                   f"{user.full_name}, you have been added as {data.role}.\n"
                   f"Log in to access the school.")
        log_ctx(ctx, action=Action.MEMBERSHIP_CHANGED, resource_type="user",
                resource_id=user.id, extra={"role": data.role, "existing": True})
    elif data.send_invite or not data.password:
        user = User(email=email, first_name=data.first_name, last_name=data.last_name,
                    password_hash="", status=UserStatus.DISABLED)
        ctx.db.add(user)
        ctx.db.flush()
        membership = TenantMembership(tenant_id=ctx.tenant_id, user_id=user.id,
                                      role=data.role, status=UserStatus.INVITED)
        ctx.db.add(membership)
        ctx.db.flush()
        invite_token = issue_invite(ctx.db, user)
        link = f"{settings.FRONTEND_URL}/accept-invite?token={invite_token}"
        send_email(email, "You are invited to SchoolOS",
                   f"{user.full_name}, you have been invited as {data.role}.\nAccept here:\n{link}\n\nToken: {invite_token}")
        log_ctx(ctx, action=Action.INVITE_CREATED, resource_type="user",
                resource_id=user.id, extra={"role": data.role})
    else:
        if (err := validate_password_strength(data.password)) is not None:
            raise ValidationFailed(err)
        user = User(email=email, first_name=data.first_name, last_name=data.last_name,
                    password_hash=hash_password(data.password), status=UserStatus.ACTIVE)
        ctx.db.add(user)
        ctx.db.flush()
        membership = TenantMembership(tenant_id=ctx.tenant_id, user_id=user.id,
                                      role=data.role, status=UserStatus.ACTIVE)
        ctx.db.add(membership)
        ctx.db.flush()
    log_ctx(ctx, action=Action.USER_CREATED, resource_type="user",
            resource_id=user.id, extra={"role": data.role})
    return to_read(user, membership), invite_token


def update_user(ctx: RequestContext, user_id: uuid.UUID, data: UserUpdate) -> dict:
    user, membership = get_user(ctx, user_id)
    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.membership_status is not None:
        if data.membership_status not in (UserStatus.ACTIVE, UserStatus.DISABLED):
            raise ValidationFailed("membership_status must be 'active' or 'disabled'.")
        if user.id == ctx.user.id and data.membership_status == UserStatus.DISABLED:
            raise Forbidden("You cannot disable your own membership.")
        if membership.status != data.membership_status:
            membership.status = data.membership_status
            # No session revoke: the next request/refresh fails closed on the
            # membership check, and other tenants' sessions stay untouched.
            if data.membership_status == UserStatus.DISABLED:
                log_ctx(ctx, action=Action.USER_DISABLED, resource_type="user",
                        resource_id=user.id)
    ctx.db.flush()
    log_ctx(ctx, action=Action.USER_UPDATED, resource_type="user", resource_id=user.id)
    return to_read(user, membership)


def assign_role(ctx: RequestContext, user_id: uuid.UUID, role: str) -> dict:
    _check_role(role)
    user, membership = get_user(ctx, user_id)
    if user.id == ctx.user.id:
        raise Forbidden("You cannot change your own role.")
    old = membership.role
    membership.role = role
    # No session revoke: the session's role claim stops matching on the next
    # request, forcing a fresh login; other tenants are unaffected.
    ctx.db.flush()
    log_ctx(ctx, action=Action.ROLE_CHANGED, resource_type="user", resource_id=user.id,
            extra={"old_role": old, "new_role": role})
    return to_read(user, membership)


def remove_user(ctx: RequestContext, user_id: uuid.UUID) -> None:
    """Remove the membership (offboard from this school). The global user row
    stays: other schools and the audit trail may still reference it."""
    user, membership = get_user(ctx, user_id)
    if user.id == ctx.user.id:
        raise Forbidden("You cannot remove yourself.")
    ctx.db.delete(membership)
    ctx.db.flush()
    log_ctx(ctx, action=Action.MEMBERSHIP_CHANGED, resource_type="user",
            resource_id=user.id, extra={"op": "removed"})


def ensure_role(db, name: str) -> RoleRow:
    """Fetch the role row, creating it on databases that bypassed migrations
    (dev/test create_all paths)."""
    import uuid as _uuid
    row = db.scalar(select(RoleRow).where(RoleRow.name == name))
    if row is None:
        row = RoleRow(id=_uuid.uuid5(_uuid.NAMESPACE_DNS, f"schoolos.local/roles/{name}"),
                      name=name, description="", is_system=name in Role.ALL)
        db.add(row)
        db.flush()
    return row


def list_grants(ctx: RequestContext, user_id: uuid.UUID) -> list[str]:
    user, _ = get_user(ctx, user_id)
    return list(ctx.db.scalars(select(RoleRow.name)
                               .join(UserRole, UserRole.role_id == RoleRow.id)
                               .where(UserRole.user_id == user.id,
                                      UserRole.tenant_id == ctx.tenant_id)).all())


def grant_role(ctx: RequestContext, user_id: uuid.UUID, role: str) -> list[str]:
    """Extra tenant-scoped grant: permissions union with the primary role.
    super-admin is platform-only and cannot be granted inside a tenant."""
    if role not in TENANT_ROLES:
        raise ValidationFailed(f"Role must be one of: {', '.join(TENANT_ROLES)}.")
    user, membership = get_user(ctx, user_id)
    if user.id == ctx.user.id:
        raise Forbidden("You cannot grant roles to yourself.")
    if membership.role == role:
        raise Duplicate("This is already the user's primary role.")
    role_row = ensure_role(ctx.db, role)
    exists = ctx.db.scalar(select(UserRole.id).where(
        UserRole.user_id == user.id, UserRole.role_id == role_row.id,
        UserRole.tenant_id == ctx.tenant_id))
    if exists is not None:
        raise Duplicate("Grant already exists.")
    ctx.db.add(UserRole(user_id=user.id, role_id=role_row.id, tenant_id=ctx.tenant_id))
    ctx.db.flush()
    log_ctx(ctx, action=Action.ROLE_CHANGED, resource_type="user", resource_id=user.id,
            extra={"op": "grant", "role": role})
    return list_grants(ctx, user_id)


def revoke_grant(ctx: RequestContext, user_id: uuid.UUID, role: str) -> list[str]:
    user, _ = get_user(ctx, user_id)
    if user.id == ctx.user.id:
        raise Forbidden("You cannot revoke your own grants.")
    row = ctx.db.scalar(select(UserRole).join(RoleRow, RoleRow.id == UserRole.role_id).where(
        UserRole.user_id == user.id, UserRole.tenant_id == ctx.tenant_id,
        RoleRow.name == role))
    if row is None:
        raise NotFound("Grant not found.", resource="grant")
    ctx.db.delete(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ROLE_CHANGED, resource_type="user", resource_id=user.id,
            extra={"op": "revoke", "role": role})
    return list_grants(ctx, user_id)


def invite_user(ctx: RequestContext, data: InviteCreate):
    from app.schemas.users import UserCreate as UC
    read, _ = create_user(ctx, UC(email=data.email, first_name=data.first_name,
                                  last_name=data.last_name, role=data.role,
                                  send_invite=True))
    return read


__all__ = ["TENANT_ROLES", "assign_role", "create_user", "ensure_role", "get_user",
           "grant_role", "invite_user", "list_grants", "list_users", "remove_user",
           "revoke_grant", "to_read", "update_user"]
