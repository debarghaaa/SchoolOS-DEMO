# SchoolOS — Multi-Tenant SaaS School Management Platform

Monorepo: FastAPI backend (`school-api/`), React SPA (`school-os/`),
shared infrastructure docs (`docs/`) and CI (`.github/workflows/ci.yml`).

```
browser ──▶ CDN ──▶ SPA + API (stateless, HPA) ──▶ PostgreSQL (RLS tenants)
                                            ├────▶ Redis (queues/cache/rate limits)
                                            ├────▶ S3 object storage (files)
                                            └────▶ workers: default pool + isolated E-Lab pool
```

## Quickstart (local development)

Prerequisites: Docker + Docker Compose. No other setup — every service,
including seed data, buckets, and migrations, boots from one command.

```bash
cd school-api
cp .env.example .env        # optional: sane dev defaults work as-is
docker compose up --build
```

| Service  | URL                   |
|----------|-----------------------|
| Frontend | http://localhost:3000 |
| API      | http://localhost:8000 (`/docs` for the API reference) |
| MinIO    | http://localhost:9001 (console) |

Useful follow-ups:

```bash
docker compose logs -f api worker elab-worker   # text logs with request ids
curl localhost:8000/health                      # liveness
curl localhost:8000/ready                       # readiness (DB + Redis state)
cd school-api && elab/docker/build.sh           # execution images for E-Lab runs
```

Bare-metal development (no Docker) also works per service — see
`school-api/README.md` (uvicorn + pytest) and `school-os/README.md` (vite).
Note the SPA's Vite proxy expects the API on `:8000`, and background jobs
need Redis or they run inline/refused per queue policy.

## Repository layout

```
.github/workflows/ci.yml   # lint → typecheck → test → scan → build → integration → deploy
docs/
  API.md                    # endpoint map, envelope, auth, trying it
  ARCHITECTURE.md           # deployment topology, scaling, tenants, data ops
  DESIGN_SYSTEM.md          # Glacier Slate tokens, components, page contract, a11y
  MONITORING.md             # metrics, alerts, dashboards, runbooks
  LOGGING.md                # formats, correlation, retention, red lines
  SECURITY.md               # living security checklist
school-api/                 # backend + worker + database (one service, three roles)
  app/api app/services      # → /backend   (FastAPI, JWT auth, RBAC + RLS tenancy)
  app/workers               # → /worker    (default + isolated E-Lab pools)
  alembic/ + app/models     # → /database  (migrations, RLS, seed: 2 schools, 59 users)
  elab/docker/              # execution images (python/node/gcc)
  Dockerfile                # → /infra     (multi-stage, non-root, api/worker shared image)
  docker-compose.yml        # → /infra     (api, workers, pg, redis, minio, web)
  .env.example              # every setting, documented
school-os/                  # → /frontend  (React + Vite SPA, glass design system)
  Dockerfile / nginx.conf   # multi-stage, non-root nginx on :8080
```

## Operations in brief

- **Health**: `/health` (liveness) and `/ready` (readiness, 503 until the DB
  answers); Prometheus metrics on `/metrics` (private network only).
- **Workers**: `WORKER_QUEUES=default` for notifications/scans,
  `WORKER_QUEUES=elab` on isolated Docker-enabled hosts for code execution.
- **Migrations**: `alembic upgrade head` via entrypoint in compose, via a
  migration Job in orchestrated production (`RUN_MIGRATIONS=false` on pods).
- **Secrets**: environment only, from a secret manager in staging/prod —
  never in images, files, or chat. CI secret-scans every push.
- **Promote by digest**: ship the exact image CI tested (`:sha` tags).

Start with `docs/ARCHITECTURE.md` for the full production topology.
