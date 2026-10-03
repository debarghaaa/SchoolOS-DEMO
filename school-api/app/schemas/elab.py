from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class RunCreate(BaseModel):
    language: str = Field(min_length=1, max_length=20)
    source_code: str = Field(min_length=1, max_length=102400)
    stdin: str = Field(default="", max_length=32768)


class RunAccepted(BaseModel):
    execution_id: uuid.UUID
    status: str = "queued"


class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    language: str
    status: str
    stage: str | None = None
    stdout: str
    stderr: str
    exit_code: int | None
    runtime_ms: int | None
    created_at: dt.datetime
    started_at: dt.datetime | None
    completed_at: dt.datetime | None
