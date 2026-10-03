import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Clock, Download, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ATTENDANCE_WEEK, LEAVE_QUOTA, classTeacherOf, leaveFor, registerFor } from '../lib/data';
import { LINKED_CHILDREN, STUDENT_SCOPE, TEACHER_SCOPE, attendanceSeries, isoWeek, teacherStudents } from '../lib/scoped';
import { useApp } from '../lib/store';
import type { Role } from '../lib/types';
import { cn } from '../lib/utils';
import { hashStr, type FacultyPresenceRecord, type StaffPresenceRecord } from '../lib/presence';
import { useLivePresence } from '../lib/presence-live';
import { ConnectFeedModal } from '../components/presence';
import {
  Avatar, Can, ChartCard, EmptyState, ErrorState, FieldLabel, GlassButton, GlassCard,
  GlassInput, GlassSelect, SectionHead, StatusBadge, Tabs,
} from '../components/glass';

export function Attendance() {
  const { role } = useApp();
  // Admins have no concern with student attendance: they get the live
  // faculty & staff punch view. Teachers keep the class register.
  if (role === 'school-admin') return <StaffAttendance />;
  if (role === 'student' || role === 'parent') return <MyAttendance role={role} />;
  return <StudentRegister />;
}

/* =====================================================================
   School-admin view — faculty & staff punch attendance, live from the feed.
   ===================================================================== */

type StaffTab = 'faculty' | 'staff';
type StaffRow = FacultyPresenceRecord | StaffPresenceRecord;

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }).replace(/\./g, '').toUpperCase();
}

function punchText(r: StaffRow): string {
  if (r.status === 'absent' || !r.punchIn) return 'Not punched in';
  return r.punchOut ? `In ${r.punchIn} · Out ${r.punchOut}` : `In ${r.punchIn} · On campus`;
}

function rowMeta(r: StaffRow): string {
  return 'subject' in r ? `${r.subject} · ${r.dept}` : `${r.role} · ${r.dept}`;
}

