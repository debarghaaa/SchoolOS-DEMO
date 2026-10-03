from __future__ import annotations

from tests.helpers import data, error


def _slot(client, school, **kw):
    payload = {"class_id": school["class_id"], "subject_id": school["subject_id"],
               "teacher_id": school["teacher_id"], "day_of_week": 0,
               "start_time": "09:00", "end_time": "10:00", "room": "R1"}
    payload.update(kw)
    return client.post("/api/v1/timetable", json=payload, headers=school["admin"])


def test_conflicts_blocked(client, school):
    a = school["admin"]
    assert _slot(client, school).status_code == 201
    # Same class overlap.
    assert error(_slot(client, school, start_time="09:30", end_time="10:30")) == (409, "schedule_conflict")
    # Same teacher, other class, overlap.
    cls2 = data(client.post("/api/v1/classes", json={"name": "Grade 9-A", "academic_year": "2026-27"}, headers=a))
    r = _slot(client, school, class_id=cls2["id"], start_time="09:30", end_time="10:30", room="R2")
    assert error(r) == (409, "schedule_conflict")
    # Same room, other class+teacher, overlap.
    t2u = data(client.post("/api/v1/users", json={
        "email": "t2@example.com", "first_name": "T2", "role": "teacher", "password": "Password123"}, headers=a))
    t2 = data(client.post("/api/v1/teachers", json={
        "full_name": "T2", "employee_no": "E2", "user_id": t2u["id"]}, headers=a))
    r = _slot(client, school, class_id=cls2["id"], teacher_id=t2["id"],
              start_time="09:30", end_time="10:30", room="R1")
    assert error(r) == (409, "schedule_conflict")
    # Back-to-back is fine.
    assert _slot(client, school, start_time="10:00", end_time="11:00").status_code == 201
    # End before start rejected.
    assert error(_slot(client, school, start_time="12:00", end_time="11:00")) == (422, "validation_error")


def test_update_conflict_and_delete(client, school):
    s1 = data(_slot(client, school))
    s2 = data(_slot(client, school, start_time="11:00", end_time="12:00", room="R2"))
    assert error(client.patch(f"/api/v1/timetable/{s2['id']}", json={
        "start_time": "09:30", "end_time": "10:30"}, headers=school["admin"])) == (409, "schedule_conflict")
    assert client.delete(f"/api/v1/timetable/{s1['id']}", headers=school["admin"]).status_code == 204


def test_timetable_views_are_scoped(client, school):
    data(_slot(client, school))
    assert data(client.get("/api/v1/timetable", headers=school["teacher"]))["total"] == 1
    assert data(client.get("/api/v1/timetable", headers=school["student"]))["total"] == 1
    assert data(client.get("/api/v1/timetable", headers=school["parent"]))["total"] == 1
    assert data(client.get("/api/v1/timetable?day=0", headers=school["admin"]))["total"] == 1
    assert data(client.get("/api/v1/timetable?day=1", headers=school["admin"]))["total"] == 0
    # Teacher cannot pull another teacher's timetable.
    other = "00000000-0000-0000-0000-000000000000"
    assert error(client.get(f"/api/v1/timetable?teacher_id={other}",
                            headers=school["teacher"])) == (403, "forbidden")
