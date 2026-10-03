from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import RequestContext, require_perm
from app.core.responses import Envelope, Page, ok, pagination_params
from app.schemas.users import InviteCreate, RoleAssign, UserCreate, UserRead, UserUpdate
from app.services import users as svc

router = APIRouter(prefix="/users")


@router.get("", response_model=Envelope[Page[UserRead]])
def list_users(
    paging: tuple[int, int] = Depends(pagination_params),
    role: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_perm("users.manage")),
):
    page, size = paging
    items, total = svc.list_users(ctx, page=page, size=size, role=role, status=status, q=q)
    return ok(Page(items=[UserRead.model_validate(u) for u in items], total=total, page=page, size=size))


@router.post("", response_model=Envelope[UserRead], status_code=201)
def create_user(body: UserCreate, ctx: RequestContext = Depends(require_perm("users.manage"))):
    user, _ = svc.create_user(ctx, body)
    return ok(UserRead.model_validate(user))


@router.post("/invites", response_model=Envelope[dict], status_code=201)
def invite_user(body: InviteCreate, ctx: RequestContext = Depends(require_perm("users.manage"))):
    user = svc.invite_user(ctx, body)
    return ok({"user_id": str(user["id"]), "email": user["email"], "role": user["role"]})


@router.get("/{user_id}", response_model=Envelope[UserRead])
def get_user(user_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("users.manage"))):
    user, membership = svc.get_user(ctx, user_id)
    return ok(UserRead.model_validate(svc.to_read(user, membership)))


@router.patch("/{user_id}", response_model=Envelope[UserRead])
def update_user(user_id: uuid.UUID, body: UserUpdate, ctx: RequestContext = Depends(require_perm("users.manage"))):
    return ok(UserRead.model_validate(svc.update_user(ctx, user_id, body)))


@router.post("/{user_id}/role", response_model=Envelope[UserRead])
def assign_role(user_id: uuid.UUID, body: RoleAssign, ctx: RequestContext = Depends(require_perm("users.manage"))):
    return ok(UserRead.model_validate(svc.assign_role(ctx, user_id, body.role)))


@router.delete("/{user_id}", status_code=204)
def remove_user(user_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("users.manage"))):
    svc.remove_user(ctx, user_id)
    return None


@router.get("/{user_id}/grants", response_model=Envelope[dict])
def list_grants(user_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("users.manage"))):
    return ok({"grants": svc.list_grants(ctx, user_id)})


@router.post("/{user_id}/grants", response_model=Envelope[dict], status_code=201)
def grant_role(user_id: uuid.UUID, body: RoleAssign, ctx: RequestContext = Depends(require_perm("users.manage"))):
    return ok({"grants": svc.grant_role(ctx, user_id, body.role)})


@router.delete("/{user_id}/grants/{role}", response_model=Envelope[dict])
def revoke_grant(user_id: uuid.UUID, role: str, ctx: RequestContext = Depends(require_perm("users.manage"))):
    return ok({"grants": svc.revoke_grant(ctx, user_id, role)})
