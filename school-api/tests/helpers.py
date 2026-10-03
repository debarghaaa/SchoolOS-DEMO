from __future__ import annotations

import re
import uuid

from sqlalchemy import select

from app.core.constants import Role, UserStatus
from app.core.db import SessionLocal, set_rls
from app.integrations import email as email_mod
from app.models.base import utcnow
from app.models.user import Role as RoleRow, User, UserRole
from app.security.password import hash_password

PASSWORD = "Password123"
ROOT_EMAIL = "root@schoolos.io"


def data(resp):
    assert resp.status_code < 400, resp.text
    body = resp.json()
    assert body["success"] is True, body
    assert body["error"] is None, body
    return body["data"]


def error(resp):
    assert resp.status_code >= 400, resp.text
    body = resp.json()
    assert body["success"] is False, body
    assert body["data"] is None, body
    return resp.status_code, body["error"]["code"]


def ensure_root() -> None:
    with SessionLocal() as db:
        set_rls(db, None, bypass=True)
        role = db.scalar(select(RoleRow).where(RoleRow.name == Role.SUPER_ADMIN))
        if role is None:
            role = RoleRow(id=uuid.uuid5(uuid.NAMESPACE_DNS, "schoolos.local/roles/super-admin"),
                           name=Role.SUPER_ADMIN, description="Platform operator.", is_system=True)
            db.add(role)
            db.flush()
        user = db.scalar(select(User).where(User.email == ROOT_EMAIL))
        if user is None:
            user = User(email=ROOT_EMAIL, first_name="Platform", last_name="Root",
                        password_hash=hash_password(PASSWORD), status=UserStatus.ACTIVE,
                        email_verified_at=utcnow())
            db.add(user)
            db.flush()
        if db.scalar(select(UserRole.id).where(
                UserRole.user_id == user.id, UserRole.tenant_id.is_(None))) is None:
            db.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=None))
        db.commit()


def login(client, email: str, password: str = PASSWORD, tenant_id: str | None = None) -> dict:
    """Log in, transparently completing tenant selection when needed."""
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    if body["requires_selection"]:
        assert tenant_id is not None, "account has multiple schools: pass tenant_id"
        r = client.post("/api/v1/auth/select-tenant",
                        json={"select_token": body["select_token"], "tenant_id": tenant_id})
        assert r.status_code == 200, r.text
        body = r.json()["data"]
    token = body["tokens"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def last_token() -> str:
    body = email_mod.outbox[-1].body
    m = re.search(r"Token: (\S+)", body)
    assert m, body
    return m.group(1)


def provision(client, slug: str | None = None) -> dict:
    """Create a tenant with admin/teacher/student/parent, a class, a subject,
    an enrollment, an assignment scope and a guardian link — all via the API."""
    from app.middleware.rate_limit import _memory_buckets
    _memory_buckets.clear()
    ensure_root()
    slug = slug or f"s-{uuid.uuid4().hex[:8]}"
    root = login(client, ROOT_EMAIL)
    admin_email = f"admin-{slug}@example.com"

    tenant = data(client.post("/api/v1/schools", json={
        "name": f"School {slug}", "slug": slug, "admin_email": admin_email, "admin_name": "Admin",
    }, headers=root))

    r = client.post("/api/v1/auth/invites/accept", json={
        "token": last_token(), "first_name": "Admin", "last_name": "User", "password": PASSWORD})
    assert r.status_code == 200, r.text
    admin = login(client, admin_email)

    def mkuser(email, role, name):
        u = data(client.post("/api/v1/users", json={
            "email": email, "first_name": name, "last_name": "User",
            "role": role, "password": PASSWORD}, headers=admin))
        return u["id"], login(client, email)

    teacher_user_id, teacher = mkuser(f"t-{slug}@example.com", "teacher", "Teacher")
    student_user_id, student = mkuser(f"s-{slug}@example.com", "student", "Student")
    parent_user_id, parent = mkuser(f"p-{slug}@example.com", "parent", "Parent")

    teacher_id = data(client.post("/api/v1/teachers", json={
        "full_name": "Teacher", "employee_no": f"E-{slug}", "user_id": teacher_user_id}, headers=admin))["id"]
    student_id = data(client.post("/api/v1/students", json={
        "full_name": "Student", "student_identifier": f"A-{slug}", "user_id": student_user_id}, headers=admin))["id"]
    parent_id = data(client.post("/api/v1/parents", json={
        "full_name": "Parent", "user_id": parent_user_id}, headers=admin))["id"]

    class_id = data(client.post("/api/v1/classes", json={
        "name": "Grade 10-B", "grade_level": "Grade 10", "section": "B", "academic_year": "2026-27"},
        headers=admin))["id"]
    subject_id = data(client.post("/api/v1/subjects", json={
        "name": "Physics", "code": f"PHY-{slug}"}, headers=admin))["id"]

    data(client.post(f"/api/v1/classes/{class_id}/subjects", json={"subject_ids": [subject_id]}, headers=admin))
    data(client.post(f"/api/v1/teachers/{teacher_id}/assignments", json={"class_id": class_id}, headers=admin))
    data(client.post(f"/api/v1/classes/{class_id}/students", json={"student_ids": [student_id]}, headers=admin))
    data(client.post(f"/api/v1/parents/{parent_id}/links", json={"student_id": student_id}, headers=admin))

    return {
        "slug": slug, "tenant_id": tenant["id"], "root": root, "admin": admin,
        "teacher": teacher, "student": student, "parent": parent,
        "teacher_id": teacher_id, "student_id": student_id, "parent_id": parent_id,
        "class_id": class_id, "subject_id": subject_id,
        "admin_email": admin_email,
    }
