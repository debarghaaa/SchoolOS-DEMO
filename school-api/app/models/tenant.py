from __future__ import annotations

from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, Timestamped, UUIDPk


class Tenant(Base, UUIDPk, Timestamped):
    """Platform tenant. Subscription and flags live in dedicated tables."""

    __tablename__ = "tenants"
    __table_args__ = (
        CheckConstraint("status IN ('trial','active','suspended')", name="ck_tenants_status"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="trial", index=True)
