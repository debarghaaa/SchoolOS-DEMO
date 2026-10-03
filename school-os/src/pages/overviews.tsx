import { useState } from 'react';
import {
  ArrowRight, Bell, BookOpen, Boxes, Building2, CalendarCheck2, CalendarRange,
  CheckCircle2, ClipboardList, Clock, Flag, FlaskConical, GraduationCap, MapPin,
  Megaphone, MessageSquareHeart, Plus, ScrollText, Send, ShieldCheck, SquareTerminal,
  Trophy, UploadCloud, Users, Wallet,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, sessionFor, useScopedQuery } from '../lib/api';
import { inr } from '../lib/platform-data';
import {
  AARAV_FEEDBACK, CHILD_GRADES, LINKED_CHILDREN, STUDENT_FEEDBACK, attendanceSeries,
  childAssignments, livePeriod, todayFor, todayName,
} from '../lib/scoped';
import {
  ELAB_WEEK, LAB_PROBLEMS, ROLES, SCHOOL_DAY_RANGE, STUDENTS, SUBMISSIONS, UPCOMING_EVENTS,
} from '../lib/data';
import { useApp, useMyNotifications } from '../lib/store';
import { Avatar, Can, ChartCard, ErrorState, FieldLabel, GlassButton, GlassCard, GlassInput, GlassSelect, LoadingCards, MetricCard, Modal, SectionHead, StatusBadge } from '../components/glass';
import { StudentDailyPresenceIsland, StudentPresenceIsland } from '../components/presence';
import { LeaveSummaryCard } from './leave-management';
import { ChartTip } from './dashboard';

const CH = { hi: 'var(--color-baby-blue-ice)', mid: 'var(--color-periwinkle-3)', low: 'var(--color-periwinkle-2)' };
const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function QueryGate({ loading, error, reload, children }: { loading: boolean; error: Error | null; reload: () => void; children: React.ReactNode }) {
  if (loading) return <LoadingCards count={6} />;
  if (error) {
    const forbidden = error.name === 'ForbiddenError';
    return (
      <GlassCard>
        <ErrorState
          title={forbidden ? 'Not authorized' : 'Could not load this Overview'}
          body={forbidden ? `${error.message} This workspace is scoped to a different role.` : error.message}
          onRetry={reload}
        />
      </GlassCard>
    );
  }
  return <>{children}</>;
}

/* =====================================================================
   PLATFORM OVERVIEW — super-admin only
   ===================================================================== */
