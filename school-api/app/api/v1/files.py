from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import RequestContext, get_service_db, require_any, require_perm
from app.core.errors import NotFound
from app.core.responses import Envelope, Page, ok, pagination_params
from app.integrations.storage import get_storage
from app.models.file import StoredFile
from app.schemas.files import DownloadResponse, FileRead, PresignRequest, PresignResponse
from app.security.jwt import decode_token
from app.services import files as svc
from app.services.audit import Action, log_event

router = APIRouter(prefix="/files")


@router.get("/shared/{token}")
def shared_download(token: str, db: Session = Depends(get_service_db)):
    """Token-gated download (no login). Tokens are short-lived and single-file."""
    claims = decode_token(token, expected_type="file")
    row = db.scalar(select(StoredFile).where(
        StoredFile.id == uuid.UUID(claims["file_id"]),
        StoredFile.tenant_id == uuid.UUID(claims["tenant_id"])))
    if row is None or not row.uploaded:
        raise NotFound("File not found.", resource="file")
    backend = get_storage()
    url = backend.presign_get(row.object_key, 60)
    if url is not None:
        return RedirectResponse(url=url)
    log_event(db, actor_id=None, actor_role=None, tenant_id=row.tenant_id,
              action=Action.FILE_DOWNLOADED, resource_type="file", resource_id=str(row.id),
              extra={"via": "shared_link"})
    return Response(content=backend.get_object(row.object_key), media_type=row.mime_type,
                    headers={"Content-Disposition": f'attachment; filename="{row.filename}"'})


@router.post("", response_model=Envelope[FileRead], status_code=201)
def upload(
    file: UploadFile = File(...),
    purpose: str = Form(default="general"),
    ctx: RequestContext = Depends(require_perm("files.upload")),
):
    data = file.file.read()
    row = svc.upload_file(ctx, filename=file.filename or "upload",
                          mime_type=file.content_type or "application/octet-stream",
                          data=data, purpose=(purpose or "general")[:40])
    return ok(FileRead.model_validate(row))


@router.post("/presigned-upload", response_model=Envelope[PresignResponse], status_code=201)
def presigned_upload(body: PresignRequest, ctx: RequestContext = Depends(require_perm("files.upload"))):
    payload = svc.presign_upload(ctx, body)
    return ok(PresignResponse(**payload))


@router.post("/{file_id}/confirm", response_model=Envelope[FileRead])
def confirm_upload(file_id: uuid.UUID, ctx: RequestContext = Depends(require_perm("files.upload"))):
    return ok(FileRead.model_validate(svc.confirm_upload(ctx, file_id)))


@router.get("", response_model=Envelope[Page[FileRead]])
def list_files(
    paging: tuple[int, int] = Depends(pagination_params),
    purpose: str | None = Query(default=None),
    ctx: RequestContext = Depends(require_any("files.manage", "files.upload", "files.read_submissions")),
):
    page, size = paging
    items, total = svc.list_files(ctx, page=page, size=size, purpose=purpose)
    return ok(Page(items=[FileRead.model_validate(f) for f in items], total=total, page=page, size=size))


@router.get("/{file_id}/download-url", response_model=Envelope[DownloadResponse])
def download_url(file_id: uuid.UUID,
                 ctx: RequestContext = Depends(require_any("files.manage", "files.upload", "files.read_submissions"))):
    return ok(DownloadResponse(**svc.download_url(ctx, file_id)))


@router.get("/{file_id}", response_model=Envelope[FileRead])
def get_file(file_id: uuid.UUID,
             ctx: RequestContext = Depends(require_any("files.manage", "files.upload", "files.read_submissions"))):
    return ok(FileRead.model_validate(svc.get_file(ctx, file_id)))


@router.delete("/{file_id}", status_code=204)
def delete_file(file_id: uuid.UUID,
                ctx: RequestContext = Depends(require_any("files.manage", "files.upload"))):
    svc.delete_file(ctx, file_id)
    return None
