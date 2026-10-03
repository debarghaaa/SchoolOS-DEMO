from __future__ import annotations

"""MANDATORY: cross-tenant access must fail closed.

Cross-tenant row access reads as 404 (existence is not leaked); same-tenant
but out-of-scope access reads as 403. Lists never mix tenants.
"""

import datetime as dt

import jwt

from app.core.config import settings
from app.models.base import utcnow
from tests.helpers import data, error, provision


def test_cross_tenant_rows_are_invisible(client):
    a = provision(client)
    b = provision(client)
    # Admin of A probing B's rows: 404, never 403 (which would confirm existence).
    assert error(client.get(f"/api/v1/students/{b['student_id']}", headers=a["admin"])) == (404, "not_found")
    assert error(client.get(f"/api/v1/classes/{b['class_id']}", headers=a["admin"])) == (404, "not_found")
    assert error(client.get(f"/api/v1/teachers/{b['teacher_id']}", headers=a["admin"])) == (404, "not_found")
    users = data(client.get("/api/v1/users", headers=b["admin"]))["items"]
    other_teacher = next(u for u in users if u["role"] == "teacher")
    assert error(client.get(f"/api/v1/users/{other_teacher['id']}", headers=a["admin"])) == (404, "not_found")


def test_cross_tenant_writes_fail_closed(client):
    a = provision(client)
    b = provision(client)
    # Enroll B's student into A's class.
    assert error(client.post(f"/api/v1/classes/{a['class_id']}/students",
                             json={"student_ids": [b["student_id"]]}, headers=a["admin"])) == (404, "not_found")
    # Mark attendance for B's student.
    assert error(client.post("/api/v1/attendance/mark", json={
        "class_id": a["class_id"], "student_id": b["student_id"],
        "date": "2026-09-24", "status": "present"}, headers=a["admin"])) == (404, "not_found")
    # Assign B's teacher to A's class.
    assert error(client.post(f"/api/v1/teachers/{b['teacher_id']}/assignments",
                             json={"class_id": a["class_id"]}, headers=a["admin"])) == (404, "not_found")


def test_lists_never_mix_tenants(client):
    a = provision(client)
    b = provision(client)
    for path, key in (("/api/v1/students", "id"), ("/api/v1/classes", "id"), ("/api/v1/users", "email")):
        got = {r[key] for r in data(client.get(path, headers=a["admin"]))["items"]}
        other = {r[key] for r in data(client.get(path, headers=b["admin"]))["items"]}
        assert got and other and not (got & other), path


def test_teacher_and_student_scopes_are_tenant_bound(client):
    a = provision(client)
    b = provision(client)
    due = (utcnow() + dt.timedelta(days=3)).isoformat()
    asg_b = data(client.post("/api/v1/assignments", json={
        "class_id": b["class_id"], "subject_id": b["subject_id"],
        "title": "B homework", "due_at": due}, headers=b["teacher"]))
    assert error(client.get(f"/api/v1/assignments/{asg_b['id']}", headers=a["teacher"])) == (404, "not_found")
    mine = data(client.get("/api/v1/assignments", headers=a["teacher"]))["items"]
    assert all(x["tenant_id"] == a["tenant_id"] for x in mine)
    assert error(client.get(f"/api/v1/students/{b['student_id']}", headers=a["student"])) == (404, "not_found")


def test_parent_link_cannot_be_forged(client):
    a = provision(client)
    b = provision(client)
    kids = data(client.get(f"/api/v1/parents/{a['parent_id']}/children", headers=a["parent"]))
    assert [k["id"] for k in kids] == [a["student_id"]]
    # Crafted child id for an unlinked student: cross-tenant -> 404.
    assert error(client.get(f"/api/v1/students/{b['student_id']}", headers=a["parent"])) == (404, "not_found")
    # Same-tenant but unlinked student -> 403.
    s2 = data(client.post("/api/v1/students", json={
        "full_name": "Other", "student_identifier": "OTHER-1"}, headers=a["admin"]))
    assert error(client.get(f"/api/v1/students/{s2['id']}", headers=a["parent"])) == (403, "forbidden")


def test_audit_tenant_filter_cannot_be_bypassed(client):
    a = provision(client)
    b = provision(client)
    # Tenant filter is ignored for school-admins: only own tenant's rows.
    rows = data(client.get(f"/api/v1/audit-logs?tenant_id={b['tenant_id']}", headers=a["admin"]))["items"]
    assert rows and all(r["tenant_id"] == a["tenant_id"] for r in rows)
    # Super-admin sees both tenants.
    rows = data(client.get("/api/v1/audit-logs?size=100", headers=a["root"]))["items"]
    tenants = {r["tenant_id"] for r in rows if r["tenant_id"]}
    assert a["tenant_id"] in tenants and b["tenant_id"] in tenants


def test_forged_tenant_claim_rejected(client):
    a = provision(client)
    b = provision(client)
    me = data(client.get("/api/v1/auth/me", headers=a["admin"]))
    forged = jwt.encode({
        "sub": me["id"], "role": "school-admin", "tenant_id": b["tenant_id"],
        "type": "access", "jti": "x" * 32,
        "iat": int(utcnow().timestamp()), "exp": int((utcnow() + dt.timedelta(minutes=15)).timestamp()),
    }, settings.SECRET_KEY, algorithm="HS256")
    assert error(client.get("/api/v1/users", headers={"Authorization": f"Bearer {forged}"})) == (403, "tenant_mismatch")
