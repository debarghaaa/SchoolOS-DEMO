/* =====================================================================
   Leave management — types, labels and pure helpers.

   Students apply to their class teacher, teachers apply to the school
   admin; every application carries its approval history. TOTAL DAYS IS
   DERIVED (inclusive from → to) in the UI exactly as the
   trg_leave_total_days trigger derives it in Postgres, so demo, live
   and SQL seed always agree.
   ===================================================================== */

import { STUDENTS, TEACHERS } from './data';
import type { LeaveApplication, Notification, Role } from './types';

export type LeaveType = 'Sick Leave' | 'Casual Leave' | 'Emergency Leave' | 'Personal Leave' | 'Other';
export type LeaveStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveAction = 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveHistoryEntry {
  action: LeaveAction;
  actorName: string;
  comment: string;
  /** ISO timestamp. */
  at: string;
}

export interface LiveLeaveApplication {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantRole: 'student' | 'teacher';
  /** 'Grade 10-B · Roll 14' for students, 'Physics · Sciences' for teachers. */
  applicantDetail: string;
  /** Routing key for students ('Grade 10-B'); '' for teachers. */
  applicantClass: string;
  leaveType: LeaveType;
  /** yyyy-mm-dd. */
  from: string;
  /** yyyy-mm-dd. */
  to: string;
  days: number;
  reason: string;
  supportingDoc: string;
  status: LeaveStatus;
  approverId: string;
  approverName: string;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Rejection reason; set when rejected. */
  note: string | null;
  history: LeaveHistoryEntry[];
}

export interface LeaveData {
  applications: LiveLeaveApplication[];
  syncedAt: Date;
}

export const LEAVE_TYPES: LeaveType[] = ['Sick Leave', 'Casual Leave', 'Emergency Leave', 'Personal Leave', 'Other'];
export const LEAVE_STATUSES: LeaveStatus[] = ['draft', 'pending', 'approved', 'rejected', 'cancelled'];

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  draft: 'Draft', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};

export const LEAVE_ACTION_LABEL: Record<LeaveAction, string> = {
  submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Inclusive day count; 0 when the range is invalid. */
export function leaveDays(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** yyyy-mm-dd shifted by n days. */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------- validation ---------------- */

export interface LeaveInput {
  leaveType: LeaveType;
  from: string;
  to: string;
  reason: string;
}

export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

/** Application-form validation: required fields, ordered dates, and no
 *  overlap with the applicant's committed (pending/approved) applications. */
export function validateLeaveInput(input: LeaveInput, committed: LiveLeaveApplication[]): string[] {
  const errors: string[] = [];
  if (!input.from) errors.push('Start date is required.');
  if (!input.to) errors.push('End date is required.');
  if (input.from && input.to && input.to < input.from) {
    errors.push('End date cannot be before start date.');
  }
  if (input.reason.trim() === '') errors.push('Reason is required.');
  if (input.from && input.to && input.to >= input.from) {
    const clash = committed.find((a) =>
      (a.status === 'pending' || a.status === 'approved') && rangesOverlap(input.from, input.to, a.from, a.to));
    if (clash) {
      errors.push(`Overlaps ${clash.leaveType.toLowerCase()} ${clash.from} → ${clash.to} (${LEAVE_STATUS_LABEL[clash.status].toLowerCase()}).`);
    }
  }
  return errors;
}

/** Supporting documents follow the platform's file rules (the Files
 *  uploader: PDF · DOCX · XLSX · PNG · MP4 · up to 200 MB). */
const DOC_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'png', 'mp4'];
const DOC_MAX_BYTES = 200 * 1024 * 1024;

export function validateSupportingDoc(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!DOC_EXTENSIONS.includes(ext)) {
    return 'Supporting document must be PDF, DOCX, XLSX, PNG or MP4.';
  }
  if (file.size > DOC_MAX_BYTES) {
    return 'Supporting document must be under 200 MB.';
  }
  return null;
}

/* ---------------- counts + selectors ---------------- */

export interface LeaveCounts {
  total: number;
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  onLeaveToday: number;
}

export function isOnLeaveToday(a: LiveLeaveApplication, today: string = todayLocal()): boolean {
  return a.status === 'approved' && a.from <= today && a.to >= today;
}

