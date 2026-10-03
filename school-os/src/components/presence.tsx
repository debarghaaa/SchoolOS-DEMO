import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { GraduationCap, MoreVertical, Presentation, RefreshCw, Users } from 'lucide-react';
import {
  hashStr, STAFF_TYPES,
  type FacultyPresenceRecord, type PresenceStatus, type StaffPresenceRecord, type StaffType, type StudentPresenceRecord,
} from '../lib/presence';
import { IS_DEMO_SOURCE, useLivePresence, useStudentDailyPresence, type Audience } from '../lib/presence-live';
import { useApp } from '../lib/store';
import {
  connectFeed, connectFeedWithTenant, feedEmail, TenantChoiceNeeded, type TenantChoice,
} from '../lib/supabase';
import {
  Avatar, Can, EmptyState, ErrorState, FieldLabel, GlassButton, GlassCard, GlassInput, GlassSelect, Modal, StatusBadge, Tabs,
} from './glass';

/* =====================================================================
   Overview presence islands — Faculty, Staff and Student.

   Each island is a SEPARATE, independently data-driven component with
   its own live feed subscription and its own detail view. They are never
   combined into one component and never share tabs or data paths.

   Data streams from Supabase (see useLivePresence): the directory plus
   today's punch rows, re-merged on every realtime event. RLS on the feed
   database enforces who may see what; the UI only routes and renders.
   ===================================================================== */

type FilterId = 'all' | PresenceStatus;

type SnapshotSummary = { present: number; absent: number; total: number; syncedAt: Date } | null;

/** Localized clock ("09:41 AM") matching the app's punch-time format. */
function fmtClock(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).replace(/\./g, '').toUpperCase();
}

function filterTabs(present: number, absent: number, total: number): { id: FilterId; label: string; count: number }[] {
  return [
    { id: 'all', label: 'All', count: total },
    { id: 'present', label: 'Present', count: present },
    { id: 'absent', label: 'Absent', count: absent },
  ];
}

/* ---------------- Island atoms (shared look, separate data) ---------------- */

/** Small, subtle top-right action — always secondary to the metrics. */
function DetailsAction({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button" onClick={onOpen} title={label} aria-label={label} aria-haspopup="dialog"
      className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary"
    >
      <MoreVertical size={16} />
    </button>
  );
}

function IslandFrame({ icon, title, description, action, children }: {
  icon: ReactNode; title: string; description: string; action: ReactNode; children: ReactNode;
}) {
  return (
    <GlassCard hover className="relative">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-periwinkle-2/50 bg-periwinkle-2/40 text-text-secondary">
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-[15px] font-bold text-text-primary">{title}</h3>
            <p className="truncate text-[12.5px] text-text-secondary">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </GlassCard>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1" title="Realtime feed connected">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      Live
    </span>
  );
}

function DemoDot({ synthetic = false }: { synthetic?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-1.5 py-px text-warning"
      title={synthetic ? 'Synthetic example data — no login, nothing is real' : 'Temporary demo data from the local database — not live punches'}
    >
      <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
      Demo
    </span>
  );
}

