from __future__ import annotations


from tests.helpers import data, error


def test_school_crud_lifecycle(client, root_headers):
    created = data(client.post("/api/v1/schools", json={
        "name": "Demo School", "slug": "demo-school", "trial_days": 7,
        "feature_flags": {"elab": True}}, headers=root_headers))
    assert created["status"] == "trial"
    assert created["trial_ends_at"] is not None
    assert created["feature_flags"] == {"elab": True}
    sid = created["id"]

    assert error(client.post("/api/v1/schools", json={"name": "x", "slug": "demo-school"},
                             headers=root_headers)) == (409, "duplicate")

    assert data(client.get(f"/api/v1/schools/{sid}", headers=root_headers))["slug"] == "demo-school"
    assert data(client.get("/api/v1/schools", headers=root_headers))["total"] >= 1

    updated = data(client.patch(f"/api/v1/schools/{sid}", json={
        "status": "active", "subscription_tier": "pro",
        "subscription_meta": {"seats": 500}}, headers=root_headers))
    assert updated["status"] == "active"
    assert updated["subscription_tier"] == "pro"
    assert error(client.patch(f"/api/v1/schools/{sid}", json={"status": "bogus"},
                              headers=root_headers)) == (422, "validation_error")

    assert client.delete(f"/api/v1/schools/{sid}", headers=root_headers).status_code == 204
    assert error(client.get(f"/api/v1/schools/{sid}", headers=root_headers)) == (404, "not_found")


def test_school_delete_blocked_with_users(client, school, root_headers):
    r = client.delete(f"/api/v1/schools/{school['tenant_id']}", headers=root_headers)
    assert error(r) == (409, "conflict")


def test_current_school(client, school):
    me = data(client.get("/api/v1/schools/current", headers=school["teacher"]))
    assert me["id"] == school["tenant_id"]
    assert me["slug"] == school["slug"]
