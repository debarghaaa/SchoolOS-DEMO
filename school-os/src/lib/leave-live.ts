import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureFeedClient, feedClaims, feedEmail, FeedError, FEED_SOURCE, type FeedClaims,
} from './supabase';
import { ROLES, STUDENTS, TEACHERS, classTeacherOf } from './data';
import { LINKED_CHILDREN, STUDENT_SCOPE, TEACHER_SCOPE } from './scoped';
import { useApp } from './store';
import type { Notification, Role } from './types';
import {
  leaveDays, leaveNotificationContent, mapApprovalRow, mapLeaveRow, mapNotificationRow,
  todayLocal, withHistory,
  type LeaveData, type LeaveInput, type LeaveStatus, type LiveLeaveApplication,
} from './leave';
import {
  demoLeave, isLeaveDemoLoaded, mutateDemoLeave,
  setLeaveDemoLoaded, subscribeDemoLeave, subscribeLeaveDemoMode,
} from './leave-demo';

/* =====================================================================
   Leave data — live Supabase tables, or the synthetic one-click demo
   when Supabase is not configured.

   Writes go through the same RLS that gates reads (applicants own their
   rows but can never set approved/rejected; only the assigned approver
   decides), so canApply/canDecide below are UX routing — Postgres is the
   enforcement layer. Demo mode mirrors the same matrix by persona name.
   ===================================================================== */

export const LEAVE_LIVE = FEED_SOURCE === 'supabase';

export interface LeaveSubmitInput extends LeaveInput {
  /** Supporting file chosen in the form; uploaded on submit. */
  file?: File | null;
  /** Parent persona: the linked child this application is filed for. */
  applicantId?: string;
  /** Promote one of my drafts instead of inserting. */
  draftId?: string;
}

export interface LiveLeave {
  data: LeaveData | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
  /** True once a realtime channel reports SUBSCRIBED (live source only). */
  live: boolean;
  /** True when rendering example data (synthetic one-click demo). */
  demo: boolean;
  /** Session role (live) or workspace role (demo). */
  role: string | null;
  /** My applicant id: profile id live, canonical id in demo. */
  myId: string | null;
  myName: string | null;
  /** Owner ids for "my applications" (children included for parents). */
  ownerIds: string[];
  synthetic: boolean;
  loadDemo: () => void;
  exitDemo: () => void;
  canApply: boolean;
  canDecide: (app: LiveLeaveApplication) => boolean;
  submitApplication: (input: LeaveSubmitInput) => Promise<LiveLeaveApplication>;
  saveDraft: (input: LeaveSubmitInput) => Promise<LiveLeaveApplication>;
  cancelApplication: (id: string) => Promise<void>;
  decideApplication: (id: string, decision: 'approved' | 'rejected', comment: string) => Promise<void>;
}

/* ---------------- demo identity (workspace persona) ---------------- */

function demoIdentity(role: Role): { myId: string; myName: string; ownerIds: string[] } {
  if (role === 'teacher') {
    const me = TEACHERS.find((t) => t.name === TEACHER_SCOPE.name);
    return { myId: me?.id ?? '', myName: TEACHER_SCOPE.name, ownerIds: me ? [me.id] : [] };
  }
  if (role === 'parent') {
    return { myId: 'parent', myName: 'Priya Dutta', ownerIds: LINKED_CHILDREN.map((c) => c.id) };
  }
  return { myId: STUDENT_SCOPE.id, myName: STUDENT_SCOPE.name, ownerIds: [STUDENT_SCOPE.id] };
}

