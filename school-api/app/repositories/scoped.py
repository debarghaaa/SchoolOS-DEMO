from __future__ import annotations

import uuid
from typing import Any, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound


def _visibility_filters(model) -> list:
    """Soft-deleted rows are hidden unless explicitly included."""
    if hasattr(model, "deleted_at"):
        return [model.deleted_at.is_(None)]
    return []


def get_scoped(db: Session, model, tenant_id: uuid.UUID | None, obj_id: uuid.UUID, resource: str,
               *, include_deleted: bool = False):
    """Fetch one tenant-scoped row. Cross-tenant (or deleted) ids read as 404."""
    filters: list[Any] = [model.id == obj_id, model.tenant_id == tenant_id]
    if not include_deleted:
        filters += _visibility_filters(model)
    obj = db.scalar(select(model).where(*filters))
    if obj is None:
        raise NotFound(f"{resource} not found.", resource=resource)
    return obj


def list_scoped(
    db: Session,
    model,
    tenant_id: uuid.UUID,
    *,
    page: int = 1,
    size: int = 20,
    order_by: Any = None,
    filters: Sequence[Any] = (),
    include_deleted: bool = False,
) -> tuple[list, int]:
    where: list[Any] = [model.tenant_id == tenant_id, *filters]
    if not include_deleted:
        where += _visibility_filters(model)
    stmt = select(model).where(*where)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    if order_by is not None:
        stmt = stmt.order_by(order_by)
    items = list(db.scalars(stmt.offset((page - 1) * size).limit(size)).all())
    return items, total


def exists_scoped(db: Session, model, tenant_id: uuid.UUID, *filters) -> bool:
    where: list[Any] = [model.tenant_id == tenant_id, *filters, *_visibility_filters(model)]
    return (db.scalar(select(func.count()).select_from(model).where(*where)) or 0) > 0
