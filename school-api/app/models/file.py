from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TenantScoped, Timestamped, UUIDPk


class StoredFile(Base, UUIDPk, Timestamped, TenantScoped):
    """Database metadata for a blob in S3-compatible object storage."""

    __tablename__ = "files"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/octet-stream")
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    purpose: Mapped[str] = mapped_column(String(40), nullable=False, default="general", index=True)
    uploaded: Mapped[bool] = mapped_column(nullable=False, default=True)
