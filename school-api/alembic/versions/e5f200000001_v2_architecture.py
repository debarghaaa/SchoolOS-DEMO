"""v2 architecture evolution: global users + membership, renames, new tables.

Revision ID: e5f200000001
Revises: c4d2e8a1f6b3
Create Date: 2026-09-24

What changes
------------
- Identity: ``users`` becomes global (email unique). Tenancy moves to the new
  ``tenant_membership`` table (primary role + status); extra grants live in
  ``user_roles``. Tenant-less super-admins become platform grants
  (``user_roles`` with ``tenant_id IS NULL``). ``full_name`` splits into
  ``first_name``/``last_name``.
- New tables: ``roles`` (seeded), ``tenant_membership``, ``user_roles``,
  ``schools`` (one default row per existing tenant), ``subscriptions`` and
  ``feature_flags`` (migrated out of ``tenants`` JSON columns),
  ``teacher_subjects`` (backfilled from ``class_subjects``),
  ``assignment_files``.
- Renames: ``parent_links`` -> ``parent_student``,
  ``teacher_assignments`` -> ``class_members`` (+ ``member_type``),
  ``attendance_records`` -> ``attendance`` (unique grain tightened from
  student+class+date to tenant+student+date),
  ``timetable_slots`` -> ``timetable``; column renames (``admission_no`` ->
  ``student_identifier``, ``marked_by_user_id`` -> ``marked_by``,
  ``user_id`` -> ``recipient_id``/``owner_id``/``actor_id``,
  ``resource`` -> ``resource_type``, ``body_text`` -> ``content``,
  ``homeroom_teacher_id`` -> ``class_teacher_id``, ``mime`` -> ``mime_type``,
  ``size_bytes`` -> ``size``, ``dob`` -> ``date_of_birth``,
  ``duration_ms`` -> ``runtime_ms``, ``finished_at`` -> ``completed_at``).
- ``grades`` gains denormalized history columns (``student_id``,
  ``teacher_id``, ``max_score``, ``graded_at``) backfilled from linked rows.
- Soft-delete ``deleted_at`` added to students/teachers/parents/classes/
  subjects/schools. CHECK constraints and RLS policies for the new tables
  are applied on PostgreSQL only (SQLite cannot ADD constraints, and the
  SQLite path exists for tests).

Safety
------
- Every data backfill runs in Python through reflected Core tables, so UUID /
  datetime / JSON bind handling is correct on both dialects.
- Anything that cannot be mapped safely FAILS LOUDLY instead of dropping
  data: unknown membership roles, attendance duplicates under the new daily
  grain, or unexpected status values (see ``_assert_values``).
- On PostgreSQL the migration sets ``app.bypass_rls`` for its own session:
  DDL/DML runs as the migration owner, and RLS is re-verified by policy
  (the connection closes afterwards, so the setting never leaks).

Downgrade is best-effort and LOSSY (memberships fold back into users,
subscriptions fold back into tenants, schools/roles/grants are dropped).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import uuid
from collections.abc import Sequence

from alembic import op
from sqlalchemy import func, or_, select
import sqlalchemy as sa
import app.models.base  # noqa: F401 - custom UTCDateTime type used below


revision: str = "e5f200000001"
down_revision: str | None = "c4d2e8a1f6b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UTCDateTime = app.models.base.UTCDateTime

SYSTEM_ROLES = (
    ("super-admin", "Platform operator. No tenant membership; access via platform grant."),
    ("school-admin", "Administers one school: people, classes, records."),
    ("teacher", "Teaches rostered classes; marks attendance; grades own work."),
    ("student", "Views own records; submits assignments."),
    ("parent", "Views linked children's records."),
)

NEW_RLS_TABLES = [
    "subscriptions", "feature_flags", "schools", "tenant_membership",
    "user_roles", "teacher_subjects", "assignment_files",
]


# --------------------------------------------------------------------------- helpers

def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _table(name: str) -> sa.Table:
    """Reflect the CURRENT shape of a table (re-reflect after each ALTER)."""
    return sa.Table(name, sa.MetaData(), autoload_with=op.get_bind())


def _rename_index(table: str, old: str, new: str, columns: list[str]) -> None:
    if _is_pg():
        op.execute(sa.text(f"ALTER INDEX {old} RENAME TO {new}"))
    else:
        op.drop_index(old, table_name=table)
        op.create_index(new, table, columns)


def _assert_values(table: str, column: str, allowed: set[str]) -> None:
    """Fail loudly when existing data would violate a new CHECK constraint."""
    t = _table(table)
    rows = op.get_bind().execute(
        select(t.c[column]).where(t.c[column].notin_(allowed)).distinct()
    ).scalars().all()
    if rows:
        raise RuntimeError(
            f"Cannot migrate {table}.{column}: unexpected value(s) {rows!r}. "
            f"Allowed: {sorted(allowed)}. Fix the data, then re-run."
        )


def _role_id(name: str) -> uuid.UUID:
    """Deterministic role UUIDs so every environment seeds identical keys."""
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"schoolos.local/roles/{name}")

def _uuid(v):
    """Reflected tables lose the Uuid bind processor on SQLite (CHAR(32)
    hex storage), so convert new UUID values explicitly. No-op on PG."""
    if v is None or _is_pg():
        return v
    return v.hex



# --------------------------------------------------------------------------- upgrade

def upgrade() -> None:
    conn = op.get_bind()
    if _is_pg():
        # Migration DML must bypass RLS (no app.tenant_id in this session).
        conn.execute(sa.text("SELECT set_config('app.bypass_rls', 'true', false)"))

    _create_new_tables()
    _seed_roles()
    _migrate_users()
    _migrate_tenants()
    _migrate_academic()
    _migrate_records()
    _migrate_services()
    if _is_pg():
        _apply_rls()


def _create_new_tables() -> None:
    op.create_table(
        "roles",
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_roles_name", "roles", ["name"], unique=True)

    op.create_table(
        "tenant_membership",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_tenant_membership"),
        sa.CheckConstraint(
            "role IN ('super-admin','school-admin','teacher','student','parent')",
            name="ck_membership_role",
        ),
        sa.CheckConstraint("status IN ('active','disabled','invited')", name="ck_membership_status"),
    )
    for col in ("tenant_id", "user_id", "role", "status"):
        op.create_index(f"ix_tenant_membership_{col}", "tenant_membership", [col])

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.Index(
            "uq_user_roles_platform", "user_id", "role_id", unique=True,
            postgresql_where=sa.text("tenant_id IS NULL"),
            sqlite_where=sa.text("tenant_id IS NULL"),
        ),
        sa.Index(
            "uq_user_roles_tenant", "user_id", "role_id", "tenant_id", unique=True,
            postgresql_where=sa.text("tenant_id IS NOT NULL"),
            sqlite_where=sa.text("tenant_id IS NOT NULL"),
        ),
    )
    for col in ("user_id", "role_id", "tenant_id"):
        op.create_index(f"ix_user_roles_{col}", "user_roles", [col])

    op.create_table(
        "schools",
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("academic_year", sa.String(20), nullable=False),
        sa.Column("timezone", sa.String(60), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("deleted_at", UTCDateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_schools_tenant_code"),
    )
    op.create_index("ix_schools_tenant_id", "schools", ["tenant_id"])
    op.create_index("ix_schools_deleted_at", "schools", ["deleted_at"])

    op.create_table(
        "subscriptions",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("tier", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("trial_ends_at", UTCDateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", UTCDateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", UTCDateTime(timezone=True), nullable=True),
        sa.Column("seats", sa.Integer(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('trialing','active','past_due','canceled')",
            name="ck_subscriptions_status",
        ),
    )
    op.create_index("ix_subscriptions_tenant_id", "subscriptions", ["tenant_id"], unique=True)
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])

    op.create_table(
        "feature_flags",
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "key", name="uq_feature_flags_tenant_key"),
    )
    op.create_index("ix_feature_flags_tenant_id", "feature_flags", ["tenant_id"])
    op.create_index("ix_feature_flags_key", "feature_flags", ["key"])

    op.create_table(
        "teacher_subjects",
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("teacher_id", "subject_id", name="uq_teacher_subjects"),
    )
    op.create_index("ix_teacher_subjects_teacher_id", "teacher_subjects", ["teacher_id"])
    op.create_index("ix_teacher_subjects_subject_id", "teacher_subjects", ["subject_id"])
    op.create_index("ix_teacher_subjects_tenant_id", "teacher_subjects", ["tenant_id"])

    op.create_table(
        "assignment_files",
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", UTCDateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_id", "file_id", name="uq_assignment_files"),
    )
    op.create_index("ix_assignment_files_assignment_id", "assignment_files", ["assignment_id"])
    op.create_index("ix_assignment_files_file_id", "assignment_files", ["file_id"])
    op.create_index("ix_assignment_files_tenant_id", "assignment_files", ["tenant_id"])


def _seed_roles() -> None:
    conn = op.get_bind()
    roles = _table("roles")
    now = dt.datetime.now(dt.timezone.utc)
    for name, description in SYSTEM_ROLES:
        conn.execute(
            roles.insert().values(
                id=_uuid(_role_id(name)), name=name, description=description,
                is_system=True, created_at=now,
            )
        )


def _migrate_users() -> None:
    conn = op.get_bind()
    if _is_pg():
        # users becomes global: drop its tenant policy + the 002 partial index
        # BEFORE the tenant_id column goes away.
        op.execute(sa.text("DROP POLICY IF EXISTS tenant_isolation ON users"))
        op.execute(sa.text("ALTER TABLE users DISABLE ROW LEVEL SECURITY"))
        op.execute(sa.text("DROP INDEX IF EXISTS uq_users_superadmin_email"))

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("first_name", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("last_name", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("phone", sa.String(30), nullable=True))

    users = _table("users")
    tenants = _table("tenants")
    rows = conn.execute(select(users)).mappings().all()

    # Fail loudly on roles outside the five system roles.
    valid_roles = {name for name, _ in SYSTEM_ROLES}
    bad = sorted({r["role"] for r in rows if r["role"] not in valid_roles})
    if bad:
        raise RuntimeError(
            f"Cannot migrate users.role: unexpected value(s) {bad}. "
            "Map them to system roles first, then re-run."
        )

    # Split full_name + resolve cross-tenant email collisions before the
    # global unique index lands (keep the earliest account untouched).
    by_email: dict[str, list] = {}
    for r in rows:
        by_email.setdefault(r["email"], []).append(r)
    slug_by_tenant = {
        t["id"]: t["slug"]
        for t in conn.execute(select(tenants.c.id, tenants.c.slug)).mappings().all()
    }
    for email, group in by_email.items():
        group.sort(key=lambda r: r["created_at"] or dt.datetime.min)
        for i, r in enumerate(group):
            parts = (r["full_name"] or "").split(None, 1)
            first = parts[0] if parts else ""
            last = parts[1] if len(parts) > 1 else ""
            new_email = email
            if i:
                suffix = re.sub(r"[^a-z0-9]+", "", (slug_by_tenant.get(r["tenant_id"]) or "x").lower())[:12]
                local, sep, domain = email.partition("@")
                new_email = f"{local}+dup-{suffix}{sep}{domain}" if sep else f"{email}+dup-{suffix}"
            conn.execute(
                users.update().where(users.c.id == r["id"]).values(
                    first_name=first, last_name=last, email=new_email
                )
            )

    # Memberships + platform grants. users.status 'invited' is preserved on
    # the membership; the global identity fails closed to 'disabled'.
    membership = _table("tenant_membership")
    grants = _table("user_roles")
    now = dt.datetime.now(dt.timezone.utc)
    for r in conn.execute(select(users)).mappings().all():
        mstatus = {"invited": "invited", "disabled": "disabled"}.get(r["status"], "active")
        if r["tenant_id"] is not None:
            conn.execute(
                membership.insert().values(
                    id=_uuid(uuid.uuid4()), tenant_id=r["tenant_id"], user_id=r["id"],
                    role=r["role"], status=mstatus, created_at=now,
                )
            )
        else:
            conn.execute(
                grants.insert().values(
                    id=_uuid(uuid.uuid4()), user_id=r["id"], role_id=_uuid(_role_id(r["role"])),
                    tenant_id=None, created_at=now,
                )
            )
        if r["status"] not in ("active", "disabled"):
            conn.execute(
                users.update().where(users.c.id == r["id"]).values(status="disabled")
            )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("first_name", nullable=False)
        batch_op.alter_column("last_name", nullable=False)
        batch_op.drop_constraint("uq_users_tenant_email", type_="unique")
        batch_op.drop_index("ix_users_email")
        batch_op.drop_index("ix_users_role")
        batch_op.drop_index("ix_users_tenant_id")
        batch_op.drop_column("full_name")
        batch_op.drop_column("role")
        batch_op.drop_column("tenant_id")
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE users ADD CONSTRAINT ck_users_status "
            "CHECK (status IN ('active','disabled'))"
        ))


def _migrate_tenants() -> None:
    conn = op.get_bind()
    tenants = _table("tenants")
    subs = _table("subscriptions")
    flags = _table("feature_flags")
    schools = _table("schools")
    now = dt.datetime.now(dt.timezone.utc)
    sub_status = {"active": "active", "trial": "trialing", "suspended": "canceled"}

    for t in conn.execute(select(tenants)).mappings().all():
        meta = t["subscription_meta"] or {}
        if isinstance(meta, str):
            meta = json.loads(meta)
        raw_flags = t["feature_flags"] or {}
        if isinstance(raw_flags, str):
            raw_flags = json.loads(raw_flags)
        conn.execute(
            subs.insert().values(
                id=_uuid(uuid.uuid4()), tenant_id=t["id"], tier=t["subscription_tier"] or "trial",
                status=sub_status.get(t["status"], "trialing"), trial_ends_at=t["trial_ends_at"],
                current_period_start=None, current_period_end=None, seats=0, meta=(meta),
                created_at=t["created_at"], updated_at=t["updated_at"],
            )
        )
        if isinstance(raw_flags, dict):
            for key, value in raw_flags.items():
                if isinstance(value, dict):
                    enabled = bool(value.get("enabled", True))
                    payload = value
                else:
                    enabled, payload = bool(value), {}
                conn.execute(
                    flags.insert().values(
                        id=_uuid(uuid.uuid4()), tenant_id=t["id"], key=str(key)[:80],
                        enabled=enabled, payload=(payload),
                        created_at=now, updated_at=now,
                    )
                )
        code = re.sub(r"[^A-Z0-9]+", "_", (t["slug"] or "main").upper())[:40] or "MAIN"
        conn.execute(
            schools.insert().values(
                id=_uuid(uuid.uuid4()), tenant_id=t["id"], name=t["name"], code=code,
                address=None, phone=None, email=None, academic_year="",
                timezone="UTC", settings=({}), created_at=t["created_at"],
                updated_at=t["updated_at"], deleted_at=None,
            )
        )

    _assert_values("tenants", "status", {"trial", "active", "suspended"})
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.drop_column("trial_ends_at")
        batch_op.drop_column("subscription_tier")
        batch_op.drop_column("subscription_meta")
        batch_op.drop_column("feature_flags")
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE tenants ADD CONSTRAINT ck_tenants_status "
            "CHECK (status IN ('trial','active','suspended'))"
        ))


def _migrate_academic() -> None:
    conn = op.get_bind()

    # students: renames + status + soft delete (phone is dropped: contact
    # details live on the linked user / parent records).
    with op.batch_alter_table("students") as batch_op:
        batch_op.add_column(sa.Column("admission_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("deleted_at", UTCDateTime(timezone=True), nullable=True))
    students = _table("students")
    conn.execute(students.update().values(status="active"))
    with op.batch_alter_table("students") as batch_op:
        batch_op.alter_column("admission_no", new_column_name="student_identifier")
        batch_op.alter_column("dob", new_column_name="date_of_birth")
        batch_op.alter_column("status", nullable=False)
        batch_op.drop_column("phone")
    # Separate batch: unique ops that reference a renamed column must run
    # AFTER the rename batch, otherwise SQLite batch silently drops them.
    with op.batch_alter_table("students") as batch_op:
        batch_op.drop_constraint("uq_students_tenant_admission", type_="unique")
        batch_op.create_unique_constraint(
            "uq_students_tenant_identifier", ["tenant_id", "student_identifier"]
        )
    op.create_index("ix_students_student_identifier", "students", ["student_identifier"])
    op.create_index("ix_students_status", "students", ["status"])
    op.create_index("ix_students_deleted_at", "students", ["deleted_at"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE students ADD CONSTRAINT ck_students_status "
            "CHECK (status IN ('active','graduated','withdrawn'))"
        ))

    for table in ("teachers", "parents", "subjects"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column("deleted_at", UTCDateTime(timezone=True), nullable=True))
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])

    # classes: homeroom rename + soft delete.
    _assert_values("classes", "status", {"active", "archived"})
    with op.batch_alter_table("classes") as batch_op:
        batch_op.alter_column("homeroom_teacher_id", new_column_name="class_teacher_id")
        batch_op.add_column(sa.Column("deleted_at", UTCDateTime(timezone=True), nullable=True))
    op.create_index("ix_classes_deleted_at", "classes", ["deleted_at"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE classes ADD CONSTRAINT ck_classes_status "
            "CHECK (status IN ('active','archived'))"
        ))

    # teacher_assignments -> class_members.
    op.rename_table("teacher_assignments", "class_members")
    with op.batch_alter_table("class_members") as batch_op:
        batch_op.add_column(sa.Column("member_type", sa.String(20), nullable=True))
    members = _table("class_members")
    conn.execute(members.update().values(member_type="teacher"))
    with op.batch_alter_table("class_members") as batch_op:
        batch_op.alter_column("member_type", nullable=False)
        batch_op.drop_constraint("uq_teacher_assignments", type_="unique")
        batch_op.create_unique_constraint(
            "uq_class_members", ["teacher_id", "class_id", "subject_id"]
        )
    _rename_index("class_members", "ix_teacher_assignments_class_id", "ix_class_members_class_id", ["class_id"])
    _rename_index("class_members", "ix_teacher_assignments_teacher_id", "ix_class_members_teacher_id", ["teacher_id"])
    _rename_index("class_members", "ix_teacher_assignments_tenant_id", "ix_class_members_tenant_id", ["tenant_id"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE class_members ADD CONSTRAINT ck_class_members_type "
            "CHECK (member_type IN ('teacher','assistant'))"
        ))

    # parent_links -> parent_student.
    op.rename_table("parent_links", "parent_student")
    with op.batch_alter_table("parent_student") as batch_op:
        batch_op.drop_constraint("uq_parent_links", type_="unique")
        batch_op.create_unique_constraint("uq_parent_student", ["parent_id", "student_id"])
    _rename_index("parent_student", "ix_parent_links_parent_id", "ix_parent_student_parent_id", ["parent_id"])
    _rename_index("parent_student", "ix_parent_links_student_id", "ix_parent_student_student_id", ["student_id"])
    _rename_index("parent_student", "ix_parent_links_tenant_id", "ix_parent_student_tenant_id", ["tenant_id"])

    # enrollments: status check only.
    _assert_values("enrollments", "status", {"active", "withdrawn", "completed"})
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE enrollments ADD CONSTRAINT ck_enrollments_status "
            "CHECK (status IN ('active','withdrawn','completed'))"
        ))

    # teacher_subjects backfill from class_subjects staffing info.
    cs = _table("class_subjects")
    ts = _table("teacher_subjects")
    now = dt.datetime.now(dt.timezone.utc)
    pairs = conn.execute(
        select(cs.c.tenant_id, cs.c.teacher_id, cs.c.subject_id)
        .where(cs.c.teacher_id.is_not(None))
        .distinct()
    ).all()
    for tenant_id, teacher_id, subject_id in pairs:
        conn.execute(
            ts.insert().values(
                id=_uuid(uuid.uuid4()), tenant_id=tenant_id, teacher_id=teacher_id,
                subject_id=subject_id, created_at=now,
            )
        )


def _migrate_records() -> None:
    conn = op.get_bind()

    # attendance_records -> attendance (daily grain).
    _assert_values("attendance_records", "status", {"present", "absent", "late", "excused"})
    att = _table("attendance_records")
    dupes = conn.execute(
        select(att.c.tenant_id, att.c.student_id, att.c.date, func.count().label("n"))
        .group_by(att.c.tenant_id, att.c.student_id, att.c.date)
        .having(func.count() > 1)
    ).all()
    if dupes:
        sample = [
            f"tenant={t} student={s} date={d} rows={n}" for t, s, d, n in dupes[:5]
        ]
        raise RuntimeError(
            "Cannot migrate attendance to the daily grain "
            "(tenant_id, student_id, date): duplicates exist: "
            + "; ".join(sample)
            + ". Deduplicate (one record per student per day), then re-run."
        )
    op.rename_table("attendance_records", "attendance")
    with op.batch_alter_table("attendance") as batch_op:
        batch_op.alter_column("marked_by_user_id", new_column_name="marked_by")
        batch_op.drop_constraint("uq_attendance_student_class_date", type_="unique")
        batch_op.create_unique_constraint(
            "uq_attendance_tenant_student_date", ["tenant_id", "student_id", "date"]
        )
    for col in ("class_id", "date", "status", "student_id", "tenant_id"):
        _rename_index("attendance", f"ix_attendance_records_{col}", f"ix_attendance_{col}", [col])
    op.create_index("ix_attendance_tenant_class", "attendance", ["tenant_id", "class_id"])
    op.create_index("ix_attendance_tenant_student", "attendance", ["tenant_id", "student_id"])
    op.create_index("ix_attendance_tenant_created", "attendance", ["tenant_id", "created_at"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE attendance ADD CONSTRAINT ck_attendance_status "
            "CHECK (status IN ('present','absent','late','excused'))"
        ))

    # assignments: composite index + check only.
    _assert_values("assignments", "status", {"draft", "published", "archived"})
    op.create_index("ix_assignments_tenant_class", "assignments", ["tenant_id", "class_id"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE assignments ADD CONSTRAINT ck_assignments_status "
            "CHECK (status IN ('draft','published','archived'))"
        ))

    # submissions: body_text -> content.
    _assert_values("submissions", "status", {"submitted", "graded", "returned"})
    with op.batch_alter_table("submissions") as batch_op:
        batch_op.alter_column("body_text", new_column_name="content")
    op.create_index("ix_submissions_tenant_student", "submissions", ["tenant_id", "student_id"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE submissions ADD CONSTRAINT ck_submissions_status "
            "CHECK (status IN ('submitted','graded','returned'))"
        ))

    # grades: denormalized history columns.
    with op.batch_alter_table("grades") as batch_op:
        batch_op.add_column(sa.Column("student_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("teacher_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("max_score", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("graded_at", UTCDateTime(timezone=True), nullable=True))
    grades = _table("grades")
    submissions = _table("submissions")
    assignments = _table("assignments")
    teachers = _table("teachers")
    sub_by_id = {
        r["id"]: r
        for r in conn.execute(select(submissions)).mappings().all()
    }
    max_by_assignment = {
        r["id"]: r["max_score"]
        for r in conn.execute(
            select(assignments.c.id, assignments.c.max_score)
        ).mappings().all()
    }
    for g in conn.execute(select(grades)).mappings().all():
        sub = sub_by_id[g["submission_id"]]
        teacher_id = conn.execute(
            select(teachers.c.id).where(
                teachers.c.user_id == g["graded_by_user_id"],
                teachers.c.tenant_id == g["tenant_id"],
            ).limit(1)
        ).scalar()
        conn.execute(
            grades.update().where(grades.c.id == g["id"]).values(
                student_id=sub["student_id"],
                teacher_id=teacher_id,
                max_score=max_by_assignment[sub["assignment_id"]],
                graded_at=g["published_at"] or g["updated_at"] or g["created_at"],
            )
        )
    with op.batch_alter_table("grades") as batch_op:
        batch_op.alter_column("student_id", nullable=False)
        batch_op.alter_column("max_score", nullable=False)
        batch_op.alter_column("graded_at", nullable=False)
        batch_op.create_foreign_key(
            "fk_grades_student", "students", ["student_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_foreign_key(
            "fk_grades_teacher", "teachers", ["teacher_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.drop_column("graded_by_user_id")
    op.create_index("ix_grades_student_id", "grades", ["student_id"])
    op.create_index("ix_grades_tenant_student", "grades", ["tenant_id", "student_id"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE grades ADD CONSTRAINT ck_grades_score_nonneg CHECK (score >= 0)"
        ))

    # timetable_slots -> timetable.
    op.rename_table("timetable_slots", "timetable")
    for col in ("class_id", "day_of_week", "subject_id", "teacher_id", "tenant_id"):
        _rename_index("timetable", f"ix_timetable_slots_{col}", f"ix_timetable_{col}", [col])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE timetable ADD CONSTRAINT ck_timetable_day "
            "CHECK (day_of_week BETWEEN 0 AND 6)"
        ))
        op.execute(sa.text(
            "ALTER TABLE timetable ADD CONSTRAINT ck_timetable_times "
            "CHECK (end_time > start_time)"
        ))


def _migrate_services() -> None:
    conn = op.get_bind()

    # notifications: user_id -> recipient_id.
    with op.batch_alter_table("notifications") as batch_op:
        batch_op.alter_column("user_id", new_column_name="recipient_id")
    _rename_index(
        "notifications", "ix_notifications_user_id",
        "ix_notifications_recipient_id", ["recipient_id"],
    )
    op.create_index(
        "ix_notifications_tenant_recipient", "notifications", ["tenant_id", "recipient_id"]
    )
    op.create_index(
        "ix_notifications_tenant_created", "notifications", ["tenant_id", "created_at"]
    )

    # files: owner/mime/size renames.
    with op.batch_alter_table("files") as batch_op:
        batch_op.alter_column("owner_user_id", new_column_name="owner_id")
        batch_op.alter_column("mime", new_column_name="mime_type")
        batch_op.alter_column("size_bytes", new_column_name="size")
    _rename_index("files", "ix_files_owner_user_id", "ix_files_owner_id", ["owner_id"])

    # elab_runs: renames + source_hash backfilled from actual source.
    _assert_values(
        "elab_runs", "status", {"queued", "running", "succeeded", "failed", "timeout"}
    )
    with op.batch_alter_table("elab_runs") as batch_op:
        batch_op.alter_column("duration_ms", new_column_name="runtime_ms")
        batch_op.alter_column("finished_at", new_column_name="completed_at")
        batch_op.add_column(sa.Column("source_hash", sa.String(64), nullable=True))
    runs = _table("elab_runs")
    for r in conn.execute(select(runs.c.id, runs.c.source_code)).mappings().all():
        digest = hashlib.sha256((r["source_code"] or "").encode("utf-8")).hexdigest()
        conn.execute(
            runs.update().where(runs.c.id == r["id"]).values(source_hash=digest)
        )
    with op.batch_alter_table("elab_runs") as batch_op:
        batch_op.alter_column("source_hash", nullable=False)
    op.create_index("ix_elab_runs_source_hash", "elab_runs", ["source_hash"])
    if _is_pg():
        op.execute(sa.text(
            "ALTER TABLE elab_runs ADD CONSTRAINT ck_elab_status CHECK "
            "(status IN ('queued','running','succeeded','failed','timeout'))"
        ))

    # audit_logs: actor/resource renames.
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.alter_column("actor_user_id", new_column_name="actor_id")
        batch_op.alter_column("resource", new_column_name="resource_type")
    _rename_index(
        "audit_logs", "ix_audit_logs_actor_user_id", "ix_audit_logs_actor_id", ["actor_id"]
    )
    _rename_index(
        "audit_logs", "ix_audit_logs_resource", "ix_audit_logs_resource_type", ["resource_type"]
    )
    op.create_index("ix_audit_tenant_created", "audit_logs", ["tenant_id", "created_at"])


def _apply_rls() -> None:
    for table in NEW_RLS_TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
        op.execute(sa.text(
            f"CREATE POLICY tenant_isolation ON {table} FOR ALL "
            f"USING (tenant_id::text = current_setting('app.tenant_id', true) "
            f"OR current_setting('app.bypass_rls', true) = 'true')"
        ))


# --------------------------------------------------------------------------- downgrade

def downgrade() -> None:
    """Best-effort reversal. LOSSY: memberships fold back into users;
    subscriptions fold back into tenants; schools, roles, grants,
    assignment links and staffing rows are dropped."""
    conn = op.get_bind()
    if _is_pg():
        conn.execute(sa.text("SELECT set_config('app.bypass_rls', 'true', false)"))
        for table in NEW_RLS_TABLES:
            op.execute(sa.text(f"DROP POLICY IF EXISTS tenant_isolation ON {table}"))
            op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
        for table, constraint in [
            ("tenants", "ck_tenants_status"), ("users", "ck_users_status"),
            ("students", "ck_students_status"), ("classes", "ck_classes_status"),
            ("class_members", "ck_class_members_type"),
            ("enrollments", "ck_enrollments_status"),
            ("attendance", "ck_attendance_status"),
            ("assignments", "ck_assignments_status"),
            ("submissions", "ck_submissions_status"),
            ("grades", "ck_grades_score_nonneg"), ("timetable", "ck_timetable_day"),
            ("timetable", "ck_timetable_times"), ("elab_runs", "ck_elab_status"),
        ]:
            op.execute(sa.text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}"))

    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.alter_column("actor_id", new_column_name="actor_user_id")
        batch_op.alter_column("resource_type", new_column_name="resource")
    _rename_index("audit_logs", "ix_audit_logs_actor_id", "ix_audit_logs_actor_user_id", ["actor_user_id"])
    _rename_index("audit_logs", "ix_audit_logs_resource_type", "ix_audit_logs_resource", ["resource"])
    op.drop_index("ix_audit_tenant_created", table_name="audit_logs")

    # Drop first: batch table-rebuild would otherwise try to recreate this
    # index on a column that no longer exists.
    op.drop_index("ix_elab_runs_source_hash", table_name="elab_runs")
    with op.batch_alter_table("elab_runs") as batch_op:
        batch_op.alter_column("runtime_ms", new_column_name="duration_ms")
        batch_op.alter_column("completed_at", new_column_name="finished_at")
        batch_op.drop_column("source_hash")

    with op.batch_alter_table("files") as batch_op:
        batch_op.alter_column("owner_id", new_column_name="owner_user_id")
        batch_op.alter_column("mime_type", new_column_name="mime")
        batch_op.alter_column("size", new_column_name="size_bytes")
    _rename_index("files", "ix_files_owner_id", "ix_files_owner_user_id", ["owner_user_id"])

    with op.batch_alter_table("notifications") as batch_op:
        batch_op.alter_column("recipient_id", new_column_name="user_id")
    _rename_index("notifications", "ix_notifications_recipient_id", "ix_notifications_user_id", ["user_id"])
    op.drop_index("ix_notifications_tenant_recipient", table_name="notifications")
    op.drop_index("ix_notifications_tenant_created", table_name="notifications")

    op.rename_table("timetable", "timetable_slots")
    for col in ("class_id", "day_of_week", "subject_id", "teacher_id", "tenant_id"):
        _rename_index("timetable_slots", f"ix_timetable_{col}", f"ix_timetable_slots_{col}", [col])

    op.drop_index("ix_grades_tenant_student", table_name="grades")
    op.drop_index("ix_grades_student_id", table_name="grades")
    with op.batch_alter_table("grades") as batch_op:
        batch_op.add_column(sa.Column("graded_by_user_id", sa.Uuid(), nullable=True))
        batch_op.drop_constraint("fk_grades_student", type_="foreignkey")
        batch_op.drop_constraint("fk_grades_teacher", type_="foreignkey")
        batch_op.drop_column("student_id")
        batch_op.drop_column("teacher_id")
        batch_op.drop_column("max_score")
        batch_op.drop_column("graded_at")

    with op.batch_alter_table("submissions") as batch_op:
        batch_op.alter_column("content", new_column_name="body_text")
    op.drop_index("ix_submissions_tenant_student", table_name="submissions")

    op.drop_index("ix_assignments_tenant_class", table_name="assignments")

    op.drop_index("ix_attendance_tenant_class", table_name="attendance")
    op.drop_index("ix_attendance_tenant_student", table_name="attendance")
    op.drop_index("ix_attendance_tenant_created", table_name="attendance")
    op.rename_table("attendance", "attendance_records")
    for col in ("class_id", "date", "status", "student_id", "tenant_id"):
        _rename_index("attendance_records", f"ix_attendance_{col}", f"ix_attendance_records_{col}", [col])
    with op.batch_alter_table("attendance_records") as batch_op:
        batch_op.alter_column("marked_by", new_column_name="marked_by_user_id")
        batch_op.drop_constraint("uq_attendance_tenant_student_date", type_="unique")
        batch_op.create_unique_constraint(
            "uq_attendance_student_class_date", ["student_id", "class_id", "date"]
        )

    with op.batch_alter_table("enrollments"):
        pass

    op.rename_table("parent_student", "parent_links")
    _rename_index("parent_links", "ix_parent_student_parent_id", "ix_parent_links_parent_id", ["parent_id"])
    _rename_index("parent_links", "ix_parent_student_student_id", "ix_parent_links_student_id", ["student_id"])
    _rename_index("parent_links", "ix_parent_student_tenant_id", "ix_parent_links_tenant_id", ["tenant_id"])
    with op.batch_alter_table("parent_links") as batch_op:
        batch_op.drop_constraint("uq_parent_student", type_="unique")
        batch_op.create_unique_constraint("uq_parent_links", ["parent_id", "student_id"])

    op.rename_table("class_members", "teacher_assignments")
    _rename_index("teacher_assignments", "ix_class_members_class_id", "ix_teacher_assignments_class_id", ["class_id"])
    _rename_index("teacher_assignments", "ix_class_members_teacher_id", "ix_teacher_assignments_teacher_id", ["teacher_id"])
    _rename_index("teacher_assignments", "ix_class_members_tenant_id", "ix_teacher_assignments_tenant_id", ["tenant_id"])
    with op.batch_alter_table("teacher_assignments") as batch_op:
        batch_op.drop_constraint("uq_class_members", type_="unique")
        batch_op.create_unique_constraint(
            "uq_teacher_assignments", ["teacher_id", "class_id", "subject_id"]
        )
        batch_op.drop_column("member_type")

    op.drop_index("ix_classes_deleted_at", table_name="classes")
    with op.batch_alter_table("classes") as batch_op:
        batch_op.alter_column("class_teacher_id", new_column_name="homeroom_teacher_id")
        batch_op.drop_column("deleted_at")
    for table in ("teachers", "parents", "subjects"):
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("deleted_at")

    op.drop_index("ix_students_deleted_at", table_name="students")
    op.drop_index("ix_students_status", table_name="students")
    op.drop_index("ix_students_student_identifier", table_name="students")
    with op.batch_alter_table("students") as batch_op:
        batch_op.alter_column("student_identifier", new_column_name="admission_no")
        batch_op.alter_column("date_of_birth", new_column_name="dob")
        batch_op.drop_column("admission_date")
        batch_op.drop_column("status")
        batch_op.drop_column("deleted_at")
        batch_op.add_column(sa.Column("phone", sa.String(30), nullable=True))
    # Separate batch (see upgrade): unique ops on a renamed column.
    with op.batch_alter_table("students") as batch_op:
        batch_op.drop_constraint("uq_students_tenant_identifier", type_="unique")
        batch_op.create_unique_constraint(
            "uq_students_tenant_admission", ["tenant_id", "admission_no"]
        )

    # tenants: fold subscriptions + flags back into JSON columns.
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.add_column(sa.Column("trial_ends_at", UTCDateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("subscription_tier", sa.String(40), nullable=True))
        batch_op.add_column(sa.Column("subscription_meta", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("feature_flags", sa.JSON(), nullable=True))
    tenants = _table("tenants")
    subs = _table("subscriptions")
    flags = _table("feature_flags")
    for s in conn.execute(select(subs)).mappings().all():
        flag_rows = conn.execute(
            select(flags.c.key, flags.c.enabled).where(flags.c.tenant_id == s["tenant_id"])
        ).all()
        conn.execute(
            tenants.update().where(tenants.c.id == s["tenant_id"]).values(
                trial_ends_at=s["trial_ends_at"], subscription_tier=s["tier"],
                subscription_meta=(s["meta"] or {}),
                feature_flags=({k: e for k, e in flag_rows}),
            )
        )
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.alter_column("subscription_tier", nullable=False)
        batch_op.alter_column("subscription_meta", nullable=False)
        batch_op.alter_column("feature_flags", nullable=False)

    # users: fold memberships/grants back into tenant_id/role/full_name.
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("tenant_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("role", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("full_name", sa.String(200), nullable=True))
    users = _table("users")
    membership = _table("tenant_membership")
    grants = _table("user_roles")
    roles = _table("roles")
    role_names = {
        r["id"]: r["name"] for r in conn.execute(select(roles)).mappings().all()
    }
    for u in conn.execute(select(users)).mappings().all():
        m = conn.execute(
            select(membership).where(membership.c.user_id == u["id"]).limit(1)
        ).mappings().first()
        if m:
            tenant_id, role = m["tenant_id"], m["role"]
        else:
            g = conn.execute(
                select(grants).where(
                    grants.c.user_id == u["id"], grants.c.tenant_id.is_(None)
                ).limit(1)
            ).mappings().first()
            tenant_id = g["tenant_id"] if g else None
            role = role_names.get(g["role_id"], "student") if g else "student"
        conn.execute(
            users.update().where(users.c.id == u["id"]).values(
                tenant_id=tenant_id, role=role,
                full_name=f"{u['first_name']} {u['last_name']}".strip() or u["email"],
            )
        )
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("role", nullable=False)
        batch_op.alter_column("full_name", nullable=False)
        batch_op.create_foreign_key(
            "fk_users_tenant_id", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_unique_constraint("uq_users_tenant_email", ["tenant_id", "email"])
        batch_op.create_index("ix_users_role", ["role"])
        batch_op.create_index("ix_users_tenant_id", ["tenant_id"])
        batch_op.drop_index("ix_users_email")
        batch_op.drop_column("first_name")
        batch_op.drop_column("last_name")
        batch_op.drop_column("phone")
    op.create_index("ix_users_email", "users", ["email"])
    if _is_pg():
        op.execute(sa.text("ALTER TABLE users ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text("ALTER TABLE users FORCE ROW LEVEL SECURITY"))
        op.execute(sa.text(
            "CREATE POLICY tenant_isolation ON users FOR ALL "
            "USING (tenant_id::text = current_setting('app.tenant_id', true) "
            "OR current_setting('app.bypass_rls', true) = 'true')"
        ))
        op.execute(sa.text(
            "CREATE UNIQUE INDEX uq_users_superadmin_email ON users (email) "
            "WHERE tenant_id IS NULL"
        ))

    for table in (
        "assignment_files", "teacher_subjects", "feature_flags", "subscriptions",
        "schools", "user_roles", "tenant_membership", "roles",
    ):
        op.drop_table(table)