function IslandBody({ snapshot, loading, error, reload, unit, live, demo, synthetic, onConnect, onLoadDemo, onExitDemo }: {
  snapshot: SnapshotSummary; loading: boolean; error: Error | null; reload: () => void; unit: string;
  live: boolean; demo: boolean; synthetic: boolean;
  onConnect: () => void; onLoadDemo: () => void; onExitDemo: () => void;
}) {
  if (snapshot) {
    return (
      <>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div data-glass="secondary" className="glass-surface rounded-2xl px-4 py-3">
            <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-secondary uppercase">Present</p>
            <p className="font-display mt-0.5 text-[26px] leading-none font-bold text-text-primary">{snapshot.present}</p>
          </div>
          <div data-glass="secondary" className="glass-surface rounded-2xl px-4 py-3">
            <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-secondary uppercase">Absent</p>
            <p className="font-display mt-0.5 text-[26px] leading-none font-bold text-text-primary">{snapshot.absent}</p>
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-secondary">
          {snapshot.total} {unit} · Synced {fmtClock(snapshot.syncedAt)}
          {live ? <> · <LiveDot /></> : demo ? <> · <DemoDot synthetic={synthetic} /></> : null}
          {synthetic ? (
            <> · <button type="button" onClick={onExitDemo} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-text-primary">Exit demo</button></>
          ) : null}
        </p>
      </>
    );
  }
  if (loading) {
    return (
      <div className="mt-4 grid grid-cols-2 gap-3" aria-label={`Loading ${unit} presence`}>
        <div className="h-[74px] animate-pulse rounded-2xl bg-white/30" />
        <div className="h-[74px] animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }
  const needsLogin = error?.name === 'SigninRequiredError';
  return (
    <div className="mt-4 rounded-2xl border border-white/30 bg-white/20 px-4 py-4 text-center">
      <p className="text-[13px] font-semibold text-text-primary">
        {error?.name === 'ForbiddenError' ? 'Not authorized' : needsLogin ? 'Live feed disconnected' : 'Could not load presence'}
      </p>
      <p className="mt-0.5 text-[12px] text-text-secondary">{error?.message ?? 'Please try again.'}</p>
      <div className="mt-2 flex flex-col items-center gap-1.5">
        {needsLogin
          ? <GlassButton variant="primary" onClick={onConnect}>Connect</GlassButton>
          : <GlassButton variant="ghost" onClick={reload}>Retry</GlassButton>}
        <button
          type="button" onClick={onLoadDemo}
          className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
        >
          or load demo data
        </button>
      </div>
    </div>
  );
}

/* ---------------- Detail-view atoms ---------------- */

function PresenceRow({ initials, index, name, meta, chip, status, punchIn, punchOut }: {
  initials: string; index: number; name: string; meta: string; chip?: string;
  status: PresenceStatus; punchIn: string | null; punchOut: string | null;
}) {
  const punch = status === 'absent' || !punchIn
    ? 'Not punched in'
    : punchOut ? `In ${punchIn} · Out ${punchOut}` : `In ${punchIn} · On campus`;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/30 bg-white/20 px-3.5 py-3 transition-all duration-300 hover:border-white/50 hover:bg-white/35">
      <Avatar initials={initials} index={index} size="md" />
      <div className="min-w-[150px] flex-1">
        <p className="text-[13.5px] font-semibold text-text-primary">{name}</p>
        <p className="mt-0.5 text-[12px] text-text-secondary">{meta}</p>
        {chip ? (
          <span className="mt-1.5 inline-block rounded-full bg-periwinkle-2/50 px-2 py-0.5 font-mono text-[10.5px] text-text-secondary">
            {chip}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <StatusBadge tone={status} dot>{status === 'present' ? 'Present' : 'Absent'}</StatusBadge>
        <p className="font-mono text-[11px] whitespace-nowrap text-text-secondary">{punch}</p>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading presence details">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-white/30" />
      ))}
    </div>
  );
}

function DetailsModal({ title, subtitle, syncedAt, total, onClose, onRefresh, onExitDemo, children }: {
  title: string; subtitle: string; syncedAt: Date; total: number;
  onClose: () => void; onRefresh: () => void; onExitDemo?: () => void; children: ReactNode;
}) {
  return (
    <Modal
      open onClose={onClose} title={title} subtitle={subtitle} width="max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] text-text-secondary">
            Synced {fmtClock(syncedAt)} · {total} record{total === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap gap-2">
            {onExitDemo ? <GlassButton variant="ghost" onClick={onExitDemo}>Exit demo</GlassButton> : null}
            <GlassButton variant="ghost" icon={<RefreshCw size={14} />} onClick={onRefresh}>Refresh</GlassButton>
            <GlassButton variant="primary" onClick={onClose}>Done</GlassButton>
          </div>
        </div>
      }
    >
      {children}
    </Modal>
  );
}

