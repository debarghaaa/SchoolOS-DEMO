from __future__ import annotations

from tests.helpers import data, error


def test_class_lifecycle(client, school):
    a = school["admin"]
    cls = data(client.post("/api/v1/classes", json={
        "name": "Grade 9-A", "academic_year": "2026-27"}, headers=a))
    assert cls["status"] == "active"
    assert error(client.post("/api/v1/classes", json={
        "name": "Grade 9-A", "academic_year": "2026-27"}, headers=a)) == (409, "duplicate")
    upd = data(client.patch(f"/api/v1/classes/{cls['id']}", json={"section": "A"}, headers=a))
    assert upd["section"] == "A"
    archived = data(client.delete(f"/api/v1/classes/{cls['id']}", headers=a))
    assert archived["status"] == "archived"
    # Still readable (history retained).
    assert data(client.get(f"/api/v1/classes/{cls['id']}", headers=a))["status"] == "archived"


def test_add_students_skips_existing(client, school):
    a = school["admin"]
    out = data(client.post(f"/api/v1/classes/{school['class_id']}/students",
                           json={"student_ids": [school["student_id"]]}, headers=a))
    assert out == {"enrolled": 0, "skipped": 1}
    s2 = data(client.post("/api/v1/students", json={"full_name": "Second", "student_identifier": "S2"}, headers=a))
    out = data(client.post(f"/api/v1/classes/{school['class_id']}/students",
                           json={"student_ids": [school["student_id"], s2["id"]]}, headers=a))
    assert out == {"enrolled": 1, "skipped": 1}


def test_class_subjects(client, school):
    a = school["admin"]
    rows = data(client.get(f"/api/v1/classes/{school['class_id']}/subjects", headers=a))
    assert [r["subject_id"] for r in rows] == [school["subject_id"]]
    s2 = data(client.post("/api/v1/subjects", json={"name": "Math", "code": "M"}, headers=a))
    data(client.post(f"/api/v1/classes/{school['class_id']}/subjects",
                     json={"subject_ids": [s2["id"]]}, headers=a))
    assert client.delete(f"/api/v1/classes/{school['class_id']}/subjects/{s2['id']}", headers=a).status_code == 204
    rows = data(client.get(f"/api/v1/classes/{school['class_id']}/subjects", headers=a))
    assert [r["subject_id"] for r in rows] == [school["subject_id"]]


def test_subject_delete_guarded(client, school):
    a = school["admin"]
    assert error(client.delete(f"/api/v1/subjects/{school['subject_id']}", headers=a)) == (409, "conflict")
    s2 = data(client.post("/api/v1/subjects", json={"name": "Temp", "code": "TMP"}, headers=a))
    assert client.delete(f"/api/v1/subjects/{s2['id']}", headers=a).status_code == 204


def test_enrollments(client, school):
    a = school["admin"]
    rows = data(client.get("/api/v1/enrollments", headers=a))["items"]
    assert len(rows) == 1
    assert error(client.post("/api/v1/enrollments", json={
        "student_id": school["student_id"], "class_id": school["class_id"], "academic_year": "2026-27"},
        headers=a)) == (409, "duplicate")
    eid = rows[0]["id"]
    upd = data(client.patch(f"/api/v1/enrollments/{eid}", json={"status": "withdrawn"}, headers=a))
    assert upd["status"] == "withdrawn"
    assert client.delete(f"/api/v1/enrollments/{eid}", headers=a).status_code == 204


def test_teacher_assignment_and_scope(client, school):
    a, t = school["admin"], school["teacher"]
    mine = data(client.get("/api/v1/classes", headers=t))["items"]
    assert [c["id"] for c in mine] == [school["class_id"]]
    cls2 = data(client.post("/api/v1/classes", json={"name": "Grade 9-A", "academic_year": "2026-27"}, headers=a))
    assert error(client.get(f"/api/v1/classes/{cls2['id']}", headers=t)) == (403, "forbidden")
    assert error(client.post(f"/api/v1/teachers/{school['teacher_id']}/assignments",
                             json={"class_id": school["class_id"]}, headers=a)) == (409, "duplicate")
    row = data(client.post(f"/api/v1/teachers/{school['teacher_id']}/assignments",
                           json={"class_id": cls2["id"]}, headers=a))
    assert data(client.get(f"/api/v1/classes/{cls2['id']}", headers=t))["id"] == cls2["id"]
    assert client.delete(f"/api/v1/teachers/{school['teacher_id']}/assignments/{row['id']}",
                         headers=a).status_code == 204
    assert error(client.get(f"/api/v1/classes/{cls2['id']}", headers=t)) == (403, "forbidden")


def test_parent_links(client, school):
    a = school["admin"]
    assert error(client.post(f"/api/v1/parents/{school['parent_id']}/links",
                             json={"student_id": school["student_id"]}, headers=a)) == (409, "duplicate")
    s2 = data(client.post("/api/v1/students", json={"full_name": "Second", "student_identifier": "S2"}, headers=a))
    link = data(client.post(f"/api/v1/parents/{school['parent_id']}/links",
                            json={"student_id": s2["id"], "relation": "mother"}, headers=a))
    kids = data(client.get(f"/api/v1/parents/{school['parent_id']}/children", headers=school["parent"]))
    assert sorted(k["id"] for k in kids) == sorted([school["student_id"], s2["id"]])
    assert client.delete(f"/api/v1/parents/{school['parent_id']}/links/{link['id']}", headers=a).status_code == 204
    kids = data(client.get(f"/api/v1/parents/{school['parent_id']}/children", headers=school["parent"]))
    assert [k["id"] for k in kids] == [school["student_id"]]


def test_me_endpoints(client, school):
    assert data(client.get("/api/v1/students/me", headers=school["student"]))["id"] == school["student_id"]
    assert data(client.get("/api/v1/teachers/me", headers=school["teacher"]))["id"] == school["teacher_id"]
    assert data(client.get("/api/v1/parents/me", headers=school["parent"]))["id"] == school["parent_id"]


def test_profile_user_role_must_match(client, school):
    a = school["admin"]
    users = data(client.get("/api/v1/users", headers=a))["items"]
    teacher_user = next(u for u in users if u["role"] == "teacher")
    r = client.post("/api/v1/students", json={
        "full_name": "Bad", "student_identifier": "BAD1", "user_id": teacher_user["id"]}, headers=a)
    assert error(r) == (422, "validation_error")
