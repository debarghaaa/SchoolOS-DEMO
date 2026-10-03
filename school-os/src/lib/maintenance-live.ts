import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureFeedClient, feedClaims, FeedError, FEED_SOURCE, type FeedClaims,
} from './supabase';
import {
  mapFacility, mapRequest, mapTask,
  type FacilityStatus, type MaintenanceData, type MaintenancePriority,
  type MaintenanceRequest, type MaintenanceTask, type RequestStatus, type TaskStatus,
} from './maintenance';
import {
  demoMaintenance, isMaintenanceDemoLoaded, mutateDemoMaintenance,
  setMaintenanceDemoLoaded, subscribeDemoMaintenance, subscribeMaintenanceDemoMode,
} from './maintenance-demo';

/* =====================================================================
   Maintenance data — live Supabase tables, or the synthetic one-click
   demo when Supabase is not configured.

   Unlike presence there is no FastAPI demo feed for maintenance: with no
   Supabase project the hook offers the clearly-badged example dataset
   instead of a login wall. Writes go through the same RLS that gates
   reads (admins manage in-tenant rows; teachers hold SELECT only), so the
   canManage flag below is UX routing — Postgres is the enforcement layer.
   ===================================================================== */

export const MAINTENANCE_LIVE = FEED_SOURCE === 'supabase';

export interface RequestInput {
  title: string;
  location: string;
  category: string;
  priority: MaintenancePriority;
  assignedStaff: string;
  expectedCompletion: string | null;
  description: string;
}

export type RequestPatch = Partial<RequestInput> & { status?: RequestStatus };

export interface TaskInput {
  task: string;
  location: string;
  category: string;
  scheduledDate: string;
  assignedStaff: string;
  notes: string;
}

export type TaskPatch = Partial<TaskInput> & { status?: TaskStatus };

export interface LiveMaintenance {
  data: MaintenanceData | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
  /** True once a realtime channel reports SUBSCRIBED (live source only). */
  live: boolean;
  /** True when rendering example data (synthetic one-click demo). */
  demo: boolean;
  role: string | null;
  /** Admins on live data, or anyone exploring the synthetic demo. */
  canManage: boolean;
  synthetic: boolean;
  loadDemo: () => void;
  exitDemo: () => void;
  createRequest: (input: RequestInput) => Promise<void>;
  updateRequest: (id: string, patch: RequestPatch) => Promise<void>;
  completeRequest: (id: string) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setFacilityStatus: (id: string, status: FacilityStatus, note?: string) => Promise<void>;
}