export function leaveCounts(apps: LiveLeaveApplication[], today: string = todayLocal()): LeaveCounts {
  return {
    total: apps.length,
    draft: apps.filter((a) => a.status === 'draft').length,
    pending: apps.filter((a) => a.status === 'pending').length,
    approved: apps.filter((a) => a.status === 'approved').length,
    rejected: apps.filter((a) => a.status === 'rejected').length,
    cancelled: apps.filter((a) => a.status === 'cancelled').length,
    onLeaveToday: apps.filter((a) => isOnLeaveToday(a, today)).length,
  };
}

/** Applications the signed-in persona filed (children included for parents). */
export function myApplications(apps: LiveLeaveApplication[], ownerIds: string[]): LiveLeaveApplication[] {
  const ids = new Set(ownerIds);
  return apps.filter((a) => ids.has(a.applicantId)).sort((x, y) => y.from.localeCompare(x.from));
}

/** Approval queue: students assigned to this teacher, or teachers for the admin. */
export function pendingQueue(
  apps: LiveLeaveApplication[], role: Role, approverName: string,
): LiveLeaveApplication[] {
  return apps
    .filter((a) => a.status === 'pending' && (
      role === 'teacher'
        ? a.applicantRole === 'student' && a.approverName === approverName
        : role === 'school-admin' ? a.applicantRole === 'teacher' : false
    ))
    .sort((x, y) => x.from.localeCompare(y.from));
}

/* ---------------- canonical bridge (demo seed) ---------------- */

function inferLeaveType(reason: string): LeaveType {
  const r = reason.toLowerCase();
  if (/(fever|medical|dental|clinic|hospital|doctor)/.test(r)) return 'Sick Leave';
  if (/(debate|workshop|seminar|training|travel|tournament)/.test(r)) return 'Other';
  return 'Casual Leave';
}

/** Lift a canonical ledger record into the live shape. Applicants and
 *  approvers resolve against the canonical dataset — never invented. */
export function fromCanonical(app: LeaveApplication): LiveLeaveApplication {
  const student = app.applicantRole === 'student'
    ? STUDENTS.find((s) => s.id === app.applicantId) : undefined;
  const teacher = app.applicantRole === 'teacher'
    ? TEACHERS.find((t) => t.id === app.applicantId) : undefined;
  const detail = student
    ? `${student.grade}-${student.section} · Roll ${student.roll}`
    : teacher ? `${teacher.subject} · ${teacher.dept}` : '';
  const cls = student ? `${student.grade}-${student.section}` : '';
  const submittedAt = `${shiftDay(app.from, -3)}T09:05:00`;
  const decidedDay = app.status === 'approved' || app.status === 'rejected'
    ? (app.from > todayLocal() && app.status === 'rejected' ? todayLocal() : app.from)
    : null;
  const history: LeaveHistoryEntry[] = [
    { action: 'submitted', actorName: app.applicantName, comment: '', at: submittedAt },
  ];
  if (app.status === 'approved' && decidedDay) {
    history.push({ action: 'approved', actorName: app.approverName, comment: 'Approved', at: `${decidedDay}T12:00:00` });
  }
  if (app.status === 'rejected' && decidedDay) {
    history.push({ action: 'rejected', actorName: app.approverName, comment: app.note ?? '', at: `${decidedDay}T12:00:00` });
  }
  return {
    id: app.id,
    applicantId: app.applicantId,
    applicantName: app.applicantName,
    applicantRole: app.applicantRole,
    applicantDetail: detail,
    applicantClass: cls,
    leaveType: inferLeaveType(app.reason),
    from: app.from,
    to: app.to,
    days: app.days,
    reason: app.reason,
    supportingDoc: '',
    status: app.status,
    approverId: '',
    approverName: app.approverName,
    submittedAt,
    decidedAt: decidedDay ? `${decidedDay}T12:00:00` : null,
    note: app.note,
    history,
  };
}

/* ---------------- Supabase row mapping (snake_case → camelCase) ---------------- */

type Row = Record<string, string | number | boolean | null>;

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === 'string' ? v : '';
}

function optStr(row: Row, key: string): string | null {
  const v = row[key];
  return typeof v === 'string' && v !== '' ? v : null;
}

