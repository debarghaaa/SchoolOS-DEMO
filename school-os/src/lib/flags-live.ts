import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureFeedClient, feedClaims, feedEmail, FeedError, FEED_SOURCE, type FeedClaims,
} from './supabase';
import { STUDENTS } from './data';
import { LINKED_CHILDREN, STUDENT_SCOPE, TEACHER_SCOPE, teacherStudents } from './scoped';
import { useApp } from './store';
import type { Notification, Role } from './types';
import {
  findRosterKey, flagNotificationContent, flagRouteFor, mapFlagNotificationRow,
  mapFlagRow, mapHistoryRow, mapNoteRow, visibleTo, withFlagHistory,
  type FlagEvent, type FlagInput, type FlagRecord, type FlagsData,
  type FlagVisibility, type NoteInput, type RecordStatus, type RosterEntry,
} from './flags';
import {
  demoFlags, isFlagsDemoLoaded, mutateDemoFlags,
  setFlagsDemoLoaded, subscribeDemoFlags, subscribeFlagsDemoMode,
} from './flags-demo';

/* =====================================================================
   Student Notes & Flags — live Supabase tables, or the synthetic
   one-click demo when Supabase is not configured.

   One canonical record per note/flag; RLS enforces tenant + visibility +
   class/link scoping on every read and write, so the role checks below
   are UX routing — Postgres is the enforcement layer. Demo mode mirrors
   the same matrix through the workspace scopes.
   ===================================================================== */

export const FLAGS_LIVE = FEED_SOURCE === 'supabase';

export interface NoteCreateInput extends NoteInput {
  studentKey: string;
}

export interface FlagCreateInput extends FlagInput {
  studentKey: string;
}

export interface RecordUpdateInput {
  title?: string;
  body?: string;
  category?: string;
  level?: string;
  visibility?: FlagVisibility;
}

export interface LiveFlags {
  data: FlagsData | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
  /** True once a realtime channel reports SUBSCRIBED (live source only). */
  live: boolean;
  /** True when rendering example data (synthetic one-click demo). */
  demo: boolean;
  /** Session role (live) or workspace role (demo). */
  role: string | null;
  /** My profile id (live) or scope key (demo). */
  myId: string | null;
  myName: string | null;
  synthetic: boolean;
  loadDemo: () => void;
  exitDemo: () => void;
  canManage: boolean;
  /** Role + visibility scoped records (RLS live, scope mirror in demo). */
  visibleRecords: FlagRecord[];
  /** Canonical (grade, section, roll) → roster key of the active source. */
  keyForStudent: (grade: string, section: string, roll: string) => string | null;
  canViewStudent: (studentKey: string) => boolean;
  createNote: (input: NoteCreateInput) => Promise<FlagRecord>;
  createFlag: (input: FlagCreateInput) => Promise<FlagRecord>;
  updateRecord: (id: string, patch: RecordUpdateInput) => Promise<void>;
  resolveFlag: (id: string) => Promise<void>;
  archiveNote: (id: string) => Promise<void>;
}

/* ---------------- demo identity (workspace persona) ---------------- */

function demoScope(role: Role): { myKey: string | null; myName: string; scopeKeys: string[] } {
  if (role === 'teacher') {
    return { myKey: null, myName: TEACHER_SCOPE.name, scopeKeys: teacherStudents().map((s) => s.id) };
  }
  if (role === 'parent') {
    return { myKey: null, myName: 'Priya Dutta', scopeKeys: LINKED_CHILDREN.map((c) => c.id) };
  }
  return { myKey: STUDENT_SCOPE.id, myName: STUDENT_SCOPE.name, scopeKeys: [STUDENT_SCOPE.id] };
}

