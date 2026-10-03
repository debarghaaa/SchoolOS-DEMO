# SchoolOS presence feed (Supabase)

A small, dedicated realtime database for the punch in/out feed behind the
Overview **presence islands** (Faculty / Staff / Student). The FastAPI
service (`school-api`) remains the system of record; this database mirrors
just enough identity + roster state to stream today's punch events to
browsers over Supabase Realtime.

```
biometric feed / FastAPI ──service_role──▶ presence_days ──realtime──▶ islands
                                    (RLS: browsers SELECT only)
```

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Tables, indexes, `updated_at` trigger, realtime publication |
| `policies.sql` | RLS: tenant isolation + per-audience role gates (the enforcement layer) |
| `maintenance.sql` | Facilities / requests / tasks schema + RLS + realtime + Northview seed |
| `leave.sql` | Leave applications / approvals / notifications + RLS + realtime + Northview seed |
| `seed.sql` | Idempotent demo rows for the Northview tenant (any day: uses `CURRENT_DATE`) |

Apply in order via the Supabase SQL editor or `supabase db push`.

## Setup (hosted)

1. Create a Supabase project; open the SQL editor.
2. Run `schema.sql`, then `policies.sql`, then `maintenance.sql`, then `leave.sql`, then `seed.sql`.
3. Confirm Realtime: Database → Replication → `supabase_realtime` includes
   `presence_days` plus the three maintenance and three leave tables (added automatically).
4. Copy the project URL + `anon` key into the frontend env:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`).
5. Configure the FastAPI backend with `SUPABASE_URL` +
   `SUPABASE_SERVICE_KEY` so it can mint feed sessions
   (`POST /api/v1/auth/supabase-token`).

Local alternative: `supabase init && supabase start` in this folder, then run
the five files against the local DB and use the CLI-printed keys.

## JWT claims contract

Browsers authenticate with a Supabase session whose `app_metadata` the
**backend** stamps — never the UI. The exchange endpoint
(`POST /api/v1/auth/supabase-token`) derives these from the validated
FastAPI session:

| Claim | Source | Example |
|---|---|---|
| `tenant_id` | selected membership's tenant | `"7ba3571d-…"` |
| `role` | primary role ∪ grants (broadest wins for reads) | `"teacher"` |
| `classes` | teacher's assigned class labels | `["Grade 10-A"]` |

Class labels follow `grade_level + '-' + section` from the FastAPI `classes`
table (e.g. `Grade 10` + `A` → `Grade 10-A`) and match
`students.grade || '-' || students.section` in RLS.

## Authorization matrix (enforced by RLS, not the UI)

| Audience | school-admin | teacher | student | parent |
|---|---|---|---|---|
| faculty / staff directory + feed | full tenant | — (zero rows) | — | — |
| students directory + feed | full tenant (aggregate island) | assigned classes only | own row | linked children only |
| presence writes (`INSERT/UPDATE/DELETE`) | — | — | — | — |
| maintenance directory + feed | full management | read-only | — (zero rows) | — (zero rows) |
| leave applications | teachers' apps + teachers see assigned students | own + assigned students | own only | linked children |
| leave writes | decide teachers' apps | decide assigned students' | apply / cancel own | apply / cancel for children |
| maintenance writes | tenant-scoped, RLS-enforced | — (`42501`) | — | — |

Presence tables hold no browser write policies at all. Maintenance and
leave are the deliberate exceptions: admins manage requests directly from
the page under RLS (`*_admin_all` policies with `WITH CHECK` on tenant +
role), and leave applicants/approvers write their own edges
(`leave_applications_*`, `leave_approvals_*`, `notifications_*` — inserts
can never set `approved`/`rejected`, decisions only touch the assigned
approver's pending rows). The UI gates every control by role on top. The sync worker uses the
`service_role` key, which bypasses RLS — keep that key server-side only.

## Realtime channel

The islands subscribe per audience + day (tenant scoping is server-side via
RLS; the filter narrows the payload):

```ts
supabase
  .channel(`presence:student:${today}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'presence_days',
      filter: `tenant_id=eq.${tenantId}` },
    () => refetchDay())
  .subscribe();
```

`INSERT` = first punch of the day, `UPDATE` = punch-out / correction.
Payloads carry the full row; the client merges by
`(audience, person_id)` and bumps `syncedAt`.

## Sync worker pattern

Mirror roster changes and punch events from FastAPI with an idempotent
upsert (service_role, server-side only):

```python
sb.table("presence_days").upsert({
    "tenant_id": tenant_id, "audience": "student",
    "person_id": str(student_id), "day": today.isoformat(),
    "status": "present", "punch_in": "07:52",
}, on_conflict="tenant_id,audience,person_id,day").execute()
```

Directory tables (`faculty`, `staff_members`, `students`, `profiles`,
`family_links`) sync the same way on roster changes. Punch devices post to
FastAPI, FastAPI upserts here — devices never see Supabase credentials.

## Verifying RLS

1. Mint two feed sessions (admin + teacher) via the exchange endpoint.
2. As teacher: `select * from faculty` → zero rows;
   `select * from students` → only assigned classes.
3. As admin: full faculty/staff rows; `select * from students` → full
   tenant roster.
4. `insert into presence_days ...` as either → `42501` (policy-less write).
5. As teacher: `insert into maintenance_requests ...` → `42501`; as admin
   the same insert succeeds inside the tenant and fails for any other
   `tenant_id` (WITH CHECK).
6. As student: `insert into leave_applications ... status='approved'` →
   `42501`; `status='pending'` for self succeeds; for another student →
   `42501`. As the assigned class teacher, approving that row succeeds;
   approving another teacher's student's row → `42501`.
7. `select * from notifications` returns only rows addressed to the
   session's own profile id in every role.

Any row that leaks here is a policy bug, not a UI bug — fix it in
`policies.sql`.
