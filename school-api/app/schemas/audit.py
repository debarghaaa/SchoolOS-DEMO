from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict


class AuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID | None
    actor_id: uuid.UUID | None
    actor_role: str | None
    action: str
    resource_type: str
    resource_id: str | None
    ip: str | None
    extra: dict
    created_at: dt.datetime
