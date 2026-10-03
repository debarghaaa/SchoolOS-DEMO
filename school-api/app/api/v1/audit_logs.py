from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.audit import AuditRead
from app.services.audit import query_logs

router = APIRouter(prefix="/audit-logs")


@router.get("", response_model=Envelope[Page[AuditRead]])
def list_logs(
    paging: tuple[int, int] = Depends(pagination_params),
    tenant_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    actor_id: uuid.UUID | None = Query(default=None),
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    ctx: RequestContext = Depends(require_any("audit.read", "audit.read_all")),
):
    page, size = paging
    items, total = query_logs(ctx, page=page, size=size, tenant_id=tenant_id, action=action,
                              resource_type=resource_type, actor_id=actor_id,
                              date_from=date_from, date_to=date_to)
    return ok(Page(items=[AuditRead.model_validate(a) for a in items], total=total, page=page, size=size))
