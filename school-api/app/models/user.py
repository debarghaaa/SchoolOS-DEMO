from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, Timestamped, UTCDateTime, UUIDPk, utcnow


class User(Base, UUIDPk, Timestamped):
    """Global login identity. Tenancy comes from memberships: one user can
    belong to several tenants (e.g. a parent with children in two schools)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("status IN ('active','disabled')", name="ck_users_status"),
    )

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    email_verified_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Role(Base, UUIDPk):
    """Canonical role catalog (system roles seeded; custom roles later)."""

    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    is_system: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class TenantMembership(Base, UUIDPk):
    """A user's membership in one tenant, with primary role and status."""

    __tablename__ = "tenant_membership"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", name="uq_tenant_membership"),
        CheckConstraint(
            "role IN ('super-admin','school-admin','teacher','student','parent')",
            name="ck_membership_role",
        ),
        CheckConstraint("status IN ('active','disabled','invited')", name="ck_membership_status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="invited", index=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class UserRole(Base, UUIDPk):
    """Additional role grants. tenant_id NULL = platform-wide grant (this is
    how super-admins are modeled: no membership, one platform grant)."""

    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        Index("uq_user_roles_platform", "user_id", "role_id", unique=True,
              postgresql_where=text("tenant_id IS NULL"), sqlite_where=text("tenant_id IS NULL")),
        Index("uq_user_roles_tenant", "user_id", "role_id", "tenant_id", unique=True,
              postgresql_where=text("tenant_id IS NOT NULL"), sqlite_where=text("tenant_id IS NOT NULL")),
    )


class RefreshToken(Base, UUIDPk):
    """Rotating refresh tokens. Only the SHA-256 hash is stored."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class OneTimeToken(Base, UUIDPk):
    """Single-use tokens: password reset, email verify, invite, tenant select."""

    __tablename__ = "one_time_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    used_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
