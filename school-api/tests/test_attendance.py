from __future__ import annotations

from tests.helpers import data, error


def _mark(client, school, **kw):
    payload = {"class_id": school["class_id"], "student_id": school["student_id"],
               "date": "2026-09-24", "status": "present"}
    payload.update(kw)
    return client.post("/api/v1/attendance/mark", json=payload, headers=school["teacher"])


def test_mark_and_duplicate_blocked(client, school):
    r = _mark(client, school)
    assert r.status_code == 201, r.text
    assert error(_mark(client, school)) == (409, "duplicate")
    assert error(_mark(client, school, status="sleeping")) == (422, "validation_error")


def test_mark_requires_enrollment_and_assignment(client, school):
    a = school["admin"]
    outsider = data(client.post("/api/v1/students", json={"full_name": "Out", "student_identifier": "OUT"}, headers=a))
    assert error(_mark(client, school, student_id=outsider["id"])) == (422, "validation_error")
    cls2 = data(client.post("/api/v1/classes", json={"name": "Grade 9-A", "academic_year": "2026-27"}, headers=a))
    assert error(_mark(client, school, class_id=cls2["id"])) == (403, "forbidden")


def test_bulk_is_atomic(client, school):
    a = school["admin"]
    s2 = data(client.post("/api/v1/students", json={"full_name": "Second", "student_identifier": "S2"}, headers=a))
    data(client.post(f"/api/v1/classes/{school['class_id']}/students", json={"student_ids": [s2["id"]]}, headers=a))
    r = client.post("/api/v1/attendance/bulk", json={
        "class_id": school["class_id"], "date": "2026-09-24",
        "records": [{"student_id": school["student_id"], "status": "present"},
                    {"student_id": s2["id"], "status": "bogus"}]}, headers=school["teacher"])
    assert error(r) == (422, "validation_error")
    assert data(client.get("/api/v1/attendance", headers=a))["total"] == 0
    r = client.post("/api/v1/attendance/bulk", json={
        "class_id": school["class_id"], "date": "2026-09-24",
        "records": [{"student_id": school["student_id"], "status": "present"},
                    {"student_id": s2["id"], "status": "late"}]}, headers=school["teacher"])
    assert r.status_code == 201
    assert len(r.json()["data"]) == 2


def test_update_and_history_scopes(client, school):
    row = data(_mark(client, school))
    upd = data(client.patch(f"/api/v1/attendance/{row['id']}", json={"status": "late"},
                            headers=school["teacher"]))
    assert upd["status"] == "late"
    # Student sees own history only.
    mine = data(client.get("/api/v1/attendance", headers=school["student"]))
    assert mine["total"] == 1
    # Parent sees linked child's history.
    theirs = data(client.get("/api/v1/attendance", headers=school["parent"]))
    assert theirs["total"] == 1


def test_stats(client, school):
    _mark(client, school, date="2026-09-21")
    _mark(client, school, date="2026-09-22", status="absent")
    _mark(client, school, date="2026-09-23", status="late")
    stats = data(client.get(f"/api/v1/attendance/stats/student/{school['student_id']}",
                            headers=school["admin"]))
    assert stats == {"total": 3, "present": 1, "absent": 1, "late": 1, "excused": 0, "percentage": 66.67}
    cstats = data(client.get(f"/api/v1/attendance/stats/class/{school['class_id']}",
                             headers=school["teacher"]))
    assert cstats["total"] == 3
    # Students cannot pull class-wide stats.
    assert error(client.get(f"/api/v1/attendance/stats/class/{school['class_id']}",
                            headers=school["student"])) == (403, "forbidden")


def test_parent_notified_on_mark(client, school):
    _mark(client, school, status="absent")
    notes = data(client.get("/api/v1/notifications", headers=school["parent"]))["items"]
    assert any(n["type"] == "attendance_update" for n in notes)
