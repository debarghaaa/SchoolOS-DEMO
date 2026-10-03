from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.academic import SubjectCreate, SubjectRead, SubjectUpdate
from app.services import academic as svc

router = APIRouter(prefix="/subjects")

READ = ("subjects.manage", "assignments.manage_assigned", "academic.read_own", "children.read_linked")


@router.get("", response_model=Envelope[Page[SubjectRead]])
def list_subjects(
    paging: tuple[int, int] = Depends(pagination_params),
    q: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_subjects(ctx, page=page, size=size, q=q)
    return ok(Page(items=[SubjectRead.model_validate(s) for s in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[SubjectRead], status_code=201)
def create_subject(body: SubjectCreate, ctx: RequestContext = Depends(require_perm("subjects.manage"))):
    return ok(SubjectRead.model_validate(svc.create_subject(ctx, body)))


@router.get("/{subject_id}", response_model=Envelope[SubjectRead])
def get_subject(subject_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(SubjectRead.model_validate(svc.get_subject(ctx, subject_id)))


@router.patch("/{subject_id}", response_model=Envelope[SubjectRead])
def update_subject(subject_id: uuid.UUID, body: SubjectUpdate,
                   ctx: RequestContext = Depends(require_perm("subjects.manage"))):
    return ok(SubjectRead.model_validate(svc.update_subject(ctx, subject_id, body)))


@router.delete("/{subject_id}", status_code=204)
def delete_subject(subject_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("subjects.manage"))):
    svc.delete_subject(ctx, subject_id)
    return None
