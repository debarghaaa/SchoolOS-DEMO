# Monitoring Strategy

Prometheus scrapes, Grafana visualizes, Alertmanager pages. Every dashboard
and alert below maps to an endpoint, metric, or log stream that exists in
this repo — nothing is aspirational.

## Golden signals (API)

Exported by `app/middleware/metrics.py` on `GET /metrics` (scrape all API
pods; labels use route templates, never raw paths):

| Metric | Use |
|---|---|
| `schoolos_http_requests_total{method,route,status}` | RPS, error rate (`status=~"5.."`), per-route burn |
| `schoolos_http_request_duration_seconds{method,route}` | p50/p95/p99 latency per route |
| `schoolos_http_requests_in_progress` | saturation / stuck workers |

Suggested alerts:

- **High error rate**: `sum(rate(schoolos_http_requests_total{status=~"5.."}[5m])) / sum(rate(schoolos_http_requests_total[5m])) > 0.01` for 5m → page.
- **Latency SLO**: `histogram_quantile(0.95, schoolos_http_request_duration_seconds) > 1s` for 10m → ticket.
- **Saturation**: in-progress climbing while RPS flat → scale or investigate.

## Health endpoints

| Endpoint | Meaning | Probe |
|---|---|---|
| `GET /health` | process alive (no dependency checks) | liveness |
| `GET /ready` | DB answers `SELECT 1` (200) or not (503); Redis degradation is reported, not fatal | readiness — LB sheds traffic on 503 |

Alert when ready-probe failures exceed 1% of pods, or any single pod fails
readiness for > 5 minutes (likely a database or migration problem).

## Database

- Managed metrics: connections, `max_connections` headroom, replication lag,
  cache hit ratio, slow queries (`log_min_duration_statement`), backup/PITR
  freshness and last-restore-test age.
- Alert: connections > 80% of max; replication lag > 30s; failed backup.

## Redis

- Queue depth: `LLEN schoolos:jobs`, `LLEN schoolos:jobs:elab` (export via
  redis_exporter or a 60s cron pushing to Prometheus). Depth × age drives
  worker autoscaling; sustained growth pages.
- Memory fragmentation/evictions, rejected connections, replication health.
- Redis is ephemeral by design — alerts focus on throughput, not durability.

## Workers

- Worker failures surface as structured error logs (`schoolos.worker`,
  `schoolos.elab`) — alert on rate, and on `elab_execute` exceptions.
- E-Lab execution failures: query run outcomes (`completed/failed/timeout`
  ratio per hour) for the product dashboard; alert when `timeout` share
  spikes (abuse or image regression) or `failed` with `backend unavailable`
  appears (daemon/image outage on elab nodes).
- Notification fan-out lag: `created → delivered` delay for due-soon scans.

## Storage

- Upload/export error rate (5xx from storage calls), bucket size growth,
  lifecycle-rule deletes, presigned-URL failure spikes.

## Authentication

- Login failure rate (401s on `/auth/login` — brute-force signal; the API
  rate-limits to 10/min and audit-logs denials), token-refresh errors,
  `ACCESS_DENIED` audit volume by tenant (abuse or mis-scoped client).

## Dashboards (minimum set)

1. **Platform overview**: RPS, error rate, p95 latency, pod readiness.
2. **Per-route**: latency histogram + error share for the top 20 routes.
3. **Workers & queues**: queue depth/age, worker restarts, elab outcomes.
4. **Data layer**: PG connections/slow queries/replication; Redis memory/ops.
5. **Security**: 401/403/429 rates, denial audits, quota breaches.

## Runbooks

Every alert links a runbook (extend as incidents teach):

- Error-rate page → check `/ready` per pod, recent deploy, DB connections,
  then route-level errors in Grafana + correlated `request_id` logs.
- Queue-depth page → scale the matching worker pool; if elab depth grows
  with idle workers, check daemon/image health on elab nodes.
- Ready-probe failures → database failover/migration status; API pods are
  correctly shed, do not restart them into a down database.
