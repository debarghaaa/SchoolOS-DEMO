from __future__ import annotations

import datetime as dt
import time
import uuid

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.elab import ElabRun
from app.workers.elab_backend import SPECS, container_config, get_backend
from app.workers.queue import drain
from app.workers.tasks import purge_expired_sources
from tests.helpers import data, error


def _run(client, headers, source="print('hello')", stdin="", language="python"):
    return client.post("/api/v1/elab/runs", json={
        "language": language, "source_code": source, "stdin": stdin}, headers=headers)


def _db_run(run_id: str) -> ElabRun:
    with SessionLocal() as db:
        run = db.get(ElabRun, uuid.UUID(run_id))
        assert run is not None
        db.expunge(run)
        return run


# ---------------- Container configuration (no daemon needed) ----------------

def test_language_registry_covers_spec_languages():
    assert set(SPECS) == {"python", "javascript", "c", "cpp"}
    images = {s.image for s in SPECS.values()}
    assert len(images) == 3  # c and cpp share the gcc image
    assert all(i.startswith("schoolos/elab-") for i in images)
    assert SPECS["c"].compile_cmd is not None
    assert SPECS["python"].compile_cmd is None


def test_container_config_locks_down_everything():
    cfg = container_config("schoolos/elab-python:1.0", run_id="abc", timeout=5,
                           mem_mb=256, cpu_quota=50000, pids=64)
    assert cfg["network_disabled"] is True
    assert cfg["mem_limit"] == "256m" and cfg["memswap_limit"] == "256m"
    assert (cfg["cpu_period"], cfg["cpu_quota"]) == (100000, 50000)
    assert cfg["pids_limit"] == 64
    assert cfg["read_only"] is True
    assert cfg["tmpfs"]["/work"].split(",")[0] == "rw"
    assert "noexec" in cfg["tmpfs"]["/tmp"]
    assert cfg["user"] == "10000:10000"
    assert cfg["cap_drop"] == ["ALL"]
    assert cfg["security_opt"] == ["no-new-privileges"]
    assert cfg["privileged"] is False
    assert cfg["tty"] is False
    for forbidden in ("volumes", "ports", "devices", "sysctls", "mounts"):
        assert forbidden not in cfg, forbidden


def test_unknown_backend_fails_closed_to_docker(monkeypatch):
    monkeypatch.setattr(settings, "ELAB_BACKEND", "bogus")
    assert get_backend().name == "docker"


