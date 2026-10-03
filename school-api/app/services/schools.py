from __future__ import annotations

"""Platform tenant administration (super-admin only)."""

import datetime as dt
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.constants import TenantStatus
from app.core.errors import Conflict, Duplicate, NotFound, ValidationFailed
from app.models.base import utcnow
from app.models.school import School
from app.models.subscription import FeatureFlag, Subscription
from app.models.tenant import Tenant
from app.models.user import TenantMembership
from app.services.audit import Action, log_ctx

if TYPE_CHECKING:
    from app.api.deps import RequestContext
    from app.schemas.schools import SchoolCreate, SchoolUpdate

STATUSES = (TenantStatus.TRIAL, TenantStatus.ACTIVE, TenantStatus.SUSPENDED)


def tenant_read(tenant: Tenant, db) -> dict:
    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant.id))
    flags = db.scalars(select(FeatureFlag).where(FeatureFlag.tenant_id == tenant.id)).all()
    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "status": tenant.status,
        "trial_ends_at": sub.trial_ends_at if sub else None,
        "subscription_tier": sub.tier if sub else "trial",
        "subscription_meta": sub.meta if sub else {},
        "feature_flags": {f.key: f.enabled for f in flags},
        "created_at": tenant.created_at,
        "updated_at": tenant.updated_at,
    }


def list_tenants(ctx: RequestContext, *, page: int, size: int, status: str | None):
    stmt = select(Tenant)
    if status:
        stmt = stmt.where(Tenant.status == status)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(Tenant.created_at.desc()).offset((page - 1) * size).limit(size)).all())
    return [tenant_read(t, ctx.db) for t in items], total


def get_tenant(ctx: RequestContext, tenant_id: uuid.UUID) -> Tenant:
    tenant = ctx.db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFound("School not found.", resource="school")
    return tenant


def create_tenant(ctx: RequestContext, data: SchoolCreate) -> dict:
    slug = data.slug.lower()
    if ctx.db.scalar(select(Tenant.id).where(Tenant.slug == slug)) is not None:
        raise Duplicate("A school with this slug already exists.")
    tenant = Tenant(name=data.name, slug=slug, status=TenantStatus.TRIAL)
    ctx.db.add(tenant)
    ctx.db.flush()
    trial_ends_at = utcnow() + dt.timedelta(days=data.trial_days) if data.trial_days else None
    ctx.db.add(Subscription(tenant_id=tenant.id, tier=data.subscription_tier,
                            status="trialing", trial_ends_at=trial_ends_at, meta={}))
    for key, value in dict(data.feature_flags).items():
        enabled = bool(value.get("enabled", True)) if isinstance(value, dict) else bool(value)
        payload = value if isinstance(value, dict) else {}
        ctx.db.add(FeatureFlag(tenant_id=tenant.id, key=str(key)[:80],
                               enabled=enabled, payload=payload))
    code = "".join(c if c.isalnum() else "_" for c in slug.upper())[:40] or "MAIN"
    ctx.db.add(School(tenant_id=tenant.id, name=data.name, code=code, academic_year=""))
    ctx.db.flush()
    log_ctx(ctx, action=Action.TENANT_CREATED, resource_type="school",
            resource_id=tenant.id, extra={"slug": slug})
    if data.admin_email:
        # Bootstrap the tenant's first administrator via the invite flow, so
        # platform operators never manage row-level school data afterwards.
        from app.core.config import settings
        from app.core.constants import Role, UserStatus
        from app.integrations.email import send_email
        from app.models.user import User
        from app.repositories.users import find_by_email
        from app.services.auth import issue_invite

        email = data.admin_email.lower()
        admin = find_by_email(ctx.db, email)
        parts = (data.admin_name or "").split(None, 1)
        first, last = (parts + [""])[:2] if parts else ("School", "Administrator")
        if admin is None:
            admin = User(email=email, first_name=first, last_name=last,
                         password_hash="", status=UserStatus.DISABLED)
            ctx.db.add(admin)
            ctx.db.flush()
            membership_status = UserStatus.INVITED
        else:
            membership_status = UserStatus.ACTIVE
        ctx.db.add(TenantMembership(tenant_id=tenant.id, user_id=admin.id,
                                    role=Role.SCHOOL_ADMIN, status=membership_status))
        ctx.db.flush()
        if membership_status == UserStatus.INVITED:
            token = issue_invite(ctx.db, admin)
            link = f"{settings.FRONTEND_URL}/accept-invite?token={token}"
            send_email(admin.email, f"You are invited to administer {tenant.name}",
                       f"Accept your administrator invitation here:\n{link}\n\nToken: {token}")
        log_ctx(ctx, action=Action.INVITE_CREATED, resource_type="user",
                resource_id=admin.id, extra={"role": Role.SCHOOL_ADMIN})
    return tenant_read(tenant, ctx.db)


def update_tenant(ctx: RequestContext, tenant_id: uuid.UUID, data: SchoolUpdate) -> dict:
    tenant = get_tenant(ctx, tenant_id)
    payload = data.model_dump(exclude_unset=True)
    if "status" in payload and payload["status"] not in STATUSES:
        raise ValidationFailed(f"Status must be one of: {', '.join(STATUSES)}.")
    for key in ("name", "status"):
        if key in payload and payload[key] is not None:
            setattr(tenant, key, payload[key])
    sub = ctx.db.scalar(select(Subscription).where(Subscription.tenant_id == tenant.id))
    if sub is None:
        sub = Subscription(tenant_id=tenant.id, tier="trial", status="trialing", meta={})
        ctx.db.add(sub)
    if payload.get("subscription_tier") is not None:
        sub.tier = payload["subscription_tier"]
    if payload.get("subscription_meta") is not None:
        sub.meta = dict(payload["subscription_meta"])
    if "trial_ends_at" in payload:
        sub.trial_ends_at = payload["trial_ends_at"]
    if payload.get("feature_flags") is not None:
        for key, value in dict(payload["feature_flags"]).items():
            enabled = bool(value.get("enabled", True)) if isinstance(value, dict) else bool(value)
            row = ctx.db.scalar(select(FeatureFlag).where(
                FeatureFlag.tenant_id == tenant.id, FeatureFlag.key == str(key)[:80]))
            if row is None:
                ctx.db.add(FeatureFlag(tenant_id=tenant.id, key=str(key)[:80],
                                       enabled=enabled,
                                       payload=value if isinstance(value, dict) else {}))
            else:
                row.enabled = enabled
                if isinstance(value, dict):
                    row.payload = value
    ctx.db.flush()
    log_ctx(ctx, action=Action.TENANT_UPDATED, resource_type="school",
            resource_id=tenant.id, extra={"fields": sorted(payload)})
    return tenant_read(tenant, ctx.db)


def delete_tenant(ctx: RequestContext, tenant_id: uuid.UUID) -> None:
    tenant = get_tenant(ctx, tenant_id)
    members = ctx.db.scalar(select(func.count()).select_from(TenantMembership).where(
        TenantMembership.tenant_id == tenant_id)) or 0
    if members:
        raise Conflict("School still has members. Disable and offboard them first.",
                       details={"members": members})
    ctx.db.delete(tenant)
    ctx.db.flush()
    # Audit without tenant FK (row is gone) — keep the id in resource_id.
    log_ctx(ctx, action=Action.TENANT_DELETED, resource_type="school",
            resource_id=tenant_id, extra={"slug": tenant.slug})


def current_tenant(ctx: RequestContext) -> Tenant:
    tenant = ctx.db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise NotFound("School not found.", resource="school")
    return tenant
