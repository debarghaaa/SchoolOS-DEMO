from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Time, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TenantScoped, Timestamped, UUIDPk


class Timetable(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "timetable"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_timetable_day"),
        CheckConstraint("end_time > start_time", name="ck_timetable_times"),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 0=Monday
    start_time: Mapped[dt.time] = mapped_column(Time, nullable=False)
    end_time: Mapped[dt.time] = mapped_column(Time, nullable=False)
    room: Mapped[str | None] = mapped_column(String(50), nullable=True)
