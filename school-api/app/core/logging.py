from __future__ import annotations

"""Logging setup: human-readable text in dev, JSON lines in production.

Every record carries ``request_id`` (from ``RequestIdMiddleware``) so API
logs correlate with the ``X-Request-ID`` response header. Workers have no
request scope and log ``request_id: "-"``.

Secrets must never be logged: no passwords, tokens, connection URLs, source
code or stdin — see docs/LOGGING.md.
"""

import json
import logging
import sys
from datetime import datetime, timezone


class _ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            from app.middleware.request_id import request_id_ctx
            record.request_id = request_id_ctx.get()
        except Exception:
            record.request_id = "-"
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            payload["exc"] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(payload)


def setup_logging(level: str = "INFO", format: str = "text") -> None:
    """Configure the root logger once (idempotent)."""
    root = logging.getLogger()
    if getattr(root, "_schoolos_configured", False):
        return
    handler = logging.StreamHandler(sys.stdout)
    if format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(name)s %(levelname)s [%(request_id)s] %(message)s"))
    handler.addFilter(_ContextFilter())
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root._schoolos_configured = True  # type: ignore[attr-defined]
