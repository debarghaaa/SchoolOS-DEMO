from __future__ import annotations

"""Background worker entrypoint::

    python -m app.workers.worker

Drains the Redis job queues and runs periodic jobs. ``WORKER_QUEUES``
selects which queues this process serves: general workers run ``default``
(notifications, periodic scans); E-Lab workers run ``elab`` on isolated
hosts with Docker access. Always a separate process/container from the API.
"""

import logging
import signal
import time

from app.core.config import settings
from app.core.logging import setup_logging
from app.workers import tasks  # noqa: F401 - register handlers
from app.workers.queue import drain

log = logging.getLogger("schoolos.worker")

_stop = False


def _handle_signal(signum, frame):
    global _stop
    _stop = True


def main() -> None:
    setup_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    queues = [q.strip() for q in settings.WORKER_QUEUES.split(",") if q.strip()]
    periodic = "default" in queues  # exactly one worker type runs the scans
    log.info("worker started (queues=%s, periodic=%s)", ",".join(queues), periodic)
    last_scan = 0.0
    last_purge = 0.0
    while not _stop:
        done = 0
        try:
            done = drain(50, queues)
        except Exception:
            log.exception("drain failed")
        now = time.monotonic()
        if periodic and now - last_scan >= 60:
            try:
                created = tasks.scan_due_soon()
                if created:
                    log.info("due-soon scan created %d notifications", created)
            except Exception:
                log.exception("due-soon scan failed")
            last_scan = now
        if periodic and now - last_purge >= 3600:
            try:
                purged = tasks.purge_expired_sources()
                if purged:
                    log.info("source purge scrubbed %d runs", purged)
            except Exception:
                log.exception("source purge failed")
            last_purge = now
        time.sleep(0.5 if done else 2)
    log.info("worker stopped")


if __name__ == "__main__":
    main()
