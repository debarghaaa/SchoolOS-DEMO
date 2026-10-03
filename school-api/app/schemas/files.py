from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field


class FileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    owner_id: uuid.UUID | None
    filename: str
    mime_type: str
    size: int
    purpose: str
    uploaded: bool
    created_at: dt.datetime


class PresignRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", max_length=128)
    size: int = Field(gt=0)
    purpose: str = Field(default="general", max_length=40)


class PresignResponse(BaseModel):
    file_id: uuid.UUID
    upload_url: str
    method: str = "PUT"
    expires_in: int = 900


class DownloadResponse(BaseModel):
    url: str
    expires_in: int = 900