def test_local_backend_requires_explicit_insecure_flag(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_ALLOW_INSECURE_LOCAL", False)
    execution_id = data(_run(client, school["student"]))["execution_id"]
    drain()
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "failed"
    assert "refusing host execution" in got["stderr"]
    assert got["stdout"] == ""


def test_docker_backend_fails_closed_without_daemon(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_BACKEND", "docker")
    # If this printed, code executed somewhere it must not.
    execution_id = data(_run(client, school["student"], source="print('PWNED')"))["execution_id"]
    drain()
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "failed"
    assert "backend unavailable" in got["stderr"]
    assert "PWNED" not in got["stdout"]


def test_local_backend_runs_python_only(client, school):
    execution_id = data(_run(client, school["student"], language="javascript",
                             source="console.log('hi')"))["execution_id"]
    drain()
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "failed"
    assert "python only" in got["stderr"]


# ---------------- Output limits ----------------

def test_stdout_and_stderr_are_capped(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_MAX_OUTPUT_KB", 1)
    src = "import sys; sys.stdout.write('o' * 5000); sys.stderr.write('e' * 5000)"
    execution_id = data(_run(client, school["student"], source=src))["execution_id"]
    drain()
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "completed"
    assert len(got["stdout"]) <= 1024 + len("\n[output truncated]")
    assert got["stdout"].endswith("[output truncated]")
    assert got["stderr"].endswith("[output truncated]")


# ---------------- Quotas ----------------

def test_concurrent_execution_limit(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_MAX_CONCURRENT_PER_USER", 2)
    assert _run(client, school["student"]).status_code == 202
    assert _run(client, school["student"]).status_code == 202
    assert error(_run(client, school["student"])) == (429, "rate_limited")
    drain()  # finished runs free the slots
    assert _run(client, school["student"]).status_code == 202


def test_daily_per_user_quota(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_DAILY_RUNS_PER_USER", 2)
    monkeypatch.setattr(settings, "ELAB_MAX_CONCURRENT_PER_USER", 99)
    assert _run(client, school["student"]).status_code == 202
    assert _run(client, school["student"]).status_code == 202
    assert error(_run(client, school["student"])) == (429, "rate_limited")


def test_daily_per_tenant_quota(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_DAILY_RUNS_PER_TENANT", 2)
    monkeypatch.setattr(settings, "ELAB_MAX_CONCURRENT_PER_USER", 99)
    assert _run(client, school["student"]).status_code == 202
    assert _run(client, school["teacher"]).status_code == 202
    assert error(_run(client, school["admin"])) == (429, "rate_limited")


# ---------------- Cancellation ----------------

def test_cancel_queued_run(client, school):
    execution_id = data(_run(client, school["student"]))["execution_id"]
    assert data(client.delete(f"/api/v1/elab/runs/{execution_id}",
                              headers=school["student"]))["status"] == "cancelled"
    drain()  # the worker skips cancelled runs
    assert data(client.get(f"/api/v1/elab/runs/{execution_id}",
                           headers=school["student"]))["status"] == "cancelled"


def test_cancel_completed_run_conflicts(client, school):
    execution_id = data(_run(client, school["student"]))["execution_id"]
    drain()
    assert error(client.delete(f"/api/v1/elab/runs/{execution_id}",
                               headers=school["student"])) == (409, "conflict")


def test_cancel_other_tenant_run_is_not_found(client, school):
    from tests.helpers import provision

    other = provision(client)
    execution_id = data(_run(client, school["student"]))["execution_id"]
    # A teacher from another tenant cannot even see the run to cancel it.
    assert error(client.delete(f"/api/v1/elab/runs/{execution_id}",
                               headers=other["teacher"])) == (404, "not_found")


def test_cancel_flag_before_pickup_flips_on_worker(client, school):
    execution_id = data(_run(client, school["student"],
                             source="import time; time.sleep(30)"))["execution_id"]
    with SessionLocal() as db:
        db.get(ElabRun, uuid.UUID(execution_id)).cancel_requested = True
        db.commit()
    drain()
    assert data(client.get(f"/api/v1/elab/runs/{execution_id}",
                           headers=school["student"]))["status"] == "cancelled"


def test_local_backend_kills_tree_on_cancel_check():
    from app.workers.elab_backend import LocalBackend

    calls = 0

    def check():
        nonlocal calls
        calls += 1
        return calls > 3

    started = time.monotonic()
    result = LocalBackend().run("python", "import time; time.sleep(30)", "",
                                timeout=60, output_cap=65536, cancel_check=check)
    assert result.status == "cancelled"
    assert time.monotonic() - started < 20  # killed, not waited out


def test_running_run_delete_sets_flag(client, school):
    execution_id = data(_run(client, school["student"]))["execution_id"]
    with SessionLocal() as db:
        run = db.get(ElabRun, uuid.UUID(execution_id))
        run.status = "running"
        db.commit()
    got = data(client.delete(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "running"
    assert _db_run(execution_id).cancel_requested is True


# ---------------- Source retention ----------------

def test_source_scrubbed_by_default_after_execution(client, school):
    assert settings.ELAB_RETAIN_SOURCE is False
    execution_id = data(_run(client, school["student"], source="print('secret-sauce')",
                             stdin="secret-in"))["execution_id"]
    drain()
    run = _db_run(execution_id)
    assert run.source_code == "" and run.stdin == ""
    assert len(run.source_hash) == 64  # hash kept for audit/dedup
    assert data(client.get(f"/api/v1/elab/runs/{execution_id}",
                           headers=school["student"]))["stdout"] == "secret-sauce\n"


def test_retained_source_purged_after_retention_window(client, school, monkeypatch):
    monkeypatch.setattr(settings, "ELAB_RETAIN_SOURCE", True)
    execution_id = data(_run(client, school["student"], source="print(1)"))["execution_id"]
    drain()
    assert _db_run(execution_id).source_code == "print(1)"
    with SessionLocal() as db:
        run = db.get(ElabRun, uuid.UUID(execution_id))
        run.completed_at = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=31)
        db.commit()
    assert purge_expired_sources() == 1
    assert _db_run(execution_id).source_code == ""
    assert purge_expired_sources() == 0


# ---------------- Misc API surface ----------------

def test_status_filter_rejects_unknown_status(client, school):
    assert error(client.get("/api/v1/elab/runs?status=bogus",
                            headers=school["student"])) == (422, "validation_error")
    assert data(client.get("/api/v1/elab/runs?status=queued",
                           headers=school["student"]))["total"] == 0


def test_run_read_carries_stage_field(client, school):
    execution_id = data(_run(client, school["student"]))["execution_id"]
    drain()
    got = data(client.get(f"/api/v1/elab/runs/{execution_id}", headers=school["student"]))
    assert got["status"] == "completed"
    assert got["stage"] is None  # interpreted languages have no compile stage
