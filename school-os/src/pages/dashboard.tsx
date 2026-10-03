import { useState } from 'react';
import {
  ArrowRight, Bell, CalendarCheck2, CalendarRange, ClipboardList, GraduationCap,
  Presentation, Plus, Shapes, Sparkles, UserPlus, Users,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ASSIGNMENTS, ROLES, STAFF, UPCOMING_EVENTS } from '../lib/data';
import { api, sessionFor, useScopedQuery } from '../lib/api';
import { useLivePresence } from '../lib/presence-live';
import { useApp } from '../lib/store';
import type { Student, Teacher } from '../lib/types';
import { Avatar, Can, ChartCard, ErrorState, GlassButton, GlassCard, LoadingCards, MetricCard, Modal, SectionHead, StatusBadge } from '../components/glass';
import { FacultyPresenceIsland, StaffPresenceIsland, StudentDailyPresenceIsland } from '../components/presence';
import { MaintenanceSummaryCard } from './maintenance';
import { LeaveSummaryCard } from './leave-management';

const CH = { hi: 'var(--color-baby-blue-ice)', mid: 'var(--color-periwinkle-3)', low: 'var(--color-periwinkle-2)' };

export function ChartTip({ active, payload, label, suffix = '' }: { active?: boolean; payload?: readonly { value?: number | string; name?: string | number }[]; label?: string | number; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-periwinkle-2/60 bg-alice-blue/95 px-3 py-2 shadow-xl backdrop-blur-md">
      <p className="font-mono text-[10.5px] tracking-wide text-text-secondary uppercase">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-display text-[15px] font-bold text-text-primary tabular-nums">
          {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{suffix} <span className="text-[11px] font-medium text-text-secondary">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

const SCHOOL_ACTIVITY = [
  { who: 'Ritu Malhotra', what: 'exported the Grade 10-B morning register', time: '18 min ago' },
  { who: 'System', what: 'sent Q3 fee reminders to 42 families', time: '1 hr ago' },
  { who: 'Arjun Mehta', what: 'was assigned a new Grade 6 enquiry', time: '3 hrs ago' },
  { who: 'Rohan Sen', what: 'published “Annual Science Exhibition” draft', time: '5 hrs ago' },
];

/** One live punch-attendance row (faculty or staff) for the overview card. */
function FeedRow({ label, q }: {
  label: string;
  q: { data: { present: number; absent: number; total: number } | null; loading: boolean; error: Error | null };
}) {
  if (q.loading && !q.data) {
    return (
      <div aria-label={`Loading ${label} attendance`}>
        <div className="h-[14px] w-2/3 animate-pulse rounded-lg bg-white/30" />
        <div className="mt-2 h-2 w-full animate-pulse rounded-full bg-white/30" />
      </div>
    );
  }
  if (!q.data) {
    return <p className="text-[12px] text-text-secondary">{label}: {q.error?.name === 'SigninRequiredError' ? 'not connected' : 'unavailable'}</p>;
  }
  const pct = q.data.total === 0 ? 0 : Math.round((q.data.present / q.data.total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-bold text-text-primary">{label}</p>
        <p className="font-mono text-[11px] text-text-secondary tabular-nums">
          {q.data.present} in · {q.data.absent} out · {pct}%
        </p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-periwinkle-2/40">
        <div className="h-full rounded-full bg-periwinkle-3" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------------- Metric detail pop-ups ---------------- */

function BreakdownRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-bold text-text-primary">{label}</p>
        <p className="font-mono text-[11px] text-text-secondary tabular-nums">{count} · {pct}%</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-periwinkle-2/40">
        <div className="h-full rounded-full bg-periwinkle-3" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DetailTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} data-glass="secondary" className="glass-surface rounded-2xl px-3 py-2.5 text-center">
          <p className="font-display text-[20px] leading-none font-bold text-text-primary tabular-nums">{t.value}</p>
          <p className="mt-1 font-mono text-[9.5px] tracking-[0.08em] text-text-secondary uppercase">{t.label}</p>
        </div>
      ))}
    </div>
  );
}

