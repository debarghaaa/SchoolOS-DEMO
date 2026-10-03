from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.constants import Role
from app.core.errors import DeadlinePassed, Forbidden, NotFound, ValidationFailed
from app.models.academic import ClassSubject, Enrollment, SchoolClass, Student, Subject, Teacher
from app.models.assignments import Assignment, Submission
from app.models.base import utcnow
from app.repositories.scoped import get_scoped
from app.services.academic import (
    enrolled_class_ids, parent_student_ids, require_teacher_class,
    student_profile, teacher_class_ids, teacher_profile,
)
from app.services.audit import Action, log_ctx

if TYPE_CHECKING:
    from app.api.deps import RequestContext


def _resolve_teacher(ctx: RequestContext, teacher_id: uuid.UUID | None) -> Teacher:
    if ctx.role == Role.TEACHER:
        return teacher_profile(ctx)
    if teacher_id is None:
        raise ValidationFailed("teacher_id is required when a school-admin creates an assignment.")
    return get_scoped(ctx.db, Teacher, ctx.tenant_id, teacher_id, "teacher")


def create_assignment(ctx: RequestContext, data) -> Assignment:
    cls = get_scoped(ctx.db, SchoolClass, ctx.tenant_id, data.class_id, "class")
    subject = get_scoped(ctx.db, Subject, ctx.tenant_id, data.subject_id, "subject")
    teacher = _resolve_teacher(ctx, data.teacher_id)
    if Role.TEACHER in ctx.roles and cls.id not in teacher_class_ids(ctx):
        raise Forbidden("You are not assigned to this class.")
    if ctx.db.scalar(select(ClassSubject.id).where(
            ClassSubject.class_id == cls.id, ClassSubject.subject_id == subject.id)) is None:
        raise ValidationFailed("Subject is not assigned to this class.")
    if data.due_at <= utcnow():
        raise ValidationFailed("Due date must be in the future.")
    row = Assignment(tenant_id=ctx.tenant_id, class_id=cls.id, subject_id=subject.id,
                     teacher_id=teacher.id, title=data.title, description=data.description,
                     due_at=data.due_at, max_score=data.max_score, status="draft")
    ctx.db.add(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ASSIGNMENT_CREATED, resource_type="assignment", resource_id=row.id,
            extra={"class_id": str(cls.id)})
    return row


def _assignment_for_teacher(ctx: RequestContext, assignment_id: uuid.UUID) -> Assignment:
    row = get_scoped(ctx.db, Assignment, ctx.tenant_id, assignment_id, "assignment")
    if Role.SCHOOL_ADMIN in ctx.roles:
        return row
    if row.class_id not in teacher_class_ids(ctx):
        raise Forbidden("You are not assigned to this class.")
    return row


def _assignment_visible(ctx: RequestContext, assignment_id: uuid.UUID) -> Assignment:
    """Read path for students/parents: only published assignments in scope."""
    row = get_scoped(ctx.db, Assignment, ctx.tenant_id, assignment_id, "assignment")
    if Role.SCHOOL_ADMIN in ctx.roles:
        return row
    if Role.TEACHER in ctx.roles:
        return _assignment_for_teacher(ctx, assignment_id)
    if row.status != "published":
        raise NotFound("Assignment not found.", resource="assignment")
    if Role.STUDENT in ctx.roles:
        if row.class_id not in enrolled_class_ids(ctx, student_profile(ctx).id):
            raise NotFound("Assignment not found.", resource="assignment")
        return row
    if Role.PARENT in ctx.roles:
        for sid in parent_student_ids(ctx):
            if row.class_id in enrolled_class_ids(ctx, sid):
                return row
        raise NotFound("Assignment not found.", resource="assignment")
    raise Forbidden("Not authorized.")


def get_assignment(ctx: RequestContext, assignment_id: uuid.UUID) -> Assignment:
    return _assignment_visible(ctx, assignment_id)


