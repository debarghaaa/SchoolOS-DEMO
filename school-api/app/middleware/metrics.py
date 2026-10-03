from __future__ import annotations

"""Prometheus HTTP metrics (latency + error rate per route).

Labels use the route template (``/api/v1/elab/runs/{execution_id}``), never
raw paths, so cardinality stays bounded. Each container runs a single API
process; Prometheus aggregates across pods (see docs/MONITORING.md).
"""

import time

from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUESTS = Counter(
    "schoolos_http_requests_total", "HTTP requests.",
    ["method", "route", "status"])
LATENCY = Histogram(
    "schoolos_http_request_duration_seconds", "HTTP request latency.",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10))
IN_PROGRESS = Gauge(
    "schoolos_http_requests_in_progress", "In-flight HTTP requests.")


def _route(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    if path != "/" and path.startswith("/api/"):
        return path
    # Non-API / unmatched paths collapse to one bucket.
    return path if path in ("/health", "/ready", "/metrics") else "other"


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        IN_PROGRESS.inc()
        started = time.perf_counter()
        try:
            response = await call_next(request)
            status = str(response.status_code)
        except Exception:
            status = "500"
            raise
        finally:
            IN_PROGRESS.dec()
            elapsed = time.perf_counter() - started
            route = _route(request)
            REQUESTS.labels(request.method, route, status).inc()
            LATENCY.labels(request.method, route).observe(elapsed)
        return response


def metrics_response() -> Response:
    return Response(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)
