-- SchoolOS ID verification: one credential row per student / faculty /
-- staff record. The QR printed on an ID card encodes ONLY the opaque
-- `token` (inside a /verify/<token> URL) — never names, contact details,
-- or any other profile field. Scanning resolves through the
-- SECURITY DEFINER `verify_id_token()` function, which returns a fixed
-- public-safe projection. No profile data is duplicated here.

create table if not exists id_tokens (
  school_id uuid not null,
  kind text not null check (kind in ('student', 'teacher', 'employee')),
  record_id uuid not null,
  token uuid not null default gen_random_uuid() unique,
  version integer not null default 1,
  issued_at timestamptz not null default now(),
  primary key (school_id, kind, record_id)
);
create index if not exists ix_id_tokens_token on id_tokens (token);

-- ---------------- RLS ----------------
-- Admins manage credentials; holders read only their own row by matching
-- the linked profile. Anonymous callers read NOTHING directly — public
-- verification goes through verify_id_token() below.

alter table id_tokens enable row level security;

drop policy if exists idtokens_admin on id_tokens;
create policy idtokens_admin on id_tokens for all to authenticated
  using (request_role() = 'school-admin' and school_id = request_tenant_id())
  with check (request_role() = 'school-admin' and school_id = request_tenant_id());

drop policy if exists idtokens_owner on id_tokens;
create policy idtokens_owner on id_tokens for select to authenticated
  using (
    school_id = request_tenant_id()
    and (
      (kind = 'student' and exists (
        select 1 from students s
        where s.id = record_id and s.profile_id = auth.uid()))
      or (kind = 'teacher' and exists (
        select 1 from faculty f
        where f.id = record_id and f.profile_id = auth.uid()))
    )
  );

-- ---------------- public verification ----------------
-- SECURITY DEFINER lookup by unguessable token. Returns ONLY the safe
-- projection: name, role, institutional label lines, school. No contact
-- fields, no notes, no history exist in the return type at all.

drop function if exists verify_id_token(uuid);

create function verify_id_token(p_token uuid)
returns table (
  school_id uuid,
  kind text,
  display_name text,
  line1 text,
  line2 text,
  version integer,
  verified boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select t.school_id, t.kind,
    coalesce(s.name, f.name, m.name),
    case t.kind
      when 'student' then s.grade || '-' || s.section || ' · Roll ' || s.roll
      when 'teacher' then nullif(f.subject || ' · ' || f.dept, ' · ')
      else nullif(m.role || ' · ' || m.dept, ' · ')
    end,
    case t.kind
      when 'student' then 'Student'
      when 'teacher' then 'Faculty'
      else coalesce(nullif(m.staff_type, ''), 'Staff')
    end,
    t.version,
    true
  from id_tokens t
  left join students s on s.id = t.record_id and t.kind = 'student'
  left join faculty f on f.id = t.record_id and t.kind = 'teacher'
  left join staff_members m on m.id = t.record_id and t.kind = 'employee'
  where t.token = p_token
    and coalesce(s.name, f.name, m.name) is not null
  limit 1;
$$;

revoke all on function verify_id_token(uuid) from public;
grant execute on function verify_id_token(uuid) to anon, authenticated;
