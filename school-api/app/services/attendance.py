from __future__ import annotations

import datetime as dt
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.constants import Role
from app.core.errors import Duplicate, Forbidden, ValidationFailed
from app.models.academic import Enrollment, ParentStudent, SchoolClass, Student
from app.models.attendance import Attendance
from app.repositories.scoped import get_scoped
from app.services.academic import (
    class_scope_ids, enrolled_class_ids, parent_student_ids, require_student,
    require_teacher_class, student_profile,
)
from app.services.audit import Action, log_ctx

if TYPE_CHECKING:
    from app.api.deps import RequestContext

STATUSES = ("present", "absent", "late", "excused")


def _check_status(status: str) -> None:
    if status not in STATUSES:
        raise ValidationFailed(f"Status must be one of: {', '.join(STATUSES)}.")


def _require_enrolled(ctx: RequestContext, student_id: uuid.UUID, class_id: uuid.UUID) -> None:
    row = ctx.db.scalar(select(Enrollment.id).where(
        Enrollment.student_id == student_id, Enrollment.class_id == class_id,
        Enrollment.tenant_id == ctx.tenant_id, Enrollment.status == "active"))
    if row is None:
        raise ValidationFailed("Student is not actively enrolled in this class.")


def _marking_class(ctx: RequestContext, class_id: uuid.UUID) -> SchoolClass:
    if Role.SCHOOL_ADMIN in ctx.roles:
        return get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    return require_teacher_class(ctx, class_id)


def _notify_parents(ctx: RequestContext, student_id: uuid.UUID, date: dt.date, status: str) -> None:
    from app.models.academic import Parent
    from app.services.notifications import publish_event

    # Resolve guardian login users: ParentStudent -> Parent.user_id
    user_ids = [u for u in ctx.db.scalars(select(Parent.user_id).join(ParentStudent, ParentStudent.parent_id == Parent.id).where(
        ParentStudent.student_id == student_id, Parent.user_id.is_not(None))).all() if u is not None]
    if not user_ids:
        return
    student = ctx.db.get(Student, student_id)
    name = student.full_name if student else "Your child"
    publish_event(ctx.db, tenant_id=ctx.tenant_id, type="attendance_update",
                  title=f"Attendance: {name} marked {status}",
                  body=f"{name} was marked {status} on {date.isoformat()}.",
                  user_ids=user_ids, data={"student_id": str(student_id), "date": date.isoformat(), "status": status})


def mark(ctx: RequestContext, data) -> Attendance:
    _check_status(data.status)
    cls = _marking_class(ctx, data.class_id)
    student = get_scoped(ctx.db, Student, ctx.tenant_id, data.student_id, "student")
    _require_enrolled(ctx, student.id, cls.id)
    # Daily grain: one record per student per day (class is marking context).
    dup = ctx.db.scalar(select(Attendance.id).where(
        Attendance.tenant_id == ctx.tenant_id, Attendance.student_id == student.id,
        Attendance.date == data.date))
    if dup is not None:
        raise Duplicate("Attendance already marked for this student on this date.")
    row = Attendance(tenant_id=ctx.tenant_id, class_id=cls.id, student_id=student.id,
                           date=data.date, status=data.status, marked_by=ctx.user.id,
                           remarks=data.remarks)
    ctx.db.add(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ATTENDANCE_MARKED, resource_type="attendance", resource_id=row.id,
            extra={"student_id": str(student.id), "status": data.status})
    _notify_parents(ctx, student.id, data.date, data.status)
    return row


def bulk_mark(ctx: RequestContext, data) -> list[Attendance]:
    cls = _marking_class(ctx, data.class_id)
    for item in data.records:
        _check_status(item.status)
    # Validate everything first: the batch is atomic.
    seen: set[uuid.UUID] = set()
    for item in data.records:
        if item.student_id in seen:
            raise ValidationFailed(f"Duplicate student in batch: {item.student_id}.")
        seen.add(item.student_id)
        get_scoped(ctx.db, Student, ctx.tenant_id, item.student_id, "student")
        _require_enrolled(ctx, item.student_id, cls.id)
        if ctx.db.scalar(select(Attendance.id).where(
                Attendance.tenant_id == ctx.tenant_id, Attendance.student_id == item.student_id,
                Attendance.date == data.date)) is not None:
            raise Duplicate(f"Attendance already marked for student {item.student_id} on {data.date}.")
    rows = []
    for item in data.records:
        row = Attendance(tenant_id=ctx.tenant_id, class_id=cls.id, student_id=item.student_id,
                               date=data.date, status=item.status, marked_by=ctx.user.id,
                               remarks=item.remarks)
        ctx.db.add(row)
        rows.append(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ATTENDANCE_MARKED, resource_type="attendance",
            extra={"op": "bulk", "class_id": str(cls.id), "date": data.date.isoformat(), "count": len(rows)})
    return rows


