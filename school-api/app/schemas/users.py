from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    role: str
    password: str | None = Field(default=None, min_length=8, max_length=128)
    send_invite: bool = False


class UserUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    membership_status: str | None = None


class RoleAssign(BaseModel):
    role: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    status: str
    email_verified_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime
    role: str | None = None
    membership_status: str | None = None


class InviteCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    role: str


class InviteRead(BaseModel):
    user_id: uuid.UUID
    email: str
    role: str
    expires_at: dt.datetime
