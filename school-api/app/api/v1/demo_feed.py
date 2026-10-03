from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import RequestContext, get_request_context
from app.core.responses import Envelope, ok
from app.schemas.demo_feed import DemoDaySnapshot, SchoolAttendanceCounts
from app.services import demo_feed as svc

router = APIRouter(prefix="/demo-feed", tags=["Demo feed"])


@router.get("/faculty", response_model=Envelope[DemoDaySnapshot])
def faculty(ctx: RequestContext = Depends(get_request_context)):
    return ok(svc.day_snapshot(ctx, "faculty"))


@router.get("/staff", response_model=Envelope[DemoDaySnapshot])
def staff(ctx: RequestContext = Depends(get_request_context)):
    return ok(svc.day_snapshot(ctx, "staff"))


@router.get("/students", response_model=Envelope[DemoDaySnapshot])
def students(ctx: RequestContext = Depends(get_request_context)):
    return ok(svc.day_snapshot(ctx, "student"))


@router.get("/school-attendance", response_model=Envelope[SchoolAttendanceCounts])
def school_attendance(ctx: RequestContext = Depends(get_request_context)):
    return ok(svc.school_attendance(ctx))
