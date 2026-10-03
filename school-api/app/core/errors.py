from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base application error rendered as a machine-readable envelope."""

    status: int = 500
    code: str = "internal_error"
    message: str = "Something went wrong."

    def __init__(self, message: str | None = None, details: Any | None = None, resource: str | None = None):
        super().__init__(message or self.message)
        if message:
            self.message = message
        self.details = details
        self.resource = resource


class Unauthorized(AppError):
    status = 401
    code = "unauthorized"
    message = "Authentication required."


class Forbidden(AppError):
    status = 403
    code = "forbidden"
    message = "Not authorized."


class TenantRequired(Forbidden):
    code = "tenant_required"
    message = "This endpoint requires a school tenant context."


class TenantMismatch(Forbidden):
    code = "tenant_mismatch"
    message = "Tenant context does not match the authenticated identity."


class NotFound(AppError):
    status = 404
    code = "not_found"
    message = "Resource not found."


class Conflict(AppError):
    status = 409
    code = "conflict"
    message = "Request conflicts with current state."


class Duplicate(Conflict):
    code = "duplicate"
    message = "Resource already exists."


class ValidationFailed(AppError):
    status = 422
    code = "validation_error"
    message = "Request validation failed."


class Expired(AppError):
    status = 410
    code = "expired"
    message = "The token or resource has expired."


class InvalidToken(AppError):
    status = 401
    code = "invalid_token"
    message = "Invalid or expired token."


class RateLimited(AppError):
    status = 429
    code = "rate_limited"
    message = "Too many requests. Please slow down."


class DeadlinePassed(AppError):
    status = 422
    code = "deadline_passed"
    message = "The submission deadline has passed."


class ScheduleConflict(Conflict):
    code = "schedule_conflict"
    message = "Timetable slot conflicts with an existing slot."


class QueueUnavailable(AppError):
    status = 503
    code = "queue_unavailable"
    message = "Background queue unavailable. Please retry shortly."


class StorageError(AppError):
    status = 502
    code = "storage_error"
    message = "Object storage operation failed."


class PayloadTooLarge(AppError):
    status = 413
    code = "payload_too_large"
    message = "Uploaded file exceeds the size limit."


class NotSupported(AppError):
    status = 501
    code = "not_supported"
    message = "Operation not supported with the current configuration."


class UpstreamError(AppError):
    status = 502
    code = "upstream_error"
    message = "Upstream service call failed."
