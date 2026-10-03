from __future__ import annotations


from tests.helpers import PASSWORD, data, error


def test_student_is_read_only_for_own_data(client, school):
    s = school["student"]
    assert error(client.post("/api/v1/attendance/mark", json={
        "class_id": school["class_id"], "student_id": school["student_id"],
        "date": "2026-09-24", "status": "present"}, headers=s)) == (403, "forbidden")
    assert error(client.post("/api/v1/assignments", json={
        "class_id": school["class_id"], "subject_id": school["subject_id"],
        "title": "x", "due_at": "2026-10-01T10:00:00Z"}, headers=s)) == (403, "forbidden")
    assert error(client.get("/api/v1/users", headers=s)) == (403, "forbidden")
    assert error(client.get("/api/v1/audit-logs", headers=s)) == (403, "forbidden")
    # Own data works.
    assert data(client.get("/api/v1/students/me", headers=s))["id"] == school["student_id"]
    assert data(client.get("/api/v1/attendance", headers=s))["total"] == 0


def test_teacher_cannot_manage_platform_or_users(client, school):
    t = school["teacher"]
    assert error(client.get("/api/v1/schools", headers=t)) == (403, "forbidden")
    assert error(client.post("/api/v1/users", json={
        "email": "x@example.com", "first_name": "x", "role": "student", "password": PASSWORD}, headers=t)) == (403, "forbidden")
    assert error(client.get("/api/v1/audit-logs", headers=t)) == (403, "forbidden")
    # Positive control: marking attendance in the assigned class works.
    r = client.post("/api/v1/attendance/mark", json={
        "class_id": school["class_id"], "student_id": school["student_id"],
        "date": "2026-09-24", "status": "present"}, headers=t)
    assert r.status_code == 201, r.text


def test_parent_is_linked_children_only(client, school):
    p = school["parent"]
    assert error(client.post("/api/v1/attendance/mark", json={
        "class_id": school["class_id"], "student_id": school["student_id"],
        "date": "2026-09-24", "status": "present"}, headers=p)) == (403, "forbidden")
    assert error(client.post("/api/v1/notifications/announcements", json={"title": "x"}, headers=p)) == (403, "forbidden")
    kids = data(client.get(f"/api/v1/parents/{school['parent_id']}/children", headers=p))
    assert [k["id"] for k in kids] == [school["student_id"]]


def test_school_admin_cannot_touch_platform(client, school):
    a = school["admin"]
    assert error(client.get("/api/v1/schools", headers=a)) == (403, "forbidden")
    assert error(client.post("/api/v1/schools", json={"name": "x", "slug": "x"}, headers=a)) == (403, "forbidden")
    assert error(client.delete(f"/api/v1/schools/{school['tenant_id']}", headers=a)) == (403, "forbidden")
    # But can read its own school.
    assert data(client.get("/api/v1/schools/current", headers=a))["id"] == school["tenant_id"]


def test_super_admin_kept_out_of_tenant_rows(client, school, root_headers):
    assert error(client.get("/api/v1/users", headers=root_headers)) == (403, "forbidden")
    assert error(client.get("/api/v1/students", headers=root_headers)) == (403, "forbidden")
    assert error(client.post("/api/v1/classes", json={
        "name": "x", "academic_year": "2026-27"}, headers=root_headers)) == (403, "forbidden")
    assert error(client.get("/api/v1/schools/current", headers=root_headers)) == (403, "tenant_required")
    # Platform aggregates remain available.
    assert data(client.get("/api/v1/schools", headers=root_headers))["total"] >= 1
    assert data(client.get("/api/v1/audit-logs", headers=root_headers))["total"] >= 1


def test_role_change_forces_relogin(client, school):
    users = data(client.get("/api/v1/users", headers=school["admin"]))["items"]
    teacher = next(u for u in users if u["role"] == "teacher")
    old_headers = school["teacher"]
    assert data(client.get("/api/v1/auth/me", headers=old_headers))["role"] == "teacher"
    r = client.patch(f"/api/v1/users/{teacher['id']}", json={"membership_status": "active"}, headers=school["admin"])
    assert r.status_code == 200
    r = client.post(f"/api/v1/users/{teacher['id']}/role", json={"role": "student"}, headers=school["admin"])
    assert r.status_code == 200
    # Stale token (old role claim + revoked sessions) is rejected.
    code = error(client.get("/api/v1/auth/me", headers=old_headers))
    assert code[0] == 401, code
