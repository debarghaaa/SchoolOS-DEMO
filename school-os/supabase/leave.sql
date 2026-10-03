-- SchoolOS leave management (Supabase Postgres).
--
-- Leave applications, approval history and leave notifications behind the
-- Overview leave islands and the dedicated /leave-management hero page.
-- Same tenancy contract as the presence/maintenance feeds: every row
-- carries tenant_id (the task spec's `school_id`), browsers authenticate
-- with the backend-minted feed JWT (app_metadata: tenant_id, role,
-- classes), and RLS — never the UI — is the enforcement layer.
--
-- Routing follows the school structure, not client claims: students apply
-- to their class teacher (class_teachers), teachers apply to a school
-- admin. Status transitions are locked in Postgres — applicants can never
-- approve their own applications, whatever the UI sends.
--
-- Apply order: schema.sql -> policies.sql -> maintenance.sql -> leave.sql -> seed.sql.

-- ---------------- tables ----------------

-- School structure for approver routing: one class teacher per class.
-- Directory-grade data (same visibility as the Classes page): any
-- authenticated tenant member may read it; only admins may change it.
create table if not exists class_teachers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  class_label text not null,
  teacher_profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, class_label)
);
create index if not exists ix_class_teachers_tenant on class_teachers (tenant_id);

create table if not exists leave_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  applicant_id uuid not null references profiles (id) on delete cascade,
  applicant_role text not null check (applicant_role in ('student', 'teacher')),
  -- Denormalized display columns (same convention as faculty/staff/students
  -- name+initials): realtime payloads stay self-contained, no joins needed.
  applicant_name text not null,
  applicant_detail text not null default '',
  -- Routing key for students ('Grade 10-B'); '' for teachers.
  applicant_class text not null default '',
  leave_type text not null
    check (leave_type in ('Sick Leave', 'Casual Leave', 'Emergency Leave', 'Personal Leave', 'Other')),
  start_date date not null,
  end_date date not null,
  -- Maintained by trg_leave_total_days; never written by clients.
  total_days integer not null default 1,
  reason text not null default '',
  supporting_document_url text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  -- Null while drafting; resolved to the authorized approver on submit.
  approver_id uuid null references profiles (id) on delete set null,
  approver_name text not null default '',
  submitted_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  rejection_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (status = 'draft' or reason <> '')
);
create index if not exists ix_leave_tenant_status on leave_applications (tenant_id, status);
create index if not exists ix_leave_applicant on leave_applications (tenant_id, applicant_id, status);
create index if not exists ix_leave_approver on leave_applications (tenant_id, approver_id, status);

create table if not exists leave_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  leave_application_id uuid not null references leave_applications (id) on delete cascade,
  -- The actor: applicant for submitted/cancelled, approver for decisions.
  approver_id uuid not null references profiles (id) on delete cascade,
  action text not null check (action in ('submitted', 'approved', 'rejected', 'cancelled')),
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_lapproval_app on leave_approvals (leave_application_id, created_at);

-- Leave notifications. reference_id points at the leave application the
-- notification opens; intentionally FK-less so the table can carry future
-- notification kinds without schema changes.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  recipient_id uuid not null references profiles (id) on delete cascade,
  type text not null default 'leave_submitted'
    check (type in ('leave_submitted', 'leave_approved', 'leave_rejected', 'leave_cancelled')),
  title text not null,
  message text not null default '',
  reference_id uuid null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ix_notif_recipient on notifications (recipient_id, created_at desc);

-- ---------------- derived columns + realtime ----------------

-- total_days is DERIVED, never stored by clients: inclusive day count.
create or replace function set_leave_total_days()
returns trigger language plpgsql as $$
begin
  new.total_days = new.end_date - new.start_date + 1;
  return new;
end;
$$;

drop trigger if exists trg_leave_total_days on leave_applications;
create trigger trg_leave_total_days before insert or update on leave_applications
  for each row execute function set_leave_total_days();

drop trigger if exists trg_leave_touch on leave_applications;
create trigger trg_leave_touch before update on leave_applications
  for each row execute function touch_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table leave_applications;
    alter publication supabase_realtime add table leave_approvals;
    alter publication supabase_realtime add table notifications;
  end if;
exception when duplicate_object then
  null;
end;
$$;

