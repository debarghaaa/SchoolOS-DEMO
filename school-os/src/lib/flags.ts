import type { Notification, Role, RouteId } from './types';

/* =====================================================================
   Student Notes & Flags — canonical record model.

   ONE record per note/flag, shared by every role. Admins manage;
   teachers/students/parents read the same rows through visibility +
   relationship scoping (RLS live, scope helpers in demo). No per-role
   copies anywhere in the stack.
   ===================================================================== */

export type FlagRecordType = 'note' | 'flag';
export type NoteStatus = 'active' | 'archived';
export type FlagStatus = 'active' | 'resolved';
export type RecordStatus = 'active' | 'resolved' | 'archived';
export type Priority = 'Low' | 'Medium' | 'High';
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
export type FlagVisibility = 'all' | 'teacher_parent' | 'teacher_only';

export const NOTE_CATEGORIES = [
  'Academic', 'Attendance', 'Behavior', 'Wellbeing', 'Administrative', 'General',
] as const;
export const FLAG_CATEGORIES = [
  'Academic Concern', 'Attendance Concern', 'Behavior Concern',
  'Wellbeing Concern', 'Administrative Concern', 'Other',
] as const;
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High'];
export const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

export const VISIBILITY_LABEL: Record<FlagVisibility, string> = {
  all: 'Student + Parent + Teacher',
  teacher_parent: 'Teacher + Parent',
  teacher_only: 'Teacher Only',
};
export const VISIBILITY_OPTIONS: { id: FlagVisibility; label: string }[] = [
  { id: 'all', label: VISIBILITY_LABEL.all },
  { id: 'teacher_parent', label: VISIBILITY_LABEL.teacher_parent },
  { id: 'teacher_only', label: VISIBILITY_LABEL.teacher_only },
];

export const STATUS_LABEL: Record<RecordStatus, string> = {
  active: 'Active', resolved: 'Resolved', archived: 'Archived',
};

export interface FlagHistoryEntry {
  action: 'created' | 'updated' | 'resolved' | 'archived';
  actorName: string;
  detail: string;
  at: string;
}

export interface FlagRecord {
  id: string;
  type: FlagRecordType;
  /** Roster key: canonical student id in demo, roster UUID live. */
  studentKey: string;
  studentName: string;
  studentClass: string;
  studentRoll: string;
  title: string;
  body: string;
  category: string;
  /** Priority (notes) or severity (flags). */
  level: string;
  visibility: FlagVisibility;
  status: RecordStatus;
  createdBy: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  resolvedBy: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  history: FlagHistoryEntry[];
}

export interface RosterEntry {
  key: string;
  name: string;
  classLabel: string;
  grade: string;
  section: string;
  roll: string;
}

export interface FlagsData {
  records: FlagRecord[];
  roster: RosterEntry[];
  syncedAt: Date;
}

export interface FlagCounts {
  activeFlags: number;
  highPriority: number;
  critical: number;
  recent: number;
  resolved: number;
}

/* ---------------- selectors ---------------- */

