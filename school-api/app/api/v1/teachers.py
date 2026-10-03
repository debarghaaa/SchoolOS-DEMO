from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.academic import TeacherAssignRequest, ClassMemberRead, TeacherCreate, TeacherRead, TeacherUpdate
from app.services import academic as svc

router = APIRouter(prefix="/teachers")

READ = ("teachers.manage", "classes.read_assigned")


@router.get("", response_model=Envelope[Page[TeacherRead]])
def list_teachers(
    paging: tuple[int, int] = Depends(pagination_params),
    q: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_teachers(ctx, page=page, size=size, q=q)
    return ok(Page(items=[TeacherRead.model_validate(t) for t in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[TeacherRead], status_code=201)
def create_teacher(body: TeacherCreate, ctx: RequestContext = Depends(require_perm("teachers.manage"))):
    return ok(TeacherRead.model_validate(svc.create_teacher(ctx, body)))


@router.get("/me", response_model=Envelope[TeacherRead])
def my_profile(ctx: RequestContext = Depends(require_any(*READ))):
    return ok(TeacherRead.model_validate(svc.teacher_profile(ctx)))


@router.get("/{teacher_id}", response_model=Envelope[TeacherRead])
def get_teacher(teacher_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(TeacherRead.model_validate(svc.get_teacher(ctx, teacher_id)))


@router.patch("/{teacher_id}", response_model=Envelope[TeacherRead])
def update_teacher(teacher_id: uuid.UUID, body: TeacherUpdate,
                   ctx: RequestContext = Depends(require_perm("teachers.manage"))):
    return ok(TeacherRead.model_validate(svc.update_teacher(ctx, teacher_id, body)))


@router.get("/{teacher_id}/assignments", response_model=Envelope[list[ClassMemberRead]])
def list_assignments(teacher_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    rows = svc.teacher_assignments(ctx, teacher_id)
    return ok([ClassMemberRead.model_validate(r) for r in rows])


@router.post("/{teacher_id}/assignments", response_model=Envelope[ClassMemberRead], status_code=201)
def assign_teacher(teacher_id: uuid.UUID, body: TeacherAssignRequest,
                   ctx: RequestContext = Depends(require_perm("teachers.manage"))):
    row = svc.assign_teacher(ctx, teacher_id, body.class_id, body.subject_id, body.member_type)
    return ok(ClassMemberRead.model_validate(row))


@router.delete("/{teacher_id}/assignments/{assignment_id}", status_code=204)
def unassign_teacher(teacher_id: uuid.UUID, assignment_id: uuid.UUID,
                     ctx: RequestContext = Depends(require_perm("teachers.manage"))):
    svc.get_teacher(ctx, teacher_id)
    svc.unassign_teacher(ctx, assignment_id)
    return None
