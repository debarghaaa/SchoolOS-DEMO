import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Download, FileText, Plus, UploadCloud } from 'lucide-react';
import { ASSIGNMENTS, SUBMISSIONS } from '../lib/data';
import { hashStr } from '../lib/presence';
import { canDo } from '../lib/permissions';
import {
  CHILD_GRADES, LINKED_CHILDREN, STUDENT_GRADES, STUDENT_SCOPE,
  childAssignments, studentAssignments, teacherAssignments, teacherStudents,
} from '../lib/scoped';
import { useApp } from '../lib/store';
import type { Assignment } from '../lib/types';
import { cn } from '../lib/utils';
import {
  Can, DataTable, Drawer, FieldLabel, FileUploader, GlassButton, GlassCard,
  GlassInput, GlassSelect, GlassTextarea, Modal, SectionHead, StatusBadge, Tabs,
} from '../components/glass';

type Tab = 'assignments' | 'submissions' | 'grades';

const STATUS_TONE: Record<Assignment['status'], string> = { draft: 'draft', published: 'published', closed: 'closed', overdue: 'overdue' };

/* Assignments hub. Every role sees only its authorized slice:
   - admin: everything · teacher: assigned classes · student: own class
   - parent: linked children (read-only). Rendered via `initialTab` so
     Submissions and Grades are first-class routes in role navigation. */