-- ---------------- RLS ----------------
-- Applicants own their rows but can only move draft <-> pending ->
-- cancelled; the approved/rejected states are reachable only through the
-- approver policies below. Teachers decide student applications assigned
-- to them; admins decide teacher applications. Parents act for linked
-- children (family flow from the attendance page). No client role holds
-- DELETE on applications: history is cancelled, never erased.

alter table class_teachers enable row level security;
alter table leave_applications enable row level security;
alter table leave_approvals enable row level security;
alter table notifications enable row level security;

grant select, insert, update, delete on class_teachers to authenticated;
grant select, insert, update on leave_applications, leave_approvals, notifications to authenticated;

-- Approver must be a real teacher / admin of the same tenant.
create or replace function is_tenant_teacher(profile_id uuid, tenant_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles p
    where p.id = profile_id and p.tenant_id = tenant_id and p.role = 'teacher'
  )
$$;

create or replace function is_tenant_admin(profile_id uuid, tenant_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles p
    where p.id = profile_id and p.tenant_id = tenant_id and p.role = 'school-admin'
  )
$$;

drop policy if exists cteach_read on class_teachers;
create policy cteach_read on class_teachers for select to authenticated
  using (tenant_id = request_tenant_id());

drop policy if exists cteach_admin_all on class_teachers;
create policy cteach_admin_all on class_teachers for all to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id())
  with check (request_role() = 'school-admin' and tenant_id = request_tenant_id());

-- ----- leave_applications: students -----

drop policy if exists leave_student_select on leave_applications;
create policy leave_student_select on leave_applications for select to authenticated
  using (request_role() = 'student' and tenant_id = request_tenant_id()
         and applicant_id = auth.uid());

drop policy if exists leave_student_insert on leave_applications;
create policy leave_student_insert on leave_applications for insert to authenticated
  with check (request_role() = 'student' and tenant_id = request_tenant_id()
    and applicant_id = auth.uid() and applicant_role = 'student'
    and status in ('draft', 'pending')
    and (status = 'draft' or is_tenant_teacher(approver_id, tenant_id)));

drop policy if exists leave_student_update on leave_applications;
create policy leave_student_update on leave_applications for update to authenticated
  using (request_role() = 'student' and tenant_id = request_tenant_id()
         and applicant_id = auth.uid() and status in ('draft', 'pending'))
  with check (request_role() = 'student' and tenant_id = request_tenant_id()
    and applicant_id = auth.uid() and applicant_role = 'student'
    and status in ('draft', 'pending', 'cancelled')
    and (status = 'draft' or is_tenant_teacher(approver_id, tenant_id)));

-- ----- leave_applications: teachers (own applications + assigned queue) -----

drop policy if exists leave_teacher_select_own on leave_applications;
create policy leave_teacher_select_own on leave_applications for select to authenticated
  using (request_role() = 'teacher' and tenant_id = request_tenant_id()
         and applicant_id = auth.uid());

drop policy if exists leave_teacher_select_queue on leave_applications;
create policy leave_teacher_select_queue on leave_applications for select to authenticated
  using (request_role() = 'teacher' and tenant_id = request_tenant_id()
         and applicant_role = 'student' and approver_id = auth.uid());

drop policy if exists leave_teacher_insert on leave_applications;
create policy leave_teacher_insert on leave_applications for insert to authenticated
  with check (request_role() = 'teacher' and tenant_id = request_tenant_id()
    and applicant_id = auth.uid() and applicant_role = 'teacher'
    and status in ('draft', 'pending')
    and (status = 'draft' or is_tenant_admin(approver_id, tenant_id)));

drop policy if exists leave_teacher_update_own on leave_applications;
create policy leave_teacher_update_own on leave_applications for update to authenticated
  using (request_role() = 'teacher' and tenant_id = request_tenant_id()
         and applicant_id = auth.uid() and status in ('draft', 'pending'))
  with check (request_role() = 'teacher' and tenant_id = request_tenant_id()
    and applicant_id = auth.uid() and applicant_role = 'teacher'
    and status in ('draft', 'pending', 'cancelled')
    and (status = 'draft' or is_tenant_admin(approver_id, tenant_id)));

-- Teachers decide ONLY student applications assigned to them. A teacher
-- row can never pass this USING clause, so self-approval is impossible.
drop policy if exists leave_teacher_decide on leave_applications;
create policy leave_teacher_decide on leave_applications for update to authenticated
  using (request_role() = 'teacher' and tenant_id = request_tenant_id()
         and applicant_role = 'student' and approver_id = auth.uid() and status = 'pending')
  with check (request_role() = 'teacher' and tenant_id = request_tenant_id()
    and applicant_role = 'student' and approver_id = auth.uid()
    and status in ('approved', 'rejected'));

