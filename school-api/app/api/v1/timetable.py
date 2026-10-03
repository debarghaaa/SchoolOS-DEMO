from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.timetable import SlotCreate, SlotRead, SlotUpdate
from app.services import timetable as svc

router = APIRouter(prefix="/timetable")

READ = ("timetable.manage", "timetable.read_own", "timetable.read_linked")


@router.get("", response_model=Envelope[Page[SlotRead]])
def list_slots(
    paging: tuple[int, int] = Depends(pagination_params),
    class_id: uuid.UUID | None = Query(default=None),
    teacher_id: uuid.UUID | None = Query(default=None),
    student_id: uuid.UUID | None = Query(default=None),
    day: int | None = Query(default=None, ge=0, le=6),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.list_slots(ctx, page=page, size=size, class_id=class_id,
                                  teacher_id=teacher_id, student_id=student_id, day=day)
    return ok(Page(items=[SlotRead.model_validate(s) for s in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[SlotRead], status_code=201)
def create_slot(body: SlotCreate, ctx: RequestContext = Depends(require_perm("timetable.manage"))):
    return ok(SlotRead.model_validate(svc.create_slot(ctx, body)))


@router.patch("/{slot_id}", response_model=Envelope[SlotRead])
def update_slot(slot_id: uuid.UUID, body: SlotUpdate,
                ctx: RequestContext = Depends(require_perm("timetable.manage"))):
    return ok(SlotRead.model_validate(svc.update_slot(ctx, slot_id, body)))


@router.delete("/{slot_id}", status_code=204)
def delete_slot(slot_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("timetable.manage"))):
    svc.delete_slot(ctx, slot_id)
    return None
