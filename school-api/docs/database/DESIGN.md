# Database Architecture — Multi-Tenant School SaaS

PostgreSQL 16, UUID primary keys, SQLAlchemy 2.0 models (`app/models/`),
Alembic migrations (`alembic/versions/`), Row-Level Security on every
tenant-owned table. Companion artifacts in this folder:

| Artifact | File |
|---|---|
| Entity-relationship diagram | `ERD.mmd` (+ `ERD.svg` when rendered) |
| Full PostgreSQL DDL (schema + RLS + indexes) | `schema.sql` |
| Deterministic seed (1 tenant, 18 users, classes…) | `seed.sql` |
| Migration chain | `alembic/versions/` |

## 1. Table catalog (30 tables)

**Platform / tenancy**

| Table | Grain | Notes |
|---|---|---|
| `tenants` | one row per tenant | `slug` unique; status `trial/active/suspended` |
| `subscriptions` | 1:1 with tenant | tier, status, trial + billing periods, seats, meta |
| `feature_flags` | (tenant, key) | per-tenant toggles + payload |
| `schools` | N:1 with tenant | school profile(s); usually 1:1, 1:N allows school groups |

**Identity / access**

| Table | Grain | Notes |
|---|---|---|
| `users` | one row per human, **global** | email globally unique; no tenant column |
| `roles` | one row per role name | seeded system catalog, extensible |
| `tenant_membership` | (tenant, user) | primary `role` + `status`; the tenant boundary |
| `user_roles` | (user, role, tenant?) | extra grants; `tenant_id NULL` = platform-wide |
| `refresh_tokens` | one row per session | rotating, hashed at rest |
| `one_time_tokens` | one row per token | reset / verify / invite / tenant-select |

**People & structure**

`students` (soft-delete), `teachers` (soft-delete), `parents` (soft-delete),
`parent_student` links, `classes` (soft-delete), `class_members` (adult roster:
teacher/assistant × class × optional subject), `subjects` (soft-delete),
`teacher_subjects` (staffing directory), `class_subjects` (class curriculum),
`enrollments` (student × class × year).

**Academic records (never physically deleted)**

`attendance` (daily grain), `assignments`, `assignment_files`, `submissions`,
`grades` (snapshotted history), `timetable`.

**Platform services**

`notifications`, `files` (S3 metadata), `elab_runs`, `audit_logs`.

## 2. Tenant model

- `users` is global; tenancy is granted through `tenant_membership`. A parent
  with children in two schools has one login and two memberships.
- Every tenant-owned row carries `tenant_id` (NOT NULL, FK → tenants,
  `ON DELETE CASCADE`), except: `users` (global), `roles` (global catalog),
  `refresh_tokens`/`one_time_tokens` (keyed by unguessable hashes + verified
  user id; touched before any tenant is known), and `audit_logs.tenant_id`
  (NULL only for platform-level events).
- JWT access claims: `sub` (user), `tenant_id`, `role` (membership primary
  role). Effective permissions = primary role ∪ `user_roles` grants
  (tenant-scoped + platform). The API re-validates membership (existence,
  role match, active status) on every request; any mismatch fails closed.

## 3. Row-Level Security

Enabled with `FORCE` on all tenant-owned tables plus `tenants`:

```sql
-- tenant-owned tables (USING covers SELECT/UPDATE/DELETE; WITH CHECK
-- defaults to the same expression for INSERT):
CREATE POLICY tenant_isolation ON <table> FOR ALL
USING (tenant_id::text = current_setting('app.tenant_id', true)
   OR  current_setting('app.bypass_rls', true) = 'true');

-- tenants (a member reads exactly its own tenant row):
CREATE POLICY tenant_self ON tenants FOR ALL
USING (id::text = current_setting('app.tenant_id', true)
   OR  current_setting('app.bypass_rls', true) = 'true');
```

- `app.tenant_id` is set server-side per transaction from the verified
  session (`SET LOCAL`, see `app/core/db.set_rls`). **Clients can never set
  it**: it is not derived from any request parameter, and the value is
  type-checked as UUID before use.
- `app.bypass_rls='true'` is set only for: login / token verification /
  invite flows (no tenant known yet), background workers (which scope
  explicitly), and super-admin platform reads (aggregates only, enforced in
  application code).
- RLS is the **backstop**; the application layer scopes every query itself.
  Defense in depth: a missed filter returns rows the policy then hides.

## 4. Super-admin access (explicit, separate)

Super-admins have **no membership rows**. Access is a platform grant:
`user_roles(user_id, role_id(super-admin), tenant_id NULL)`. Consequences:

- Platform endpoints (`tenants.manage`, `audit.read_all`) run with
  `bypass_rls` and return aggregates / cross-tenant audit entries.
