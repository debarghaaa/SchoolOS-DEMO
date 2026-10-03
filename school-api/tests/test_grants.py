from __future__ import annotations

"""Extra role grants union with the primary role for permissions, while
object scope still follows the linked profiles."""

from tests.helpers import data, error


def test_grant_unions_permissions_and_revokes_cleanly(client, school):
    a = school["admin"]
    users = data(client.get("/api/v1/users", headers=a))["items"]
    teacher = next(u for u in users if u["role"] == "teacher")

    # No grants yet; a teacher cannot read linked-children endpoints.
    assert data(client.get(f"/api/v1/users/{teacher['id']}/grants", headers=a)) == {"grants": []}
    assert error(client.get(f"/api/v1/parents/{school['parent_id']}/children",
                            headers=school["teacher"])) == (403, "forbidden")

    # Grant the teacher a parent role and link a parent profile to the login.
    out = data(client.post(f"/api/v1/users/{teacher['id']}/grants", json={"role": "parent"}, headers=a))
    assert out == {"grants": ["parent"]}
    assert error(client.post(f"/api/v1/users/{teacher['id']}/grants", json={"role": "parent"},
                             headers=a)) == (409, "duplicate")
    assert error(client.post(f"/api/v1/users/{teacher['id']}/grants", json={"role": "super-admin"},
                             headers=a)) == (422, "validation_error")

    tparent = data(client.post("/api/v1/parents", json={
        "full_name": "Teacher As Parent", "user_id": teacher["id"]}, headers=a))
    data(client.post(f"/api/v1/parents/{tparent['id']}/links",
                     json={"student_id": school["student_id"]}, headers=a))

    # Union in action: teacher session reads own linked child.
    kids = data(client.get(f"/api/v1/parents/{tparent['id']}/children", headers=school["teacher"]))
    assert [k["id"] for k in kids] == [school["student_id"]]

    # Revoke: permission disappears immediately (checked live per request).
    out = data(client.delete(f"/api/v1/users/{teacher['id']}/grants/parent", headers=a))
    assert out == {"grants": []}
    assert error(client.get(f"/api/v1/parents/{tparent['id']}/children",
                            headers=school["teacher"])) == (403, "forbidden")


def test_grant_self_service_forbidden(client, school):
    a = school["admin"]
    me = data(client.get("/api/v1/auth/me", headers=a))
    assert error(client.post(f"/api/v1/users/{me['id']}/grants", json={"role": "teacher"},
                             headers=a)) == (403, "forbidden")
