# SchoolOS API — Multi-Tenant SaaS School Management Platform

Secure, scalable REST API for running many independent schools on one platform.
FastAPI + PostgreSQL + Redis + S3-compatible storage, with JWT auth, RBAC,
tenant isolation (application scoping **plus** PostgreSQL Row-Level Security),
event-driven notifications, async E-Lab code execution in isolated workers,
and a full audit trail.

Companion web client lives in `../school-os`; this service implements the
server half of its `docs/RBAC.md` contract (authorization check first, scoped
payload second, 403 + audit entry on denial).

## Architecture

```
app/
├── api/            # Thin routes (app/api/deps.py = auth + tenant + RBAC gates)
│   └── v1/         # 18 modules: auth users students teachers parents schools
│                   # classes subjects enrollments attendance assignments
│                   # submissions grades timetable notifications files elab audit-logs
├── core/           # config, db engine + RLS setter, errors, envelope, redis
├── models/         # SQLAlchemy 2.0 models (22 tables, UUID PKs, UTC datetimes)
├── schemas/        # Pydantic v2 request/response contracts
├── services/       # Business logic + object-level authorization + audit
├── repositories/   # Tenant-scoped data-access helpers
├── middleware/     # Request id, security headers, Redis rate limiting
├── workers/        # Redis job queue, task handlers, E-Lab sandbox runner
├── security/       # Password hashing, JWT, RBAC permission matrix
└── integrations/   # S3-compatible storage (signed URLs), email
```

Request flow: `middleware` → `deps.get_request_context` (verify JWT → load
identity → verify tenant/role match → open session with RLS vars) →
`require_perm(...)` → `services.*` (object scope: assigned classes, linked
children, own records) → envelope response. Services never trust client
`tenant_id`; super-admins are kept out of tenant rows entirely.

## Quickstart

### Docker Compose (PostgreSQL + Redis + MinIO + API + workers + web)

```bash
cp .env.example .env   # optional: dev defaults boot as-is; set a real SECRET_KEY
docker compose up --build
# Frontend: http://localhost:3000   API: http://localhost:8000   Docs: http://localhost:8000/docs
# MinIO console: http://localhost:9001 (see MINIO_* in .env)
docker compose exec api python -m app.seed   # demo tenant + users
elab/docker/build.sh                          # execution images (or E-Lab runs fail closed)
```

Services: `api` (sole migrator), `worker` (`WORKER_QUEUES=default`, no Docker
access), `elab-worker` (`WORKER_QUEUES=elab`, isolated, Docker socket),
`frontend` (nginx SPA, `/api` proxied), plus `postgres`, `redis`, `minio`
and the one-shot `minio-init` bucket creator.

### Local (zero-config SQLite)

```bash
pip install -r requirements-dev.txt   # prod images install requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:create_app --factory --reload
python -m app.workers.worker   # separate terminal (needs Redis; elab jobs refuse inline)
```

Demo credentials (password for all: `Password123`):

| Role | Email | Tenant slug |
|---|---|---|
| super-admin | root@schoolos.io | — (platform) |
| school-admin | admin@northview.edu | northview |
| teacher | rohan@northview.edu | northview |
| student | ishita@northview.edu | northview |
| parent | parent@example.com | northview |

## Authentication

Bearer JWT access tokens (15 min) + rotating refresh tokens (7 days, hashed
at rest, single use). Endpoints: `POST /auth/login` (accepts optional
`tenant_slug` when an email exists in several schools), `/refresh`,
`/logout` (one or all sessions), `/me`, `/sessions`, `/password`,
`/password-reset/request|confirm`, `/verify-email/request|confirm`,
`/invites/accept`. Passwords: bcrypt (configurable rounds, 72-byte
pre-hash). Tokens never go in URLs; file downloads use separate short-lived
file JWTs. CSRF: not applicable — pure bearer-token API with no cookie auth.

## Multi-tenancy

- Every tenant request resolves `tenant_id`, `user_id`, `role` from the
  verified session. Client-supplied tenant ids are never trusted; a forged
  claim fails closed with `403 tenant_mismatch`.
- All queries are tenant-scoped in the repository/service layer, and
  PostgreSQL Row-Level Security (`alembic/versions/..._row_level_security.py`)
  enforces the same boundary in the database via `app.tenant_id` /
  `app.bypass_rls` session vars.
- Cross-tenant row access returns **404** (existence is not leaked);
  same-tenant out-of-scope access returns **403**.
- Super-admins see platform aggregates only (tenants, audit) — never
  row-level school records.

## RBAC (permissions)

