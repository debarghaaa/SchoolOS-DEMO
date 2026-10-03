from __future__ import annotations

import datetime as dt

from app.models.base import utcnow
from app.workers.tasks import scan_due_soon
from tests.helpers import data, error


def test_read_flow(client, school):
    data(client.post("/api/v1/notifications/announcements",
                     json={"title": "Hello", "body": "World", "audience": "students"},
                     headers=school["admin"]))
    box = data(client.get("/api/v1/notifications", headers=school["student"]))
    assert box["total"] == 1 and box["unread"] == 1
    assert data(client.get("/api/v1/notifications/unread-count", headers=school["student"])) == {"unread": 1}
    nid = box["items"][0]["id"]
    assert data(client.patch(f"/api/v1/notifications/{nid}/read", headers=school["student"]))["read_at"] is not None
    assert data(client.get("/api/v1/notifications?unread_only=true", headers=school["student"]))["total"] == 0
    assert data(client.post("/api/v1/notifications/read-all", headers=school["student"])) == {"marked": 0}
    # Audience respected: teachers got nothing.
    assert data(client.get("/api/v1/notifications", headers=school["teacher"]))["total"] == 0


def test_announce_requires_permission(client, school):
    assert error(client.post("/api/v1/notifications/announcements",
                             json={"title": "x"}, headers=school["teacher"])) == (403, "forbidden")
    assert error(client.post("/api/v1/notifications/announcements",
                             json={"title": "x", "audience": "everyone"},
                             headers=school["admin"])) == (422, "validation_error")
    out = data(client.post("/api/v1/notifications/announcements",
                           json={"title": "All", "audience": "all"}, headers=school["admin"]))
    assert out["recipients"] >= 4


def test_due_soon_scan(client, school):
    due = (utcnow() + dt.timedelta(hours=12)).isoformat()
    asg = data(client.post("/api/v1/assignments", json={
        "class_id": school["class_id"], "subject_id": school["subject_id"],
        "title": "Soon", "due_at": due}, headers=school["teacher"]))
    data(client.post(f"/api/v1/assignments/{asg['id']}/publish", headers=school["teacher"]))
    assert scan_due_soon() >= 1
    notes = data(client.get("/api/v1/notifications", headers=school["student"]))["items"]
    assert any(n["type"] == "assignment_due_soon" for n in notes)
    before = len(notes)
    assert scan_due_soon() == 0  # not re-sent
    notes = data(client.get("/api/v1/notifications", headers=school["student"]))["items"]
    assert len(notes) == before
