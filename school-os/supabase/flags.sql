-- =====================================================================
-- SchoolOS student notes & flags (Supabase)
--
-- One canonical record per note/flag: admins create and manage;
-- teachers, students and parents read the SAME rows through RLS
-- (visibility + class/link scoping). No per-role copies anywhere.
--
-- Tables: student_notes, student_flags, student_note_flag_history.
-- Depends on: schema.sql (profiles/students/family_links), policies.sql
-- (request_* helpers), leave.sql (notifications + class_teachers).
-- History follows its parent record: if you can read the note/flag,
-- you can read its history. No DELETE policies: resolved/archived rows
-- stay as permanent history.
-- =====================================================================

-- ---------------- tables ----------------

create table if not exists student_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null references students (id) on delete cascade,
  created_by uuid not null references profiles (id),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'General'
    check (category in ('Academic', 'Attendance', 'Behavior', 'Wellbeing', 'Administrative', 'General')),
  priority text not null default 'Low' check (priority in ('Low', 'Medium', 'High')),
  visibility text not null default 'all'
    check (visibility in ('all', 'teacher_parent', 'teacher_only')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_notes_student on student_notes (tenant_id, student_id, status);

create table if not exists student_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null references students (id) on delete cascade,
  created_by uuid not null references profiles (id),
  title text not null check (char_length(title) between 1 and 120),
  reason text not null default '' check (char_length(reason) <= 2000),
  category text not null default 'Other'
    check (category in ('Academic Concern', 'Attendance Concern', 'Behavior Concern',
                        'Wellbeing Concern', 'Administrative Concern', 'Other')),
  severity text not null default 'Low' check (severity in ('Low', 'Medium', 'High', 'Critical')),
  visibility text not null default 'all'
    check (visibility in ('all', 'teacher_parent', 'teacher_only')),
  status text not null default 'active' check (status in ('active', 'resolved')),
  resolved_by uuid null references profiles (id),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null))
);
create index if not exists ix_flags_student on student_flags (tenant_id, student_id, status);
create index if not exists ix_flags_severity on student_flags (tenant_id, status, severity);

create table if not exists student_note_flag_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  record_id uuid not null,
  record_type text not null check (record_type in ('note', 'flag')),
  action text not null check (action in ('created', 'updated', 'resolved', 'archived')),
  performed_by uuid not null references profiles (id),
  previous_value text not null default '',
  new_value text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_nfhistory_record on student_note_flag_history (tenant_id, record_id, created_at);

-- ---------------- triggers + realtime ----------------

drop trigger if exists trg_notes_touch on student_notes;
create trigger trg_notes_touch before update on student_notes
  for each row execute function touch_updated_at();

drop trigger if exists trg_flags_touch on student_flags;
create trigger trg_flags_touch before update on student_flags
  for each row execute function touch_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table student_notes;
    alter publication supabase_realtime add table student_flags;
    alter publication supabase_realtime add table student_note_flag_history;
  end if;
exception when duplicate_object then
  null;
end;
$$;

-- ---------------- RLS ----------------

alter table student_notes enable row level security;
alter table student_flags enable row level security;
alter table student_note_flag_history enable row level security;

grant select, insert, update on student_notes, student_flags, student_note_flag_history to authenticated;

-- Admins: full management inside their tenant. No deletes anywhere.
drop policy if exists notes_admin_all on student_notes;
create policy notes_admin_all on student_notes for all to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'school-admin')
  with check (tenant_id = request_tenant_id() and request_role() = 'school-admin'
    and created_by = auth.uid());

drop policy if exists flags_admin_all on student_flags;
create policy flags_admin_all on student_flags for all to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'school-admin')
  with check (tenant_id = request_tenant_id() and request_role() = 'school-admin'
    and created_by = auth.uid()
    and (resolved_by is null or resolved_by = auth.uid()));

