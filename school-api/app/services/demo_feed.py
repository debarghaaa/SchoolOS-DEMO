from __future__ import annotations

"""Temporary demo presence feed served from the local database.

Same authorization matrix as the Supabase feed, enforced here in code:
school-admins read faculty/staff of their tenant plus the school-wide
student aggregate, teachers read students of their assigned classes only,
students read their own demo row, parents read their linked children's
rows, everyone else gets 403. Demo-only behaviour: when a new day
has no punch rows yet, the most recent demo day is cloned forward so the
islands always light up.
"""

import datetime as dt
import uuid

from sqlalchemy import func, select

from app.api.deps import RequestContext
from app.core.errors import Forbidden
from app.models import (DemoFaculty, DemoPresence, DemoStaff, DemoStudent,
                         Parent, ParentStudent, Student)
from app.services.supabase_tokens import teacher_class_labels

AUDIENCES = ("faculty", "staff", "student")


def _snapshot_directory(ctx: RequestContext, audience: str) -> tuple[list, list[uuid.UUID] | None]:
    """Returns (directory rows, visible person-id filter or None for all)."""
    match audience:
        case "faculty":
            if "school-admin" not in ctx.roles:
                raise Forbidden("The faculty demo feed is restricted to school admins.")
            rows = ctx.db.scalars(select(DemoFaculty).where(
                DemoFaculty.tenant_id == ctx.tenant_id).order_by(DemoFaculty.name)).all()
            return list(rows), None
        case "staff":
            if "school-admin" not in ctx.roles:
                raise Forbidden("The staff demo feed is restricted to school admins.")
            srows = ctx.db.scalars(select(DemoStaff).where(
                DemoStaff.tenant_id == ctx.tenant_id).order_by(DemoStaff.name)).all()
            return list(srows), None
        case _:
            return _snapshot_students(ctx)


def _demo_pairing(ctx: RequestContext) -> tuple[list[uuid.UUID], list[DemoStudent]]:
    """Stable demo-only identity pairing.

    The demo roster is fictional (seeded names, no user links), so a login
    resolves to "own" demo row(s) by position: real students in identifier
    order <-> demo rows in class/roll order. Production identity comes from
    Supabase RLS instead; this pairing only shapes the demo payload.
    """
    student_ids = ctx.db.scalars(select(Student.id).where(
        Student.tenant_id == ctx.tenant_id, Student.deleted_at.is_(None),
    ).order_by(Student.student_identifier)).all()
    demo_rows = ctx.db.scalars(select(DemoStudent).where(
        DemoStudent.tenant_id == ctx.tenant_id,
    ).order_by(DemoStudent.class_name, DemoStudent.roll)).all()
    return list(student_ids), list(demo_rows)


def _demo_rows_for(ctx: RequestContext, wanted: list[uuid.UUID]) -> list[DemoStudent]:
    student_ids, demo_rows = _demo_pairing(ctx)
    if not demo_rows:
        return []
    pos = {sid: i for i, sid in enumerate(student_ids)}
    picked: list[DemoStudent] = []
    seen: set[uuid.UUID] = set()
    for sid in wanted:
        if sid in pos:
            row = demo_rows[pos[sid] % len(demo_rows)]
            if row.id not in seen:
                seen.add(row.id)
                picked.append(row)
    return picked


def _snapshot_students(ctx: RequestContext) -> tuple[list, list[uuid.UUID] | None]:
    """Student audience: teachers see assigned classes, students own row,
    parents linked children. Admins use the /school-attendance aggregate."""
    if "teacher" in ctx.roles:
        labels = teacher_class_labels(ctx)
        q = select(DemoStudent).where(
            DemoStudent.tenant_id == ctx.tenant_id,
            DemoStudent.class_name.in_(labels),
        )
        strows = ctx.db.scalars(q.order_by(DemoStudent.class_name, DemoStudent.roll)).all()
        return list(strows), [r.id for r in strows]
    if "student" in ctx.roles:
        me = ctx.db.scalar(select(Student.id).where(
            Student.tenant_id == ctx.tenant_id, Student.user_id == ctx.user.id,
            Student.deleted_at.is_(None)))
        rows = _demo_rows_for(ctx, [me] if me is not None else [])
        return rows, [r.id for r in rows]
    if "parent" in ctx.roles:
        children = ctx.db.scalars(select(ParentStudent.student_id)
            .join(Parent, Parent.id == ParentStudent.parent_id).where(
                Parent.tenant_id == ctx.tenant_id, Parent.user_id == ctx.user.id,
                Parent.deleted_at.is_(None))).all()
        rows = _demo_rows_for(ctx, list(children))
        return rows, [r.id for r in rows]
    raise Forbidden("The student demo feed is available to teachers, students and parents.")


