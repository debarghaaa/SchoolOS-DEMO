from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import RequestContext, require_perm
from app.core.responses import Envelope, ok
from app.schemas.platform import PlatformAnalytics
from app.services import platform as svc

router = APIRouter(prefix="/platform")


@router.get("/analytics", response_model=Envelope[PlatformAnalytics])
def analytics(ctx: RequestContext = Depends(require_perm("platform.manage"))):
    """Platform-wide aggregates for the super-admin control plane."""
    return ok(svc.get_analytics(ctx))
