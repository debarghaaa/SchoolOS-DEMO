from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TenantScoped, Timestamped, UUIDPk


class Attendance(Base, UUIDPk, Timestamped, TenantScoped):
    """Daily attendance grain: one record per student per day (unique on
    tenant + student + date). ``class_id`` records the marking context."""

    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("tenant_id", "student_id", "date", name="uq_attendance_tenant_student_date"),
        CheckConstraint("status IN ('present','absent','late','excused')", name="ck_attendance_status"),
        Index("ix_attendance_tenant_class", "tenant_id", "class_id"),
        Index("ix_attendance_tenant_student", "tenant_id", "student_id"),
        Index("ix_attendance_tenant_created", "tenant_id", "created_at"),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    marked_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    remarks: Mapped[str] = mapped_column(String(500), nullable=False, default="")
