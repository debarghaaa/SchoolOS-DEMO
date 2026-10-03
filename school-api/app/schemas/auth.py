from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    status: str
    tenant_id: uuid.UUID | None = None
    role: str | None = None


class MembershipOption(BaseModel):
    tenant_id: uuid.UUID
    tenant_slug: str | None = None
    tenant_name: str | None = None
    role: str


class LoginResponse(BaseModel):
    tokens: TokenPair | None = None
    user: UserSummary
    memberships: list[MembershipOption] = Field(default_factory=list)
    requires_selection: bool = False
    select_token: str | None = None
    can_access_platform: bool = False


class SelectTenantRequest(BaseModel):
    select_token: str
    tenant_id: uuid.UUID | None = Field(
        default=None, description="Omit to select the platform session (super-admins).")


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None
    all_sessions: bool = False


class SessionRead(BaseModel):
    id: uuid.UUID
    ip: str | None
    user_agent: str | None
    created_at: dt.datetime
    expires_at: dt.datetime
    current: bool = False


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class VerifyRequest(BaseModel):
    email: EmailStr


class VerifyConfirm(BaseModel):
    token: str


class InviteAccept(BaseModel):
    token: str
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    password: str = Field(min_length=8, max_length=128)


class SupabaseTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    supabase_user_id: str
