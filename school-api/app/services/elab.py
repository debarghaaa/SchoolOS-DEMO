from __future__ import annotations

import datetime as dt
import hashlib
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.config import settings
from app.core.constants import Role
from app.core.errors import Conflict, Forbidden, NotFound, RateLimited, ValidationFailed
from app.models.academic import Student
from app.models.base import utcnow
from app.models.elab import ElabRun
from app.services.academic import class_student_ids, teacher_class_ids
from app.workers.queue import enqueue

if TYPE_CHECKING:
    from app.api.deps import RequestContext


STATUSES = ("queued", "running", "completed", "failed", "timeout", "cancelled")
ACTIVE_STATUSES = ("queued", "running")


def _check_quotas(ctx: RequestContext) -> None:
    active = ctx.db.scalar(select(func.count()).select_from(ElabRun).where(
        ElabRun.tenant_id == ctx.tenant_id, ElabRun.user_id == ctx.user.id,
        ElabRun.status.in_(ACTIVE_STATUSES))) or 0
    if active >= settings.ELAB_MAX_CONCURRENT_PER_USER:
        raise RateLimited(f"Too many concurrent executions (max {settings.ELAB_MAX_CONCURRENT_PER_USER}).")
    day_ago = utcnow() - dt.timedelta(days=1)
    mine = ctx.db.scalar(select(func.count()).select_from(ElabRun).where(
        ElabRun.tenant_id == ctx.tenant_id, ElabRun.user_id == ctx.user.id,
        ElabRun.created_at >= day_ago)) or 0
    if mine >= settings.ELAB_DAILY_RUNS_PER_USER:
        raise RateLimited("Daily execution quota exceeded.")
    tenant_runs = ctx.db.scalar(select(func.count()).select_from(ElabRun).where(
        ElabRun.tenant_id == ctx.tenant_id, ElabRun.created_at >= day_ago)) or 0
    if tenant_runs >= settings.ELAB_DAILY_RUNS_PER_TENANT:
        raise RateLimited("School execution quota exceeded for today.")


def create_run(ctx: RequestContext, data) -> ElabRun:
    language = data.language.lower()
    if language not in settings.elab_languages:
        raise ValidationFailed(f"Unsupported language. Allowed: {', '.join(settings.elab_languages)}.")
    if len(data.source_code.encode()) > settings.ELAB_MAX_SOURCE_KB * 1024:
        raise ValidationFailed(f"Source exceeds {settings.ELAB_MAX_SOURCE_KB} KB.")
    if len(data.stdin.encode()) > settings.ELAB_MAX_STDIN_KB * 1024:
        raise ValidationFailed(f"stdin exceeds {settings.ELAB_MAX_STDIN_KB} KB.")
    _check_quotas(ctx)
    run = ElabRun(tenant_id=ctx.tenant_id, user_id=ctx.user.id, language=language,
                  source_code=data.source_code,
                  source_hash=hashlib.sha256(data.source_code.encode("utf-8")).hexdigest(),
                  stdin=data.stdin, status="queued")
    ctx.db.add(run)
    ctx.db.flush()
    # Execution happens in a worker via the queue — never inline, never here.
    enqueue("elab.execute", {"run_id": str(run.id)}, queue="elab",
            allow_inline=False, allow_memory=True)
    return run


def _run_visible(ctx: RequestContext, run: ElabRun) -> ElabRun:
    if Role.SCHOOL_ADMIN in ctx.roles or run.user_id == ctx.user.id:
        return run
    if Role.TEACHER in ctx.roles:
        student = ctx.db.scalar(select(Student).where(
            Student.user_id == run.user_id, Student.tenant_id == ctx.tenant_id))
        if student is not None:
            for cid in teacher_class_ids(ctx):
                if student.id in class_student_ids(ctx, cid):
                    return run
    raise NotFound("Execution not found.", resource="elab_run")


def get_run(ctx: RequestContext, run_id: uuid.UUID) -> ElabRun:
    run = ctx.db.scalar(select(ElabRun).where(ElabRun.id == run_id, ElabRun.tenant_id == ctx.tenant_id))
    if run is None:
        raise NotFound("Execution not found.", resource="elab_run")
    return _run_visible(ctx, run)


def list_runs(ctx, *, page, size, status):
    stmt = select(ElabRun).where(ElabRun.tenant_id == ctx.tenant_id)
    if Role.TEACHER in ctx.roles:
        student_user_ids = set()
        for cid in teacher_class_ids(ctx):
            for sid in class_student_ids(ctx, cid):
                student = ctx.db.get(Student, sid)
                if student is not None and student.user_id is not None:
                    student_user_ids.add(student.user_id)
        student_user_ids.add(ctx.user.id)
        stmt = stmt.where(ElabRun.user_id.in_(student_user_ids))
    elif Role.STUDENT in ctx.roles:
        stmt = stmt.where(ElabRun.user_id == ctx.user.id)
    elif Role.SCHOOL_ADMIN not in ctx.roles:
        raise Forbidden("Not authorized.")
    if status:
        if status not in STATUSES:
            raise ValidationFailed(f"Unknown status. Allowed: {', '.join(STATUSES)}.")
        stmt = stmt.where(ElabRun.status == status)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(ElabRun.created_at.desc())
                                .offset((page - 1) * size).limit(size)).all())
    return items, total


def cancel_run(ctx: RequestContext, run_id: uuid.UUID) -> ElabRun:
    """Cancel an execution. Queued runs flip immediately; running runs get a
    cancel flag the worker honors by killing the container / process tree."""
    run = get_run(ctx, run_id)
    if run.status == "queued":
        run.status = "cancelled"
        run.completed_at = utcnow()
        ctx.db.flush()
        return run
    if run.status == "running":
        run.cancel_requested = True
        ctx.db.flush()
        return run
    raise Conflict("Only queued or running executions can be cancelled.")
