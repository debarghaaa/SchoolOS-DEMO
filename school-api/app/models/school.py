from __future__ import annotations

from sqlalchemy import JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, SoftDeletable, TenantScoped, Timestamped, UUIDPk


class School(Base, UUIDPk, Timestamped, TenantScoped, SoftDeletable):
    """School profile. Usually one row per tenant; modeled 1:N so a tenant
    (e.g. a school group) can hold several schools."""

    __tablename__ = "schools"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_schools_tenant_code"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    timezone: Mapped[str] = mapped_column(String(60), nullable=False, default="UTC")
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
