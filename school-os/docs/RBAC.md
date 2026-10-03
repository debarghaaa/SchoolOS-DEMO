# RBAC & Data-Visibility Contract

> **Role-based UI is not a security boundary.** This frontend *generates* navigation,
> workspaces and actions from the authenticated role, but every rule below must be
> enforced independently by the backend. The `src/lib/api.ts` client mirrors that
> contract (authorization check first, scoped payload second) so no page can
> over-fetch by accident.

## Roles & scope

| Role | Tenant scope | Object scope |
|---|---|---|
| `super-admin` | Platform (all tenants) | Tenant-level aggregates only — never individual student/teacher records of a school |
| `school-admin` | Own `tenant_id` only | All records where `tenant_id` matches |
| `teacher` | Own `tenant_id` | Only `class_ids` in `teacher_assignments`; only students enrolled in those classes |
| `student` | Own `tenant_id` | Only `user_id`'s own records + shared learning resources |
| `parent` | Own `tenant_id` | Only `student_ids` in `guardian_links` |

## Endpoint rules (server MUST enforce)

1. **Authenticate** every request; resolve `tenant_id`, `user_id`, `role` from the session — never from client parameters.
2. **Tenant isolation:** every query is implicitly `WHERE tenant_id = session.tenant_id`, except super-admin platform endpoints which aggregate per tenant and must still refuse row-level school data outside support-impersonation (which itself is audit-logged).
3. **Route permission:** map each endpoint to a required action (see `Action` in `src/lib/permissions.ts`, e.g. `attendance.mark`, `submission.grade`, `tenant.manage`). Deny with `403` + audit entry otherwise.
4. **Object authorization:** after permission passes, intersect the result with the caller's object scope:
   - `GET /registers?class_id=` → 403 unless the class is in the teacher's assignments (or caller is school-admin of the tenant).
   - `GET /students/:id` → 403 unless same-tenant admin, assigned teacher, self, or linked guardian.
   - `GET /children` → only `guardian_links` rows for the caller; `GET /children/:id` re-validates the link.
   - `POST /submissions` → only with `student_id = session.user_id` and an assignment published to the student's class.
   - `PATCH /submissions/:id/score` → only the assigned teacher / school-admin of that class.
5. **Response minimization:** return only fields the role needs (e.g. parents never receive other families' contact details; students never receive peer scores).
6. **Audit:** log every privileged read/write with actor, role, tenant, object, IP and allow/deny (see Audit Logs module).

## Frontend mapping

| Concern | Implementation |
|---|---|
| Permission matrix | `ROLE_ACTIONS` + `canDo()` in `src/lib/permissions.ts` |
| Role routes | `ROLE_ROUTES` + `canAccess()` |
| Generated navigation | `getNav(role)` — unauthorized modules are never constructed |
| Overview per role | `Page()` in `src/App.tsx` switches on role; meta in `OVERVIEW_META` |
| Action gates | `<Can do="…">` — unauthorized buttons are absent from the tree |
| Scoped selectors | `src/lib/scoped.ts` (assigned classes, own class, linked children) |
| Authorized fetching | `api.*` + `useScopedQuery` in `src/lib/api.ts` (403 → Forbidden UI) |
| Notification audience | `audience: Role[]` on every notification; filtered by `useMyNotifications()` |

## Live presence feed (exception: real backend, not the simulated client)

The three Overview presence islands stream from Supabase, not `api.*`:

- The browser holds **zero trust**: it logs in to FastAPI, and
  `POST /api/v1/auth/supabase-token` mints a feed session whose
  server-stamped `app_metadata` (`tenant_id`, `role`, `classes`) drives RLS.
- **RLS is the enforcement layer** (`supabase/policies.sql`): admins read
  faculty/staff of their tenant, teachers read assigned classes only, browsers have no write
  policies at all. The role checks in `presence-live.ts` only route UX copy.
- The demo role switcher does **not** affect island data — islands always
  show the connected login's feed. A mismatch (e.g. connected as teacher
  while previewing the admin overview) honestly renders `Not authorized`.

## Testing checklist

- [ ] Log in as each role → Overview title, metrics, actions and charts differ; nothing irrelevant renders.
- [ ] Teacher cannot open admin/parent routes (direct navigation renders the 403 state).
- [ ] Teacher register dropdown lists only assigned classes; submitting for another class is rejected server-side.
- [ ] Student gradebook contains only own rows; peer IDs return 403.
- [ ] Parent with 2 children sees exactly 2 profiles; crafted `child_id` for an unlinked student returns 403.
- [ ] Super-admin sees no student/teacher PII outside tenant aggregates.
- [ ] Denied attempts appear in Audit Logs with actor + IP.