def update_record(ctx: RequestContext, record_id: uuid.UUID, data) -> Attendance:
    _check_status(data.status)
    row = get_scoped(ctx.db, Attendance, ctx.tenant_id, record_id, "attendance")
    _marking_class(ctx, row.class_id)
    row.status = data.status
    if data.remarks is not None:
        row.remarks = data.remarks
    row.marked_by = ctx.user.id
    ctx.db.flush()
    log_ctx(ctx, action=Action.ATTENDANCE_UPDATED, resource_type="attendance", resource_id=row.id,
            extra={"status": data.status})
    return row


def history(ctx, *, page, size, class_id, student_id, date_from, date_to):
    stmt = select(Attendance).where(Attendance.tenant_id == ctx.tenant_id)
    if Role.TEACHER in ctx.roles:
        allowed = class_scope_ids(ctx)
        if not allowed:
            return [], 0
        stmt = stmt.where(Attendance.class_id.in_(allowed))
    elif Role.STUDENT in ctx.roles:
        student_id = student_profile(ctx).id
    elif Role.PARENT in ctx.roles:
        linked = parent_student_ids(ctx)
        if not linked:
            return [], 0
        if student_id is not None and student_id not in linked:
            raise Forbidden("You are not linked to this student.")
        stmt = stmt.where(Attendance.student_id.in_(linked if student_id is None else [student_id]))
        student_id = None  # already applied
    if class_id is not None:
        if Role.TEACHER in ctx.roles:
            require_teacher_class(ctx, class_id)
        elif Role.STUDENT in ctx.roles and class_id not in enrolled_class_ids(ctx, student_profile(ctx).id):
            raise Forbidden("You are not enrolled in this class.")
        elif Role.SCHOOL_ADMIN in ctx.roles:
            get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
        stmt = stmt.where(Attendance.class_id == class_id)
    if student_id is not None:
        require_student(ctx, student_id)
        stmt = stmt.where(Attendance.student_id == student_id)
    if date_from is not None:
        stmt = stmt.where(Attendance.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Attendance.date <= date_to)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Attendance.date.desc()).offset((page - 1) * size).limit(size)).all())
    return items, total


def _stats(rows) -> dict:
    counts = {s: 0 for s in STATUSES}
    for status in rows:
        counts[status] = counts.get(status, 0) + 1
    total = sum(counts.values())
    present_like = counts["present"] + counts["late"]
    return {
        "total": total, "present": counts["present"], "absent": counts["absent"],
        "late": counts["late"], "excused": counts["excused"],
        "percentage": round(100.0 * present_like / total, 2) if total else 0.0,
    }


def student_stats(ctx, student_id, date_from=None, date_to=None) -> dict:
    require_student(ctx, student_id)
    stmt = select(Attendance.status).where(
        Attendance.tenant_id == ctx.tenant_id, Attendance.student_id == student_id)
    if date_from is not None:
        stmt = stmt.where(Attendance.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Attendance.date <= date_to)
    return _stats(ctx.db.scalars(stmt).all())


def class_stats(ctx, class_id, date_from=None, date_to=None) -> dict:
    if Role.TEACHER in ctx.roles and Role.SCHOOL_ADMIN not in ctx.roles:
        require_teacher_class(ctx, class_id)
    else:
        get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
    stmt = select(Attendance.status).where(
        Attendance.tenant_id == ctx.tenant_id, Attendance.class_id == class_id)
    if date_from is not None:
        stmt = stmt.where(Attendance.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Attendance.date <= date_to)
    return _stats(ctx.db.scalars(stmt).all())