function demoId(prefix: string): string {
  return `demo-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------------- live identity + routing ---------------- */

interface LiveProfile { id: string; name: string }

async function resolveMyProfile(client: SupabaseClient, claims: FeedClaims): Promise<LiveProfile> {
  if (claims.userId) {
    const { data } = await client.from('profiles').select('id,full_name')
      .eq('id', claims.userId).maybeSingle();
    if (data) {
      const row = data as unknown as Record<string, string>;
      return { id: row.id, name: row.full_name };
    }
  }
  const email = feedEmail();
  if (email) {
    const { data } = await client.from('profiles').select('id,full_name')
      .eq('tenant_id', claims.tenantId).eq('email', email).maybeSingle();
    if (data) {
      const row = data as unknown as Record<string, string>;
      return { id: row.id, name: row.full_name };
    }
  }
  throw new FeedError('ForbiddenError', 'This login has no directory profile to file leave for.');
}

async function resolveStudentClass(
  client: SupabaseClient, claims: FeedClaims, profileId: string,
): Promise<{ label: string; detail: string }> {
  const { data } = await client.from('students').select('grade,section,roll')
    .eq('tenant_id', claims.tenantId).eq('profile_id', profileId).maybeSingle();
  if (!data) throw new FeedError('ForbiddenError', 'Your enrolment record is missing — ask the front office.');
  const row = data as unknown as Record<string, string>;
  const label = `${row.grade}-${row.section}`;
  return { label, detail: `${label} · Roll ${row.roll}` };
}

async function resolveTeacherDetail(
  client: SupabaseClient, claims: FeedClaims, profileId: string,
): Promise<string> {
  const { data } = await client.from('faculty').select('subject,dept')
    .eq('tenant_id', claims.tenantId).eq('profile_id', profileId).maybeSingle();
  if (!data) return '';
  const row = data as unknown as Record<string, string>;
  return row.subject && row.dept ? `${row.subject} · ${row.dept}` : row.subject || row.dept || '';
}

async function resolveClassTeacher(
  client: SupabaseClient, claims: FeedClaims, classLabel: string,
): Promise<LiveProfile> {
  const { data } = await client.from('class_teachers').select('teacher_profile_id')
    .eq('tenant_id', claims.tenantId).eq('class_label', classLabel).maybeSingle();
  const teacherId = (data as unknown as Record<string, string> | null)?.teacher_profile_id;
  if (!teacherId) throw new FeedError('FeedApiError', `No class teacher is assigned for ${classLabel} yet.`);
  const prof = await client.from('profiles').select('id,full_name').eq('id', teacherId).maybeSingle();
  const row = prof.data as unknown as Record<string, string> | null;
  if (!row) throw new FeedError('FeedApiError', `No class teacher is assigned for ${classLabel} yet.`);
  return { id: row.id, name: row.full_name };
}

async function resolveSchoolAdmin(client: SupabaseClient, claims: FeedClaims): Promise<LiveProfile> {
  const { data } = await client.from('profiles').select('id,full_name')
    .eq('tenant_id', claims.tenantId).eq('role', 'school-admin')
    .order('created_at').limit(1).maybeSingle();
  const row = data as unknown as Record<string, string> | null;
  if (!row) throw new FeedError('FeedApiError', 'No school admin is on record for this school yet.');
  return { id: row.id, name: row.full_name };
}

async function fetchLiveLeave(client: SupabaseClient, claims: FeedClaims): Promise<LeaveData> {
  const [apps, approvals] = await Promise.all([
    client.from('leave_applications').select('*').eq('tenant_id', claims.tenantId)
      .order('start_date', { ascending: false }),
    client.from('leave_approvals').select('*').eq('tenant_id', claims.tenantId)
      .order('created_at', { ascending: true }),
  ]);
  if (apps.error) throw new FeedError('FeedApiError', 'Could not load leave applications.');
  if (approvals.error) throw new FeedError('FeedApiError', 'Could not load approval history.');
  const rows = (d: unknown): Record<string, string | number | boolean | null>[] =>
    (d ?? []) as Record<string, string | number | boolean | null>[];
  return {
    applications: withHistory(
      rows(apps.data).map(mapLeaveRow),
      rows(approvals.data).map(mapApprovalRow),
    ),
    syncedAt: new Date(),
  };
}

/* ---------------- notifications ---------------- */

function demoNotification(
  app: LiveLeaveApplication, event: 'submitted' | 'approved' | 'rejected', audience: Role[],
): Notification {
  const c = leaveNotificationContent(app, event);
  return {
    id: `leave-demo-${app.id}-${event}`,
    title: c.title, body: c.message, time: 'Just now', kind: 'leave', read: false,
    priority: event === 'submitted' ? 'high' : 'normal',
    audience, ref: { route: 'leave-management', leaveId: app.id },
  };
}

async function insertLiveNotification(
  client: SupabaseClient, claims: FeedClaims,
  app: LiveLeaveApplication, appId: string,
  event: 'submitted' | 'approved' | 'rejected', recipientId: string,
): Promise<void> {
  const c = leaveNotificationContent(app, event);
  const { error } = await client.from('notifications').insert({
    tenant_id: claims.tenantId, recipient_id: recipientId, type: c.type,
    title: c.title, message: c.message, reference_id: appId,
  });
  if (error) throw new FeedError('FeedApiError', 'Application saved, but the notification failed to send.');
}

/** Persist `is_read` for live leave notifications (registered once by the
 *  realtime bridge; silent no-op for anything else). */
export async function persistLeaveNotificationRead(id: string): Promise<void> {
  if (!id.startsWith('leave-') || id.startsWith('leave-demo-')) return;
  if (!LEAVE_LIVE) return;
  try {
    const client = await ensureFeedClient();
    const claims = feedClaims() as FeedClaims;
    await client.from('notifications').update({ is_read: true })
      .eq('tenant_id', claims.tenantId).eq('id', id.slice('leave-'.length));
  } catch {
    /* Local state already flipped; the row syncs on next load. */
  }
}

/** Live notification feed for the realtime bridge. Subscribes to my
 *  notification rows and pushes unseen ones into the shared inbox. */
export function useLeaveNotifications(): void {
  const { pushNotification, role } = useApp();
  const seen = useRef(new Set<string>());
  const [demoMode, setDemoMode] = useState(() => isLeaveDemoLoaded());

  useEffect(() => subscribeLeaveDemoMode(() => setDemoMode(isLeaveDemoLoaded())), []);

  useEffect(() => {
    if (!LEAVE_LIVE || demoMode) return;
    let channel: { unsubscribe: () => void } | null = null;
    let cancelled = false;
    ensureFeedClient()
      .then(async (client) => {
        if (cancelled) return;
        const claims = feedClaims() as FeedClaims;
        const me = await resolveMyProfile(client, claims).catch(() => null);
        if (cancelled || !me) return;
        const sessionRole = (claims.role as Role) || role;
        const pull = () => {
          client.from('notifications').select('*')
            .eq('tenant_id', claims.tenantId).eq('recipient_id', me.id)
            .order('created_at', { ascending: false }).limit(20)
            .then(({ data }) => {
              if (cancelled || !data) return;
              for (const row of data as unknown as Record<string, string | boolean | null>[]) {
                const n = mapNotificationRow(row, [sessionRole]);
                if (!n) continue;
                if (seen.current.has(n.id)) continue;
                seen.current.add(n.id);
                // Only unread arrivals surface as new inbox items; read ones
                // are already acknowledged on another device.
                if (!n.read) pushNotification(n);
              }
            }, () => undefined);
        };
        pull();
        channel = client
          .channel(`leave-notifs:${claims.tenantId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'notifications',
            filter: `recipient_id=eq.${me.id}`,
          }, pull)
          .subscribe();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  }, [pushNotification, role, demoMode]);
}

