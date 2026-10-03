from __future__ import annotations

import uuid
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def _is_memory_sqlite(url: str) -> bool:
    return url in ("sqlite://", "sqlite:///:memory:")


_engine_kwargs: dict = {}
if _is_sqlite(settings.DATABASE_URL):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
if _is_memory_sqlite(settings.DATABASE_URL):
    # One shared connection, otherwise every session sees a fresh empty DB.
    _engine_kwargs["poolclass"] = StaticPool
else:
    _engine_kwargs["pool_pre_ping"] = True
    if not _is_sqlite(settings.DATABASE_URL):
        _engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
        _engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW

engine = create_engine(settings.DATABASE_URL, future=True, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)

DIALECT = engine.dialect.name


def set_rls(db: Session, tenant_id: uuid.UUID | None, bypass: bool = False) -> None:
    """Set PostgreSQL Row-Level Security session variables for this transaction.

    No-op on other dialects. ``tenant_id`` is type-checked (never raw client
    input) so the interpolated value is always a safe canonical UUID string.
    """
    if DIALECT != "postgresql":
        return
    if tenant_id is not None and not isinstance(tenant_id, uuid.UUID):
        raise TypeError("tenant_id must be a UUID")
    db.execute(text("SELECT 1"))  # ensure we are inside a transaction for SET LOCAL
    if bypass:
        db.execute(text("SET LOCAL app.bypass_rls = 'true'"))
    if tenant_id is not None:
        db.execute(text(f"SET LOCAL app.tenant_id = '{tenant_id}'"))


@contextmanager
def service_session():
    """Short-lived session for service/CLI/worker flows (commits on success).

    Callers that legitimately operate outside tenant scope (login, token
    verification, background jobs) must explicitly opt into RLS bypass via
    ``set_rls(db, None, bypass=True)`` — application code still scopes every
    query itself; RLS is the backstop, not the primary gate.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
