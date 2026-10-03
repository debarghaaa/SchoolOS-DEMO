from __future__ import annotations

"""The complete school-management workflow, end to end, through the API:

super-admin creates a school → admin staffs it → teacher assigns work →
student submits → teacher grades → student sees the grade → attendance is
marked → the timetable shows → the student runs code in E-Lab → everyone
is notified. One test, twelve steps, zero mocks.
"""

import datetime as dt

from app.models.base import utcnow
from app.workers.queue import drain
from tests.helpers import data, error, provision


def test_school_workflow_end_to_end(client):
    # 1. Super Admin creates the school (provision does this via POST /schools).
    school = provision(client)
    assert school["tenant_id"]

    # 2. School Admin manages users and classes.
    assert data(client.get("/api/v1/students", headers=school["admin"]))["total"] == 1
    assert data(client.get("/api/v1/classes", headers=school["admin"]))["total"] == 1

    # 3. Teacher creates and publishes an assignment.
    due = (utcnow() + dt.timedelta(days=3)).isoformat()
    asg = data(client.post("/api/v1/assignments", json={
        "class_id": school["class_id"], "subject_id": school["subject_id"],
        "title": "Homework 1", "due_at": due}, headers=school["teacher"]))
    data(client.post(f"/api/v1/assignments/{asg['id']}/publish", headers=school["teacher"]))
    assert data(client.get("/api/v1/assignments", headers=school["student"]))["total"] == 1

    # 4. Student submits.
    sub = data(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                           json={"content": "my solutions"}, headers=school["student"]))
    assert sub["is_late"] is False

    # 5. Teacher grades; 6. student sees the grade after publication.
    grade = data(client.post(f"/api/v1/submissions/{sub['id']}/grade",
                             json={"score": 87, "feedback": "Good"}, headers=school["teacher"]))
    assert data(client.get("/api/v1/grades", headers=school["student"]))["total"] == 0
    data(client.post(f"/api/v1/grades/{grade['id']}/publish", headers=school["teacher"]))
    mine = data(client.get("/api/v1/grades", headers=school["student"]))
    assert mine["total"] == 1 and mine["items"][0]["score"] == 87
    assert data(client.get("/api/v1/grades", headers=school["parent"]))["total"] == 1

    # 7. Attendance is recorded and visible to the family.
    r = client.post("/api/v1/attendance/mark", json={
        "class_id": school["class_id"], "student_id": school["student_id"],
        "date": "2026-09-24", "status": "present"}, headers=school["teacher"])
    assert r.status_code == 201, r.text
    assert data(client.get("/api/v1/attendance", headers=school["parent"]))["total"] == 1

    # 8. The timetable is displayed.
    slot = {"class_id": school["class_id"], "subject_id": school["subject_id"],
            "teacher_id": school["teacher_id"], "day_of_week": 0,
            "start_time": "09:00", "end_time": "10:00", "room": "R1"}
    assert client.post("/api/v1/timetable", json=slot, headers=school["admin"]).status_code == 201
    assert data(client.get("/api/v1/timetable", headers=school["student"]))["total"] == 1

    # 9–11. The student runs code: queue → isolated worker → result.
    run = data(client.post("/api/v1/elab/runs", json={
        "language": "python", "source_code": "print('hello lab')", "stdin": ""},
        headers=school["student"]))
    assert run["status"] == "queued"
    assert drain() == 1
    finished = data(client.get(f"/api/v1/elab/runs/{run['execution_id']}",
                               headers=school["student"]))
    assert finished["status"] == "completed"
    assert finished["stdout"] == "hello lab\n"

    # 12. Notifications were generated along the way.
    student_notes = {n["type"] for n in
                     data(client.get("/api/v1/notifications", headers=school["student"]))["items"]}
    assert {"assignment_created", "grade_published"} <= student_notes
    teacher_notes = {n["type"] for n in
                     data(client.get("/api/v1/notifications", headers=school["teacher"]))["items"]}
    assert "submission_received" in teacher_notes

    # Control plane: the new school shows up in platform analytics.
    analytics = data(client.get("/api/v1/platform/analytics", headers=school["root"]))
    assert analytics["tenants_total"] >= 1
    assert analytics["students_total"] >= 1
    assert sum(analytics["elab_runs_24h"].values()) >= 1


def test_platform_analytics_is_super_admin_only(client):
    school = provision(client)
    assert error(client.get("/api/v1/platform/analytics",
                            headers=school["admin"])) == (403, "forbidden")
    assert error(client.get("/api/v1/platform/analytics",
                            headers=school["teacher"])) == (403, "forbidden")
    analytics = data(client.get("/api/v1/platform/analytics", headers=school["root"]))
    assert analytics["memberships_by_role"]["student"] >= 1
