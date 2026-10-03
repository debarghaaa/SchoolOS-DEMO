from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import Role
from app.core.errors import NotFound, ValidationFailed
from app.models.base import utcnow
from app.models.notification import Notification
from app.models.user import TenantMembership, User
from app.services.audit import Action, log_ctx
from app.workers.queue import enqueue

if TYPE_CHECKING:
    pass


class NotificationType:
    ASSIGNMENT_CREATED = "assignment_created"
    ASSIGNMENT_DUE_SOON = "assignment_due_soon"
    SUBMISSION_RECEIVED = "submission_received"
    GRADE_PUBLISHED = "grade_published"
    ATTENDANCE_UPDATE = "attendance_update"
    TIMETABLE_CHANGE = "timetable_change"
    ANNOUNCEMENT = "announcement"


def publish_event(
    db: Session,
    *,
    tenant_id: uuid.UUID | None,
    type: str,
    title: str,
    body: str,
    user_ids: list[uuid.UUID],
    data: dict | None = None,
) -> None:
    """Event-driven notification creation. Fan-out runs in a worker (or inline
    when Redis is unavailable in dev/test)."""
    if tenant_id is None:
        raise ValidationFailed("Tenant scope is required to publish notifications.")
    unique = sorted({str(u) for u in user_ids})
    if not unique:
        return
    enqueue("notify", {
        "tenant_id": str(tenant_id), "type": type, "title": title[:200],
        "body": body[:5000], "user_ids": unique, "data": data or {},
    }, allow_inline=True)


def my_notifications(ctx, *, page, size, unread_only):
    stmt = select(Notification).where(Notification.tenant_id == ctx.tenant_id,
                                      Notification.recipient_id == ctx.user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Notification.created_at.desc())
                                .offset((page - 1) * size).limit(size)).all())
    unread = ctx.db.scalar(select(func.count()).select_from(Notification).where(
        Notification.tenant_id == ctx.tenant_id, Notification.recipient_id == ctx.user.id,
        Notification.read_at.is_(None))) or 0
    return items, total, unread


def mark_read(ctx, notification_id) -> Notification:
    row = ctx.db.scalar(select(Notification).where(
        Notification.id == notification_id, Notification.tenant_id == ctx.tenant_id,
        Notification.recipient_id == ctx.user.id))
    if row is None:
        raise NotFound("Notification not found.", resource="notification")
    row.read_at = utcnow()
    ctx.db.flush()
    return row


def mark_all_read(ctx) -> int:
    rows = ctx.db.scalars(select(Notification).where(
        Notification.tenant_id == ctx.tenant_id, Notification.recipient_id == ctx.user.id,
        Notification.read_at.is_(None))).all()
    now = utcnow()
    for row in rows:
        row.read_at = now
    ctx.db.flush()
    return len(rows)


AUDIENCES = ("all", "teachers", "students", "parents")
AUDIENCE_ROLES = {"teachers": [Role.TEACHER], "students": [Role.STUDENT], "parents": [Role.PARENT]}


def announce(ctx, data) -> dict:
    if data.audience not in AUDIENCES:
        raise ValidationFailed(f"Audience must be one of: {', '.join(AUDIENCES)}.")
    roles = AUDIENCE_ROLES.get(data.audience)
    stmt = (select(User.id)
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .where(TenantMembership.tenant_id == ctx.tenant_id,
                   TenantMembership.status == "active", User.status == "active"))
    if roles:
        stmt = stmt.where(TenantMembership.role.in_(roles))
    user_ids = [str(u) for u in ctx.db.scalars(stmt).all()]
    enqueue("notify", {
        "tenant_id": str(ctx.tenant_id), "type": NotificationType.ANNOUNCEMENT,
        "title": data.title[:200], "body": data.body[:5000],
        "user_ids": user_ids, "data": {"audience": data.audience},
    }, allow_inline=True)
    log_ctx(ctx, action=Action.ANNOUNCEMENT_SENT, resource_type="notification",
            extra={"audience": data.audience, "recipients": len(user_ids)})
    return {"recipients": len(user_ids)}