| Capability | super-admin | school-admin | teacher | student | parent |
|---|---|---|---|---|---|
| Tenants / subscriptions / platform | ✓ | | | | |
| Users, classes, subjects, enrollments | | ✓ | | | |
| Attendance (mark / bulk / update) | | ✓ | assigned classes | own view | linked view |
| Assignments (create / publish / archive) | | ✓ | assigned classes | published view | linked view |
| Submissions / grading / publish | | ✓ | assigned classes | own submit | linked view |
| Timetable (manage / views) | | ✓ manage | own | own | linked |
| Files (upload / signed URLs) | | ✓ | ✓ | ✓ | |
| E-Lab runs (async, sandboxed) | | ✓ view | ✓ | ✓ | |
| Announcements / notifications | | send | read | read | read |
| Audit logs | all tenants | own tenant | | | |

Object scope is enforced in services: teachers intersect to
`teacher_assignments`, students to their own profile, parents to
`parent_links`. Every denial is audit-logged with actor + IP + code.

## API

75 routes under `/api/v1`, OpenAPI at `/docs`. Success envelope:

```json
{ "success": true, "data": { ... }, "error": null }
```

Errors: `{ "success": false, "data": null,
"error": { "code": "forbidden", "message": "...", "details": {... } } }`
with machine-readable codes (`unauthorized`, `forbidden`, `tenant_required`,
`tenant_mismatch`, `not_found`, `conflict`, `duplicate`, `validation_error`,
`deadline_passed`, `schedule_conflict`, `rate_limited`, `queue_unavailable`,
`storage_error`, `payload_too_large`, `expired`, `invalid_token`,
`not_supported`, `internal_error`). Internal errors are never exposed.

Notable rules: attendance unique per (student, class, date); bulk marking is
atomic; assignment deadlines enforced server-side (late first submissions are
flagged, resubmission after deadline is rejected); grades visible to
students/parents only after publish; timetable creation rejects class, teacher
and room overlaps.

## Background workers

`python -m app.workers.worker` drains the Redis queue: notification fan-out,
announcement broadcast, E-Lab executions, plus a 60-second due-soon scan.
Without Redis, notifications degrade to inline delivery while E-Lab jobs wait
for a worker (code **never** executes in the API process).

## Storage

`STORAGE_BACKEND=s3` (MinIO/AWS) with server-side credentials and short-lived
presigned PUT/GET URLs; `local` for dev/test with direct multipart upload and
signed single-file download links. Metadata (id, tenant, owner, key, name,
MIME, size, timestamp) lives in PostgreSQL.

## E-Lab

`POST /elab/runs` → `202 { execution_id }`, `GET /elab/runs/{id}` to poll,
`DELETE /elab/runs/{id}` to cancel. Workers run snippets in throwaway,
network-less, resource-capped containers (see `docs/elab/ARCHITECTURE.md`);
student code never executes in the API, worker, or database hosts.
Python/JS/C/C++ via `schoolos/elab-*` images (`elab/docker/build.sh`).
Per-user and per-tenant quotas (429 on breach); every execution audit-logged.
Dev/test may use `ELAB_BACKEND=local` + `ELAB_ALLOW_INSECURE_LOCAL=true`
(Python only, never in production).

## Notifications

Event-driven: assignment created/due-soon, submission received, grade
published, attendance update, timetable change, announcements. Fan-out is a
background job; per-user inbox with read tracking and unread counts.

## Audit logging

Immutable log of actor, tenant, action, resource, resource id, timestamp, IP
and metadata: auth events, user/role changes, tenant changes, attendance /
assignment / grade / timetable changes, file access, announcements, E-Lab
executions and all denials.

## Rate limiting & hardening

Per-endpoint fixed-window limits (login 10/min, refresh 30/min, E-Lab
20/hour) over Redis with in-memory fallback; security headers + HSTS;
CORS allowlist; ORM-only queries (no string-built SQL); request ids;
`/health` + `/ready` probes.

## Configuration

See `.env.example`. Production must set `SECRET_KEY` (refused otherwise),
`DATABASE_URL` (PostgreSQL), `REDIS_URL`, S3 credentials, `API_BASE_URL`,
`FRONTEND_URL` and `CORS_ORIGINS`.

## Testing

```bash
python -m pytest tests/   # 68 tests, ~15s, SQLite + local storage, no services needed
```

Covers auth/session/token flows, the RBAC matrix, **mandatory tenant-isolation**
(404 cross-tenant, 403 out-of-scope, forged-claim rejection, audit scoping),
every API module, deadline/schedule/conflict rules, file flows, async E-Lab
(queued → drained → succeeded/failed/timeout) and audit coverage. PostgreSQL
RLS policies ship as a migration and render-check in CI (`alembic upgrade
head --sql`); run the suite against PG in CI for the full backstop.

## Production checklist

- [ ] `ENV=prod`, strong `SECRET_KEY`, TLS termination, trusted-proxy IPs
- [ ] PostgreSQL with a least-privilege app role (migrations via owner role)
- [ ] Redis persistence + separate queue DB
- [ ] S3 bucket with private default + SSE; CloudFront/OAI if needed
- [ ] SMTP/SES email backend; frontend reset/verify/accept pages
- [ ] Worker replicas + monitoring; E-Lab in containers/gVisor for untrusted code
- [ ] Log shipping, metrics, alerting on 5xx / denial spikes
