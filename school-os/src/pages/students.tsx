import { useEffect, useMemo, useState } from 'react';
import { Download, Filter, Phone, Plus, UserPlus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { APPLICANTS, GRADE_NAMES, INTAKE_LABEL, PARENTS, PERFORMANCE_BY_SUBJECT, SEATS_REMAINING, STUDENTS } from '../lib/data';
import { STUDENT_GRADES, STUDENT_SCOPE, TEACHER_SCOPE, teacherStudents } from '../lib/scoped';
import { consumeFlagSelection, subscribeFlagSelection } from '../lib/flags-live';
import { studentCard } from '../lib/idcard';
import { ProfileIdSection } from '../components/idcard';
import { FlagDot, StudentNotesPanel } from './student-flags';
import { useApp } from '../lib/store';
import type { Student } from '../lib/types';
import { cn } from '../lib/utils';
import {
  Avatar, Can, ChartCard, DataTable, Drawer, EmptyState, FieldLabel, GlassButton,
  GlassCard, GlassInput, GlassSelect, GlassTextarea, Modal, SectionHead, StatusBadge, Tabs, type Column,
} from '../components/glass';

/* Standalone Parents module (school-admin navigation). */
export function ParentsPage() {
  return <StudentsDirectory lockTab="parents" />;
}

/* ================= DIRECTORY ================= */
export function StudentsDirectory({ lockTab }: { lockTab?: 'students' | 'parents' }) {
  const { pushToast, role } = useApp();
  const teacherView = role === 'teacher';
  const [tab, setTab] = useState<'students' | 'parents'>(lockTab ?? 'students');
  const [grade, setGrade] = useState('all');
  const [section, setSection] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Student | null>(null);
  const [flagFocus, setFlagFocus] = useState<string | null>(null);

  // Notification deep-links open the exact student + record.
  useEffect(() => {
    const apply = () => {
      const sel = consumeFlagSelection();
      if (!sel.studentId && !sel.recordId) return;
      if (sel.studentId) {
        const found = (teacherView ? teacherStudents() : STUDENTS).find((s) => s.id === sel.studentId);
        if (found) {
          setSelected(found);
          setFlagFocus(sel.recordId);
          return;
        }
        pushToast({ title: 'Student unavailable', body: 'That record belongs to a student outside your scope.', tone: 'warning' });
        return;
      }
      setFlagFocus(sel.recordId);
    };
    apply();
    return subscribeFlagSelection(apply);
  }, [teacherView, pushToast]);
  const [addOpen, setAddOpen] = useState(false);
  const [parentPage, setParentPage] = useState(0);
  const PARENT_PAGE_SIZE = 12;
  const parentCount = PARENTS.length;
  const parentPages = Math.max(1, Math.ceil(parentCount / PARENT_PAGE_SIZE));
  const parentRows = PARENTS.slice(parentPage * PARENT_PAGE_SIZE, parentPage * PARENT_PAGE_SIZE + PARENT_PAGE_SIZE);

  // Teachers receive ONLY their assigned classes — scoped at the data layer.
  const base = useMemo(() => (teacherView ? teacherStudents() : STUDENTS), [teacherView]);
  const rows = useMemo(() => base.filter((s) =>
    (grade === 'all' || s.grade === grade) &&
    (section === 'all' || s.section === section) &&
    (status === 'all' || s.status === status)
  ), [base, grade, section, status]);

  const columns: Column<Student>[] = [
    {
      key: 'name', header: 'Student', sortable: true, sortValue: (r) => r.name,
      render: (r, i) => (
        <span className="flex items-center gap-3">
          <Avatar initials={r.initials} index={i} />
          <span>
            <span className="block font-semibold text-text-primary">{r.name}<FlagDot studentKey={r.id} /></span>
            <span className="block font-mono text-[11px] text-text-secondary">{r.id} · Roll {r.roll}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'class', header: 'Class', sortable: true, sortValue: (r) => r.grade + r.section,
      render: (r) => <span className="font-mono text-[12px]">{r.grade}-{r.section}</span>,
    },
    {
      key: 'house', header: 'House',
      render: (r) => <span className="text-text-secondary">{r.house}</span>,
    },
    {
      key: 'att', header: 'Attendance', sortable: true, sortValue: (r) => r.attendance,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-periwinkle-2/40">
            <span className={cn('block h-full rounded-full', r.attendance >= 90 ? 'bg-periwinkle-3' : r.attendance >= 85 ? 'bg-warning' : 'bg-error')} style={{ width: `${r.attendance}%` }} />
          </span>
          <span className="font-mono text-[12px] tabular-nums">{r.attendance}%</span>
        </span>
      ),
    },
    {
      key: 'gpa', header: 'GPA', sortable: true, sortValue: (r) => r.gpa,
      render: (r) => <span className="font-mono text-[12.5px] font-semibold tabular-nums">{r.gpa.toFixed(1)}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (r) => <StatusBadge tone={r.status} dot>{r.status}</StatusBadge>,
    },
  ];

  return (
    <div className="animate-fade-up">
      <GlassCard>
        {teacherView && (
          <p className="mb-4 rounded-2xl border border-periwinkle-2/40 bg-white/35 px-4 py-2.5 font-mono text-[11.5px] text-text-secondary">
            scoped view · assigned classes {TEACHER_SCOPE.classes.join(', ')} · read-only
          </p>
        )}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {lockTab || teacherView ? (
            <h2 className="font-display text-[18px] font-bold tracking-tight text-text-primary">
              {lockTab === 'parents' ? 'Linked guardians' : `My students · ${rows.length}`}
            </h2>
          ) : (
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'students', label: 'Students', count: STUDENTS.length },
                { id: 'parents', label: 'Parents', count: PARENTS.length },
              ]}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Can do="student.export">
              <GlassButton icon={<Download size={15} />} onClick={() => pushToast({ title: 'Export started', body: 'student-directory.csv will download shortly.', tone: 'info' })}>Export</GlassButton>
            </Can>
            <Can do="student.create">
              <GlassButton variant="primary" icon={<Plus size={15} />} onClick={() => setAddOpen(true)}>Add student</GlassButton>
            </Can>
          </div>
        </div>

        {tab === 'students' ? (
          <>
            <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
              <div>
                <FieldLabel>Grade</FieldLabel>
                <GlassSelect value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full">
                  <option value="all">All grades</option>
                  {GRADE_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                </GlassSelect>
              </div>
              <div>
                <FieldLabel>Section</FieldLabel>
                <GlassSelect value={section} onChange={(e) => setSection(e.target.value)} className="w-full">
                  <option value="all">All sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </GlassSelect>
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                <GlassSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="probation">Probation</option>
                  <option value="pending">Pending</option>
                </GlassSelect>
              </div>
            </div>
            <DataTable
              rows={rows} columns={columns} pageSize={9}
              searchable searchKeys={['name', 'id', 'guardian', 'house']}
              searchPlaceholder="Search by name, ID, guardian or house…"
              onRowClick={setSelected}
              emptyTitle="No students match"
              emptyBody="Try clearing a filter or searching a different name."
            />
          </>
        ) : (
          <>
          <p className="mb-3 font-mono text-[11px] text-text-secondary">{parentCount} guardians · page {parentPage + 1} of {parentPages}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {parentRows.map((p, i) => (
              <div key={p.id} className="rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4 transition-all duration-300 hover:-translate-y-[2px] hover:bg-lavender-2/70">
                <div className="flex items-center gap-3">
                  <Avatar initials={p.initials} index={i + 2} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-text-primary">{p.name}</p>
                    <p className="font-mono text-[11px] text-text-secondary">{p.relation} · {p.occupation}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-[12.5px] text-text-secondary">
                  <p>Child: <span className="font-semibold text-text-primary">{p.child}</span> <span className="font-mono text-[11px]">({p.childId})</span></p>
                  <p className="flex items-center gap-1.5"><Phone size={12} /> {p.phone}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <GlassButton size="sm" className="flex-1" onClick={() => pushToast({ title: 'Message queued', body: `SMS draft created for ${p.name}.`, tone: 'info' })}>Message</GlassButton>
                  <GlassButton size="sm" variant="ghost" onClick={() => pushToast({ title: 'Calling…', body: `Dialling ${p.phone}.`, tone: 'info' })}>Call</GlassButton>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-[11px] text-text-secondary">{parentRows.length} shown</span>
            <div className="flex gap-2">
              <GlassButton size="sm" variant="ghost" onClick={() => setParentPage((pg) => Math.max(0, pg - 1))}>Prev</GlassButton>
              <GlassButton size="sm" variant="ghost" onClick={() => setParentPage((pg) => Math.min(parentPages - 1, pg + 1))}>Next</GlassButton>
            </div>
          </div>
          </>
        )}
      </GlassCard>

      {/* Profile drawer */}
      <Drawer
        open={!!selected} onClose={() => setSelected(null)}
        title={selected?.name ?? ''} subtitle={selected ? `${selected.id} · ${selected.grade}-${selected.section} · Roll ${selected.roll}` : ''}
        footer={<>
          <GlassButton variant="ghost" onClick={() => setSelected(null)}>Close</GlassButton>
          <GlassButton variant="primary" onClick={() => { pushToast({ title: 'Report card sent', body: `Term 2 report emailed to ${selected?.guardian}.`, tone: 'success' }); setSelected(null); }}>Send report</GlassButton>
        </>}
      >
        {selected && (
          <div className="space-y-4">
            <ProfileIdSection
              card={studentCard(selected)}
              natural={{ kind: 'student', grade: selected.grade, section: selected.section, roll: selected.roll }}
              relation={role === 'teacher' && teacherStudents().some((s) => s.id === selected.id) ? 'assigned' : 'other'}
            />
            <div className="flex items-center gap-4 rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4">
              <Avatar initials={selected.initials} size="lg" index={0} />
              <div>
                <StatusBadge tone={selected.status} dot>{selected.status}</StatusBadge>
                <p className="mt-1.5 font-mono text-[11.5px] text-text-secondary">{selected.house} house · {selected.gender === 'F' ? 'She/her' : 'He/him'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[{ l: 'GPA', v: selected.gpa.toFixed(1) }, { l: 'Attend.', v: `${selected.attendance}%` }, { l: 'Joined', v: selected.joined.slice(0, 4) }].map((s) => (
                <div key={s.l} className="rounded-2xl border border-periwinkle-2/40 bg-white/35 p-3 text-center">
                  <p className="font-display text-[19px] font-bold text-text-primary tabular-nums">{s.v}</p>
                  <p className="font-mono text-[10px] tracking-wider text-text-secondary uppercase">{s.l}</p>
                </div>
              ))}
            </div>
            <dl className="space-y-2.5 rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4 text-[13px]">
              {[['Guardian', selected.guardian], ['Phone', selected.phone], ['Email', selected.email]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="truncate text-right font-semibold text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4">
              <FieldLabel>Class teacher note</FieldLabel>
              <GlassTextarea rows={3} defaultValue="Consistent performer. Recommend advanced problem sets for algebra." />
            </div>
            <StudentNotesPanel
              grade={selected.grade} section={selected.section} roll={selected.roll}
              focusRecordId={flagFocus}
            />
          </div>
        )}
      </Drawer>

      {/* Add student modal */}
      <Modal
        open={addOpen} onClose={() => setAddOpen(false)}
        title="Admit a student" subtitle="Creates a record in Directory with pending status."
        footer={<>
          <GlassButton variant="ghost" onClick={() => setAddOpen(false)}>Cancel</GlassButton>
          <GlassButton variant="primary" icon={<UserPlus size={15} />} onClick={() => { setAddOpen(false); pushToast({ title: 'Student admitted', body: 'Record created and guardian notified by SMS.', tone: 'success' }); }}>Admit student</GlassButton>
        </>}
      >
        <form className="grid gap-3.5 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <div className="sm:col-span-2"><FieldLabel>Full name</FieldLabel><GlassInput placeholder="e.g. Anaya Kapoor" required /></div>
          <div><FieldLabel>Grade</FieldLabel><GlassSelect><option>Grade 6</option><option>Grade 9</option><option selected>Grade 10</option><option>Grade 11</option></GlassSelect></div>
          <div><FieldLabel>Section</FieldLabel><GlassSelect><option>A</option><option selected>B</option><option>C</option></GlassSelect></div>
          <div><FieldLabel>Guardian</FieldLabel><GlassInput placeholder="Guardian name" /></div>
          <div><FieldLabel>Phone</FieldLabel><GlassInput placeholder="+91 …" /></div>
          <div className="sm:col-span-2"><FieldLabel>House</FieldLabel><GlassSelect><option>Tagore</option><option selected>Raman</option><option>Kalam</option><option>Teresa</option></GlassSelect></div>
        </form>
      </Modal>
    </div>
  );
}

/* ================= ADMISSIONS ================= */
const STAGES = ['Enquiry', 'Application', 'Assessment', 'Interview', 'Offered', 'Enrolled'] as const;
export function Admissions() {
  const { pushToast, go } = useApp();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    STAGES.forEach((s) => { m[s] = APPLICANTS.filter((a) => a.stage === s).length; });
    return m;
  }, []);

  const rows = APPLICANTS.filter((a) =>
    (stageFilter === 'all' || a.stage === stageFilter) &&
    (a.name.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase().includes(query.toLowerCase()))
  );

  const topSource = useMemo(() => {
    const m = new Map<string, number>();
    APPLICANTS.forEach((a) => m.set(a.source, (m.get(a.source) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  }, []);

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <SectionHead title="Pipeline" body={`${APPLICANTS.length} applicants · ${INTAKE_LABEL} intake · ${SEATS_REMAINING} seats remaining`} />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            {STAGES.map((s, i) => (
              <button
                key={s}
                onClick={() => setStageFilter(stageFilter === s ? 'all' : s)}
                className={cn(
                  'cursor-pointer rounded-2xl border p-3 text-left transition-all duration-300 hover:-translate-y-[2px]',
                  stageFilter === s ? 'border-periwinkle-3 bg-periwinkle-3 text-text-primary' : 'border-periwinkle-2/50 bg-white/35 hover:bg-lavender-2/70',
                )}
              >
                <p className={cn('font-mono text-[10px] tracking-wider uppercase', stageFilter === s ? 'text-text-primary' : 'text-text-secondary')}>0{i + 1}</p>
                <p className={cn('font-display mt-1 text-[22px] font-bold tabular-nums', stageFilter === s ? 'text-text-primary' : 'text-text-primary')}>{counts[s]}</p>
                <p className={cn('text-[12px] font-semibold', stageFilter === s ? 'text-text-primary' : 'text-text-secondary')}>{s}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 overflow-hidden rounded-xl bg-periwinkle-2/30 p-1">
            {STAGES.map((s) => (
              <div key={s} className="h-2 rounded-full bg-periwinkle-3 transition-all" style={{ width: `${(counts[s] / APPLICANTS.length) * 100}%`, opacity: 0.35 + (STAGES.indexOf(s) / STAGES.length) * 0.65 }} title={`${s}: ${counts[s]}`} />
            ))}
          </div>
        </GlassCard>

        <GlassCard hover>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Conversion</h3>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">Enquiry → Enrolled</p>
          <p className="font-display mt-2 text-[40px] leading-none font-bold text-text-primary tabular-nums">{((counts['Enrolled'] / Math.max(1, counts['Enquiry'])) * 100).toFixed(1)}%</p>
          <p className="mt-2 text-[12.5px] text-text-secondary">+3.2 pts vs last year · {topSource} is the top source.</p>
          <div className="mt-4 space-y-2">
            <Can do="admission.manage">
              <GlassButton variant="primary" className="w-full" icon={<Plus size={15} />} onClick={() => setInviteOpen(true)}>Invite applicant</GlassButton>
            </Can>
            <GlassButton className="w-full" onClick={() => go('students-directory')}>View directory</GlassButton>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <GlassInput icon={<Filter size={14} />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applicants…" className="min-w-[220px] flex-1" />
          {stageFilter !== 'all' && (
            <button onClick={() => setStageFilter('all')} className="cursor-pointer rounded-full bg-periwinkle-3 px-3 py-1.5 font-mono text-[11px] text-text-primary">
              {stageFilter} ✕
            </button>
          )}
          <span className="font-mono text-[11px] text-text-secondary">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No applicants found" body="No one matches this search and stage combination." />
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2">
            {rows.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3 transition-all duration-300 hover:-translate-y-[1px] hover:bg-lavender-2/70">
                <Avatar initials={a.name.split(' ').map((w) => w[0]).slice(0, 2).join('')} index={a.id.charCodeAt(4) % 4} />
                <div className="min-w-[140px] flex-1">
                  <p className="text-[13.5px] font-bold text-text-primary">{a.name}</p>
                  <p className="font-mono text-[11px] text-text-secondary">{a.id} · {a.grade} · {a.source}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[12px] font-semibold text-text-primary tabular-nums">{a.score}%</p>
                  <p className="font-mono text-[10px] text-text-secondary">assess.</p>
                </div>
                <StatusBadge tone={a.stage === 'Enrolled' || a.stage === 'Offered' ? 'graded' : a.stage === 'Enquiry' ? 'neutral' : 'pending'}>{a.stage}</StatusBadge>
                <Can do="admission.manage">
                  <GlassButton
                    size="sm" disabled={a.stage === 'Enrolled'}
                    onClick={() => pushToast({ title: 'Stage advanced', body: `${a.name} moved to ${STAGES[Math.min(5, STAGES.indexOf(a.stage) + 1)]}.`, tone: 'success' })}
                  >
                    Advance
                  </GlassButton>
                </Can>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite applicant" subtitle="Sends an application link by email and SMS."
        footer={<>
          <GlassButton variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</GlassButton>
          <GlassButton variant="primary" onClick={() => { setInviteOpen(false); pushToast({ title: 'Invite sent', body: 'Application link dispatched to the family.', tone: 'success' }); }}>Send invite</GlassButton>
        </>}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2"><FieldLabel>Student name</FieldLabel><GlassInput placeholder="Full name" /></div>
          <div><FieldLabel>Grade applied for</FieldLabel><GlassSelect><option>Grade 6</option><option>Grade 9</option><option>Grade 11</option></GlassSelect></div>
          <div><FieldLabel>Phone</FieldLabel><GlassInput placeholder="+91 …" /></div>
        </div>
      </Modal>
    </div>
  );
}

/* ================= PERFORMANCE ================= */
export function Performance() {
  const { role } = useApp();
  const mineOnly = role === 'student' || role === 'parent';
  const topStudents = useMemo(() => [...STUDENTS].sort((a, b) => b.gpa - a.gpa).slice(0, 8), []);
  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { l: 'School average', v: '82.6%', d: '+1.4 pt vs Term 1' },
          { l: 'Top GPA band', v: '214', d: 'students at A+ (9–10)' },
          { l: 'Most improved', v: '+2.1', d: 'Computer Science avg' },
          { l: 'At-risk watch', v: '17', d: 'below 6.5 GPA · flagged' },
        ].map((s) => (
          <GlassCard key={s.l} hover>
            <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
            <p className="font-display mt-2 text-[32px] leading-none font-bold text-text-primary tabular-nums">{s.v}</p>
            <p className="mt-2 text-[12.5px] text-text-secondary">{s.d}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Subject averages vs target" subtitle="Term 2 assessments · Grades 9–12" className="xl:col-span-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PERFORMANCE_BY_SUBJECT} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barGap={6}>
                <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                <XAxis dataKey="subject" axisLine={false} tickLine={false} dy={6} tick={{ fontSize: 10.5 }} />
                <YAxis axisLine={false} tickLine={false} domain={[60, 100]} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload, label }: any) =>
                    active && payload ? (
                      <div className="rounded-xl border border-periwinkle-2/60 bg-alice-blue/95 px-3 py-2 shadow-xl">
                        <p className="font-mono text-[10.5px] text-text-secondary uppercase">{label}</p>
                        <p className="font-display text-[15px] font-bold text-text-primary">avg {payload[0]?.value}% · target {payload[1]?.value}%</p>
                      </div>
                    ) : null
                  }
                  cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }}
                />
                <Bar dataKey="avg" name="average" radius={[7, 7, 3, 3]} fill="var(--color-baby-blue-ice)" fillOpacity={0.88} />
                <Bar dataKey="target" name="target" radius={[7, 7, 3, 3]} fill="var(--color-periwinkle-2)" fillOpacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <GlassCard hover>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">{mineOnly ? 'My subjects' : 'Scholar board'}</h3>
          <p className="mt-0.5 mb-3 text-[12.5px] text-text-secondary">{mineOnly ? `${STUDENT_SCOPE.name} · ${STUDENT_SCOPE.class}` : 'Top GPAs · all grades'}</p>
          <div className="space-y-2">
            {(mineOnly
              ? STUDENT_GRADES.slice(0, 5).map((g) => ({
                  id: g.code, name: g.subject, gpa: g.score / 10,
                  initials: g.subject.split(' ').map((w) => w[0]).slice(0, 2).join(''),
                }))
              : topStudents.map((s) => ({ id: s.id, name: s.name, gpa: s.gpa, initials: s.initials }))
            ).map((s, i) => (
              <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2">
                <span className="w-5 font-mono text-[11px] font-semibold text-text-secondary">{String(i + 1).padStart(2, '0')}</span>
                <Avatar initials={s.initials} size="sm" index={i} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">{s.name}</span>
                <span className="font-mono text-[12px] font-bold text-text-primary tabular-nums">{s.gpa.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <SectionHead title={mineOnly ? 'My report card' : 'Grade ledger'} body={mineOnly ? 'Term 2 · official record' : 'Sortable GPA ledger · click a column to sort'} />
        <DataTable
          rows={mineOnly ? STUDENT_GRADES.map((g, i) => ({ ...STUDENTS[i], id: g.code, name: g.subject, gpa: g.score / 10 })) : STUDENTS}
          pageSize={8}
          columns={[
            { key: 'name', header: mineOnly ? 'Subject' : 'Student', sortable: true, sortValue: (r) => r.name, render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'class', header: mineOnly ? 'Code' : 'Class', render: (r, i) => <span className="font-mono text-[12px] text-text-secondary">{mineOnly ? STUDENT_GRADES[i].code : `${r.grade}-${r.section}`}</span> },
            { key: 'gpa', header: mineOnly ? 'Score' : 'GPA', sortable: true, sortValue: (r) => r.gpa, render: (r) => <span className="font-mono font-semibold tabular-nums">{r.gpa.toFixed(1)}</span> },
            {
              key: 'band', header: 'Band',
              render: (r) => <StatusBadge tone={r.gpa >= 9 ? 'graded' : r.gpa >= 8 ? 'active' : r.gpa >= 7 ? 'pending' : 'overdue'}>{r.gpa >= 9 ? 'A+' : r.gpa >= 8 ? 'A' : r.gpa >= 7 ? 'B' : 'C'}</StatusBadge>,
            },
            {
              key: 'bar', header: 'Scale',
              render: (r) => (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-periwinkle-2/40">
                    <span className="block h-full rounded-full bg-periwinkle-3" style={{ width: `${(r.gpa / 10) * 100}%` }} />
                  </span>
                  <span className="font-mono text-[11px] text-text-secondary tabular-nums">{Math.round((r.gpa / 10) * 100)}%</span>
                </span>
              ),
            },
          ]}
          searchable searchKeys={['name', 'id']}
          searchPlaceholder={mineOnly ? 'Search subjects…' : 'Search students…'}
        />
      </GlassCard>
    </div>
  );
}