function DetailError({ error, reload, onConnect, onLoadDemo }: {
  error: Error | null; reload: () => void; onConnect: () => void; onLoadDemo: () => void;
}) {
  if (error?.name === 'SigninRequiredError') {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="font-display text-[15px] font-bold text-text-primary">Live feed disconnected</p>
        <p className="mt-1 max-w-[300px] text-[13px] text-text-secondary">{error.message}</p>
        <div className="mt-4"><GlassButton variant="primary" onClick={onConnect}>Connect</GlassButton></div>
        <button
          type="button" onClick={onLoadDemo}
          className="mt-2 cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
        >
          or load demo data
        </button>
      </div>
    );
  }
  return (
    <>
      <ErrorState
        title={error?.name === 'ForbiddenError' ? 'Not authorized' : 'Could not load presence details'}
        body={error?.message ?? 'Please try again.'}
        onRetry={reload}
      />
      <div className="flex justify-center">
        <button
          type="button" onClick={onLoadDemo}
          className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
        >
          or load demo data
        </button>
      </div>
    </>
  );
}

/* ---------------- Feed connection ---------------- */

export function ConnectFeedModal({ audience, subject, onClose, onConnected, onLoadDemo }: {
  audience: Audience; subject?: string; onClose: () => void; onConnected: () => void; onLoadDemo: () => void;
}) {
  const [email, setEmail] = useState(feedEmail() ?? '');
  const [password, setPassword] = useState('');
  const [choice, setChoice] = useState<TenantChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connectFeed(email.trim(), password);
      onConnected();
    } catch (err) {
      if (err instanceof TenantChoiceNeeded) setChoice(err.choice);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (tenantId: string) => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await connectFeedWithTenant(choice, tenantId);
      onConnected();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="Connect the live feed"
      subtitle={`Sign in with your school login to stream ${subject ?? `${audience} presence`}${IS_DEMO_SOURCE ? ' (demo data)' : ''}.`} width="max-w-md"
    >
      {choice ? (
        <div className="space-y-2">
          <p className="text-[13px] text-text-secondary">Your login belongs to more than one school. Pick one:</p>
          {choice.options.map((o) => (
            <button
              key={o.tenant_id} type="button" disabled={busy} onClick={() => void pick(o.tenant_id)}
              className="w-full cursor-pointer rounded-2xl border border-white/30 bg-white/20 px-4 py-3 text-left transition-all duration-300 hover:border-white/50 hover:bg-white/35 disabled:opacity-50"
            >
              <p className="text-[13.5px] font-semibold text-text-primary">{o.tenant_name ?? o.tenant_slug ?? 'School'}</p>
              <p className="mt-0.5 font-mono text-[11px] text-text-secondary">{o.role}</p>
            </button>
          ))}
          {error ? <p className="text-[12.5px] text-error">{error}</p> : null}
          <DemoInstead onLoadDemo={onLoadDemo} />
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div>
            <FieldLabel htmlFor="feed-email">School email</FieldLabel>
            <GlassInput
              id="feed-email" type="email" autoComplete="username" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@northview.edu"
            />
          </div>
          <div>
            <FieldLabel htmlFor="feed-password">Password</FieldLabel>
            <GlassInput
              id="feed-password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-[12.5px] text-error">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
            <GlassButton variant="primary" type="submit" disabled={busy}>
              {busy ? 'Connecting…' : 'Connect'}
            </GlassButton>
          </div>
          <DemoInstead onLoadDemo={onLoadDemo} />
        </form>
      )}
    </Modal>
  );
}

function DemoInstead({ onLoadDemo }: { onLoadDemo: () => void }) {
  return (
    <div className="pt-1">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-periwinkle-2/40" />
        <span className="font-mono text-[10.5px] text-text-secondary">or</span>
        <span className="h-px flex-1 bg-periwinkle-2/40" />
      </div>
      <button
        type="button" onClick={onLoadDemo}
        className="mt-2.5 w-full cursor-pointer rounded-2xl border border-dashed border-periwinkle-2/60 bg-white/20 px-4 py-2.5 text-[13px] font-semibold text-text-secondary transition-all duration-300 hover:border-white/50 hover:bg-white/35 hover:text-text-primary"
      >
        Load demo data instead
      </button>
      <p className="mt-1.5 text-center font-mono text-[10.5px] text-text-secondary">No login needed · synthetic example data</p>
    </div>
  );
}

