from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import select

from app.core.db import SessionLocal, set_rls
from app.models.assignments import Assignment
from app.models.base import utcnow
from tests.helpers import data, error


def _due(days=3):
    return (utcnow() + dt.timedelta(days=days)).isoformat()


def _make_assignment(client, school, **kw):
    payload = {"class_id": school["class_id"], "subject_id": school["subject_id"],
               "title": "Homework 1", "due_at": _due()}
    payload.update(kw)
    return data(client.post("/api/v1/assignments", json=payload, headers=school["teacher"]))


def _backdate_due(assignment_id, days_ago=1):
    with SessionLocal() as db:
        set_rls(db, None, bypass=True)
        row = db.scalar(select(Assignment).where(Assignment.id == uuid.UUID(assignment_id)))
        row.due_at = utcnow() - dt.timedelta(days=days_ago)
        db.commit()


def test_assignment_create_validations(client, school):
    a = school["admin"]
    assert error(client.post("/api/v1/assignments", json={
        "class_id": school["class_id"], "subject_id": school["subject_id"],
        "title": "Past", "due_at": "2020-01-01T00:00:00Z"}, headers=school["teacher"])) == (422, "validation_error")
    cls2 = data(client.post("/api/v1/classes", json={"name": "Grade 9-A", "academic_year": "2026-27"}, headers=a))
    assert error(client.post("/api/v1/assignments", json={
        "class_id": cls2["id"], "subject_id": school["subject_id"],
        "title": "x", "due_at": _due()}, headers=school["teacher"])) == (403, "forbidden")
    other_subject = data(client.post("/api/v1/subjects", json={"name": "Art", "code": "ART"}, headers=a))
    assert error(client.post("/api/v1/assignments", json={
        "class_id": school["class_id"], "subject_id": other_subject["id"],
        "title": "x", "due_at": _due()}, headers=school["teacher"])) == (422, "validation_error")
    # Admin must attribute to a teacher.
    assert error(client.post("/api/v1/assignments", json={
        "class_id": school["class_id"], "subject_id": school["subject_id"],
        "title": "x", "due_at": _due()}, headers=a)) == (422, "validation_error")
    made = data(client.post("/api/v1/assignments", json={
        "class_id": school["class_id"], "subject_id": school["subject_id"],
        "teacher_id": school["teacher_id"], "title": "Admin-made", "due_at": _due()}, headers=a))
    assert made["status"] == "draft"


def test_publish_and_visibility(client, school):
    asg = _make_assignment(client, school)
    assert data(client.get("/api/v1/assignments", headers=school["student"]))["total"] == 0
    assert error(client.get(f"/api/v1/assignments/{asg['id']}", headers=school["student"])) == (404, "not_found")
    pub = data(client.post(f"/api/v1/assignments/{asg['id']}/publish", headers=school["teacher"]))
    assert pub["status"] == "published"
    assert data(client.get("/api/v1/assignments", headers=school["student"]))["total"] == 1
    assert data(client.get("/api/v1/assignments", headers=school["parent"]))["total"] == 1
    notes = data(client.get("/api/v1/notifications", headers=school["student"]))["items"]
    assert any(n["type"] == "assignment_created" for n in notes)
    arch = data(client.post(f"/api/v1/assignments/{asg['id']}/archive", headers=school["teacher"]))
    assert arch["status"] == "archived"


def test_submit_resubmit_and_deadline(client, school):
    asg = _make_assignment(client, school)
    assert error(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                             json={"content": "early"}, headers=school["student"])) == (404, "not_found")
    data(client.post(f"/api/v1/assignments/{asg['id']}/publish", headers=school["teacher"]))
    first = data(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                             json={"content": "v1"}, headers=school["student"]))
    assert first["is_late"] is False
    second = data(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                              json={"content": "v2"}, headers=school["student"]))
    assert second["id"] == first["id"]  # resubmission updates in place
    assert second["content"] == "v2"
    notes = data(client.get("/api/v1/notifications", headers=school["teacher"]))["items"]
    assert any(n["type"] == "submission_received" for n in notes)
    # After the deadline, resubmission is rejected server-side.
    _backdate_due(asg["id"])
    assert error(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                             json={"content": "v3"}, headers=school["student"])) == (422, "deadline_passed")


def test_late_first_submission_flagged(client, school):
    asg = _make_assignment(client, school)
    data(client.post(f"/api/v1/assignments/{asg['id']}/publish", headers=school["teacher"]))
    _backdate_due(asg["id"])
    sub = data(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                           json={"content": "late"}, headers=school["student"]))
    assert sub["is_late"] is True


def test_submission_scopes(client, school):
    asg = _make_assignment(client, school)
    data(client.post(f"/api/v1/assignments/{asg['id']}/publish", headers=school["teacher"]))
    sub = data(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                           json={"content": "x"}, headers=school["student"]))
    rows = data(client.get(f"/api/v1/assignments/{asg['id']}/submissions", headers=school["teacher"]))["items"]
    assert [r["id"] for r in rows] == [sub["id"]]
    assert error(client.get(f"/api/v1/assignments/{asg['id']}/submissions",
                            headers=school["student"])) == (403, "forbidden")
    assert data(client.get(f"/api/v1/submissions/{sub['id']}", headers=school["parent"]))["id"] == sub["id"]
    assert data(client.get("/api/v1/submissions/mine", headers=school["student"]))["total"] == 1


def test_grading_and_publish(client, school):
    asg = _make_assignment(client, school)
    data(client.post(f"/api/v1/assignments/{asg['id']}/publish", headers=school["teacher"]))
    sub = data(client.post(f"/api/v1/assignments/{asg['id']}/submissions",
                           json={"content": "x"}, headers=school["student"]))
    assert error(client.post(f"/api/v1/submissions/{sub['id']}/grade",
                             json={"score": 9999}, headers=school["teacher"])) == (422, "validation_error")
    grade = data(client.post(f"/api/v1/submissions/{sub['id']}/grade",
                             json={"score": 87, "feedback": "Good"}, headers=school["teacher"]))
    assert error(client.post(f"/api/v1/submissions/{sub['id']}/grade",
                             json={"score": 90}, headers=school["teacher"])) == (409, "duplicate")
    upd = data(client.patch(f"/api/v1/grades/{grade['id']}", json={"score": 88}, headers=school["teacher"]))
    assert upd["score"] == 88
    # Unpublished: invisible to student and parent.
    assert error(client.get(f"/api/v1/grades/{grade['id']}", headers=school["student"])) == (404, "not_found")
    assert data(client.get("/api/v1/grades", headers=school["student"]))["total"] == 0
    pub = data(client.post(f"/api/v1/grades/{grade['id']}/publish", headers=school["teacher"]))
    assert pub["published_at"] is not None
    assert data(client.get(f"/api/v1/grades/{grade['id']}", headers=school["student"]))["score"] == 88
    assert data(client.get("/api/v1/grades", headers=school["parent"]))["total"] == 1
    notes = data(client.get("/api/v1/notifications", headers=school["student"]))["items"]
    assert any(n["type"] == "grade_published" for n in notes)
    # Grade changes are audited.
    logs = data(client.get("/api/v1/audit-logs?action=grade_published", headers=school["admin"]))["items"]
    assert len(logs) == 1 and logs[0]["resource_id"] == grade["id"]
