from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import RequestContext, get_request_context, get_service_db
from app.core.config import settings
from app.core.responses import Envelope, ok
from app.middleware.rate_limit import rate_limit
from app.schemas.auth import (
    InviteAccept, LoginRequest, LoginResponse, LogoutRequest, MembershipOption, PasswordChangeRequest,
    PasswordResetConfirm, PasswordResetRequest, RefreshRequest, SelectTenantRequest,
    SessionRead, SupabaseTokenResponse, TokenPair, UserSummary, VerifyConfirm, VerifyRequest,
)
from app.services import auth as svc
from app.services import supabase_tokens as feed_svc

router = APIRouter(prefix="/auth")


def _meta(request: Request) -> dict:
    return {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("User-Agent"),
    }


def _pair(access: str, refresh: str) -> TokenPair:
    return TokenPair(access_token=access, refresh_token=refresh,
                     expires_in=settings.ACCESS_TOKEN_MINUTES * 60)


def _summary(user, tenant_id=None, role=None) -> UserSummary:
    return UserSummary(id=user.id, email=user.email, first_name=user.first_name,
                       last_name=user.last_name, status=user.status,
                       tenant_id=tenant_id, role=role)


@router.post("/login", response_model=Envelope[LoginResponse], dependencies=[Depends(rate_limit("10/minute"))])
def login(body: LoginRequest, request: Request, db: Session = Depends(get_service_db)):
    result = svc.login(db, body.email.lower(), body.password, _meta(request))
    tokens = None
    tenant_id = role = None
    if result.access_token and result.refresh_token:
        tokens = _pair(result.access_token, result.refresh_token)
        if result.memberships:
            tenant_id = result.memberships[0].tenant_id
            role = result.memberships[0].role
        elif result.can_access_platform:
            role = "super-admin"
    return ok(LoginResponse(
        tokens=tokens,
        user=_summary(result.user, tenant_id, role),
        memberships=result.memberships,
        requires_selection=result.requires_selection,
        select_token=result.select_token,
        can_access_platform=result.can_access_platform,
    ))


@router.post("/select-tenant", response_model=Envelope[LoginResponse],
             dependencies=[Depends(rate_limit("10/minute"))])
def select_tenant(body: SelectTenantRequest, request: Request, db: Session = Depends(get_service_db)):
    user, access, refresh = svc.select_tenant(db, body.select_token, body.tenant_id, _meta(request))
    role = "super-admin" if body.tenant_id is None else None
    memberships = []
    if body.tenant_id is not None:
        from app.repositories.users import get_membership
        m = get_membership(db, user.id, body.tenant_id)
        role = m.role if m else None
        memberships = [MembershipOption(tenant_id=body.tenant_id, tenant_slug=None,
                                          tenant_name=None, role=role or "")]
    return ok(LoginResponse(
        tokens=_pair(access, refresh),
        user=_summary(user, body.tenant_id, role),
        memberships=memberships,
    ))


@router.post("/refresh", response_model=Envelope[TokenPair], dependencies=[Depends(rate_limit("30/minute"))])
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_service_db)):
    user, access, new_refresh = svc.refresh(db, body.refresh_token, _meta(request))
    return ok(_pair(access, new_refresh))


@router.post("/logout", response_model=Envelope[dict])
def logout(body: LogoutRequest, request: Request, ctx: RequestContext = Depends(get_request_context)):
    count = svc.logout(ctx.db, ctx.user, ctx.tenant_id, ctx.role, body.refresh_token,
                       body.all_sessions, _meta(request))
    return ok({"sessions_revoked": count})


@router.get("/me", response_model=Envelope[UserSummary])
def me(ctx: RequestContext = Depends(get_request_context)):
    return ok(_summary(ctx.user, ctx.tenant_id, ctx.role))


@router.get("/sessions", response_model=Envelope[list[SessionRead]])
def sessions(ctx: RequestContext = Depends(get_request_context)):
    rows = svc.list_sessions(ctx.db, ctx.user, ctx.refresh_jti)
    return ok([SessionRead(**r) for r in rows])


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: uuid.UUID, ctx: RequestContext = Depends(get_request_context)):
    svc.revoke_session(ctx.db, ctx.user, session_id)
    return None


@router.post("/supabase-token", response_model=Envelope[SupabaseTokenResponse],
             dependencies=[Depends(rate_limit("30/minute"))])
def supabase_token(ctx: RequestContext = Depends(get_request_context)):
    return ok(SupabaseTokenResponse(**feed_svc.mint_feed_token(ctx)))


@router.post("/password", response_model=Envelope[dict])
def change_password(body: PasswordChangeRequest, request: Request, ctx: RequestContext = Depends(get_request_context)):
    svc.change_password(ctx.db, ctx.user, ctx.tenant_id, ctx.role, body.current_password,
                        body.new_password, ctx.refresh_jti, _meta(request))
    return ok({"changed": True})


@router.post("/password-reset/request", response_model=Envelope[dict],
             dependencies=[Depends(rate_limit("10/minute"))])
def password_reset_request(body: PasswordResetRequest, db: Session = Depends(get_service_db)):
    svc.request_password_reset(db, body.email.lower())
    return ok({"sent": True})


@router.post("/password-reset/confirm", response_model=Envelope[dict],
             dependencies=[Depends(rate_limit("10/minute"))])
def password_reset_confirm(body: PasswordResetConfirm, request: Request, db: Session = Depends(get_service_db)):
    svc.confirm_password_reset(db, body.token, body.new_password, _meta(request))
    return ok({"reset": True})


@router.post("/verify-email/request", response_model=Envelope[dict],
             dependencies=[Depends(rate_limit("10/minute"))])
def verify_request(body: VerifyRequest, db: Session = Depends(get_service_db)):
    svc.request_email_verification(db, body.email.lower())
    return ok({"sent": True})


@router.post("/verify-email/confirm", response_model=Envelope[dict])
def verify_confirm(body: VerifyConfirm, request: Request, db: Session = Depends(get_service_db)):
    user = svc.confirm_email_verification(db, body.token, _meta(request))
    return ok({"verified": True, "email": user.email})


@router.post("/invites/accept", response_model=Envelope[UserSummary],
             dependencies=[Depends(rate_limit("10/minute"))])
def invite_accept(body: InviteAccept, request: Request, db: Session = Depends(get_service_db)):
    user = svc.accept_invite(db, body.token, body.first_name, body.last_name,
                             body.password, _meta(request))
    return ok(_summary(user))
