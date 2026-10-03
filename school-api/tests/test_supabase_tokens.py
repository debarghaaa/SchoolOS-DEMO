from __future__ import annotations

import json

import httpx
import pytest

from app.core.config import settings
from app.services import supabase_tokens as svc
from tests.helpers import data, error


@pytest.fixture
def feed_env(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://feed.test")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_KEY", "svc-key")


def _gotrue(monkeypatch, existing: list[dict] | None = None, fail: str | None = None):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/auth/v1/admin/users" and request.method == "GET":
            return httpx.Response(200, json={"users": existing or []})
        if path == "/auth/v1/admin/users" and request.method == "POST":
            seen["create"] = json.loads(request.content.decode())
            return httpx.Response(200, json={"id": "sb-user-1"})
        if path.startswith("/auth/v1/admin/users/") and request.method == "PUT":
            seen["update"] = json.loads(request.content.decode())
            return httpx.Response(200, json={"id": path.rsplit("/", 1)[1]})
        if path == "/auth/v1/token" and request.method == "POST":
            if fail == "token":
                return httpx.Response(500, json={"error": "boom"})
            return httpx.Response(200, json={
                "access_token": "sb.jwt.token", "token_type": "bearer", "expires_in": 3600})
        return httpx.Response(404, json={"error": "unexpected " + path})

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client
    monkeypatch.setattr(svc.httpx, "Client", lambda **kw: real_client(transport=transport))
    return seen


def test_exchange_unconfigured_returns_501(client, school):
    assert settings.SUPABASE_URL is None
    assert error(client.post("/api/v1/auth/supabase-token", headers=school["admin"])) == (501, "not_supported")


def test_exchange_rejects_platform_session(client, school, feed_env):
    assert error(client.post("/api/v1/auth/supabase-token", headers=school["root"])) == (403, "forbidden")


def test_exchange_mints_admin_claims(client, school, feed_env, monkeypatch):
    seen = _gotrue(monkeypatch)
    body = data(client.post("/api/v1/auth/supabase-token", headers=school["admin"]))
    assert body["access_token"] == "sb.jwt.token"
    assert body["supabase_user_id"] == "sb-user-1"
    assert seen["create"]["email"] == school["admin_email"]
    assert seen["create"]["app_metadata"] == {
        "tenant_id": school["tenant_id"], "role": "school-admin", "classes": []}


def test_exchange_mints_teacher_class_claims(client, school, feed_env, monkeypatch):
    seen = _gotrue(monkeypatch)
    body = data(client.post("/api/v1/auth/supabase-token", headers=school["teacher"]))
    assert body["access_token"] == "sb.jwt.token"
    assert seen["create"]["app_metadata"] == {
        "tenant_id": school["tenant_id"], "role": "teacher", "classes": ["Grade 10-B"]}


def test_exchange_updates_existing_shadow_user(client, school, feed_env, monkeypatch):
    seen = _gotrue(monkeypatch, existing=[{"id": "sb-user-9", "email": school["admin_email"]}])
    body = data(client.post("/api/v1/auth/supabase-token", headers=school["admin"]))
    assert body["supabase_user_id"] == "sb-user-9"
    assert "create" not in seen
    assert seen["update"]["app_metadata"]["role"] == "school-admin"


def test_exchange_upstream_failure_is_502(client, school, feed_env, monkeypatch):
    _gotrue(monkeypatch, fail="token")
    assert error(client.post("/api/v1/auth/supabase-token", headers=school["admin"])) == (502, "upstream_error")
