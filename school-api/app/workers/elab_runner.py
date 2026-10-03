from __future__ import annotations

"""E-Lab execution orchestration — runs ONLY in a worker process.

State machine: queued -> running -> completed | failed | timeout | cancelled.
Cancellation is cooperative: DELETE sets ``cancel_requested`` and the backend
kills the running container / process tree when it observes the flag.

Source handling: the SHA-256 hash is always kept for audit/dedup; the source
and stdin themselves are scrubbed after execution unless ELAB_RETAIN_SOURCE
is enabled (tenant operators can still purge via ``purge_expired_sources``).

Logging carries execution metadata only — never source code or stdin.
"""

import logging
import uuid

from app.core.config import settings
from app.core.db import service_session, set_rls
from app.models.base import utcnow
from app.models.elab import ElabRun
from app.services.audit import Action, log_event
from app.workers.elab_backend import RunResult, get_backend

log = logging.getLogger("schoolos.elab")

TERMINAL = ("completed", "failed", "timeout", "cancelled")


def _cancel_requested(run_id: uuid.UUID) -> bool:
    with service_session() as db:
        set_rls(db, None, bypass=True)
        run = db.get(ElabRun, run_id)
        return bool(run is not None and run.cancel_requested)


def execute_elab_run(run_id: str) -> None:
    rid = uuid.UUID(run_id)
    with service_session() as db:
        set_rls(db, None, bypass=True)
        run = db.get(ElabRun, rid)
        if run is None or run.status != "queued":
            return
        if run.cancel_requested:
            run.status = "cancelled"
            run.completed_at = utcnow()
            db.commit()
            return
        run.status = "running"
        run.started_at = utcnow()
        language, source, stdin = run.language, run.source_code, run.stdin
        tenant_id, user_id, created_at = run.tenant_id, run.user_id, run.created_at
        db.commit()

    backend = get_backend()
    try:
        result = backend.run(
            language, source, stdin,
            timeout=settings.ELAB_TIMEOUT_SECONDS,
            output_cap=settings.ELAB_MAX_OUTPUT_KB * 1024,
            run_id=str(rid),
            cancel_check=lambda: _cancel_requested(rid),
        )
    except Exception as e:  # never let the worker die on a bad snippet
        log.exception("elab: backend %s crashed on run %s", backend.name, rid)
        result = RunResult(status="failed", stderr=f"[runner error: {e}]")

    with service_session() as db:
        set_rls(db, None, bypass=True)
        run = db.get(ElabRun, rid)
        if run is None:
            return
        # A cancel that landed after execution finished still wins: the user
        # asked for it, and the result is stale either way.
        if run.cancel_requested and result.status in ("completed", "failed", "timeout"):
            result = RunResult(status="cancelled", runtime_ms=result.runtime_ms)
        run.status = result.status
        run.stage = result.stage
        run.stdout = result.stdout
        run.stderr = result.stderr
        run.exit_code = result.exit_code
        run.runtime_ms = result.runtime_ms
        run.container_id = result.container_id
        run.completed_at = utcnow()
        if not settings.ELAB_RETAIN_SOURCE:
            run.source_code = ""
            run.stdin = ""
        log_event(db, actor_id=run.user_id, actor_role=None, tenant_id=run.tenant_id,
                  action=Action.ELAB_EXECUTED, resource_type="elab_run", resource_id=str(run.id),
                  extra={"language": run.language, "status": run.status,
                         "runtime_ms": run.runtime_ms, "backend": backend.name})
        db.commit()

    log.info("elab run finished", extra={"execution_id": str(rid), "tenant_id": str(tenant_id),
                                         "user_id": str(user_id), "language": language,
                                         "status": result.status, "runtime_ms": result.runtime_ms,
                                         "exit_code": result.exit_code,
                                         "created_at": created_at.isoformat()})
