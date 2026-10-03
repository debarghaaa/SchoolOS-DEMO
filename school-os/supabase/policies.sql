-- SchoolOS presence feed: Row-Level Security.
--
-- Standing rule: the UI NEVER decides who may see what. Every read below is
-- gated on the server-issued JWT claims the FastAPI backend stamps into
-- `app_metadata` when it mints the Supabase session (see README.md):
--
--   app_metadata.tenant_id : uuid string, the selected tenant
--   app_metadata.role      : school-admin | teacher | student | parent
--   app_metadata.classes   : jsonb array of class labels, e.g. ["Grade 10-A"],
--                            matching students.grade || '-' || students.section
--
-- Writes are intentionally policy-less for client roles: browsers can only
-- SELECT. The sync worker writes with the service_role key, which bypasses
-- RLS. There are no `anon` policies: unauthenticated callers see nothing.

-- Claim helpers (fail closed: missing/invalid claims match no rows).
create or replace function request_tenant_id()
returns uuid language sql stable as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

create or replace function request_role()
returns text language sql stable as $$
  select auth.jwt() -> 'app_metadata' ->> 'role'
$$;

create or replace function request_classes()
returns jsonb language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' -> 'classes', '[]'::jsonb)
$$;

alter table profiles enable row level security;
alter table faculty enable row level security;
alter table staff_members enable row level security;
alter table students enable row level security;
alter table family_links enable row level security;
alter table presence_days enable row level security;

grant select on profiles, faculty, staff_members, students, family_links, presence_days to authenticated;

-- ---------------- profiles ----------------
-- Admins see the tenant directory; everyone else sees exactly their own row
-- (so clients can display the signed-in identity without a roster leak).

drop policy if exists profiles_admin on profiles;
create policy profiles_admin on profiles for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for select to authenticated
  using (id = auth.uid());

-- ---------------- faculty / staff_members ----------------
-- School-admin only. Teachers have no business here even though they share
-- the same building: RLS — not the sidebar — enforces that.

drop policy if exists faculty_admin on faculty;
create policy faculty_admin on faculty for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists staff_admin on staff_members;
create policy staff_admin on staff_members for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id());

-- ---------------- students ----------------
-- Admin: whole tenant (the Overview presence island). Teacher: assigned
-- classes only (server-issued claim). Student: own row. Parent: linked
-- children only.

drop policy if exists students_admin on students;
create policy students_admin on students for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists students_teacher on students;
create policy students_teacher on students for select to authenticated
  using (
    request_role() = 'teacher'
    and tenant_id = request_tenant_id()
    and request_classes() ? (grade || '-' || section)
  );

drop policy if exists students_self on students;
create policy students_self on students for select to authenticated
  using (tenant_id = request_tenant_id() and profile_id = auth.uid());

drop policy if exists students_parent on students;
create policy students_parent on students for select to authenticated
  using (
    request_role() = 'parent'
    and tenant_id = request_tenant_id()
    and exists (
      select 1 from family_links fl
      where fl.student_id = students.id
        and fl.parent_profile_id = auth.uid()
    )
  );

-- ---------------- family_links ----------------

drop policy if exists family_links_admin on family_links;
create policy family_links_admin on family_links for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists family_links_self on family_links;
create policy family_links_self on family_links for select to authenticated
  using (parent_profile_id = auth.uid());

-- ---------------- presence_days ----------------
-- Mirrors the directory matrix per audience. Note teachers see ONLY the
-- student audience (their classes): a teacher token querying audience =
-- 'faculty' matches zero rows no matter what the UI asks for.

drop policy if exists presence_admin on presence_days;
create policy presence_admin on presence_days for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id()
         and audience in ('faculty', 'staff'));

-- Admins also read the whole student audience (aggregate island only; the
-- per-student detail view stays teacher-scoped in the UI and demo feed).
drop policy if exists presence_admin_students on presence_days;
create policy presence_admin_students on presence_days for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id()
         and audience = 'student');

drop policy if exists presence_teacher on presence_days;
create policy presence_teacher on presence_days for select to authenticated
  using (
    request_role() = 'teacher'
    and tenant_id = request_tenant_id()
    and audience = 'student'
    and exists (
      select 1 from students s
      where s.id = presence_days.person_id
        and s.tenant_id = presence_days.tenant_id
        and request_classes() ? (s.grade || '-' || s.section)
    )
  );

drop policy if exists presence_self on presence_days;
create policy presence_self on presence_days for select to authenticated
  using (
    tenant_id = request_tenant_id()
    and audience = 'student'
    and exists (
      select 1 from students s
      where s.id = presence_days.person_id
        and s.profile_id = auth.uid()
    )
  );

drop policy if exists presence_parent on presence_days;
create policy presence_parent on presence_days for select to authenticated
  using (
    request_role() = 'parent'
    and tenant_id = request_tenant_id()
    and audience = 'student'
    and exists (
      select 1 from family_links fl
      where fl.student_id = presence_days.person_id
        and fl.parent_profile_id = auth.uid()
    )
  );
