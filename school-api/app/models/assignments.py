from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TenantScoped, Timestamped, UTCDateTime, UUIDPk, utcnow


class Assignment(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint("status IN ('draft','published','archived')", name="ck_assignments_status"),
        Index("ix_assignments_tenant_class", "tenant_id", "class_id"),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    due_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    published_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    reminder_sent_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)


class AssignmentFile(Base, UUIDPk, TenantScoped):
    """Attachments on an assignment (briefs, rubrics, worksheets)."""

    __tablename__ = "assignment_files"
    __table_args__ = (UniqueConstraint("assignment_id", "file_id", name="uq_assignment_files"),)

    assignment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class Submission(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_submissions_assignment_student"),
        CheckConstraint("status IN ('submitted','graded','returned')", name="ck_submissions_status"),
        Index("ix_submissions_tenant_student", "tenant_id", "student_id"),
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    submitted_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    is_late: Mapped[bool] = mapped_column(nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted", index=True)


class Grade(Base, UUIDPk, Timestamped, TenantScoped):
    """Grade with denormalized history: student, grading teacher and max_score
    are snapshotted so the record stays meaningful even if linked rows change."""

    __tablename__ = "grades"
    __table_args__ = (
        CheckConstraint("score >= 0", name="ck_grades_score_nonneg"),
        Index("ix_grades_tenant_student", "tenant_id", "student_id"),
    )

    submission_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    feedback: Mapped[str] = mapped_column(Text, nullable=False, default="")
    graded_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    published_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)
