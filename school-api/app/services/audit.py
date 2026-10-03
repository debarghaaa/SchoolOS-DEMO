from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from app.models.audit import AuditLog

if TYPE_CHECKING:
    from app.api.deps import RequestContext


class Action:
    LOGIN = "login"
    LOGOUT = "logout"
    TENANT_SELECTED = "tenant_selected"
    ACCESS_DENIED = "access_denied"
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DISABLED = "user_disabled"
    ROLE_CHANGED = "role_changed"
    MEMBERSHIP_CHANGED = "membership_changed"
    INVITE_CREATED = "invite_created"
    INVITE_ACCEPTED = "invite_accepted"
    PASSWORD_CHANGED = "password_changed"
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFIED = "email_verified"
    TENANT_CREATED = "tenant_created"
    TENANT_UPDATED = "tenant_updated"
    TENANT_DELETED = "tenant_deleted"
    ATTENDANCE_MARKED = "attendance_marked"
    ATTENDANCE_UPDATED = "attendance_updated"
    ASSIGNMENT_CREATED = "assignment_created"
    ASSIGNMENT_UPDATED = "assignment_updated"
    ASSIGNMENT_PUBLISHED = "assignment_published"
    ASSIGNMENT_ARCHIVED = "assignment_archived"
    SUBMISSION_CREATED = "submission_created"
    GRADE_CREATED = "grade_created"
    GRADE_UPDATED = "grade_updated"
    GRADE_PUBLISHED = "grade_published"
    TIMETABLE_CHANGED = "timetable_changed"
    FILE_UPLOADED = "file_uploaded"
    FILE_DOWNLOADED = "file_downloaded"
    FILE_DELETED = "file_deleted"
    ELAB_EXECUTED = "elab_executed"
    ANNOUNCEMENT_SENT = "announcement_sent"
    CLASS_CHANGED = "class_changed"
    ENROLLMENT_CHANGED = "enrollment_changed"
    LINK_CHANGED = "link_changed"
    ACADEMIC_CHANGED = "academic_changed"
    PII_READ = "pii_read"


def log_event(
    db: Session,
    *,
    actor_id: uuid.UUID | None,
    actor_role: str | None,
    tenant_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    extra: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        actor_role=actor_role,
        tenant_id=tenant_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip=ip,
        user_agent=user_agent,
        extra=extra or {},
    )
    db.add(entry)
    db.flush()
    return entry


def query_logs(
    ctx,
    *,
    page: int,
    size: int,
    tenant_id=None,
    action: str | None = None,
    resource_type: str | None = None,
    actor_id=None,
    date_from=None,
    date_to=None,
):
    """Super-admins see all tenants (optionally filtered); school-admins see
    only their own tenant. Row-level school data is never exposed cross-tenant."""
    from sqlalchemy import func, select

    from app.core.constants import Role

    stmt = select(AuditLog)
    if ctx.role == Role.SUPER_ADMIN:
        if tenant_id is not None:
            stmt = stmt.where(AuditLog.tenant_id == tenant_id)
    else:
        stmt = stmt.where(AuditLog.tenant_id == ctx.tenant_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if date_from is not None:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(AuditLog.created_at <= date_to)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * size).limit(size)).all())
    return items, total


def log_ctx(
    ctx: RequestContext,
    *,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | str | None = None,
    extra: dict[str, Any] | None = None,
) -> AuditLog:
    return log_event(
        ctx.db,
        actor_id=ctx.user.id,
        actor_role=ctx.role,
        tenant_id=ctx.tenant_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        ip=ctx.ip,
        user_agent=ctx.user_agent,
        extra=extra,
    )
