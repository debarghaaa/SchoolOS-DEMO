from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TenantScoped, Timestamped, UTCDateTime, UUIDPk
import datetime as dt


class Notification(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_tenant_recipient", "tenant_id", "recipient_id"),
        Index("ix_notifications_tenant_created", "tenant_id", "created_at"),
    )

    recipient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    read_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)