function StaffAttendance() {
  const { pushToast } = useApp();
  const fac = useLivePresence('faculty');
  const stf = useLivePresence('staff');
  const [tab, setTab] = useState<StaffTab>('faculty');
  const [query, setQuery] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);

  const q = tab === 'faculty' ? fac : stf;
  const rows = useMemo(
    () => (q.data?.records ?? []).filter((r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) || rowMeta(r).toLowerCase().includes(query.toLowerCase())),
    [q.data, query],
  );
  const missing = useMemo(
    () => [...(fac.data?.records ?? []), ...(stf.data?.records ?? [])]
      .filter((r) => r.status === 'absent')
      .slice(0, 6),
    [fac.data, stf.data],
  );
  const needsConnect = fac.error?.name === 'SigninRequiredError' || stf.error?.name === 'SigninRequiredError';
  const reloadBoth = () => { fac.reload(); stf.reload(); };
  const loadBoth = () => { fac.loadDemo(); stf.loadDemo(); };
  const exitBoth = () => { fac.exitDemo(); stf.exitDemo(); };
  const synthetic = fac.synthetic || stf.synthetic;

  const stat = (v: number | null) => (v === null ? '—' : String(v));

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid gap-5 sm:grid-cols-4">
        {[
          { l: 'Faculty in', v: stat(fac.data?.present ?? null), tone: 'text-success' },
          { l: 'Faculty out', v: stat(fac.data?.absent ?? null), tone: 'text-error' },
          { l: 'Staff in', v: stat(stf.data?.present ?? null), tone: 'text-success' },
          { l: 'Staff out', v: stat(stf.data?.absent ?? null), tone: 'text-error' },
        ].map((s) => (
          <GlassCard key={s.l} hover pad>
            <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
            <p className={cn('font-display mt-1.5 text-[30px] leading-none font-bold tabular-nums', s.tone)}>{s.v}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHead
              title="Today’s punch list"
              body={q.data ? `Synced ${fmtTime(q.data.syncedAt)} · ${q.data.total} on roster` : 'Punch status for everyone on campus duty'}
            />
            <Can do="attendance.export">
              <GlassButton
                size="sm" icon={<Download size={14} />}
                onClick={() => pushToast({ title: 'Punch list exported', body: `Today’s ${tab} attendance saved as PDF.`, tone: 'info' })}
              >
                Export
              </GlassButton>
            </Can>
          </div>

          <Tabs
            tabs={[
              { id: 'faculty', label: 'Faculty', count: fac.data?.total ?? 0 },
              { id: 'staff', label: 'Staff', count: stf.data?.total ?? 0 },
            ]}
            value={tab}
            onChange={setTab}
          />

          <div className="mt-3 mb-3 flex flex-wrap items-center gap-2">
            <GlassInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter roster…" className="min-w-[180px] flex-1" />
          </div>

          {q.data ? (
            rows.length === 0 ? (
              <EmptyState title="No records match" body="Nobody matches the current filter." />
            ) : (
              <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
                {rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5 transition-colors hover:bg-lavender-2/70">
                    <Avatar initials={r.initials} size="sm" index={hashStr(r.id)} />
                    <div className="min-w-[140px] flex-1">
                      <p className="text-[13px] font-bold text-text-primary">{r.name}</p>
                      <p className="font-mono text-[10.5px] text-text-secondary">{rowMeta(r)}</p>
                    </div>
                    <p className="font-mono text-[11px] whitespace-nowrap text-text-secondary">{punchText(r)}</p>
                    <StatusBadge tone={r.status} dot>{r.status === 'present' ? 'Present' : 'Absent'}</StatusBadge>
                  </div>
                ))}
              </div>
            )
          ) : q.loading ? (
            <div className="space-y-1.5" aria-label="Loading punch list">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-white/30" />)}
            </div>
          ) : needsConnect ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="font-display text-[15px] font-bold text-text-primary">Live feed disconnected</p>
              <p className="mt-1 max-w-[320px] text-[13px] text-text-secondary">
                Connect with your school login to stream today’s punch attendance.
              </p>
              <div className="mt-4"><GlassButton variant="primary" onClick={() => setConnectOpen(true)}>Connect</GlassButton></div>
              <button
                type="button" onClick={loadBoth}
                className="mt-2 cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
              >
                or load demo data
              </button>
            </div>
          ) : (
            <>
              <ErrorState
                title={q.error?.name === 'ForbiddenError' ? 'Not authorized' : 'Could not load punch attendance'}
                body={q.error?.message ?? 'Please try again.'}
                onRetry={reloadBoth}
              />
              <div className="flex justify-center">
                <button
                  type="button" onClick={loadBoth}
                  className="cursor-pointer font-mono text-[11px] text-text-secondary underline decoration-dotted underline-offset-2 hover:text-text-primary"
                >
                  or load demo data
                </button>
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-periwinkle-2/40 pt-4">
            <p className="font-mono text-[11.5px] text-text-secondary">
              {synthetic ? 'Example demo data · ' : ''}
              {q.data ? `${q.data.present} present · ${q.data.absent} absent · punch devices sync automatically` : 'Punch data arrives as people tap in'}
            </p>
            <div className="flex gap-2">
              {synthetic ? <GlassButton variant="ghost" onClick={exitBoth}>Exit demo</GlassButton> : null}
              <GlassButton variant="ghost" onClick={reloadBoth}>Refresh</GlassButton>
            </div>
          </div>
        </GlassCard>

        <div className="space-y-5">
          <GlassCard hover>
            <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Yet to punch in</h3>
            <p className="mt-0.5 mb-3 text-[12.5px] text-text-secondary">Absent so far today · nudges go by SMS</p>
            {missing.length === 0 ? (
              <p className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-3 text-[12.5px] text-text-secondary">
                {fac.data || stf.data ? 'Everyone on duty has punched in.' : 'Connect the feed to see who is missing.'}
              </p>
            ) : (
              <div className="space-y-2">
                {missing.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-text-primary">{r.name}</p>
                      <p className="truncate font-mono text-[10.5px] text-text-secondary">{rowMeta(r)}</p>
                    </div>
                    <GlassButton size="sm" variant="ghost" onClick={() => pushToast({ title: 'Reminder sent', body: `Punch-in nudge sent to ${r.name}.`, tone: 'info' })}>Nudge</GlassButton>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {connectOpen && (
        <ConnectFeedModal audience={tab} onClose={() => setConnectOpen(false)} onConnected={() => { setConnectOpen(false); reloadBoth(); }} onLoadDemo={() => { setConnectOpen(false); loadBoth(); }} />
      )}
    </div>
  );
}

/* =====================================================================
   Teacher view — class register (unchanged).
   ===================================================================== */

type Mark = 'present' | 'absent' | 'late';

function StudentRegister() {
  const { pushToast } = useApp();
  const classOptions = TEACHER_SCOPE.classes;
  const [cls, setCls] = useState(classOptions[0]);
  const [query, setQuery] = useState('');
  const roster = useMemo(() => registerFor(cls), [cls]);
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(roster.map((s) => [s.id, s.mark]))
  );
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setMarks(Object.fromEntries(registerFor(cls).map((st) => [st.id, st.mark])));
    setSubmitted(false);
  }, [cls]);

  const rows = roster.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()) || s.id.toLowerCase().includes(query.toLowerCase())
  );
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const defaulters = useMemo(() => [...teacherStudents()]
    .sort((a, b) => a.attendance - b.attendance).slice(0, 3), []);

  const stats = useMemo(() => {
    const vals = Object.values(marks);
    const present = vals.filter((v) => v === 'present').length;
    const late = vals.filter((v) => v === 'late').length;
    const absent = vals.filter((v) => v === 'absent').length;
    return { present, late, absent, pct: Math.round(((present + late * 0.5) / vals.length) * 1000) / 10 };
  }, [marks]);

  const setMark = (id: string, m: Mark) => {
    setMarks((p) => ({ ...p, [id]: m }));
    setSubmitted(false);
  };
  const markAll = (m: Mark) => {
    setMarks(Object.fromEntries(roster.map((s) => [s.id, m])));
    setSubmitted(false);
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid gap-5 sm:grid-cols-4">
        {[
          { l: 'Present', v: stats.present, tone: 'text-success' },
          { l: 'Late', v: stats.late, tone: 'text-warning' },
          { l: 'Absent', v: stats.absent, tone: 'text-error' },
          { l: 'Session score', v: `${stats.pct}%`, tone: 'text-text-primary' },
        ].map((s) => (
          <GlassCard key={s.l} hover pad>
            <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
            <p className={cn('font-display mt-1.5 text-[30px] leading-none font-bold tabular-nums', s.tone)}>{s.v}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2">
          <p className="mb-4 rounded-2xl border border-periwinkle-2/40 bg-white/35 px-4 py-2.5 font-mono text-[11.5px] text-text-secondary">
            scoped view · you may only mark {TEACHER_SCOPE.classes.join(' and ')}
          </p>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHead title="Morning register" body={`${cls} · ${todayStr} · Period 1`} />
            <div className="flex flex-wrap gap-2">
              <GlassSelect value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Select class">
                {classOptions.map((c) => <option key={c}>{c}</option>)}
              </GlassSelect>
              <Can do="attendance.export">
                <GlassButton size="sm" icon={<Download size={14} />} onClick={() => pushToast({ title: 'Register exported', body: `${cls} attendance saved as PDF.`, tone: 'info' })}>Export</GlassButton>
              </Can>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <GlassInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter roster…" className="min-w-[180px] flex-1" />
            <GlassButton size="sm" variant="ghost" onClick={() => markAll('present')}>All present</GlassButton>
            <GlassButton size="sm" variant="ghost" onClick={() => markAll('absent')}>Clear</GlassButton>
          </div>

          <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
            {rows.map((s, i) => {
              const m = marks[s.id];
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5 transition-colors hover:bg-lavender-2/70">
                  <Avatar initials={s.initials} size="sm" index={i} />
                  <div className="min-w-[140px] flex-1">
                    <p className="text-[13px] font-bold text-text-primary">{s.name}</p>
                    <p className="font-mono text-[10.5px] text-text-secondary">{s.id} · Roll {s.roll}</p>
                  </div>
                  <div className="flex rounded-xl border border-periwinkle-2/50 bg-white/35 p-1" role="radiogroup" aria-label={`Mark ${s.name}`}>
                    {([
                      { v: 'present', icon: <Check size={13} />, label: 'Present' },
                      { v: 'late', icon: <Clock size={13} />, label: 'Late' },
                      { v: 'absent', icon: <X size={13} />, label: 'Absent' },
                    ] as { v: Mark; icon: React.ReactNode; label: string }[]).map((o) => (
                      <button
                        key={o.v} role="radio" aria-checked={m === o.v} title={o.label}
                        onClick={() => setMark(s.id, o.v)}
                        className={cn(
                          'flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-all',
                          m === o.v
                            ? 'bg-periwinkle-3 text-text-primary'
                            : 'text-text-secondary hover:bg-lavender-2/70',
                        )}
                      >
                        {o.icon}<span className="hidden sm:inline">{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-periwinkle-2/40 pt-4">
            <p className="font-mono text-[11.5px] text-text-secondary">
              {submitted ? '✓ submitted · guardians notified by SMS' : `${rows.length} students · unsaved changes`}
            </p>
            <div className="flex gap-2">
              <GlassButton variant="ghost" onClick={() => markAll('present')}>Reset</GlassButton>
              <Can do="attendance.mark">
                <GlassButton
                  variant="primary" icon={<Check size={15} />}
                  onClick={() => { setSubmitted(true); pushToast({ title: 'Register submitted', body: `${stats.present} present · ${stats.late} late · ${stats.absent} absent in ${cls}.`, tone: 'success' }); }}
                >
                  Submit register
                </GlassButton>
              </Can>
            </div>
          </div>
        </GlassCard>

        <div className="space-y-5">
          <ChartCard title="Week trend" subtitle="Present % · whole school">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ATTENDANCE_WEEK} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} interval={0} dy={4} />
                  <YAxis axisLine={false} tickLine={false} domain={[80, 100]} />
                  <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }} content={({ active, payload, label }: any) => active && payload ? (
                    <div className="rounded-xl border border-periwinkle-2/60 bg-alice-blue/95 px-3 py-2 shadow-xl">
                      <p className="font-mono text-[10.5px] text-text-secondary uppercase">{label}</p>
                      <p className="font-display text-[15px] font-bold text-text-primary">{payload[0]?.value}% present</p>
                    </div>
                  ) : null} />
                  <Bar dataKey="present" radius={[6, 6, 2, 2]} fill="var(--color-periwinkle-3)">
                    {ATTENDANCE_WEEK.map((d, i) => <Cell key={i} fillOpacity={d.present < 90 ? 0.55 : 0.92} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <GlassCard hover>
            <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Defaulter watch</h3>
            <p className="mt-0.5 mb-3 text-[12.5px] text-text-secondary">Below 85% this month · auto-flagged</p>
            <div className="space-y-2">
              {defaulters.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-text-primary">{d.name} · {d.grade.replace('Grade ', '')}-{d.section}</p>
                  </div>
                  <StatusBadge tone={d.attendance < 75 ? 'overdue' : 'pending'}>{d.attendance.toFixed(1)}%</StatusBadge>
                  <GlassButton size="sm" variant="ghost" onClick={() => pushToast({ title: 'Guardian notified', body: `Counselling invite sent for ${d.name}.`, tone: 'info' })}>Notify</GlassButton>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function MyAttendance({ role }: { role: Role }) {
  const { pushToast } = useApp();
  const isParent = role === 'parent';
  const [childId, setChildId] = useState(LINKED_CHILDREN[0].id);
  const child = LINKED_CHILDREN.find((c) => c.id === childId)!;
  const viewId = isParent ? child.id : STUDENT_SCOPE.id;
  const pct = isParent ? child.attendance : STUDENT_SCOPE.attendance;
  const series = attendanceSeries(viewId);
  const weekNo = isoWeek();
  const data = series.weeks.map((v, i) => ({ w: `W${weekNo - 5 + i}`, pct: v }));
  const days = ['M', 'T', 'W', 'T', 'F', 'S'];
  const grid = series.grid;
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const approver = classTeacherOf(isParent ? child.class : STUDENT_SCOPE.class);
  const [leaves, setLeaves] = useState(() => leaveFor(viewId));
  const [leaveReason, setLeaveReason] = useState('');
  useEffect(() => { setLeaves(leaveFor(viewId)); setLeaveReason(''); }, [viewId]);
  const leavesLeft = LEAVE_QUOTA - leaves.filter((l) => l.status === 'approved').reduce((a, l) => a + l.days, 0);
  const applyLeave = () => {
    const reason = leaveReason.trim();
    if (!reason) {
      pushToast({ title: 'Describe the leave', body: 'Add dates and a reason first.', tone: 'warning' });
      return;
    }
    const name = isParent ? child.name : STUDENT_SCOPE.name;
    setLeaves((prev) => [...prev, {
      id: `L-${Date.now().toString(36).toUpperCase()}`, applicantId: viewId, applicantName: name,
      applicantRole: 'student', approverName: approver, from: '', to: '', days: 1,
      reason, status: 'pending', note: null,
    }]);
    setLeaveReason('');
    pushToast({ title: 'Leave applied', body: `Request sent to ${approver} for approval.`, tone: 'success' });
  };
  return (
    <div className="animate-fade-up space-y-5">
      {isParent && (
        <div className="flex flex-wrap gap-2">
          {LINKED_CHILDREN.map((c) => (
            <button
              key={c.id} onClick={() => setChildId(c.id)} aria-pressed={childId === c.id}
              className={cn(childId === c.id ? 'bg-periwinkle-3 text-text-primary shadow' : 'btn-glass', 'cursor-pointer rounded-xl px-4 py-2 text-[13px] font-semibold')}
            >
              {c.name} · {c.class}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-3">
        {[
          { l: isParent ? `${child.name.split(' ')[0]}’s attendance` : 'My attendance', v: `${pct}%`, d: `Term 2 · ${isParent ? child.class : STUDENT_SCOPE.class}` },
          { l: 'Present streak', v: `${series.streak} days`, d: series.streak >= 15 ? 'personal best this year' : 'keep it going' },
          { l: 'Leaves left', v: String(leavesLeft), d: `of ${LEAVE_QUOTA} annual · apply below` },
        ].map((s) => (
          <GlassCard key={s.l} hover>
            <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
            <p className="font-display mt-2 text-[30px] leading-none font-bold text-text-primary tabular-nums">{s.v}</p>
            <p className="mt-2 text-[12.5px] text-text-secondary">{s.d}</p>
          </GlassCard>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Weekly attendance" subtitle={isParent ? `${child.name} · ${child.class}` : `${STUDENT_SCOPE.name} · ${STUDENT_SCOPE.class}`}>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                <XAxis dataKey="w" axisLine={false} tickLine={false} dy={4} />
                <YAxis axisLine={false} tickLine={false} domain={[85, 100]} />
                <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }} content={({ active, payload, label }: any) => active && payload ? (
                  <div className="rounded-xl border border-periwinkle-2/60 bg-alice-blue/95 px-3 py-2 shadow-xl">
                    <p className="font-mono text-[10.5px] text-text-secondary uppercase">{label}</p>
                    <p className="font-display text-[15px] font-bold text-text-primary">{payload[0]?.value}%</p>
                  </div>
                ) : null} />
                <Bar dataKey="pct" radius={[7, 7, 3, 3]} fill="var(--color-baby-blue-ice)" fillOpacity={0.88} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <GlassCard hover>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">{monthName} calendar</h3>
          <p className="mt-0.5 mb-3 text-[12.5px] text-text-secondary">Blue · present — Periwinkle · late — Grey · holiday</p>
          <div className="grid grid-cols-6 gap-2">
            {days.map((d, i) => <p key={i} className="text-center font-mono text-[10.5px] text-text-secondary">{d}</p>)}
            {grid.flat().map((v, i) => (
              <span key={i} className={cn(
                'grid h-9 place-items-center rounded-xl font-mono text-[11px] font-semibold',
                v === 1 && 'bg-white/30 text-success',
                v === 2 && 'bg-white/30 text-warning',
                v === 0 && 'bg-lavender/60 text-text-muted',
              )}>{1 + i}</span>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {leaves.length === 0 && (
              <p className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-3 text-[12.5px] text-text-secondary">No leave applications this term.</p>
            )}
            {leaves.map((l) => (
              <div key={l.id} className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-text-primary">{l.reason}</span>
                  <StatusBadge tone={l.status === 'approved' ? 'graded' : l.status === 'rejected' ? 'overdue' : 'pending'}>{l.status}</StatusBadge>
                </div>
                <p className="mt-0.5 font-mono text-[10.5px] text-text-secondary">{l.id} · {l.days}d · to {l.approverName}</p>
                {l.note && <p className="mt-0.5 text-[12px] text-text-secondary">“{l.note}”</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-periwinkle-2/40 bg-white/35 p-3.5">
            <FieldLabel>Apply for leave</FieldLabel>
            <div className="flex gap-2">
              <GlassInput placeholder="e.g. Oct 6–7 · family event" className="flex-1" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
              <GlassButton variant="primary" icon={<ChevronDown size={14} />} onClick={applyLeave}>Apply</GlassButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