/* =====================================================================
   ISLAND 1 — Faculty Presence (school-admin only)
   ===================================================================== */

function FacultyPresenceModal({ onClose, onConnect }: { onClose: () => void; onConnect: () => void }) {
  const q = useLivePresence('faculty');
  const [filter, setFilter] = useState<FilterId>('all');
  const d = q.data;
  const rows: FacultyPresenceRecord[] = useMemo(
    () => (d ? d.records.filter((r) => filter === 'all' || r.status === filter) : []),
    [d, filter],
  );

  return (
    <DetailsModal
      title="Faculty Presence Details" subtitle="Punch status for every faculty member · today"
      syncedAt={d?.syncedAt ?? new Date()} total={d?.total ?? 0} onClose={onClose} onRefresh={q.reload} onExitDemo={q.synthetic ? q.exitDemo : undefined}
    >
      {d ? (
        <>
          <Tabs tabs={filterTabs(d.present, d.absent, d.total)} value={filter} onChange={setFilter} />
          {rows.length === 0 ? (
            <EmptyState title="No records match" body="No faculty match the selected filter." />
          ) : (
            <ul className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((r) => (
                <PresenceRow
                  key={r.id} initials={r.initials} index={hashStr(r.id)} name={r.name}
                  meta={`${r.subject} · ${r.dept}`} status={r.status} punchIn={r.punchIn} punchOut={r.punchOut}
                />
              ))}
            </ul>
          )}
        </>
      ) : q.loading ? <ListSkeleton /> : <DetailError error={q.error} reload={q.reload} onConnect={onConnect} onLoadDemo={q.loadDemo} />}
    </DetailsModal>
  );
}

export function FacultyPresenceIsland() {
  const q = useLivePresence('faculty');
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <>
      <IslandFrame
        icon={<Presentation size={18} />} title="Faculty Presence" description="Who has punched in today"
        action={
          <Can do="presence.faculty">
            <DetailsAction label="View faculty presence details" onOpen={() => setOpen(true)} />
          </Can>
        }
      >
        <IslandBody
          snapshot={q.data} loading={q.loading} error={q.error} reload={q.reload}
          unit="faculty" live={q.live} demo={q.demo} synthetic={q.synthetic} onConnect={() => setConnectOpen(true)} onLoadDemo={q.loadDemo} onExitDemo={q.exitDemo}
        />
      </IslandFrame>
      {open && <FacultyPresenceModal onClose={() => setOpen(false)} onConnect={() => { setOpen(false); setConnectOpen(true); }} />}
      {connectOpen && (
        <ConnectFeedModal audience="faculty" onClose={() => setConnectOpen(false)} onConnected={() => { setConnectOpen(false); q.reload(); }} onLoadDemo={() => { setConnectOpen(false); q.loadDemo(); }} />
      )}
    </>
  );
}

/* =====================================================================
   ISLAND 2 — Staff Presence (school-admin only)
   ===================================================================== */