export function recordsForStudent(records: FlagRecord[], studentKey: string): FlagRecord[] {
  return records
    .filter((r) => r.studentKey === studentKey)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function rosterKeyOf(grade: string, section: string, roll: string): string {
  return `${grade}|${section}|${roll}`;
}

export function findRosterKey(roster: RosterEntry[], grade: string, section: string, roll: string): string | null {
  const want = rosterKeyOf(grade, section, roll);
  return roster.find((r) => rosterKeyOf(r.grade, r.section, r.roll) === want)?.key ?? null;
}

/** Demo-side scoping mirror of the RLS matrix (live rows arrive
 *  pre-scoped; this keeps the example dataset honest). */
export function visibleTo(
  records: FlagRecord[], role: Role, scopeKeys: string[], myKey: string | null,
): FlagRecord[] {
  if (role === 'school-admin') return records;
  const scope = new Set(scopeKeys);
  return records.filter((r) => {
    if (!scope.has(r.studentKey)) return false;
    if (role === 'teacher') return true; // every visibility includes teachers
    if (role === 'student') return r.visibility === 'all' && r.studentKey === myKey;
    if (role === 'parent') return r.visibility !== 'teacher_only';
    return false;
  });
}

export function flagCounts(records: FlagRecord[]): FlagCounts {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const active = records.filter((r) => r.status === 'active');
  return {
    activeFlags: records.filter((r) => r.type === 'flag' && r.status === 'active').length,
    highPriority: active.filter((r) => r.level === 'High').length,
    critical: active.filter((r) => r.type === 'flag' && r.level === 'Critical').length,
    recent: active.filter((r) => r.createdAt >= weekAgo).length,
    resolved: records.filter((r) => r.type === 'flag' && r.status === 'resolved').length,
  };
}

/** Sidebar badge: active flags at High/Critical severity. */
export function flagBadgeCount(records: FlagRecord[]): number {
  return records.filter((r) =>
    r.type === 'flag' && r.status === 'active' && (r.level === 'High' || r.level === 'Critical')).length;
}

/* ---------------- validation (client-side; CHECKs + RLS enforce) ---------------- */

export interface NoteInput {
  title: string; body: string; category: string; priority: Priority; visibility: FlagVisibility;
}

export interface FlagInput {
  title: string; body: string; category: string; severity: Severity; visibility: FlagVisibility;
}

function validateRecord(title: string, body: string, what: string): string[] {
  const errs: string[] = [];
  if (title.trim().length < 3) errs.push(`${what} title needs at least 3 characters.`);
  if (title.trim().length > 120) errs.push(`${what} title must be 120 characters or fewer.`);
  if (body.trim().length === 0) errs.push(`${what === 'Note' ? 'Note' : 'Reason'} is required.`);
  if (body.trim().length > 2000) errs.push('Description must be 2000 characters or fewer.');
  return errs;
}

export function validateNoteInput(input: NoteInput): string[] {
  return validateRecord(input.title, input.body, 'Note');
}

export function validateFlagInput(input: FlagInput): string[] {
  return validateRecord(input.title, input.body, 'Flag');
}

/* ---------------- notifications ---------------- */

export type FlagEvent = 'note_created' | 'flag_created' | 'flag_resolved';

export function flagNotificationContent(
  record: FlagRecord, event: FlagEvent, actorName: string,
): { type: FlagEvent; title: string; message: string } {
  const head = event === 'note_created' ? 'New note'
    : event === 'flag_created' ? 'New flag' : 'Flag resolved';
  return {
    type: event,
    title: `${head} · ${record.studentName}`,
    message: `${record.title} · ${record.category} · ${record.level} · by ${actorName}`,
  };
}

/** Inbox route per recipient role for note/flag deep-links. */
export function flagRouteFor(role: Role): RouteId {
  if (role === 'parent') return 'my-children';
  if (role === 'student') return 'my-classes';
  if (role === 'school-admin') return 'student-flags';
  return 'students-directory';
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

type Cell = string | number | boolean | null;

export function mapFlagNotificationRow(
  row: Record<string, Cell>, audience: Role[], route: RouteId,
  studentKey: string, recordId: string, recordType: FlagRecordType,
): Notification {
  const type = String(row.type ?? '');
  return {
    id: `flag-${String(row.id)}`,
    title: String(row.title ?? ''),
    body: String(row.message ?? ''),
    time: timeAgo(String(row.created_at ?? '')),
    kind: type.startsWith('note_') ? 'note' : 'flag',
    read: Boolean(row.is_read),
    priority: 'high',
    audience,
    ref: { route, studentId: studentKey, recordId, recordType },
  };
}

/* ---------------- Supabase row mappers ---------------- */

interface StudentJoin { name?: string; grade?: string; section?: string; roll?: string }

function joinOf(row: Record<string, Cell | StudentJoin>): StudentJoin {
  const j = row.students as StudentJoin | null | undefined;
  return j ?? {};
}

function stamp(v: Cell | undefined): string {
  return typeof v === 'string' && v !== '' ? v : new Date().toISOString();
}

export function mapNoteRow(row: Record<string, Cell | StudentJoin>, createdBy: string): FlagRecord {
  const s = joinOf(row);
  const c = (k: string): string => String((row[k] as Cell) ?? '');
  return {
    id: c('id'), type: 'note', studentKey: c('student_id'),
    studentName: s.name ?? 'Unknown student',
    studentClass: s.grade && s.section ? `${s.grade}-${s.section}` : '',
    studentRoll: s.roll ?? '',
    title: c('title'), body: c('description'), category: c('category') || 'General',
    level: c('priority') || 'Low',
    visibility: (c('visibility') || 'all') as FlagVisibility,
    status: (c('status') || 'active') as RecordStatus,
    createdBy, createdById: c('created_by'),
    createdAt: stamp(row.created_at as Cell), updatedAt: stamp(row.updated_at as Cell),
    resolvedBy: null, resolvedById: null, resolvedAt: null, history: [],
  };
}

export function mapFlagRow(row: Record<string, Cell | StudentJoin>, createdBy: string): FlagRecord {
  const base = mapNoteRow(row, createdBy);
  const c = (k: string): string => String((row[k] as Cell) ?? '');
  return {
    ...base,
    type: 'flag',
    body: c('reason'),
    category: c('category') || 'Other',
    level: c('severity') || 'Low',
    resolvedBy: null,
    resolvedById: c('resolved_by') || null,
    resolvedAt: (row.resolved_at as string) || null,
  };
}

export interface MappedHistoryEntry extends FlagHistoryEntry {
  recordId: string;
  actorId: string;
}

export function mapHistoryRow(row: Record<string, Cell>): MappedHistoryEntry {
  return {
    recordId: String(row.record_id ?? ''),
    actorId: String(row.performed_by ?? ''),
    action: (String(row.action ?? 'created') as FlagHistoryEntry['action']),
    actorName: '',
    detail: [String(row.previous_value ?? ''), String(row.new_value ?? '')]
      .filter((v) => v !== '').join(' → '),
    at: stamp(row.created_at),
  };
}

export function withFlagHistory(
  records: FlagRecord[], history: MappedHistoryEntry[],
  actorNames: Map<string, string>,
): FlagRecord[] {
  const byRecord = new Map<string, FlagHistoryEntry[]>();
  for (const h of history) {
    const list = byRecord.get(h.recordId) ?? [];
    list.push({
      action: h.action, actorName: actorNames.get(h.actorId) ?? 'Staff',
      detail: h.detail, at: h.at,
    });
    byRecord.set(h.recordId, list);
  }
  return records.map((r) => ({
    ...r,
    createdBy: actorNames.get(r.createdById) ?? r.createdBy,
    resolvedBy: r.resolvedById ? (actorNames.get(r.resolvedById) ?? r.resolvedBy) : r.resolvedBy,
    history: (byRecord.get(r.id) ?? []).sort((a, b) => a.at.localeCompare(b.at)),
  }));
}
