# Deployment Architecture

SchoolOS is a multi-tenant SaaS: one React SPA, a stateless FastAPI tier, one
PostgreSQL cluster with logical tenant isolation, Redis for ephemeral state,
S3-compatible object storage, and two isolated worker pools.

```
                        ┌──────────────┐
                        │  CDN + WAF   │  TLS, caching, edge rate limits
                        └──────┬───────┘
               ┌───────────────┴────────────────┐
               ▼                                ▼
     ┌──────────────────┐            ┌──────────────────────┐
     │  Static hosting  │            │   API load balancer  │
     │  (SPA via CDN)   │            │  /health /ready      │
     └──────────────────┘            └──────────┬───────────┘
                                     ┌──────────┴───────────┐
                                     ▼          ▼           ▼
                               ┌────────┐ ┌────────┐ ┌────────┐
                               │ FastAPI│ │ FastAPI│ │ FastAPI│  stateless,
                               │   ×N   │ │  (HPA) │ │        │  1 proc/pod
                               └───┬────┘ └───┬────┘ └───┬────┘
                    ┌───────────────┼──────────┼───────────────┐
                    ▼               ▼          ▼               ▼
            ┌────────────┐  ┌────────────┐ ┌─────────┐ ┌──────────────┐
            │ PostgreSQL │  │   Redis    │ │ S3 /    │ │   Workers    │
            │ (managed,  │  │ (managed / │ │ object  │ │              │
            │  HA + PITR │  │  elastic.) │ │ storage │ │ default pool │
            │  backups)  │  │ queues,    │ │ (files, │ │  + ELAB pool │
            └────────────┘  │ cache, RL  │ │ never in│ │  (isolated   │
                            └────────────┘ │ pods)   │ │   nodes)     │
                                           └─────────┘ └──────────────┘
```

## Services

| Service | Image / runtime | Scales by | Notes |
|---|---|---|---|
| Web (SPA) | `school-os/Dockerfile` → CDN/static host | CDN | Built once per release; API same-origin via ingress |
| API | `school-api/Dockerfile` (uvicorn, 1 proc/pod) | HPA on CPU/RPS | Stateless; sessions in signed JWTs, no sticky state |
| Worker (default) | same image, `WORKER_QUEUES=default` | queue depth | Notifications, periodic scans; **no Docker access** |
| Worker (elab) | same image, `WORKER_QUEUES=elab` | queue depth | **Dedicated nodes**, Docker socket, execution images pre-pulled |
| PostgreSQL | managed (RDS/Cloud SQL/AlloyDB) | vertically + read replicas | Automated backups + PITR; `alembic upgrade head` via migration Job |
| Redis | managed (ElastiCache/Memorystore) | vertically / cluster | Queues, cache, rate limits; ephemeral only |
| Object storage | S3-compatible (S3/GCS/R2) | — | Uploads, exports; lifecycle rules for temp files |

Kubernetes is the reference orchestrator (Deployments + HPA + PDBs), but the
images are orchestrator-agnostic: the same compose file shape runs on a
single host for small deployments.

## Scaling rules

- **API is stateless**: auth is bearer JWTs, uploads stream to object storage,
  background work goes to Redis. Any pod serves any request; scale 2..N.
- **One API process per container** (`CMD` runs a single uvicorn). This keeps
  `/metrics` correct per pod — Prometheus aggregates across pods. Do not add
  `--workers N`; scale with replicas instead.
- **Connection budget**: `replicas × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` must
  stay under PostgreSQL `max_connections` (leave headroom for workers and
  the migration job). Use PgBouncer in transaction mode if the fleet grows.
- **Workers scale on queue depth** (`schoolos:jobs`, `schoolos:jobs:elab`
  list lengths); the elab pool scales independently on its own queue.

## Tenant isolation (logical)

- Every tenant row carries `tenant_id`; the API sets PostgreSQL RLS session
  variables per request (`app.tenant_id`) as a backstop, with application
  code scoping every query itself.
- Cross-tenant access returns 404 (never 403 with existence hints).
- Redis keys and S3 object prefixes are tenant-scoped; per-tenant quotas
  (E-Lab daily runs) prevent noisy-neighbor abuse.

## E-Lab isolation

Untrusted student code executes **only** in throwaway containers on elab
worker hosts — never on API pods, the database, or shared workers:

- Elab workers run on **dedicated, tainted nodes** (toleration only on the
  elab DaemonSet/Deployment); the general worker pool has no Docker socket.
- Routing is by queue: executions enqueue to `schoolos:jobs:elab`, drained
  only where `WORKER_QUEUES=elab`.
- Execution images (`schoolos/elab-{python,node,gcc}:1.0`) are pre-pulled;
  containers run with no network, capped memory/CPU/PIDs, read-only root,
  dropped capabilities, non-root uid (full contract in
  `school-api/docs/elab/ARCHITECTURE.md`).

## Database operations

- **Migrations**: `alembic upgrade head` runs as a Kubernetes Job /
  initContainer on every deploy (`RUN_MIGRATIONS=false` on all app pods so
  replicas never race). Compose dev keeps entrypoint migrations with the api
  service as the sole migrator.
- **Backups**: managed automated daily snapshots + point-in-time recovery;
  test restores quarterly. Single-host fallback: nightly `pg_dump` to object
  storage with a 30-day lifecycle rule.
- **Health**: `pg_isready` container probes; `/ready` returns 503 until
  `SELECT 1` succeeds, so load balancers shed traffic during failovers.

## Redis operations

Redis holds **no permanent truth**: job payloads reference database rows by
id, caches are write-through/read-aside with TTLs, rate-limit counters are
disposable. Losing Redis means re-queued jobs and cold caches — never data
loss. Persist appendonly logs (AOF) to survive restarts without depending
on them for correctness.

## Object storage

- Dev: MinIO via compose (bucket auto-created by `minio-init`).
- Prod: any S3-compatible provider; credentials via secret manager, least
  privilege per bucket prefix. Application containers are stateless —
  uploads, exports and report artifacts live only in object storage.

## Environments

| | Dev | Staging | Prod |
|---|---|---|---|
| Topology | `docker compose up` | prod-shaped, smaller | full HA above |
| `ENV` | `dev` | `prod` | `prod` |
| Secrets | `.env` (dev defaults) | secret manager | secret manager |
| Logs | text | JSON | JSON |
| Elab backend | docker (or local flag) | docker | docker |

Promote by image digest (`:sha`), never by rebuilding: the artifact tested
in CI is the artifact that ships.