def list_assignments(ctx, *, page, size, class_id, subject_id, status):
    stmt = select(Assignment).where(Assignment.tenant_id == ctx.tenant_id)
    if Role.TEACHER in ctx.roles:
        allowed = teacher_class_ids(ctx)
        if not allowed:
            return [], 0
        stmt = stmt.where(Assignment.class_id.in_(allowed))
    elif Role.STUDENT in ctx.roles:
        classes = enrolled_class_ids(ctx, student_profile(ctx).id)
        if not classes:
            return [], 0
        stmt = stmt.where(Assignment.class_id.in_(classes), Assignment.status == "published")
    elif Role.PARENT in ctx.roles:
        classes: set[uuid.UUID] = set()
        for sid in parent_student_ids(ctx):
            classes |= enrolled_class_ids(ctx, sid)
        if not classes:
            return [], 0
        stmt = stmt.where(Assignment.class_id.in_(classes), Assignment.status == "published")
    if class_id is not None:
        if Role.TEACHER in ctx.roles:
            require_teacher_class(ctx, class_id)
        stmt = stmt.where(Assignment.class_id == class_id)
    if subject_id is not None:
        get_scoped(ctx.db, Subject, ctx.tenant_id, subject_id, "subject")
        stmt = stmt.where(Assignment.subject_id == subject_id)
    if status is not None:
        if status not in ("draft", "published", "archived"):
            raise ValidationFailed("Invalid status filter.")
        stmt = stmt.where(Assignment.status == status)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Assignment.due_at).offset((page - 1) * size).limit(size)).all())
    return items, total


def update_assignment(ctx: RequestContext, assignment_id: uuid.UUID, data) -> Assignment:
    row = _assignment_for_teacher(ctx, assignment_id)
    payload = data.model_dump(exclude_unset=True)
    if "due_at" in payload and payload["due_at"] is not None and row.status == "published":
        # Moving a published deadline is allowed but must stay sane.
        if payload["due_at"] <= utcnow():
            raise ValidationFailed("Due date must be in the future.")
    for key, value in payload.items():
        setattr(row, key, value)
    ctx.db.flush()
    log_ctx(ctx, action=Action.ASSIGNMENT_UPDATED, resource_type="assignment", resource_id=row.id,
            extra={"fields": sorted(payload)})
    return row


def publish_assignment(ctx: RequestContext, assignment_id: uuid.UUID) -> Assignment:
    from app.services.notifications import publish_event

    row = _assignment_for_teacher(ctx, assignment_id)
    if row.status == "published":
        return row
    row.status = "published"
    row.published_at = utcnow()
    ctx.db.flush()
    log_ctx(ctx, action=Action.ASSIGNMENT_PUBLISHED, resource_type="assignment", resource_id=row.id)
    student_ids = ctx.db.scalars(select(Enrollment.student_id).where(
        Enrollment.class_id == row.class_id, Enrollment.tenant_id == ctx.tenant_id,
        Enrollment.status == "active")).all()
    if student_ids:
        user_ids = [u for u in ctx.db.scalars(select(Student.user_id).where(
            Student.id.in_(student_ids), Student.user_id.is_not(None))).all() if u is not None]
        if user_ids:
            publish_event(ctx.db, tenant_id=ctx.tenant_id, type="assignment_created",
                          title=f"New assignment: {row.title}",
                          body=f"Due {row.due_at.isoformat()}.",
                          user_ids=user_ids, data={"assignment_id": str(row.id), "class_id": str(row.class_id)})
    return row


def archive_assignment(ctx: RequestContext, assignment_id: uuid.UUID) -> Assignment:
    row = _assignment_for_teacher(ctx, assignment_id)
    row.status = "archived"
    ctx.db.flush()
    log_ctx(ctx, action=Action.ASSIGNMENT_ARCHIVED, resource_type="assignment", resource_id=row.id)
    return row


# ---------------- Submissions ----------------

