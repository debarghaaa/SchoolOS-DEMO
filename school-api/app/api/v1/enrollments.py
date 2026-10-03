from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.academic import EnrollmentCreate, EnrollmentRead, EnrollmentUpdate
from app.services import academic as svc

router = APIRouter(prefix="/enrollments")

READ = ("enrollments.manage", "classes.read_assigned", "academic.read_own", "children.read_linked")


@router.get("", response_model=Envelope[Page[EnrollmentRead]])
def list_enrollments(
    paging: tuple[int, int] = Depends(pagination_params),
    class_id: uuid.UUID | None = Query(default=None),
    student_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_enrollments(ctx, page=page, size=size, class_id=class_id,
                                        student_id=student_id, status=status)
    return ok(Page(items=[EnrollmentRead.model_validate(e) for e in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[EnrollmentRead], status_code=201)
def create_enrollment(body: EnrollmentCreate, ctx: RequestContext = Depends(require_perm("enrollments.manage"))):
    return ok(EnrollmentRead.model_validate(svc.create_enrollment(ctx, body)))


@router.patch("/{enrollment_id}", response_model=Envelope[EnrollmentRead])
def update_enrollment(enrollment_id: uuid.UUID, body: EnrollmentUpdate,
                      ctx: RequestContext = Depends(require_perm("enrollments.manage"))):
    return ok(EnrollmentRead.model_validate(svc.update_enrollment(ctx, enrollment_id, body)))


@router.delete("/{enrollment_id}", status_code=204)
def delete_enrollment(enrollment_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("enrollments.manage"))):
    svc.delete_enrollment(ctx, enrollment_id)
    return None
