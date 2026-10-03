from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.academic import (
    ClassAddStudents, ClassAssignSubjects, ClassCreate, ClassRead, ClassSubjectRead, ClassUpdate,
)
from app.services import academic as svc

router = APIRouter(prefix="/classes")

READ = ("classes.manage", "classes.read_assigned", "academic.read_own", "children.read_linked")


@router.get("", response_model=Envelope[Page[ClassRead]])
def list_classes(
    paging: tuple[int, int] = Depends(pagination_params),
    academic_year: str | None = Query(default=None),
    status: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_classes(ctx, page=page, size=size, academic_year=academic_year, status=status)
    return ok(Page(items=[ClassRead.model_validate(c) for c in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[ClassRead], status_code=201)
def create_class(body: ClassCreate, ctx: RequestContext = Depends(require_perm("classes.manage"))):
    return ok(ClassRead.model_validate(svc.create_class(ctx, body)))


@router.get("/{class_id}", response_model=Envelope[ClassRead])
def get_class(class_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    return ok(ClassRead.model_validate(svc.get_class(ctx, class_id)))


@router.patch("/{class_id}", response_model=Envelope[ClassRead])
def update_class(class_id: uuid.UUID, body: ClassUpdate,
                 ctx: RequestContext = Depends(require_perm("classes.manage"))):
    return ok(ClassRead.model_validate(svc.update_class(ctx, class_id, body)))


@router.delete("/{class_id}", response_model=Envelope[ClassRead])
def archive_class(class_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("classes.manage"))):
    """Delete means archive: the class is retained for history. Use PATCH to re-activate."""
    return ok(ClassRead.model_validate(svc.archive_class(ctx, class_id)))


@router.post("/{class_id}/students", response_model=Envelope[dict])
def add_students(class_id: uuid.UUID, body: ClassAddStudents,
                 ctx: RequestContext = Depends(require_perm("classes.manage"))):
    return ok(svc.add_students(ctx, class_id, body.student_ids))


@router.get("/{class_id}/subjects", response_model=Envelope[list[ClassSubjectRead]])
def list_class_subjects(class_id: uuid.UUID, ctx: RequestContext = Depends(require_any(*READ))):
    rows = svc.class_subjects(ctx, class_id)
    return ok([ClassSubjectRead.model_validate(r) for r in rows])


@router.post("/{class_id}/subjects", response_model=Envelope[list[ClassSubjectRead]])
def assign_subjects(class_id: uuid.UUID, body: ClassAssignSubjects,
                    ctx: RequestContext = Depends(require_perm("classes.manage"))):
    rows = svc.assign_subjects(ctx, class_id, body.subject_ids)
    return ok([ClassSubjectRead.model_validate(r) for r in rows])


@router.delete("/{class_id}/subjects/{subject_id}", status_code=204)
def remove_subject(class_id: uuid.UUID, subject_id: uuid.UUID,
                   ctx: RequestContext = Depends(require_perm("classes.manage"))):
    svc.remove_subject(ctx, class_id, subject_id)
    return None
