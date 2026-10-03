import { LEAVE_APPLICATIONS, STUDENTS } from './data';
import {
  fromCanonical, shiftDay, todayLocal,
  type LeaveData, type LiveLeaveApplication,
} from './leave';
import type { LeaveApplication, Student } from './types';

/* =====================================================================
   Leave demo state — zero-setup prototype testing.

   Seeded from the canonical leave ledger (L-101..L-110: real applicants,
   real approvers, relative dates) plus one pending Grade 11-A
   application so the demo teacher's approval queue is never empty.
   Pure client-side example data (no login, no backend, no Supabase),
   clearly badged "Demo" wherever it renders. Loading demo is
   module-level so the Overview island and the hero page always agree —
   including local edits. Exiting demo discards local edits.
   ===================================================================== */

const loaded = new Set<'leave'>();
const listeners = new Set<() => void>();

export function isLeaveDemoLoaded(): boolean {
  return loaded.has('leave');
}

export function setLeaveDemoLoaded(on: boolean): void {
  const had = loaded.has('leave');
  if (on) loaded.add('leave');
  else {
    loaded.delete('leave');
    demoData = null;
  }
  if (had !== on) listeners.forEach((l) => l());
}

export function subscribeLeaveDemoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let demoData: LeaveData | null = null;
const dataListeners = new Set<() => void>();

export function subscribeDemoLeave(listener: () => void): () => void {
  dataListeners.add(listener);
  return () => { dataListeners.delete(listener); };
}

export function mutateDemoLeave(fn: (d: LeaveData) => LeaveData): void {
  demoData = fn(demoLeave());
  dataListeners.forEach((l) => l());
}

/** The demo teacher's queue item: Om Shah (Grade 11-A, Roll 01) applies to
 *  Rohan Sen, his class teacher — same routing rule as every other record. */
function seedExtra(): LiveLeaveApplication {
  const om = STUDENTS.find((s) => s.name === 'Om Shah') as Student;
  const rec: LeaveApplication = {
    id: 'L-111',
    applicantId: om.id,
    applicantName: om.name,
    applicantRole: 'student',
    approverName: 'Rohan Sen',
    from: shiftDay(todayLocal(), 1),
    to: shiftDay(todayLocal(), 2),
    days: 2,
    reason: 'Family wedding in Jaipur',
    status: 'pending',
    note: null,
  };
  const app = fromCanonical(rec);
  const submittedAt = `${shiftDay(todayLocal(), -1)}T16:12:00`;
  return {
    ...app,
    leaveType: 'Casual Leave',
    submittedAt,
    history: [{ action: 'submitted', actorName: app.applicantName, comment: '', at: submittedAt }],
  };
}

function buildDemoLeave(): LeaveData {
  return {
    applications: [...LEAVE_APPLICATIONS.map(fromCanonical), seedExtra()],
    syncedAt: new Date(),
  };
}

export function demoLeave(): LeaveData {
  if (!demoData) demoData = buildDemoLeave();
  return demoData;
}
