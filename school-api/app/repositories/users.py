from __future__ import annotations

"""Identity lookups. Users are global; tenancy comes from memberships."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import Role, TenantMembership, User, UserRole


def find_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def email_taken(db: Session, email: str, *, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(User.id).where(User.email == email.lower())
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    return db.scalar(stmt) is not None


def active_memberships(db: Session, user_id: uuid.UUID) -> list[TenantMembership]:
    return list(db.scalars(
        select(TenantMembership)
        .where(TenantMembership.user_id == user_id, TenantMembership.status == "active")
        .order_by(TenantMembership.created_at)
    ).all())


def get_membership(db: Session, user_id: uuid.UUID, tenant_id: uuid.UUID) -> TenantMembership | None:
    return db.scalar(select(TenantMembership).where(
        TenantMembership.user_id == user_id, TenantMembership.tenant_id == tenant_id))


def platform_roles(db: Session, user_id: uuid.UUID) -> list[str]:
    """Role names granted platform-wide (tenant_id IS NULL)."""
    return list(db.scalars(
        select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(
            UserRole.user_id == user_id, UserRole.tenant_id.is_(None))
    ).all())


def tenant_grant_roles(db: Session, user_id: uuid.UUID, tenant_id: uuid.UUID) -> list[str]:
    """Extra role names granted within one tenant."""
    return list(db.scalars(
        select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(
            UserRole.user_id == user_id, UserRole.tenant_id == tenant_id)
    ).all())


def is_platform_admin(db: Session, user_id: uuid.UUID) -> bool:
    from app.core.constants import Role as Roles
    return Roles.SUPER_ADMIN in platform_roles(db, user_id)


def effective_roles(db: Session, user: User, tenant_id: uuid.UUID | None, primary: str | None) -> set[str]:
    """Primary session role plus extra grants (tenant-scoped and platform).

    Callers use this for permission checks; RLS + explicit scoping still gate
    every row, and platform grants never open tenant row endpoints.
    """
    roles: set[str] = set()
    if primary:
        roles.add(primary)
    if tenant_id is not None:
        roles.update(tenant_grant_roles(db, user.id, tenant_id))
    roles.update(platform_roles(db, user.id))
    roles.discard("super-admin") if tenant_id is not None else None
    return roles
