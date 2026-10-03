from __future__ import annotations

import datetime as dt
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.constants import Role
from app.core.errors import Forbidden, ScheduleConflict, ValidationFailed
from app.models.academic import Enrollment, SchoolClass, Student, Subject, Teacher
from app.models.timetable import Timetable
from app.repositories.scoped import get_scoped
from app.services.academic import (
    class_scope_ids, enrolled_class_ids, parent_student_ids, student_profile, teacher_profile,
)
from app.services.audit import Action, log_ctx

if TYPE_CHECKING:
    from app.api.deps import RequestContext


def _check_times(start: dt.time, end: dt.time) -> None:
    if start >= end:
        raise ValidationFailed("Slot start_time must be before end_time.")


def _overlaps(start_a, end_a, start_b, end_b) -> bool:
    return start_a < end_b and start_b < end_a


def _assert_no_conflict(ctx, *, day, start, end, class_id, teacher_id, room, exclude_id=None) -> None:
    stmt = select(Timetable).where(Timetable.tenant_id == ctx.tenant_id,
                                       Timetable.day_of_week == day)
    if exclude_id is not None:
        stmt = stmt.where(Timetable.id != exclude_id)
    for slot in ctx.db.scalars(stmt).all():
        if not _overlaps(start, end, slot.start_time, slot.end_time):
            continue
        if slot.class_id == class_id:
            raise ScheduleConflict("Class already has a lesson at this time.",
                                   details={"conflict": "class", "slot_id": str(slot.id)})
        if slot.teacher_id == teacher_id:
            raise ScheduleConflict("Teacher already has a lesson at this time.",
                                   details={"conflict": "teacher", "slot_id": str(slot.id)})
        if room and slot.room == room:
            raise ScheduleConflict("Room is already booked at this time.",
                                   details={"conflict": "room", "slot_id": str(slot.id)})


def _notify_change(ctx: RequestContext, slot: Timetable, op: str) -> None:
    from app.services.notifications import publish_event

    student_ids = ctx.db.scalars(select(Enrollment.student_id).where(
        Enrollment.class_id == slot.class_id, Enrollment.tenant_id == ctx.tenant_id,
        Enrollment.status == "active")).all()
    user_ids = []
    if student_ids:
        user_ids = [u for u in ctx.db.scalars(select(Student.user_id).where(
            Student.id.in_(student_ids), Student.user_id.is_not(None))).all() if u is not None]
    teacher = ctx.db.get(Teacher, slot.teacher_id)
    if teacher is not None and teacher.user_id is not None:
        user_ids.append(teacher.user_id)
    if not user_ids:
        return
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    publish_event(ctx.db, tenant_id=ctx.tenant_id, type="timetable_change",
                  title=f"Timetable {op}",
                  body=f"Day {days[slot.day_of_week]} {slot.start_time.strftime('%H:%M')}-"
                       f"{slot.end_time.strftime('%H:%M')} was {op}.",
                  user_ids=user_ids, data={"slot_id": str(slot.id), "class_id": str(slot.class_id)})


def create_slot(ctx: RequestContext, data) -> Timetable:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, data.class_id, "class")
    get_scoped(ctx.db, Subject, ctx.tenant_id, data.subject_id, "subject")
    teacher = get_scoped(ctx.db, Teacher, ctx.tenant_id, data.teacher_id, "teacher")
    _check_times(data.start_time, data.end_time)
    _assert_no_conflict(ctx, day=data.day_of_week, start=data.start_time, end=data.end_time,
                        class_id=cls.id, teacher_id=teacher.id, room=data.room)
    slot = Timetable(tenant_id=ctx.tenant_id, class_id=cls.id, subject_id=data.subject_id,
                         teacher_id=teacher.id, day_of_week=data.day_of_week,
                         start_time=data.start_time, end_time=data.end_time, room=data.room)
    ctx.db.add(slot)
    ctx.db.flush()
    log_ctx(ctx, action=Action.TIMETABLE_CHANGED, resource_type="timetable_slot", resource_id=slot.id, extra={"op": "create"})
    _notify_change(ctx, slot, "updated")
    return slot


