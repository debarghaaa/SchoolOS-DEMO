import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureDemoSession, ensureFeedClient, feedApi, feedClaims, FeedError, FEED_SOURCE,
  type FeedClaims,
} from './supabase';
import type {
  Audience, FacultyPresenceRecord, PresenceSnapshot, StaffPresenceRecord, StudentPresenceRecord,
} from './presence';
import { demoSnapshot, isDemoLoaded, setDemoLoaded, subscribeDemoMode } from './presence-demo';

/* =====================================================================
   Presence snapshots — live Supabase feed, or the temporary FastAPI demo
   feed served from the local database when Supabase is not configured.

   Both sources return the same shape (directory + today's punch rows);
   only the transport differs: realtime subscription vs 20s polling. The
   UI badges the demo source so example data is never mistaken for live.
   RLS (live) / backend scoping (demo) enforces who may see what; the
   role checks here only route UX copy.
   ===================================================================== */

export type { Audience };

type RecordOf<A extends Audience> = A extends 'faculty'
  ? FacultyPresenceRecord : A extends 'staff' ? StaffPresenceRecord : StudentPresenceRecord;

const DIRECTORY_TABLE = { faculty: 'faculty', staff: 'staff_members', student: 'students' } as const;
const DEMO_ROUTE = { faculty: 'faculty', staff: 'staff', student: 'students' } as const;
const DEMO_POLL_MS = 20_000;

