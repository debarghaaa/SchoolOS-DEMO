from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.assignments import SubmissionCreate, SubmissionRead
from app.services import assignments as svc

router = APIRouter()

READ_MANAGE = ("submissions.manage", "submissions.read_assigned")
READ_ALL = READ_MANAGE + ("academic.read_own", "children.read_linked")


@router.post("/assignments/{assignment_id}/submissions", response_model=Envelope[SubmissionRead], status_code=201)
def submit(assignment_id: uuid.UUID, body: SubmissionCreate,
           ctx: RequestContext = Depends(require_perm("submissions.create_own"))):
    return ok(SubmissionRead.model_validate(svc.submit(ctx, assignment_id, body)))


@router.get("/assignments/{assignment_id}/submissions", response_model=Envelope[Page[SubmissionRead]])
def list_for_assignment(
    assignment_id: uuid.UUID,
    paging: tuple[int, int] = Depends(pagination_params),
    ctx: RequestContext = Depends(require_any(*READ_MANAGE)),
):
    page, size = paging
    items, total = svc.list_submissions(ctx, page=page, size=size, assignment_id=assignment_id)
    return ok(Page(items=[SubmissionRead.model_validate(s) for s in items], total=total, page=page, size=size))


@router.get("/submissions/mine", response_model=Envelope[Page[SubmissionRead]])
def my_submissions(
    paging: tuple[int, int] = Depends(pagination_params),
    assignment_id: uuid.UUID | None = Query(default=None),
    ctx: RequestContext = Depends(require_perm("academic.read_own")),
):
    page, size = paging
    items, total = svc.my_submissions(ctx, page=page, size=size, assignment_id=assignment_id)
    return ok(Page(items=[SubmissionRead.model_validate(s) for s in items], total=total, page=page, size=size))


@router.get("/submissions/{submission_id}", response_model=Envelope[SubmissionRead])
def get_submission(submission_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ_ALL))):
    return ok(SubmissionRead.model_validate(svc.get_submission(ctx, submission_id)))
