from __future__ import annotations

from app.core.config import settings
from tests.helpers import data, error, provision


def _upload(client, headers, content=b"hello-bytes", name="notes.txt", purpose="general"):
    return client.post("/api/v1/files", files={"file": (name, content, "text/plain")},
                       data={"purpose": purpose}, headers=headers)


def test_upload_download_delete(client, school):
    r = _upload(client, school["student"])
    assert r.status_code == 201, r.text
    f = r.json()["data"]
    assert f["size"] == len(b"hello-bytes")
    assert data(client.get(f"/api/v1/files/{f['id']}", headers=school["student"]))["filename"] == "notes.txt"
    assert data(client.get("/api/v1/files", headers=school["student"]))["total"] == 1

    url = data(client.get(f"/api/v1/files/{f['id']}/download-url", headers=school["student"]))["url"]
    dl = client.get(url)  # shared link: no auth header
    assert dl.status_code == 200
    assert dl.content == b"hello-bytes"
    assert "attachment" in dl.headers.get("content-disposition", "")

    assert client.delete(f"/api/v1/files/{f['id']}", headers=school["student"]).status_code == 204
    assert error(client.get(f"/api/v1/files/{f['id']}", headers=school["student"])) == (404, "not_found")


def test_file_isolation_and_teacher_submission_access(client, school):
    other = provision(client)
    f = data(_upload(client, school["student"]))
    assert error(client.get(f"/api/v1/files/{f['id']}", headers=other["admin"])) == (404, "not_found")
    # Teacher cannot read a general file, but can read submission attachments.
    assert error(client.get(f"/api/v1/files/{f['id']}", headers=school["teacher"])) == (403, "forbidden")
    sub = data(_upload(client, school["student"], purpose="submission"))
    assert data(client.get(f"/api/v1/files/{sub['id']}/download-url",
                           headers=school["teacher"]))["url"].startswith("http")


def test_upload_limits_and_presign_local(client, school, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 0)
    assert error(_upload(client, school["student"], content=b"x")) == (413, "payload_too_large")
    monkeypatch.undo()
    assert error(client.post("/api/v1/files/presigned-upload", json={
        "filename": "big.bin", "mime_type": "application/octet-stream", "size": 10},
        headers=school["student"])) == (501, "not_supported")


def test_shared_link_rejects_bad_token(client, school):
    assert error(client.get("/api/v1/files/shared/bogus")) == (401, "invalid_token")


def test_file_access_audited(client, school):
    f = data(_upload(client, school["student"]))
    data(client.get(f"/api/v1/files/{f['id']}/download-url", headers=school["student"]))
    logs = data(client.get("/api/v1/audit-logs?action=file_downloaded", headers=school["admin"]))["items"]
    assert len(logs) == 1 and logs[0]["resource_id"] == f["id"]