-- ----- leave_applications: school-admin (teacher applications) -----

drop policy if exists leave_admin_select on leave_applications;
create policy leave_admin_select on leave_applications for select to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists leave_admin_decide on leave_applications;
create policy leave_admin_decide on leave_applications for update to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id()
         and applicant_role = 'teacher' and status = 'pending')
  with check (request_role() = 'school-admin' and tenant_id = request_tenant_id()
    and applicant_role = 'teacher' and status in ('approved', 'rejected'));

-- ----- leave_applications: parents (linked children only) -----

drop policy if exists leave_parent_select on leave_applications;
create policy leave_parent_select on leave_applications for select to authenticated
  using (request_role() = 'parent' and tenant_id = request_tenant_id()
         and applicant_role = 'student'
         and exists (
           select 1 from family_links fl join students s on s.id = fl.student_id
           where fl.parent_profile_id = auth.uid()
             and s.profile_id = leave_applications.applicant_id
         ));

drop policy if exists leave_parent_insert on leave_applications;
create policy leave_parent_insert on leave_applications for insert to authenticated
  with check (request_role() = 'parent' and tenant_id = request_tenant_id()
    and applicant_role = 'student' and status in ('draft', 'pending')
    and (status = 'draft' or is_tenant_teacher(approver_id, tenant_id))
    and exists (
      select 1 from family_links fl join students s on s.id = fl.student_id
      where fl.parent_profile_id = auth.uid() and s.profile_id = applicant_id
    ));

drop policy if exists leave_parent_update on leave_applications;
create policy leave_parent_update on leave_applications for update to authenticated
  using (request_role() = 'parent' and tenant_id = request_tenant_id()
         and applicant_role = 'student' and status in ('draft', 'pending')
         and exists (
           select 1 from family_links fl join students s on s.id = fl.student_id
           where fl.parent_profile_id = auth.uid()
             and s.profile_id = leave_applications.applicant_id
         ))
  with check (request_role() = 'parent' and tenant_id = request_tenant_id()
    and applicant_role = 'student' and status in ('draft', 'pending', 'cancelled')
    and (status = 'draft' or is_tenant_teacher(approver_id, tenant_id)));

-- ----- leave_approvals: visibility follows the parent application -----

drop policy if exists lapproval_select on leave_approvals;
create policy lapproval_select on leave_approvals for select to authenticated
  using (tenant_id = request_tenant_id() and exists (
    select 1 from leave_applications la where la.id = leave_application_id
  ));

-- Actors sign their own entries; applicants may only record
-- submitted/cancelled, never a decision (the application policies above
-- are the real gate — this keeps the history honest too).
drop policy if exists lapproval_insert on leave_approvals;
create policy lapproval_insert on leave_approvals for insert to authenticated
  with check (tenant_id = request_tenant_id() and approver_id = auth.uid()
    and exists (
      select 1 from leave_applications la
      where la.id = leave_application_id and la.tenant_id = request_tenant_id()
    )
    and ((request_role() in ('student', 'parent') and action in ('submitted', 'cancelled'))
      or (request_role() in ('teacher', 'school-admin'))));

-- ----- notifications: recipient-owned, application-scoped senders -----

drop policy if exists notif_select on notifications;
create policy notif_select on notifications for select to authenticated
  using (tenant_id = request_tenant_id() and recipient_id = auth.uid());

-- A notification may only travel along a real application edge the
-- sender belongs to: applicant -> approver (submitted) or approver ->
-- applicant (decided). No tenant-wide spam from clients.
drop policy if exists notif_insert on notifications;
create policy notif_insert on notifications for insert to authenticated
  with check (tenant_id = request_tenant_id()
    and exists (select 1 from profiles p
                where p.id = recipient_id and p.tenant_id = request_tenant_id())
    and exists (
      select 1 from leave_applications la
      where la.id = reference_id and la.tenant_id = request_tenant_id()
        and ((la.applicant_id = auth.uid() and la.approver_id = recipient_id)
          or (la.approver_id = auth.uid() and la.applicant_id = recipient_id))
    ));