export function Assignments({ initialTab = 'assignments' }: { initialTab?: Tab }) {
  const { role, pushToast } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [gradeTarget, setGradeTarget] = useState<{ id: string; name: string } | null>(null);
  const [gradeValue, setGradeValue] = useState('85');
  const [childId, setChildId] = useState(LINKED_CHILDREN[0].id);

  const canCreate = canDo(role, 'assignment.create');
  const canGrade = canDo(role, 'submission.grade');
  const isStudent = role === 'student';
  const isParent = role === 'parent';

  const scoped = useMemo(() => {
    if (role === 'teacher') return { rows: teacherAssignments(), note: 'Your assignments · assigned classes' };
    if (role === 'student') return { rows: studentAssignments(), note: `${STUDENT_SCOPE.class} · your work` };
    if (role === 'parent') {
      const child = LINKED_CHILDREN.find((c) => c.id === childId)!;
      return { rows: childAssignments(child.class), note: `${child.name} · ${child.class} · read-only` };
    }
    return { rows: ASSIGNMENTS, note: 'All classes · Northview High' };
  }, [role, childId]);

  const rows = useMemo(() => scoped.rows.filter((a) => filter === 'all' || a.status === filter), [scoped.rows, filter]);

  const submissionRows = useMemo(() => {
    if (isStudent) {
      return scoped.rows.slice(0, 4).map((a, i) => ({
        id: `MINE-${i}`, student: STUDENT_SCOPE.name, studentId: STUDENT_SCOPE.id,
        assignment: a.title, assignmentId: a.id,
        submittedAt: a.status === 'overdue' ? '—' : `Sep ${21 + (i % 3)}, 08:1${i} AM`,
        status: (a.status === 'overdue' ? 'missing' : i === 0 ? 'graded' : 'on-time') as 'missing' | 'graded' | 'on-time',
        score: i === 0 ? 92 : null, max: 100,
      }));
    }
    if (role === 'teacher') {
      const ids = new Set(teacherStudents().map((s) => s.id));
      return SUBMISSIONS.filter((x) => ids.has(x.studentId));
    }
    return SUBMISSIONS;
  }, [isStudent, role, scoped.rows]);

  return (
    <div className="animate-fade-up space-y-5">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs<Tab>
            value={tab} onChange={setTab}
            tabs={[
              { id: 'assignments', label: isStudent ? 'My Work' : 'Assignments', count: scoped.rows.length },
              ...(!isParent ? [{ id: 'submissions' as Tab, label: isStudent ? 'My Submissions' : 'Submissions', count: submissionRows.length }] : []),
              { id: 'grades', label: 'Grades', count: isStudent ? STUDENT_GRADES.length : isParent ? (CHILD_GRADES[childId]?.length ?? 0) : role === 'teacher' ? submissionRows.length : SUBMISSIONS.length },
            ]}
          />
          <Can do="assignment.create">
            <GlassButton variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>New assignment</GlassButton>
          </Can>
        </div>
        <p className="mt-3 font-mono text-[11px] text-text-secondary">scoped view · {scoped.note}</p>
        {isParent && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {LINKED_CHILDREN.map((c) => (
              <button
                key={c.id} onClick={() => setChildId(c.id)} aria-pressed={childId === c.id}
                className={cn(childId === c.id ? 'bg-periwinkle-3 text-text-primary shadow' : 'btn-glass', 'cursor-pointer rounded-xl px-4 py-2 text-[12.5px] font-semibold')}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      {tab === 'assignments' && (
        <GlassCard>
          {!isStudent && !isParent && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {['all', 'published', 'draft', 'overdue', 'closed'].map((f) => (
                <button
                  key={f} onClick={() => setFilter(f)}
                  className={cn(
                    'cursor-pointer rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all',
                    filter === f ? 'bg-periwinkle-3 text-text-primary shadow' : 'border border-periwinkle-2/50 bg-white/35 text-text-secondary hover:bg-lavender-2/70',
                  )}
                >
                  {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
              <span className="ml-auto font-mono text-[11px] text-text-secondary">{rows.length} shown</span>
            </div>
          )}
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-periwinkle-2/60 bg-white/35 p-8 text-center text-[13px] text-text-secondary">
              No assignments in scope. {isStudent || isParent ? 'All caught up — enjoy the evening.' : 'Create one to get started.'}
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((a) => {
                const pct = Math.round((a.submitted / a.total) * 100);
                return (
                  <article key={a.id} className="group rounded-[20px] border border-periwinkle-2/40 bg-white/35 p-4 transition-all duration-300 hover:-translate-y-[2px] hover:bg-lavender-2/70 hover:shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[10.5px] tracking-wide text-text-secondary">{a.id} · {a.subject} · {a.class}</p>
                        <h3 className="font-display mt-1 text-[16px] font-bold tracking-tight text-text-primary">{a.title}</h3>
                      </div>
                      <StatusBadge tone={STATUS_TONE[a.status]} dot>{a.status}</StatusBadge>
                    </div>
                    {!isStudent && !isParent && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-periwinkle-2/40">
                          <span className={cn('block h-full rounded-full transition-all', a.status === 'overdue' ? 'bg-error' : 'bg-periwinkle-3')} style={{ width: `${pct}%` }} />
                        </span>
                        <span className="font-mono text-[11.5px] text-text-secondary tabular-nums">{a.submitted}/{a.total} · {pct}%</span>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className={cn('flex items-center gap-1.5 text-[12px] font-semibold', a.status === 'overdue' ? 'text-error' : 'text-text-secondary')}>
                        <Clock size={13} /> {a.dueLabel} · {a.teacher}
                      </p>
                      <div className="flex gap-2">
                        <GlassButton size="sm" variant="ghost" icon={<FileText size={13} />} onClick={() => setSelected(a)}>
                          {isStudent ? 'Submit' : 'Open'}
                        </GlassButton>
                        {a.avgScore !== null && !isStudent && !isParent && <span className="rounded-lg bg-periwinkle-2/60 px-2 py-1 font-mono text-[11px] font-semibold text-text-primary">avg {a.avgScore}</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </GlassCard>
      )}

      {tab === 'submissions' && !isParent && (
        <GlassCard>
          <SectionHead
            title={isStudent ? 'My submissions' : 'Submissions inbox'}
            body={isStudent ? 'Everything you have turned in, with scores' : 'Grade inline or export for records'}
            action={!isStudent ? <Can do="submission.export"><GlassButton size="sm" icon={<Download size={14} />} onClick={() => pushToast({ title: 'Export ready', body: 'submissions export downloaded.', tone: 'info' })}>Export CSV</GlassButton></Can> : undefined}
          />
          <DataTable
            rows={submissionRows} pageSize={8}
            columns={[
              ...(!isStudent ? [{ key: 'student', header: 'Student', sortable: true, sortValue: (r: (typeof submissionRows)[number]) => r.student, render: (r: (typeof submissionRows)[number]) => <span><span className="block font-semibold">{r.student}</span><span className="block font-mono text-[11px] text-text-secondary">{r.studentId}</span></span> }] : []),
              { key: 'asg', header: 'Assignment', render: (r) => <span className="font-semibold">{r.assignment}</span> },
              { key: 'at', header: 'Submitted', render: (r) => <span className="font-mono text-[12px] text-text-secondary">{r.submittedAt}</span> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={r.status}>{r.status}</StatusBadge> },
              {
                key: 'score', header: 'Score', sortable: true, sortValue: (r) => r.score ?? -1,
                render: (r) => r.score !== null ? <span className="font-mono font-bold tabular-nums">{r.score}<span className="font-normal text-text-secondary">/{r.max}</span></span> : <span className="font-mono text-text-secondary">—</span>,
              },
              ...(!isStudent ? [{
                key: 'act', header: '',
                render: (r: (typeof submissionRows)[number]) => canGrade ? (
                  <GlassButton size="sm" onClick={() => { setGradeTarget({ id: r.id, name: r.student }); setGradeValue(r.score ? String(r.score) : '85'); }}>
                    {r.score !== null ? 'Re-grade' : 'Grade'}
                  </GlassButton>
                ) : null,
              }] : []),
            ]}
            searchable searchKeys={isStudent ? ['assignment'] : ['student', 'studentId']}
            searchPlaceholder={isStudent ? 'Search your work…' : 'Search submissions…'}
          />
        </GlassCard>
      )}

      {tab === 'grades' && (
        isStudent || isParent ? (
          <PersonalGrades childId={isParent ? childId : STUDENT_SCOPE.id} />
        ) : (
          <div className="grid gap-5 xl:grid-cols-3">
            <GlassCard className="xl:col-span-2">
              <SectionHead title="Gradebook snapshot" body={role === 'teacher' ? 'Your assigned classes · auto-saved' : 'Grade 10-B · Term 2 · auto-saved'} />
              <DataTable
                rows={role === 'teacher'
                  ? SUBMISSIONS.filter((x) => teacherStudents().some((t) => t.id === x.studentId)).slice(0, 12)
                  : SUBMISSIONS.slice(0, 12)}
                pageSize={8}
                columns={[
                  { key: 'student', header: 'Student', sortable: true, sortValue: (r) => r.student, render: (r) => <span className="font-semibold">{r.student}</span> },
                  { key: 'a1', header: 'Quiz 1', render: (r) => <GradeCell v={72 + (hashStr(`quiz1:${r.studentId}`) % 26)} /> },
                  { key: 'a2', header: 'Midterm', render: (r) => <GradeCell v={68 + (hashStr(`mid:${r.studentId}`) % 30)} /> },
                  { key: 'a3', header: 'Project', render: (r) => <GradeCell v={75 + (hashStr(`proj:${r.studentId}`) % 24)} /> },
                  {
                    key: 'final', header: 'Final',
                    render: (r) => {
                      const v = Math.round((72 + (hashStr(`quiz1:${r.studentId}`) % 26) + 68 + (hashStr(`mid:${r.studentId}`) % 30) + 75 + (hashStr(`proj:${r.studentId}`) % 24)) / 3);
                      return <span className="rounded-lg bg-periwinkle-3 px-2 py-1 font-mono text-[12px] font-bold text-text-primary tabular-nums">{v}</span>;
                    },
                  },
                ]}
              />
            </GlassCard>
            <GlassCard hover>
              <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Publishing</h3>
              <p className="mt-0.5 mb-3 text-[12.5px] text-text-secondary">Control what families can see.</p>
              <div className="space-y-2.5">
                {[['Quiz 1 scores', true], ['Midterm scores', true], ['Project scores', false], ['Final grades', false]].map(([label, on]) => (
                  <PublishRow key={label as string} label={label as string} initial={on as boolean} />
                ))}
              </div>
              <Can do="grade.publish">
                <GlassButton className="mt-4 w-full" variant="primary" icon={<CheckCircle2 size={15} />} onClick={() => pushToast({ title: 'Grades published', body: 'Visible to students and parents immediately.', tone: 'success' })}>
                  Publish selected
                </GlassButton>
              </Can>
            </GlassCard>
          </div>
        )
      )}

      {/* Detail drawer */}
      <Drawer
        open={!!selected} onClose={() => setSelected(null)}
        title={selected?.title ?? ''} subtitle={selected ? `${selected.id} · ${selected.subject} · ${selected.class}` : ''}
        footer={<>
          <GlassButton variant="ghost" onClick={() => setSelected(null)}>Close</GlassButton>
          <Can do="assignment.remind">
            <GlassButton variant="primary" icon={<UploadCloud size={15} />} onClick={() => { pushToast({ title: 'Reminder sent', body: `Nudged ${selected ? selected.total - selected.submitted : 0} pending students.`, tone: 'success' }); setSelected(null); }}>
              Remind pending
            </GlassButton>
          </Can>
        </>}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4">
              <StatusBadge tone={STATUS_TONE[selected.status]} dot>{selected.status}</StatusBadge>
              <p className="font-mono text-[11.5px] text-text-secondary">{selected.dueLabel}</p>
            </div>
            <p className="text-[13.5px] leading-relaxed text-text-secondary">
              Solve all problems showing full working. Attach graphs where required. Late submissions lose 10% per day.
              Rubric and reference material are attached to the Files drive.
            </p>
            <div>
              <FieldLabel>Instructions attachment</FieldLabel>
              <div className="flex items-center gap-3 rounded-xl border border-periwinkle-2/40 bg-white/35 px-3 py-2.5">
                <FileText size={16} className="text-text-secondary" />
                <span className="flex-1 text-[12.5px] font-semibold text-text-primary">{selected.id.toLowerCase()}-brief.pdf</span>
                <GlassButton size="sm" variant="ghost" onClick={() => pushToast({ title: 'Downloaded', body: 'Brief saved to your device.', tone: 'info' })}>Get</GlassButton>
              </div>
            </div>
            <Can do="assignment.submit">
              <div>
                <FieldLabel>Your submission</FieldLabel>
                <FileUploader compact onFiles={() => pushToast({ title: 'Submitted', body: 'Your file was uploaded successfully.', tone: 'success' })} />
              </div>
            </Can>
            {!isParent && (
              <div className="rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4">
                <FieldLabel>{isStudent ? 'Ask your teacher' : 'Class comment'}</FieldLabel>
                <GlassTextarea rows={2} placeholder={isStudent ? 'Ask the teacher something…' : 'Note for the class…'} />
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Create modal */}
      {canCreate && (
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New assignment" subtitle="Drafts are visible only to teachers until published." width="max-w-xl"
          footer={<>
            <GlassButton variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</GlassButton>
            <GlassButton variant="primary" onClick={() => { setCreateOpen(false); pushToast({ title: 'Assignment published', body: 'Students notified · due date synced to timetable.', tone: 'success' }); }}>Publish</GlassButton>
          </>}>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2"><FieldLabel>Title</FieldLabel><GlassInput placeholder="e.g. Light & Reflection problem set" /></div>
            <div><FieldLabel>Subject</FieldLabel><GlassSelect><option>Mathematics</option><option>Physics</option><option>English</option><option>Computer Science</option></GlassSelect></div>
            <div><FieldLabel>Class</FieldLabel><GlassSelect><option>Grade 10-B</option><option>Grade 11-A</option><option>Grade 12-C</option></GlassSelect></div>
            <div><FieldLabel>Due date</FieldLabel><GlassInput type="date" defaultValue="2026-09-30" /></div>
            <div><FieldLabel>Max score</FieldLabel><GlassInput type="number" defaultValue={100} /></div>
            <div className="sm:col-span-2"><FieldLabel>Instructions</FieldLabel><GlassTextarea rows={3} placeholder="Rubric, chapters, submission format…" /></div>
          </div>
        </Modal>
      )}

      {/* Grade modal */}
      {canGrade && (
        <Modal open={!!gradeTarget} onClose={() => setGradeTarget(null)} title={`Grade · ${gradeTarget?.name ?? ''}`} subtitle="Max 100 · autosaves to gradebook"
          footer={<>
            <GlassButton variant="ghost" onClick={() => setGradeTarget(null)}>Cancel</GlassButton>
            <GlassButton variant="primary" onClick={() => { setGradeTarget(null); pushToast({ title: 'Score saved', body: `${gradeTarget?.name} scored ${gradeValue}/100.`, tone: 'success' }); }}>Save score</GlassButton>
          </>}>
          <FieldLabel>Score ( / 100 )</FieldLabel>
          <GlassInput type="number" min={0} max={100} value={gradeValue} onChange={(e) => setGradeValue(e.target.value)} />
          <div className="mt-3"><FieldLabel>Feedback</FieldLabel><GlassTextarea rows={3} placeholder="Private note to the student…" /></div>
        </Modal>
      )}
    </div>
  );
}

/* Personal report card — student sees self, parent sees selected child. */
function PersonalGrades({ childId }: { childId: string }) {
  const { role, pushToast } = useApp();
  const name = role === 'parent' ? (LINKED_CHILDREN.find((c) => c.id === childId)?.name ?? '') : STUDENT_SCOPE.name;
  const grades = role === 'parent'
    ? (CHILD_GRADES[childId] ?? []).map((g) => ({ ...g, teacher: '', code: '' }))
    : STUDENT_GRADES;
  const avg = Math.round((grades.reduce((a, g) => a + g.score, 0) / Math.max(1, grades.length)) * 10) / 10;

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <GlassCard className="xl:col-span-2">
        <SectionHead title={`Report card · ${name}`} body="Term 2 · official record · published by school" />
        <DataTable
          rows={grades.map((g, i) => ({ ...g, id: `${childId}-${i}` }))} pageSize={8}
          columns={[
            { key: 'subject', header: 'Subject', sortable: true, sortValue: (r) => r.subject, render: (r) => <span className="font-semibold">{r.subject}</span> },
            { key: 'date', header: 'Assessed', render: (r) => <span className="font-mono text-[12px] text-text-secondary">{r.date}</span> },
            { key: 'score', header: 'Score', sortable: true, sortValue: (r) => r.score, render: (r) => <span className="font-mono font-bold tabular-nums">{r.score}</span> },
            {
              key: 'band', header: 'Grade',
              render: (r) => <StatusBadge tone={r.grade === 'B' ? 'pending' : 'graded'}>{r.grade}</StatusBadge>,
            },
            {
              key: 'bar', header: 'Scale',
              render: (r) => (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-periwinkle-2/40">
                    <span className="block h-full rounded-full bg-periwinkle-3" style={{ width: `${r.score}%` }} />
                  </span>
                </span>
              ),
            },
          ]}
        />
      </GlassCard>
      <GlassCard hover>
        <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">Term average</p>
        <p className="font-display mt-2 text-[44px] leading-none font-bold tabular-nums">{avg}<span className="text-[18px] text-text-secondary">%</span></p>
        <p className="mt-2 text-[12.5px] text-text-secondary">{avg >= 90 ? 'Outstanding — A+ band.' : avg >= 80 ? 'Strong — A band.' : 'Steady — keep pushing.'}</p>
        <GlassButton className="mt-4 w-full" onClick={() => pushToast({ title: 'Report downloaded', body: `Term 2 report card for ${name} saved as PDF.`, tone: 'info' })}>Download report</GlassButton>
      </GlassCard>
    </div>
  );
}

function GradeCell({ v }: { v: number }) {
  return (
    <span className={cn(
      'inline-block min-w-11 rounded-lg px-2 py-1 text-center font-mono text-[12px] font-bold tabular-nums',
      v >= 85 ? 'bg-white/30 text-success' : v >= 70 ? 'bg-white/30 text-warning border border-warning/40' : 'bg-white/30 text-error',
    )}>
      {v}
    </span>
  );
}

function PublishRow({ label, initial }: { label: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button onClick={() => setOn(!on)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5 text-left">
      <span className={cn('relative h-[22px] w-10 shrink-0 rounded-full transition-colors', on ? 'bg-periwinkle-3' : 'bg-lavender-2')}>
        <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-[3px]')} />
      </span>
      <span className="text-[13px] font-semibold text-text-primary">{label}</span>
      <span className="ml-auto font-mono text-[10.5px] text-text-secondary">{on ? 'visible' : 'hidden'}</span>
    </button>
  );
}