/* ---------------- notification deep-links ----------------
   Leave notifications carry their application id. Click handlers stash it
   here before navigating; the hero page opens the exact record (or the
   apply form) once its data is ready — including when the page is already
   mounted, via the listener. */

let pendingLeaveId: string | null = null;
let pendingApply = false;
const selectionListeners = new Set<() => void>();

export function queueLeaveSelection(id: string): void {
  pendingLeaveId = id;
  selectionListeners.forEach((l) => l());
}

export function queueLeaveApply(): void {
  pendingApply = true;
  selectionListeners.forEach((l) => l());
}

export function subscribeLeaveSelection(fn: () => void): () => void {
  selectionListeners.add(fn);
  return () => { selectionListeners.delete(fn); };
}

export function consumeLeaveSelection(): { leaveId: string | null; apply: boolean } {
  const out = { leaveId: pendingLeaveId, apply: pendingApply };
  pendingLeaveId = null;
  pendingApply = false;
  return out;
}

/* ---------------- main hook ---------------- */

const DEMO_ONLY = () => new FeedError(
  'DemoSourceError',
  'Leave has no demo API feed. Connect a Supabase project for live data, or explore the example dataset.',
);

export function useLiveLeave(): LiveLeave {
  const { role, pushNotification } = useApp();
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [live, setLive] = useState(false);
  const [claims, setClaims] = useState<FeedClaims | null>(null);
  const [profile, setProfile] = useState<LiveProfile | null>(null);
  const [synthetic, setSynthetic] = useState(() => isLeaveDemoLoaded());
  const seq = useRef(0);
  const liveSource = LEAVE_LIVE;

  const loadDemo = useCallback(() => setLeaveDemoLoaded(true), []);
  const exitDemo = useCallback(() => setLeaveDemoLoaded(false), []);

  useEffect(() => subscribeLeaveDemoMode(() => setSynthetic(isLeaveDemoLoaded())), []);

  const demo = demoIdentity(role);

  // Synthetic demo: module-level data shared by every hook instance, so the
  // Overview island and the hero page always agree — including local edits.
  useEffect(() => {
    if (!synthetic) return;
    seq.current++;
    setData(demoLeave());
    setClaims(null);
    setProfile(null);
    setError(null);
    setLoading(false);
    return subscribeDemoLeave(() => {
      setData({ ...demoLeave(), syncedAt: new Date() });
    });
  }, [synthetic]);

  const apply = useCallback((
    id: number, next: LeaveData, session: FeedClaims, me: LiveProfile,
  ) => {
    if (id !== seq.current) return;
    setData(next);
    setClaims(session);
    setProfile(me);
    setError(null);
    setLoading(false);
  }, []);

  const fail = useCallback((id: number, e: Error) => {
    if (id !== seq.current) return;
    setError(e);
    setLoading(false);
  }, []);

  const reload = useCallback(() => {
    const id = ++seq.current;
    if (synthetic) {
      if (id === seq.current) {
        setData({ ...demoLeave(), syncedAt: new Date() });
        setError(null);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    if (!liveSource) {
      fail(id, DEMO_ONLY());
      return;
    }
    ensureFeedClient()
      .then(async (client) => {
        const session = feedClaims() as FeedClaims;
        const me = await resolveMyProfile(client, session);
        return fetchLiveLeave(client, session).then(
          (next) => apply(id, next, session, me), (e: Error) => fail(id, e));
      })
      .catch((e: Error) => fail(id, e));
  }, [liveSource, synthetic, apply, fail]);

  useEffect(() => {
    if (synthetic) return;
    if (!liveSource) {
      const id = ++seq.current;
      fail(id, DEMO_ONLY());
      return;
    }
    const id = ++seq.current;
    let channel: { unsubscribe: () => void } | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);

    ensureFeedClient()
      .then(async (client) => {
        if (cancelled || id !== seq.current) return;
        const session = feedClaims() as FeedClaims;
        const me = await resolveMyProfile(client, session).catch((e: Error) => {
          fail(id, e);
          return null;
        });
        if (!me || cancelled || id !== seq.current) return;
        const refetch = () => {
          fetchLiveLeave(client, session).then(
            (next) => apply(id, next, session, me), () => undefined);
        };
        fetchLiveLeave(client, session).then(
          (next) => apply(id, next, session, me), (e: Error) => fail(id, e));
        channel = client
          .channel(`leave:${session.tenantId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'leave_applications',
            filter: `tenant_id=eq.${session.tenantId}`,
          }, refetch)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'leave_approvals',
            filter: `tenant_id=eq.${session.tenantId}`,
          }, refetch)
          .subscribe((status) => { if (status === 'SUBSCRIBED') setLive(true); });
      })
      .catch((e: Error) => fail(id, e));
    return () => {
      cancelled = true;
      seq.current++;
      channel?.unsubscribe();
      setLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthetic]);

  const sessionRole = synthetic ? role : (claims?.role ?? null);
  const myId = synthetic ? demo.myId : (profile?.id ?? null);
  const myName = synthetic ? demo.myName : (profile?.name ?? null);
  const ownerIds = synthetic ? demo.ownerIds : (profile ? [profile.id] : []);

  const canApply = sessionRole === 'student' || sessionRole === 'teacher' || sessionRole === 'parent';

  const canDecide = useCallback((app: LiveLeaveApplication): boolean => {
    if (app.status !== 'pending') return false;
    if (synthetic) {
      if (role === 'teacher') return app.applicantRole === 'student' && app.approverName === TEACHER_SCOPE.name;
      if (role === 'school-admin') return app.applicantRole === 'teacher';
      return false;
    }
    if (!claims || !profile) return false;
    if (claims.role === 'teacher') {
      return app.applicantRole === 'student' && app.approverId === profile.id;
    }
    if (claims.role === 'school-admin') return app.applicantRole === 'teacher';
    return false;
  }, [synthetic, role, claims, profile]);

  /** Run a live mutation, then silently refresh so lists never go stale. */
  const mutateLive = useCallback(async <T,>(
    run: (client: SupabaseClient, session: FeedClaims, me: LiveProfile) => Promise<T>,
  ): Promise<T> => {
    if (!liveSource || synthetic) throw DEMO_ONLY();
    const client = await ensureFeedClient();
    const session = feedClaims() as FeedClaims;
    const me = await resolveMyProfile(client, session);
    const out = await run(client, session, me);
    setData(await fetchLiveLeave(client, session));
    return out;
  }, [liveSource, synthetic]);

  const submitApplication = useCallback(async (input: LeaveSubmitInput): Promise<LiveLeaveApplication> => {
    const days = leaveDays(input.from, input.to);
    if (synthetic) {
      const applicantId = input.applicantId ?? demo.myId;
      const student = STUDENTS.find((s) => s.id === applicantId);
      const teacher = !student ? TEACHERS.find((t) => t.id === applicantId) : undefined;
      if (!student && !teacher) throw new FeedError('ForbiddenError', 'Unknown applicant for this workspace.');
      const applicantRole = student ? 'student' as const : 'teacher' as const;
      const applicantClass = student ? `${student.grade}-${student.section}` : '';
      const approverName = student
        ? classTeacherOf(applicantClass)
        : (ROLES.find((r) => r.id === 'school-admin')?.name ?? 'Ananya Rao');
      const now = new Date().toISOString();
      const app: LiveLeaveApplication = {
        id: input.draftId ?? demoId('leave'),
        applicantId,
        applicantName: student ? student.name : (teacher as { name: string }).name,
        applicantRole,
        applicantDetail: student
          ? `${student.grade}-${student.section} · Roll ${student.roll}`
          : `${(teacher as { subject: string; dept: string }).subject} · ${(teacher as { dept: string }).dept}`,
        applicantClass,
        leaveType: input.leaveType,
        from: input.from, to: input.to, days,
        reason: input.reason.trim(),
        supportingDoc: input.file ? input.file.name : '',
        status: 'pending',
        approverId: '',
        approverName,
        submittedAt: now, decidedAt: null, note: null,
        history: [{ action: 'submitted', actorName: student ? student.name : (teacher as { name: string }).name, comment: '', at: now }],
      };
      mutateDemoLeave((d) => ({
        ...d,
        applications: input.draftId
          ? d.applications.map((a) => (a.id === input.draftId ? app : a))
          : [app, ...d.applications],
        syncedAt: new Date(),
      }));
      pushNotification(demoNotification(app, 'submitted', [applicantRole === 'student' ? 'teacher' : 'school-admin']));
      return app;
    }
    return mutateLive(async (client, session, me) => {
      const applicantRole = session.role === 'teacher' ? 'teacher' : 'student';
      let applicantClass = '';
      let detail = '';
      let applicantId = me.id;
      let applicantName = me.name;
      if (session.role === 'parent') {
        if (!input.applicantId) throw new FeedError('ForbiddenError', 'Choose which child this leave is for.');
        const { data } = await client.from('students').select('grade,section,roll,profile_id')
          .eq('tenant_id', session.tenantId).eq('id', input.applicantId).maybeSingle();
        const row = data as unknown as Record<string, string> | null;
        if (!row?.profile_id) throw new FeedError('ForbiddenError', 'Unknown linked child.');
        applicantId = row.profile_id;
        applicantClass = `${row.grade}-${row.section}`;
        detail = `${applicantClass} · Roll ${row.roll}`;
        const prof = await client.from('profiles').select('full_name').eq('id', applicantId).maybeSingle();
        applicantName = (prof.data as unknown as Record<string, string> | null)?.full_name ?? 'Student';
      } else if (applicantRole === 'student') {
        const cls = await resolveStudentClass(client, session, me.id);
        applicantClass = cls.label;
        detail = cls.detail;
      } else {
        detail = await resolveTeacherDetail(client, session, me.id);
      }
      const approver = applicantRole === 'student'
        ? await resolveClassTeacher(client, session, applicantClass)
        : await resolveSchoolAdmin(client, session);
      const appId = input.draftId ?? crypto.randomUUID();
      let docUrl = '';
      if (input.file) {
        const path = `${session.tenantId}/${appId}/${input.file.name}`;
        const { error: upErr } = await client.storage.from('leave-docs').upload(path, input.file, { upsert: true });
        if (upErr) throw new FeedError('FeedApiError', 'Supporting document upload failed — nothing was submitted.');
        docUrl = path;
      }
      const now = new Date().toISOString();
      const row = {
        tenant_id: session.tenantId, applicant_id: applicantId, applicant_role: applicantRole,
        applicant_name: applicantName, applicant_detail: detail, applicant_class: applicantClass,
        leave_type: input.leaveType, start_date: input.from, end_date: input.to,
        reason: input.reason.trim(), supporting_document_url: docUrl,
        status: 'pending', approver_id: approver.id, approver_name: approver.name, submitted_at: now,
      };
      if (input.draftId) {
        const { error } = await client.from('leave_applications').update(row)
          .eq('tenant_id', session.tenantId).eq('id', input.draftId);
        if (error) throw new FeedError('FeedApiError', 'Could not submit the draft application.');
      } else {
        const { error } = await client.from('leave_applications').insert({ id: appId, ...row });
        if (error) throw new FeedError('FeedApiError', 'Could not submit the leave application.');
      }
      const { error: histErr } = await client.from('leave_approvals').insert({
        tenant_id: session.tenantId, leave_application_id: appId, approver_id: me.id, action: 'submitted',
      });
      if (histErr) throw new FeedError('FeedApiError', 'Application saved, but the history entry failed.');
      const app: LiveLeaveApplication = {
        id: appId, applicantId, applicantName, applicantRole, applicantDetail: detail,
        applicantClass, leaveType: input.leaveType, from: input.from, to: input.to, days,
        reason: input.reason.trim(), supportingDoc: docUrl, status: 'pending',
        approverId: approver.id, approverName: approver.name,
        submittedAt: now, decidedAt: null, note: null, history: [],
      };
      await insertLiveNotification(client, session, app, appId, 'submitted', approver.id);
      return app;
    });
  }, [synthetic, demo.myId, mutateLive, pushNotification]);

  const saveDraft = useCallback(async (input: LeaveSubmitInput): Promise<LiveLeaveApplication> => {
    if (synthetic) {
      const applicantId = input.applicantId ?? demo.myId;
      const student = STUDENTS.find((s) => s.id === applicantId);
      const teacher = !student ? TEACHERS.find((t) => t.id === applicantId) : undefined;
      if (!student && !teacher) throw new FeedError('ForbiddenError', 'Unknown applicant for this workspace.');
      const name = student ? student.name : (teacher as { name: string }).name;
      const app: LiveLeaveApplication = {
        id: input.draftId ?? demoId('leave'),
        applicantId, applicantName: name,
        applicantRole: student ? 'student' : 'teacher',
        applicantDetail: student
          ? `${student.grade}-${student.section} · Roll ${student.roll}`
          : `${(teacher as { subject: string; dept: string }).subject} · ${(teacher as { dept: string }).dept}`,
        applicantClass: student ? `${student.grade}-${student.section}` : '',
        leaveType: input.leaveType, from: input.from, to: input.to,
        days: leaveDays(input.from, input.to),
        reason: input.reason.trim(),
        supportingDoc: input.file ? input.file.name : '',
        status: 'draft', approverId: '', approverName: '',
        submittedAt: null, decidedAt: null, note: null, history: [],
      };
      mutateDemoLeave((d) => ({
        ...d,
        applications: input.draftId
          ? d.applications.map((a) => (a.id === input.draftId ? app : a))
          : [app, ...d.applications],
        syncedAt: new Date(),
      }));
      return app;
    }
    return mutateLive(async (client, session, me) => {
      const applicantRole = session.role === 'teacher' ? 'teacher' : 'student';
      const row = {
        tenant_id: session.tenantId, applicant_id: me.id, applicant_role: applicantRole,
        applicant_name: me.name, applicant_detail: '', applicant_class: '',
        leave_type: input.leaveType, start_date: input.from || todayLocal(),
        end_date: input.to || todayLocal(), reason: input.reason.trim(),
        status: 'draft',
      };
      const appId = input.draftId ?? crypto.randomUUID();
      if (input.draftId) {
        const { error } = await client.from('leave_applications').update(row)
          .eq('tenant_id', session.tenantId).eq('id', input.draftId);
        if (error) throw new FeedError('FeedApiError', 'Could not update the draft.');
      } else {
        const { error } = await client.from('leave_applications').insert({ id: appId, ...row });
        if (error) throw new FeedError('FeedApiError', 'Could not save the draft.');
      }
      const data = await fetchLiveLeave(client, session);
      const saved = data.applications.find((a) => a.id === appId);
      if (!saved) throw new FeedError('FeedApiError', 'Could not save the draft.');
      return saved;
    });
  }, [synthetic, demo.myId, mutateLive]);

  const cancelApplication = useCallback(async (id: string): Promise<void> => {
    if (synthetic) {
      const now = new Date().toISOString();
      mutateDemoLeave((d) => ({
        ...d,
        applications: d.applications.map((a) => (a.id === id
          ? {
            ...a, status: 'cancelled' as LeaveStatus, decidedAt: now,
            history: [...a.history, { action: 'cancelled' as const, actorName: a.applicantName, comment: '', at: now }],
          }
          : a)),
        syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, session, me) => {
      const { error } = await client.from('leave_applications').update({ status: 'cancelled' })
        .eq('tenant_id', session.tenantId).eq('id', id);
      if (error) throw new FeedError('FeedApiError', 'Could not cancel the application.');
      const { error: histErr } = await client.from('leave_approvals').insert({
        tenant_id: session.tenantId, leave_application_id: id, approver_id: me.id, action: 'cancelled',
      });
      if (histErr) throw new FeedError('FeedApiError', 'Application cancelled, but the history entry failed.');
    });
  }, [synthetic, mutateLive]);

  const decideApplication = useCallback(async (
    id: string, decision: 'approved' | 'rejected', comment: string,
  ): Promise<void> => {
    if (synthetic) {
      const now = new Date().toISOString();
      let decided: LiveLeaveApplication | null = null;
      mutateDemoLeave((d) => ({
        ...d,
        applications: d.applications.map((a) => {
          if (a.id !== id) return a;
          decided = {
            ...a, status: decision, decidedAt: now,
            note: decision === 'rejected' ? comment.trim() : null,
            history: [...a.history, {
              action: decision, actorName: a.approverName,
              comment: decision === 'rejected' ? comment.trim() : 'Approved', at: now,
            }],
          };
          return decided;
        }),
        syncedAt: new Date(),
      }));
      if (decided) {
        const app = decided as LiveLeaveApplication;
        pushNotification(demoNotification(app, decision, [app.applicantRole]));
      }
      return;
    }
    await mutateLive(async (client, session, me) => {
      const now = new Date().toISOString();
      const patch = decision === 'approved'
        ? { status: decision, approved_at: now }
        : { status: decision, rejected_at: now, rejection_reason: comment.trim() };
      const { error } = await client.from('leave_applications').update(patch)
        .eq('tenant_id', session.tenantId).eq('id', id);
      if (error) throw new FeedError('FeedApiError', `Could not ${decision === 'approved' ? 'approve' : 'reject'} the application.`);
      const { error: histErr } = await client.from('leave_approvals').insert({
        tenant_id: session.tenantId, leave_application_id: id, approver_id: me.id,
        action: decision, comment: decision === 'rejected' ? comment.trim() : 'Approved',
      });
      if (histErr) throw new FeedError('FeedApiError', 'Decision saved, but the history entry failed.');
      const { data } = await client.from('leave_applications').select('*')
        .eq('tenant_id', session.tenantId).eq('id', id).maybeSingle();
      if (!data) throw new FeedError('FeedApiError', 'Decision saved, but the applicant notice failed.');
      const app = mapLeaveRow(data as unknown as Record<string, string | number | boolean | null>);
      await insertLiveNotification(client, session, app, id, decision, app.applicantId);
    });
  }, [synthetic, mutateLive, pushNotification]);

  return {
    data, loading, error, reload, live, demo: synthetic,
    role: sessionRole, myId, myName, ownerIds, synthetic,
    loadDemo, exitDemo, canApply, canDecide,
    submitApplication, saveDraft, cancelApplication, decideApplication,
  };
}
