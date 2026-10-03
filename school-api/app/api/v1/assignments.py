from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.assignments import AssignmentCreate, AssignmentRead, AssignmentUpdate
from app.services import assignments as svc

router = APIRouter(prefix="/assignments")

MANAGE = ("assignments.manage", "assignments.manage_assigned")
READ = MANAGE + ("assignments.read_own", "assignments.read_linked")


@router.get("", response_model=Envelope[Page[AssignmentRead]])
def list_assignments(
    paging: tuple[int, int] = Depends(pagination_params),
    class_id: uuid.UUID | None = Query(default=None),
    subject_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_assignments(ctx, page=page, size=size, class_id=class_id,
                                        subject_id=subject_id, status=status)
    return ok(Page(items=[AssignmentRead.model_validate(a) for a in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[AssignmentRead], status_code=201)
def create_assignment(body: AssignmentCreate, ctx: RequestContext = Depends(require_any(*MANAGE))):
    return ok(AssignmentRead.model_validate(svc.create_assignment(ctx, body)))


@router.get("/{assignment_id}", response_model=Envelope[AssignmentRead])
def get_assignment(assignment_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(AssignmentRead.model_validate(svc.get_assignment(ctx, assignment_id)))


@router.patch("/{assignment_id}", response_model=Envelope[AssignmentRead])
def update_assignment(assignment_id: uuid.UUID, body: AssignmentUpdate,
                      ctx: RequestContext = Depends(require_any(*MANAGE))):
    return ok(AssignmentRead.model_validate(svc.update_assignment(ctx, assignment_id, body)))


@router.post("/{assignment_id}/publish", response_model=Envelope[AssignmentRead])
def publish_assignment(assignment_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*MANAGE))):
    return ok(AssignmentRead.model_validate(svc.publish_assignment(ctx, assignment_id)))


@router.post("/{assignment_id}/archive", response_model=Envelope[AssignmentRead])
def archive_assignment(assignment_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*MANAGE))):
    return ok(AssignmentRead.model_validate(svc.archive_assignment(ctx, assignment_id)))
