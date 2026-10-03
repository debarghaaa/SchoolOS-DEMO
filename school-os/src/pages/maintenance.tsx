import { useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, Eye, Pencil, Plus, Trash2, Wrench,
} from 'lucide-react';
import {
  FACILITY_STATUS_LABEL, FACILITY_STATUSES, isOverdue, maintenanceCounts,
  PRIORITIES, PRIORITY_LABEL, REQUEST_STATUS_LABEL, REQUEST_STATUSES, TASK_STATUS_LABEL, todayLocal,
  type Facility, type FacilityStatus, type MaintenanceData, type MaintenancePriority,
  type MaintenanceRequest, type MaintenanceTask, type RequestStatus, type TaskStatus,
} from '../lib/maintenance';
import { MAINTENANCE_LIVE, useLiveMaintenance, type RequestInput, type RequestPatch, type TaskInput } from '../lib/maintenance-live';
import { useApp } from '../lib/store';
import { ConnectFeedModal } from '../components/presence';
import {
  DataTable, Drawer, EmptyState, ErrorState, FieldLabel, GlassButton, GlassCard,
  GlassInput, GlassSelect, GlassTextarea, LoadingCards, MetricCard, Modal, SectionHead, StatusBadge,
} from '../components/glass';

/* =====================================================================
   Maintenance — hero metrics, issue board, scheduled work, facilities.

   Live Supabase tables (admins manage, teachers read) or the badged
   synthetic demo when Supabase is not configured. RLS enforces the
   matrix; canManage only routes the controls.
   ===================================================================== */

/* ---------------- formatting + tone maps ---------------- */

function fmtDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const PRIORITY_TONE: Record<MaintenancePriority, string> = {
  critical: 'overdue', high: 'late', medium: 'active', low: 'neutral',
};
const REQUEST_TONE: Record<RequestStatus, string> = {
  open: 'pending', in_progress: 'active', completed: 'success',
};
const TASK_TONE: Record<TaskStatus, string> = {
  scheduled: 'neutral', in_progress: 'active', completed: 'success', cancelled: 'closed',
};
const FACILITY_TONE: Record<FacilityStatus, string> = {
  operational: 'success', maintenance_required: 'late', under_maintenance: 'active', unavailable: 'overdue',
};

function SourceNote({ live, demo, synthetic, onExitDemo }: {
  live: boolean; demo: boolean; synthetic: boolean; onExitDemo: () => void;
}) {
  if (!live && !demo) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-secondary">
      {live ? (
        <span className="inline-flex items-center gap-1" title="Realtime feed connected">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Live
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-1.5 py-px text-warning"
          title="Synthetic example data — no login, nothing is real"
        >
          <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
          Demo
        </span>
      )}
      {synthetic ? (
        <> · <button type="button" onClick={onExitDemo} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-text-primary">Exit demo</button></>
      ) : null}
    </p>
  );
}

/* ---------------- request form (add / edit) ---------------- */

const CATEGORIES = ['Plumbing', 'Electrical', 'Civil', 'IT', 'HVAC', 'Safety', 'General'];

