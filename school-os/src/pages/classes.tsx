import { useState } from 'react';
import { ArrowUpRight, DoorOpen, Plus, Users } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { CLASSES, DEPARTMENTS, GRADE_NAMES, INTAKE_LABEL, SUBJECT_LIST, TEACHERS, TIMETABLE } from '../lib/data';
import { useApp } from '../lib/store';
import {
  Can, DataTable, FieldLabel, GlassButton, GlassCard, GlassInput, GlassSelect,
  Modal, SectionHead, StatusBadge,
} from '../components/glass';

export function Classes() {
  const { pushToast, go } = useApp();
  const [grade, setGrade] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const rows = CLASSES.filter((c) => grade === 'all' || c.grade === grade);

  return (
    <div className="animate-fade-up space-y-5">
      <GlassCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHead title="All classes" body={`${rows.length} sections · ${INTAKE_LABEL} academic year`} />
          <div className="flex gap-2">
            <GlassSelect value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Filter by grade">
              <option value="all">All grades</option>
              {GRADE_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            </GlassSelect>
            <Can do="class.create">
              <GlassButton variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>New class</GlassButton>
            </Can>
          </div>
        </div>
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <div key={c.id} className="group rounded-[20px] border border-periwinkle-2/40 bg-white/35 p-4 transition-all duration-300 hover:-translate-y-[2px] hover:bg-lavender-2/70 hover:shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-[16px] font-bold tracking-tight text-text-primary">{c.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-text-secondary">{c.id} · Room {c.room}</p>
                </div>
                <StatusBadge tone="active">{c.avg}% avg</StatusBadge>
              </div>
              <div className="mt-3 h-[54px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={c.trend.map((v, i) => ({ i, v }))}>
                    <defs>
                      <linearGradient id={`spark-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-baby-blue-ice)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--color-baby-blue-ice)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke="var(--color-baby-blue-ice)" strokeWidth={1.8} fill={`url(#spark-${c.id})`} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px] text-text-secondary">
                <span className="flex items-center gap-1.5"><Users size={13} /> {c.students} students</span>
                <span className="flex items-center gap-1.5"><DoorOpen size={13} /> {c.teacher}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <GlassButton size="sm" className="flex-1" icon={<ArrowUpRight size={13} />} onClick={() => go('timetable')}>Timetable</GlassButton>
                <Can do="attendance.mark">
                  <GlassButton size="sm" className="flex-1" variant="ghost" onClick={() => go('attendance')}>Register</GlassButton>
                </Can>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create class" subtitle="Sections inherit the grade curriculum automatically."
        footer={<>
          <GlassButton variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</GlassButton>
          <GlassButton variant="primary" onClick={() => { setCreateOpen(false); pushToast({ title: 'Class created', body: 'Grade 10-D is now open for allocation.', tone: 'success' }); }}>Create class</GlassButton>
        </>}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div><FieldLabel>Grade</FieldLabel><GlassSelect>{GRADE_NAMES.map((g) => <option key={g} selected={g === 'Grade 10'}>{g}</option>)}</GlassSelect></div>
          <div><FieldLabel>Section</FieldLabel><GlassInput placeholder="D" /></div>
          <div className="sm:col-span-2"><FieldLabel>Class teacher</FieldLabel><GlassSelect>{TEACHERS.map((t) => <option key={t.id}>{t.name}</option>)}</GlassSelect></div>
          <div className="sm:col-span-2"><FieldLabel>Room</FieldLabel><GlassInput placeholder="e.g. 214" /></div>
        </div>
      </Modal>
    </div>
  );
}

export function Subjects() {
  const { pushToast } = useApp();
  const [dept, setDept] = useState('all');
  const rows = SUBJECT_LIST.filter((s) => dept === 'all' || s.dept === dept);
  const sections = CLASSES.map((c) => `${c.grade.replace('Grade ', '')}-${c.section}`);
  const gradeNos = CLASSES.map((c) => Number(c.grade.replace('Grade ', '')));
  const gradeSpan = `Grades ${Math.min(...gradeNos)}–${Math.max(...gradeNos)}`;
  const avgSize = (CLASSES.reduce((a, c) => a + c.students, 0) / CLASSES.length).toFixed(0);
  return (
    <div className="animate-fade-up space-y-5">
      <GlassCard>
        <SectionHead title="Sections" body={`${sections.length} sections across ${gradeSpan} · tap to filter the curriculum`} />
        <div className="flex flex-wrap gap-1.5">
          {sections.map((s) => (
            <span key={s} className="rounded-full border border-periwinkle-2/50 bg-white/35 px-3 py-1.5 font-mono text-[11px] font-semibold text-text-secondary">
              Grade {s}
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {[
            { l: 'Subjects offered', v: String(SUBJECT_LIST.length), d: `${gradeSpan} · ${DEPARTMENTS.length} departments` },
            { l: 'Avg. class size', v: avgSize, d: 'target ≤ 40 per section' },
            { l: 'Weekly periods', v: String(TIMETABLE.length), d: 'per class · Mon–Fri' },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-periwinkle-2/35 bg-white/35 p-4">
              <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
              <p className="font-display mt-1.5 text-[26px] leading-none font-bold text-text-primary tabular-nums">{s.v}</p>
              <p className="mt-1.5 text-[12px] text-text-secondary">{s.d}</p>
            </div>
          ))}
        </div>
      </GlassCard>
      <GlassCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHead title="Curriculum & subjects" body="Department coverage with live averages" />
          <GlassSelect value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department">
            <option value="all">All departments</option>
            {DEPARTMENTS.map((dpt) => <option key={dpt} value={dpt}>{dpt}</option>)}
          </GlassSelect>
        </div>
        <DataTable
          rows={rows.map((s) => ({ ...s, id: s.code }))} pageSize={8}
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-[12px] font-semibold">{r.code}</span> },
            { key: 'name', header: 'Subject', sortable: true, sortValue: (r) => r.name, render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'dept', header: 'Department', render: (r) => <span className="text-text-secondary">{r.dept}</span> },
            { key: 'classes', header: 'Classes', sortable: true, sortValue: (r) => r.classes, render: (r) => <span className="font-mono tabular-nums">{r.classes}</span> },
            { key: 'teachers', header: 'Teachers', render: (r) => <span className="font-mono tabular-nums">{r.teachers}</span> },
            {
              key: 'avg', header: 'Avg', sortable: true, sortValue: (r) => r.avg,
              render: (r) => (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-periwinkle-2/40">
                    <span className="block h-full rounded-full bg-periwinkle-3" style={{ width: `${r.avg}%` }} />
                  </span>
                  <span className="font-mono text-[12px] font-semibold tabular-nums">{r.avg}%</span>
                </span>
              ),
            },
            {
              key: 'act', header: '',
              render: (r) => <GlassButton size="sm" variant="ghost" onClick={() => pushToast({ title: r.name, body: `${r.code} · syllabus v3 · ${r.classes} classes covered.`, tone: 'info' })}>Syllabus</GlassButton>,
            },
          ]}
        />
      </GlassCard>
    </div>
  );
}
