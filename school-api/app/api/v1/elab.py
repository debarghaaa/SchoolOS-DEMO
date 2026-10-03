from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.middleware.rate_limit import rate_limit
from app.schemas.elab import RunAccepted, RunCreate, RunRead
from app.services import elab as svc

router = APIRouter(prefix="/elab")

READ = ("elab.use", "elab.read_all")


@router.post("/runs", response_model=Envelope[RunAccepted], status_code=202,
             dependencies=[Depends(rate_limit("20/hour"))])
def create_run(body: RunCreate, ctx: RequestContext = Depends(require_perm("elab.use"))):
    """Queue a code execution. Runs asynchronously in an isolated worker."""
    run = svc.create_run(ctx, body)
    return ok(RunAccepted(execution_id=run.id, status=run.status))


@router.get("/runs", response_model=Envelope[Page[RunRead]])
def list_runs(
    paging: tuple[int, int] = Depends(pagination_params),
    status: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_runs(ctx, page=page, size=size, status=status)
    return ok(Page(items=[RunRead.model_validate(r) for r in items], total=total, page=page, size=size))


@router.get("/runs/{execution_id}", response_model=Envelope[RunRead])
def get_run(execution_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(RunRead.model_validate(svc.get_run(ctx, execution_id)))


@router.delete("/runs/{execution_id}", response_model=Envelope[RunRead])
def cancel_run(execution_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    """Cancel a queued run, or request cancellation of a running one."""
    return ok(RunRead.model_validate(svc.cancel_run(ctx, execution_id)))