export function PlatformOverview() {
  const { role, go, pushToast } = useApp();
  const q = useScopedQuery(`overview:platform:${role}`, () => api.platformOverview(sessionFor(role)));
  const [createOpen, setCreateOpen] = useState(false);
  const [newSchool, setNewSchool] = useState('');

  return (
    <QueryGate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (() => {
        const d = q.data!;
        return (
          <div className="stagger">
            <GlassCard level={2} sheen>
              <div className="flex flex-wrap items-center gap-5">
                <Avatar initials="SA" size="lg" index={0} />
                <div className="min-w-[220px] flex-1">
                  <p className="font-mono text-[11px] tracking-[0.12em] text-text-secondary uppercase">{todayStr} · Northview Cloud · all regions</p>
                  <h2 className="font-display mt-1 text-[24px] font-bold tracking-tight text-text-primary sm:text-[28px]">{greeting}, Aarav.</h2>
                  <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-text-secondary">
                    {d.totals.active} of {d.totals.schools} schools healthy · {d.invoicesDue.length} invoices open · 2 tenants in trial.
                  </p>
                </div>
                <StatusBadge tone="graded" dot>All systems normal</StatusBadge>
              </div>
            </GlassCard>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard index={0} label="Total schools" value={String(d.totals.schools)} delta="+1 this month" sub={`${d.totals.trial} in trial`} icon={<Building2 size={19} />} />
              <MetricCard index={1} label="Platform users" value={d.totals.users.toLocaleString('en-IN')} delta="+4.2%" sub="students + staff + parents" icon={<Users size={19} />} />
              <MetricCard index={2} label="MRR" value={inr(d.totals.mrr)} delta="+6.1%" sub="across paid plans" icon={<Wallet size={19} />} />
              <MetricCard index={3} label="Avg. tenant health" value="91%" delta="1 suspended" deltaTone="down" sub="uptime · usage · payment" icon={<ShieldCheck size={19} />} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <ChartCard title="Tenant & user growth" subtitle="Schools onboarded vs platform users · 2026" className="xl:col-span-2">
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.growth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gTenants" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CH.hi} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={CH.hi} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                      <XAxis dataKey="m" axisLine={false} tickLine={false} dy={6} />
                      <YAxis axisLine={false} tickLine={false} width={48} />
                      <Tooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="users" name="users" stroke={CH.hi} strokeWidth={2.4} fill="url(#gTenants)" dot={false} />
                      <Area type="monotone" dataKey="tenants" name="tenants" stroke={CH.low} strokeWidth={2} strokeDasharray="5 4" fill="transparent" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Subscription mix" subtitle="MRR in ₹L by plan">
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.planMix} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="plan" axisLine={false} tickLine={false} width={80} />
                      <Tooltip content={<ChartTip suffix="L" />} cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }} />
                      <Bar dataKey="mrr" name="MRR ₹L" radius={[6, 10, 10, 6]} barSize={24}>
                        {d.planMix.map((p, i) => <Cell key={p.plan} fill={i === 2 ? CH.hi : i === 1 ? CH.mid : CH.low} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <GlassButton size="sm" className="mt-2 w-full" icon={<ArrowRight size={14} />} onClick={() => go('subscriptions')}>Open billing</GlassButton>
              </ChartCard>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <GlassCard hover className="xl:col-span-2">
                <SectionHead title="Tenant health" body="Live status across all schools" action={<GlassButton size="sm" onClick={() => go('tenants')}>Manage tenants</GlassButton>} />
                <div className="space-y-2">
                  {d.tenants.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-2.5 transition-all hover:bg-lavender-2/70">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-periwinkle-3 font-mono text-[10px] font-bold text-text-primary">{t.id.replace('T-', '')}</span>
                      <div className="min-w-[150px] flex-1">
                        <p className="text-[13px] font-bold text-text-primary">{t.school}</p>
                        <p className="font-mono text-[10.5px] text-text-secondary">{t.city} · {t.students.toLocaleString()} students · {t.plan}</p>
                      </div>
                      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-periwinkle-2/40 sm:block">
                        <span className="block h-full rounded-full bg-periwinkle-3" style={{ width: `${t.health}%` }} />
                      </span>
                      <StatusBadge tone={t.status === 'active' ? 'graded' : t.status === 'trial' ? 'pending' : 'overdue'} dot>{t.status}</StatusBadge>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="space-y-5">
                <GlassCard hover>
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Quick actions</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <Can do="tenant.create"><button onClick={() => setCreateOpen(true)} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Plus size={16} />Create school</button></Can>
                    <button onClick={() => go('tenants')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Boxes size={16} />Manage tenants</button>
                    <button onClick={() => go('subscriptions')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Wallet size={16} />Manage subscriptions</button>
                    <button onClick={() => go('feature-flags')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Flag size={16} />Manage feature flags</button>
                  </div>
                </GlassCard>

                <GlassCard hover>
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Flag status</h3>
                    <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => go('feature-flags')}>All</GlassButton>
                  </div>
                  <div className="space-y-2">
                    {d.flags.map((f) => (
                      <div key={f.id} className="flex items-center gap-2.5 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${f.production ? 'bg-success' : 'bg-periwinkle-2'}`} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">{f.name}</span>
                        <span className="font-mono text-[10.5px] text-text-secondary">{f.rollout}%</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </div>

            <GlassCard hover className="mt-5">
              <SectionHead title="Recent platform activity" body="Audit trail · allowed and denied" action={<GlassButton size="sm" variant="ghost" icon={<ScrollText size={14} />} onClick={() => go('audit-logs')}>Full audit log</GlassButton>} />
              <div className="grid gap-2 md:grid-cols-2">
                {d.audit.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                    <span className={`font-mono text-[10px] font-bold ${a.result === 'allowed' ? 'text-success bg-white/40 rounded px-1' : 'text-error bg-white/40 rounded px-1'}`}>{a.result === 'allowed' ? 'ALLOW' : 'DENY'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11.5px] font-semibold text-text-primary">{a.action}</p>
                      <p className="truncate font-mono text-[10.5px] text-text-secondary">{a.actor} · {a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create school" subtitle="Provisions a new isolated tenant with default roles."
              footer={<>
                <GlassButton variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</GlassButton>
                <GlassButton variant="primary" onClick={async () => {
                  const res = await api.createTenant(sessionFor(role), newSchool || 'Untitled School');
                  setCreateOpen(false); setNewSchool('');
                  pushToast({ title: 'Tenant provisioned', body: `${res.id} · onboarding invite sent to owner.`, tone: 'success' });
                }}>Provision tenant</GlassButton>
              </>}>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2"><FieldLabel>School name</FieldLabel><GlassInput value={newSchool} onChange={(e) => setNewSchool(e.target.value)} placeholder="e.g. Riverside Public School" /></div>
                <div><FieldLabel>City</FieldLabel><GlassInput placeholder="City" /></div>
                <div><FieldLabel>Plan</FieldLabel><GlassSelect><option>Starter</option><option>Growth</option><option>Enterprise</option></GlassSelect></div>
              </div>
            </Modal>
          </div>
        );
      })()}
    </QueryGate>
  );
}

/* =====================================================================
   TEACHING OVERVIEW — teacher only
   ===================================================================== */
export function TeachingOverview() {
  const { role, go, pushToast } = useApp();
  const notes = useMyNotifications();
  const q = useScopedQuery(`overview:teaching:${role}`, () => api.teachingOverview(sessionFor(role)));

  return (
    <QueryGate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (() => {
        const d = q.data!;
        const myStudentCount = d.students.length;
        const nowPeriod = livePeriod(d.today);
        const flagged = d.students.filter((st) => st.status === 'probation').length;
        const scopeTitles = new Set(d.assignments.map((a) => a.title));
        const missingCount = SUBMISSIONS.filter((sb) => scopeTitles.has(sb.assignment) && sb.status === 'missing').length;
        const teacherFirst = d.scope.name.split(' ')[0];
        const teacherInitials = d.scope.name.split(' ').map((w) => w[0]).join('');
        return (
          <div className="stagger">
            <GlassCard level={2} sheen>
              <div className="flex flex-wrap items-center gap-5">
                <Avatar initials={teacherInitials} size="lg" index={2} />
                <div className="min-w-[220px] flex-1">
                  <p className="font-mono text-[11px] tracking-[0.12em] text-text-secondary uppercase">{todayStr} · {d.scope.subject} · Homeroom {d.scope.homeroom}</p>
                  <h2 className="font-display mt-1 text-[24px] font-bold tracking-tight text-text-primary sm:text-[28px]">{greeting}, {teacherFirst}.</h2>
                  <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-text-secondary">
                    {d.today.length} periods today · {d.pendingGrades} submissions waiting for grades
                    {nowPeriod ? <> · <span className="font-semibold text-text-primary">Period {nowPeriod.period} in session now</span></> : null}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Can do="attendance.mark">
                    <GlassButton variant="primary" icon={<CalendarCheck2 size={15} />} onClick={() => go('attendance')}>Mark attendance</GlassButton>
                  </Can>
                  <Can do="assignment.create">
                    <GlassButton icon={<Plus size={15} />} onClick={() => go('assignments')}>Create assignment</GlassButton>
                  </Can>
                </div>
              </div>
            </GlassCard>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard index={0} label="My classes" value={String(d.classes.length)} delta={d.scope.classes.join(' · ')} deltaTone="flat" sub="assigned to you" icon={<BookOpen size={19} />} />
              <MetricCard index={1} label="My students" value={String(myStudentCount)} delta={`${flagged} flagged`} deltaTone="flat" sub="across assigned classes" icon={<GraduationCap size={19} />} />
              <MetricCard index={2} label="Periods today" value={String(d.today.length)} delta={nowPeriod ? `P${nowPeriod.period} live` : 'done'} deltaTone={nowPeriod ? 'up' : 'flat'} sub={`${todayName()} schedule`} icon={<Clock size={19} />} />
              <MetricCard index={3} label="To grade" value={String(d.pendingGrades)} delta={missingCount > 0 ? `${missingCount} missing` : 'none missing'} deltaTone={missingCount > 0 ? 'down' : 'flat'} sub="ungraded submissions" icon={<ClipboardList size={19} />} />
            </div>

            <div className="mt-5">
              <StudentPresenceIsland />
            </div>

            <div className="mt-5">
              <LeaveSummaryCard />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <GlassCard hover className="xl:col-span-2">
                <SectionHead title="Today’s timetable" body="Your periods · rooms and classes" action={<GlassButton size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => go('timetable')}>Week view</GlassButton>} />
                <div className="space-y-2">
                  {d.today.length === 0 && <p className="rounded-2xl border border-dashed border-periwinkle-2/60 bg-white/35 p-5 text-center text-[13px] text-text-secondary">No periods scheduled today. Enjoy the breather.</p>}
                  {d.today.map((t) => {
                    const live = nowPeriod !== null && t.day === nowPeriod.day && t.period === nowPeriod.period;
                    return (
                      <div key={`${t.day}-${t.period}`} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${live ? 'border-periwinkle-3/60 bg-periwinkle/50 shadow-lift' : 'border-periwinkle-2/35 bg-white/35'}`}>
                        <span className="w-14 shrink-0"><span className="block font-mono text-[12px] font-bold text-text-primary">{t.time}</span><span className="block font-mono text-[10px] text-text-secondary">P{t.period}</span></span>
                        <span className="h-9 w-1 shrink-0 rounded-full bg-periwinkle-3" />
                        <div className="min-w-[140px] flex-1">
                          <p className="text-[13.5px] font-bold text-text-primary">{t.subject}</p>
                          <p className="font-mono text-[11px] text-text-secondary">{t.class} · Room {t.room}</p>
                        </div>
                        {live ? <StatusBadge tone="graded" dot>Live now</StatusBadge> : t.period < 4 ? <StatusBadge tone="closed">Done</StatusBadge> : <StatusBadge tone="neutral">Upcoming</StatusBadge>}
                        <Can do="attendance.mark">
                          <GlassButton size="sm" onClick={() => go('attendance')}>Register</GlassButton>
                        </Can>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              <div className="space-y-5">
                <GlassCard hover>
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Quick actions</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <Can do="attendance.mark"><button onClick={() => go('attendance')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CalendarCheck2 size={16} />Mark attendance</button></Can>
                    <Can do="assignment.create"><button onClick={() => go('assignments')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Plus size={16} />Create assignment</button></Can>
                    <button onClick={() => go('submissions')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Send size={16} />View submissions</button>
                    <button onClick={() => go('grades')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CheckCircle2 size={16} />Enter grades</button>
                    <button onClick={() => go('my-classes')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><BookOpen size={16} />Open class</button>
                  </div>
                </GlassCard>

                <GlassCard hover>
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">My classes</h3>
                    <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => go('my-classes')}>All</GlassButton>
                  </div>
                  <div className="space-y-2">
                    {d.classes.map((c) => (
                      <button key={c.id} onClick={() => go('my-classes')} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5 text-left hover:bg-lavender-2/70">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold text-text-primary">{c.name}</p>
                          <p className="font-mono text-[10.5px] text-text-secondary">{c.students} students · Room {c.room}</p>
                        </div>
                        <span className="font-mono text-[12px] font-bold text-text-primary tabular-nums">{c.avg}%</span>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <GlassCard hover>
                <SectionHead title="Pending submissions" body="Oldest first · from your classes" action={<GlassButton size="sm" onClick={() => go('submissions')}>Grade all</GlassButton>} />
                <div className="space-y-2">
                  {d.assignments.slice(0, 3).map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3">
                      <div className="min-w-[160px] flex-1">
                        <p className="truncate text-[13px] font-bold text-text-primary">{a.title}</p>
                        <p className="font-mono text-[10.5px] text-text-secondary">{a.class} · {a.total - a.submitted} still missing</p>
                      </div>
                      <StatusBadge tone={a.status === 'overdue' ? 'overdue' : a.status === 'draft' ? 'draft' : 'published'}>{a.status}</StatusBadge>
                      <Can do="assignment.remind">
                        <GlassButton size="sm" variant="ghost" onClick={() => pushToast({ title: 'Reminder sent', body: `Nudged pending students in ${a.class}.`, tone: 'success' })}>Remind</GlassButton>
                      </Can>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard hover>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Teaching notifications</h3>
                  <GlassButton size="sm" variant="ghost" icon={<Bell size={13} />} onClick={() => go('notifications')}>Inbox</GlassButton>
                </div>
                <div className="space-y-2">
                  {notes.slice(0, 4).map((n) => (
                    <div key={n.id} className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                      <p className="text-[12.5px] font-bold text-text-primary">{n.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-text-secondary">{n.body}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          </div>
        );
      })()}
    </QueryGate>
  );
}

/* =====================================================================
   MY OVERVIEW — student only
   ===================================================================== */
export function StudentOverview() {
  const { role, go } = useApp();
  const q = useScopedQuery(`overview:student:${role}`, () => api.studentOverview(sessionFor(role)));

  return (
    <QueryGate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (() => {
        const d = q.data!;
        const pending = d.assignments.filter((a) => a.status === 'published' || a.status === 'overdue');
        const ring = (d.me.attendance / 100) * 2 * Math.PI * 26;
        const series = attendanceSeries(d.me.id);
        const mates = STUDENTS.filter((st) => st.grade === d.me.grade && st.section === d.me.section)
          .sort((a, b) => b.gpa - a.gpa);
        const rank = mates.findIndex((st) => st.id === d.me.id) + 1;
        const liveSlot = livePeriod(d.today);
        const contest = UPCOMING_EVENTS.find((e) => e.title.includes('Code Autumn'));
        const elabSolved = LAB_PROBLEMS.filter((pb) => pb.solved);
        const elabStreak = (() => {
          let n = 0;
          for (let i = ELAB_WEEK.length - 1; i >= 0; i--) {
            if (ELAB_WEEK[i].min > 0) n++;
            else break;
          }
          return n;
        })();
        const elabRetry = LAB_PROBLEMS.find((pb) => pb.attempted && !pb.solved);
        const studentFirst = d.me.name.split(' ')[0];
        const overdueCount = pending.filter((a) => a.status === 'overdue').length;
        return (
          <div className="stagger">
            <GlassCard level={2} sheen>
              <div className="flex flex-wrap items-center gap-5">
                <Avatar initials={studentFirst.slice(0, 1) + d.me.name.split(' ')[1].slice(0, 1)} size="lg" index={0} />
                <div className="min-w-[220px] flex-1">
                  <p className="font-mono text-[11px] tracking-[0.12em] text-text-secondary uppercase">{todayStr} · {d.me.class} · Roll {d.me.roll}</p>
                  <h2 className="font-display mt-1 text-[24px] font-bold tracking-tight text-text-primary sm:text-[28px]">{greeting}, {studentFirst}.</h2>
                  <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-text-secondary">
                    {pending.length} assignments due this week · {series.streak}-day present streak · E-Lab contest starts {contest?.date ?? 'soon'}.
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-periwinkle-2/50 bg-white/35 px-4 py-2.5">
                  <svg width="56" height="56" viewBox="0 0 60 60">
                    <circle cx="30" cy="30" r="26" fill="none" stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" strokeWidth="6" />
                    <circle cx="30" cy="30" r="26" fill="none" stroke="var(--color-baby-blue-ice)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ring} 999`} transform="rotate(-90 30 30)" />
                    <text x="30" y="34" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--color-text-primary)">{d.me.attendance}%</text>
                  </svg>
                  <div>
                    <p className="text-[13px] font-bold text-text-primary">Attendance</p>
                    <p className="font-mono text-[10.5px] text-text-secondary">Term 2 · {series.streak}d streak</p>
                  </div>
                </div>
              </div>
            </GlassCard>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard index={0} label="Classes today" value={String(d.today.filter((t) => t.kind !== 'break').length)} delta={liveSlot ? `P${liveSlot.period} live` : 'done'} deltaTone={liveSlot ? 'up' : 'flat'} sub={SCHOOL_DAY_RANGE} icon={<Clock size={19} />} />
              <MetricCard index={1} label="Pending work" value={String(pending.length)} delta={overdueCount > 0 ? `${overdueCount} overdue` : 'on track'} deltaTone={pending.some((a) => a.status === 'overdue') ? 'down' : 'flat'} sub="due this week" icon={<ClipboardList size={19} />} />
              <MetricCard index={2} label="GPA · Term 2" value={d.me.gpa.toFixed(1)} delta="+0.3" sub={`rank ${rank} of ${mates.length}`} icon={<Trophy size={19} />} />
              <MetricCard index={3} label="E-Lab solved" value={`${elabSolved.length}/${LAB_PROBLEMS.length}`} delta={`${elabStreak}-day streak`} deltaTone="flat" sub={`${elabSolved.map((pb) => pb.topic[0].toUpperCase() + pb.topic.slice(1)).join(' · ')} done`} icon={<SquareTerminal size={19} />} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <GlassCard hover className="xl:col-span-2">
                <SectionHead title="Today’s classes" body={`${d.me.class} · ${todayName()}`} action={<GlassButton size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => go('timetable')}>Full timetable</GlassButton>} />
                <div className="space-y-2">
                  {d.today.map((t) => {
                    const live = liveSlot !== null && t.day === liveSlot.day && t.period === liveSlot.period;
                    if (t.kind === 'break') {
                      return (
                        <div key={t.period} className="flex items-center gap-3 rounded-xl border border-dashed border-periwinkle-2/50 px-4 py-2">
                          <span className="font-mono text-[11px] font-bold text-text-secondary">{t.time}</span>
                          <span className="text-[12px] font-semibold text-text-secondary">Lunch break</span>
                        </div>
                      );
                    }
                    return (
                      <div key={t.period} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2.5 ${live ? 'border-periwinkle-3/60 bg-periwinkle/50' : 'border-periwinkle-2/35 bg-white/35'}`}>
                        <span className="w-14 shrink-0"><span className="block font-mono text-[12px] font-bold text-text-primary">{t.time}</span><span className="block font-mono text-[10px] text-text-secondary">P{t.period}</span></span>
                        <div className="min-w-[140px] flex-1">
                          <p className="text-[13px] font-bold text-text-primary">{t.subject}</p>
                          <p className="font-mono text-[10.5px] text-text-secondary">{t.teacher} · Room {t.room}</p>
                        </div>
                        {live ? <StatusBadge tone="graded" dot>Live now</StatusBadge> : t.period < 4 ? <StatusBadge tone="closed">Done</StatusBadge> : <StatusBadge tone="neutral">P{t.period}</StatusBadge>}
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              <div className="space-y-5">
                <StudentDailyPresenceIsland />
                <LeaveSummaryCard />
                <GlassCard hover>
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Quick actions</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <button onClick={() => go('assignments')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><ClipboardList size={16} />View assignments</button>
                    <Can do="assignment.submit"><button onClick={() => go('submissions')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><UploadCloud size={16} />Submit assignment</button></Can>
                    <button onClick={() => go('timetable')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CalendarRange size={16} />View timetable</button>
                    <button onClick={() => go('grades')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CheckCircle2 size={16} />View grades</button>
                    <button onClick={() => go('elab')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><SquareTerminal size={16} />Open E-Lab</button>
                  </div>
                </GlassCard>

                <GlassCard hover>
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">E-Lab activity</h3>
                    <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => go('elab')}>Solve</GlassButton>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5">
                    <FlaskConical size={16} className="shrink-0 text-text-secondary" />
                    <div className="flex-1">
                      <p className="text-[12.5px] font-bold text-text-primary">{elabRetry?.title} · {elabRetry?.code}</p>
                      <p className="font-mono text-[10.5px] text-text-secondary">attempted · {elabRetry ? elabRetry.tests.length - 1 : 0}/{elabRetry?.tests.length} tests passing</p>
                    </div>
                    <StatusBadge tone="pending">Retry</StatusBadge>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {ELAB_WEEK.map((w, i) => (
                      <span key={i} title={`${w.d} · ${w.min} min`} className={`grid h-8 flex-1 place-items-center rounded-lg font-mono text-[10px] font-bold ${w.min > 0 ? 'bg-periwinkle-3 text-text-primary' : 'bg-lavender-2/60 text-text-muted'}`}>{w.d}</span>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <GlassCard hover>
                <SectionHead title="Pending assignments" body="Your work · nearest deadline first" action={<GlassButton size="sm" onClick={() => go('assignments')}>All work</GlassButton>} />
                <div className="space-y-2">
                  {pending.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3">
                      <div className="min-w-[160px] flex-1">
                        <p className="truncate text-[13px] font-bold text-text-primary">{a.title}</p>
                        <p className="font-mono text-[10.5px] text-text-secondary">{a.subject} · {a.dueLabel}</p>
                      </div>
                      <StatusBadge tone={a.status === 'overdue' ? 'overdue' : 'published'}>{a.status === 'overdue' ? 'Overdue' : 'Due'}</StatusBadge>
                      <Can do="assignment.submit">
                        <GlassButton size="sm" onClick={() => go('assignments')}>Submit</GlassButton>
                      </Can>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="space-y-5">
                <GlassCard hover>
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Recent grades</h3>
                    <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => go('grades')}>Report card</GlassButton>
                  </div>
                  <div className="space-y-1.5">
                    {d.grades.map((g) => (
                      <div key={g.code} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">{g.subject}</span>
                        <StatusBadge tone="graded">{g.grade}</StatusBadge>
                        <span className="font-mono text-[12px] font-bold tabular-nums">{g.score}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard hover>
                  <h3 className="font-display mb-2.5 flex items-center gap-2 text-[16px] font-bold tracking-tight text-text-primary"><MessageSquareHeart size={16} /> Teacher feedback</h3>
                  <div className="space-y-2">
                    {d.feedback.map((f) => (
                      <div key={f.from} className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                        <p className="text-[12.5px] leading-snug text-text-secondary">“{f.text}”</p>
                        <p className="mt-1 font-mono text-[10.5px] text-text-secondary">— {f.from} · {f.time}</p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        );
      })()}
    </QueryGate>
  );
}

/* =====================================================================
   FAMILY OVERVIEW — parent only
   ===================================================================== */
export function FamilyOverview() {
  const { role, go } = useApp();
  const q = useScopedQuery(`overview:family:${role}`, () => api.familyOverview(sessionFor(role)));
  const [childId, setChildId] = useState(LINKED_CHILDREN[0].id);

  return (
    <QueryGate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (() => {
        const child = LINKED_CHILDREN.find((c) => c.id === childId)!;
        const sched = todayFor(child.class).filter((t) => t.kind !== 'break');
        const work = childAssignments(child.class).filter((a) => a.status === 'published' || a.status === 'overdue');
        const grades = CHILD_GRADES[child.id] ?? [];
        const feedback = child.id === 'NV-2024014' ? STUDENT_FEEDBACK.slice(0, 2) : AARAV_FEEDBACK;
        const parentName = ROLES.find((r) => r.id === 'parent')?.name ?? 'Parent';
        const parentInitials = parentName.split(' ').map((w) => w[0]).join('');
        return (
          <div className="stagger">
            <GlassCard level={2} sheen>
              <div className="flex flex-wrap items-center gap-5">
                <Avatar initials={parentInitials} size="lg" index={1} />
                <div className="min-w-[220px] flex-1">
                  <p className="font-mono text-[11px] tracking-[0.12em] text-text-secondary uppercase">{todayStr} · {LINKED_CHILDREN.length} linked children · Northview High</p>
                  <h2 className="font-display mt-1 text-[24px] font-bold tracking-tight text-text-primary sm:text-[28px]">{greeting}, {parentName.split(' ')[0]}.</h2>
                  <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-text-secondary">
                    {child.name.split(' ')[0]}’s attendance is {child.attendance}% · {work.length} open assignments.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {LINKED_CHILDREN.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChildId(c.id)}
                    aria-pressed={childId === c.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-300 ${childId === c.id ? 'border-periwinkle-3/70 bg-periwinkle/50 shadow-lift' : 'border-periwinkle-2/40 bg-white/35 hover:bg-lavender-2/70'}`}
                  >
                    <Avatar initials={c.initials} index={c.avatar} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-text-primary">{c.name}</p>
                      <p className="font-mono text-[10.5px] text-text-secondary">{c.class} · Roll {c.roll} · GPA {c.gpa.toFixed(1)}</p>
                    </div>
                    <span className="text-right">
                      <span className="block font-mono text-[13px] font-bold text-text-primary tabular-nums">{c.attendance}%</span>
                      <span className="block font-mono text-[9.5px] text-text-secondary">attend.</span>
                    </span>
                  </button>
                ))}
              </div>
            </GlassCard>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard index={0} label={`${child.name.split(' ')[0]}’s attendance`} value={`${child.attendance}%`} delta="Term 2" deltaTone="flat" sub={`${child.class} · ${child.teacher}`} icon={<CalendarCheck2 size={19} />} />
              <MetricCard index={1} label="GPA" value={child.gpa.toFixed(1)} delta={child.gpa >= 9 ? 'A+ band' : 'A band'} deltaTone="flat" sub="current term" icon={<Trophy size={19} />} />
              <MetricCard index={2} label="Open assignments" value={String(work.length)} delta={work.some((a) => a.status === 'overdue') ? 'needs attention' : 'on track'} deltaTone={work.some((a) => a.status === 'overdue') ? 'down' : 'flat'} sub="this week" icon={<ClipboardList size={19} />} />
              <MetricCard index={3} label="Classes today" value={String(sched.length)} delta={sched.length > 0 ? `${sched.length} periods` : 'no classes'} sub={SCHOOL_DAY_RANGE} icon={<Clock size={19} />} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <GlassCard hover>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Today’s schedule</h3>
                  <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => go('timetable')}>Week</GlassButton>
                </div>
                <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-0.5">
                  {sched.map((t) => (
                    <div key={t.period} className="flex items-center gap-2.5 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2">
                      <span className="w-11 shrink-0 font-mono text-[10.5px] font-bold text-text-primary">{t.time}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">{t.subject}</span>
                      <span className="hidden font-mono text-[10px] text-text-secondary sm:inline">R{t.room}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard hover>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Recent grades</h3>
                  <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => go('grades')}>All</GlassButton>
                </div>
                <div className="space-y-1.5">
                  {grades.slice(0, 5).map((g) => (
                    <div key={g.subject} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">{g.subject}</span>
                      <StatusBadge tone={g.grade === 'B' ? 'pending' : 'graded'}>{g.grade}</StatusBadge>
                      <span className="font-mono text-[12px] font-bold tabular-nums">{g.score}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="space-y-5">
                <StudentDailyPresenceIsland />
                <GlassCard hover>
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Quick actions</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <button onClick={() => go('my-children')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><Users size={16} />View child profile</button>
                    <button onClick={() => go('attendance')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CalendarCheck2 size={16} />View attendance</button>
                    <button onClick={() => go('grades')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CheckCircle2 size={16} />View grades</button>
                    <button onClick={() => go('assignments')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><ClipboardList size={16} />View assignments</button>
                    <button onClick={() => go('timetable')} className="btn-glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold"><CalendarRange size={16} />View timetable</button>
                  </div>
                </GlassCard>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <GlassCard hover>
                <SectionHead title={`${child.name.split(' ')[0]}’s assignments`} body="Open work with deadlines" action={<GlassButton size="sm" onClick={() => go('assignments')}>All work</GlassButton>} />
                {work.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-periwinkle-2/60 bg-white/35 p-5 text-center text-[13px] text-text-secondary">Nothing pending — all caught up.</p>
                ) : (
                  <div className="space-y-2">
                    {work.slice(0, 4).map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3">
                        <div className="min-w-[160px] flex-1">
                          <p className="truncate text-[13px] font-bold text-text-primary">{a.title}</p>
                          <p className="font-mono text-[10.5px] text-text-secondary">{a.subject} · {a.dueLabel}</p>
                        </div>
                        <StatusBadge tone={a.status === 'overdue' ? 'overdue' : 'published'}>{a.status === 'overdue' ? 'Overdue' : 'Due'}</StatusBadge>
                      </div>
                    ))}
                  </div>
                )}
                <h3 className="font-display mt-5 mb-2.5 flex items-center gap-2 text-[15px] font-bold tracking-tight text-text-primary"><MessageSquareHeart size={15} /> Teacher feedback</h3>
                <div className="space-y-2">
                  {feedback.map((f) => (
                    <div key={f.from} className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5">
                      <p className="text-[12.5px] leading-snug text-text-secondary">“{f.text}”</p>
                      <p className="mt-1 font-mono text-[10.5px] text-text-secondary">— {f.from} · {f.time}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard hover>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="font-display flex items-center gap-2 text-[16px] font-bold tracking-tight text-text-primary"><Megaphone size={16} /> School announcements</h3>
                  <GlassButton size="sm" variant="ghost" icon={<Bell size={13} />} onClick={() => go('notifications')}>Inbox</GlassButton>
                </div>
                <div className="space-y-2">
                  {q.data!.announcements.map((a) => (
                    <div key={a.title} className="flex gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3">
                      <span className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-periwinkle-3 py-1.5 font-mono text-[10px] font-bold text-text-primary">{a.date}</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-text-primary">{a.title}</p>
                        <p className="mt-0.5 text-[12.5px] leading-snug text-text-secondary">{a.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-periwinkle-2/40 bg-white/35 px-4 py-3 font-mono text-[11px] text-text-secondary">
                  <MapPin size={13} /> Northview High · 14 Lake Terrace, Kolkata
                </div>
              </GlassCard>
            </div>
          </div>
        );
      })()}
    </QueryGate>
  );
}
