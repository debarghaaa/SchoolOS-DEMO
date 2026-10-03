import { ArrowRight, BookOpen, CalendarCheck2, Clock, DoorOpen, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, sessionFor, useScopedQuery } from '../lib/api';
import { STUDENTS, TEACHERS } from '../lib/data';
import { STUDENT_SCOPE, TEACHER_SCOPE, teacherStudents, todayName } from '../lib/scoped';
import { studentCard, teacherCard } from '../lib/idcard';
import { ProfileIdSection } from '../components/idcard';
import { consumeFlagSelection, subscribeFlagSelection } from '../lib/flags-live';
import { StudentNotesPanel } from './student-flags';
import { useApp } from '../lib/store';
import {
  Avatar, Can, ErrorState, GlassButton, GlassCard, LoadingCards, Modal, SectionHead, StatusBadge,
} from '../components/glass';

/* My Classes — teacher sees assigned classes; student sees enrolled class.
   Served by api.myClasses, which scopes strictly by role. */
export function MyClasses() {
  const { role, go } = useApp();
  const q = useScopedQuery(`my-classes:${role}`, () => api.myClasses(sessionFor(role)));
  const [flagFocus, setFlagFocus] = useState<string | null>(null);
  const [idOpen, setIdOpen] = useState(false);

  // Notification deep-links open the exact record on my own panel.
  useEffect(() => {
    const apply = () => setFlagFocus(consumeFlagSelection().recordId);
    apply();
    return subscribeFlagSelection(apply);
  }, []);

  if (q.loading) return <LoadingCards count={3} />;
  if (q.error || !q.data) return <GlassCard><ErrorState title={q.error?.name === 'ForbiddenError' ? 'Not authorized' : 'Could not load classes'} body={q.error?.message} onRetry={q.reload} /></GlassCard>;

  const d = q.data;

  if (d.kind === 'teach') {
    const roster = teacherStudents();
    const me = TEACHERS.find((t) => t.name === TEACHER_SCOPE.name);
    return (
      <div className="animate-fade-up space-y-5">
        {me && (
          <GlassCard>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar initials={me.initials} index={1} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-text-primary">My faculty ID</p>
                <p className="font-mono text-[11px] text-text-secondary">{me.id} · {me.dept}</p>
              </div>
              <GlassButton size="sm" onClick={() => setIdOpen(true)}>View ID card</GlassButton>
            </div>
            <Modal open={idOpen} onClose={() => setIdOpen(false)} title="My faculty ID" subtitle={`${me.name} · ${me.id}`}>
              <ProfileIdSection
                card={teacherCard(me)}
                natural={{ kind: 'teacher', name: me.name }}
                relation="self"
              />
            </Modal>
          </GlassCard>
        )}
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { l: 'Assigned classes', v: String(d.classes.length), d: d.scope.classes.join(' · ') },
            { l: 'Students taught', v: String(roster.length), d: 'across your classes' },
            { l: 'Periods today', v: String(d.today.length), d: `${todayName()} · all rooms set` },
          ].map((s) => (
            <GlassCard key={s.l} hover>
              <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
              <p className="font-display mt-2 text-[30px] leading-none font-bold tabular-nums">{s.v}</p>
              <p className="mt-2 text-[12.5px] text-text-secondary">{s.d}</p>
            </GlassCard>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {d.classes.map((c) => {
            const kids = roster.filter((s) => `${s.grade}-${s.section}` === `${c.grade}-${c.section}`);
            const periods = d.today.filter((t) => t.class === `${c.grade}-${c.section}`);
            return (
              <GlassCard key={c.id} hover>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] text-text-secondary">{c.id} · {d.scope.subject}</p>
                    <h3 className="font-display mt-0.5 text-[20px] font-bold tracking-tight">{c.name}</h3>
                  </div>
                  <StatusBadge tone="active">{c.avg}% avg</StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-[12.5px] text-text-secondary">
                  <span className="flex items-center gap-1.5"><Users size={14} /> {c.students} students</span>
                  <span className="flex items-center gap-1.5"><DoorOpen size={14} /> Room {c.room}</span>
                  <span className="flex items-center gap-1.5"><Clock size={14} /> {periods.length} periods today</span>
                </div>
                <div className="mt-3 flex -space-x-2">
                  {kids.slice(0, 8).map((k, i) => <Avatar key={k.id} initials={k.initials} size="sm" index={i} className="ring-2 ring-periwinkle-3/50" />)}
                  {kids.length > 8 && <span className="grid h-7 w-7 place-items-center rounded-full bg-periwinkle-3 font-mono text-[9px] font-bold text-text-primary ring-2 ring-periwinkle-3/50">+{kids.length - 8}</span>}
                </div>
                <div className="mt-4 flex gap-2">
                  <Can do="attendance.mark">
                    <GlassButton size="sm" className="flex-1" icon={<CalendarCheck2 size={14} />} onClick={() => go('attendance')}>Open register</GlassButton>
                  </Can>
                  <GlassButton size="sm" className="flex-1" variant="ghost" icon={<BookOpen size={14} />} onClick={() => go('assignments')}>Class work</GlassButton>
                </div>
              </GlassCard>
            );
          })}
        </div>

        <GlassCard>
          <SectionHead title="Today’s periods" body="Across your assigned classes" action={<GlassButton size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => go('timetable')}>Week view</GlassButton>} />
          <div className="grid gap-2 sm:grid-cols-2">
            {d.today.map((t) => (
              <div key={`${t.day}-${t.period}-${t.class}`} className="flex items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3">
                <span className="w-14 shrink-0"><span className="block font-mono text-[12px] font-bold">{t.time}</span><span className="block font-mono text-[10px] text-text-secondary">P{t.period}</span></span>
                <span className="h-9 w-1 shrink-0 rounded-full bg-periwinkle-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{t.subject}</p>
                  <p className="font-mono text-[10.5px] text-text-secondary">{t.class} · Room {t.room}</p>
                </div>
                {t.period === 4 ? <StatusBadge tone="graded" dot>Live</StatusBadge> : <StatusBadge tone="neutral">P{t.period}</StatusBadge>}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    );
  }

  // Student variant
  const subjects = Array.from(new Map(d.timetable.filter((t) => t.kind !== 'break').map((t) => [t.subject, t])).values());
  const learnStudent = STUDENTS.find((s) => s.id === STUDENT_SCOPE.id);
  return (
    <div className="animate-fade-up space-y-5">
      <GlassCard level={2} sheen>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar initials="10" size="lg" index={2} />
          <div className="min-w-[200px] flex-1">
            <p className="font-mono text-[11px] tracking-[0.12em] text-text-secondary uppercase">enrolled class · 2026-27</p>
            <h2 className="font-display mt-1 text-[24px] font-bold tracking-tight">{d.me.class}</h2>
            <p className="mt-1 text-[13px] text-text-secondary">Class teacher · Meera Iyer · 41 students · Room 204</p>
          </div>
          <GlassButton icon={<ArrowRight size={15} />} onClick={() => go('timetable')}>My timetable</GlassButton>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHead title="My subjects" body={`${subjects.length} subjects this term`} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {subjects.map((t, i) => (
            <div key={t.subject} className="flex items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3">
              <Avatar initials={t.subject.split(' ').map((w) => w[0]).slice(0, 2).join('')} index={i} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{t.subject}</p>
                <p className="font-mono text-[10.5px] text-text-secondary">{t.teacher}</p>
              </div>
              <StatusBadge tone="neutral">{t.kind}</StatusBadge>
            </div>
          ))}
        </div>
      </GlassCard>

      {learnStudent && (
        <ProfileIdSection
          card={studentCard(learnStudent)}
          natural={{ kind: 'student', grade: learnStudent.grade, section: learnStudent.section, roll: learnStudent.roll }}
          relation="self"
        />
      )}

      <StudentNotesPanel
        grade={STUDENT_SCOPE.grade} section={STUDENT_SCOPE.section} roll={STUDENT_SCOPE.roll}
        focusRecordId={flagFocus}
      />
    </div>
  );
}
