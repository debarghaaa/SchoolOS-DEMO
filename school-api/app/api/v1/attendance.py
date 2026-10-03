from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_any
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.attendance import AttendanceBulk, AttendanceMark, AttendanceRead, AttendanceStats, AttendanceUpdate
from app.services import attendance as svc

router = APIRouter(prefix="/attendance")

MARK = ("attendance.manage", "attendance.mark")
READ = ("attendance.manage", "attendance.mark", "attendance.read_assigned", "attendance.read_own", "attendance.read_linked")


@router.get("", response_model=Envelope[Page[AttendanceRead]])
def history(
    paging: tuple[int, int] = Depends(pagination_params),
    class_id: uuid.UUID | None = Query(default=None),
    student_id: uuid.UUID | None = Query(default=None),
    date_from: dt.date | None = Query(default=None),
    date_to: dt.date | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    page, size = paging
    items, total = svc.history(ctx, page=page, size=size, class_id=class_id, student_id=student_id,
                               date_from=date_from, date_to=date_to)
    return ok(Page(items=[AttendanceRead.model_validate(r) for r in items], total=total, page=page, size=size))


@router.post("/mark", response_model=Envelope[AttendanceRead], status_code=201)
def mark(body: AttendanceMark, ctx: RequestContext = Depends(require_any(*MARK))):
    return ok(AttendanceRead.model_validate(svc.mark(ctx, body)))


@router.post("/bulk", response_model=Envelope[list[AttendanceRead]], status_code=201)
def bulk_mark(body: AttendanceBulk, ctx: RequestContext = Depends(require_any(*MARK))):
    rows = svc.bulk_mark(ctx, body)
    return ok([AttendanceRead.model_validate(r) for r in rows])


@router.patch("/{record_id}", response_model=Envelope[AttendanceRead])
def update_record(record_id: uuid.UUID, body: AttendanceUpdate, ctx: RequestContext = Depends(require_any(*MARK))):
    return ok(AttendanceRead.model_validate(svc.update_record(ctx, record_id, body)))


@router.get("/stats/student/{student_id}", response_model=Envelope[AttendanceStats])
def student_stats(
    student_id: uuid.UUID,
    date_from: dt.date | None = Query(default=None),
    date_to: dt.date | None = Query(default=None),
    ctx: RequestContext = Depends(require_any(*READ)),
):
    return ok(AttendanceStats(**svc.student_stats(ctx, student_id, date_from, date_to)))


@router.get("/stats/class/{class_id}", response_model=Envelope[AttendanceStats])
def class_stats(
    class_id: uuid.UUID,
    date_from: dt.date | None = Query(default=None),
    date_to: dt.date | None = Query(default=None),
    ctx: RequestContext = Depends(require_any("attendance.manage", "attendance.mark", "attendance.read_assigned")),
):
    return ok(AttendanceStats(**svc.class_stats(ctx, class_id, date_from, date_to)))
