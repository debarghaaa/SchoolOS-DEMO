from __future__ import annotations

from app.workers.queue import drain, enqueue


def test_health_is_unauthenticated_and_versioned(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "ok"
    assert "version" in r.json()["data"]


def test_ready_reports_dependencies(client):
    r = client.get("/ready")
    assert r.status_code == 200  # test database answers
    assert r.json()["data"]["database"] == "up"
    # No Redis in the test env: the API degrades but stays ready.
    assert "redis" in r.json()["data"]


def test_ready_is_503_when_database_is_down(client, monkeypatch):
    class _Broken:
        def connect(self):
            raise ConnectionError("db gone")

    monkeypatch.setattr("app.core.db.engine", _Broken())
    r = client.get("/ready")
    assert r.status_code == 503
    assert r.json()["data"]["database"] == "down"


def test_metrics_exposes_request_counters(client):
    client.get("/health")
    r = client.get("/metrics")
    assert r.status_code == 200
    body = r.text
    assert "schoolos_http_requests_total" in body
    assert 'route="/health"' in body
    assert "schoolos_http_request_duration_seconds" in body


def test_queue_routing_isolates_elab_jobs():
    import uuid

    enqueue("notify", {"tenant_id": str(uuid.uuid4()), "user_ids": [],
                       "type": "x", "title": "t", "body": "b"},
            queue="elab", allow_inline=False, allow_memory=True)
    assert drain(queues=["default"]) == 0  # general workers never see it
    assert drain(queues=["elab"]) == 1
    assert drain() == 0


def test_enqueue_rejects_unknown_queues():
    import pytest

    with pytest.raises(ValueError, match="Unknown queue"):
        enqueue("notify", {}, queue="bogus", allow_memory=True)
