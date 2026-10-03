from __future__ import annotations

from app.core.config import settings
from app.workers.queue import drain
from tests.helpers import data, error, provision


def _run(client, headers, source="print('hello')", stdin="", language="python"):
    return client.post("/api/v1/elab/runs", json={
        "language": language, "source_code": source, "stdin": stdin}, headers=headers)


def test_async_execution_flow(client, school):
    r = _run(client, school["student"])
    assert r.status_code == 202, r.text
    execution_id = r.json()["data"]["execution_id"]
    # Still queued: nothing runs inside the API process.
    assert data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))["status"] == "queued"
    assert drain() == 1  # the worker picks it up
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "completed"
    assert got["stdout"] == "hello\n"
    assert got["exit_code"] == 0
    assert got["runtime_ms"] is not None and got["runtime_ms"] >= 0
    logs = data(client.get("/api/v1/audit-logs?action=elab_executed", headers=school["admin"]))["items"]
    assert len(logs) == 1 and logs[0]["resource_id"] == execution_id


def test_stdin_and_failure(client, school):
    r = _run(client, school["student"], source="import sys; print(sys.stdin.read().strip() + '!')", stdin="hi")
    execution_id = r.json()["data"]["execution_id"]
    drain()
    assert data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))["stdout"] == "hi!\n"

    r = _run(client, school["student"], source="raise ValueError('boom')")
    execution_id = r.json()["data"]["execution_id"]
    drain()
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "failed"
    assert "boom" in got["stderr"]


def test_timeout(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_TIMEOUT_SECONDS", 1)
    r = _run(client, school["student"], source="import time; time.sleep(30)")
    execution_id = r.json()["data"]["execution_id"]
    drain()
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "timeout"


def test_language_allowlist_and_roles(client, school):
    assert error(_run(client, school["student"], language="ruby")) == (422, "validation_error")
    assert error(_run(client, school["parent"])) == (403, "forbidden")


def test_run_visibility_scopes(client, school):
    other = provision(client)
    r = _run(client, school["student"])
    execution_id = r.json()["data"]["execution_id"]
    drain()
    # Assigned teacher sees the student's run; another tenant sees nothing.
    assert data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["teacher"]))["status"] == "completed"
    assert error(client.get(f"/api/v1/elab/runs/{execution_id}", headers=other["teacher"])) == (404, "not_found")
    assert data(client.get("/api/v1/elab/runs", headers=school["teacher"]))["total"] == 1
    assert data(client.get("/api/v1/elab/runs", headers=other["teacher"]))["total"] == 0
