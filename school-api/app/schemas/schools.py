from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SchoolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
    subscription_tier: str = "trial"
    trial_days: int = Field(default=14, ge=0, le=90)
    feature_flags: dict = Field(default_factory=dict)
    admin_email: EmailStr | None = Field(default=None, description="Invited as the school's first administrator.")
    admin_name: str = Field(default="School Administrator", max_length=200)


class SchoolUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = None
    subscription_tier: str | None = None
    subscription_meta: dict | None = None
    feature_flags: dict | None = None
    trial_ends_at: dt.datetime | None = None


class SchoolRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    status: str
    trial_ends_at: dt.datetime | None
    subscription_tier: str
    subscription_meta: dict
    feature_flags: dict
    created_at: dt.datetime
    updated_at: dt.datetime
