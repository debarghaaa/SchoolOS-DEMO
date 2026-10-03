import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Eye, Flag, NotebookPen, Plus, UserRound } from 'lucide-react';
import {
  FLAG_CATEGORIES, NOTE_CATEGORIES, PRIORITIES, SEVERITIES, STATUS_LABEL,
  VISIBILITY_LABEL, VISIBILITY_OPTIONS, flagCounts, recordsForStudent,
  validateFlagInput, validateNoteInput,
  type FlagInput, type FlagRecord, type FlagVisibility, type NoteInput,
  type RecordStatus, type RosterEntry,
} from '../lib/flags';
import {
  FLAGS_LIVE, canonicalIdOf, consumeFlagSelection, persistFlagNotificationRead,
  queueFlagSelection, subscribeFlagSelection, useFlagNotifications, useLiveFlags,
} from '../lib/flags-live';
import { registerNotificationReadHook, useApp } from '../lib/store';
import { ConnectFeedModal } from '../components/presence';
import {
  DataTable, EmptyState, ErrorState, FieldLabel, GlassButton, GlassCard,
  GlassInput, GlassSelect, GlassTextarea, LoadingCards, MetricCard, Modal,
  SectionHead, StatusBadge,
} from '../components/glass';

/* =====================================================================
   Student Flags & Notes — hero metrics, filterable register, record
   detail with history, and the shared profile surface (StudentNotesPanel)
   mounted on every student profile: directory drawer (admin/teacher),
   my-children (parent) and my-classes (student).

   One canonical record per note/flag; RLS (live) and the scope mirror
   (demo) decide who sees what. No DELETE anywhere — notes archive,
   flags resolve.
   ===================================================================== */

/* ---------------- formatting + tone maps ---------------- */

function fmtStamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const LEVEL_TONE: Record<string, string> = {
  Critical: 'overdue', High: 'pending', Medium: 'neutral', Low: 'closed',
};

const STATUS_TONE: Record<RecordStatus, string> = {
  active: 'active', resolved: 'success', archived: 'closed',
};

const TYPE_TONE: Record<string, string> = { note: 'neutral', flag: 'pending' };

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

/* ---------------- record form (create / edit) ---------------- */

export interface FlagFormValue {
  type: 'note' | 'flag';
  studentKey: string;
  title: string;
  body: string;
  category: string;
  level: string;
  visibility: FlagVisibility;
}

