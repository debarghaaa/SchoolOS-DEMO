from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_perm
from app.core.responses import Envelope, ok, pagination_params
from app.schemas.notifications import AnnouncementCreate, NotificationList, NotificationRead
from app.services import notifications as svc

router = APIRouter(prefix="/notifications")


@router.get("", response_model=Envelope[NotificationList])
def my_notifications(
    paging: tuple[int, int] = Depends(pagination_params),
    unread_only: bool = Query(default=False),
    ctx: RequestContext = Depends(require_perm("notifications.read")),
):
    page, size = paging
    items, total, unread = svc.my_notifications(ctx, page=page, size=size, unread_only=unread_only)
    return ok(NotificationList(items=[NotificationRead.model_validate(n) for n in items],
                               total=total, page=page, size=size, unread=unread))


@router.get("/unread-count", response_model=Envelope[dict])
def unread_count(ctx: RequestContext = Depends(require_perm("notifications.read"))):
    _, _, unread = svc.my_notifications(ctx, page=1, size=1, unread_only=True)
    return ok({"unread": unread})


@router.post("/read-all", response_model=Envelope[dict])
def read_all(ctx: RequestContext = Depends(require_perm("notifications.read"))):
    return ok({"marked": svc.mark_all_read(ctx)})


@router.patch("/{notification_id}/read", response_model=Envelope[NotificationRead])
def mark_read(notification_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("notifications.read"))):
    return ok(NotificationRead.model_validate(svc.mark_read(ctx, notification_id)))


@router.post("/announcements", response_model=Envelope[dict], status_code=201)
def announce(body: AnnouncementCreate, ctx: RequestContext = Depends(require_perm("notifications.send"))):
    return ok(svc.announce(ctx, body))