def _ensure_today(ctx: RequestContext, audience: str) -> dt.date:
    """Clone the most recent demo day forward when today has no rows."""
    today = dt.date.today()
    assert ctx.tenant_id is not None
    exists = ctx.db.scalar(select(DemoPresence.id).where(
        DemoPresence.tenant_id == ctx.tenant_id,
        DemoPresence.audience == audience, DemoPresence.day == today))
    if exists is not None:
        return today
    latest = ctx.db.scalar(select(func.max(DemoPresence.day)).where(
        DemoPresence.tenant_id == ctx.tenant_id, DemoPresence.audience == audience))
    if latest is None:
        return today
    rows = ctx.db.scalars(select(DemoPresence).where(
        DemoPresence.tenant_id == ctx.tenant_id,
        DemoPresence.audience == audience, DemoPresence.day == latest)).all()
    for r in rows:
        ctx.db.add(DemoPresence(tenant_id=ctx.tenant_id, audience=audience,
                                person_id=r.person_id, day=today, status=r.status,
                                punch_in=r.punch_in, punch_out=r.punch_out))
    ctx.db.flush()
    return today


def _row_dict(row) -> dict:
    base = {"id": str(row.id), "name": row.name, "initials": row.initials}
    for field in ("subject", "dept", "role", "staff_type", "grade", "section",
                  "roll", "class_name"):
        if hasattr(row, field):
            base[field] = getattr(row, field)
    return base


def school_attendance(ctx: RequestContext) -> dict:
    """Whole-tenant student presence counts (admin overview island).

    Aggregates only — per-student detail stays on the teacher-scoped
    ``/students`` feed. Mirrors the Supabase policy that grants school-admins
    school-wide student presence reads.
    """
    if ctx.tenant_id is None:
        raise Forbidden("Platform sessions cannot open the demo presence feed.")
    if "school-admin" not in ctx.roles:
        raise Forbidden("School-wide student attendance is restricted to school admins.")
    today = _ensure_today(ctx, "student")
    total = ctx.db.scalar(select(func.count()).select_from(DemoStudent).where(
        DemoStudent.tenant_id == ctx.tenant_id)) or 0
    present = ctx.db.scalar(select(func.count()).select_from(DemoPresence).where(
        DemoPresence.tenant_id == ctx.tenant_id, DemoPresence.audience == "student",
        DemoPresence.day == today, DemoPresence.status == "present")) or 0
    present = min(present, total)
    return {"day": today.isoformat(), "total": total,
            "present": present, "absent": total - present}


def day_snapshot(ctx: RequestContext, audience: str) -> dict:
    if ctx.tenant_id is None:
        raise Forbidden("Platform sessions cannot open the demo presence feed.")
    if audience not in AUDIENCES:
        raise Forbidden("Unknown demo feed audience.")
    directory, visible = _snapshot_directory(ctx, audience)
    today = _ensure_today(ctx, audience)
    q = select(DemoPresence).where(
        DemoPresence.tenant_id == ctx.tenant_id,
        DemoPresence.audience == audience, DemoPresence.day == today)
    if visible is not None:
        q = q.where(DemoPresence.person_id.in_(visible))
    presence = [{
        "person_id": str(p.person_id), "status": p.status,
        "punch_in": p.punch_in.isoformat() if p.punch_in else None,
        "punch_out": p.punch_out.isoformat() if p.punch_out else None,
    } for p in ctx.db.scalars(q).all()]
    return {"day": today.isoformat(), "directory": [_row_dict(r) for r in directory],
            "presence": presence}