-- Teachers: assigned classes only. Every visibility level includes
-- teachers, so no visibility predicate is needed here.
drop policy if exists notes_teacher_read on student_notes;
create policy notes_teacher_read on student_notes for select to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'teacher'
    and exists (
      select 1 from students s
      where s.id = student_id and s.tenant_id = request_tenant_id()
        and request_classes() ? (s.grade || '-' || s.section)
    ));

drop policy if exists flags_teacher_read on student_flags;
create policy flags_teacher_read on student_flags for select to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'teacher'
    and exists (
      select 1 from students s
      where s.id = student_id and s.tenant_id = request_tenant_id()
        and request_classes() ? (s.grade || '-' || s.section)
    ));

-- Students: own rows, student-visible only.
drop policy if exists notes_student_read on student_notes;
create policy notes_student_read on student_notes for select to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'student'
    and visibility = 'all'
    and exists (
      select 1 from students s
      where s.id = student_id and s.tenant_id = request_tenant_id()
        and s.profile_id = auth.uid()
    ));

drop policy if exists flags_student_read on student_flags;
create policy flags_student_read on student_flags for select to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'student'
    and visibility = 'all'
    and exists (
      select 1 from students s
      where s.id = student_id and s.tenant_id = request_tenant_id()
        and s.profile_id = auth.uid()
    ));

-- Parents: linked children, parent-visible only.
drop policy if exists notes_parent_read on student_notes;
create policy notes_parent_read on student_notes for select to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'parent'
    and visibility in ('all', 'teacher_parent')
    and exists (
      select 1 from family_links fl
      where fl.student_id = student_notes.student_id
        and fl.parent_profile_id = auth.uid()
        and fl.tenant_id = request_tenant_id()
    ));

drop policy if exists flags_parent_read on student_flags;
create policy flags_parent_read on student_flags for select to authenticated
  using (tenant_id = request_tenant_id() and request_role() = 'parent'
    and visibility in ('all', 'teacher_parent')
    and exists (
      select 1 from family_links fl
      where fl.student_id = student_flags.student_id
        and fl.parent_profile_id = auth.uid()
        and fl.tenant_id = request_tenant_id()
    ));

-- History follows its parent record (inner selects obey RLS).
drop policy if exists nfhistory_select on student_note_flag_history;
create policy nfhistory_select on student_note_flag_history for select to authenticated
  using (tenant_id = request_tenant_id() and (
    (record_type = 'note' and exists (
      select 1 from student_notes n where n.id = record_id
    ))
    or (record_type = 'flag' and exists (
      select 1 from student_flags f where f.id = record_id
    ))
  ));

drop policy if exists nfhistory_insert on student_note_flag_history;
create policy nfhistory_insert on student_note_flag_history for insert to authenticated
  with check (tenant_id = request_tenant_id() and request_role() = 'school-admin'
    and performed_by = auth.uid()
    and (
      (record_type = 'note' and exists (
        select 1 from student_notes n
        where n.id = record_id and n.tenant_id = request_tenant_id()
      ))
      or (record_type = 'flag' and exists (
        select 1 from student_flags f
        where f.id = record_id and f.tenant_id = request_tenant_id()
      ))
    ));

-- ---------------- notifications: note/flag edges ----------------
-- The shared inbox (leave.sql) only knew leave edges. Extend its type
-- check and insert policy so admin-created notes/flags can notify exactly
-- the users authorized to view them: the class teacher, plus the visible
-- student and linked parents.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('leave_submitted', 'leave_approved', 'leave_rejected', 'leave_cancelled',
                  'note_created', 'flag_created', 'flag_resolved'));

