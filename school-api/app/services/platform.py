from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.models.academic import SchoolClass, Student, Teacher
from app.models.base import utcnow
from app.models.elab import ElabRun
from app.models.tenant import Tenant
from app.models.user import TenantMembership, User, UserRole
from app.schemas.platform import PlatformAnalytics

if TYPE_CHECKING:
    from app.api.deps import RequestContext


def _counts(rows: list[tuple[str, int]]) -> dict[str, int]:
    return {status: count for status, count in rows}


def get_analytics(ctx: RequestContext) -> PlatformAnalytics:
    """Platform-wide aggregates for super-admins. Tenant scope is bypassed
    deliberately — this endpoint requires ``platform.manage``."""
    db = ctx.db
    tenants = db.execute(select(Tenant.status, func.count()).group_by(Tenant.status)).all()
    roles = db.execute(select(TenantMembership.role, func.count()).where(
        TenantMembership.status == "active").group_by(TenantMembership.role)).all()
    day_ago = utcnow() - dt.timedelta(hours=24)
    runs = db.execute(select(ElabRun.status, func.count()).where(
        ElabRun.created_at >= day_ago).group_by(ElabRun.status)).all()
    return PlatformAnalytics(
        tenants_total=db.scalar(select(func.count()).select_from(Tenant)) or 0,
        tenants_by_status=_counts([(s, c) for s, c in tenants]),
        users_total=db.scalar(select(func.count()).select_from(User)) or 0,
        memberships_by_role=_counts([(r, c) for r, c in roles]),
        platform_admins=db.scalar(select(func.count()).select_from(UserRole).where(
            UserRole.tenant_id.is_(None))) or 0,
        students_total=db.scalar(select(func.count()).select_from(Student)) or 0,
        teachers_total=db.scalar(select(func.count()).select_from(Teacher)) or 0,
        classes_total=db.scalar(select(func.count()).select_from(SchoolClass)) or 0,
        elab_runs_24h=_counts([(s, c) for s, c in runs]),
        generated_at=utcnow(),
    )