function StaffPresenceModal({ onClose, onConnect }: { onClose: () => void; onConnect: () => void }) {
  const q = useLivePresence('staff');
  const [filter, setFilter] = useState<FilterId>('all');
  const [staffType, setStaffType] = useState<'all' | StaffType>('all');
  const d = q.data;
  const rows: StaffPresenceRecord[] = useMemo(
    () => (d
      ? d.records.filter((r) => (filter === 'all' || r.status === filter) && (staffType === 'all' || r.staffType === staffType))
      : []),
    [d, filter, staffType],
  );
  const typesInData = useMemo(
    () => STAFF_TYPES.filter((t) => (d?.records ?? []).some((r) => r.staffType === t)),
    [d],
  );

  return (
    <DetailsModal
      title="Staff Presence Details" subtitle="Punch status for every staff member · today"
      syncedAt={d?.syncedAt ?? new Date()} total={d?.total ?? 0} onClose={onClose} onRefresh={q.reload} onExitDemo={q.synthetic ? q.exitDemo : undefined}
    >
      {d ? (
        <>
          <Tabs tabs={filterTabs(d.present, d.absent, d.total)} value={filter} onChange={setFilter} />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <GlassSelect
              aria-label="Filter by staff type" value={staffType}
              onChange={(e) => setStaffType(e.target.value as 'all' | StaffType)}
            >
              <option value="all">All staff types</option>
              {typesInData.map((t) => <option key={t} value={t}>{t}</option>)}
            </GlassSelect>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="No records match" body="No staff match the selected filters." />
          ) : (
            <ul className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((r) => (
                <PresenceRow
                  key={r.id} initials={r.initials} index={hashStr(r.id)} name={r.name}
                  meta={`${r.role} · ${r.dept}`} chip={r.staffType}
                  status={r.status} punchIn={r.punchIn} punchOut={r.punchOut}
                />
              ))}
            </ul>
          )}
        </>
      ) : q.loading ? <ListSkeleton /> : <DetailError error={q.error} reload={q.reload} onConnect={onConnect} onLoadDemo={q.loadDemo} />}
    </DetailsModal>
  );
}

export function StaffPresenceIsland() {
  const q = useLivePresence('staff');
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <>
      <IslandFrame
        icon={<Users size={18} />} title="Staff Presence" description="Who has punched in today"
        action={
          <Can do="presence.staff">
            <DetailsAction label="View staff presence details" onOpen={() => setOpen(true)} />
          </Can>
        }
      >
        <IslandBody
          snapshot={q.data} loading={q.loading} error={q.error} reload={q.reload}
          unit="staff" live={q.live} demo={q.demo} synthetic={q.synthetic} onConnect={() => setConnectOpen(true)} onLoadDemo={q.loadDemo} onExitDemo={q.exitDemo}
        />
      </IslandFrame>
      {open && <StaffPresenceModal onClose={() => setOpen(false)} onConnect={() => { setOpen(false); setConnectOpen(true); }} />}
      {connectOpen && (
        <ConnectFeedModal audience="staff" onClose={() => setConnectOpen(false)} onConnected={() => { setConnectOpen(false); q.reload(); }} onLoadDemo={() => { setConnectOpen(false); q.loadDemo(); }} />
      )}
    </>
  );
}

/* =====================================================================
   ISLAND 3 — Student Presence (teacher only, assigned classes)
   ===================================================================== */

export function StudentPresenceModal({ onClose, onConnect, subtitle }: { onClose: () => void; onConnect: () => void; subtitle?: string }) {
  const q = useLivePresence('student');
  const [filter, setFilter] = useState<FilterId>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const d = q.data;
  const classes = useMemo(
    () => Array.from(new Set((d?.records ?? []).map((r) => `${r.grade}-${r.section}`))).sort(),
    [d],
  );
  const sections = useMemo(
    () => Array.from(new Set((d?.records ?? []).map((r) => r.section))).sort(),
    [d],
  );
  const rows: StudentPresenceRecord[] = useMemo(
    () => (d
      ? d.records.filter((r) =>
        (filter === 'all' || r.status === filter) &&
        (classFilter === 'all' || `${r.grade}-${r.section}` === classFilter) &&
        (sectionFilter === 'all' || r.section === sectionFilter))
      : []),
    [d, filter, classFilter, sectionFilter],
  );

  return (
    <DetailsModal
      title="Student Presence Details" subtitle={subtitle ?? "Punch status for your assigned classes · today"}
      syncedAt={d?.syncedAt ?? new Date()} total={d?.total ?? 0} onClose={onClose} onRefresh={q.reload} onExitDemo={q.synthetic ? q.exitDemo : undefined}
    >
      {d ? (
        <>
          <Tabs tabs={filterTabs(d.present, d.absent, d.total)} value={filter} onChange={setFilter} />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <GlassSelect
              aria-label="Filter by class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="all">All classes</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </GlassSelect>
            <GlassSelect
              aria-label="Filter by section" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}
            >
              <option value="all">All sections</option>
              {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
            </GlassSelect>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="No records match" body="No students match the selected filters." />
          ) : (
            <ul className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((r) => (
                <PresenceRow
                  key={r.id} initials={r.initials} index={hashStr(r.id)} name={r.name}
                  meta={`${r.grade}-${r.section} · Roll ${r.roll}`}
                  status={r.status} punchIn={r.punchIn} punchOut={r.punchOut}
                />
              ))}
            </ul>
          )}
        </>
      ) : q.loading ? <ListSkeleton /> : <DetailError error={q.error} reload={q.reload} onConnect={onConnect} onLoadDemo={q.loadDemo} />}
    </DetailsModal>
  );
}