function demoId(prefix: string): string {
  return `demo-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchLiveMaintenance(client: SupabaseClient, claims: FeedClaims): Promise<MaintenanceData> {
  const [reqs, tasks, facs] = await Promise.all([
    client.from('maintenance_requests').select('*').eq('tenant_id', claims.tenantId)
      .order('reported_at', { ascending: false }),
    client.from('maintenance_tasks').select('*').eq('tenant_id', claims.tenantId)
      .order('scheduled_date', { ascending: true }),
    client.from('facilities').select('*').eq('tenant_id', claims.tenantId).order('name'),
  ]);
  if (reqs.error) throw new FeedError('FeedApiError', 'Could not load maintenance requests.');
  if (tasks.error) throw new FeedError('FeedApiError', 'Could not load scheduled maintenance.');
  if (facs.error) throw new FeedError('FeedApiError', 'Could not load facilities.');
  const rows = (d: unknown): Record<string, string | null>[] => (d ?? []) as Record<string, string | null>[];
  return {
    requests: rows(reqs.data).map(mapRequest),
    tasks: rows(tasks.data).map(mapTask),
    facilities: rows(facs.data).map(mapFacility),
    syncedAt: new Date(),
  };
}

const DEMO_ONLY = () => new FeedError(
  'DemoSourceError',
  'Maintenance has no demo API feed. Connect a Supabase project for live data, or explore the example dataset.',
);

export function useLiveMaintenance(): LiveMaintenance {
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [live, setLive] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [synthetic, setSynthetic] = useState(() => isMaintenanceDemoLoaded());
  const seq = useRef(0);
  const liveSource = MAINTENANCE_LIVE;

  const loadDemo = useCallback(() => setMaintenanceDemoLoaded(true), []);
  const exitDemo = useCallback(() => setMaintenanceDemoLoaded(false), []);

  useEffect(() => subscribeMaintenanceDemoMode(() => setSynthetic(isMaintenanceDemoLoaded())), []);

  // Synthetic demo: module-level data shared by every hook instance, so the
  // Overview card and the hero page always agree — including local edits.
  useEffect(() => {
    if (!synthetic) return;
    seq.current++;
    setData(demoMaintenance());
    setRole(null);
    setError(null);
    setLoading(false);
    return subscribeDemoMaintenance(() => {
      setData({ ...demoMaintenance(), syncedAt: new Date() });
    });
  }, [synthetic]);

  const apply = useCallback((id: number, next: MaintenanceData, claims: FeedClaims) => {
    if (id !== seq.current) return;
    setData(next);
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
        setData({ ...demoMaintenance(), syncedAt: new Date() });
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
      .then((client) => {
        const claims = feedClaims() as FeedClaims;
        return fetchLiveMaintenance(client, claims).then(
          (next) => apply(id, next, claims), (e: Error) => fail(id, e));
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
      .then((client) => {
        if (cancelled || id !== seq.current) return;
        const claims = feedClaims() as FeedClaims;
        const refetch = () => {
          fetchLiveMaintenance(client, claims).then(
            (next) => apply(id, next, claims), () => undefined);
        };
        fetchLiveMaintenance(client, claims).then(
          (next) => apply(id, next, claims), (e: Error) => fail(id, e));
        channel = client
          .channel(`maintenance:${claims.tenantId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'maintenance_requests',
            filter: `tenant_id=eq.${claims.tenantId}`,
          }, refetch)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'maintenance_tasks',
            filter: `tenant_id=eq.${claims.tenantId}`,
          }, refetch)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'facilities',
            filter: `tenant_id=eq.${claims.tenantId}`,
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

  /** Run a live mutation, then silently refresh so lists never go stale. */
  const mutateLive = useCallback(async (run: (client: SupabaseClient, claims: FeedClaims) => Promise<unknown>) => {
    if (!liveSource || synthetic) throw DEMO_ONLY();
    const client = await ensureFeedClient();
    const claims = feedClaims() as FeedClaims;
    if (claims.role !== 'school-admin') {
      throw new FeedError('ForbiddenError', 'Only school admins can change maintenance records.');
    }
    await run(client, claims);
    setData(await fetchLiveMaintenance(client, claims));
  }, [liveSource, synthetic]);

  const createRequest = useCallback(async (input: RequestInput) => {
    if (synthetic) {
      const now = new Date().toISOString();
      const req: MaintenanceRequest = {
        id: demoId('mreq'), title: input.title.trim(), location: input.location.trim(),
        category: input.category.trim() || 'General', priority: input.priority, status: 'open',
        reportedAt: now, assignedStaff: input.assignedStaff.trim(),
        expectedCompletion: input.expectedCompletion, completedAt: null,
        description: input.description.trim(),
      };
      mutateDemoMaintenance((d) => ({ ...d, requests: [req, ...d.requests], syncedAt: new Date() }));
      return;
    }
    await mutateLive(async (client, claims) => {
      const { error: err } = await client.from('maintenance_requests').insert({
        tenant_id: claims.tenantId, title: input.title.trim(), location: input.location.trim(),
        category: input.category.trim() || 'General', priority: input.priority,
        assigned_staff: input.assignedStaff.trim(),
        expected_completion: input.expectedCompletion, description: input.description.trim(),
      });
      if (err) throw new FeedError('FeedApiError', 'Could not create the maintenance request.');
    });
  }, [synthetic, mutateLive]);

  const updateRequest = useCallback(async (id: string, patch: RequestPatch) => {
    if (synthetic) {
      mutateDemoMaintenance((d) => ({
        ...d,
        requests: d.requests.map((r) => r.id === id ? {
          ...r,
          ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
          ...(patch.location !== undefined ? { location: patch.location.trim() } : {}),
          ...(patch.category !== undefined ? { category: patch.category.trim() || 'General' } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.assignedStaff !== undefined ? { assignedStaff: patch.assignedStaff.trim() } : {}),
          ...(patch.expectedCompletion !== undefined ? { expectedCompletion: patch.expectedCompletion } : {}),
          ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
          completedAt: patch.status === 'completed'
            ? (r.completedAt ?? new Date().toISOString())
            : (patch.status === undefined ? r.completedAt : null),
        } : r),
        syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, claims) => {
      const row: Record<string, string | null> = {};
      if (patch.title !== undefined) row.title = patch.title.trim();
      if (patch.location !== undefined) row.location = patch.location.trim();
      if (patch.category !== undefined) row.category = patch.category.trim() || 'General';
      if (patch.priority !== undefined) row.priority = patch.priority;
      if (patch.status !== undefined) {
        row.status = patch.status;
        row.completed_at = patch.status === 'completed' ? new Date().toISOString() : null;
      }
      if (patch.assignedStaff !== undefined) row.assigned_staff = patch.assignedStaff.trim();
      if (patch.expectedCompletion !== undefined) row.expected_completion = patch.expectedCompletion;
      if (patch.description !== undefined) row.description = patch.description.trim();
      const { error: err } = await client.from('maintenance_requests').update(row)
        .eq('tenant_id', claims.tenantId).eq('id', id);
      if (err) throw new FeedError('FeedApiError', 'Could not update the maintenance request.');
    });
  }, [synthetic, mutateLive]);

  const completeRequest = useCallback(
    (id: string) => updateRequest(id, { status: 'completed' }),
    [updateRequest],
  );

  const deleteRequest = useCallback(async (id: string) => {
    if (synthetic) {
      mutateDemoMaintenance((d) => ({
        ...d, requests: d.requests.filter((r) => r.id !== id), syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, claims) => {
      const { error: err } = await client.from('maintenance_requests').delete()
        .eq('tenant_id', claims.tenantId).eq('id', id);
      if (err) throw new FeedError('FeedApiError', 'Could not delete the maintenance request.');
    });
  }, [synthetic, mutateLive]);

  const createTask = useCallback(async (input: TaskInput) => {
    if (synthetic) {
      const task: MaintenanceTask = {
        id: demoId('mtask'), task: input.task.trim(), location: input.location.trim(),
        category: input.category.trim() || 'General', scheduledDate: input.scheduledDate,
        assignedStaff: input.assignedStaff.trim(), status: 'scheduled',
        completedAt: null, notes: input.notes.trim(),
      };
      mutateDemoMaintenance((d) => ({ ...d, tasks: [...d.tasks, task], syncedAt: new Date() }));
      return;
    }
    await mutateLive(async (client, claims) => {
      const { error: err } = await client.from('maintenance_tasks').insert({
        tenant_id: claims.tenantId, task: input.task.trim(), location: input.location.trim(),
        category: input.category.trim() || 'General', scheduled_date: input.scheduledDate,
        assigned_staff: input.assignedStaff.trim(), notes: input.notes.trim(),
      });
      if (err) throw new FeedError('FeedApiError', 'Could not schedule the maintenance task.');
    });
  }, [synthetic, mutateLive]);

  const updateTask = useCallback(async (id: string, patch: TaskPatch) => {
    if (synthetic) {
      mutateDemoMaintenance((d) => ({
        ...d,
        tasks: d.tasks.map((t) => t.id === id ? {
          ...t,
          ...(patch.task !== undefined ? { task: patch.task.trim() } : {}),
          ...(patch.location !== undefined ? { location: patch.location.trim() } : {}),
          ...(patch.category !== undefined ? { category: patch.category.trim() || 'General' } : {}),
          ...(patch.scheduledDate !== undefined ? { scheduledDate: patch.scheduledDate } : {}),
          ...(patch.assignedStaff !== undefined ? { assignedStaff: patch.assignedStaff.trim() } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes.trim() } : {}),
          completedAt: patch.status === 'completed'
            ? (t.completedAt ?? new Date().toISOString())
            : (patch.status === undefined ? t.completedAt : null),
        } : t),
        syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, claims) => {
      const row: Record<string, string | null> = {};
      if (patch.task !== undefined) row.task = patch.task.trim();
      if (patch.location !== undefined) row.location = patch.location.trim();
      if (patch.category !== undefined) row.category = patch.category.trim() || 'General';
      if (patch.scheduledDate !== undefined) row.scheduled_date = patch.scheduledDate;
      if (patch.assignedStaff !== undefined) row.assigned_staff = patch.assignedStaff.trim();
      if (patch.status !== undefined) {
        row.status = patch.status;
        row.completed_at = patch.status === 'completed' ? new Date().toISOString() : null;
      }
      if (patch.notes !== undefined) row.notes = patch.notes.trim();
      const { error: err } = await client.from('maintenance_tasks').update(row)
        .eq('tenant_id', claims.tenantId).eq('id', id);
      if (err) throw new FeedError('FeedApiError', 'Could not update the maintenance task.');
    });
  }, [synthetic, mutateLive]);

  const deleteTask = useCallback(async (id: string) => {
    if (synthetic) {
      mutateDemoMaintenance((d) => ({
        ...d, tasks: d.tasks.filter((t) => t.id !== id), syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, claims) => {
      const { error: err } = await client.from('maintenance_tasks').delete()
        .eq('tenant_id', claims.tenantId).eq('id', id);
      if (err) throw new FeedError('FeedApiError', 'Could not delete the maintenance task.');
    });
  }, [synthetic, mutateLive]);

  const setFacilityStatus = useCallback(async (id: string, status: FacilityStatus, note?: string) => {
    if (synthetic) {
      mutateDemoMaintenance((d) => ({
        ...d,
        facilities: d.facilities.map((f) => f.id === id
          ? { ...f, status, ...(note !== undefined ? { note: note.trim() } : {}) } : f),
        syncedAt: new Date(),
      }));
      return;
    }
    await mutateLive(async (client, claims) => {
      const row: Record<string, string> = { status };
      if (note !== undefined) row.note = note.trim();
      const { error: err } = await client.from('facilities').update(row)
        .eq('tenant_id', claims.tenantId).eq('id', id);
      if (err) throw new FeedError('FeedApiError', 'Could not update the facility status.');
    });
  }, [synthetic, mutateLive]);

  return {
    data, loading, error, reload, live, demo: synthetic, role,
    canManage: role === 'school-admin' || synthetic, synthetic,
    loadDemo, exitDemo,
    createRequest, updateRequest, completeRequest, deleteRequest,
    createTask, updateTask, deleteTask, setFacilityStatus,
  };
}
