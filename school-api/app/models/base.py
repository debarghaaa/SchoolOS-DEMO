from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import DateTime, ForeignKey, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """Timezone-aware datetime that behaves identically on PG and SQLite."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc)
        return value


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class Timestamped:
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)


class TenantScoped:
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )


class SoftDeletable:
    """Soft delete: rows are hidden (deleted_at set), never physically removed,
    so academic history stays auditable. Identifiers are never reused."""

    deleted_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)