function StudentsDetailModal({ students, onClose, onOpenDirectory }: {
  students: Student[]; onClose: () => void; onOpenDirectory: () => void;
}) {
  const total = students.length;
  const byStatus = (st: Student['status']) => students.filter((s) => s.status === st).length;
  const girls = students.filter((s) => s.gender === 'F').length;
  const avgAtt = total === 0 ? 0 : students.reduce((a, s) => a + s.attendance, 0) / total;
  const avgGpa = total === 0 ? 0 : students.reduce((a, s) => a + s.gpa, 0) / total;
  const gradeNum = (g: string) => parseInt(g.replace(/\D/g, ''), 10) || 0;
  const grades = Array.from(new Set(students.map((s) => s.grade))).sort((a, b) => gradeNum(a) - gradeNum(b));
  const girlPct = total === 0 ? 0 : Math.round((girls / total) * 100);

  return (
    <Modal
      open onClose={onClose} title="Total students" subtitle={`${total} directory records · live breakdown`} width="max-w-xl"
      footer={(
        <>
          <GlassButton variant="ghost" onClick={onClose}>Close</GlassButton>
          <GlassButton variant="primary" onClick={onOpenDirectory}>Open student directory</GlassButton>
        </>
      )}
    >
      <DetailTiles tiles={[
        { label: 'Active', value: String(byStatus('active')) },
        { label: 'Probation', value: String(byStatus('probation')) },
        { label: 'Pending', value: String(byStatus('pending')) },
        { label: 'Avg attend.', value: `${avgAtt.toFixed(1)}%` },
      ]} />
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12.5px] font-bold text-text-primary">Girls / Boys</p>
          <p className="font-mono text-[11px] text-text-secondary tabular-nums">{girls} / {total - girls} · avg GPA {avgGpa.toFixed(1)}</p>
        </div>
        <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-periwinkle-2/40">
          <div className="h-full rounded-full bg-periwinkle-3" style={{ width: `${girlPct}%` }} />
          <div className="h-full flex-1 rounded-full bg-baby-blue-ice" />
        </div>
      </div>
      <div className="mt-4 space-y-3.5">
        {grades.map((g) => (
          <BreakdownRow key={g} label={g} count={students.filter((s) => s.grade === g).length} total={total} />
        ))}
      </div>
    </Modal>
  );
}

function TeachersDetailModal({ teachers, onClose, onOpenDirectory }: {
  teachers: Teacher[]; onClose: () => void; onOpenDirectory: () => void;
}) {
  const total = teachers.length;
  const byStatus = (st: Teacher['status']) => teachers.filter((t) => t.status === st).length;
  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, x) => a + x, 0) / xs.length);
  const depts = Array.from(new Set(teachers.map((t) => t.dept))).sort();

  return (
    <Modal
      open onClose={onClose} title="Total teachers" subtitle={`${total} directory records · live breakdown`} width="max-w-xl"
      footer={(
        <>
          <GlassButton variant="ghost" onClick={onClose}>Close</GlassButton>
          <GlassButton variant="primary" onClick={onOpenDirectory}>Open faculty</GlassButton>
        </>
      )}
    >
      <DetailTiles tiles={[
        { label: 'Full-time', value: String(byStatus('full-time')) },
        { label: 'Part-time', value: String(byStatus('part-time')) },
        { label: 'On leave', value: String(byStatus('leave')) },
        { label: 'Avg rating', value: `${avg(teachers.map((t) => t.rating)).toFixed(1)} / 5` },
      ]} />
      <div className="mt-4 space-y-3.5">
        {depts.map((dept) => (
          <BreakdownRow key={dept} label={dept} count={teachers.filter((t) => t.dept === dept).length} total={total} />
        ))}
      </div>
      <p className="mt-4 rounded-xl border border-periwinkle-2/40 bg-white/35 px-3 py-2 text-[12px] text-text-secondary">
        Avg load <span className="font-bold text-text-primary">{avg(teachers.map((t) => t.load)).toFixed(1)} periods/week</span>
        {' · '}avg experience <span className="font-bold text-text-primary">{avg(teachers.map((t) => t.experience)).toFixed(1)} yrs</span>
      </p>
    </Modal>
  );
}

/* School Overview — school-admin ONLY. Served by api.schoolOverview,
   which refuses every other role. */