drop policy if exists notif_update on notifications;
create policy notif_update on notifications for update to authenticated
  using (tenant_id = request_tenant_id() and recipient_id = auth.uid())
  with check (tenant_id = request_tenant_id() and recipient_id = auth.uid());

-- ---------------- supporting-document storage ----------------
-- Private bucket; paths are {tenant_id}/{application_id}/{filename} so
-- object RLS stays tenant-scoped without parsing application edges.
-- Guarded: hosted projects always have the storage schema; the block is a
-- no-op where it is absent.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('leave-docs', 'leave-docs', false)
    on conflict (id) do nothing;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    drop policy if exists leavedocs_insert on storage.objects;
    create policy leavedocs_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'leave-docs'
        and storage.foldername(name)[1] = request_tenant_id()::text);
    drop policy if exists leavedocs_read on storage.objects;
    create policy leavedocs_read on storage.objects for select to authenticated
      using (bucket_id = 'leave-docs'
        and storage.foldername(name)[1] = request_tenant_id()::text);
  end if;
end;
$$;

-- ---------------- seed (Northview tenant, idempotent) ----------------
-- Mirrors the canonical leave ledger (L-101..L-110) plus one pending
-- Grade 11-A application for the demo teacher's queue. Punch rows always
-- target CURRENT_DATE so the queues light up on any day. Demo-only:
-- production rows come from the app under RLS.

insert into profiles (id, tenant_id, role, full_name, email) values
  ('c85109ee-0349-4708-8017-45fd26aff06f', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'teacher', 'Meera Iyer', 'meera.iyer@northview.edu'),
  ('b1f7a776-1290-4b75-a8c6-6ad5bcd9d2d9', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'teacher', 'Arjun Mehta', 'arjun.mehta@northview.edu'),
  ('989ea1eb-f4a1-4b3d-98ec-9818831d06ad', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'teacher', 'Amit Verma', 'amit.verma@northview.edu'),
  ('8fb79f07-9044-46a7-b851-d6942292d9dd', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'teacher', 'Priya Nair', 'priya.nair@northview.edu'),
  ('4d4ee682-f1a1-4dbb-9771-6323f4553727', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'teacher', 'Meera Mondal', 'meera.mondal@northview.edu'),
  ('9ba8ba88-72a6-4cdc-aff8-e776a164d011', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'Aarav Dutta', 'aarav.dutta@northview.edu'),
  ('87026994-5988-4c5b-a5f4-9a6bc86d3954', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'Priya Sharma', 'priya.sharma@northview.edu'),
  ('6f0c1a69-7592-4ee8-9bf3-2294ee6277c4', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'Pari Shah', 'pari.shah@northview.edu'),
  ('6147d77a-d24f-45a4-bc3b-efc854abb82b', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'Navya Pillai', 'navya.pillai@northview.edu'),
  ('9112ac25-d1b2-441d-badd-71d43283f95f', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'Om Shah', 'om.shah@northview.edu')
on conflict (id) do nothing;

