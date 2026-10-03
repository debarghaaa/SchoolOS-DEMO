from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import service_session, set_rls
from app.core.errors import AppError
from app.core.logging import setup_logging
from app.core.responses import fail, ok
from app.middleware.metrics import MetricsMiddleware, metrics_response
from app.middleware.rate_limit import rate_limit  # noqa: F401 - re-exported for routes
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.services.audit import Action, log_event

log = logging.getLogger("schoolos")


def _audit_denial(request: Request, exc: AppError) -> None:
    """Best-effort audit of denied attempts (actor resolved from the token)."""
    try:
        from app.security.jwt import decode_token

        actor_id, actor_role, tenant_id = None, None, None
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                claims = decode_token(auth.split(None, 1)[1], expected_type="access")
                actor_id = uuid.UUID(claims["sub"]) if claims.get("sub") else None
                actor_role = claims.get("role")
                tenant_id = uuid.UUID(claims["tenant_id"]) if claims.get("tenant_id") else None
            except Exception:
                pass
        with service_session() as db:
            set_rls(db, None, bypass=True)
            log_event(db, actor_id=actor_id, actor_role=actor_role, tenant_id=tenant_id,
                      action=Action.ACCESS_DENIED, resource_type=exc.resource or request.url.path,
                      ip=request.client.host if request.client else None,
                      user_agent=request.headers.get("User-Agent"),
                      extra={"code": exc.code, "method": request.method, "path": request.url.path})
    except Exception:
        log.exception("denial audit failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_prod and settings.SECRET_KEY == "dev-secret-change-me":
        log.error("Refusing to run: SECRET_KEY must be set in production.")
        raise RuntimeError("SECRET_KEY must be set in production.")
    log.info("starting %s (env=%s)", settings.APP_NAME, settings.ENV)
    yield


def create_app() -> FastAPI:
    setup_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan,
                  docs_url="/docs", redoc_url="/redoc", openapi_url="/openapi.json")

    app.add_middleware(MetricsMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        if exc.status in (401, 403):
            _audit_denial(request, exc)
        return JSONResponse(status_code=exc.status, content=fail(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content=fail(
            "validation_error", "Request validation failed.", exc.errors()))

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        code = "not_found" if exc.status_code == 404 else "http_error"
        return JSONResponse(status_code=exc.status_code, content=fail(code, exc.detail or "Error."))

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        # Never expose internal errors (tracebacks, SQL) to clients.
        log.exception("unhandled error: %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content=fail("internal_error", "Something went wrong."))

    @app.get("/health", include_in_schema=False)
    def health():
        return ok({"status": "ok", "version": "1.0.0", "env": settings.ENV})

    @app.get("/ready", include_in_schema=False)
    def ready():
        # Readiness (for load balancers / orchestrators): 503 until the
        # database answers. Redis may be down — the API degrades (inline
        # notifications, refused code execution) but still serves traffic.
        from fastapi.responses import JSONResponse

        from app.core.db import engine
        status: dict[str, str] = {}
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            status["database"] = "up"
        except Exception:
            status["database"] = "down"
        try:
            from app.core.redis_client import get_redis
            get_redis().ping()
            status["redis"] = "up"
        except Exception:
            status["redis"] = "down (degraded mode)"
        code = 200 if status["database"] == "up" else 503
        return JSONResponse(status_code=code, content=ok(status))

    @app.get("/metrics", include_in_schema=False)
    def metrics():
        return metrics_response()

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
