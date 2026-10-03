from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TenantScoped, Timestamped, UTCDateTime, UUIDPk


class ElabRun(Base, UUIDPk, Timestamped, TenantScoped):
    """An asynchronous code-execution request. Execution happens in a worker,
    never inside the API process. source_hash (SHA-256) supports audit/dedup."""

    __tablename__ = "elab_runs"
    __table_args__ = (
        CheckConstraint("status IN ('queued','running','completed','failed','timeout','cancelled')",
                        name="ck_elab_status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    stdin: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)
    stdout: Mapped[str] = mapped_column(Text, nullable=False, default="")
    stderr: Mapped[str] = mapped_column(Text, nullable=False, default="")
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    completed_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    # For compiled languages: which phase produced the result ("compile"/"run").
    stage: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Cooperative cancellation: set by DELETE, honored by the worker.
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Ephemeral execution-container id (worker use only; cleared on completion).
    container_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
