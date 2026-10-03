# API Reference

FastAPI, base path `/api/v1`. Interactive docs at `/docs` (Swagger) and
`/redoc`; the OpenAPI JSON at `/openapi.json` is the contract — this file
is the map, not a duplicate.

## Conventions

- **Envelope**: every response is `{ success, data, error }` where `error`
  is `{ code, message, details? }`. Clients branch on `success`, never on
  bare status codes.
- **Errors**: `validation_error` 422, `unauthorized` 401, `forbidden` 403,
  `not_found` 404 (also for cross-tenant reads — existence is never leaked),
  `duplicate`/`conflict` 409, `rate_limited` 429, `internal_error` 500
  (no internals leak to clients).
- **Pagination**: list endpoints take `page`/`size` and return
  `{ items, total, page, size }`.
- **Auth**: `Authorization: Bearer <access-jwt>` (15 min) + rotating
  refresh tokens. Login may return `requires_selection` with a
  `select_token` for multi-membership accounts (complete via
  `POST /auth/select-tenant`).
- **Tenancy**: memberships scope every call; platform routes
  (`tenants.manage`, `platform.manage`, `audit.read_all`) require the
  super-admin grant and bypass tenant scope explicitly.

## Endpoint map

| Tag | Highlights |
|---|---|
| Authentication | login, select-tenant, refresh, logout, invites accept, password reset/change, email verify, supabase-token exchange |
| Schools (control plane) | create school (+ admin invite, trial), list, get, **PATCH status/tier/meta/flags/trial**, delete |
| Platform | `GET /platform/analytics` — tenants, users by role, students/teachers/classes, E-Lab runs 24h |
| Users / Students / Teachers / Parents | CRUD + scoping (assigned classes, linked children, own records) |
| Classes / Subjects / Enrollments | CRUD, class↔subject links, teacher assignments, enroll/withdraw |
| Attendance | mark, bulk mark, lists, per-student and per-class stats |
| Assignments / Submissions / Grades | draft→publish→archive; submit/resubmit; grade→publish (students/parents see only published) |
| Timetable | slots CRUD with overlap validation; class/teacher/student views |
| Notifications | inbox, unread count, mark read, announce (scoped), due-soon scan |
| Files | tenant-scoped uploads to local/S3 storage with permission checks and signed URLs |
| E-Lab | `POST /elab/runs` → 202 `{ execution_id }`, poll `GET /elab/runs/{id}`, `DELETE` to cancel; statuses `queued/running/completed/failed/timeout/cancelled` |
| Audit Logs | filterable by tenant/action/resource/actor/date (own scope or `audit.read_all`) |
| Demo feed (temporary, presence only) | `GET /demo-feed/faculty|staff` (admin), `GET /demo-feed/students` (teacher classes / student own / parent linked), `GET /demo-feed/school-attendance` (admin aggregate `{day,total,present,absent}`); new days clone forward |

## Ops endpoints (no `/api/v1` prefix, excluded from schema)

- `GET /health` — liveness (process alive). `GET /ready` — readiness: 200
  when the DB answers, 503 otherwise; Redis state reported, degraded mode
  documented. `GET /metrics` — Prometheus (private network only).

## Trying it

```bash
# from school-api/, with the dev server running (see README quickstart)
python -m app.seed   # two schools, 59 users, password Password123 for all
curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rohan@northview.edu","password":"Password123"}'
```

Use the returned access token as `Authorization: Bearer …` for the calls
above; walk the full school workflow in `tests/test_journey.py`.
