from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.constants import Role
from app.core.errors import Duplicate, Forbidden, NotFound, ValidationFailed
from app.models.academic import Student, Teacher
from app.models.assignments import Assignment, Grade, Submission
from app.models.base import utcnow
from app.repositories.scoped import get_scoped
from app.services.academic import parent_student_ids, student_profile, teacher_class_ids
from app.services.audit import Action, log_ctx

if TYPE_CHECKING:
    from app.api.deps import RequestContext


def _grader_teacher_id(ctx: RequestContext) -> uuid.UUID | None:
    """Teacher profile of the grader, if any (admins grade without one)."""
    return ctx.db.scalar(select(Teacher.id).where(
        Teacher.user_id == ctx.user.id, Teacher.tenant_id == ctx.tenant_id))


def _gradable_submission(ctx: RequestContext, submission_id: uuid.UUID) -> tuple[Submission, Assignment]:
    submission = get_scoped(ctx.db, Submission, ctx.tenant_id, submission_id, "submission")
    assignment = ctx.db.get(Assignment, submission.assignment_id)
    if assignment is None:
        raise NotFound("Assignment not found.", resource="assignment")
    if Role.TEACHER in ctx.roles and assignment.class_id not in teacher_class_ids(ctx):
        raise Forbidden("You are not assigned to this class.")
    return submission, assignment


def grade_submission(ctx: RequestContext, submission_id: uuid.UUID, data) -> Grade:
    submission, assignment = _gradable_submission(ctx, submission_id)
    if ctx.db.scalar(select(Grade.id).where(Grade.submission_id == submission.id)) is not None:
        raise Duplicate("Submission is already graded. Update the grade instead.")
    if data.score > assignment.max_score:
        raise ValidationFailed(f"Score cannot exceed {assignment.max_score}.")
    grade = Grade(tenant_id=ctx.tenant_id, submission_id=submission.id,
                  student_id=submission.student_id, teacher_id=_grader_teacher_id(ctx),
                  score=data.score, max_score=assignment.max_score,
                  feedback=data.feedback, graded_at=utcnow())
    submission.status = "graded"
    ctx.db.add(grade)
    ctx.db.flush()
    log_ctx(ctx, action=Action.GRADE_CREATED, resource_type="grade", resource_id=grade.id,
            extra={"submission_id": str(submission.id), "score": data.score})
    return grade


def update_grade(ctx: RequestContext, grade_id: uuid.UUID, data) -> Grade:
    grade = get_scoped(ctx.db, Grade, ctx.tenant_id, grade_id, "grade")
    submission, assignment = _gradable_submission(ctx, grade.submission_id)
    payload = data.model_dump(exclude_unset=True)
    if "score" in payload and payload["score"] is not None and payload["score"] > assignment.max_score:
        raise ValidationFailed(f"Score cannot exceed {assignment.max_score}.")
    for key, value in payload.items():
        setattr(grade, key, value)
    grade.teacher_id = _grader_teacher_id(ctx)
    grade.graded_at = utcnow()
    ctx.db.flush()
    log_ctx(ctx, action=Action.GRADE_UPDATED, resource_type="grade", resource_id=grade.id,
            extra={"fields": sorted(payload)})
    return grade


def publish_grade(ctx: RequestContext, grade_id: uuid.UUID) -> Grade:
    from app.services.notifications import publish_event

    grade = get_scoped(ctx.db, Grade, ctx.tenant_id, grade_id, "grade")
    submission, assignment = _gradable_submission(ctx, grade.submission_id)
    if grade.published_at is not None:
        return grade
    grade.published_at = utcnow()
    ctx.db.flush()
    log_ctx(ctx, action=Action.GRADE_PUBLISHED, resource_type="grade", resource_id=grade.id)
    student = ctx.db.get(Student, submission.student_id)
    if student is not None and student.user_id is not None:
        publish_event(ctx.db, tenant_id=ctx.tenant_id, type="grade_published",
                      title=f"Grade published: {assignment.title}",
                      body=f"You scored {grade.score} / {assignment.max_score}.",
                      user_ids=[student.user_id],
                      data={"grade_id": str(grade.id), "assignment_id": str(assignment.id)})
    return grade


def _grade_visible(ctx: RequestContext, grade: Grade) -> Grade:
    if Role.SCHOOL_ADMIN in ctx.roles or Role.TEACHER in ctx.roles:
        if Role.TEACHER in ctx.roles:
            submission = ctx.db.get(Submission, grade.submission_id)
            assignment = ctx.db.get(Assignment, submission.assignment_id) if submission else None
            if assignment is None or assignment.class_id not in teacher_class_ids(ctx):
                raise Forbidden("You are not assigned to this class.")
        return grade
    if grade.published_at is None:
        raise NotFound("Grade not found.", resource="grade")
    submission = ctx.db.get(Submission, grade.submission_id)
    if submission is None:
        raise NotFound("Grade not found.", resource="grade")
    if Role.STUDENT in ctx.roles and submission.student_id != student_profile(ctx).id:
        raise NotFound("Grade not found.", resource="grade")
    if Role.PARENT in ctx.roles and submission.student_id not in parent_student_ids(ctx):
        raise NotFound("Grade not found.", resource="grade")
    return grade


def get_grade(ctx: RequestContext, grade_id: uuid.UUID) -> Grade:
    grade = get_scoped(ctx.db, Grade, ctx.tenant_id, grade_id, "grade")
    return _grade_visible(ctx, grade)


def list_grades(ctx, *, page, size, assignment_id, student_id, published_only):
    stmt = select(Grade).join(Submission, Submission.id == Grade.submission_id).where(
        Grade.tenant_id == ctx.tenant_id)
    if Role.TEACHER in ctx.roles:
        allowed = teacher_class_ids(ctx)
        if not allowed:
            return [], 0
        stmt = stmt.join(Assignment, Assignment.id == Submission.assignment_id).where(Assignment.class_id.in_(allowed))
    elif Role.STUDENT in ctx.roles:
        stmt = stmt.where(Submission.student_id == student_profile(ctx).id, Grade.published_at.is_not(None))
    elif Role.PARENT in ctx.roles:
        linked = parent_student_ids(ctx)
        if not linked:
            return [], 0
        stmt = stmt.where(Submission.student_id.in_(linked), Grade.published_at.is_not(None))
    if assignment_id is not None:
        assignment = get_scoped(ctx.db, Assignment, ctx.tenant_id, assignment_id, "assignment")
        if Role.TEACHER in ctx.roles and assignment.class_id not in teacher_class_ids(ctx):
            raise Forbidden("You are not assigned to this class.")
        stmt = stmt.where(Submission.assignment_id == assignment.id)
    if student_id is not None:
        if Role.STUDENT in ctx.roles and student_id != student_profile(ctx).id:
            raise Forbidden("You can only view your own grades.")
        if Role.PARENT in ctx.roles and student_id not in parent_student_ids(ctx):
            raise Forbidden("You are not linked to this student.")
        stmt = stmt.where(Submission.student_id == student_id)
    if published_only:
        stmt = stmt.where(Grade.published_at.is_not(None))
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Grade.created_at.desc()).offset((page - 1) * size).limit(size)).all())
    return items, total