def _submission_scope(ctx: RequestContext, submission: Submission) -> Submission:
    if Role.SCHOOL_ADMIN in ctx.roles:
        return submission
    if Role.TEACHER in ctx.roles:
        assignment = ctx.db.get(Assignment, submission.assignment_id)
        if assignment is None or assignment.class_id not in teacher_class_ids(ctx):
            raise Forbidden("You are not assigned to this class.")
        return submission
    if Role.STUDENT in ctx.roles:
        if submission.student_id != student_profile(ctx).id:
            raise Forbidden("You can only view your own submissions.")
        return submission
    if Role.PARENT in ctx.roles:
        if submission.student_id not in parent_student_ids(ctx):
            raise Forbidden("You are not linked to this student.")
        return submission
    raise Forbidden("Not authorized.")


def submit(ctx: RequestContext, assignment_id: uuid.UUID, data) -> Submission:
    from app.services.notifications import publish_event

    if Role.STUDENT not in ctx.roles:
        raise Forbidden("Only students can submit assignments.")
    student = student_profile(ctx)
    assignment = _assignment_visible(ctx, assignment_id)
    if assignment.class_id not in enrolled_class_ids(ctx, student.id):
        raise Forbidden("You are not enrolled in this class.")
    if data.file_id is not None:
        from app.models.file import StoredFile
        f = get_scoped(ctx.db, StoredFile, ctx.tenant_id, data.file_id, "file")
        if f.owner_id != ctx.user.id:
            raise Forbidden("You can only attach your own files.")
    now = utcnow()
    existing = ctx.db.scalar(select(Submission).where(
        Submission.assignment_id == assignment.id, Submission.student_id == student.id,
        Submission.tenant_id == ctx.tenant_id))
    if existing is not None and now > assignment.due_at:
        raise DeadlinePassed()  # resubmission after the deadline is rejected server-side
    if existing is None:
        row = Submission(tenant_id=ctx.tenant_id, assignment_id=assignment.id, student_id=student.id,
                         content=data.content, file_id=data.file_id, submitted_at=now,
                         is_late=now > assignment.due_at, status="submitted")
        ctx.db.add(row)
    else:
        existing.content = data.content
        existing.file_id = data.file_id
        existing.submitted_at = now
        existing.is_late = now > assignment.due_at
        existing.status = "submitted"
        row = existing
    ctx.db.flush()
    log_ctx(ctx, action=Action.SUBMISSION_CREATED, resource_type="submission", resource_id=row.id,
            extra={"assignment_id": str(assignment.id), "is_late": row.is_late})
    teacher = ctx.db.get(Teacher, assignment.teacher_id)
    if teacher is not None and teacher.user_id is not None:
        publish_event(ctx.db, tenant_id=ctx.tenant_id, type="submission_received",
                      title=f"Submission received: {assignment.title}",
                      body=f"{student.full_name} submitted{' late' if row.is_late else ''}.",
                      user_ids=[teacher.user_id],
                      data={"assignment_id": str(assignment.id), "submission_id": str(row.id)})
    return row


def list_submissions(ctx, *, page, size, assignment_id):
    assignment = get_scoped(ctx.db, Assignment, ctx.tenant_id, assignment_id, "assignment")
    if Role.TEACHER in ctx.roles and assignment.class_id not in teacher_class_ids(ctx):
        raise Forbidden("You are not assigned to this class.")
    if Role.SCHOOL_ADMIN not in ctx.roles and Role.TEACHER not in ctx.roles:
        raise Forbidden("Not authorized.")
    stmt = select(Submission).where(Submission.assignment_id == assignment.id,
                                    Submission.tenant_id == ctx.tenant_id)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Submission.submitted_at.desc()).offset((page - 1) * size).limit(size)).all())
    return items, total


def get_submission(ctx: RequestContext, submission_id: uuid.UUID) -> Submission:
    row = get_scoped(ctx.db, Submission, ctx.tenant_id, submission_id, "submission")
    return _submission_scope(ctx, row)


def my_submissions(ctx, *, page, size, assignment_id):
    student = student_profile(ctx)
    stmt = select(Submission).where(Submission.student_id == student.id,
                                    Submission.tenant_id == ctx.tenant_id)
    if assignment_id is not None:
        _assignment_visible(ctx, assignment_id)
        stmt = stmt.where(Submission.assignment_id == assignment_id)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Submission.submitted_at.desc()).offset((page - 1) * size).limit(size)).all())
    return items, total