export function SchoolOverview() {
  const { role, go, pushToast } = useApp();
  const q = useScopedQuery(`overview:school:${role}`, () => api.schoolOverview(sessionFor(role)));
  const [range, setRange] = useState<'6M' | '1Y'>('6M');
  const [detail, setDetail] = useState<'students' | 'teachers' | null>(null);
  const fac = useLivePresence('faculty');
  const stf = useLivePresence('staff');
  const feedReady = Boolean(fac.data && stf.data);
  const feedSettled = !fac.loading && !stf.loading;
  const needsSignin = fac.error?.name === 'SigninRequiredError' || stf.error?.name === 'SigninRequiredError';
  const loadDemoBoth = () => { fac.loadDemo(); stf.loadDemo(); };
  const inToday = (fac.data?.present ?? 0) + (stf.data?.present ?? 0);
  const outToday = (fac.data?.absent ?? 0) + (stf.data?.absent ?? 0);

  if (q.loading) return <LoadingCards count={6} />;
  if (q.error || !q.data) return <GlassCard><ErrorState title={q.error?.name === 'ForbiddenError' ? 'Not authorized' : 'Could not load School Overview'} body={q.error?.message ?? 'Please try again.'} onRetry={q.reload} /></GlassCard>;
  const d = q.data;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const adminFirst = ROLES.find((r) => r.id === 'school-admin')?.name.split(' ')[0] ?? 'Admin';
  const isoWeek = (() => {
    const dt = new Date(); dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
    const w1 = new Date(dt.getFullYear(), 0, 4);
    return 1 + Math.round(((dt.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  })();
  const enrol = d.enrolment;
  const enrolPct = (((enrol[enrol.length - 1].students - enrol[0].students) / enrol[0].students) * 100).toFixed(1);
  const openWork = ASSIGNMENTS.filter((a) => a.status === 'published' || a.status === 'overdue');
  const overdueWork = openWork.filter((a) => a.status === 'overdue');

  return (
    <div className="stagger">
      <GlassCard level={2} sheen className="relative overflow-hidden">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar initials="AM" size="lg" index={1} />
          <div className="min-w-[220px] flex-1">
            <p className="font-mono text-[11px] tracking-[0.12em] text-text-secondary uppercase">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Northview High · Term 2 · Week {isoWeek}
            </p>
            <h2 className="font-display mt-1 text-[24px] font-bold tracking-tight text-text-primary sm:text-[28px]">
              {greeting}, {adminFirst}.
            </h2>
            <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-text-secondary">
              Enrolment is up {enrolPct}% this term. {d.attention.length} assignments need review across {d.classes.length} sections. {feedReady ? `${inToday} faculty & staff have punched in today · ${outToday} out.` : 'Connect the presence feed to see who is in today.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <GlassButton variant="primary" icon={<Sparkles size={15} />} onClick={() => pushToast({ title: 'Morning brief ready', body: 'Staff & faculty punch digest compiled for today.', tone: 'success' })}>
              Today’s brief
            </GlassButton>
            <Can do="student.create">
              <GlassButton icon={<UserPlus size={15} />} onClick={() => go('students-admissions')}>Add student</GlassButton>
            </Can>
          </div>
        </div>
      </GlassCard>

      <GlassCard hover className="mt-5">
        <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Quick actions</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Can do="student.create"><button onClick={() => go('students-admissions')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Users size={16} />Add student</button></Can>
          <Can do="teacher.invite"><button onClick={() => go('teachers-faculty')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Presentation size={16} />Add teacher</button></Can>
          <Can do="class.create"><button onClick={() => go('classes-classes')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Shapes size={16} />Create class</button></Can>
          <Can do="assignment.create"><button onClick={() => go('assignments')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Plus size={16} />Assignment</button></Can>
          <button onClick={() => go('attendance')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CalendarCheck2 size={16} />Attendance</button>
          <button onClick={() => go('timetable')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CalendarRange size={16} />Timetable</button>
        </div>
        <button onClick={() => go('notifications')} className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-periwinkle-2/40 bg-white/35 px-3 py-2.5 text-[12.5px] font-semibold text-text-secondary hover:bg-lavender-2/70 hover:text-text-primary">
          <Bell size={16} /> 3 unread notifications
        </button>
      </GlassCard>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard index={0} label="Total students" value={d.students.length.toLocaleString('en-IN')} delta={`+${enrolPct}%`} sub="vs last term" icon={<GraduationCap size={19} />} onClick={() => setDetail('students')} />
        <MetricCard index={1} label="Total teachers" value={String(d.teachers.length + STAFF.length)} delta={`${d.teachers.length} faculty`} deltaTone="flat" sub="faculty + staff" icon={<Presentation size={19} />} onClick={() => setDetail('teachers')} />
        <MetricCard index={2} label="Staff & faculty in" value={feedReady ? String(inToday) : "—"} delta="today" deltaTone="flat" sub={feedReady ? `${outToday} out` : "connect the feed"} icon={<CalendarCheck2 size={19} />} />
        <MetricCard index={3} label="Pending assignments" value={String(openWork.length)} delta={`${overdueWork.length} overdue`} deltaTone="down" sub="awaiting review" icon={<ClipboardList size={19} />} />
      </div>

      {detail === 'students' && (
        <StudentsDetailModal students={d.students} onClose={() => setDetail(null)} onOpenDirectory={() => { setDetail(null); go('students-directory'); }} />
      )}
      {detail === 'teachers' && (
        <TeachersDetailModal teachers={d.teachers} onClose={() => setDetail(null)} onOpenDirectory={() => { setDetail(null); go('teachers-faculty'); }} />
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <FacultyPresenceIsland />
        <StaffPresenceIsland />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <StudentDailyPresenceIsland />
        <MaintenanceSummaryCard />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <LeaveSummaryCard />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <ChartCard
          title="Enrolment & admissions" subtitle="Student strength with monthly intake · 2026"
          className="xl:col-span-2"
          action={
            <div className="flex rounded-xl border border-periwinkle-2/50 bg-white/35 p-1">
              {(['6M', '1Y'] as const).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={r === range ? 'rounded-lg bg-periwinkle-3 px-2.5 py-1 font-mono text-[11px] font-semibold text-text-primary' : 'cursor-pointer rounded-lg px-2.5 py-1 font-mono text-[11px] text-text-secondary'}>{r}</button>
              ))}
            </div>
          }
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.enrolment} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gStudents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CH.hi} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CH.hi} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gAdm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CH.low} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={CH.low} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                <XAxis dataKey="m" axisLine={false} tickLine={false} dy={6} />
                <YAxis axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="students" name="students" stroke={CH.hi} strokeWidth={2.4} fill="url(#gStudents)" dot={false} activeDot={{ r: 4, fill: CH.hi }} />
                <Area type="monotone" dataKey="admissions" name="admissions" stroke={CH.low} strokeWidth={2} strokeDasharray="5 4" fill="url(#gAdm)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 font-mono text-[11px] text-text-secondary">
            <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-baby-blue-ice" /> total students</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-6 rounded-full bg-periwinkle-2" /> new admissions</span>
          </div>
        </ChartCard>

        <ChartCard title="House standings" subtitle="Co-curricular points · Term 2" action={
          <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => go('students-performance')}>Details</GlassButton>
        }>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.houses} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="house" axisLine={false} tickLine={false} width={62} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }} />
                <Bar dataKey="points" radius={[6, 10, 10, 6]} barSize={22}>
                  {d.houses.map((h, i) => (
                    <Cell key={h.house} fill={i === 1 ? CH.hi : i === 3 ? CH.mid : CH.low} fillOpacity={i === 1 ? 1 : 0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 rounded-xl border border-periwinkle-2/40 bg-white/35 px-3 py-2 text-[12px] text-text-secondary">
            <span className="font-bold text-text-primary">Raman leads</span> by 170 points after the athletics heats.
          </p>
        </ChartCard>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <ChartCard
          title="Staff & faculty today" subtitle="Punch attendance · today"
          action={<GlassButton size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => go('attendance')}>Details</GlassButton>}
        >
          <div className="space-y-4 py-1">
            <FeedRow label="Faculty" q={fac} />
            <FeedRow label="Staff" q={stf} />
            {!feedReady && feedSettled && (
              <div className="rounded-xl border border-periwinkle-2/40 bg-white/35 px-3 py-2.5">
                <p className="text-[12px] text-text-secondary">
                  {needsSignin
                    ? 'Connect once from the Faculty or Staff island above to light up attendance everywhere.'
                    : 'Could not load punch attendance.'}
                </p>
                <div className="mt-2">
                  <GlassButton size="sm" variant="ghost" onClick={loadDemoBoth}>Load demo data</GlassButton>
                </div>
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Academic performance" subtitle="Grade bands · all assessed students">
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.grades} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="24%">
                <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                <XAxis dataKey="band" axisLine={false} tickLine={false} dy={6} tick={{ fontSize: 9.5 }} interval={0} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }} />
                <Bar dataKey="count" name="students" radius={[7, 7, 3, 3]} fill={CH.hi} fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Fee collection" subtitle="% collected by month" action={<StatusBadge tone="pending">Sep · in progress</StatusBadge>}>
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.fees} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gFee" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CH.mid} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CH.mid} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                <XAxis dataKey="m" axisLine={false} tickLine={false} dy={6} />
                <YAxis axisLine={false} tickLine={false} domain={[60, 100]} />
                <Tooltip content={<ChartTip suffix="%" />} />
                <Area type="monotone" dataKey="collected" name="collected" stroke={CH.mid} strokeWidth={2.4} fill="url(#gFee)" dot={{ r: 3, fill: CH.mid }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <GlassCard hover className="xl:col-span-2">
          <SectionHead
            title="Needs your attention"
            body="Assignments awaiting review, ordered by urgency."
            action={<GlassButton size="sm" icon={<ClipboardList size={14} />} onClick={() => go('assignments')}>All assignments</GlassButton>}
          />
          <div className="space-y-2.5">
            {d.attention.map((a, i) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3 transition-all duration-300 hover:-translate-y-[1px] hover:bg-lavender-2/70">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-periwinkle-3 font-mono text-[11px] font-bold text-text-primary">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-[180px] flex-1">
                  <p className="truncate text-[13.5px] font-bold text-text-primary">{a.title}</p>
                  <p className="font-mono text-[11px] text-text-secondary">{a.id} · {a.subject} · {a.class}</p>
                </div>
                <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-periwinkle-2/40 sm:block">
                  <div className="h-full rounded-full bg-periwinkle-3" style={{ width: `${Math.round((a.submitted / a.total) * 100)}%` }} />
                </div>
                <span className="font-mono text-[11px] text-text-secondary tabular-nums">{a.submitted}/{a.total}</span>
                <StatusBadge tone={a.status === 'overdue' ? 'overdue' : 'published'} dot>{a.status === 'overdue' ? 'Overdue' : 'Open'}</StatusBadge>
              </div>
            ))}
          </div>
          <h3 className="font-display mt-6 mb-2.5 text-[15px] font-bold tracking-tight text-text-primary">Recent school activity</h3>
          <div className="space-y-2">
            {SCHOOL_ACTIVITY.map((a) => (
              <div key={a.what} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                <Avatar initials={a.who.split(' ').map((w) => w[0]).slice(0, 2).join('')} size="sm" index={a.who.length} />
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary"><span className="font-bold text-text-primary">{a.who}</span> {a.what}</p>
                <span className="shrink-0 font-mono text-[10.5px] text-text-secondary">{a.time}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-5">
          <GlassCard hover>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Upcoming</h3>
              <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => go('timetable')}>Calendar</GlassButton>
            </div>
            <div className="space-y-2">
              {UPCOMING_EVENTS.map((e) => (
                <div key={e.title} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5">
                  <span className="w-12 shrink-0 text-center font-mono text-[11px] font-semibold text-text-primary">{e.date}</span>
                  <span className="h-8 w-px bg-periwinkle-3/50" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-text-primary">{e.title}</p>
                    <p className="font-mono text-[10.5px] text-text-secondary">{e.tag}</p>
                  </div>
                  {e.tone === 'high' && <span className="h-2 w-2 shrink-0 rounded-full bg-warning" title="High priority" />}
                </div>
              ))}
            </div>
          </GlassCard>

        </div>
      </div>
    </div>
  );
}
