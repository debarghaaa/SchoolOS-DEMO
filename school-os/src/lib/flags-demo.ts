import { STUDENTS } from './data';
import type { FlagRecord, FlagsData, RosterEntry } from './flags';

const daysAgo = (n: number, h = 9): string => {
  const d = new Date(Date.now() - n * 86400000);
  d.setHours(h, 12, 0, 0);
  return d.toISOString();
};

const ADMIN = 'Admin Office';

function byId(id: string): { name: string; classLabel: string; roll: string } {
  const s = STUDENTS.find((x) => x.id === id);
  if (!s) return { name: 'Unknown student', classLabel: '', roll: '' };
  return { name: s.name, classLabel: `${s.grade}-${s.section}`, roll: s.roll };
}

function rec(age: number, partial: Partial<FlagRecord> & Pick<FlagRecord, 'id' | 'type' | 'studentKey' | 'title' | 'body' | 'category' | 'level' | 'visibility' | 'status'>): FlagRecord {
  const s = byId(partial.studentKey);
  const createdAt = daysAgo(age);
  return {
    studentName: s.name, studentClass: s.classLabel, studentRoll: s.roll,
    createdBy: ADMIN, createdById: 'demo-admin', createdAt, updatedAt: createdAt,
    resolvedBy: null, resolvedById: null, resolvedAt: null,
    history: [{ action: 'created', actorName: ADMIN, detail: partial.title ?? '', at: createdAt }],
    ...partial,
  };
}

/** Example dataset mirroring the flags.sql seed. */
export function demoFlagsData(): FlagsData {
  const roster: RosterEntry[] = STUDENTS.map((s) => ({
    key: s.id, name: s.name, classLabel: `${s.grade}-${s.section}`,
    grade: s.grade, section: s.section, roll: s.roll,
  }));
  const f204 = rec(12, { id: 'F-204', type: 'flag', studentKey: 'NV-2027560',
    title: 'Library book overdue (3 weeks)', body: 'Navya has held "Wings of Fire" past three reminders. Flagging so the class teacher can follow up before mid-term inventory.',
    category: 'Administrative Concern', level: 'Low', visibility: 'all', status: 'resolved',
  });
  f204.resolvedBy = ADMIN;
  f204.resolvedAt = daysAgo(8);
  f204.updatedAt = daysAgo(8);
  f204.history.push({ action: 'resolved', actorName: ADMIN, detail: 'active → resolved · Book returned at the library desk.', at: daysAgo(8) });

  const n104 = rec(15, { id: 'N-104', type: 'note', studentKey: 'NV-2027798',
    title: 'Science fair participation', body: 'Om volunteered for the inter-school science fair crew. Confirm lab slot with the physics department before Friday.',
    category: 'General', level: 'Low', visibility: 'all', status: 'archived',
  });
  n104.updatedAt = daysAgo(10);
  n104.history.push({ action: 'archived', actorName: ADMIN, detail: 'active → archived · Fair concluded; note kept for reference.', at: daysAgo(10) });

  return {
    roster,
    syncedAt: new Date(),
    records: [
      rec(2, { id: 'F-201', type: 'flag', studentKey: 'NV-2027798', title: 'Repeated late arrivals', body: 'Om has arrived after the first bell four times in two weeks. Request the class teacher to speak with the parents and log the outcome here.', category: 'Attendance Concern', level: 'High', visibility: 'all', status: 'active' }),
      rec(5, { id: 'F-202', type: 'flag', studentKey: 'NV-2027056', title: 'Playground altercation', body: 'Priya was involved in a pushing incident during lunch break. No injuries; both students counselled. Parents informed by phone.', category: 'Behavior Concern', level: 'Medium', visibility: 'teacher_parent', status: 'active' }),
      rec(1, { id: 'F-203', type: 'flag', studentKey: 'NV-2024014', title: 'Sudden drop in Mathematics', body: 'Ishita scored 41% in the latest unit test against a 78% term average. Recommend a parent meeting and remedial plan within the week.', category: 'Academic Concern', level: 'Critical', visibility: 'all', status: 'active' }),
      f204,
      rec(3, { id: 'N-101', type: 'note', studentKey: 'NV-2024014', title: 'Library reading goal', body: 'Ishita committed to two library books per month. Librarian confirms the first issue ("The Guide") was collected on Monday.', category: 'Academic', level: 'Medium', visibility: 'all', status: 'active' }),
      rec(6, { id: 'N-102', type: 'note', studentKey: 'NV-2022071', title: 'Counsellor check-in', body: 'Aarav seemed withdrawn in class this week. Counsellor to hold a brief check-in and share only need-to-know observations with teachers.', category: 'Wellbeing', level: 'High', visibility: 'teacher_parent', status: 'active' }),
      rec(4, { id: 'N-103', type: 'note', studentKey: 'NV-2027546', title: 'Bus route change', body: 'Pari moves from Route 7 to Route 4 starting Monday. Internal coordination note — no action needed from parents.', category: 'Administrative', level: 'Low', visibility: 'teacher_only', status: 'active' }),
      n104,
    ],
  };
}

/* ---------------- shared demo store (mirrors leave-demo.ts) ---------------- */

const loaded = new Set<string>();
const listeners = new Set<() => void>();

export function isFlagsDemoLoaded(): boolean {
  return loaded.has('flags');
}

export function setFlagsDemoLoaded(on: boolean): void {
  const had = loaded.has('flags');
  if (on) loaded.add('flags');
  else {
    loaded.delete('flags');
    demoData = null;
  }
  if (had !== on) listeners.forEach((l) => l());
}

export function subscribeFlagsDemoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let demoData: FlagsData | null = null;
const dataListeners = new Set<() => void>();

export function subscribeDemoFlags(listener: () => void): () => void {
  dataListeners.add(listener);
  return () => { dataListeners.delete(listener); };
}

export function mutateDemoFlags(fn: (d: FlagsData) => FlagsData): void {
  demoData = fn(demoFlags());
  dataListeners.forEach((l) => l());
}

export function demoFlags(): FlagsData {
  if (!demoData) demoData = demoFlagsData();
  return demoData;
}
