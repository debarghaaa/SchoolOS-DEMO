from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.core.config import settings
from app.core.constants import Role
from app.core.errors import Forbidden, NotFound, NotSupported, PayloadTooLarge, ValidationFailed
from app.integrations.storage import get_storage
from app.models.file import StoredFile
from app.security.jwt import create_file_token
from app.services.audit import Action, log_ctx

if TYPE_CHECKING:
    from app.api.deps import RequestContext


def _safe_filename(name: str) -> str:
    cleaned = "".join(c for c in name if c.isalnum() or c in ("-", "_", ".", " ")).strip()
    return cleaned[:200] or "upload"


def _check_size(size: int) -> None:
    if size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise PayloadTooLarge(f"File exceeds the {settings.MAX_UPLOAD_MB} MB limit.")


def can_read_file(ctx: RequestContext, row: StoredFile) -> bool:
    if row.owner_id == ctx.user.id:
        return True
    if Role.SCHOOL_ADMIN in ctx.roles:
        return True
    # Teachers grade submissions, so they may read submission attachments.
    if Role.TEACHER in ctx.roles and row.purpose == "submission":
        return True
    return False


def upload_file(ctx: RequestContext, *, filename: str, mime_type: str, data: bytes, purpose: str) -> StoredFile:
    _check_size(len(data))
    safe = _safe_filename(filename)
    key = f"{ctx.tenant_id}/{uuid.uuid4().hex}/{safe}"
    get_storage().put_object(key, data, mime_type or "application/octet-stream")
    row = StoredFile(tenant_id=ctx.tenant_id, owner_id=ctx.user.id, object_key=key,
                     filename=safe, mime_type=mime_type or "application/octet-stream",
                     size=len(data), purpose=purpose or "general", uploaded=True)
    ctx.db.add(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.FILE_UPLOADED, resource_type="file", resource_id=row.id,
            extra={"size": len(data), "purpose": row.purpose})
    return row


def presign_upload(ctx: RequestContext, data) -> dict:
    _check_size(data.size)
    backend = get_storage()
    safe = _safe_filename(data.filename)
    key = f"{ctx.tenant_id}/{uuid.uuid4().hex}/{safe}"
    url = backend.presign_put(key, data.mime_type, 900)
    if url is None:
        raise NotSupported("Presigned uploads require the S3 storage backend. Use multipart upload instead.")
    row = StoredFile(tenant_id=ctx.tenant_id, owner_id=ctx.user.id, object_key=key,
                     filename=safe, mime_type=data.mime_type, size=data.size,
                     purpose=data.purpose, uploaded=False)
    ctx.db.add(row)
    ctx.db.flush()
    return {"file_id": row.id, "upload_url": url, "method": "PUT", "expires_in": 900}


def confirm_upload(ctx: RequestContext, file_id: uuid.UUID) -> StoredFile:
    row = get_scoped_file(ctx, file_id)
    if row.owner_id != ctx.user.id and Role.SCHOOL_ADMIN not in ctx.roles:
        raise Forbidden("Only the owner can confirm this upload.")
    if not get_storage().object_exists(row.object_key):
        raise ValidationFailed("Upload not completed. The object is not in storage yet.")
    row.uploaded = True
    ctx.db.flush()
    log_ctx(ctx, action=Action.FILE_UPLOADED, resource_type="file", resource_id=row.id, extra={"via": "presigned"})
    return row


def get_scoped_file(ctx: RequestContext, file_id: uuid.UUID) -> StoredFile:
    row = ctx.db.scalar(select(StoredFile).where(
        StoredFile.id == file_id, StoredFile.tenant_id == ctx.tenant_id))
    if row is None:
        raise NotFound("File not found.", resource="file")
    return row


def get_file(ctx: RequestContext, file_id: uuid.UUID) -> StoredFile:
    row = get_scoped_file(ctx, file_id)
    if not can_read_file(ctx, row):
        raise Forbidden("You are not authorized to access this file.")
    return row


def list_files(ctx, *, page, size, purpose):
    stmt = select(StoredFile).where(StoredFile.tenant_id == ctx.tenant_id)
    if Role.SCHOOL_ADMIN not in ctx.roles:
        stmt = stmt.where(StoredFile.owner_id == ctx.user.id)
    if purpose:
        stmt = stmt.where(StoredFile.purpose == purpose)
    total = ctx.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(ctx.db.scalars(stmt.order_by(StoredFile.created_at.desc())
                                .offset((page - 1) * size).limit(size)).all())
    return items, total


def download_url(ctx: RequestContext, file_id: uuid.UUID) -> dict:
    row = get_file(ctx, file_id)
    if not row.uploaded:
        raise ValidationFailed("Upload not completed yet.")
    backend = get_storage()
    url = backend.presign_get(row.object_key, 900)
    if url is None:
        token = create_file_token(file_id=row.id, tenant_id=row.tenant_id)
        url = f"{settings.API_BASE_URL}/api/v1/files/shared/{token}"
    log_ctx(ctx, action=Action.FILE_DOWNLOADED, resource_type="file", resource_id=row.id)
    return {"url": url, "expires_in": 900}


def delete_file(ctx: RequestContext, file_id: uuid.UUID) -> None:
    row = get_scoped_file(ctx, file_id)
    if row.owner_id != ctx.user.id and Role.SCHOOL_ADMIN not in ctx.roles:
        raise Forbidden("Only the owner or a school-admin can delete this file.")
    get_storage().delete_object(row.object_key)
    ctx.db.delete(row)
    ctx.db.flush()
    log_ctx(ctx, action=Action.FILE_DELETED, resource_type="file", resource_id=file_id)
