from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.assignments import GradeCreate, GradeRead, GradeUpdate
from app.services import grades as svc

router = APIRouter()

MANAGE = ("grades.manage", "grades.manage_assigned")
READ = MANAGE + ("grades.read_own", "grades.read_linked")


@router.get("/grades", response_model=Envelope[Page[GradeRead]])
def list_grades(
    paging: tuple[int, int] = Depends(pagination_params),
    assignment_id: uuid.UUID | None = Query(default=None),
    student_id: uuid.UUID | None = Query(default=None),
    published_only: bool = Query(default=False),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_grades(ctx, page=page, size=size, assignment_id=assignment_id,
                                   student_id=student_id, published_only=published_only)
    return ok(Page(items=[GradeRead.model_validate(g) for g in items], total=total, page=page, size=size))


@router.get("/grades/{grade_id}", response_model=Envelope[GradeRead])
def get_grade(grade_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(GradeRead.model_validate(svc.get_grade(ctx, grade_id)))


@router.post("/submissions/{submission_id}/grade", response_model=Envelope[GradeRead], status_code=201)
def grade_submission(submission_id: uuid.UUID, body: GradeCreate,
                     ctx: RequestContext = Depends(require_any(*MANAGE))):
    return ok(GradeRead.model_validate(svc.grade_submission(ctx, submission_id, body)))


@router.patch("/grades/{grade_id}", response_model=Envelope[GradeRead])
def update_grade(grade_id: uuid.UUID, body: GradeUpdate, ctx: RequestContext = Depends(require_any(*MANAGE))):
    return ok(GradeRead.model_validate(svc.update_grade(ctx, grade_id, body)))


@router.post("/grades/{grade_id}/publish", response_model=Envelope[GradeRead])
def publish_grade(grade_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*MANAGE))):
    return ok(GradeRead.model_validate(svc.publish_grade(ctx, grade_id)))