function RecordFormModal({ record, createType, lockedStudent, roster, busy, formError, onClose, onSubmit }: {
  record: FlagRecord | null;
  createType: 'note' | 'flag';
  lockedStudent: { key: string; name: string; classLabel: string } | null;
  roster: RosterEntry[];
  busy: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (value: FlagFormValue) => void;
}) {
  const type = record?.type ?? createType;
  const [studentKey, setStudentKey] = useState(record?.studentKey ?? lockedStudent?.key ?? '');
  const [title, setTitle] = useState(record?.title ?? '');
  const [body, setBody] = useState(record?.body ?? '');
  const [category, setCategory] = useState(record?.category ?? (type === 'note' ? NOTE_CATEGORIES[0] : FLAG_CATEGORIES[0]));
  const [level, setLevel] = useState(record?.level ?? (type === 'note' ? 'Medium' : 'Medium'));
  const [visibility, setVisibility] = useState<FlagVisibility>(record?.visibility ?? 'all');
  const [errors, setErrors] = useState<string[]>([]);

  const categories = type === 'note' ? NOTE_CATEGORIES : FLAG_CATEGORIES;
  const levels = type === 'note' ? PRIORITIES : SEVERITIES;
  const studentLocked = Boolean(record ?? lockedStudent);

  const trySubmit = () => {
    const errs = studentKey === ''
      ? ['Choose the student this record belongs to.']
      : type === 'note'
        ? validateNoteInput({ title, body, category, priority: level as NoteInput['priority'], visibility })
        : validateFlagInput({ title, body, category, severity: level as FlagInput['severity'], visibility });
    setErrors(errs);
    if (errs.length === 0) onSubmit({ type, studentKey, title, body, category, level, visibility });
  };

  return (
    <Modal
      open onClose={onClose}
      title={record ? `Edit ${record.type}` : `New ${type}`}
      subtitle={record ? `${record.studentName} · ${record.studentClass}` : 'One record, visible to every role by its visibility.'}
    >
      <div className="space-y-4">
        {studentLocked ? (
          <p className="rounded-xl border border-periwinkle-2/40 bg-white/40 px-3 py-2 text-[13px] font-semibold text-text-primary">
            {record ? `${record.studentName} · ${record.studentClass} · Roll ${record.studentRoll}` : `${lockedStudent?.name} · ${lockedStudent?.classLabel}`}
          </p>
        ) : (
          <div>
            <FieldLabel>Student</FieldLabel>
            <GlassSelect value={studentKey} onChange={(e) => setStudentKey(e.target.value)} aria-label="Student">
              <option value="">Choose a student…</option>
              {roster.map((r) => (
                <option key={r.key} value={r.key}>{r.name} · {r.classLabel} · Roll {r.roll}</option>
              ))}
            </GlassSelect>
          </div>
        )}
        <div>
          <FieldLabel>Title</FieldLabel>
          <GlassInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'note' ? 'e.g. Library reading goal' : 'e.g. Repeated late arrivals'} />
        </div>
        <div>
          <FieldLabel>{type === 'note' ? 'Note' : 'Reason'}</FieldLabel>
          <GlassTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What should every concerned role know?" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel>Category</FieldLabel>
            <GlassSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </GlassSelect>
          </div>
          <div>
            <FieldLabel>{type === 'note' ? 'Priority' : 'Severity'}</FieldLabel>
            <GlassSelect value={level} onChange={(e) => setLevel(e.target.value)} aria-label={type === 'note' ? 'Priority' : 'Severity'}>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </GlassSelect>
          </div>
          <div>
            <FieldLabel>Visible to</FieldLabel>
            <GlassSelect value={visibility} onChange={(e) => setVisibility(e.target.value as FlagVisibility)} aria-label="Visible to">
              {VISIBILITY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </GlassSelect>
          </div>
        </div>
        {errors.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-[12.5px] text-error">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        {formError && <p className="text-[12.5px] text-error">{formError}</p>}
        <div className="flex justify-end gap-2">
          <GlassButton variant="glass" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" disabled={busy} onClick={trySubmit}>
            {busy ? 'Saving…' : record ? 'Save changes' : `Create ${type}`}
          </GlassButton>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- record detail ---------------- */

function HistoryTimeline({ record }: { record: FlagRecord }) {
  if (record.history.length === 0) return null;
  return (
    <ol className="mt-3 space-y-2.5 border-l-2 border-periwinkle-2/50 pl-4">
      {record.history.map((h, i) => (
        <li key={`${h.at}-${i}`}>
          <p className="text-[12.5px] font-semibold text-text-primary">
            {h.action[0].toUpperCase() + h.action.slice(1)}
            <span className="ml-1.5 font-normal text-text-secondary">by {h.actorName}</span>
          </p>
          {h.detail !== '' && <p className="text-[12px] text-text-secondary">{h.detail}</p>}
          <p className="font-mono text-[10.5px] text-text-secondary">{fmtStamp(h.at)}</p>
        </li>
      ))}
    </ol>
  );
}

function RecordDetailModal({ record, canManage, busy, actionError, onClose, onEdit, onResolve, onArchive, onViewStudent }: {
  record: FlagRecord;
  canManage: boolean;
  busy: boolean;
  actionError: string | null;
  onClose: () => void;
  onEdit: () => void;
  onResolve: () => void;
  onArchive: () => void;
  onViewStudent: () => void;
}) {
  const [confirming, setConfirming] = useState<'resolve' | 'archive' | null>(null);
  const terminal = record.type === 'note' ? 'archive' : 'resolve';
  const terminalDone = record.status !== 'active';
  return (
    <Modal open onClose={onClose} title={record.title} subtitle={`${record.studentName} · ${record.studentClass} · Roll ${record.studentRoll}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={TYPE_TONE[record.type]}>{record.type}</StatusBadge>
          <StatusBadge tone={STATUS_TONE[record.status]} dot>{STATUS_LABEL[record.status]}</StatusBadge>
          <StatusBadge tone={LEVEL_TONE[record.level] ?? 'neutral'}>{record.level}</StatusBadge>
          <StatusBadge tone="neutral">{record.category}</StatusBadge>
          <StatusBadge tone="neutral">{VISIBILITY_LABEL[record.visibility]}</StatusBadge>
        </div>
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-text-primary">{record.body}</p>
        <dl className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-xl bg-white/40 px-3 py-2"><dt className="text-text-secondary">Created by</dt><dd className="font-semibold text-text-primary">{record.createdBy}</dd></div>
          <div className="rounded-xl bg-white/40 px-3 py-2"><dt className="text-text-secondary">Created</dt><dd className="font-semibold text-text-primary">{fmtStamp(record.createdAt)}</dd></div>
          {record.resolvedBy && <div className="rounded-xl bg-white/40 px-3 py-2"><dt className="text-text-secondary">Resolved by</dt><dd className="font-semibold text-text-primary">{record.resolvedBy}</dd></div>}
          {record.resolvedAt && <div className="rounded-xl bg-white/40 px-3 py-2"><dt className="text-text-secondary">Resolved</dt><dd className="font-semibold text-text-primary">{fmtStamp(record.resolvedAt)}</dd></div>}
        </dl>
        <div>
          <p className="text-[12px] font-bold tracking-[0.04em] text-text-secondary uppercase">History</p>
          <HistoryTimeline record={record} />
        </div>
        {actionError && <p className="text-[12.5px] text-error">{actionError}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <GlassButton variant="glass" icon={<UserRound size={15} />} onClick={onViewStudent}>View student</GlassButton>
          {canManage && !terminalDone && (
            <>
              <GlassButton variant="glass" onClick={onEdit}>Edit</GlassButton>
              {confirming === terminal ? (
                <>
                  <GlassButton variant="glass" disabled={busy} onClick={() => setConfirming(null)}>Keep {record.status}</GlassButton>
                  <GlassButton
                    variant="primary" disabled={busy}
                    icon={terminal === 'resolve' ? <CheckCircle2 size={15} /> : <Archive size={15} />}
                    onClick={terminal === 'resolve' ? onResolve : onArchive}
                  >
                    {busy ? 'Saving…' : `Confirm ${terminal}`}
                  </GlassButton>
                </>
              ) : (
                <GlassButton
                  variant={terminal === 'resolve' ? 'primary' : 'glass'}
                  icon={terminal === 'resolve' ? <CheckCircle2 size={15} /> : <Archive size={15} />}
                  onClick={() => setConfirming(terminal)}
                >
                  {terminal === 'resolve' ? 'Resolve flag' : 'Archive note'}
                </GlassButton>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- realtime bridge (mounted once in the app shell) ---------------- */

export function FlagLiveBridge() {
  useFlagNotifications();
  useEffect(() => registerNotificationReadHook((id) => {
    void persistFlagNotificationRead(id);
  }), []);
  return null;
}

/* ---------------- directory row indicator ---------------- */

export function FlagDot({ studentKey }: { studentKey: string }) {
  const q = useLiveFlags();
  const hot = q.visibleRecords.some((r) =>
    r.studentKey === studentKey && r.type === 'flag' && r.status === 'active'
    && (r.level === 'High' || r.level === 'Critical'));
  if (!hot) return null;
  return (
    <span
      title="Active high-priority flag on this student"
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-error/15 align-middle text-error"
    >
      <Flag size={10} strokeWidth={2.5} />
    </span>
  );
}

/* ---------------- shared profile surface ----------------
   Mounted on every student profile: directory drawer (admin + teacher),
   my-children (parent) and my-classes (student). Renders nothing when
   the role may not view the student or no source is loaded yet. */

export function StudentNotesPanel({ grade, section, roll, focusRecordId }: {
  grade: string; section: string; roll: string; focusRecordId?: string | null;
}) {
  const q = useLiveFlags();
  const { pushToast } = useApp();
  const [viewing, setViewing] = useState<FlagRecord | null>(null);
  const [creating, setCreating] = useState<'note' | 'flag' | null>(null);
  const [editing, setEditing] = useState<FlagRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dismissedFocus, setDismissedFocus] = useState<string | null>(null);

  const key = q.data ? q.keyForStudent(grade, section, roll) : null;
  const records = useMemo(
    () => (key ? recordsForStudent(q.visibleRecords, key) : []),
    [key, q.visibleRecords],
  );

  // Deep-linked record, derived during render so late-arriving data opens it
  // without an effect; closing the modal consumes the deep link.
  const deepLinked = focusRecordId && focusRecordId !== dismissedFocus
    ? (q.visibleRecords.find((r) => r.id === focusRecordId && (key === null || r.studentKey === key)) ?? null)
    : null;

  if (!q.data) {
    if (q.loading) return null;
    if (q.error?.name === 'DemoSourceError') {
      return (
        <GlassCard>
          <EmptyState
            compact
            title="Notes & flags unavailable"
            body="Connect the live feed or load the example dataset."
            action={<GlassButton variant="primary" onClick={q.loadDemo}>Load example data</GlassButton>}
          />
        </GlassCard>
      );
    }
    return null;
  }
  if (!key || !q.canViewStudent(key)) return null;

  const savedBody = q.synthetic ? 'Saved to the example dataset.' : 'Saved to the live feed.';
  const run = async (title: string, fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
      pushToast({ title, body: savedBody, tone: 'success' });
      done?.();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submitForm = (v: FlagFormValue) => {
    if (editing) {
      void run('Record updated', () => q.updateRecord(editing.id, {
        title: v.title, body: v.body, category: v.category, level: v.level, visibility: v.visibility,
      }), () => { setEditing(null); setViewing(null); });
      return;
    }
    if (v.type === 'note') {
      void run('Note created', () => q.createNote({
        studentKey: v.studentKey, title: v.title, body: v.body, category: v.category,
        priority: v.level as NoteInput['priority'], visibility: v.visibility,
      }), () => setCreating(null));
    } else {
      void run('Flag created', () => q.createFlag({
        studentKey: v.studentKey, title: v.title, body: v.body, category: v.category,
        severity: v.level as FlagInput['severity'], visibility: v.visibility,
      }), () => setCreating(null));
    }
  };

  const viewingTarget = viewing ?? deepLinked;
  const viewingCurrent = viewingTarget ? (records.find((r) => r.id === viewingTarget.id) ?? viewingTarget) : null;
  const locked = { key, name: records[0]?.studentName ?? '', classLabel: records[0]?.studentClass ?? '' };
  const rosterName = q.data.roster.find((r) => r.key === key);
  if (rosterName) { locked.name = rosterName.name; locked.classLabel = rosterName.classLabel; }

  return (
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHead title="Notes & Flags" body={`${records.length} record${records.length === 1 ? '' : 's'} on this profile`} />
        {q.canManage && (
          <div className="flex gap-2">
            <GlassButton variant="glass" icon={<Plus size={14} />} onClick={() => { setFormError(null); setCreating('note'); }}>Note</GlassButton>
            <GlassButton variant="glass" icon={<Plus size={14} />} onClick={() => { setFormError(null); setCreating('flag'); }}>Flag</GlassButton>
          </div>
        )}
      </div>
      <div className="mt-3 space-y-2.5">
        {records.length === 0 && (
          <p className="rounded-2xl border border-dashed border-periwinkle-2/40 bg-white/30 p-5 text-center text-[13px] text-text-secondary">
            No notes or flags on this profile yet.
          </p>
        )}
        {records.map((r) => (
          <button
            key={r.id}
            onClick={() => { setFormError(null); setViewing(r); }}
            className="w-full cursor-pointer rounded-2xl border border-periwinkle-2/30 bg-white/40 p-3.5 text-left transition-all duration-300 hover:-translate-y-[1px] hover:shadow-lift"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={TYPE_TONE[r.type]}>{r.type}</StatusBadge>
              <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
              <StatusBadge tone={LEVEL_TONE[r.level] ?? 'neutral'}>{r.level}</StatusBadge>
              <span className="ml-auto font-mono text-[10.5px] text-text-secondary">{fmtStamp(r.createdAt)}</span>
            </div>
            <p className="mt-2 text-[13.5px] font-bold text-text-primary">{r.title}</p>
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-text-secondary">{r.body}</p>
            <p className="mt-1.5 font-mono text-[10.5px] text-text-secondary">{r.category} · {VISIBILITY_LABEL[r.visibility]} · by {r.createdBy}</p>
          </button>
        ))}
      </div>
      {viewingCurrent && (
        <RecordDetailModal
          record={viewingCurrent} canManage={q.canManage} busy={busy} actionError={formError}
          onClose={() => { setViewing(null); if (focusRecordId) setDismissedFocus(focusRecordId); }}
          onEdit={() => setEditing(viewingCurrent)}
          onResolve={() => void run('Flag resolved', () => q.resolveFlag(viewingCurrent.id), () => setViewing(null))}
          onArchive={() => void run('Note archived', () => q.archiveNote(viewingCurrent.id), () => setViewing(null))}
          onViewStudent={onCloseNoop}
        />
      )}
      {(creating || editing) && (
        <RecordFormModal
          record={editing} createType={creating ?? 'note'}
          lockedStudent={locked} roster={q.data.roster}
          busy={busy} formError={formError}
          onClose={() => { setCreating(null); setEditing(null); }}
          onSubmit={submitForm}
        />
      )}
    </GlassCard>
  );
}

function onCloseNoop(): void {
  /* The panel already sits on the student's profile; there is nowhere to go. */
}

/* ---------------- hero page (admin) ---------------- */

export function StudentFlags() {
  const q = useLiveFlags();
  const { go, pushToast } = useApp();
  const [typeFilter, setTypeFilter] = useState<'all' | 'note' | 'flag'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RecordStatus>('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [visFilter, setVisFilter] = useState<'all' | FlagVisibility>('all');
  const [viewing, setViewing] = useState<FlagRecord | null>(null);
  const [creating, setCreating] = useState<'note' | 'flag' | null>(null);
  const [editing, setEditing] = useState<FlagRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(() => consumeFlagSelection().recordId);

  useEffect(() => subscribeFlagSelection(() => {
    setFormError(null);
    setFocusId(consumeFlagSelection().recordId);
  }), []);

  const rows = useMemo(() => q.visibleRecords.filter((r) =>
    (typeFilter === 'all' || r.type === typeFilter) &&
    (statusFilter === 'all' || r.status === statusFilter) &&
    (levelFilter === 'all' || r.level === levelFilter) &&
    (visFilter === 'all' || r.visibility === visFilter)
  ), [q.visibleRecords, typeFilter, statusFilter, levelFilter, visFilter]);

  // Deep-linked record, derived during render so late-arriving data opens
  // it without an effect; closing the modal consumes the deep link.
  const deepLinked = focusId ? (q.visibleRecords.find((r) => r.id === focusId) ?? null) : null;

  const savedBody = q.synthetic ? 'Saved to the example dataset.' : 'Saved to the live feed.';
  const run = async (title: string, fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
      pushToast({ title, body: savedBody, tone: 'success' });
      done?.();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submitForm = (v: FlagFormValue) => {
    if (editing) {
      void run('Record updated', () => q.updateRecord(editing.id, {
        title: v.title, body: v.body, category: v.category, level: v.level, visibility: v.visibility,
      }), () => { setEditing(null); setViewing(null); });
      return;
    }
    if (v.type === 'note') {
      void run('Note created', () => q.createNote({
        studentKey: v.studentKey, title: v.title, body: v.body, category: v.category,
        priority: v.level as NoteInput['priority'], visibility: v.visibility,
      }), () => setCreating(null));
    } else {
      void run('Flag created', () => q.createFlag({
        studentKey: v.studentKey, title: v.title, body: v.body, category: v.category,
        severity: v.level as FlagInput['severity'], visibility: v.visibility,
      }), () => setCreating(null));
    }
  };

  const viewStudent = (record: FlagRecord) => {
    const nvId = canonicalIdOf(record);
    if (!nvId) {
      pushToast({ title: 'Student unavailable', body: 'This record’s student is not in the directory roster.', tone: 'warning' });
      return;
    }
    queueFlagSelection(nvId, record.id);
    go('students-directory');
  };

  const d = q.data;
  if (!d) {
    if (q.loading) return <LoadingCards count={5} />;
    const needsLogin = q.error?.name === 'SigninRequiredError' && FLAGS_LIVE;
    return (
      <div className="space-y-4">
        <ErrorState title="Could not load notes & flags" body={q.error?.message ?? 'Please try again.'} onRetry={q.reload} />
        <div className="flex justify-center">
          {needsLogin ? (
            <GlassButton variant="primary" onClick={() => setConnectOpen(true)}>Connect</GlassButton>
          ) : (
            <GlassButton variant="primary" icon={<NotebookPen size={15} />} onClick={q.loadDemo}>
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
            audience="faculty" subject="notes & flags" onClose={() => setConnectOpen(false)}
            onConnected={() => { setConnectOpen(false); q.reload(); }}
            onLoadDemo={() => { setConnectOpen(false); q.loadDemo(); }}
          />
        ) : null}
      </div>
    );
  }

  const counts = flagCounts(q.visibleRecords);
  const viewingTarget = viewing ?? deepLinked;
  const viewingCurrent = viewingTarget ? (q.visibleRecords.find((r) => r.id === viewingTarget.id) ?? viewingTarget) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SourceNote live={q.live} demo={q.demo} synthetic={q.synthetic} onExitDemo={q.exitDemo} />
        <div className="flex gap-2">
          <GlassButton variant="glass" icon={<Plus size={15} />} onClick={() => { setFormError(null); setCreating('note'); }}>New note</GlassButton>
          <GlassButton variant="primary" icon={<Flag size={15} />} onClick={() => { setFormError(null); setCreating('flag'); }}>New flag</GlassButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard label="Active flags" value={String(counts.activeFlags)} sub="open concerns" index={0} />
        <MetricCard label="High priority" value={String(counts.highPriority)} sub="needs attention" index={1} />
        <MetricCard label="Critical" value={String(counts.critical)} sub="act today" index={2} />
        <MetricCard label="Added this week" value={String(counts.recent)} sub="new records" index={3} />
        <MetricCard label="Resolved" value={String(counts.resolved)} sub="flags closed" index={4} />
      </div>

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead title="Register" body={`${rows.length} of ${q.visibleRecords.length} records`} />
          <div className="flex flex-wrap gap-2">
            <GlassSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | 'note' | 'flag')} aria-label="Filter by record type">
              <option value="all">Notes + Flags</option>
              <option value="note">Notes</option>
              <option value="flag">Flags</option>
            </GlassSelect>
            <GlassSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | RecordStatus)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="archived">Archived</option>
            </GlassSelect>
            <GlassSelect value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} aria-label="Filter by priority or severity">
              <option value="all">All levels</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </GlassSelect>
            <GlassSelect value={visFilter} onChange={(e) => setVisFilter(e.target.value as 'all' | FlagVisibility)} aria-label="Filter by visibility">
              <option value="all">All visibility</option>
              {VISIBILITY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </GlassSelect>
          </div>
        </div>
        <div className="mt-4">
          <DataTable<FlagRecord>
            rows={rows}
            searchable
            searchKeys={['title', 'body', 'studentName', 'studentClass', 'category']}
            searchPlaceholder="Search student, title, category…"
            pageSize={9}
            emptyTitle="No records match"
            emptyBody="Try adjusting the filters, or create the first record."
            onRowClick={(r) => { setFormError(null); setViewing(r); }}
            columns={[
              {
                key: 'student', header: 'Student',
                render: (r) => (
                  <span>
                    <span className="block font-semibold text-text-primary">{r.studentName}</span>
                    <span className="font-mono text-[10.5px] text-text-secondary">{r.studentClass} · Roll {r.studentRoll}</span>
                  </span>
                ),
              },
              {
                key: 'record', header: 'Record',
                render: (r) => (
                  <span>
                    <span className="block font-semibold text-text-primary">{r.title}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <StatusBadge tone={TYPE_TONE[r.type]}>{r.type}</StatusBadge>
                      <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                    </span>
                  </span>
                ),
              },
              { key: 'category', header: 'Category', render: (r) => <span className="text-text-secondary">{r.category}</span> },
              {
                key: 'level', header: 'Level',
                render: (r) => <StatusBadge tone={LEVEL_TONE[r.level] ?? 'neutral'}>{r.level}</StatusBadge>,
              },
              { key: 'visibility', header: 'Visible to', render: (r) => <span className="text-[12px] text-text-secondary">{VISIBILITY_LABEL[r.visibility]}</span> },
              { key: 'updated', header: 'Updated', render: (r) => <span className="font-mono text-[11px] text-text-secondary">{fmtStamp(r.updatedAt)}</span> },
              {
                key: 'actions', header: '',
                render: (r) => (
                  <span className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <GlassButton variant="glass" title="Open record" onClick={() => { setFormError(null); setViewing(r); }}><Eye size={14} /></GlassButton>
                    <GlassButton variant="glass" title="View student" onClick={() => viewStudent(r)}><UserRound size={14} /></GlassButton>
                  </span>
                ),
              },
            ]}
          />
        </div>
      </GlassCard>

      {viewingCurrent && (
        <RecordDetailModal
          record={viewingCurrent} canManage={q.canManage} busy={busy} actionError={formError}
          onClose={() => { setViewing(null); setFocusId(null); }}
          onEdit={() => setEditing(viewingCurrent)}
          onResolve={() => void run('Flag resolved', () => q.resolveFlag(viewingCurrent.id), () => setViewing(null))}
          onArchive={() => void run('Note archived', () => q.archiveNote(viewingCurrent.id), () => setViewing(null))}
          onViewStudent={() => viewStudent(viewingCurrent)}
        />
      )}
      {(creating || editing) && (
        <RecordFormModal
          record={editing} createType={creating ?? 'note'}
          lockedStudent={null} roster={d.roster}
          busy={busy} formError={formError}
          onClose={() => { setCreating(null); setEditing(null); }}
          onSubmit={submitForm}
        />
      )}
    </div>
  );
}
