-- SchoolOS presence feed (Supabase Postgres).
--
-- A small, dedicated realtime database for the punch in/out feed behind the
-- Overview presence islands. It mirrors identity + roster rows from the
-- FastAPI school-api (which remains the system of record) and streams
-- today's punch events to browsers over Supabase Realtime.
--
-- Apply order: schema.sql -> policies.sql -> seed.sql (seed is demo-only).
-- Deploys should run these through the Supabase SQL editor or CLI
-- (`supabase db push`); nothing here depends on the FastAPI migrations.

-- Directory: one row per human that can appear in the feed. `id` follows the
-- GoTrue user id by convention but deliberately has NO foreign key to
-- auth.users: GoTrue owns that table, and the sync worker must be able to
-- upsert directory rows for users provisioned outside Supabase Auth.
create table if not exists profiles (
  id uuid primary key,
  tenant_id uuid not null,
  role text not null check (role in ('super-admin', 'school-admin', 'teacher', 'student', 'parent')),
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_profiles_tenant on profiles (tenant_id);

create table if not exists faculty (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  profile_id uuid null references profiles (id) on delete set null,
  name text not null,
  initials text not null,
  subject text not null default '',
  dept text not null default '',
  status text not null default 'active' check (status in ('active', 'leave')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_faculty_tenant on faculty (tenant_id);

create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  profile_id uuid null references profiles (id) on delete set null,
  name text not null,
  initials text not null,
  role text not null default '',
  dept text not null default '',
  staff_type text not null default 'Support Staff',
  status text not null default 'active' check (status in ('active', 'leave')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_staff_tenant on staff_members (tenant_id);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  profile_id uuid null references profiles (id) on delete set null,
  name text not null,
  initials text not null,
  grade text not null,
  section text not null,
  roll text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, grade, section, roll)
);
create index if not exists ix_students_tenant on students (tenant_id);
create index if not exists ix_students_class on students (tenant_id, grade, section);

-- Family links mirror the FastAPI parent_student table so parent-scoped
-- RLS can resolve "my children" without cross-database joins.
create table if not exists family_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  parent_profile_id uuid not null references profiles (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_profile_id, student_id)
);
create index if not exists ix_family_links_parent on family_links (parent_profile_id);

-- One row per person per day. `person_id` is polymorphic across
-- faculty/staff_members/students, so it intentionally has no FK; the
-- (tenant_id, audience, person_id, day) unique keeps the sync idempotent
-- and the realtime payload addressable.
create table if not exists presence_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  audience text not null check (audience in ('faculty', 'staff', 'student')),
  person_id uuid not null,
  day date not null default current_date,
  status text not null default 'absent' check (status in ('present', 'absent')),
  punch_in time null,
  punch_out time null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, audience, person_id, day)
);
create index if not exists ix_presence_today on presence_days (tenant_id, day, audience);
create index if not exists ix_presence_person on presence_days (tenant_id, audience, person_id, day desc);

-- Keep updated_at honest for realtime consumers (used as a tiebreak).
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on profiles;
create trigger trg_profiles_touch before update on profiles
  for each row execute function touch_updated_at();
drop trigger if exists trg_presence_touch on presence_days;
create trigger trg_presence_touch before update on presence_days
  for each row execute function touch_updated_at();

-- Stream punch events to subscribed browsers. Guarded so the file also
-- applies to projects where the publication was renamed or removed.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table presence_days;
  end if;
exception when duplicate_object then
  -- Table already a member; nothing to do.
  null;
end;
$$;