function RequestFormModal({ initial, busy, formError, onClose, onSave }: {
  initial: MaintenanceRequest | null; busy: boolean; formError: string | null;
  onClose: () => void; onSave: (input: RequestInput, status: RequestStatus) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'General');
  const [priority, setPriority] = useState<MaintenancePriority>(initial?.priority ?? 'medium');
  const [status, setStatus] = useState<RequestStatus>(initial?.status ?? 'open');
  const [assignedStaff, setAssignedStaff] = useState(initial?.assignedStaff ?? '');
  const [expectedCompletion, setExpectedCompletion] = useState(initial?.expectedCompletion ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  return (
    <Modal
      open onClose={onClose} title={initial ? 'Update request' : 'New maintenance request'}
      subtitle={initial ? initial.title : 'Raise a repair request for the campus team.'} width="max-w-xl"
      footer={(
        <>
          <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton
            variant="primary" disabled={busy || title.trim() === ''}
            onClick={() => onSave({
              title, location, category, priority, assignedStaff,
              expectedCompletion: expectedCompletion === '' ? null : expectedCompletion,
              description,
            }, status)}
          >
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Raise request'}
          </GlassButton>
        </>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="mreq-title">Issue</FieldLabel>
          <GlassInput id="mreq-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Burst pipe in Block A restroom" />
        </div>
        <div>
          <FieldLabel htmlFor="mreq-location">Location</FieldLabel>
          <GlassInput id="mreq-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Ground Floor Restrooms" />
        </div>
        <div>
          <FieldLabel htmlFor="mreq-category">Category</FieldLabel>
          <GlassSelect id="mreq-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Array.from(new Set([...CATEGORIES, category])).map((c) => <option key={c} value={c}>{c}</option>)}
          </GlassSelect>
        </div>
        <div>
          <FieldLabel htmlFor="mreq-priority">Priority</FieldLabel>
          <GlassSelect id="mreq-priority" value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </GlassSelect>
        </div>
        {initial ? (
          <div>
            <FieldLabel htmlFor="mreq-status">Status</FieldLabel>
            <GlassSelect id="mreq-status" value={status} onChange={(e) => setStatus(e.target.value as RequestStatus)}>
              {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}
            </GlassSelect>
          </div>
        ) : null}
        <div>
          <FieldLabel htmlFor="mreq-assignee">Assigned staff</FieldLabel>
          <GlassInput id="mreq-assignee" value={assignedStaff} onChange={(e) => setAssignedStaff(e.target.value)} placeholder="Leave blank to triage later" />
        </div>
        <div>
          <FieldLabel htmlFor="mreq-expected">Expected completion</FieldLabel>
          <GlassInput id="mreq-expected" type="date" value={expectedCompletion} onChange={(e) => setExpectedCompletion(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="mreq-desc">Description</FieldLabel>
          <GlassTextarea id="mreq-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is wrong, impact, access notes…" />
        </div>
      </div>
      {formError ? <p className="mt-3 text-[12.5px] text-error">{formError}</p> : null}
    </Modal>
  );
}

/* ---------------- task form (add / edit) ---------------- */

function TaskFormModal({ initial, busy, formError, onClose, onSave }: {
  initial: MaintenanceTask | null; busy: boolean; formError: string | null;
  onClose: () => void; onSave: (input: TaskInput) => void;
}) {
  const [task, setTask] = useState(initial?.task ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'General');
  const [scheduledDate, setScheduledDate] = useState(initial?.scheduledDate ?? todayLocal());
  const [assignedStaff, setAssignedStaff] = useState(initial?.assignedStaff ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <Modal
      open onClose={onClose} title={initial ? 'Update scheduled task' : 'Schedule maintenance'}
      subtitle={initial ? initial.task : 'Plan preventive work for the campus team.'} width="max-w-xl"
      footer={(
        <>
          <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton
            variant="primary" disabled={busy || task.trim() === '' || scheduledDate === ''}
            onClick={() => onSave({ task, location, category, scheduledDate, assignedStaff, notes })}
          >
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Schedule task'}
          </GlassButton>
        </>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="mtask-task">Task</FieldLabel>
          <GlassInput id="mtask-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Quarterly fire extinguisher inspection" />
        </div>
        <div>
          <FieldLabel htmlFor="mtask-location">Location</FieldLabel>
          <GlassInput id="mtask-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main Building" />
        </div>
        <div>
          <FieldLabel htmlFor="mtask-category">Category</FieldLabel>
          <GlassSelect id="mtask-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Array.from(new Set([...CATEGORIES, category])).map((c) => <option key={c} value={c}>{c}</option>)}
          </GlassSelect>
        </div>
        <div>
          <FieldLabel htmlFor="mtask-date">Scheduled date</FieldLabel>
          <GlassInput id="mtask-date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="mtask-assignee">Assigned staff</FieldLabel>
          <GlassInput id="mtask-assignee" value={assignedStaff} onChange={(e) => setAssignedStaff(e.target.value)} placeholder="Leave blank to assign later" />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="mtask-notes">Notes</FieldLabel>
          <GlassTextarea id="mtask-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope, access notes…" />
        </div>
      </div>
      {formError ? <p className="mt-3 text-[12.5px] text-error">{formError}</p> : null}
    </Modal>
  );
}

/* ---------------- facility status ---------------- */

function FacilityModal({ facility, busy, formError, onClose, onSave }: {
  facility: Facility; busy: boolean; formError: string | null;
  onClose: () => void; onSave: (status: FacilityStatus, note: string) => void;
}) {
  const [status, setStatus] = useState<FacilityStatus>(facility.status);
  const [note, setNote] = useState(facility.note);

  return (
    <Modal
      open onClose={onClose} title={facility.name} subtitle={`${facility.kind} · update facility status`} width="max-w-md"
      footer={(
        <>
          <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" disabled={busy} onClick={() => onSave(status, note)}>
            {busy ? 'Saving…' : 'Save status'}
          </GlassButton>
        </>
      )}
    >
      <div className="grid gap-3">
        <div>
          <FieldLabel htmlFor="mfac-status">Status</FieldLabel>
          <GlassSelect id="mfac-status" value={status} onChange={(e) => setStatus(e.target.value as FacilityStatus)}>
            {FACILITY_STATUSES.map((s) => <option key={s} value={s}>{FACILITY_STATUS_LABEL[s]}</option>)}
          </GlassSelect>
        </div>
        <div>
          <FieldLabel htmlFor="mfac-note">Status note</FieldLabel>
          <GlassInput id="mfac-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Plumbing refit in progress" />
        </div>
      </div>
      {formError ? <p className="mt-3 text-[12.5px] text-error">{formError}</p> : null}
    </Modal>
  );
}

/* ---------------- filters ---------------- */

type StatusTab = 'all' | RequestStatus | 'overdue';

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'overdue', label: 'Overdue' },
];

function dueSoon(r: MaintenanceRequest, today: string): boolean {
  if (r.status === 'completed' || r.expectedCompletion === null) return false;
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return r.expectedCompletion >= today && r.expectedCompletion <= endStr;
}

/* ---------------- hero page ---------------- */

export function Maintenance() {
  const q = useLiveMaintenance();
  const { pushToast } = useApp();
  const d = q.data;
  const today = todayLocal();

  const [tab, setTab] = useState<StatusTab>('all');
  const [priority, setPriority] = useState<'all' | MaintenancePriority>('all');
  const [category, setCategory] = useState<string>('all');
  const [locationF, setLocationF] = useState<string>('all');
  const [assignee, setAssignee] = useState<string>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dueSoonOnly, setDueSoonOnly] = useState(false);

  const [viewing, setViewing] = useState<MaintenanceRequest | null>(null);
  const [editing, setEditing] = useState<MaintenanceRequest | null>(null);
  const [adding, setAdding] = useState(false);
  const [taskAdding, setTaskAdding] = useState(false);
  const [taskEditing, setTaskEditing] = useState<MaintenanceTask | null>(null);
  const [facilityEditing, setFacilityEditing] = useState<Facility | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'request' | 'task'; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const counts = useMemo(() => (d ? maintenanceCounts(d, today) : null), [d, today]);

  const categories = useMemo(
    () => Array.from(new Set((d?.requests ?? []).map((r) => r.category))).sort(), [d]);
  const locations = useMemo(
    () => Array.from(new Set((d?.requests ?? []).map((r) => r.location).filter((l) => l !== ''))).sort(), [d]);
  const assignees = useMemo(
    () => Array.from(new Set((d?.requests ?? []).map((r) => r.assignedStaff).filter((a) => a !== ''))).sort(), [d]);

  const rows = useMemo(() => (d?.requests ?? []).filter((r) =>
    (tab === 'all' || (tab === 'overdue' ? isOverdue(r, today) : r.status === tab)) &&
    (priority === 'all' || r.priority === priority) &&
    (category === 'all' || r.category === category) &&
    (locationF === 'all' || r.location === locationF) &&
    (assignee === 'all' || r.assignedStaff === assignee) &&
    (!overdueOnly || isOverdue(r, today)) &&
    (!dueSoonOnly || dueSoon(r, today))), [d, tab, priority, category, locationF, assignee, overdueOnly, dueSoonOnly, today]);

  const filtersActive = tab !== 'all' || priority !== 'all' || category !== 'all' ||
    locationF !== 'all' || assignee !== 'all' || overdueOnly || dueSoonOnly;
  const clearFilters = () => {
    setTab('all'); setPriority('all'); setCategory('all'); setLocationF('all');
    setAssignee('all'); setOverdueOnly(false); setDueSoonOnly(false);
  };

  const run = async (label: string, fn: () => Promise<void>, done?: () => void) => {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
      pushToast({ title: label, body: q.synthetic ? 'Saved to the example dataset.' : 'Saved to the live feed.', tone: 'success' });
      done?.();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!d) {
    if (q.loading) return <LoadingCards count={5} />;
    const needsLogin = q.error?.name === 'SigninRequiredError' && MAINTENANCE_LIVE;
    return (
      <div className="space-y-4">
        <ErrorState title="Could not load maintenance" body={q.error?.message ?? 'Please try again.'} onRetry={q.reload} />
        <div className="flex justify-center">
          {needsLogin ? (
            <GlassButton variant="primary" onClick={() => setConnectOpen(true)}>Connect</GlassButton>
          ) : (
            <GlassButton variant="primary" icon={<Wrench size={15} />} onClick={q.loadDemo}>
              Load example data
            </GlassButton>
          )}
        </div>
        {needsLogin ? (
          <div className="flex justify-center">
            <button
              type="button" onClick={q.loadDemo}
              className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
            >
              or load demo data
            </button>
          </div>
        ) : (
          <p className="text-center font-mono text-[11px] text-text-secondary">No login needed · synthetic example data</p>
        )}
        {connectOpen ? (
          <ConnectFeedModal
            audience="student" subject="maintenance" onClose={() => setConnectOpen(false)}
            onConnected={() => { setConnectOpen(false); q.reload(); }}
            onLoadDemo={() => { setConnectOpen(false); q.loadDemo(); }}
          />
        ) : null}
      </div>
    );
  }
  const c = counts as NonNullable<typeof counts>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SourceNote live={q.live} demo={q.demo} synthetic={q.synthetic} onExitDemo={q.exitDemo} />
        {!q.canManage ? (
          <p className="font-mono text-[11px] text-text-secondary">Read-only for teachers — the front office manages requests.</p>
        ) : null}
      </div>

      {/* hero metrics */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Open" value={String(c.open)} sub={`${c.totalRequests} total requests`} index={0} />
        <MetricCard label="In Progress" value={String(c.inProgress)} sub="with the campus team" index={1} />
        <MetricCard label="Scheduled" value={String(c.scheduledTasks)} sub="upcoming tasks" icon={<CalendarClock size={16} />} index={2} />
        <MetricCard label="Completed" value={String(c.completed)} sub="requests resolved" index={3} />
        <MetricCard
          label="Critical Issues" value={String(c.critical)}
          delta={c.critical > 0 ? 'needs attention' : 'all clear'} deltaTone={c.critical > 0 ? 'down' : 'up'}
          icon={<AlertTriangle size={16} />} index={4}
        />
      </div>

      {/* maintenance overview */}
      <GlassCard>
        <SectionHead title="Maintenance overview" body="Every request by lifecycle state, plus what is slipping." />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Total', value: c.totalRequests, tone: '' },
            { label: 'Open', value: c.open, tone: '' },
            { label: 'In Progress', value: c.inProgress, tone: '' },
            { label: 'Completed', value: c.completed, tone: '' },
            { label: 'Overdue', value: c.overdue, tone: c.overdue > 0 ? 'text-error' : '' },
            { label: 'Scheduled', value: c.scheduledTasks, tone: '' },
          ].map((t) => (
            <div key={t.label} data-glass="secondary" className="glass-surface rounded-2xl px-4 py-3">
              <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-secondary uppercase">{t.label}</p>
              <p className={`font-display mt-0.5 text-[26px] leading-none font-bold text-text-primary tabular-nums ${t.tone}`}>{t.value}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* active issues */}
      <GlassCard>
        <SectionHead
          title="Active issues" body="Search, filter and manage every repair request."
          action={q.canManage ? (
            <GlassButton variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => { setFormError(null); setAdding(true); }}>
              New request
            </GlassButton>
          ) : undefined}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-300 ${tab === t.id ? 'border-periwinkle-3/60 bg-periwinkle/50 text-text-primary' : 'border-white/30 bg-white/20 text-text-secondary hover:bg-white/35 hover:text-text-primary'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <GlassSelect aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as 'all' | MaintenancePriority)}>
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </GlassSelect>
          <GlassSelect aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((x) => <option key={x} value={x}>{x}</option>)}
          </GlassSelect>
          <GlassSelect aria-label="Filter by location" value={locationF} onChange={(e) => setLocationF(e.target.value)}>
            <option value="all">All locations</option>
            {locations.map((x) => <option key={x} value={x}>{x}</option>)}
          </GlassSelect>
          <GlassSelect aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="all">All assignees</option>
            {assignees.map((x) => <option key={x} value={x}>{x}</option>)}
          </GlassSelect>
          <button
            type="button" onClick={() => setOverdueOnly((v) => !v)} aria-pressed={overdueOnly}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-300 ${overdueOnly ? 'border-error/50 bg-error/10 text-error' : 'border-white/30 bg-white/20 text-text-secondary hover:bg-white/35 hover:text-text-primary'}`}
          >
            Overdue only
          </button>
          <button
            type="button" onClick={() => setDueSoonOnly((v) => !v)} aria-pressed={dueSoonOnly}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-300 ${dueSoonOnly ? 'border-warning/50 bg-warning/10 text-warning' : 'border-white/30 bg-white/20 text-text-secondary hover:bg-white/35 hover:text-text-primary'}`}
          >
            Due in 7 days
          </button>
          {filtersActive ? (
            <button
              type="button" onClick={clearFilters}
              className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
            >
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="mt-3">
          <DataTable<MaintenanceRequest>
            rows={rows} pageSize={8} searchable searchKeys={['title', 'location', 'assignedStaff', 'description']}
            searchPlaceholder="Search issues, locations, assignees…"
            emptyTitle="No issues match" emptyBody="Try adjusting the search or filters."
            columns={[
              {
                key: 'issue', header: 'Issue', sortable: true, sortValue: (r) => r.title,
                render: (r) => (
                  <div className="min-w-[180px]">
                    <p className="text-[13.5px] font-semibold text-text-primary">{r.title}</p>
                    {r.description ? <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">{r.description}</p> : null}
                  </div>
                ),
              },
              {
                key: 'location', header: 'Location', sortable: true, sortValue: (r) => r.location,
                render: (r) => <span className="text-[13px] text-text-secondary">{r.location || '—'}</span>,
              },
              {
                key: 'priority', header: 'Priority', sortable: true,
                sortValue: (r) => PRIORITIES.indexOf(r.priority),
                render: (r) => <StatusBadge tone={PRIORITY_TONE[r.priority]} dot>{PRIORITY_LABEL[r.priority]}</StatusBadge>,
              },
              {
                key: 'status', header: 'Status', sortable: true,
                sortValue: (r) => REQUEST_STATUSES.indexOf(r.status),
                render: (r) => <StatusBadge tone={REQUEST_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</StatusBadge>,
              },
              {
                key: 'reported', header: 'Reported', sortable: true, sortValue: (r) => r.reportedAt,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtStamp(r.reportedAt)}</span>,
              },
              {
                key: 'assigned', header: 'Assigned', sortable: true, sortValue: (r) => r.assignedStaff,
                render: (r) => <span className="text-[13px] text-text-secondary">{r.assignedStaff || 'Unassigned'}</span>,
              },
              {
                key: 'expected', header: 'Expected', sortable: true, sortValue: (r) => r.expectedCompletion ?? '~~~~',
                render: (r) => (
                  <span className="inline-flex flex-col gap-1">
                    <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">
                      {r.expectedCompletion ? fmtDay(r.expectedCompletion) : '—'}
                    </span>
                    {isOverdue(r, today) ? <StatusBadge tone="overdue">Overdue</StatusBadge> : null}
                  </span>
                ),
              },
              {
                key: 'actions', header: 'Actions',
                render: (r) => (
                  <span className="inline-flex items-center gap-1">
                    <button type="button" title="View" aria-label={`View ${r.title}`} onClick={() => setViewing(r)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                      <Eye size={15} />
                    </button>
                    {q.canManage ? (
                      <>
                        <button type="button" title="Edit" aria-label={`Edit ${r.title}`} onClick={() => { setFormError(null); setEditing(r); }} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                          <Pencil size={15} />
                        </button>
                        {r.status !== 'completed' ? (
                          <button type="button" title="Mark complete" aria-label={`Complete ${r.title}`} onClick={() => void run('Request completed', () => q.completeRequest(r.id))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-success">
                            <CheckCircle2 size={15} />
                          </button>
                        ) : null}
                        <button type="button" title="Delete" aria-label={`Delete ${r.title}`} onClick={() => setDeleting({ kind: 'request', id: r.id, label: r.title })} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-error/15 hover:text-error">
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : null}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </GlassCard>

      {/* scheduled maintenance */}
      <GlassCard>
        <SectionHead
          title="Scheduled maintenance" body="Preventive work on the calendar."
          action={q.canManage ? (
            <GlassButton variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => { setFormError(null); setTaskAdding(true); }}>
              Schedule task
            </GlassButton>
          ) : undefined}
        />
        <div className="mt-3">
          <DataTable<MaintenanceTask>
            rows={d.tasks} pageSize={6}
            emptyTitle="Nothing scheduled" emptyBody={q.canManage ? 'Schedule the first preventive task.' : 'No preventive work on the calendar yet.'}
            columns={[
              {
                key: 'task', header: 'Task', sortable: true, sortValue: (t) => t.task,
                render: (t) => (
                  <div className="min-w-[180px]">
                    <p className="text-[13.5px] font-semibold text-text-primary">{t.task}</p>
                    {t.notes ? <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">{t.notes}</p> : null}
                  </div>
                ),
              },
              {
                key: 'location', header: 'Location',
                render: (t) => <span className="text-[13px] text-text-secondary">{t.location || '—'}</span>,
              },
              {
                key: 'date', header: 'Scheduled', sortable: true, sortValue: (t) => t.scheduledDate,
                render: (t) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtDay(t.scheduledDate)}</span>,
              },
              {
                key: 'assigned', header: 'Assigned',
                render: (t) => <span className="text-[13px] text-text-secondary">{t.assignedStaff || 'Unassigned'}</span>,
              },
              {
                key: 'status', header: 'Status',
                render: (t) => <StatusBadge tone={TASK_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</StatusBadge>,
              },
              ...(q.canManage ? [{
                key: 'actions', header: 'Actions',
                render: (t: MaintenanceTask) => (
                  <span className="inline-flex items-center gap-1">
                    <button type="button" title="Edit" aria-label={`Edit ${t.task}`} onClick={() => { setFormError(null); setTaskEditing(t); }} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                      <Pencil size={15} />
                    </button>
                    <button type="button" title="Delete" aria-label={`Delete ${t.task}`} onClick={() => setDeleting({ kind: 'task', id: t.id, label: t.task })} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-error/15 hover:text-error">
                      <Trash2 size={15} />
                    </button>
                  </span>
                ),
              }] : []),
            ]}
          />
        </div>
      </GlassCard>

      {/* facility status */}
      <GlassCard>
        <SectionHead title="Facility status" body="Live condition of every campus facility." />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {d.facilities.map((f) => (
            <div key={f.id} className="rounded-2xl border border-white/30 bg-white/20 px-4 py-3.5 transition-all duration-300 hover:border-white/50 hover:bg-white/35">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-periwinkle-2/50 bg-periwinkle-2/40 text-text-secondary">
                    <Building2 size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-text-primary">{f.name}</p>
                    <p className="text-[11.5px] text-text-secondary">{f.kind}</p>
                  </div>
                </div>
                <StatusBadge tone={FACILITY_TONE[f.status]} dot>{FACILITY_STATUS_LABEL[f.status]}</StatusBadge>
              </div>
              {f.note ? <p className="mt-2 text-[12px] text-text-secondary">{f.note}</p> : null}
              {q.canManage ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button" onClick={() => { setFormError(null); setFacilityEditing(f); }}
                    className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
                  >
                    Update status
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {d.facilities.length === 0 ? (
          <EmptyState title="No facilities" body="No campus facilities are tracked yet." compact />
        ) : null}
      </GlassCard>

      {/* view drawer */}
      <Drawer
        open={viewing !== null} onClose={() => setViewing(null)}
        title={viewing?.title ?? ''} subtitle={viewing ? `${viewing.location || 'No location'} · reported ${fmtStamp(viewing.reportedAt)}` : ''}
        footer={viewing && q.canManage ? (
          <>
            {viewing.status !== 'completed' ? (
              <GlassButton variant="glass" icon={<CheckCircle2 size={15} />} onClick={() => viewing && void run('Request completed', () => q.completeRequest(viewing.id), () => setViewing(null))}>
                Complete
              </GlassButton>
            ) : null}
            <GlassButton variant="primary" icon={<Pencil size={15} />} onClick={() => { if (viewing) { setFormError(null); setEditing(viewing); setViewing(null); } }}>
              Edit
            </GlassButton>
          </>
        ) : undefined}
      >
        {viewing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={PRIORITY_TONE[viewing.priority]} dot>{PRIORITY_LABEL[viewing.priority]} priority</StatusBadge>
              <StatusBadge tone={REQUEST_TONE[viewing.status]}>{REQUEST_STATUS_LABEL[viewing.status]}</StatusBadge>
              <StatusBadge tone="neutral">{viewing.category}</StatusBadge>
              {isOverdue(viewing, today) ? <StatusBadge tone="overdue">Overdue</StatusBadge> : null}
            </div>
            {viewing.description ? <p className="text-[13.5px] leading-relaxed text-text-primary">{viewing.description}</p> : (
              <p className="text-[13px] text-text-secondary italic">No description provided.</p>
            )}
            <dl className="grid grid-cols-2 gap-3">
              {[
                { k: 'Assigned', v: viewing.assignedStaff || 'Unassigned' },
                { k: 'Expected', v: viewing.expectedCompletion ? fmtDay(viewing.expectedCompletion) : 'No target date' },
                { k: 'Reported', v: fmtStamp(viewing.reportedAt) },
                { k: 'Completed', v: viewing.completedAt ? fmtStamp(viewing.completedAt) : '—' },
              ].map((f) => (
                <div key={f.k} data-glass="secondary" className="glass-surface rounded-2xl px-3.5 py-2.5">
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-text-secondary uppercase">{f.k}</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold text-text-primary">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </Drawer>

      {/* request add/edit */}
      {(adding || editing) ? (
        <RequestFormModal
          initial={editing} busy={busy} formError={formError}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={(input, status) => {
            if (editing) {
              const patch: RequestPatch = { ...input };
              if (status !== editing.status) patch.status = status;
              void run('Request updated', () => q.updateRequest(editing.id, patch), () => setEditing(null));
            } else {
              void run('Request raised', () => q.createRequest(input), () => setAdding(false));
            }
          }}
        />
      ) : null}

      {/* task add/edit */}
      {(taskAdding || taskEditing) ? (
        <TaskFormModal
          initial={taskEditing} busy={busy} formError={formError}
          onClose={() => { setTaskAdding(false); setTaskEditing(null); }}
          onSave={(input) => {
            if (taskEditing) {
              void run('Task updated', () => q.updateTask(taskEditing.id, input), () => setTaskEditing(null));
            } else {
              void run('Task scheduled', () => q.createTask(input), () => setTaskAdding(false));
            }
          }}
        />
      ) : null}

      {/* facility status */}
      {facilityEditing ? (
        <FacilityModal
          facility={facilityEditing} busy={busy} formError={formError}
          onClose={() => setFacilityEditing(null)}
          onSave={(status, note) => void run(
            'Facility updated', () => q.setFacilityStatus(facilityEditing.id, status, note), () => setFacilityEditing(null))}
        />
      ) : null}

      {/* delete confirm */}
      {deleting ? (
        <Modal
          open onClose={() => setDeleting(null)} title={`Delete ${deleting.kind}`}
          subtitle={deleting.label} width="max-w-sm"
          footer={(
            <>
              <GlassButton variant="ghost" onClick={() => setDeleting(null)}>Cancel</GlassButton>
              <GlassButton
                variant="danger-ghost" disabled={busy}
                onClick={() => {
                  const target = deleting;
                  void run(
                    `${target.kind === 'request' ? 'Request' : 'Task'} deleted`,
                    () => (target.kind === 'request' ? q.deleteRequest(target.id) : q.deleteTask(target.id)),
                    () => setDeleting(null),
                  );
                }}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </GlassButton>
            </>
          )}
        >
          <p className="text-[13.5px] text-text-secondary">
            This permanently removes “{deleting.label}”. This cannot be undone.
          </p>
          {formError ? <p className="mt-3 text-[12.5px] text-error">{formError}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------- Overview summary card ---------------- */

export function MaintenanceSummaryCard() {
  const q = useLiveMaintenance();
  const { go } = useApp();
  const d: MaintenanceData | null = q.data;
  const c = d ? maintenanceCounts(d) : null;

  return (
    <GlassCard hover className="relative">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-periwinkle-2/50 bg-periwinkle-2/40 text-text-secondary">
            <Wrench size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-[15px] font-bold text-text-primary">Maintenance</h3>
            <p className="truncate text-[12.5px] text-text-secondary">Campus repairs &amp; facilities</p>
          </div>
        </div>
      </div>
      {c ? (
        <>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: 'Open', value: c.open },
              { label: 'In Prog.', value: c.inProgress },
              { label: 'Sched.', value: c.scheduledTasks },
              { label: 'Done', value: c.completed },
            ].map((t) => (
              <div key={t.label} data-glass="secondary" className="glass-surface rounded-2xl px-2 py-2.5 text-center">
                <p className="font-display text-[20px] leading-none font-bold text-text-primary tabular-nums">{t.value}</p>
                <p className="mt-1 font-mono text-[9.5px] tracking-[0.08em] text-text-secondary uppercase">{t.label}</p>
              </div>
            ))}
          </div>
          <p className={`mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold ${c.critical > 0 ? 'text-error' : 'text-text-secondary'}`}>
            <AlertTriangle size={14} />
            {c.critical > 0 ? `${c.critical} critical issue${c.critical === 1 ? '' : 's'} need${c.critical === 1 ? 's' : ''} attention` : 'No critical issues'}
            {q.synthetic ? <span className="font-mono text-[10.5px] font-normal text-warning">· Demo</span> : null}
          </p>
          <GlassButton variant="primary" className="mt-3 w-full" onClick={() => go('maintenance')}>
            View Maintenance
          </GlassButton>
        </>
      ) : q.loading ? (
        <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Loading maintenance summary">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[64px] animate-pulse rounded-2xl bg-white/30" />)}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/30 bg-white/20 px-4 py-4 text-center">
          <p className="text-[13px] font-semibold text-text-primary">Maintenance unavailable</p>
          <p className="mt-0.5 text-[12px] text-text-secondary">{q.error?.message ?? 'Please try again.'}</p>
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <GlassButton variant="primary" onClick={q.loadDemo}>Load example data</GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