export function StudentPresenceIsland() {
  const q = useLivePresence('student');
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <>
      <IslandFrame
        icon={<GraduationCap size={18} />} title="Student Presence" description="Punch status · your assigned classes"
        action={
          <Can do="presence.students">
            <DetailsAction label="View student presence details" onOpen={() => setOpen(true)} />
          </Can>
        }
      >
        <IslandBody
          snapshot={q.data} loading={q.loading} error={q.error} reload={q.reload}
          unit="students" live={q.live} demo={q.demo} synthetic={q.synthetic} onConnect={() => setConnectOpen(true)} onLoadDemo={q.loadDemo} onExitDemo={q.exitDemo}
        />
      </IslandFrame>
      {open && <StudentPresenceModal onClose={() => setOpen(false)} onConnect={() => { setOpen(false); setConnectOpen(true); }} />}
      {connectOpen && (
        <ConnectFeedModal audience="student" onClose={() => setConnectOpen(false)} onConnected={() => { setConnectOpen(false); q.reload(); }} onLoadDemo={() => { setConnectOpen(false); q.loadDemo(); }} />
      )}
    </>
  );
}

/* =====================================================================
   ISLAND 4 — Student Daily Presence (role-scoped aggregate).

   One headline fraction — Present/Total, never present-only — plus absent
   and the present share for today. Admins see the whole school, teachers
   their assigned classes, students themselves, parents their linked
   children. The three-dot action opens the row-level detail for everyone
   except admins, whose detail stays an aggregate (per the feed contract)
   with a hop to the attendance registers.
   ===================================================================== */

/** "2026-10-02" → "Fri, 2 Oct". */
function fmtDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function StudentDailyAggregateModal({ onClose, onConnect }: { onClose: () => void; onConnect: () => void }) {
  const q = useStudentDailyPresence();
  const { go } = useApp();
  const d = q.data;
  const pct = d ? Math.round(d.rate * 100) : 0;

  return (
    <DetailsModal
      title="Student Daily Presence" subtitle="Whole-school aggregate · today"
      syncedAt={new Date()} total={d?.total ?? 0} onClose={onClose} onRefresh={q.reload} onExitDemo={q.synthetic ? q.exitDemo : undefined}
    >
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div data-glass="secondary" className="glass-surface rounded-2xl px-4 py-3">
              <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-secondary uppercase">Present</p>
              <p className="font-display mt-0.5 text-[26px] leading-none font-bold text-text-primary">
                {d.present}<span className="text-text-secondary">/{d.total}</span>
              </p>
            </div>
            <div data-glass="secondary" className="glass-surface rounded-2xl px-4 py-3">
              <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-secondary uppercase">Absent</p>
              <p className="font-display mt-0.5 text-[26px] leading-none font-bold text-text-primary">{d.absent}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-baby-blue-ice),var(--color-periwinkle-2))]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-text-secondary">
              {pct}% present · {q.scopeLabel} · {fmtDay(d.day)}
              {q.live ? <> · <LiveDot /></> : q.demo ? <> · <DemoDot synthetic={q.synthetic} /></> : null}
            </p>
          </div>
          <div className="mt-3 flex justify-end">
            <GlassButton variant="ghost" onClick={() => { onClose(); go('attendance'); }}>
              Open attendance registers
            </GlassButton>
          </div>
        </>
      ) : q.loading ? <ListSkeleton /> : <DetailError error={q.error} reload={q.reload} onConnect={onConnect} onLoadDemo={q.loadDemo} />}
    </DetailsModal>
  );
}

