import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarHeart, Check, Eye, Paperclip, Plus, X } from 'lucide-react';
import {
  LEAVE_STATUS_LABEL, LEAVE_TYPES, isOnLeaveToday, leaveCounts, leaveDays,
  myApplications, pendingQueue,
  validateLeaveInput, validateSupportingDoc,
  type LeaveCounts, type LeaveStatus, type LeaveType, type LiveLeaveApplication,
} from '../lib/leave';
import {
  LEAVE_LIVE, consumeLeaveSelection, persistLeaveNotificationRead,
  queueLeaveApply, subscribeLeaveSelection, useLeaveNotifications, useLiveLeave,
  type LeaveSubmitInput,
} from '../lib/leave-live';
import { LINKED_CHILDREN, STUDENT_SCOPE, TEACHER_SCOPE } from '../lib/scoped';
import { registerNotificationReadHook, useApp } from '../lib/store';
import { cn } from '../lib/utils';
import { ConnectFeedModal } from '../components/presence';
import {
  Can, DataTable, Drawer, EmptyState, ErrorState, FieldLabel, FileUploader,
  GlassButton, GlassCard, GlassInput, GlassSelect, GlassTextarea,
  LoadingCards, MetricCard, Modal, SectionHead, StatusBadge,
} from '../components/glass';

/* =====================================================================
   Leave Management — hero metrics, approval queues, application form,
   history and record detail, all role-scoped.

   Live Supabase tables (RLS decides who sees and settles what) or the
   badged synthetic demo when Supabase is not configured. Students apply
   to their class teacher, teachers to the school admin; every decision
   lands in the approval history and notifies the applicant.
   ===================================================================== */

/* ---------------- formatting + tone maps ---------------- */

function fmtDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtStamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function docName(url: string): string {
  const base = url.split('/').pop() ?? url;
  return base === '' ? url : base;
}

