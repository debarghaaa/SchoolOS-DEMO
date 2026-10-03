from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import select

from app.core.db import service_session, set_rls
from app.models.academic import Enrollment, Student
from app.models.assignments import Assignment
from app.models.base import utcnow
from app.models.elab import ElabRun
from app.models.notification import Notification
from app.models.user import TenantMembership, User
from app.workers.elab_runner import execute_elab_run
from app.workers.queue import task


@task("notify")
def notify_users(payload: dict) -> None:
    tenant_id = uuid.UUID(payload["tenant_id"])
    user_ids = [uuid.UUID(u) for u in payload.get("user_ids", [])]
    if not user_ids:
        return
    with service_session() as db:
        set_rls(db, None, bypass=True)
        valid = set(db.scalars(select(User.id)
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .where(User.id.in_(user_ids), TenantMembership.tenant_id == tenant_id,
                   TenantMembership.status == "active",
                   User.status == "active")).all())
        for uid in valid:
            db.add(Notification(
                tenant_id=tenant_id, recipient_id=uid, type=payload["type"][:40],
                title=payload.get("title", "")[:200], body=payload.get("body", "")[:5000],
                data=payload.get("data", {}) or {},
            ))


@task("elab.execute")
def elab_execute(payload: dict) -> None:
    execute_elab_run(payload["run_id"])


def scan_due_soon() -> int:
    """Find published assignments due within 24h that haven't been reminded and
    notify enrolled students. Runs periodically inside the worker loop."""
    from app.services.notifications import NotificationType

    now = utcnow()
    horizon = now + dt.timedelta(hours=24)
    count = 0
    with service_session() as db:
        set_rls(db, None, bypass=True)
        due = db.scalars(select(Assignment).where(
            Assignment.status == "published",
            Assignment.due_at > now,
            Assignment.due_at <= horizon,
            Assignment.reminder_sent_at.is_(None),
        ).limit(200)).all()
        for assignment in due:
            student_ids = db.scalars(select(Enrollment.student_id).where(
                Enrollment.class_id == assignment.class_id,
                Enrollment.tenant_id == assignment.tenant_id,
                Enrollment.status == "active")).all()
            user_ids = [u for u in db.scalars(select(Student.user_id).where(
                Student.id.in_(student_ids), Student.user_id.is_not(None))).all() if u is not None]
            for uid in set(user_ids):
                db.add(Notification(
                    tenant_id=assignment.tenant_id, recipient_id=uid,
                    type=NotificationType.ASSIGNMENT_DUE_SOON,
                    title=f"Due soon: {assignment.title}",
                    body=f"Due {assignment.due_at.isoformat()}.",
                    data={"assignment_id": str(assignment.id)},
                ))
                count += 1
            assignment.reminder_sent_at = now
    return count


def purge_expired_sources() -> int:
    """Scrub retained source/stdin past ELAB_SOURCE_RETENTION_DAYS. Hashes,
    outputs and audit rows are kept; only the source text is purged."""
    from app.core.config import settings

    cutoff = utcnow() - dt.timedelta(days=settings.ELAB_SOURCE_RETENTION_DAYS)
    with service_session() as db:
        set_rls(db, None, bypass=True)
        rows = db.scalars(select(ElabRun).where(
            ElabRun.completed_at.is_not(None), ElabRun.completed_at < cutoff,
            ElabRun.source_code != "").limit(500)).all()
        for run in rows:
            run.source_code = ""
            run.stdin = ""
        db.commit()
        return len(rows)