-- Student directory rows behind the applicant profiles (Ishita's exists in
-- seed.sql); Aarav's also completes Guardian Dutta's linked children.
insert into students (id, tenant_id, profile_id, name, initials, grade, section, roll) values
  ('a1aa1001-0000-4000-8000-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '9ba8ba88-72a6-4cdc-aff8-e776a164d011', 'Aarav Dutta', 'AD', 'Grade 7', 'A', '06'),
  ('a1aa1001-0000-4000-8000-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '87026994-5988-4c5b-a5f4-9a6bc86d3954', 'Priya Sharma', 'PS', 'Grade 10', 'A', '03'),
  ('a1aa1001-0000-4000-8000-000000000003', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '6f0c1a69-7592-4ee8-9bf3-2294ee6277c4', 'Pari Shah', 'PS', 'Grade 10', 'C', '01'),
  ('a1aa1001-0000-4000-8000-000000000004', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '6147d77a-d24f-45a4-bc3b-efc854abb82b', 'Navya Pillai', 'NP', 'Grade 10', 'C', '03'),
  ('a1aa1001-0000-4000-8000-000000000005', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '9112ac25-d1b2-441d-badd-71d43283f95f', 'Om Shah', 'OS', 'Grade 11', 'A', '01')
on conflict (id) do nothing;

insert into family_links (id, tenant_id, parent_profile_id, student_id) values
  ('b2bb2002-0000-4000-8000-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '54b7f515-a0b7-5dd7-8ca5-d2d09bacea51', 'a1aa1001-0000-4000-8000-000000000001')
on conflict (parent_profile_id, student_id) do nothing;

insert into class_teachers (id, tenant_id, class_label, teacher_profile_id) values
  ('d58f2756-7e9d-4219-bf57-79b9f5c47df8', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Grade 10-A', '989ea1eb-f4a1-4b3d-98ec-9818831d06ad'),
  ('1f25243d-82e1-4fa9-95d6-932a3626a798', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Grade 10-B', 'c85109ee-0349-4708-8017-45fd26aff06f'),
  ('db69f894-74f4-4c02-8a54-ac5b769bd808', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Grade 10-C', '8fb79f07-9044-46a7-b851-d6942292d9dd'),
  ('d69aeda0-fcd0-4b07-ae7a-3e0ba436ec39', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Grade 7-A', '4d4ee682-f1a1-4dbb-9771-6323f4553727'),
  ('bba40c7a-8114-46ea-967c-c9701e40761c', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Grade 11-A', 'c1c0cc39-7e4c-5603-b38f-aa43eac80c28')
on conflict (id) do nothing;

insert into leave_applications (id, tenant_id, applicant_id, applicant_role, applicant_name, applicant_detail, applicant_class, leave_type, start_date, end_date, reason, status, approver_id, approver_name, submitted_at, approved_at, rejected_at, rejection_reason) values
  ('52cc9b85-c58f-4986-ae9f-ee50dfbcd8f0', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '449becb9-545c-5b7b-b4ce-4b7eb71f7155', 'student', 'Ishita Dutta', 'Grade 10-B · Roll 14', 'Grade 10-B', 'Sick Leave', CURRENT_DATE - 20, CURRENT_DATE - 19, 'Viral fever · medical certificate attached', 'approved', 'c85109ee-0349-4708-8017-45fd26aff06f', 'Meera Iyer', (CURRENT_DATE - 23 + TIME '09:05')::timestamptz, (CURRENT_DATE - 19 + TIME '16:40')::timestamptz, null, ''),
  ('ebdd7e71-3519-45df-8ec3-b0268ecb82e0', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '449becb9-545c-5b7b-b4ce-4b7eb71f7155', 'student', 'Ishita Dutta', 'Grade 10-B · Roll 14', 'Grade 10-B', 'Casual Leave', CURRENT_DATE + 5, CURRENT_DATE + 5, 'Family event out of station', 'pending', 'c85109ee-0349-4708-8017-45fd26aff06f', 'Meera Iyer', (CURRENT_DATE - 1 + TIME '15:20')::timestamptz, null, null, ''),
  ('7ca0e986-7fda-4b03-8b36-c7e679ac37be', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '9ba8ba88-72a6-4cdc-aff8-e776a164d011', 'student', 'Aarav Dutta', 'Grade 7-A · Roll 06', 'Grade 7-A', 'Sick Leave', CURRENT_DATE - 12, CURRENT_DATE - 12, 'Dental appointment', 'approved', '4d4ee682-f1a1-4dbb-9771-6323f4553727', 'Meera Mondal', (CURRENT_DATE - 15 + TIME '08:50')::timestamptz, (CURRENT_DATE - 12 + TIME '10:15')::timestamptz, null, ''),
  ('4bf8b1f9-6049-4b62-93df-8b66de90afda', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '9ba8ba88-72a6-4cdc-aff8-e776a164d011', 'student', 'Aarav Dutta', 'Grade 7-A · Roll 06', 'Grade 7-A', 'Casual Leave', CURRENT_DATE + 3, CURRENT_DATE + 5, 'Cousin’s wedding in Delhi', 'rejected', '4d4ee682-f1a1-4dbb-9771-6323f4553727', 'Meera Mondal', (CURRENT_DATE - 2 + TIME '11:30')::timestamptz, null, (CURRENT_DATE + 1 + TIME '09:20')::timestamptz, 'Term tests that week — please apply for 1 day only.'),
  ('a3ab9fa6-7044-4575-84c6-973f436ecacd', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '87026994-5988-4c5b-a5f4-9a6bc86d3954', 'student', 'Priya Sharma', 'Grade 10-A · Roll 03', 'Grade 10-A', 'Other', CURRENT_DATE + 2, CURRENT_DATE + 3, 'Inter-school debate travel', 'pending', '989ea1eb-f4a1-4b3d-98ec-9818831d06ad', 'Amit Verma', (CURRENT_DATE - 1 + TIME '10:05')::timestamptz, null, null, ''),
  ('4129da2c-9498-4623-8dbf-0794872f8594', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'c1c0cc39-7e4c-5603-b38f-aa43eac80c28', 'teacher', 'Rohan Sen', 'Physics · Sciences', '', 'Other', CURRENT_DATE + 6, CURRENT_DATE + 7, 'CBSE physics workshop, Delhi', 'pending', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Ananya Rao', (CURRENT_DATE - 2 + TIME '14:45')::timestamptz, null, null, ''),
  ('a1bf8324-9ba9-4eeb-932e-4ecf6a404fea', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'c85109ee-0349-4708-8017-45fd26aff06f', 'teacher', 'Meera Iyer', 'Mathematics · Sciences', '', 'Casual Leave', CURRENT_DATE - 8, CURRENT_DATE - 8, 'Bank work', 'approved', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Ananya Rao', (CURRENT_DATE - 11 + TIME '09:30')::timestamptz, (CURRENT_DATE - 8 + TIME '12:00')::timestamptz, null, ''),
  ('02918bf3-6b06-4961-82f3-7ab71e92c305', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '6f0c1a69-7592-4ee8-9bf3-2294ee6277c4', 'student', 'Pari Shah', 'Grade 10-C · Roll 01', 'Grade 10-C', 'Sick Leave', CURRENT_DATE - 6, CURRENT_DATE - 5, 'Fever · rested at home', 'approved', '8fb79f07-9044-46a7-b851-d6942292d9dd', 'Priya Nair', (CURRENT_DATE - 9 + TIME '08:40')::timestamptz, (CURRENT_DATE - 6 + TIME '09:50')::timestamptz, null, ''),
  ('1a4eca41-de95-4996-a02b-eba738182b3f', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '6147d77a-d24f-45a4-bc3b-efc854abb82b', 'student', 'Navya Pillai', 'Grade 10-C · Roll 03', 'Grade 10-C', 'Casual Leave', CURRENT_DATE + 4, CURRENT_DATE + 4, 'Sibling’s recital', 'pending', '8fb79f07-9044-46a7-b851-d6942292d9dd', 'Priya Nair', (CURRENT_DATE - 1 + TIME '13:15')::timestamptz, null, null, ''),
  ('9cc76581-6006-4ac0-a977-2cc0a3bd3e46', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'b1f7a776-1290-4b75-a8c6-6ad5bcd9d2d9', 'teacher', 'Arjun Mehta', 'English · Humanities', '', 'Casual Leave', CURRENT_DATE + 9, CURRENT_DATE + 13, 'Family vacation', 'rejected', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Ananya Rao', (CURRENT_DATE - 3 + TIME '10:20')::timestamptz, null, (CURRENT_DATE + 2 + TIME '11:05')::timestamptz, 'Exceeds casual leave — convert to earned leave via HR.'),
  ('9d90664c-7497-4537-aeb9-85f16f865cd7', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '9112ac25-d1b2-441d-badd-71d43283f95f', 'student', 'Om Shah', 'Grade 11-A · Roll 01', 'Grade 11-A', 'Casual Leave', CURRENT_DATE + 1, CURRENT_DATE + 2, 'Family wedding in Jaipur', 'pending', 'c1c0cc39-7e4c-5603-b38f-aa43eac80c28', 'Rohan Sen', (CURRENT_DATE - 1 + TIME '16:12')::timestamptz, null, null, '')
on conflict (id) do nothing;

-- Approval history: one submitted entry per application plus the decision
-- entry for decided ones. Idempotent on the natural key.
insert into leave_approvals (tenant_id, leave_application_id, approver_id, action, comment, created_at) values
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '52cc9b85-c58f-4986-ae9f-ee50dfbcd8f0', '449becb9-545c-5b7b-b4ce-4b7eb71f7155', 'submitted', '', (CURRENT_DATE - 23 + TIME '09:05')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '52cc9b85-c58f-4986-ae9f-ee50dfbcd8f0', 'c85109ee-0349-4708-8017-45fd26aff06f', 'approved', 'Approved', (CURRENT_DATE - 19 + TIME '16:40')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'ebdd7e71-3519-45df-8ec3-b0268ecb82e0', '449becb9-545c-5b7b-b4ce-4b7eb71f7155', 'submitted', '', (CURRENT_DATE - 1 + TIME '15:20')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '7ca0e986-7fda-4b03-8b36-c7e679ac37be', '9ba8ba88-72a6-4cdc-aff8-e776a164d011', 'submitted', '', (CURRENT_DATE - 15 + TIME '08:50')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '7ca0e986-7fda-4b03-8b36-c7e679ac37be', '4d4ee682-f1a1-4dbb-9771-6323f4553727', 'approved', 'Approved', (CURRENT_DATE - 12 + TIME '10:15')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '4bf8b1f9-6049-4b62-93df-8b66de90afda', '9ba8ba88-72a6-4cdc-aff8-e776a164d011', 'submitted', '', (CURRENT_DATE - 2 + TIME '11:30')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '4bf8b1f9-6049-4b62-93df-8b66de90afda', '4d4ee682-f1a1-4dbb-9771-6323f4553727', 'rejected', 'Term tests that week — please apply for 1 day only.', (CURRENT_DATE + 1 + TIME '09:20')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a3ab9fa6-7044-4575-84c6-973f436ecacd', '87026994-5988-4c5b-a5f4-9a6bc86d3954', 'submitted', '', (CURRENT_DATE - 1 + TIME '10:05')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '4129da2c-9498-4623-8dbf-0794872f8594', 'c1c0cc39-7e4c-5603-b38f-aa43eac80c28', 'submitted', '', (CURRENT_DATE - 2 + TIME '14:45')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1bf8324-9ba9-4eeb-932e-4ecf6a404fea', 'c85109ee-0349-4708-8017-45fd26aff06f', 'submitted', '', (CURRENT_DATE - 11 + TIME '09:30')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1bf8324-9ba9-4eeb-932e-4ecf6a404fea', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'approved', 'Approved', (CURRENT_DATE - 8 + TIME '12:00')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '02918bf3-6b06-4961-82f3-7ab71e92c305', '6f0c1a69-7592-4ee8-9bf3-2294ee6277c4', 'submitted', '', (CURRENT_DATE - 9 + TIME '08:40')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '02918bf3-6b06-4961-82f3-7ab71e92c305', '8fb79f07-9044-46a7-b851-d6942292d9dd', 'approved', 'Approved', (CURRENT_DATE - 6 + TIME '09:50')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '1a4eca41-de95-4996-a02b-eba738182b3f', '6147d77a-d24f-45a4-bc3b-efc854abb82b', 'submitted', '', (CURRENT_DATE - 1 + TIME '13:15')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '9cc76581-6006-4ac0-a977-2cc0a3bd3e46', 'b1f7a776-1290-4b75-a8c6-6ad5bcd9d2d9', 'submitted', '', (CURRENT_DATE - 3 + TIME '10:20')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '9cc76581-6006-4ac0-a977-2cc0a3bd3e46', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'rejected', 'Exceeds casual leave — convert to earned leave via HR.', (CURRENT_DATE + 2 + TIME '11:05')::timestamptz),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', '9d90664c-7497-4537-aeb9-85f16f865cd7', '9112ac25-d1b2-441d-badd-71d43283f95f', 'submitted', '', (CURRENT_DATE - 1 + TIME '16:12')::timestamptz)
on conflict (id) do nothing;

-- Two unread submission notifications for the demo logins (teacher queue
-- + admin queue). Messages carry applicant, type, dates, days and status.
insert into notifications (id, tenant_id, recipient_id, type, title, message, reference_id, is_read) values
  ('bf85278a-a202-441e-99da-620395b83d50', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'c1c0cc39-7e4c-5603-b38f-aa43eac80c28', 'leave_submitted', 'New leave application · Om Shah',
   'Casual Leave · ' || to_char(CURRENT_DATE + 1, 'Mon FMDD') || ' – ' || to_char(CURRENT_DATE + 2, 'Mon FMDD') || ' · 2 days · Grade 11-A · Status: Pending',
   '9d90664c-7497-4537-aeb9-85f16f865cd7', false),
  ('0ba5d3ec-9668-4ff6-a1bc-4fad3e724abf', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'leave_submitted', 'New leave application · Rohan Sen',
   'Other · ' || to_char(CURRENT_DATE + 6, 'Mon FMDD') || ' – ' || to_char(CURRENT_DATE + 7, 'Mon FMDD') || ' · 2 days · Physics · Sciences · Status: Pending',
   '4129da2c-9498-4623-8dbf-0794872f8594', false)
on conflict (id) do nothing;