const STATUS_TONE: Record<LeaveStatus, string> = {
  draft: 'draft', pending: 'pending', approved: 'success', rejected: 'overdue', cancelled: 'closed',
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

/* ---------------- application form (apply / draft) ---------------- */

function ApplyLeaveModal({ draft, myApps, busy, formError, onClose, onSubmit, onSaveDraft }: {
  draft: LiveLeaveApplication | null;
  myApps: LiveLeaveApplication[];
  busy: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (input: LeaveSubmitInput) => void;
  onSaveDraft: (input: LeaveSubmitInput) => void;
}) {
  const { role } = useApp();
  const [leaveType, setLeaveType] = useState<LeaveType>(draft?.leaveType ?? 'Casual Leave');
  const [from, setFrom] = useState(draft?.from ?? '');
  const [to, setTo] = useState(draft?.to ?? '');
  const [reason, setReason] = useState(draft?.reason ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [applicantId, setApplicantId] = useState(
    draft?.applicantId ?? (role === 'parent' ? LINKED_CHILDREN[0].id : ''));
  const [errors, setErrors] = useState<string[]>([]);

  const days = leaveDays(from, to);
  const committed = useMemo(
    () => myApps.filter((a) => a.id !== draft?.id && (a.status === 'pending' || a.status === 'approved')),
    [myApps, draft],
  );

  const collect = (): LeaveSubmitInput => ({
    leaveType, from, to, reason,
    file, applicantId: role === 'parent' ? applicantId : undefined,
    draftId: draft?.id,
  });

  const trySubmit = () => {
    const errs = validateLeaveInput({ leaveType, from, to, reason }, committed);
    if (file) {
      const docErr = validateSupportingDoc(file);
      if (docErr) errs.push(docErr);
    }
    setErrors(errs);
    if (errs.length === 0) onSubmit(collect());
  };

  const trySaveDraft = () => {
    if (file) {
      const docErr = validateSupportingDoc(file);
      if (docErr) { setErrors([docErr]); return; }
    }
    setErrors([]);
    onSaveDraft(collect());
  };

  return (
    <Modal
      open onClose={onClose} title={draft ? 'Edit draft application' : 'Apply for Leave'}
      subtitle={draft ? `Draft · ${draft.applicantName}` : 'Submit a leave application to your approver.'} width="max-w-xl"
      footer={(
        <>
          <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="glass" disabled={busy} onClick={trySaveDraft}>
            {busy ? 'Saving…' : 'Save Draft'}
          </GlassButton>
          <GlassButton variant="primary" disabled={busy} onClick={trySubmit}>
            {busy ? 'Submitting…' : 'Submit Application'}
          </GlassButton>
        </>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {role === 'parent' ? (
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="leave-child">Applying for</FieldLabel>
            <GlassSelect id="leave-child" value={applicantId} onChange={(e) => setApplicantId(e.target.value)}>
              {LINKED_CHILDREN.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.class}</option>)}
            </GlassSelect>
          </div>
        ) : null}
        <div>
          <FieldLabel htmlFor="leave-type">Leave type</FieldLabel>
          <GlassSelect id="leave-type" value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </GlassSelect>
        </div>
        <div className="flex items-end">
          <p className="w-full rounded-xl border border-periwinkle-2/50 bg-white/35 px-3.5 py-2.5 font-mono text-[11.5px] text-text-secondary">
            Total leave days · <span className="text-[15px] font-bold text-text-primary tabular-nums">{days}</span>
          </p>
        </div>
        <div>
          <FieldLabel htmlFor="leave-from">Start date</FieldLabel>
          <GlassInput id="leave-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="leave-to">End date</FieldLabel>
          <GlassInput id="leave-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="leave-reason">Reason</FieldLabel>
          <GlassTextarea id="leave-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Viral fever — resting at home (medical certificate attached)" />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Supporting document <span className="font-normal">(optional)</span></FieldLabel>
          {file ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-periwinkle-2/50 bg-white/35 px-3.5 py-2.5">
              <Paperclip size={15} className="shrink-0 text-text-secondary" />
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">{file.name}</p>
              <span className="font-mono text-[10.5px] text-text-secondary">{(file.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Remove document" className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-text-secondary hover:bg-white/40 hover:text-error">
                <X size={14} />
              </button>
            </div>
          ) : (
            <FileUploader compact onFiles={(files) => {
              const picked = files[0];
              if (!picked) return;
              const docErr = validateSupportingDoc(picked);
              if (docErr) { setErrors([docErr]); return; }
              setErrors([]);
              setFile(picked);
            }} />
          )}
        </div>
      </div>
      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {errors.map((e) => <li key={e} className="text-[12.5px] text-error">· {e}</li>)}
        </ul>
      ) : null}
      {formError ? <p className="mt-3 text-[12.5px] text-error">{formError}</p> : null}
    </Modal>
  );
}

/* ---------------- rejection ---------------- */

function RejectModal({ app, busy, formError, onClose, onReject }: {
  app: LiveLeaveApplication; busy: boolean; formError: string | null;
  onClose: () => void; onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open onClose={onClose} title="Reject application"
      subtitle={`${app.applicantName} · ${app.leaveType} · ${fmtDay(app.from)} → ${fmtDay(app.to)}`} width="max-w-md"
      footer={(
        <>
          <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton
            variant="danger-ghost" disabled={busy}
            onClick={() => {
              if (reason.trim() === '') { setError('A rejection reason is required.'); return; }
              onReject(reason);
            }}
          >
            {busy ? 'Rejecting…' : 'Reject'}
          </GlassButton>
        </>
      )}
    >
      <FieldLabel htmlFor="leave-reject-reason">Rejection reason</FieldLabel>
      <GlassTextarea id="leave-reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Term tests that week — please apply for 1 day only." />
      {error ? <p className="mt-2 text-[12.5px] text-error">{error}</p> : null}
      {formError ? <p className="mt-2 text-[12.5px] text-error">{formError}</p> : null}
    </Modal>
  );
}

/* ---------------- record detail ---------------- */

function LeaveDetailDrawer({ app, canDecideIt, isMine, busy, onClose, onApprove, onReject, onCancel, onSubmitDraft }: {
  app: LiveLeaveApplication;
  canDecideIt: boolean;
  isMine: boolean;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onSubmitDraft: () => void;
}) {
  const mine = isMine && (app.status === 'draft' || app.status === 'pending');
  return (
    <Drawer
      open onClose={onClose}
      title={`${app.applicantName} · ${app.leaveType}`}
      subtitle={`${app.applicantDetail} · ${fmtDay(app.from)} → ${fmtDay(app.to)} · ${app.days} day${app.days === 1 ? '' : 's'}`}
      footer={(
        <>
          {mine && app.status === 'draft' ? (
            <GlassButton variant="primary" disabled={busy} onClick={onSubmitDraft}>
              {busy ? 'Submitting…' : 'Submit'}
            </GlassButton>
          ) : null}
          {mine ? (
            <GlassButton variant="danger-ghost" disabled={busy} onClick={onCancel}>
              {busy ? 'Cancelling…' : app.status === 'draft' ? 'Discard draft' : 'Cancel application'}
            </GlassButton>
          ) : null}
          {canDecideIt ? (
            <>
              <GlassButton variant="danger-ghost" disabled={busy} onClick={onReject}>Reject</GlassButton>
              <GlassButton variant="primary" icon={<Check size={15} />} disabled={busy} onClick={onApprove}>
                {busy ? 'Approving…' : 'Approve'}
              </GlassButton>
            </>
          ) : null}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={STATUS_TONE[app.status]} dot>{LEAVE_STATUS_LABEL[app.status]}</StatusBadge>
          <StatusBadge tone="neutral">{app.leaveType}</StatusBadge>
          <StatusBadge tone="neutral">{app.applicantRole === 'student' ? 'Student' : 'Teacher'}</StatusBadge>
          {isOnLeaveToday(app) ? <StatusBadge tone="active">On leave today</StatusBadge> : null}
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] text-text-secondary uppercase">Reason</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-text-primary">{app.reason || '—'}</p>
        </div>
        {app.supportingDoc ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-periwinkle-2/40 bg-white/35 px-3.5 py-2.5">
            <Paperclip size={15} className="shrink-0 text-text-secondary" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">{docName(app.supportingDoc)}</p>
            <span className="font-mono text-[10.5px] text-text-secondary">attached</span>
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-3">
          {[
            { k: 'Submitted', v: fmtStamp(app.submittedAt) },
            { k: 'Approver', v: app.approverName || 'Not routed yet' },
            { k: 'Decided', v: fmtStamp(app.decidedAt) },
            { k: 'Total days', v: String(app.days) },
          ].map((f) => (
            <div key={f.k} data-glass="secondary" className="glass-surface rounded-2xl px-3.5 py-2.5">
              <dt className="font-mono text-[10px] tracking-[0.12em] text-text-secondary uppercase">{f.k}</dt>
              <dd className="mt-0.5 text-[13px] font-semibold text-text-primary">{f.v}</dd>
            </div>
          ))}
        </dl>
        {app.note ? (
          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-text-secondary uppercase">Rejection reason</p>
            <p className="mt-1 rounded-2xl border border-error/30 bg-error/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-text-primary">“{app.note}”</p>
          </div>
        ) : null}
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] text-text-secondary uppercase">Approval history</p>
          <div className="mt-2 space-y-2">
            {app.history.length === 0 ? (
              <p className="text-[13px] text-text-secondary italic">Draft — nothing recorded yet.</p>
            ) : app.history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                <span className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  h.action === 'approved' && 'bg-success',
                  h.action === 'rejected' && 'bg-error',
                  h.action === 'submitted' && 'bg-warning',
                  h.action === 'cancelled' && 'bg-text-muted',
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-text-primary capitalize">
                    {h.action} <span className="font-normal text-text-secondary">· {h.actorName}</span>
                  </p>
                  {h.comment ? <p className="mt-0.5 text-[12.5px] text-text-secondary">“{h.comment}”</p> : null}
                </div>
                <span className="shrink-0 font-mono text-[10.5px] text-text-secondary">{fmtStamp(h.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/* ---------------- shared chrome ---------------- */

type StatusTab = 'all' | LeaveStatus;

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

interface Chrome {
  view: (app: LiveLeaveApplication) => void;
  decide: (app: LiveLeaveApplication, decision: 'approved' | 'rejected') => void;
  cancel: (app: LiveLeaveApplication) => void;
  submitDraft: (app: LiveLeaveApplication) => void;
}

function DecisionButtons({ app, chrome }: { app: LiveLeaveApplication; chrome: Chrome }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" title="View details" aria-label={`View ${app.applicantName}`} onClick={() => chrome.view(app)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
        <Eye size={15} />
      </button>
      <button type="button" title="Approve" aria-label={`Approve ${app.applicantName}`} onClick={() => chrome.decide(app, 'approved')} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-success">
        <Check size={15} />
      </button>
      <button type="button" title="Reject" aria-label={`Reject ${app.applicantName}`} onClick={() => chrome.decide(app, 'rejected')} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-error/15 hover:text-error">
        <X size={15} />
      </button>
    </span>
  );
}

function DateRangeFilter({ from, to, onFrom, onTo }: {
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <GlassInput aria-label="Filter from date" type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="w-[148px]" />
      <span className="font-mono text-[11px] text-text-secondary">→</span>
      <GlassInput aria-label="Filter to date" type="date" value={to} onChange={(e) => onTo(e.target.value)} className="w-[148px]" />
    </span>
  );
}

function inDateRange(app: LiveLeaveApplication, from: string, to: string): boolean {
  if (from && app.to < from) return false;
  if (to && app.from > to) return false;
  return true;
}

/* ---------------- school-admin view ---------------- */

function AdminLeaveView({ apps, counts, chrome }: {
  apps: LiveLeaveApplication[]; counts: LeaveCounts; chrome: Chrome;
}) {
  const [tab, setTab] = useState<StatusTab>('all');
  const [teacher, setTeacher] = useState('all');
  const [leaveType, setLeaveType] = useState('all');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const teachers = useMemo(
    () => Array.from(new Set(apps.map((a) => a.applicantName))).sort(), [apps]);

  const rows = useMemo(() => apps.filter((a) =>
    (tab === 'all' || a.status === tab) &&
    (teacher === 'all' || a.applicantName === teacher) &&
    (leaveType === 'all' || a.leaveType === leaveType) &&
    inDateRange(a, rangeFrom, rangeTo),
  ), [apps, tab, teacher, leaveType, rangeFrom, rangeTo]);

  const filtersActive = tab !== 'all' || teacher !== 'all' || leaveType !== 'all' || rangeFrom !== '' || rangeTo !== '';
  const clearFilters = () => {
    setTab('all'); setTeacher('all'); setLeaveType('all'); setRangeFrom(''); setRangeTo('');
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending teacher applications" value={String(counts.pending)} sub="awaiting your decision" index={0} />
        <MetricCard label="Approved" value={String(counts.approved)} sub="teacher applications" index={1} />
        <MetricCard label="Rejected" value={String(counts.rejected)} sub="teacher applications" index={2} />
        <MetricCard label="Teachers on leave today" value={String(counts.onLeaveToday)} sub="approved · overlapping today" index={3} />
      </div>

      <GlassCard>
        <SectionHead title="Teacher applications" body="Review every teacher application by lifecycle state." />
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
          <GlassSelect aria-label="Filter by teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="all">All teachers</option>
            {teachers.map((t) => <option key={t} value={t}>{t}</option>)}
          </GlassSelect>
          <GlassSelect aria-label="Filter by leave type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
            <option value="all">All leave types</option>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </GlassSelect>
          <DateRangeFilter from={rangeFrom} to={rangeTo} onFrom={setRangeFrom} onTo={setRangeTo} />
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary">
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="mt-3">
          <DataTable<LiveLeaveApplication>
            rows={rows} pageSize={8} searchable searchKeys={['applicantName', 'reason', 'applicantDetail']}
            searchPlaceholder="Search applicants, reasons…"
            emptyTitle="No applications match" emptyBody="Try adjusting the search or filters."
            columns={[
              {
                key: 'applicant', header: 'Applicant', sortable: true, sortValue: (r) => r.applicantName,
                render: (r) => (
                  <div className="min-w-[150px]">
                    <p className="text-[13.5px] font-semibold text-text-primary">{r.applicantName}</p>
                    <p className="font-mono text-[10.5px] text-text-secondary">{r.applicantDetail}</p>
                  </div>
                ),
              },
              {
                key: 'role', header: 'Role',
                render: (r) => <StatusBadge tone="neutral">{r.applicantRole === 'student' ? 'Student' : 'Teacher'}</StatusBadge>,
              },
              {
                key: 'dept', header: 'Department',
                render: (r) => <span className="text-[13px] text-text-secondary">{r.applicantDetail || '—'}</span>,
              },
              {
                key: 'type', header: 'Leave Type', sortable: true, sortValue: (r) => r.leaveType,
                render: (r) => <span className="text-[13px] whitespace-nowrap text-text-primary">{r.leaveType}</span>,
              },
              {
                key: 'start', header: 'Start Date', sortable: true, sortValue: (r) => r.from,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtDay(r.from)}</span>,
              },
              {
                key: 'end', header: 'End Date', sortable: true, sortValue: (r) => r.to,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtDay(r.to)}</span>,
              },
              {
                key: 'days', header: 'Total Days', sortable: true, sortValue: (r) => r.days,
                render: (r) => <span className="font-mono text-[12px] font-bold tabular-nums">{r.days}</span>,
              },
              {
                key: 'reason', header: 'Reason',
                render: (r) => <span className="line-clamp-1 block max-w-[220px] text-[12.5px] text-text-secondary">{r.reason}</span>,
              },
              {
                key: 'status', header: 'Status',
                render: (r) => <StatusBadge tone={STATUS_TONE[r.status]} dot={r.status === 'pending'}>{LEAVE_STATUS_LABEL[r.status]}</StatusBadge>,
              },
              {
                key: 'submitted', header: 'Submitted Date', sortable: true, sortValue: (r) => r.submittedAt ?? '',
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtStamp(r.submittedAt)}</span>,
              },
              {
                key: 'actions', header: 'Actions',
                render: (r) => (r.status === 'pending'
                  ? <DecisionButtons app={r} chrome={chrome} />
                  : (
                    <button type="button" title="View details" aria-label={`View ${r.applicantName}`} onClick={() => chrome.view(r)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                      <Eye size={15} />
                    </button>
                  )),
              },
            ]}
          />
        </div>
      </GlassCard>
    </>
  );
}

/* ---------------- teacher view ---------------- */

function splitClass(label: string): { grade: string; section: string } {
  const i = label.lastIndexOf('-');
  if (i < 0) return { grade: label, section: '' };
  return { grade: label.slice(0, i), section: label.slice(i + 1) };
}

function TeacherLeaveView({ queue, mine, counts, chrome, onApply }: {
  queue: LiveLeaveApplication[];
  mine: LiveLeaveApplication[];
  counts: LeaveCounts;
  chrome: Chrome;
  onApply: () => void;
}) {
  const [tab, setTab] = useState<StatusTab>('all');
  const [grade, setGrade] = useState('all');
  const [section, setSection] = useState('all');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const grades = useMemo(
    () => Array.from(new Set(queue.map((a) => splitClass(a.applicantClass).grade).filter((g) => g !== ''))).sort(),
    [queue]);
  const sections = useMemo(
    () => Array.from(new Set(queue.map((a) => splitClass(a.applicantClass).section).filter((s) => s !== ''))).sort(),
    [queue]);

  const rows = useMemo(() => queue.filter((a) => {
    const { grade: g, section: s } = splitClass(a.applicantClass);
    return (tab === 'all' || a.status === tab) &&
      (grade === 'all' || g === grade) &&
      (section === 'all' || s === section) &&
      inDateRange(a, rangeFrom, rangeTo);
  }), [queue, tab, grade, section, rangeFrom, rangeTo]);

  const filtersActive = tab !== 'all' || grade !== 'all' || section !== 'all' || rangeFrom !== '' || rangeTo !== '';
  const clearFilters = () => {
    setTab('all'); setGrade('all'); setSection('all'); setRangeFrom(''); setRangeTo('');
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending student applications" value={String(counts.pending)} sub="awaiting your decision" index={0} />
        <MetricCard label="Approved" value={String(counts.approved)} sub="student applications" index={1} />
        <MetricCard label="Rejected" value={String(counts.rejected)} sub="student applications" index={2} />
        <MetricCard label="Students on leave today" value={String(counts.onLeaveToday)} sub="approved · overlapping today" index={3} />
      </div>

      <GlassCard>
        <SectionHead
          title="My leave" body="Your own applications to the school admin."
          action={(
            <Can do="leave.apply">
              <GlassButton variant="primary" size="sm" icon={<Plus size={14} />} onClick={onApply}>
                Apply for Leave
              </GlassButton>
            </Can>
          )}
        />
        {mine.length === 0 ? (
          <EmptyState title="No applications yet" body="Your leave applications will appear here." compact />
        ) : (
          <div className="space-y-2">
            {mine.slice(0, 4).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                <div className="min-w-[160px] flex-1">
                  <p className="text-[13px] font-bold text-text-primary">{a.leaveType} · {fmtDay(a.from)} → {fmtDay(a.to)}</p>
                  <p className="mt-0.5 line-clamp-1 font-mono text-[10.5px] text-text-secondary">{a.days} day{a.days === 1 ? '' : 's'} · to {a.approverName || '—'} · {a.reason}</p>
                </div>
                <StatusBadge tone={STATUS_TONE[a.status]}>{LEAVE_STATUS_LABEL[a.status]}</StatusBadge>
                <button type="button" title="View details" aria-label={`View ${a.leaveType}`} onClick={() => chrome.view(a)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                  <Eye size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <SectionHead title="Student applications" body="Applications from students assigned to you." />
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
          <GlassSelect aria-label="Filter by class" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">All classes</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </GlassSelect>
          <GlassSelect aria-label="Filter by section" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="all">All sections</option>
            {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
          </GlassSelect>
          <DateRangeFilter from={rangeFrom} to={rangeTo} onFrom={setRangeFrom} onTo={setRangeTo} />
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary">
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="mt-3">
          <DataTable<LiveLeaveApplication>
            rows={rows} pageSize={8} searchable searchKeys={['applicantName', 'reason']}
            searchPlaceholder="Search students, reasons…"
            emptyTitle="No applications match" emptyBody="Try adjusting the search or filters."
            columns={[
              {
                key: 'student', header: 'Student', sortable: true, sortValue: (r) => r.applicantName,
                render: (r) => (
                  <div className="min-w-[140px]">
                    <p className="text-[13.5px] font-semibold text-text-primary">{r.applicantName}</p>
                    <p className="font-mono text-[10.5px] text-text-secondary">{r.applicantDetail}</p>
                  </div>
                ),
              },
              {
                key: 'class', header: 'Class', sortable: true, sortValue: (r) => r.applicantClass,
                render: (r) => <span className="text-[13px] whitespace-nowrap text-text-secondary">{splitClass(r.applicantClass).grade || '—'}</span>,
              },
              {
                key: 'section', header: 'Section',
                render: (r) => <span className="text-[13px] text-text-secondary">{splitClass(r.applicantClass).section || '—'}</span>,
              },
              {
                key: 'type', header: 'Leave Type', sortable: true, sortValue: (r) => r.leaveType,
                render: (r) => <span className="text-[13px] whitespace-nowrap text-text-primary">{r.leaveType}</span>,
              },
              {
                key: 'start', header: 'Start Date', sortable: true, sortValue: (r) => r.from,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtDay(r.from)}</span>,
              },
              {
                key: 'end', header: 'End Date', sortable: true, sortValue: (r) => r.to,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtDay(r.to)}</span>,
              },
              {
                key: 'days', header: 'Total Days', sortable: true, sortValue: (r) => r.days,
                render: (r) => <span className="font-mono text-[12px] font-bold tabular-nums">{r.days}</span>,
              },
              {
                key: 'reason', header: 'Reason',
                render: (r) => <span className="line-clamp-1 block max-w-[220px] text-[12.5px] text-text-secondary">{r.reason}</span>,
              },
              {
                key: 'status', header: 'Status',
                render: (r) => <StatusBadge tone={STATUS_TONE[r.status]} dot={r.status === 'pending'}>{LEAVE_STATUS_LABEL[r.status]}</StatusBadge>,
              },
              {
                key: 'submitted', header: 'Submitted Date', sortable: true, sortValue: (r) => r.submittedAt ?? '',
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtStamp(r.submittedAt)}</span>,
              },
              {
                key: 'actions', header: 'Actions',
                render: (r) => (r.status === 'pending'
                  ? <DecisionButtons app={r} chrome={chrome} />
                  : (
                    <button type="button" title="View details" aria-label={`View ${r.applicantName}`} onClick={() => chrome.view(r)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                      <Eye size={15} />
                    </button>
                  )),
              },
            ]}
          />
        </div>
      </GlassCard>
    </>
  );
}

/* ---------------- student view ---------------- */

function StudentLeaveView({ mine, counts, chrome, onApply }: {
  mine: LiveLeaveApplication[]; counts: LeaveCounts; chrome: Chrome; onApply: () => void;
}) {
  const pendingMine = useMemo(() => mine.filter((a) => a.status === 'pending' || a.status === 'draft'), [mine]);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Pending applications" value={String(counts.pending)} sub="awaiting your teacher" index={0} />
        <MetricCard label="Approved" value={String(counts.approved)} sub="excused absences" index={1} />
        <MetricCard label="Rejected" value={String(counts.rejected)} sub="see reasons in history" index={2} />
      </div>

      <GlassCard>
        <SectionHead
          title="Apply for Leave" body={`Routes to your class teacher · ${STUDENT_SCOPE.class} · quota 12 days a year.`}
          action={(
            <Can do="leave.apply">
              <GlassButton variant="primary" size="sm" icon={<Plus size={14} />} onClick={onApply}>
                Apply for Leave
              </GlassButton>
            </Can>
          )}
        />
        <p className="-mt-2 text-[13px] text-text-secondary">
          Sick, casual, emergency and personal leave need your class teacher’s approval. Drafts stay private until you submit them.
        </p>
      </GlassCard>

      <GlassCard>
        <SectionHead title="My Pending Applications" body="Submitted and draft applications awaiting a decision." />
        {pendingMine.length === 0 ? (
          <EmptyState title="Nothing pending" body="No drafts or applications are waiting right now." compact />
        ) : (
          <div className="space-y-2">
            {pendingMine.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                <div className="min-w-[180px] flex-1">
                  <p className="text-[13px] font-bold text-text-primary">{a.leaveType} · {fmtDay(a.from)} → {fmtDay(a.to)}</p>
                  <p className="mt-0.5 line-clamp-1 font-mono text-[10.5px] text-text-secondary">{a.days} day{a.days === 1 ? '' : 's'} · to {a.approverName || '—'} · {a.reason}</p>
                </div>
                <StatusBadge tone={STATUS_TONE[a.status]} dot={a.status === 'pending'}>{LEAVE_STATUS_LABEL[a.status]}</StatusBadge>
                <span className="inline-flex items-center gap-1">
                  <button type="button" title="View details" aria-label={`View ${a.leaveType}`} onClick={() => chrome.view(a)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                    <Eye size={15} />
                  </button>
                  <button type="button" title={a.status === 'draft' ? 'Discard draft' : 'Cancel application'} aria-label={`Cancel ${a.leaveType}`} onClick={() => chrome.cancel(a)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-error/15 hover:text-error">
                    <X size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <SectionHead title="My Leave History" body="Every application you have filed, newest first." />
        <div className="mt-3">
          <DataTable<LiveLeaveApplication>
            rows={mine} pageSize={8}
            emptyTitle="No leave history" emptyBody="File your first application above."
            columns={[
              {
                key: 'applied', header: 'Application Date', sortable: true, sortValue: (r) => r.submittedAt ?? r.from,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{r.submittedAt ? fmtStamp(r.submittedAt) : 'Draft'}</span>,
              },
              {
                key: 'type', header: 'Leave Type', sortable: true, sortValue: (r) => r.leaveType,
                render: (r) => <span className="text-[13px] whitespace-nowrap text-text-primary">{r.leaveType}</span>,
              },
              {
                key: 'start', header: 'Start Date', sortable: true, sortValue: (r) => r.from,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtDay(r.from)}</span>,
              },
              {
                key: 'end', header: 'End Date', sortable: true, sortValue: (r) => r.to,
                render: (r) => <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary">{fmtDay(r.to)}</span>,
              },
              {
                key: 'days', header: 'Total Days', sortable: true, sortValue: (r) => r.days,
                render: (r) => <span className="font-mono text-[12px] font-bold tabular-nums">{r.days}</span>,
              },
              {
                key: 'status', header: 'Status',
                render: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</StatusBadge>,
              },
              {
                key: 'approver', header: 'Approver',
                render: (r) => <span className="text-[13px] text-text-secondary">{r.approverName || '—'}</span>,
              },
              {
                key: 'actions', header: 'Actions',
                render: (r) => (
                  <button type="button" title="View details" aria-label={`View ${r.leaveType}`} onClick={() => chrome.view(r)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-text-secondary transition-all duration-300 hover:bg-white/40 hover:text-text-primary">
                    <Eye size={15} />
                  </button>
                ),
              },
            ]}
          />
        </div>
      </GlassCard>
    </>
  );
}

/* ---------------- hero page ---------------- */

export function LeaveManagement() {
  const q = useLiveLeave();
  const { role, pushToast } = useApp();
  const d = q.data;

  const [viewing, setViewing] = useState<LiveLeaveApplication | null>(null);
  const [rejecting, setRejecting] = useState<LiveLeaveApplication | null>(null);
  const [applying, setApplying] = useState(false);
  const [editingDraft, setEditingDraft] = useState<LiveLeaveApplication | null>(null);
  const [cancelling, setCancelling] = useState<LiveLeaveApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const dataRef = useRef(d);
  dataRef.current = d;
  const deepLinked = useRef(false);

  // Notification deep-links: open the exact record (or the apply form)
  // once data is ready; works on fresh visits and re-visits alike.
  useEffect(() => {
    const tryOpen = () => {
      const apps = dataRef.current?.applications ?? [];
      const { leaveId, apply } = consumeLeaveSelection();
      if (apply && !deepLinked.current) {
        deepLinked.current = true;
        setFormError(null);
        setApplying(true);
        return;
      }
      if (!leaveId || apps.length === 0) return;
      const app = apps.find((a) => a.id === leaveId);
      if (app) setViewing(app);
      else if (!deepLinked.current) {
        deepLinked.current = true;
        pushToast({ title: 'Application unavailable', body: 'It may have been withdrawn or belongs to another role.', tone: 'warning' });
      }
    };
    tryOpen();
    return subscribeLeaveSelection(tryOpen);
  }, [d, pushToast]);

  const run = async (label: string, fn: () => Promise<unknown>, done?: () => void) => {
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

  const chrome: Chrome = useMemo(() => ({
    view: (app) => setViewing(app),
    decide: (app, decision) => {
      setFormError(null);
      if (decision === 'rejected') setRejecting(app);
      else void run('Application approved', () => q.decideApplication(app.id, 'approved', ''), () => setViewing(null));
    },
    cancel: (app) => { setFormError(null); setCancelling(app); },
    submitDraft: (app) => {
      setFormError(null);
      const errs = validateLeaveInput(
        { leaveType: app.leaveType, from: app.from, to: app.to, reason: app.reason },
        (d?.applications ?? []).filter((a) => a.applicantId === app.applicantId && a.id !== app.id),
      );
      if (errs.length > 0) {
        setEditingDraft(app);
        setViewing(null);
        return;
      }
      void run('Application submitted', () => q.submitApplication({
        leaveType: app.leaveType, from: app.from, to: app.to, reason: app.reason,
        applicantId: app.applicantId, draftId: app.id,
      }), () => setViewing(null));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [d, q.decideApplication, q.submitApplication]);

  if (!d) {
    if (q.loading) return <LoadingCards count={5} />;
    const needsLogin = q.error?.name === 'SigninRequiredError' && LEAVE_LIVE;
    return (
      <div className="space-y-4">
        <ErrorState title="Could not load leave management" body={q.error?.message ?? 'Please try again.'} onRetry={q.reload} />
        <div className="flex justify-center">
          {needsLogin ? (
            <GlassButton variant="primary" onClick={() => setConnectOpen(true)}>Connect</GlassButton>
          ) : (
            <GlassButton variant="primary" icon={<CalendarHeart size={15} />} onClick={q.loadDemo}>
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
            audience="student" subject="leave" onClose={() => setConnectOpen(false)}
            onConnected={() => { setConnectOpen(false); q.reload(); }}
            onLoadDemo={() => { setConnectOpen(false); q.loadDemo(); }}
          />
        ) : null}
      </div>
    );
  }

  const apps = d.applications;
  // Re-resolve the open record from live data so realtime decisions
  // elsewhere never leave the drawer showing a stale status.
  const viewingCurrent = viewing ? (apps.find((a) => a.id === viewing.id) ?? viewing) : null;
  const mine = myApplications(apps, q.ownerIds);
  const teacherQueue = apps
    .filter((a) => a.applicantRole === 'student' && (q.synthetic
      ? a.approverName === TEACHER_SCOPE.name
      : a.approverId === (q.myId ?? '')))
    .sort((x, y) => x.from.localeCompare(y.from));
  const adminApps = apps.filter((a) => a.applicantRole === 'teacher');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SourceNote live={q.live} demo={q.demo} synthetic={q.synthetic} onExitDemo={q.exitDemo} />
      </div>

      {role === 'school-admin'
        ? <AdminLeaveView apps={adminApps} counts={leaveCounts(adminApps)} chrome={chrome} />
        : role === 'teacher'
          ? (
            <TeacherLeaveView
              queue={teacherQueue} mine={mine} counts={leaveCounts(teacherQueue)} chrome={chrome}
              onApply={() => { setFormError(null); setApplying(true); }}
            />
          )
          : <StudentLeaveView mine={mine} counts={leaveCounts(mine)} chrome={chrome} onApply={() => { setFormError(null); setApplying(true); }} />}

      {viewingCurrent ? (
        <LeaveDetailDrawer
          app={viewingCurrent}
          canDecideIt={q.canDecide(viewingCurrent)}
          isMine={q.ownerIds.includes(viewingCurrent.applicantId)}
          busy={busy}
          onClose={() => setViewing(null)}
          onApprove={() => void run('Application approved', () => q.decideApplication(viewingCurrent.id, 'approved', ''), () => setViewing(null))}
          onReject={() => { setRejecting(viewingCurrent); }}
          onCancel={() => { setCancelling(viewingCurrent); }}
          onSubmitDraft={() => chrome.submitDraft(viewingCurrent)}
        />
      ) : null}

      {(applying || editingDraft) ? (
        <ApplyLeaveModal
          draft={editingDraft} myApps={mine} busy={busy} formError={formError}
          onClose={() => { setApplying(false); setEditingDraft(null); }}
          onSubmit={(input) => void run(
            'Application submitted', () => q.submitApplication(input).then(() => undefined),
            () => { setApplying(false); setEditingDraft(null); setViewing(null); },
          )}
          onSaveDraft={(input) => void run(
            'Draft saved', () => q.saveDraft(input).then(() => undefined),
            () => { setApplying(false); setEditingDraft(null); },
          )}
        />
      ) : null}

      {rejecting ? (
        <RejectModal
          app={rejecting} busy={busy} formError={formError}
          onClose={() => setRejecting(null)}
          onReject={(reason) => void run(
            'Application rejected', () => q.decideApplication(rejecting.id, 'rejected', reason),
            () => { setRejecting(null); setViewing(null); },
          )}
        />
      ) : null}

      {cancelling ? (
        <Modal
          open onClose={() => setCancelling(null)}
          title={cancelling.status === 'draft' ? 'Discard draft' : 'Cancel application'}
          subtitle={`${cancelling.leaveType} · ${fmtDay(cancelling.from)} → ${fmtDay(cancelling.to)}`} width="max-w-sm"
          footer={(
            <>
              <GlassButton variant="ghost" onClick={() => setCancelling(null)}>Keep it</GlassButton>
              <GlassButton
                variant="danger-ghost" disabled={busy}
                onClick={() => {
                  const target = cancelling;
                  void run(
                    target.status === 'draft' ? 'Draft discarded' : 'Application cancelled',
                    () => q.cancelApplication(target.id),
                    () => { setCancelling(null); setViewing(null); },
                  );
                }}
              >
                {busy ? 'Working…' : cancelling.status === 'draft' ? 'Discard' : 'Cancel application'}
              </GlassButton>
            </>
          )}
        >
          <p className="text-[13.5px] text-text-secondary">
            {cancelling.status === 'draft'
              ? 'This draft will be discarded. This cannot be undone.'
              : `This withdraws the application. ${cancelling.approverName || 'The approver'} will no longer see it in the queue.`}
          </p>
          {formError ? <p className="mt-3 text-[12.5px] text-error">{formError}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------- Overview summary card ---------------- */

function IslandShell({ roleLabel, sub, children }: {
  roleLabel: string; sub: string; children: React.ReactNode;
}) {
  return (
    <GlassCard hover className="relative">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-periwinkle-2/50 bg-periwinkle-2/40 text-text-secondary">
          <CalendarHeart size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold text-text-primary">Leave Applications</h3>
          <p className="truncate text-[12.5px] text-text-secondary">{roleLabel} · {sub}</p>
        </div>
      </div>
      {children}
    </GlassCard>
  );
}

export function LeaveSummaryCard() {
  const q = useLiveLeave();
  const { role, go } = useApp();
  const d = q.data;

  if (role !== 'school-admin' && role !== 'teacher' && role !== 'student') return null;

  if (!d) {
    if (q.loading) {
      return (
        <IslandShell roleLabel="Leave" sub="loading…">
          <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Loading leave summary">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[64px] animate-pulse rounded-2xl bg-white/30" />)}
          </div>
        </IslandShell>
      );
    }
    return (
      <IslandShell roleLabel="Leave" sub="unavailable">
        <div className="mt-4 rounded-2xl border border-white/30 bg-white/20 px-4 py-4 text-center">
          <p className="text-[13px] font-semibold text-text-primary">Leave summary unavailable</p>
          <p className="mt-0.5 text-[12px] text-text-secondary">{q.error?.message ?? 'Please try again.'}</p>
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <GlassButton variant="primary" onClick={q.loadDemo}>Load example data</GlassButton>
          </div>
        </div>
      </IslandShell>
    );
  }

  const mine = myApplications(d.applications, q.ownerIds);
  const mineCounts = leaveCounts(mine);
  const queue = pendingQueue(d.applications, role,
    role === 'teacher' ? TEACHER_SCOPE.name : '');
  const teacherApps = d.applications.filter((a) => a.applicantRole === 'teacher');
  const adminCounts = leaveCounts(teacherApps);

  if (role === 'school-admin') {
    const tiles = [
      { label: 'Pending', value: adminCounts.pending },
      { label: 'Approved', value: adminCounts.approved },
      { label: 'Rejected', value: adminCounts.rejected },
    ];
    return (
      <IslandShell roleLabel="Teacher applications" sub="school-wide">
        <div className="mt-4 grid grid-cols-3 gap-2">
          {tiles.map((t) => (
            <div key={t.label} data-glass="secondary" className="glass-surface rounded-2xl px-2 py-2.5 text-center">
              <p className="font-display text-[20px] leading-none font-bold text-text-primary tabular-nums">{t.value}</p>
              <p className="mt-1 font-mono text-[9.5px] tracking-[0.08em] text-text-secondary uppercase">{t.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <GlassButton variant="primary" className="flex-1" onClick={() => go('leave-management')}>
            Review Applications
          </GlassButton>
          <GlassButton variant="glass" className="flex-1" onClick={() => go('leave-management')}>
            Open Leave Management
          </GlassButton>
        </div>
      </IslandShell>
    );
  }

  if (role === 'teacher') {
    const tiles = [
      { label: 'To review', value: queue.length },
      { label: 'My pending', value: mineCounts.pending },
      { label: 'Approved', value: mineCounts.approved },
      { label: 'Rejected', value: mineCounts.rejected },
    ];
    return (
      <IslandShell roleLabel="My leave + queue" sub={TEACHER_SCOPE.name}>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {tiles.map((t) => (
            <div key={t.label} data-glass="secondary" className="glass-surface rounded-2xl px-2 py-2.5 text-center">
              <p className="font-display text-[20px] leading-none font-bold text-text-primary tabular-nums">{t.value}</p>
              <p className="mt-1 font-mono text-[9.5px] tracking-[0.08em] text-text-secondary uppercase">{t.label}</p>
            </div>
          ))}
        </div>
        {queue.length > 0 ? (
          <p className="mt-3 text-[12.5px] font-semibold text-warning">
            {queue.length} student application{queue.length === 1 ? '' : 's'} need{queue.length === 1 ? 's' : ''} your decision
            {q.synthetic ? <span className="font-mono text-[10.5px] font-normal"> · Demo</span> : null}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <GlassButton
            variant="primary" className="flex-1"
            onClick={() => { queueLeaveApply(); go('leave-management'); }}
          >
            Apply for Leave
          </GlassButton>
          <GlassButton variant="glass" className="flex-1" onClick={() => go('leave-management')}>
            View Leave History
          </GlassButton>
        </div>
      </IslandShell>
    );
  }

  const tiles = [
    { label: 'Mine', value: mineCounts.total },
    { label: 'Pending', value: mineCounts.pending },
    { label: 'Approved', value: mineCounts.approved },
    { label: 'Rejected', value: mineCounts.rejected },
  ];
  return (
    <IslandShell roleLabel="My Leave Applications" sub={STUDENT_SCOPE.class}>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.label} data-glass="secondary" className="glass-surface rounded-2xl px-2 py-2.5 text-center">
            <p className="font-display text-[20px] leading-none font-bold text-text-primary tabular-nums">{t.value}</p>
            <p className="mt-1 font-mono text-[9.5px] tracking-[0.08em] text-text-secondary uppercase">{t.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <GlassButton
          variant="primary" className="flex-1"
          onClick={() => { queueLeaveApply(); go('leave-management'); }}
        >
          Apply for Leave
        </GlassButton>
        <GlassButton variant="glass" className="flex-1" onClick={() => go('leave-management')}>
          View Leave History
        </GlassButton>
      </div>
    </IslandShell>
  );
}

/* ---------------- realtime bridge (mounted once in the app shell) ---------------- */

export function LeaveLiveBridge() {
  useLeaveNotifications();
  useEffect(() => registerNotificationReadHook((id) => {
    void persistLeaveNotificationRead(id);
  }), []);
  return null;
}