export function mapLeaveRow(row: Row): LiveLeaveApplication {
  return {
    id: str(row, 'id'),
    applicantId: str(row, 'applicant_id'),
    applicantName: str(row, 'applicant_name'),
    applicantRole: (str(row, 'applicant_role') || 'student') as 'student' | 'teacher',
    applicantDetail: str(row, 'applicant_detail'),
    applicantClass: str(row, 'applicant_class'),
    leaveType: (str(row, 'leave_type') || 'Casual Leave') as LeaveType,
    from: str(row, 'start_date').slice(0, 10),
    to: str(row, 'end_date').slice(0, 10),
    days: typeof row.total_days === 'number' ? row.total_days : Number(str(row, 'total_days')) || 0,
    reason: str(row, 'reason'),
    supportingDoc: str(row, 'supporting_document_url'),
    status: (str(row, 'status') || 'draft') as LeaveStatus,
    approverId: str(row, 'approver_id'),
    approverName: str(row, 'approver_name'),
    submittedAt: optStr(row, 'submitted_at'),
    decidedAt: optStr(row, 'approved_at') ?? optStr(row, 'rejected_at'),
    note: optStr(row, 'rejection_reason'),
    history: [],
  };
}

export interface ApprovalRow {
  appId: string;
  actorId: string;
  action: LeaveAction;
  comment: string;
  at: string;
}

export function mapApprovalRow(row: Row): ApprovalRow {
  return {
    appId: str(row, 'leave_application_id'),
    actorId: str(row, 'approver_id'),
    action: (str(row, 'action') || 'submitted') as LeaveAction,
    comment: str(row, 'comment'),
    at: str(row, 'created_at'),
  };
}

/** Attach history rows to their applications. Actors resolve without a
 *  profile join: submissions/cancellations are the applicant's, decisions
 *  are the assigned approver's. */
export function withHistory(apps: LiveLeaveApplication[], approvals: ApprovalRow[]): LiveLeaveApplication[] {
  const byApp = new Map<string, ApprovalRow[]>();
  for (const a of approvals) {
    const list = byApp.get(a.appId) ?? [];
    list.push(a);
    byApp.set(a.appId, list);
  }
  return apps.map((app) => {
    const rows = (byApp.get(app.id) ?? []).sort((x, y) => x.at.localeCompare(y.at));
    if (rows.length === 0) return app;
    return {
      ...app,
      history: rows.map((r) => ({
        action: r.action,
        actorName: r.action === 'submitted' || r.action === 'cancelled' ? app.applicantName : app.approverName,
        comment: r.comment,
        at: r.at,
      })),
    };
  });
}

function fmtShort(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Single message format for every leave notification — demo pushes,
 *  live inserts and the SQL seed all render through this shape:
 *  applicant, type, dates, days, status. */
export function leaveNotificationContent(
  app: LiveLeaveApplication, event: 'submitted' | 'approved' | 'rejected',
): { type: string; title: string; message: string } {
  const range = `${fmtShort(app.from)} – ${fmtShort(app.to)}`;
  const days = `${app.days} day${app.days === 1 ? '' : 's'}`;
  if (event === 'submitted') {
    return {
      type: 'leave_submitted',
      title: `New leave application · ${app.applicantName}`,
      message: `${app.leaveType} · ${range} · ${days} · ${app.applicantDetail} · Status: Pending`,
    };
  }
  const decision = event === 'approved' ? 'Approved' : 'Rejected';
  return {
    type: event === 'approved' ? 'leave_approved' : 'leave_rejected',
    title: `Leave ${decision.toLowerCase()} · ${app.leaveType}`,
    message: `${app.leaveType} · ${range} · ${days} · Status: ${decision}` +
      (event === 'rejected' && app.note ? ` · ${app.note}` : ''),
  };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function mapNotificationRow(row: Row, audience: Role[]): Notification | null {
  const type = str(row, 'type') || 'leave_submitted';
  // Note/flag rows belong to the flags bridge; skipping them here keeps each
  // notification in exactly one inbox pipeline.
  if (type.startsWith('note_') || type.startsWith('flag_')) return null;
  return {
    id: `leave-${str(row, 'id')}`,
    title: str(row, 'title'),
    body: str(row, 'message'),
    time: timeAgo(str(row, 'created_at')),
    kind: 'leave',
    read: row.is_read === true,
    priority: type === 'leave_submitted' ? 'high' : 'normal',
    audience,
    ref: { route: 'leave-management', leaveId: str(row, 'reference_id') || undefined },
  };
}
