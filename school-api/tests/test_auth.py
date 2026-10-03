from __future__ import annotations

from tests.helpers import PASSWORD, data, error, last_token, login, provision


def test_login_and_me(client, school):
    body = data(client.post("/api/v1/auth/login", json={
        "email": school["admin_email"], "password": PASSWORD}))
    assert body["tokens"]["token_type"] == "bearer"
    assert body["requires_selection"] is False
    me = data(client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['tokens']['access_token']}"}))
    assert me["email"] == school["admin_email"]
    assert me["role"] == "school-admin"
    assert me["tenant_id"] == school["tenant_id"]


def test_login_rejects_bad_credentials(client, school):
    assert error(client.post("/api/v1/auth/login",
                             json={"email": school["admin_email"], "password": "Wrongpass1"})) == (401, "unauthorized")
    assert error(client.post("/api/v1/auth/login",
                             json={"email": "nobody@example.com", "password": PASSWORD})) == (401, "unauthorized")


def test_multi_membership_select_flow(client):
    a = provision(client)
    b = provision(client)
    # One global account joins a second school (existing-user path).
    users = data(client.get("/api/v1/users", headers=a["admin"]))["items"]
    teacher = next(u for u in users if u["role"] == "teacher")
    r = client.post("/api/v1/users", json={
        "email": teacher["email"], "first_name": "Teacher", "role": "teacher", "password": PASSWORD},
        headers=b["admin"])
    assert r.status_code == 201, r.text

    body = data(client.post("/api/v1/auth/login", json={"email": teacher["email"], "password": PASSWORD}))
    assert body["requires_selection"] is True
    assert body["tokens"] is None
    assert {m["tenant_id"] for m in body["memberships"]} == {a["tenant_id"], b["tenant_id"]}
    select_token = body["select_token"]

    # Unknown school -> 403, and the select token survives the failed attempt.
    assert error(client.post("/api/v1/auth/select-tenant", json={
        "select_token": select_token, "tenant_id": "00000000-0000-0000-0000-000000000000"})) == (403, "forbidden")

    picked = data(client.post("/api/v1/auth/select-tenant", json={
        "select_token": select_token, "tenant_id": b["tenant_id"]}))
    h = {"Authorization": f"Bearer {picked['tokens']['access_token']}"}
    assert data(client.get("/api/v1/auth/me", headers=h))["tenant_id"] == b["tenant_id"]

    # Select tokens are single-use.
    assert error(client.post("/api/v1/auth/select-tenant", json={
        "select_token": select_token, "tenant_id": a["tenant_id"]})) == (401, "invalid_token")

    # Helper transparently selects too.
    h2 = login(client, teacher["email"], tenant_id=a["tenant_id"])
    assert data(client.get("/api/v1/auth/me", headers=h2))["tenant_id"] == a["tenant_id"]


def test_platform_selection_for_dual_user(client, school):
    # Root joins a school yet keeps platform access via selection.
    r = client.post("/api/v1/users", json={
        "email": "root@schoolos.io", "first_name": "Platform", "role": "school-admin",
        "password": PASSWORD}, headers=school["admin"])
    assert r.status_code == 201, r.text
    body = data(client.post("/api/v1/auth/login", json={"email": "root@schoolos.io", "password": PASSWORD}))
    assert body["requires_selection"] is True
    assert body["can_access_platform"] is True
    picked = data(client.post("/api/v1/auth/select-tenant", json={"select_token": body["select_token"]}))
    me = data(client.get("/api/v1/auth/me",
                         headers={"Authorization": f"Bearer {picked['tokens']['access_token']}"}))
    assert me["role"] == "super-admin" and me["tenant_id"] is None


def test_refresh_rotates(client, school):
    r = client.post("/api/v1/auth/login", json={"email": school["admin_email"], "password": PASSWORD})
    refresh = r.json()["data"]["tokens"]["refresh_token"]
    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 200
    # Old refresh token is dead (rotation).
    assert error(client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})) == (401, "invalid_token")
    assert error(client.post("/api/v1/auth/refresh", json={"refresh_token": "bogus"})) == (401, "invalid_token")


def test_refresh_revalidates_membership(client, school):
    users = data(client.get("/api/v1/users", headers=school["admin"]))["items"]
    teacher = next(u for u in users if u["role"] == "teacher")
    r = client.post("/api/v1/auth/login", json={"email": teacher["email"], "password": PASSWORD})
    refresh = r.json()["data"]["tokens"]["refresh_token"]
    # Disable the membership: refresh must fail closed.
    patched = data(client.patch(f"/api/v1/users/{teacher['id']}", json={"membership_status": "disabled"},
                                headers=school["admin"]))
    assert patched["membership_status"] == "disabled"
    assert error(client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})) == (401, "invalid_token")
    # Re-enable and the account works again.
    data(client.patch(f"/api/v1/users/{teacher['id']}", json={"membership_status": "active"},
                      headers=school["admin"]))
    login(client, teacher["email"])


