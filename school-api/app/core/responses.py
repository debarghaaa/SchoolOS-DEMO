from __future__ import annotations

from typing import Any, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel

T = TypeVar("T")


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any | None = None


class Envelope(BaseModel, Generic[T]):
    success: bool = True
    data: T | None = None
    error: ErrorBody | None = None


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


def ok(data: Any) -> dict:
    return {"success": True, "data": data, "error": None}


def fail(code: str, message: str, details: Any | None = None) -> dict:
    return {"success": False, "data": None, "error": {"code": code, "message": message, "details": details}}


def pagination_params(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> tuple[int, int]:
    return page, size