def update_slot(ctx: RequestContext, slot_id: uuid.UUID, data) -> Timetable:
    slot = get_scoped(ctx.db, Timetable, ctx.tenant_id, slot_id, "timetable_slot")
    payload = data.model_dump(exclude_unset=True)
    if "subject_id" in payload and payload["subject_id"] is not None:
        get_scoped(ctx.db, Subject, ctx.tenant_id, payload["subject_id"], "subject")
    teacher_id = payload.get("teacher_id", slot.teacher_id)
    if "teacher_id" in payload and payload["teacher_id"] is not None:
        get_scoped(ctx.db, Teacher, ctx.tenant_id, payload["teacher_id"], "teacher")
    day = payload.get("day_of_week", slot.day_of_week)
    start = payload.get("start_time", slot.start_time)
    end = payload.get("end_time", slot.end_time)
    room = payload.get("room", slot.room)
    _check_times(start, end)
    _assert_no_conflict(ctx, day=day, start=start, end=end, class_id=slot.class_id,
                        teacher_id=teacher_id, room=room, exclude_id=slot.id)
    for key, value in payload.items():
        setattr(slot, key, value)
    ctx.db.flush()
    log_ctx(ctx, action=Action.TIMETABLE_CHANGED, resource_type="timetable_slot", resource_id=slot.id, extra={"op": "update"})
    _notify_change(ctx, slot, "updated")
    return slot


def delete_slot(ctx: RequestContext, slot_id: uuid.UUID) -> None:
    slot = get_scoped(ctx.db, Timetable, ctx.tenant_id, slot_id, "timetable_slot")
    ctx.db.delete(slot)
    ctx.db.flush()
    log_ctx(ctx, action=Action.TIMETABLE_CHANGED, resource_type="timetable_slot", resource_id=slot_id, extra={"op": "delete"})


def _scoped_stmt(ctx: RequestContext, *, class_id=None, teacher_id=None, student_id=None, day=None):
    stmt = select(Timetable).where(Timetable.tenant_id == ctx.tenant_id)
    if Role.TEACHER in ctx.roles:
        own = teacher_profile(ctx)
        if teacher_id is not None and teacher_id != own.id:
            raise Forbidden("You can only view your own timetable.")
        stmt = stmt.where(Timetable.teacher_id == own.id)
    elif Role.STUDENT in ctx.roles:
        own_classes = enrolled_class_ids(ctx, student_profile(ctx).id)
        if not own_classes:
            return None
        stmt = stmt.where(Timetable.class_id.in_(own_classes))
    elif Role.PARENT in ctx.roles:
        classes: set[uuid.UUID] = set()
        for sid in parent_student_ids(ctx):
            classes |= enrolled_class_ids(ctx, sid)
        if not classes:
            return None
        stmt = stmt.where(Timetable.class_id.in_(classes))
    elif Role.SCHOOL_ADMIN in ctx.roles:  # school-admin may filter freely within the tenant
        if teacher_id is not None:
            get_scoped(ctx.db, Teacher, ctx.tenant_id, teacher_id, "teacher")
            stmt = stmt.where(Timetable.teacher_id == teacher_id)
        if student_id is not None:
            from app.services.academic import require_student
            student = require_student(ctx, student_id)
            classes = enrolled_class_ids(ctx, student.id)
            if not classes:
                return None
            stmt = stmt.where(Timetable.class_id.in_(classes))
    else:
        raise Forbidden("Not authorized.")
    if class_id is not None:
        scope = class_scope_ids(ctx)
        if scope is not None and class_id not in scope:
            raise Forbidden("You are not authorized to view this class.")
        get_scoped(ctx.db, SchoolClass, ctx.tenant_id, class_id, "class")
        stmt = stmt.where(Timetable.class_id == class_id)
    if day is not None:
        if day < 0 or day > 6:
            raise ValidationFailed("day_of_week must be between 0 and 6.")
        stmt = stmt.where(Timetable.day_of_week == day)
    return stmt


def list_slots(ctx, *, page, size, class_id, teacher_id, student_id, day):
    stmt = _scoped_stmt(ctx, class_id=class_id, teacher_id=teacher_id, student_id=student_id, day=day)
    if stmt is None:
        return [], 0
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Timetable.day_of_week, Timetable.start_time)
                                .offset((page - 1) * size).limit(size)).all())
    return items, total
