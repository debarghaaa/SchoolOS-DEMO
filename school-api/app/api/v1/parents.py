from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.academic import ParentCreate, ParentStudentRead, ParentStudentRequest, ParentRead, ParentUpdate, StudentRead
from app.services import academic as svc

router = APIRouter(prefix="/parents")

READ = ("parents.manage", "children.read_linked")


@router.get("", response_model=Envelope[Page[ParentRead]])
def list_parents(
    paging: tuple[int, int] = Depends(pagination_params),
    q: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_perm("parents.manage")),
):
    page, size = paging
    items, total = svc.list_parents(ctx, page=page, size=size, q=q)
    return ok(Page(items=[ParentRead.model_validate(p) for p in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[ParentRead], status_code=201)
def create_parent(body: ParentCreate, ctx: RequestContext = Depends(require_perm("parents.manage"))):
    return ok(ParentRead.model_validate(svc.create_parent(ctx, body)))


@router.get("/me", response_model=Envelope[ParentRead])
def my_profile(ctx: RequestContext = Depends(require_any(*READ))):
    return ok(ParentRead.model_validate(svc.parent_profile(ctx)))


@router.get("/{parent_id}", response_model=Envelope[ParentRead])
def get_parent(parent_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(ParentRead.model_validate(svc.get_parent(ctx, parent_id)))


@router.patch("/{parent_id}", response_model=Envelope[ParentRead])
def update_parent(parent_id: uuid.UUID, body: ParentUpdate,
                  ctx: RequestContext = Depends(require_perm("parents.manage"))):
    return ok(ParentRead.model_validate(svc.update_parent(ctx, parent_id, body)))


@router.get("/{parent_id}/children", response_model=Envelope[list[StudentRead]])
def linked_children(parent_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    kids = svc.linked_children(ctx, parent_id)
    return ok([StudentRead.model_validate(k) for k in kids])


@router.post("/{parent_id}/links", response_model=Envelope[ParentStudentRead], status_code=201)
def link_student(parent_id: uuid.UUID, body: ParentStudentRequest,
                 ctx: RequestContext = Depends(require_perm("parents.manage"))):
    row = svc.link_student(ctx, parent_id, body.student_id, body.relation)
    return ok(ParentStudentRead.model_validate(row))


@router.delete("/{parent_id}/links/{link_id}", status_code=204)
def unlink_student(parent_id: uuid.UUID, link_id: uuid.UUID,
                   ctx: RequestContext = Depends(require_perm("parents.manage"))):
    svc.unlink_student(ctx, parent_id, link_id)
    return None
