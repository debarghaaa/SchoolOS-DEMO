from __future__ import annotations

"""Temporary demo presence feed (local database only).

These tables back the ``/demo-feed`` endpoints so the school-os presence
islands can be demonstrated without a Supabase project: example faculty /
staff / student rosters plus daily punch rows, shaped exactly like the
Supabase feed (see school-os/supabase/). Demo-only: not covered by RLS,
never exposed beyond the demo endpoints, and safe to drop when the live
feed is configured.
"""

import datetime as dt
import uuid

from sqlalchemy import CheckConstraint, Date, Index, String, Time, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TenantScoped, Timestamped, UUIDPk


class DemoFaculty(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "demo_faculty"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    initials: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    subject: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    dept: Mapped[str] = mapped_column(String(100), nullable=False, default="")


class DemoStaff(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "demo_staff"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    initials: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    dept: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    staff_type: Mapped[str] = mapped_column(String(40), nullable=False, default="Support Staff")


class DemoStudent(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "demo_students"
    __table_args__ = (
        Index("ix_demo_students_tenant_class", "tenant_id", "class_name"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    initials: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    grade: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    section: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    roll: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    # Class label following the feed convention (grade_level + '-' + section),
    # e.g. "Grade 10-B". Used to scope teacher reads to assigned classes.
    class_name: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)


class DemoPresence(Base, UUIDPk, Timestamped, TenantScoped):
    """One punch row per demo person per day (polymorphic person_id, like the
    Supabase feed — no FK by design)."""

    __tablename__ = "demo_presence"
    __table_args__ = (
        UniqueConstraint("tenant_id", "audience", "person_id", "day",
                         name="uq_demo_presence_day"),
        CheckConstraint("audience IN ('faculty','staff','student')", name="ck_demo_presence_audience"),
        CheckConstraint("status IN ('present','absent')", name="ck_demo_presence_status"),
        Index("ix_demo_presence_today", "tenant_id", "day", "audience"),
    )

    audience: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    day: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="absent")
    punch_in: Mapped[dt.time | None] = mapped_column(Time, nullable=True)
    punch_out: Mapped[dt.time | None] = mapped_column(Time, nullable=True)