- Tenant row endpoints reject super-admins (`403 tenant_required`): the
  platform role can never read a school's student/teacher records.
- There is no "god session": switching into a tenant requires a real
  membership (support impersonation would be a separate audited flow).

## 5. Constraints

- **PKs**: UUID everywhere (`gen_random_uuid()` default in DDL; app-side
  `uuid4` in the ORM).
- **FKs** on all relationships; `CASCADE` inside tenant aggregates,
  `SET NULL` for actor/owner/profile links that must survive deletion.
- **Tenant-aware uniqueness**: `(tenant_id, slug)` tenants; `(tenant_id,
  admission)` students; `(tenant_id, employee_no)` teachers; `(tenant_id,
  code)` subjects & schools; `(tenant_id, name, academic_year)` classes;
  `(student_id, class_id, academic_year)` enrollments.
- **Attendance**: `UNIQUE (tenant_id, student_id, date)` — one record per
  student per day; `class_id` records the marking context (per-class stats
  filter on it).
- **CHECKs**: status enums on tenants, users, memberships, students, classes,
  enrollments, attendance, assignments, submissions, subscriptions;
  `score >= 0`; `day_of_week BETWEEN 0 AND 6`; `end_time > start_time`;
  membership role in the five system roles.

## 6. Indexes

- Single-column: every `tenant_id`, `users.email`, `students.student_identifier`,
  all `class_id`/`teacher_id`/`student_id`/`assignment_id` FKs, `created_at`
  on hot tables, `assignments.due_at`, `notifications.recipient_id`,
  `elab_runs.source_hash`.
- Composite (tenant-first for partition-like pruning): `(tenant_id, class_id)`
  on attendance/assignments; `(tenant_id, student_id)` on attendance/
  submissions/grades; `(tenant_id, created_at)` on attendance/notifications/
  audit_logs; `(tenant_id, recipient_id)` on notifications.
- Partial uniques on `user_roles` (platform vs tenant grants).

## 7. Data lifecycle

- **Soft delete** (`deleted_at`, filtered centrally in `repositories/scoped.py`)
  for students, teachers, parents, classes, subjects, schools. Identifiers
  are never reused: unique constraints intentionally include deleted rows.
- **Academic records are append-only in spirit**: attendance, submissions and
  grades are corrected via new values/updates, never hard-deleted; grades
  snapshot `student_id`, `teacher_id` and `max_score` so history survives
  link changes; classes archive via `status` rather than delete.
- **Audit logs** are immutable (no update/delete path in the API).

## 8. Migrations & seed

- `007aced6439c` initial schema → `c4d2e8a1f6b3` RLS → `e5f200000001`
  v2 architecture evolution (table renames, membership split, new tables,
  CHECKs, data backfills with conflict guards). Each migration is
  SQLite-compatible for tests and a no-op where PG-only.
- `seed.sql` (this folder) inserts a deterministic demo dataset with
  uuid5-stable ids: 1 tenant + subscription + school + flags, 18 users
  (1 platform super-admin, 2 school-admins, 3 teachers, 10 students,
  2 parents), 3 classes, 5 subjects, curriculum + staffing + roster links,
  enrollments, 30 attendance rows, assignments, submissions and grades.
  The app's `python -m app.seed` produces a smaller equivalent via the ORM.
  Both validate clean: FK checks pass and `alembic check` reports no drift
  between the migrated schema and the models.

## 9. Key decisions (ADRs, condensed)

1. **Global users + membership** over per-tenant users: real multi-school
   families/staff need one login; `tenant_slug` login disambiguation is
   replaced by a membership picker (`/auth/select-tenant`).
2. **`tenant_membership.role` (primary) + `user_roles` (extra grants)** over
   a single mechanism: the JWT fast path stays one column while custom
   multi-role grants remain possible.
3. **Attendance grain = student-day** (unique on tenant+student+date): matches
   homeroom reality and unifies with the Supabase presence feed; class
   context retained per record.
4. **`class_subjects` retained** although absent from the initial table list:
   staffing (`teacher_subjects`) cannot express a class curriculum, which
   assignment validation requires.
5. **Plain (non-partial) uniques with soft delete**: resurrecting an
   identifier is a data-integrity smell; conflicts surface explicitly.
6. **RLS as backstop, not primary gate**: every query is scoped in code;
   policies catch exactly the bugs code review misses.
7. **Login → memberships → select-tenant**: a password identifies the human;
   the session's tenant comes from an explicit membership pick
   (`/auth/select-tenant`), never from a client-supplied slug.
8. **Permissions union, scope prioritizes**: effective permissions are the
   primary role ∪ extra grants, but object scope follows the broadest
   applicable role; platform grants never open tenant row endpoints.
