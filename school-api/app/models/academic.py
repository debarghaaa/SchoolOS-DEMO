from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, SoftDeletable, TenantScoped, Timestamped, UTCDateTime, UUIDPk, utcnow


class Student(Base, UUIDPk, Timestamped, TenantScoped, SoftDeletable):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("tenant_id", "student_identifier", name="uq_students_tenant_identifier"),
        CheckConstraint("status IN ('active','graduated','withdrawn')", name="ck_students_status"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True)
    student_identifier: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    date_of_birth: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    admission_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)


class Teacher(Base, UUIDPk, Timestamped, TenantScoped, SoftDeletable):
    __tablename__ = "teachers"
    __table_args__ = (UniqueConstraint("tenant_id", "employee_no", name="uq_teachers_tenant_employee"),)

    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True)
    employee_no: Mapped[str] = mapped_column(String(40), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    qualification: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)


class Parent(Base, UUIDPk, Timestamped, TenantScoped, SoftDeletable):
    __tablename__ = "parents"

    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)


class ParentStudent(Base, UUIDPk, TenantScoped):
    """Guardian link: which children a parent may see (object-level scope)."""

    __tablename__ = "parent_student"
    __table_args__ = (UniqueConstraint("parent_id", "student_id", name="uq_parent_student"),)

    parent_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("parents.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    relation: Mapped[str] = mapped_column(String(40), nullable=False, default="guardian")
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class SchoolClass(Base, UUIDPk, Timestamped, TenantScoped, SoftDeletable):
    __tablename__ = "classes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "academic_year", name="uq_classes_tenant_name_year"),
        CheckConstraint("status IN ('active','archived')", name="ck_classes_status"),
    )

    name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    grade_level: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    section: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    class_teacher_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)


class ClassMember(Base, UUIDPk, TenantScoped):
    """Adults rostered to a class. Object-level scope for teachers: a teacher
    serves exactly the classes (and optionally subjects) listed here."""

    __tablename__ = "class_members"
    __table_args__ = (
        UniqueConstraint("teacher_id", "class_id", "subject_id", name="uq_class_members"),
        CheckConstraint("member_type IN ('teacher','assistant')", name="ck_class_members_type"),
    )

    class_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    member_type: Mapped[str] = mapped_column(String(20), nullable=False, default="teacher")
    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class Subject(Base, UUIDPk, Timestamped, TenantScoped, SoftDeletable):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_subjects_tenant_code"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")


class TeacherSubject(Base, UUIDPk, TenantScoped):
    """Subjects a teacher is qualified to teach (staffing directory)."""

    __tablename__ = "teacher_subjects"
    __table_args__ = (UniqueConstraint("teacher_id", "subject_id", name="uq_teacher_subjects"),)

    teacher_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class ClassSubject(Base, UUIDPk, TenantScoped):
    """Curriculum mapping: which subjects a class studies. (Retained junction:
    the architect's table list models staffing via teacher_subjects, but the
    class curriculum needs its own mapping for assignment validation.)"""

    __tablename__ = "class_subjects"
    __table_args__ = (UniqueConstraint("class_id", "subject_id", name="uq_class_subjects"),)

    class_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)


class Enrollment(Base, UUIDPk, Timestamped, TenantScoped):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "class_id", "academic_year", name="uq_enrollments"),
        CheckConstraint("status IN ('active','withdrawn','completed')", name="ck_enrollments_status"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
