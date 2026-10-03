from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    body: str
    data: dict
    read_at: dt.datetime | None
    created_at: dt.datetime


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=5000)
    audience: str = Field(default="all", description="all | teachers | students | parents")


class NotificationList(BaseModel):
    items: list[NotificationRead]
    total: int
    page: int
    size: int
    unread: int