def test_logout_revokes(client, school):
    r = client.post("/api/v1/auth/login", json={"email": school["admin_email"], "password": PASSWORD})
    tokens = r.json()["data"]["tokens"]
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert data(client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}, headers=h))["sessions_revoked"] == 1
    assert error(client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})) == (401, "invalid_token")


def test_sessions_list_and_revoke(client, school):
    h = school["admin"]
    sessions = data(client.get("/api/v1/auth/sessions", headers=h))
    assert len(sessions) >= 1
    assert any(s["current"] for s in sessions)
    victim = next((s for s in sessions if not s["current"]), None)
    if victim is None:
        # Open a second session, then revoke it.
        r = client.post("/api/v1/auth/login", json={"email": school["admin_email"], "password": PASSWORD})
        assert r.status_code == 200
        sessions = data(client.get("/api/v1/auth/sessions", headers=h))
        victim = next(s for s in sessions if not s["current"])
    assert client.delete(f"/api/v1/auth/sessions/{victim['id']}", headers=h).status_code == 204


def test_change_password(client, school):
    h = school["admin"]
    r = client.post("/api/v1/auth/password", json={"current_password": "Wrongpass1", "new_password": "Newpass123"}, headers=h)
    assert error(r) == (401, "unauthorized")
    assert data(client.post("/api/v1/auth/password",
                            json={"current_password": PASSWORD, "new_password": "Newpass123"}, headers=h))["changed"] is True
    assert error(client.post("/api/v1/auth/login", json={
        "email": school["admin_email"], "password": PASSWORD})) == (401, "unauthorized")
    login(client, school["admin_email"], "Newpass123")


def test_password_reset_flow(client, school):
    # Unknown email still returns success (no enumeration).
    assert data(client.post("/api/v1/auth/password-reset/request",
                            json={"email": "ghost@example.com"}))["sent"] is True
    assert data(client.post("/api/v1/auth/password-reset/request", json={
        "email": school["admin_email"]}))["sent"] is True
    token = last_token()
    assert error(client.post("/api/v1/auth/password-reset/confirm",
                             json={"token": "bogus", "new_password": "Newpass123"})) == (401, "invalid_token")
    assert data(client.post("/api/v1/auth/password-reset/confirm",
                            json={"token": token, "new_password": "Newpass123"}))["reset"] is True
    # Single use.
    assert error(client.post("/api/v1/auth/password-reset/confirm",
                             json={"token": token, "new_password": "Otherpass1"})) == (401, "invalid_token")
    login(client, school["admin_email"], "Newpass123")


def test_email_verification_flow(client, school):
    assert data(client.post("/api/v1/auth/verify-email/request", json={
        "email": school["admin_email"]}))["sent"] is True
    # Admin was verified at invite-accept; request is a silent no-op but the
    # endpoint still succeeds. Exercise confirm with a fresh unverified user.
    r = client.post("/api/v1/users", json={
        "email": f"nv-{school['slug']}@example.com", "first_name": "NV", "role": "teacher", "password": PASSWORD},
        headers=school["admin"])
    assert r.status_code == 201
    assert data(client.post("/api/v1/auth/verify-email/request", json={
        "email": f"nv-{school['slug']}@example.com"}))["sent"] is True
    out = data(client.post("/api/v1/auth/verify-email/confirm", json={"token": last_token()}))
    assert out["verified"] is True


def test_invite_accept_single_use(client, school):
    r = client.post("/api/v1/users/invites", json={
        "email": f"once-{school['slug']}@example.com", "first_name": "Once", "role": "teacher"},
        headers=school["admin"])
    assert r.status_code == 201
    token = last_token()
    assert client.post("/api/v1/auth/invites/accept", json={
        "token": token, "first_name": "Once", "password": PASSWORD}).status_code == 200
    assert error(client.post("/api/v1/auth/invites/accept", json={
        "token": token, "first_name": "Once", "password": PASSWORD})) == (401, "invalid_token")


def test_disabled_membership_cannot_login(client, school):
    users = data(client.get("/api/v1/users", headers=school["admin"]))["items"]
    teacher = next(u for u in users if u["role"] == "teacher")
    r = client.patch(f"/api/v1/users/{teacher['id']}", json={"membership_status": "disabled"},
                     headers=school["admin"])
    assert r.status_code == 200
    assert error(client.post("/api/v1/auth/login", json={
        "email": teacher["email"], "password": PASSWORD})) == (401, "unauthorized")


def test_unauthenticated_rejected(client, school):
    assert error(client.get("/api/v1/auth/me")) == (401, "unauthorized")
    assert error(client.get("/api/v1/students")) == (401, "unauthorized")
    assert error(client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bogus"})) == (401, "invalid_token")


def test_login_rate_limited(client, school):
    for _ in range(11):
        r = client.post("/api/v1/auth/login", json={"email": school["admin_email"], "password": "Wrongpass1"})
    assert error(r) == (429, "rate_limited")
