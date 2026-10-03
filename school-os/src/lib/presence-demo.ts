import {
  hashStr,
  type Audience, type FacultyPresenceRecord, type PresenceSnapshot,
  type StaffPresenceRecord, type StudentPresenceRecord,
} from './presence';
import {
  FEED_FACULTY_NAMES, STAFF as CANON_STAFF, STUDENTS as CANON_STUDENTS, TEACHERS,
} from './data';

/* =====================================================================
   Demo presence snapshots — zero-setup prototype testing.

   Rosters resolve against the canonical school dataset (no login, no
   backend, no Supabase); only the punch outcomes are demo state.
   Outcomes are deterministic per person per day, so every island, modal
   and page agrees until the day rolls over. Loading demo is a
   module-level mode per audience so an island and its detail modal always
   show the same data; exiting returns to the real feed state.
   ===================================================================== */

type RecordOf<A extends Audience> = A extends 'faculty'
  ? FacultyPresenceRecord : A extends 'staff' ? StaffPresenceRecord : StudentPresenceRecord;

/* ---------------- Demo mode store (shared by all hooks) ---------------- */

const loaded = new Set<Audience>();
const listeners = new Set<() => void>();

export function isDemoLoaded(audience: Audience): boolean {
  return loaded.has(audience);
}

export function setDemoLoaded(audience: Audience, on: boolean): void {
  const had = loaded.has(audience);
  if (on) loaded.add(audience);
  else loaded.delete(audience);
  if (had !== on) listeners.forEach((l) => l());
}

export function subscribeDemoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* ---------------- Canonical rosters ---------------- */

const FACULTY: FacultyPresenceRecord[] = FEED_FACULTY_NAMES.map((name) => {
  const t = TEACHERS.find((x) => x.name === name);
  if (!t) throw new Error(`presence demo: unknown faculty ${name}`);
  return {
    id: t.id, name: t.name, initials: t.initials, subject: t.subject, dept: t.dept,
    status: 'present', punchIn: null, punchOut: null,
  };
});

const STAFF_TYPE_FOR_ROLE: Record<string, StaffPresenceRecord['staffType']> = {
  Registrar: 'Administrative Staff',
  'Transport Manager': 'Transport',
  Librarian: 'Library Staff',
  'Lab Technician': 'Laboratory Staff',
  Counsellor: 'Support Staff',
  'IT Administrator': 'IT Support',
  'Admissions Officer': 'Administrative Staff',
  'Security Officer': 'Security',
  'Sports Coordinator': 'Support Staff',
  'Maintenance Supervisor': 'Maintenance',
  'Maintenance Technician': 'Maintenance',
};

const STAFF: StaffPresenceRecord[] = CANON_STAFF.map((m) => ({
  id: m.id, name: m.name, initials: m.initials, role: m.role, dept: m.dept,
  staffType: STAFF_TYPE_FOR_ROLE[m.role] ?? 'Support Staff',
  status: 'present', punchIn: null, punchOut: null,
}));

const STUDENTS: StudentPresenceRecord[] = CANON_STUDENTS
  .filter((s) => s.grade === 'Grade 10')
  .map((s) => ({
    id: s.id, name: s.name, initials: s.initials, grade: s.grade,
    section: s.section, roll: s.roll,
    status: 'present', punchIn: null, punchOut: null,
  }));

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Minutes-since-midnight → "07:52 AM". */
function clockOf(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

interface Punch { status: 'present' | 'absent'; punchIn: string | null; punchOut: string | null }

/** Deterministic per person per day: ~15% absent, in 07:30–08:10, ~40% out by 15:30–16:30. */
function punchFor(id: string, day: string): Punch {
  const h = hashStr(`demo:${day}:${id}`);
  if (h % 100 < 15) return { status: 'absent', punchIn: null, punchOut: null };
  const punchIn = clockOf(7 * 60 + 30 + (h % 41));
  const out = (h >>> 7) % 100 < 40 ? clockOf(15 * 60 + 30 + ((h >>> 13) % 61)) : null;
  return { status: 'present', punchIn, punchOut: out };
}

function toSnapshot<T extends { status: 'present' | 'absent'; name: string }>(records: T[]): PresenceSnapshot<T> {
  records.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'present' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const present = records.filter((r) => r.status === 'present').length;
  return { records, present, absent: records.length - present, total: records.length, syncedAt: new Date() };
}

export function demoSnapshot<A extends Audience>(audience: A): PresenceSnapshot<RecordOf<A>> {
  const day = todayLocal();
  if (audience === 'faculty') {
    return toSnapshot(FACULTY.map((f) => ({ ...f, ...punchFor(f.id, day) }))) as PresenceSnapshot<RecordOf<A>>;
  }
  if (audience === 'staff') {
    return toSnapshot(STAFF.map((m) => ({ ...m, ...punchFor(m.id, day) }))) as PresenceSnapshot<RecordOf<A>>;
  }
  return toSnapshot(STUDENTS.map((s) => ({ ...s, ...punchFor(s.id, day) }))) as PresenceSnapshot<RecordOf<A>>;
}
