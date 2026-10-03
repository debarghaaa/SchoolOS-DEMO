from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, get_request_context, require_perm
from app.core.errors import TenantRequired
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.schools import SchoolCreate, SchoolRead, SchoolUpdate
from app.services import schools as svc

router = APIRouter(prefix="/schools")


@router.get("/current", response_model=Envelope[SchoolRead])
def current_school(ctx: RequestContext = Depends(get_request_context)):
    if ctx.tenant_id is None:
        raise TenantRequired()
    return ok(SchoolRead.model_validate(svc.tenant_read(svc.current_tenant(ctx), ctx.db)))


@router.get("", response_model=Envelope[Page[SchoolRead]])
def list_schools(
    paging: tuple[int, int] = Depends(pagination_params),
    status: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_perm("tenants.manage")),
):
    page, size = paging
    items, total = svc.list_tenants(ctx, page=page, size=size, status=status)
    return ok(Page(items=[SchoolRead.model_validate(t) for t in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[SchoolRead], status_code=201)
def create_school(body: SchoolCreate, ctx: RequestContext = Depends(require_perm("tenants.manage"))):
    return ok(SchoolRead.model_validate(svc.create_tenant(ctx, body)))


@router.get("/{school_id}", response_model=Envelope[SchoolRead])
def get_school(school_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("tenants.manage"))):
    return ok(SchoolRead.model_validate(svc.tenant_read(svc.get_tenant(ctx, school_id), ctx.db)))


@router.patch("/{school_id}", response_model=Envelope[SchoolRead])
def update_school(school_id: uuid.UUID, body: SchoolUpdate,
                  ctx: RequestContext = Depends(require_perm("tenants.manage"))):
    return ok(SchoolRead.model_validate(svc.update_tenant(ctx, school_id, body)))


@router.delete("/{school_id}", status_code=204)
def delete_school(school_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("tenants.manage"))):
    svc.delete_tenant(ctx, school_id)
    return None