drop policy if exists notif_insert on notifications;
create policy notif_insert on notifications for insert to authenticated
  with check (tenant_id = request_tenant_id()
    and exists (select 1 from profiles p
                where p.id = recipient_id and p.tenant_id = request_tenant_id())
    and (
      exists (
        select 1 from leave_applications la
        where la.id = reference_id and la.tenant_id = request_tenant_id()
          and ((la.applicant_id = auth.uid() and la.approver_id = recipient_id)
            or (la.approver_id = auth.uid() and la.applicant_id = recipient_id))
      )
      or exists (
        select 1 from student_flags f join students s on s.id = f.student_id
        where f.id = reference_id and f.tenant_id = request_tenant_id()
          and (f.created_by = auth.uid() or f.resolved_by = auth.uid())
          and (
            exists (select 1 from class_teachers ct
                    where ct.tenant_id = request_tenant_id()
                      and ct.class_label = s.grade || '-' || s.section
                      and ct.teacher_profile_id = recipient_id)
            or (f.visibility = 'all' and s.profile_id = recipient_id)
            or (f.visibility in ('all', 'teacher_parent') and exists (
                  select 1 from family_links fl
                  where fl.student_id = s.id and fl.parent_profile_id = recipient_id
                    and fl.tenant_id = request_tenant_id()))
          )
      )
      or exists (
        select 1 from student_notes n join students s on s.id = n.student_id
        where n.id = reference_id and n.tenant_id = request_tenant_id()
          and n.created_by = auth.uid()
          and (
            exists (select 1 from class_teachers ct
                    where ct.tenant_id = request_tenant_id()
                      and ct.class_label = s.grade || '-' || s.section
                      and ct.teacher_profile_id = recipient_id)
            or (n.visibility = 'all' and s.profile_id = recipient_id)
            or (n.visibility in ('all', 'teacher_parent') and exists (
                  select 1 from family_links fl
                  where fl.student_id = s.id and fl.parent_profile_id = recipient_id
                    and fl.tenant_id = request_tenant_id()))
          )
      )
    ));

-- ---------------- seed (Northview tenant, idempotent) ----------------
-- Mirrors the demo dataset: four flags (incl. one critical + one
-- resolved) and four notes (incl. one archived, one teacher-only).

