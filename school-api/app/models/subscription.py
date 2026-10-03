from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, Timestamped, UTCDateTime, UUIDPk


class Subscription(Base, UUIDPk, Timestamped):
    """Billing subscription: one row per tenant."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint("status IN ('trialing','active','past_due','canceled')", name="ck_subscriptions_status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    tier: Mapped[str] = mapped_column(String(40), nullable=False, default="trial")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="trialing", index=True)
    trial_ends_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    current_period_start: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    current_period_end: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    seats: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meta: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class FeatureFlag(Base, UUIDPk, Timestamped):
    """Per-tenant feature toggles."""

    __tablename__ = "feature_flags"
    __table_args__ = (UniqueConstraint("tenant_id", "key", name="uq_feature_flags_tenant_key"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(nullable=False, default=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
