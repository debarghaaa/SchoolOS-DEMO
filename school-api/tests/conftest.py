from __future__ import annotations

import os
import tempfile

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("BCRYPT_ROUNDS", "4")
os.environ.setdefault("ENV", "test")
# E-Lab tests execute via the dev-only local backend (no Docker daemon).
os.environ.setdefault("ELAB_BACKEND", "local")
os.environ.setdefault("ELAB_ALLOW_INSECURE_LOCAL", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-0123456789abcdef-0123456789abcdef")
os.environ.setdefault("STORAGE_LOCAL_DIR", os.path.join(tempfile.mkdtemp(prefix="schoolos-test-"), "storage"))

import pytest
from fastapi.testclient import TestClient

from app.core.db import engine
from app.integrations import email as email_mod
from app.main import create_app
from app.models import Base
from tests.helpers import ensure_root, login, provision

Base.metadata.create_all(engine)
app = create_app()


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c
    # Reset state between tests.
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    email_mod.outbox.clear()
    from app.middleware.rate_limit import _memory_buckets
    _memory_buckets.clear()
    from app.workers.queue import clear_memory_queues
    clear_memory_queues()


@pytest.fixture()
def root_headers(client):
    ensure_root()
    return login(client, "root@schoolos.io")


@pytest.fixture()
def school(client):
    return provision(client)