insert into student_flags (id, tenant_id, student_id, created_by, title, reason, category, severity, visibility, status, created_at) values
  ('f1a90002-2002-4002-8002-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1aa1001-0000-4000-8000-000000000005', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Repeated late arrivals', 'Late to first period 6 times this month — spoke to parents, monitoring for two weeks.', 'Attendance Concern', 'High', 'all', 'active', (CURRENT_DATE - 6 + TIME '10:30')::timestamptz),
  ('f1a90002-2002-4002-8002-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1aa1001-0000-4000-8000-000000000002', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Playground altercation at lunch', 'Pushed a junior during break play; both students counselled, parents informed.', 'Behavior Concern', 'Medium', 'teacher_parent', 'active', (CURRENT_DATE - 3 + TIME '14:05')::timestamptz),
  ('f1a90002-2002-4002-8002-000000000003', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'bb22cc33-dd44-4e55-8f66-aa7788990011', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Sudden drop in Mathematics scores', 'Unit test average fell from 92 to 61 — tutor sessions arranged twice a week.', 'Academic Concern', 'Critical', 'all', 'active', (CURRENT_DATE - 2 + TIME '09:15')::timestamptz),
  ('f1a90002-2002-4002-8002-000000000004', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1aa1001-0000-4000-8000-000000000004', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Incomplete homework streak', 'Missed three consecutive maths assignments; catch-up plan completed.', 'Academic Concern', 'Low', 'all', 'resolved', (CURRENT_DATE - 12 + TIME '11:00')::timestamptz)
on conflict (id) do nothing;

update student_flags
set resolved_by = '6d85a525-1495-5ba0-ad64-35b8ab43d322',
    resolved_at = (CURRENT_DATE - 9 + TIME '16:20')::timestamptz
where id = 'f1a90002-2002-4002-8002-000000000004' and resolved_at is null;

insert into student_notes (id, tenant_id, student_id, created_by, title, description, category, priority, visibility, status, created_at) values
  ('f1a90001-1001-4001-8001-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'bb22cc33-dd44-4e55-8f66-aa7788990011', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Library reading goal met', 'Finished the Term 2 reading list two weeks early — recommended for the book club showcase.', 'Academic', 'Low', 'all', 'active', (CURRENT_DATE - 5 + TIME '13:40')::timestamptz),
  ('f1a90001-1001-4001-8001-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1aa1001-0000-4000-8000-000000000001', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Counsellor check-in scheduled', 'Fortnightly wellbeing check-ins with the school counsellor starting next week.', 'Wellbeing', 'Medium', 'teacher_parent', 'active', (CURRENT_DATE - 4 + TIME '10:00')::timestamptz),
  ('f1a90001-1001-4001-8001-000000000003', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1aa1001-0000-4000-8000-000000000003', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Bus route change request', 'Family requested a move from route 4 to route 7 from next month — transport desk notified.', 'Administrative', 'Low', 'teacher_only', 'active', (CURRENT_DATE - 7 + TIME '15:25')::timestamptz),
  ('f1a90001-1001-4001-8001-000000000004', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'a1aa1001-0000-4000-8000-000000000005', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Science exhibition volunteer', 'Helped set up the physics stall at the winter exhibition.', 'General', 'Low', 'all', 'archived', (CURRENT_DATE - 20 + TIME '12:10')::timestamptz)
on conflict (id) do nothing;

insert into student_note_flag_history (id, tenant_id, record_id, record_type, action, performed_by, previous_value, new_value, created_at) values
  ('f1a90003-3003-4003-8003-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90002-2002-4002-8002-000000000001', 'flag', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 6 + TIME '10:30')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90002-2002-4002-8002-000000000002', 'flag', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 3 + TIME '14:05')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000003', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90002-2002-4002-8002-000000000003', 'flag', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 2 + TIME '09:15')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000004', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90002-2002-4002-8002-000000000004', 'flag', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 12 + TIME '11:00')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000005', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90002-2002-4002-8002-000000000004', 'flag', 'resolved', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Active', 'Resolved', (CURRENT_DATE - 9 + TIME '16:20')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000006', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90001-1001-4001-8001-000000000001', 'note', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 5 + TIME '13:40')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000007', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90001-1001-4001-8001-000000000002', 'note', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 4 + TIME '10:00')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000008', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90001-1001-4001-8001-000000000003', 'note', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 7 + TIME '15:25')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000009', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90001-1001-4001-8001-000000000004', 'note', 'created', '6d85a525-1495-5ba0-ad64-35b8ab43d322', '', 'Active', (CURRENT_DATE - 20 + TIME '12:10')::timestamptz),
  ('f1a90003-3003-4003-8003-000000000010', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'f1a90001-1001-4001-8001-000000000004', 'note', 'archived', '6d85a525-1495-5ba0-ad64-35b8ab43d322', 'Active', 'Archived', (CURRENT_DATE - 15 + TIME '09:45')::timestamptz)
on conflict (id) do nothing;

insert into notifications (id, tenant_id, recipient_id, type, title, message, reference_id, created_at) values
  ('f1a90004-4004-4004-8004-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'c1c0cc39-7e4c-5603-b38f-aa43eac80c28', 'flag_created', 'New flag · Om Shah', 'Repeated late arrivals · Attendance Concern · High · by Ananya Rao', 'f1a90002-2002-4002-8002-000000000001', (CURRENT_DATE - 6 + TIME '10:31')::timestamptz),
  ('f1a90004-4004-4004-8004-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '449becb9-545c-5b7b-b4ce-4b7eb71f7155', 'flag_created', 'New flag · Ishita Dutta', 'Sudden drop in Mathematics scores · Academic Concern · Critical · by Ananya Rao', 'f1a90002-2002-4002-8002-000000000003', (CURRENT_DATE - 2 + TIME '09:16')::timestamptz)
on conflict (id) do nothing;