export const IS_DEMO_SOURCE = FEED_SOURCE === 'demo';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "07:52:00" → "07:52 AM", matching the app's punch-time format. */
function fmtPunch(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

function checkAudience(audience: Audience, claims: FeedClaims): void {
  if (audience === 'student') {
    // Teachers see assigned classes, students their own row, parents their
    // linked children (scoped by RLS / the demo feed). Admins stay on the
    // aggregate island — the row-level feed is never admin-visible in UX.
    if (claims.role !== 'teacher' && claims.role !== 'student' && claims.role !== 'parent') {
      throw new FeedError('ForbiddenError', 'The class presence feed is available to teachers, students and parents.');
    }
    return;
  }
  if (claims.role !== 'school-admin') {
    throw new FeedError('ForbiddenError', `The ${audience} presence feed is restricted to school admins.`);
  }
}

interface DayRow { person_id: string; status: 'present' | 'absent'; punch_in: string | null; punch_out: string | null }

function mergeSnapshot<A extends Audience>(
  audience: A, directory: Record<string, string | null>[], punches: DayRow[],
): PresenceSnapshot<RecordOf<A>> {
  const byPerson = new Map(punches.map((r) => [r.person_id, r]));
  const records = directory.map((row) => {
    const punch = byPerson.get(row.id as string);
    const status = punch?.status ?? 'absent';
    const base = {
      id: row.id as string,
      name: (row.name as string) ?? '',
      initials: (row.initials as string) ?? '',
      status,
      punchIn: status === 'present' ? fmtPunch(punch?.punch_in ?? null) : null,
      punchOut: status === 'present' ? fmtPunch(punch?.punch_out ?? null) : null,
    };
    if (audience === 'faculty') {
      return { ...base, subject: (row.subject as string) ?? '', dept: (row.dept as string) ?? '' };
    }
    if (audience === 'staff') {
      return {
        ...base, role: (row.role as string) ?? '', dept: (row.dept as string) ?? '',
        staffType: ((row.staff_type as string) ?? 'Support Staff'),
      };
    }
    return {
      ...base, grade: (row.grade as string) ?? '', section: (row.section as string) ?? '',
      roll: (row.roll as string) ?? '',
    };
  }) as RecordOf<A>[];

  records.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'present' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const present = records.filter((r) => r.status === 'present').length;
  return { records, present, absent: records.length - present, total: records.length, syncedAt: new Date() };
}

async function fetchLiveSnapshot<A extends Audience>(
  client: SupabaseClient, claims: FeedClaims, audience: A, day: string,
): Promise<PresenceSnapshot<RecordOf<A>>> {
  const [dir, feed] = await Promise.all([
    client.from(DIRECTORY_TABLE[audience]).select('*').eq('tenant_id', claims.tenantId),
    client.from('presence_days').select('person_id,status,punch_in,punch_out')
      .eq('tenant_id', claims.tenantId).eq('audience', audience).eq('day', day),
  ]);
  if (dir.error) throw new FeedError('FeedApiError', `Could not load the ${audience} roster.`);
  if (feed.error) throw new FeedError('FeedApiError', `Could not load today's ${audience} punches.`);
  return mergeSnapshot(audience, (dir.data ?? []) as Record<string, string | null>[], feed.data as DayRow[]);
}

interface DemoPayload {
  day: string;
  directory: Record<string, string | null>[];
  presence: DayRow[];
}

async function fetchDemoSnapshot<A extends Audience>(
  token: string, audience: A,
): Promise<PresenceSnapshot<RecordOf<A>>> {
  try {
    const payload = await feedApi<DemoPayload>(`/demo-feed/${DEMO_ROUTE[audience]}`, token);
    return mergeSnapshot(audience, payload.directory, payload.presence);
  } catch (e) {
    if (e instanceof FeedError && e.name === 'ForbiddenError') throw e;
    throw new FeedError(
      'FeedApiError',
      'Could not load the demo feed. Is the API running with demo data seeded?',
    );
  }
}

export interface LivePresence<A extends Audience> {
  data: PresenceSnapshot<RecordOf<A>> | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
  /** True once the realtime channel reports SUBSCRIBED (live source only). */
  live: boolean;
  /** True when rendering example data (demo source or synthetic one-click demo). */
  demo: boolean;
  role: string | null;
  /** True when showing the synthetic one-click demo (no login, no backend). */
  synthetic: boolean;
  loadDemo: () => void;
  exitDemo: () => void;
}

export function useLivePresence<A extends Audience>(audience: A): LivePresence<A> {
  const [data, setData] = useState<PresenceSnapshot<RecordOf<A>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [live, setLive] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [synthetic, setSynthetic] = useState(() => isDemoLoaded(audience));
  const seq = useRef(0);
  const day = useRef(todayLocal());
  const demo = IS_DEMO_SOURCE;

  const loadDemo = useCallback(() => setDemoLoaded(audience, true), [audience]);
  const exitDemo = useCallback(() => setDemoLoaded(audience, false), [audience]);

  // Synthetic one-click demo is module-level so an island and its detail
  // modal always agree; it bypasses the feed entirely.
  useEffect(() => subscribeDemoMode(() => setSynthetic(isDemoLoaded(audience))), [audience]);

  useEffect(() => {
    if (!synthetic) return;
    seq.current++;
    setData(demoSnapshot(audience));
    setRole(null);
    setError(null);
    setLoading(false);
  }, [synthetic, audience]);

  const apply = useCallback((id: number, snap: PresenceSnapshot<RecordOf<A>>, claims: FeedClaims) => {
    if (id !== seq.current) return;
    setData(snap);
    setRole(claims.role);
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
      // Re-stamp the synthetic snapshot without touching the feed.
      if (id === seq.current) {
        setData(demoSnapshot(audience));
        setError(null);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    if (demo) {
      ensureDemoSession()
        .then((s) => fetchDemoSnapshot(s.token, audience).then(
          (snap) => apply(id, snap, s.claims), (e: Error) => fail(id, e)))
        .catch((e: Error) => fail(id, e));
      return;
    }
    ensureFeedClient()
      .then((client) => {
        const claims = feedClaims() as FeedClaims;
        return fetchLiveSnapshot(client, claims, audience, day.current).then(
          (snap) => apply(id, snap, claims), (e: Error) => fail(id, e));
      })
      .catch((e: Error) => fail(id, e));
  }, [audience, demo, synthetic, apply, fail]);

  useEffect(() => {
    if (synthetic) return;
    const id = ++seq.current;
    let channel: { unsubscribe: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (demo) {
      const tick = () => {
        ensureDemoSession()
          .then((s) => {
            if (cancelled || id !== seq.current) return;
            checkAudience(audience, s.claims);
            return fetchDemoSnapshot(s.token, audience).then(
              (snap) => apply(id, snap, s.claims), (e: Error) => fail(id, e));
          })
          .catch((e: Error) => fail(id, e));
      };
      tick();
      timer = setInterval(() => { if (!cancelled) tick(); }, DEMO_POLL_MS);
      return () => {
        cancelled = true;
        seq.current++;
        if (timer) clearInterval(timer);
      };
    }

    ensureFeedClient()
      .then((client) => {
        if (cancelled || id !== seq.current) return;
        const claims = feedClaims() as FeedClaims;
        checkAudience(audience, claims);
        fetchLiveSnapshot(client, claims, audience, day.current).then(
          (snap) => apply(id, snap, claims), (e: Error) => fail(id, e));
        channel = client
          .channel(`presence:${audience}:${claims.tenantId}:${day.current}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'presence_days',
            filter: `tenant_id=eq.${claims.tenantId}`,
          }, () => {
            fetchLiveSnapshot(client, claims, audience, day.current).then(
              (snap) => apply(id, snap, claims), () => undefined);
          })
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
  }, [audience, synthetic]);

  return { data, loading, error, reload, live, demo: demo || synthetic, role, synthetic, loadDemo, exitDemo };
}

/* =====================================================================
   Student daily presence — whole-school / class / own / linked counts.

   One aggregate for the Overview island: Present/Total (never present-only),
   absent, and rate for today. Role routing mirrors the enforcement matrix:
   admins read the school aggregate, teachers their assigned classes, students
   their own row, parents their linked children. RLS (live) / backend scoping
   (demo) enforces it; the role checks here only pick the transport.
   ===================================================================== */

export interface StudentDailyCounts {
  day: string;
  total: number;
  present: number;
  absent: number;
  /** present / total, 0 when total is 0. */
  rate: number;
}

export interface StudentDailyPresence {
  data: StudentDailyCounts | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
  /** True once the realtime channel reports SUBSCRIBED (live source only). */
  live: boolean;
  /** True when rendering example data (demo source or synthetic one-click demo). */
  demo: boolean;
  role: string | null;
  /** Short scope caption for the island ("Whole school", "Your classes", …). */
  scopeLabel: string;
  /** True when showing the synthetic one-click demo (no login, no backend). */
  synthetic: boolean;
  loadDemo: () => void;
  exitDemo: () => void;
}

export function scopeLabelFor(role: string | null): string {
  if (role === 'school-admin') return 'Whole school';
  if (role === 'teacher') return 'Your classes';
  if (role === 'student') return 'You';
  if (role === 'parent') return 'Your children';
  return 'Your school';
}

function countsFromSnapshot(snap: PresenceSnapshot<StudentPresenceRecord>, day: string): StudentDailyCounts {
  return {
    day, total: snap.total, present: snap.present, absent: snap.absent,
    rate: snap.total === 0 ? 0 : snap.present / snap.total,
  };
}

async function fetchLiveCounts(
  client: SupabaseClient, claims: FeedClaims, day: string,
): Promise<StudentDailyCounts> {
  if (claims.role === 'school-admin') {
    // Aggregate-only: admins count the student audience without pulling
    // the per-student detail rows (those stay teacher-scoped in the UI).
    const [dir, feed] = await Promise.all([
      client.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', claims.tenantId),
      client.from('presence_days').select('person_id', { count: 'exact', head: true })
        .eq('tenant_id', claims.tenantId).eq('audience', 'student').eq('day', day).eq('status', 'present'),
    ]);
    if (dir.error) throw new FeedError('FeedApiError', 'Could not load the student roster.');
    if (feed.error) throw new FeedError('FeedApiError', "Could not load today's student punches.");
    const total = dir.count ?? 0;
    const present = Math.min(feed.count ?? 0, total);
    return { day, total, present, absent: total - present, rate: total === 0 ? 0 : present / total };
  }
  return countsFromSnapshot(await fetchLiveSnapshot(client, claims, 'student', day), day);
}

interface AttendancePayload { day: string; total: number; present: number; absent: number }

async function fetchDemoCounts(token: string, role: string): Promise<StudentDailyCounts> {
  try {
    if (role === 'school-admin') {
      const p = await feedApi<AttendancePayload>('/demo-feed/school-attendance', token);
      return { ...p, rate: p.total === 0 ? 0 : p.present / p.total };
    }
    return countsFromSnapshot(await fetchDemoSnapshot(token, 'student'), todayLocal());
  } catch (e) {
    if (e instanceof FeedError && e.name === 'ForbiddenError') throw e;
    throw new FeedError(
      'FeedApiError',
      'Could not load the demo feed. Is the API running with demo data seeded?',
    );
  }
}

export function useStudentDailyPresence(): StudentDailyPresence {
  const [data, setData] = useState<StudentDailyCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [live, setLive] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  // Shares the student demo-mode key so the island and the attendance detail
  // view always agree on synthetic vs feed data.
  const [synthetic, setSynthetic] = useState(() => isDemoLoaded('student'));
  const seq = useRef(0);
  const day = useRef(todayLocal());
  const demo = IS_DEMO_SOURCE;

  const loadDemo = useCallback(() => setDemoLoaded('student', true), []);
  const exitDemo = useCallback(() => setDemoLoaded('student', false), []);

  useEffect(() => subscribeDemoMode(() => setSynthetic(isDemoLoaded('student'))), []);

  useEffect(() => {
    if (!synthetic) return;
    seq.current++;
    setData(countsFromSnapshot(demoSnapshot('student'), todayLocal()));
    setRole(null);
    setError(null);
    setLoading(false);
  }, [synthetic]);

  const apply = useCallback((id: number, counts: StudentDailyCounts, claims: FeedClaims) => {
    if (id !== seq.current) return;
    setData(counts);
    setRole(claims.role);
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
        setData(countsFromSnapshot(demoSnapshot('student'), todayLocal()));
        setError(null);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    if (demo) {
      ensureDemoSession()
        .then((s) => fetchDemoCounts(s.token, s.claims.role).then(
          (counts) => apply(id, counts, s.claims), (e: Error) => fail(id, e)))
        .catch((e: Error) => fail(id, e));
      return;
    }
    ensureFeedClient()
      .then((client) => {
        const claims = feedClaims() as FeedClaims;
        return fetchLiveCounts(client, claims, day.current).then(
          (counts) => apply(id, counts, claims), (e: Error) => fail(id, e));
      })
      .catch((e: Error) => fail(id, e));
  }, [demo, synthetic, apply, fail]);

  useEffect(() => {
    if (synthetic) return;
    const id = ++seq.current;
    let channel: { unsubscribe: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (demo) {
      const tick = () => {
        ensureDemoSession()
          .then((s) => {
            if (cancelled || id !== seq.current) return;
            return fetchDemoCounts(s.token, s.claims.role).then(
              (counts) => apply(id, counts, s.claims), (e: Error) => fail(id, e));
          })
          .catch((e: Error) => fail(id, e));
      };
      tick();
      timer = setInterval(() => { if (!cancelled) tick(); }, DEMO_POLL_MS);
      return () => {
        cancelled = true;
        seq.current++;
        if (timer) clearInterval(timer);
      };
    }

    ensureFeedClient()
      .then((client) => {
        if (cancelled || id !== seq.current) return;
        const claims = feedClaims() as FeedClaims;
        fetchLiveCounts(client, claims, day.current).then(
          (counts) => apply(id, counts, claims), (e: Error) => fail(id, e));
        channel = client
          .channel(`presence:student-counts:${claims.tenantId}:${day.current}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'presence_days',
            filter: `tenant_id=eq.${claims.tenantId}`,
          }, () => {
            fetchLiveCounts(client, claims, day.current).then(
              (counts) => apply(id, counts, claims), () => undefined);
          })
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

  return {
    data, loading, error, reload, live, demo: demo || synthetic, role,
    scopeLabel: scopeLabelFor(role), synthetic, loadDemo, exitDemo,
  };
}
