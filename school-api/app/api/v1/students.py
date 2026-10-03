from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.academic import StudentCreate, StudentRead, StudentUpdate
from app.services import academic as svc

router = APIRouter(prefix="/students")

READ = ("students.manage", "students.read_assigned", "academic.read_own", "children.read_linked")


@router.get("", response_model=Envelope[Page[StudentRead]])
def list_students(
    paging: tuple[int, int] = Depends(pagination_params),
    q: str | None = Query(default=None),
    class_id: uuid.UUID | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_students(ctx, page=page, size=size, q=q, class_id=class_id)
    return ok(Page(items=[StudentRead.model_validate(s) for s in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[StudentRead], status_code=201)
def create_student(body: StudentCreate, ctx: RequestContext = Depends(require_perm("students.manage"))):
    return ok(StudentRead.model_validate(svc.create_student(ctx, body)))


@router.get("/me", response_model=Envelope[StudentRead])
def my_profile(ctx: RequestContext = Depends(require_any(*READ))):
    return ok(StudentRead.model_validate(svc.student_profile(ctx)))


@router.get("/{student_id}", response_model=Envelope[StudentRead])
def get_student(student_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(StudentRead.model_validate(svc.get_student(ctx, student_id)))


@router.patch("/{student_id}", response_model=Envelope[StudentRead])
def update_student(student_id: uuid.UUID, body: StudentUpdate,
                   ctx: RequestContext = Depends(require_perm("students.manage"))):
    return ok(StudentRead.model_validate(svc.update_student(ctx, student_id, body)))