function demoId(prefix: string): string {
  return `demo-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEMO_ADMIN = 'Admin Office';

/* ---------------- live identity + recipients ---------------- */

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
  throw new FeedError('ForbiddenError', 'This login has no directory profile.');
}

interface FlagRecipients {
  teacher: string | null;
  student: string | null;
  parents: string[];
}

/** Class teacher + (visibility-gated) student + linked parents. Only the
 *  class teacher, never every teacher in the school. */
async function resolveFlagRecipients(
  client: SupabaseClient, claims: FeedClaims,
  studentId: string, visibility: FlagVisibility,
): Promise<FlagRecipients> {
  const out: FlagRecipients = { teacher: null, student: null, parents: [] };
  const { data } = await client.from('students').select('grade,section,profile_id')
    .eq('tenant_id', claims.tenantId).eq('id', studentId).maybeSingle();
  const row = data as unknown as Record<string, string> | null;
  if (!row) return out;
  const ct = await client.from('class_teachers').select('teacher_profile_id')
    .eq('tenant_id', claims.tenantId).eq('class_label', `${row.grade}-${row.section}`).maybeSingle();
  out.teacher = (ct.data as unknown as Record<string, string> | null)?.teacher_profile_id ?? null;
  if (visibility === 'all') out.student = row.profile_id ?? null;
  if (visibility !== 'teacher_only') {
    const pl = await client.from('family_links').select('parent_profile_id')
      .eq('tenant_id', claims.tenantId).eq('student_id', studentId);
    if (pl.data) {
      out.parents = (pl.data as unknown as Record<string, string>[])
        .map((r) => r.parent_profile_id).filter(Boolean);
    }
  }
  return out;
}

type Cell = string | number | boolean | null;
type Row = Record<string, Cell | Record<string, string>>;

async function fetchLiveFlags(client: SupabaseClient, claims: FeedClaims): Promise<FlagsData> {
  const [notes, flags, history, students] = await Promise.all([
    client.from('student_notes').select('*, students(name,grade,section,roll)')
      .eq('tenant_id', claims.tenantId).order('created_at', { ascending: false }),
    client.from('student_flags').select('*, students(name,grade,section,roll)')
      .eq('tenant_id', claims.tenantId).order('created_at', { ascending: false }),
    client.from('student_note_flag_history').select('*')
      .eq('tenant_id', claims.tenantId).order('created_at', { ascending: true }),
    client.from('students').select('id,name,grade,section,roll')
      .eq('tenant_id', claims.tenantId).order('grade').order('section').order('roll'),
  ]);
  if (notes.error) throw new FeedError('FeedApiError', 'Could not load student notes.');
  if (flags.error) throw new FeedError('FeedApiError', 'Could not load student flags.');
  if (history.error) throw new FeedError('FeedApiError', 'Could not load record history.');
  if (students.error) throw new FeedError('FeedApiError', 'Could not load the student roster.');
  const rows = (d: unknown): Row[] => (d ?? []) as Row[];
  const records = [
    ...rows(notes.data).map((r) => mapNoteRow(r, 'Staff')),
    ...rows(flags.data).map((r) => mapFlagRow(r, 'Staff')),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const mapped = rows(history.data).map((r) => mapHistoryRow(r as Record<string, Cell>));
  const actorIds = [...new Set([
    ...records.map((r) => r.createdById),
    ...mapped.map((h) => h.actorId),
  ].filter(Boolean))];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data } = await client.from('profiles').select('id,full_name').in('id', actorIds);
    if (data) {
      for (const p of data as unknown as Record<string, string>[]) actorNames.set(p.id, p.full_name);
    }
  }
  const roster: RosterEntry[] = rows(students.data).map((r) => ({
    key: String(r.id ?? ''), name: String(r.name ?? ''),
    classLabel: `${String(r.grade ?? '')}-${String(r.section ?? '')}`,
    grade: String(r.grade ?? ''), section: String(r.section ?? ''), roll: String(r.roll ?? ''),
  }));
  return { records: withFlagHistory(records, mapped, actorNames), roster, syncedAt: new Date() };
}

/* ---------------- notifications ---------------- */

function demoFlagNotification(
  record: FlagRecord, event: FlagEvent, audience: Role[],
): Notification {
  const c = flagNotificationContent(record, event, DEMO_ADMIN);
  const route = flagRouteFor(audience[0] ?? 'teacher');
  return {
    id: `flag-demo-${record.id}-${event}-${route}`,
    title: c.title, body: c.message, time: 'Just now',
    kind: record.type, read: false, priority: 'high',
    audience, ref: { route, studentId: record.studentKey, recordId: record.id, recordType: record.type },
  };
}

function demoAudiences(visibility: FlagVisibility): Role[][] {
  const out: Role[][] = [['teacher']];
  if (visibility === 'all') out.push(['student']);
  if (visibility !== 'teacher_only') out.push(['parent']);
  return out;
}

async function insertLiveFlagNotifications(
  client: SupabaseClient, claims: FeedClaims,
  record: FlagRecord, event: FlagEvent, actorName: string, recipients: FlagRecipients,
): Promise<void> {
  const c = flagNotificationContent(record, event, actorName);
  const ids = [recipients.teacher, recipients.student, ...recipients.parents]
    .filter((id): id is string => Boolean(id));
  let failed = false;
  for (const recipientId of ids) {
    const { error } = await client.from('notifications').insert({
      tenant_id: claims.tenantId, recipient_id: recipientId, type: c.type,
      title: c.title, message: c.message, reference_id: record.id,
    });
    if (error) failed = true;
  }
  if (failed) throw new FeedError('FeedApiError', 'Record saved, but a notification failed to send.');
}

/** Persist `is_read` for live note/flag notifications (registered once by
 *  the realtime bridge; silent no-op for anything else). */
export async function persistFlagNotificationRead(id: string): Promise<void> {
  if (!id.startsWith('flag-') || id.startsWith('flag-demo-')) return;
  if (!FLAGS_LIVE) return;
  try {
    const client = await ensureFeedClient();
    const claims = feedClaims() as FeedClaims;
    await client.from('notifications').update({ is_read: true })
      .eq('tenant_id', claims.tenantId).eq('id', id.slice('flag-'.length));
  } catch {
    /* Local state already flipped; the row syncs on next load. */
  }
}

/** Canonical student id for a record when the roster key is a live UUID:
 *  (grade, section, roll) is unique per school on both sides. */
export function canonicalIdOf(record: FlagRecord): string | null {
  if (!record.studentClass.includes('-') || !record.studentRoll) {
    return STUDENTS.some((s) => s.id === record.studentKey) ? record.studentKey : null;
  }
  const at = record.studentClass.lastIndexOf('-');
  const grade = record.studentClass.slice(0, at);
  const section = record.studentClass.slice(at + 1);
  return STUDENTS.find((s) => s.grade === grade && s.section === section && s.roll === record.studentRoll)?.id
    ?? (STUDENTS.some((s) => s.id === record.studentKey) ? record.studentKey : null);
}

const FLAG_TYPES = new Set(['note_created', 'flag_created', 'flag_resolved']);

/** Live notification feed for the realtime bridge. Subscribes to my
 *  note/flag rows and pushes unseen ones into the shared inbox. */
export function useFlagNotifications(): void {
  const { pushNotification, role } = useApp();
  const { data } = useLiveFlags();
  const seen = useRef(new Set<string>());
  const recordsRef = useRef<FlagRecord[]>([]);
  useEffect(() => {
    recordsRef.current = data?.records ?? [];
  });
  const recordCount = data?.records.length ?? 0;
  const [demoMode, setDemoMode] = useState(() => isFlagsDemoLoaded());

  useEffect(() => subscribeFlagsDemoMode(() => setDemoMode(isFlagsDemoLoaded())), []);

  useEffect(() => {
    if (!FLAGS_LIVE || demoMode) return;
    let channel: { unsubscribe: () => void } | null = null;
    let cancelled = false;
    ensureFeedClient()
      .then(async (client) => {
        if (cancelled) return;
        const claims = feedClaims() as FeedClaims;
        const me = await resolveMyProfile(client, claims).catch(() => null);
        if (cancelled || !me) return;
        const sessionRole = (claims.role as Role) || role;
        const route = flagRouteFor(sessionRole);
        const pull = () => {
          client.from('notifications').select('*')
            .eq('tenant_id', claims.tenantId).eq('recipient_id', me.id)
            .order('created_at', { ascending: false }).limit(20)
            .then(({ data: rows }) => {
              if (cancelled || !rows) return;
              for (const row of rows as unknown as Record<string, Cell>[]) {
                const type = String(row.type ?? '');
                if (!FLAG_TYPES.has(type) || seen.current.has(`flag-${String(row.id)}`)) continue;
                const record = recordsRef.current.find((r) => r.id === String(row.reference_id ?? ''));
                // The record may load after its notification; leave it
                // unseen so the next pull (or record arrival) retries.
                if (!record) continue;
                seen.current.add(`flag-${String(row.id)}`);
                const n = mapFlagNotificationRow(
                  row, [sessionRole], route,
                  canonicalIdOf(record) ?? record.studentKey, record.id, record.type,
                );
                if (!n.read) pushNotification(n);
              }
            }, () => undefined);
        };
        pull();
        channel = client
          .channel(`flag-notifs:${claims.tenantId}`)
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
  }, [pushNotification, role, demoMode, recordCount]);
}

/* ---------------- notification deep-links ----------------
   Note/flag notifications carry the canonical student id (when the live
   roster maps back to the directory) plus the record id. Click handlers
   stash both before navigating; the profile surfaces open the exact
   record once their data is ready. */

let pendingFlagStudent: string | null = null;
let pendingFlagRecord: string | null = null;
const flagSelectionListeners = new Set<() => void>();

export function queueFlagSelection(studentId: string | null, recordId: string | null): void {
  pendingFlagStudent = studentId;
  pendingFlagRecord = recordId;
  flagSelectionListeners.forEach((l) => l());
}

export function subscribeFlagSelection(fn: () => void): () => void {
  flagSelectionListeners.add(fn);
  return () => { flagSelectionListeners.delete(fn); };
}

export function consumeFlagSelection(): { studentId: string | null; recordId: string | null } {
  const out = { studentId: pendingFlagStudent, recordId: pendingFlagRecord };
  pendingFlagStudent = null;
  pendingFlagRecord = null;
  return out;
}

/* ---------------- main hook ---------------- */

const DEMO_ONLY = () => new FeedError(
  'DemoSourceError',
  'Notes & flags have no demo API feed. Connect a Supabase project for live data, or explore the example dataset.',
);

export function useLiveFlags(): LiveFlags {
  const { role, pushNotification } = useApp();
  const [data, setData] = useState<FlagsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [live, setLive] = useState(false);
  const [claims, setClaims] = useState<FeedClaims | null>(null);
  const [profile, setProfile] = useState<LiveProfile | null>(null);
  const [synthetic, setSynthetic] = useState(() => isFlagsDemoLoaded());
  const seq = useRef(0);
  const liveSource = FLAGS_LIVE;

  const loadDemo = useCallback(() => setFlagsDemoLoaded(true), []);
  const exitDemo = useCallback(() => setFlagsDemoLoaded(false), []);

  useEffect(() => subscribeFlagsDemoMode(() => setSynthetic(isFlagsDemoLoaded())), []);

  const demo = demoScope(role);

  useEffect(() => {
    if (!synthetic) return;
    seq.current++;
    setData(demoFlags());
    setClaims(null);
    setProfile(null);
    setError(null);
    setLoading(false);
    return subscribeDemoFlags(() => {
      setData({ ...demoFlags(), syncedAt: new Date() });
    });
  }, [synthetic]);

  const apply = useCallback((
    id: number, next: FlagsData, session: FeedClaims, me: LiveProfile,
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
        setData({ ...demoFlags(), syncedAt: new Date() });
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
        return fetchLiveFlags(client, session).then(
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
          fetchLiveFlags(client, session).then(
            (next) => apply(id, next, session, me), () => undefined);
        };
        fetchLiveFlags(client, session).then(
          (next) => apply(id, next, session, me), (e: Error) => fail(id, e));
        channel = client
          .channel(`flags:${session.tenantId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'student_notes',
            filter: `tenant_id=eq.${session.tenantId}`,
          }, refetch)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'student_flags',
            filter: `tenant_id=eq.${session.tenantId}`,
          }, refetch)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'student_note_flag_history',
            filter: `tenant_id=eq.${session.tenantId}`,
          }, refetch)
          .subscribe((status) => { if (status === 'SUBSCRIBED') setLive(true); });
      })
      .catch((e: Error) => fail(id, e));
    return () => {
      // No seq bump: `cancelled` invalidates this run's continuations, and a
      // re-run's ++seq.current invalidates apply()/fail() by id. (React 19
      // treats the resulting unmounted setState as a no-op.)
      cancelled = true;
      channel?.unsubscribe();
      setLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthetic]);

  const sessionRole = synthetic ? role : (claims?.role ?? null);
  const myId = synthetic ? (demo.myKey ?? role) : (profile?.id ?? null);
  const myName = synthetic ? demo.myName : (profile?.name ?? null);
  const canManage = sessionRole === 'school-admin';

  const visibleRecords = data
    ? (synthetic ? visibleTo(data.records, role, demo.scopeKeys, demo.myKey) : data.records)
    : [];

  const keyForStudent = useCallback((grade: string, section: string, roll: string): string | null => {
    if (!data) return null;
    return findRosterKey(data.roster, grade, section, roll);
  }, [data]);

  const canViewStudent = useCallback((studentKey: string): boolean => {
    if (!data) return false;
    if (synthetic) {
      if (role === 'school-admin') return true;
      if (role === 'teacher' || role === 'parent') return demo.scopeKeys.includes(studentKey);
      return studentKey === demo.myKey;
    }
    return data.roster.some((r) => r.key === studentKey);
  }, [data, synthetic, role, demo.scopeKeys, demo.myKey]);

  /** Run a live mutation, then silently refresh so lists never go stale. */
  const mutateLive = useCallback(async <T,>(
    run: (client: SupabaseClient, session: FeedClaims, me: LiveProfile) => Promise<T>,
  ): Promise<T> => {
    if (!liveSource || synthetic) throw DEMO_ONLY();
    const client = await ensureFeedClient();
    const session = feedClaims() as FeedClaims;
    const me = await resolveMyProfile(client, session);
    const out = await run(client, session, me);
    setData(await fetchLiveFlags(client, session));
    return out;
  }, [liveSource, synthetic]);

  const buildDemoRecord = useCallback((
    type: 'note' | 'flag', studentKey: string,
    input: NoteInput | FlagInput, level: string,
  ): FlagRecord => {
    const roster = demoFlags().roster.find((r) => r.key === studentKey);
    const now = new Date().toISOString();
    return {
      id: demoId(type), type, studentKey,
      studentName: roster?.name ?? 'Unknown student',
      studentClass: roster?.classLabel ?? '', studentRoll: roster?.roll ?? '',
      title: input.title.trim(), body: input.body.trim(),
      category: input.category, level,
      visibility: input.visibility, status: 'active',
      createdBy: DEMO_ADMIN, createdById: 'demo-admin',
      createdAt: now, updatedAt: now,
      resolvedBy: null, resolvedById: null, resolvedAt: null,
      history: [{ action: 'created', actorName: DEMO_ADMIN, detail: input.title.trim(), at: now }],
    };
  }, []);

  const pushDemoCreated = useCallback((record: FlagRecord, event: FlagEvent) => {
    for (const audience of demoAudiences(record.visibility)) {
      pushNotification(demoFlagNotification(record, event, audience));
    }
  }, [pushNotification]);

  const createNote = useCallback(async (input: NoteCreateInput): Promise<FlagRecord> => {
    if (synthetic) {
      const record = buildDemoRecord('note', input.studentKey, input, input.priority);
      mutateDemoFlags((d) => ({ ...d, records: [record, ...d.records], syncedAt: new Date() }));
      pushDemoCreated(record, 'note_created');
      return record;
    }
    return mutateLive(async (client, session, me) => {
      const { data: inserted, error } = await client.from('student_notes').insert({
        tenant_id: session.tenantId, student_id: input.studentKey,
        title: input.title.trim(), description: input.body.trim(),
        category: input.category, priority: input.priority,
        visibility: input.visibility, status: 'active', created_by: me.id,
      }).select('id,created_at,updated_at').single();
      if (error || !inserted) throw new FeedError('FeedApiError', 'Could not save the note.');
      const row = inserted as unknown as Record<string, string>;
      const { error: histErr } = await client.from('student_note_flag_history').insert({
        tenant_id: session.tenantId, record_type: 'note', record_id: row.id,
        action: 'created', performed_by: me.id, new_value: input.title.trim(),
      });
      if (histErr) throw new FeedError('FeedApiError', 'Note saved, but the history entry failed.');
      const roster = (await fetchLiveFlags(client, session)).roster
        .find((r) => r.key === input.studentKey);
      const record: FlagRecord = {
        id: row.id, type: 'note', studentKey: input.studentKey,
        studentName: roster?.name ?? 'Student', studentClass: roster?.classLabel ?? '',
        studentRoll: roster?.roll ?? '',
        title: input.title.trim(), body: input.body.trim(),
        category: input.category, level: input.priority,
        visibility: input.visibility, status: 'active',
        createdBy: me.name, createdById: me.id,
        createdAt: row.created_at, updatedAt: row.updated_at,
        resolvedBy: null, resolvedById: null, resolvedAt: null, history: [],
      };
      const recipients = await resolveFlagRecipients(client, session, input.studentKey, input.visibility);
      await insertLiveFlagNotifications(client, session, record, 'note_created', me.name, recipients);
      return record;
    });
  }, [synthetic, buildDemoRecord, mutateLive, pushDemoCreated]);

  const createFlag = useCallback(async (input: FlagCreateInput): Promise<FlagRecord> => {
    if (synthetic) {
      const record = buildDemoRecord('flag', input.studentKey, input, input.severity);
      mutateDemoFlags((d) => ({ ...d, records: [record, ...d.records], syncedAt: new Date() }));
      pushDemoCreated(record, 'flag_created');
      return record;
    }
    return mutateLive(async (client, session, me) => {
      const { data: inserted, error } = await client.from('student_flags').insert({
        tenant_id: session.tenantId, student_id: input.studentKey,
        title: input.title.trim(), reason: input.body.trim(),
        category: input.category, severity: input.severity,
        visibility: input.visibility, status: 'active', created_by: me.id,
      }).select('id,created_at,updated_at').single();
      if (error || !inserted) throw new FeedError('FeedApiError', 'Could not save the flag.');
      const row = inserted as unknown as Record<string, string>;
      const { error: histErr } = await client.from('student_note_flag_history').insert({
        tenant_id: session.tenantId, record_type: 'flag', record_id: row.id,
        action: 'created', performed_by: me.id, new_value: input.title.trim(),
      });
      if (histErr) throw new FeedError('FeedApiError', 'Flag saved, but the history entry failed.');
      const roster = (await fetchLiveFlags(client, session)).roster
        .find((r) => r.key === input.studentKey);
      const record: FlagRecord = {
        id: row.id, type: 'flag', studentKey: input.studentKey,
        studentName: roster?.name ?? 'Student', studentClass: roster?.classLabel ?? '',
        studentRoll: roster?.roll ?? '',
        title: input.title.trim(), body: input.body.trim(),
        category: input.category, level: input.severity,
        visibility: input.visibility, status: 'active',
        createdBy: me.name, createdById: me.id,
        createdAt: row.created_at, updatedAt: row.updated_at,
        resolvedBy: null, resolvedById: null, resolvedAt: null, history: [],
      };
      const recipients = await resolveFlagRecipients(client, session, input.studentKey, input.visibility);
      await insertLiveFlagNotifications(client, session, record, 'flag_created', me.name, recipients);
      return record;
    });
  }, [synthetic, buildDemoRecord, mutateLive, pushDemoCreated]);

  const updateRecord = useCallback(async (id: string, patch: RecordUpdateInput): Promise<void> => {
    if (synthetic) {
      const now = new Date().toISOString();
      const changed = Object.keys(patch).filter((k) => patch[k as keyof RecordUpdateInput] !== undefined);
      mutateDemoFlags((d) => ({
        ...d,
        records: d.records.map((r) => (r.id === id ? {
          ...r,
          title: patch.title?.trim() ?? r.title,
          body: patch.body?.trim() ?? r.body,
          category: patch.category ?? r.category,
          level: patch.level ?? r.level,
          visibility: patch.visibility ?? r.visibility,
          updatedAt: now,
          history: [...r.history, {
            action: 'updated' as const, actorName: DEMO_ADMIN,
            detail: changed.length > 0 ? `Updated ${changed.join(', ')}` : 'Updated', at: now,
          }],
        } : r)),
        syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, session, me) => {
      const { data: current } = await client.from('student_notes').select('id')
        .eq('tenant_id', session.tenantId).eq('id', id).maybeSingle();
      const table = current ? 'student_notes' : 'student_flags';
      const recordType = current ? 'note' : 'flag';
      const row: Record<string, string> = {};
      if (patch.title !== undefined) row.title = patch.title.trim();
      if (patch.body !== undefined) row[recordType === 'note' ? 'description' : 'reason'] = patch.body.trim();
      if (patch.category !== undefined) row.category = patch.category;
      if (patch.level !== undefined) row[recordType === 'note' ? 'priority' : 'severity'] = patch.level;
      if (patch.visibility !== undefined) row.visibility = patch.visibility;
      if (Object.keys(row).length === 0) return;
      const { error } = await client.from(table).update(row)
        .eq('tenant_id', session.tenantId).eq('id', id);
      if (error) throw new FeedError('FeedApiError', 'Could not update the record.');
      const { error: histErr } = await client.from('student_note_flag_history').insert({
        tenant_id: session.tenantId, record_type: recordType, record_id: id,
        action: 'updated', performed_by: me.id, new_value: `Updated ${Object.keys(row).join(', ')}`,
      });
      if (histErr) throw new FeedError('FeedApiError', 'Record updated, but the history entry failed.');
    });
  }, [synthetic, mutateLive]);

  const resolveFlag = useCallback(async (id: string): Promise<void> => {
    if (synthetic) {
      const now = new Date().toISOString();
      let resolved: FlagRecord | null = null;
      mutateDemoFlags((d) => ({
        ...d,
        records: d.records.map((r) => {
          if (r.id !== id) return r;
          resolved = {
            ...r, status: 'resolved' as RecordStatus, resolvedBy: DEMO_ADMIN, resolvedAt: now,
            updatedAt: now,
            history: [...r.history, {
              action: 'resolved' as const, actorName: DEMO_ADMIN,
              detail: 'active → resolved', at: now,
            }],
          };
          return resolved;
        }),
        syncedAt: new Date(),
      }));
      if (resolved) pushDemoCreated(resolved as FlagRecord, 'flag_resolved');
      return;
    }
    await mutateLive(async (client, session, me) => {
      const now = new Date().toISOString();
      const { error } = await client.from('student_flags')
        .update({ status: 'resolved', resolved_by: me.id, resolved_at: now })
        .eq('tenant_id', session.tenantId).eq('id', id);
      if (error) throw new FeedError('FeedApiError', 'Could not resolve the flag.');
      const { error: histErr } = await client.from('student_note_flag_history').insert({
        tenant_id: session.tenantId, record_type: 'flag', record_id: id,
        action: 'resolved', performed_by: me.id, previous_value: 'active', new_value: 'resolved',
      });
      if (histErr) throw new FeedError('FeedApiError', 'Flag resolved, but the history entry failed.');
      const { data } = await client.from('student_flags').select('*, students(name,grade,section,roll)')
        .eq('tenant_id', session.tenantId).eq('id', id).maybeSingle();
      if (!data) throw new FeedError('FeedApiError', 'Flag resolved, but the notification failed.');
      const record = mapFlagRow(data as unknown as Row, me.name);
      const recipients = await resolveFlagRecipients(client, session, record.studentKey, record.visibility);
      await insertLiveFlagNotifications(client, session, record, 'flag_resolved', me.name, recipients);
    });
  }, [synthetic, mutateLive, pushDemoCreated]);

  const archiveNote = useCallback(async (id: string): Promise<void> => {
    if (synthetic) {
      const now = new Date().toISOString();
      mutateDemoFlags((d) => ({
        ...d,
        records: d.records.map((r) => (r.id === id ? {
          ...r, status: 'archived' as RecordStatus, updatedAt: now,
          history: [...r.history, {
            action: 'archived' as const, actorName: DEMO_ADMIN,
            detail: 'active → archived', at: now,
          }],
        } : r)),
        syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, session, me) => {
      const { error } = await client.from('student_notes').update({ status: 'archived' })
        .eq('tenant_id', session.tenantId).eq('id', id);
      if (error) throw new FeedError('FeedApiError', 'Could not archive the note.');
      const { error: histErr } = await client.from('student_note_flag_history').insert({
        tenant_id: session.tenantId, record_type: 'note', record_id: id,
        action: 'archived', performed_by: me.id, previous_value: 'active', new_value: 'archived',
      });
      if (histErr) throw new FeedError('FeedApiError', 'Note archived, but the history entry failed.');
    });
  }, [synthetic, mutateLive]);

  return {
    data, loading, error, reload, live, demo: synthetic,
    role: sessionRole, myId, myName, synthetic,
    loadDemo, exitDemo, canManage, visibleRecords,
    keyForStudent, canViewStudent,
    createNote, createFlag, updateRecord, resolveFlag, archiveNote,
  };
}
