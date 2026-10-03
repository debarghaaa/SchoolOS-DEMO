from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class SlotCreate(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID
    day_of_week: int = Field(ge=0, le=6)
    start_time: dt.time
    end_time: dt.time
    room: str | None = Field(default=None, max_length=50)


class SlotUpdate(BaseModel):
    subject_id: uuid.UUID | None = None
    teacher_id: uuid.UUID | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    room: str | None = Field(default=None, max_length=50)


class SlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID
    day_of_week: int
    start_time: dt.time
    end_time: dt.time
    room: str | None