function StudentDailySubtitle(role: string | null, synthetic: boolean): string {
  if (synthetic || role === null) return 'Example punch data · today';
  if (role === 'student') return 'Your punch status · today';
  if (role === 'parent') return 'Punch status for your linked children · today';
  return 'Punch status for your assigned classes · today';
}

export function StudentDailyPresenceIsland() {
  const q = useStudentDailyPresence();
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const d = q.data;
  const pct = d ? Math.round(d.rate * 100) : 0;
  const needsLogin = q.error?.name === 'SigninRequiredError';

  return (
    <>
      <IslandFrame
        icon={<GraduationCap size={18} />} title="Student Daily Presence" description={`${q.scopeLabel} · today`}
        action={<DetailsAction label="View student daily presence details" onOpen={() => setOpen(true)} />}
      >
        {d ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div data-glass="secondary" className="glass-surface rounded-2xl px-4 py-3">
                <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-secondary uppercase">Present</p>
                <p className="font-display mt-0.5 text-[26px] leading-none font-bold text-text-primary">
                  {d.present}<span className="text-text-secondary">/{d.total}</span>
                </p>
              </div>
              <div data-glass="secondary" className="glass-surface rounded-2xl px-4 py-3">
                <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-secondary uppercase">Absent</p>
                <p className="font-display mt-0.5 text-[26px] leading-none font-bold text-text-primary">{d.absent}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-baby-blue-ice),var(--color-periwinkle-2))]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-secondary">
              {pct}% present · {fmtDay(d.day)}
              {q.live ? <> · <LiveDot /></> : q.demo ? <> · <DemoDot synthetic={q.synthetic} /></> : null}
              {q.synthetic ? (
                <> · <button type="button" onClick={q.exitDemo} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-text-primary">Exit demo</button></>
              ) : null}
            </p>
          </>
        ) : q.loading ? (
          <div className="mt-4 grid grid-cols-2 gap-3" aria-label="Loading student daily presence">
            <div className="h-[74px] animate-pulse rounded-2xl bg-white/30" />
            <div className="h-[74px] animate-pulse rounded-2xl bg-white/30" />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/30 bg-white/20 px-4 py-4 text-center">
            <p className="text-[13px] font-semibold text-text-primary">
              {q.error?.name === 'ForbiddenError' ? 'Not authorized' : needsLogin ? 'Live feed disconnected' : 'Could not load presence'}
            </p>
            <p className="mt-0.5 text-[12px] text-text-secondary">{q.error?.message ?? 'Please try again.'}</p>
            <div className="mt-2 flex flex-col items-center gap-1.5">
              {needsLogin
                ? <GlassButton variant="primary" onClick={() => setConnectOpen(true)}>Connect</GlassButton>
                : <GlassButton variant="ghost" onClick={q.reload}>Retry</GlassButton>}
              <button
                type="button" onClick={q.loadDemo}
                className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
              >
                or load demo data
              </button>
            </div>
          </div>
        )}
      </IslandFrame>
      {open && (q.role === 'school-admin'
        ? <StudentDailyAggregateModal onClose={() => setOpen(false)} onConnect={() => { setOpen(false); setConnectOpen(true); }} />
        : <StudentPresenceModal subtitle={StudentDailySubtitle(q.role, q.synthetic)} onClose={() => setOpen(false)} onConnect={() => { setOpen(false); setConnectOpen(true); }} />)}
      {connectOpen && (
        <ConnectFeedModal audience="student" onClose={() => setConnectOpen(false)} onConnected={() => { setConnectOpen(false); q.reload(); }} onLoadDemo={() => { setConnectOpen(false); q.loadDemo(); }} />
      )}
    </>
  );
}
