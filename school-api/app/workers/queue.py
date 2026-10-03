from __future__ import annotations

"""Redis job queues with process-local fallback for tests/dev.

Two queues separate untrusted-code execution from everything else:

- ``default`` — notifications fan-out and other ordinary background jobs.
- ``elab`` — E-Lab executions, drained only by workers on isolated hosts
  with Docker access (see ``WORKER_QUEUES`` and docs/ARCHITECTURE.md).

``drain()`` with no arguments serves every queue (used by tests and the
single-process dev loop); production workers pass the queues they own.
"""

import json
import logging
import time
import uuid
from collections import deque
from collections.abc import Callable
from typing import Any

from app.core.errors import QueueUnavailable
from app.core.redis_client import get_redis

log = logging.getLogger("schoolos.queue")

QUEUES = {"default": "schoolos:jobs", "elab": "schoolos:jobs:elab"}
QUEUE_KEY = QUEUES["default"]

handlers: dict[str, Callable[[dict], None]] = {}
_memory_queues: dict[str, deque[str]] = {name: deque() for name in QUEUES}


def task(name: str):
    def deco(fn: Callable[[dict], None]):
        handlers[name] = fn
        return fn

    return deco


def enqueue(name: str, payload: dict[str, Any], *, queue: str = "default",
            allow_inline: bool = True, allow_memory: bool = False) -> str:
    """Push a background job onto ``queue``.

    Fallbacks when Redis is unreachable:
    - ``allow_inline``: run the handler immediately in-process (notifications).
    - ``allow_memory``: hold the job in a process-local queue for ``drain()``
      (used by tests and single-process dev; the worker loop drains Redis).
    - otherwise the job is refused with 503 (code execution must never run
      anywhere near the API process, so E-Lab refuses inline execution).
    """
    if queue not in QUEUES:
        raise ValueError(f"Unknown queue: {queue!r}.")
    job = json.dumps({"id": uuid.uuid4().hex, "name": name, "payload": payload, "enqueued_at": time.time()})
    try:
        get_redis().lpush(QUEUES[queue], job)
        return job
    except Exception as e:
        log.warning("redis unavailable: %s", e)
    from app.workers import tasks  # noqa: F401 - ensure handlers are registered
    if allow_inline and name in handlers:
        try:
            handlers[name](payload)
        except Exception:
            log.exception("inline job %s failed", name)
        return job
    if allow_memory:
        _memory_queues[queue].append(job)
        return job
    raise QueueUnavailable()


def drain(limit: int = 100, queues: list[str] | None = None) -> int:
    """Run up to ``limit`` pending jobs inline. ``queues=None`` serves all."""
    from app.workers import tasks  # noqa: F401 - ensure handlers are registered

    names = list(QUEUES) if queues is None else [q for q in queues if q in QUEUES]
    done = 0
    for _ in range(limit):
        raw = _pop(names)
        if raw is None:
            break
        try:
            job = json.loads(raw)
        except Exception:
            log.exception("dropping malformed job")
            continue
        handler = handlers.get(job.get("name", ""))
        if handler is None:
            log.error("no handler for job %s", job.get("name"))
            continue
        try:
            handler(job.get("payload", {}))
            done += 1
        except Exception:
            log.exception("job %s failed", job.get("id"))
    return done


def _pop(names: list[str]) -> str | None:
    for queue in names:
        try:
            item = get_redis().rpop(QUEUES[queue])
            if item is not None:
                return item
        except Exception:
            pass
        try:
            return _memory_queues[queue].popleft()
        except IndexError:
            continue
    return None


def clear_memory_queues() -> None:
    for q in _memory_queues.values():
        q.clear()
