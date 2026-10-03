from __future__ import annotations

import datetime as dt

from app.models.base import utcnow
from tests.helpers import data, error


def test_auth_and_denials_audited(client, school):
    logs = data(client.get("/api/v1/audit-logs?action=login", headers=school["admin"]))["items"]
    assert len(logs) >= 4  # admin + teacher + student + parent logins during provisioning
    entry = logs[0]
    assert entry["tenant_id"] == school["tenant_id"]
    assert entry["actor_id"] is not None and entry["actor_role"] in (
        "school-admin", "teacher", "student", "parent")

    # A denied attempt is audited with actor + code.
    assert error(client.get("/api/v1/users", headers=school["student"])) == (403, "forbidden")
    denied = data(client.get("/api/v1/audit-logs?action=access_denied", headers=school["admin"]))["items"]
    assert denied, "expected an access_denied entry"
    mine = next(e for e in denied if e["extra"].get("path") == "/api/v1/users")
    assert mine["extra"]["code"] == "forbidden"
    assert mine["actor_role"] == "student"


def test_mutations_audited_with_filters(client, school):
    data(client.post("/api/v1/attendance/mark", json={
        "class_id": school["class_id"], "student_id": school["student_id"],
        "date": "2026-09-24", "status": "present"}, headers=school["teacher"]))
    rows = data(client.get("/api/v1/audit-logs?action=attendance_marked&resource_type=attendance",
                           headers=school["admin"]))["items"]
    assert len(rows) == 1
    assert rows[0]["actor_role"] == "teacher"
    assert rows[0]["extra"]["status"] == "present"

    since = (utcnow() - dt.timedelta(minutes=5)).isoformat()
    rows = data(client.get("/api/v1/audit-logs", params={"date_from": since, "size": 100},
                           headers=school["admin"]))["items"]
    assert rows
    future = (utcnow() + dt.timedelta(days=1)).isoformat()
    rows = data(client.get("/api/v1/audit-logs", params={"date_from": future},
                           headers=school["admin"]))["items"]
    assert rows == []
