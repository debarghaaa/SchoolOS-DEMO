-- SchoolOS maintenance feed (Supabase Postgres).
--
-- Facilities, maintenance requests and scheduled tasks behind the Overview
-- maintenance summary card and the dedicated /maintenance hero page.
-- Same tenancy contract as the presence feed: every row carries tenant_id,
-- browsers authenticate with the backend-minted feed JWT (app_metadata:
-- tenant_id, role, classes), and RLS — never the UI — is the enforcement
-- layer. Unlike the presence feed, school-admins hold client write
-- policies here (the page manages requests directly); every write is still
-- tenant-scoped and role-gated in Postgres.
--
-- Apply order: schema.sql -> policies.sql -> maintenance.sql -> seed.sql.

-- ---------------- tables ----------------

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  kind text not null default 'Other',
  status text not null default 'operational'
    check (status in ('operational', 'maintenance_required', 'under_maintenance', 'unavailable')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create index if not exists ix_facilities_tenant on facilities (tenant_id);

create table if not exists maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null,
  location text not null default '',
  category text not null default 'General',
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'completed')),
  reported_at timestamptz not null default now(),
  assigned_staff text not null default '',
  expected_completion date null,
  completed_at timestamptz null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_mreq_tenant_status on maintenance_requests (tenant_id, status);
create index if not exists ix_mreq_tenant_priority on maintenance_requests (tenant_id, priority);

create table if not exists maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  task text not null,
  location text not null default '',
  category text not null default 'General',
  scheduled_date date not null,
  assigned_staff text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  completed_at timestamptz null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_mtask_tenant_date on maintenance_tasks (tenant_id, scheduled_date);

-- ---------------- updated_at + realtime ----------------

drop trigger if exists trg_facilities_touch on facilities;
create trigger trg_facilities_touch before update on facilities
  for each row execute function touch_updated_at();
drop trigger if exists trg_mreq_touch on maintenance_requests;
create trigger trg_mreq_touch before update on maintenance_requests
  for each row execute function touch_updated_at();
drop trigger if exists trg_mtask_touch on maintenance_tasks;
create trigger trg_mtask_touch before update on maintenance_tasks
  for each row execute function touch_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table facilities;
    alter publication supabase_realtime add table maintenance_requests;
    alter publication supabase_realtime add table maintenance_tasks;
  end if;
exception when duplicate_object then
  null;
end;
$$;

-- ---------------- RLS ----------------
-- Admin: full management, tenant-scoped. Teacher: school-wide read (status
-- boards, no controls). Student/parent: no policies — zero rows, and the
-- UI prunes the route entirely. Writes carry WITH CHECK so a client can
-- neither insert into, nor move a row to, another tenant.

alter table facilities enable row level security;
alter table maintenance_requests enable row level security;
alter table maintenance_tasks enable row level security;

grant select, insert, update, delete
  on facilities, maintenance_requests, maintenance_tasks to authenticated;

drop policy if exists facilities_admin_all on facilities;
create policy facilities_admin_all on facilities for all to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id())
  with check (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists facilities_teacher_read on facilities;
create policy facilities_teacher_read on facilities for select to authenticated
  using (request_role() = 'teacher' and tenant_id = request_tenant_id());

drop policy if exists mreq_admin_all on maintenance_requests;
create policy mreq_admin_all on maintenance_requests for all to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id())
  with check (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists mreq_teacher_read on maintenance_requests;
create policy mreq_teacher_read on maintenance_requests for select to authenticated
  using (request_role() = 'teacher' and tenant_id = request_tenant_id());

drop policy if exists mtask_admin_all on maintenance_tasks;
create policy mtask_admin_all on maintenance_tasks for all to authenticated
  using (request_role() = 'school-admin' and tenant_id = request_tenant_id())
  with check (request_role() = 'school-admin' and tenant_id = request_tenant_id());

drop policy if exists mtask_teacher_read on maintenance_tasks;
create policy mtask_teacher_read on maintenance_tasks for select to authenticated
  using (request_role() = 'teacher' and tenant_id = request_tenant_id());

-- ---------------- seed (Northview tenant, idempotent) ----------------

insert into facilities (id, tenant_id, name, kind, status, note) values
  ('f0000001-0000-4000-8000-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Main Building', 'Building', 'operational', ''),
  ('f0000001-0000-4000-8000-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Classroom Block A', 'Classrooms', 'operational', ''),
  ('f0000001-0000-4000-8000-000000000003', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Science Laboratories', 'Laboratories', 'maintenance_required', 'Fume hood service due'),
  ('f0000001-0000-4000-8000-000000000004', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Central Library', 'Library', 'operational', ''),
  ('f0000001-0000-4000-8000-000000000005', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Ground Floor Restrooms', 'Restrooms', 'under_maintenance', 'Plumbing refit in progress'),
  ('f0000001-0000-4000-8000-000000000006', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Sports Complex', 'Sports facilities', 'operational', ''),
  ('f0000001-0000-4000-8000-000000000007', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Electrical Systems', 'Electrical systems', 'operational', ''),
  ('f0000001-0000-4000-8000-000000000008', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'HVAC Plant', 'HVAC', 'maintenance_required', 'Filter replacement overdue'),
  ('f0000001-0000-4000-8000-000000000009', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Auditorium', 'Other school facilities', 'operational', '')
on conflict (id) do nothing;

insert into maintenance_requests (id, tenant_id, title, location, category, priority, status, assigned_staff, expected_completion, description) values
  ('e0000001-0000-4000-8000-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Burst pipe in ground floor restroom', 'Ground Floor Restrooms', 'Plumbing', 'critical', 'in_progress', 'Farhan Ali', CURRENT_DATE + 1, 'Water supply isolated; refit underway.'),
  ('e0000001-0000-4000-8000-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Chemistry lab fume hood not extracting', 'Science Laboratories', 'HVAC', 'high', 'open', '', CURRENT_DATE + 3, 'Hood 2 airflow below threshold.'),
  ('e0000001-0000-4000-8000-000000000003', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Flickering lights in Classroom Block A', 'Classroom Block A', 'Electrical', 'medium', 'open', 'Dipak Mondal', CURRENT_DATE + 5, 'Rooms A-4 and A-6 affected.'),
  ('e0000001-0000-4000-8000-000000000004', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Library air-conditioning weak', 'Central Library', 'HVAC', 'medium', 'in_progress', 'Farhan Ali', CURRENT_DATE + 2, 'Compressor service scheduled.'),
  ('e0000001-0000-4000-8000-000000000005', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Sports field irrigation leak', 'Sports Complex', 'Plumbing', 'low', 'open', '', CURRENT_DATE + 9, 'North-east corner sprinkler line.')
on conflict (id) do nothing;

insert into maintenance_tasks (id, tenant_id, task, location, category, scheduled_date, assigned_staff, status, notes) values
  ('d0000001-0000-4000-8000-000000000001', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Quarterly fire extinguisher inspection', 'Main Building', 'Safety', CURRENT_DATE + 4, 'Ramesh Kumar', 'scheduled', 'All floors.'),
  ('d0000001-0000-4000-8000-000000000002', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'HVAC filter replacement', 'HVAC Plant', 'HVAC', CURRENT_DATE + 6, 'Farhan Ali', 'scheduled', ''),
  ('d0000001-0000-4000-8000-000000000003', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Playground equipment safety check', 'Sports Complex', 'Civil', CURRENT_DATE + 11, '', 'scheduled', '')
on conflict (id) do nothing;
