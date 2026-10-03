import { useEffect, useState } from 'react';
import { ArrowRight, CalendarCheck2, Phone } from 'lucide-react';
import { api, sessionFor, useScopedQuery } from '../lib/api';
import { STUDENTS } from '../lib/data';
import {
  LINKED_CHILDREN,
  todayName,
} from '../lib/scoped';
import { consumeFlagSelection, subscribeFlagSelection } from '../lib/flags-live';
import { studentCard } from '../lib/idcard';
import { ProfileIdSection } from '../components/idcard';
import { StudentNotesPanel } from './student-flags';
import { useApp } from '../lib/store';
import {
  Avatar, ErrorState, GlassButton, GlassCard, LoadingCards, SectionHead, StatusBadge,
} from '../components/glass';

/* My Children — parent only. Each child record is fetched through
   api.childDetail, which refuses unlinked student IDs. */
export function MyChildren() {
  const { role, go, pushToast } = useApp();
  const [childId, setChildId] = useState(LINKED_CHILDREN[0].id);
  const [flagFocus, setFlagFocus] = useState<string | null>(null);

  // Notification deep-links switch to the exact child + record.
  useEffect(() => {
    const apply = () => {
      const sel = consumeFlagSelection();
      if (!sel.studentId && !sel.recordId) return;
      if (sel.studentId && LINKED_CHILDREN.some((c) => c.id === sel.studentId)) {
        setChildId(sel.studentId);
      }
      setFlagFocus(sel.recordId);
    };
    apply();
    return subscribeFlagSelection(apply);
  }, []);
  const q = useScopedQuery(`child:${role}:${childId}`, () => api.childDetail(sessionFor(role), childId));

  if (q.loading) return <LoadingCards count={3} />;
  if (q.error || !q.data) return <GlassCard><ErrorState title={q.error?.name === 'ForbiddenError' ? 'Not authorized' : 'Could not load profile'} body={q.error?.message} onRetry={q.reload} /></GlassCard>;

  const { child, today, assignments, grades } = q.data;
  const linked = LINKED_CHILDREN.find((c) => c.id === childId) ?? LINKED_CHILDREN[0];
  const linkedStudent = STUDENTS.find((s) => s.id === linked.id);

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {LINKED_CHILDREN.map((c) => (
          <button
            key={c.id}
            onClick={() => setChildId(c.id)}
            aria-pressed={childId === c.id}
            data-glass="primary"
            className={`glass-surface flex cursor-pointer items-center gap-3 rounded-[28px] p-4 text-left ${childId === c.id ? 'glass-selected' : 'glass-hover'}`}
          >
            <Avatar initials={c.initials} size="lg" index={c.avatar} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[16px] font-bold tracking-tight">{c.name}</p>
              <p className="font-mono text-[11px] text-text-secondary">{c.id} · {c.class} · Roll {c.roll}</p>
            </div>
            {childId === c.id && <StatusBadge tone="active">Viewing</StatusBadge>}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-4">
        {[
          { l: 'GPA · Term 2', v: child.gpa.toFixed(1) },
          { l: 'Attendance', v: `${child.attendance}%` },
          { l: 'Open work', v: String(assignments.filter((a) => a.status !== 'closed').length) },
          { l: 'Class teacher', v: child.teacher.split(' ')[0] },
        ].map((s) => (
          <GlassCard key={s.l} hover>
            <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
            <p className="font-display mt-2 text-[26px] leading-none font-bold tabular-nums">{s.v}</p>
          </GlassCard>
        ))}
      </div>

      {linkedStudent && (
        <div className="mx-auto w-full max-w-[600px]">
          <ProfileIdSection
            card={studentCard(linkedStudent)}
            natural={{ kind: 'student', grade: linkedStudent.grade, section: linkedStudent.section, roll: linkedStudent.roll }}
            relation="linked"
          />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <GlassCard hover>
          <SectionHead title="Today at school" body={`${child.class} · ${todayName()}`} action={<GlassButton size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => go('timetable')}>Week</GlassButton>} />
          <div className="space-y-1.5">
            {today.filter((t) => t.kind !== 'break').slice(0, 6).map((t) => (
              <div key={t.period} className="flex items-center gap-2.5 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2">
                <span className="w-11 shrink-0 font-mono text-[10.5px] font-bold">{t.time}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{t.subject}</span>
                <span className="font-mono text-[10px] text-text-secondary">R{t.room}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-periwinkle-2/40 bg-white/35 px-4 py-3 text-[12.5px] text-text-secondary">
            <CalendarCheck2 size={15} />
            Marked present in all periods today · last ping 01:40 PM
          </div>
        </GlassCard>

        <div className="space-y-5">
          <GlassCard hover>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="font-display text-[16px] font-bold tracking-tight">Latest scores</h3>
              <GlassButton size="sm" variant="ghost" icon={<ArrowRight size={13} />} onClick={() => go('grades')}>Report card</GlassButton>
            </div>
            <div className="space-y-1.5">
              {grades.slice(0, 5).map((g) => (
                <div key={g.subject} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{g.subject}</span>
                  <span className="font-mono text-[10.5px] text-text-secondary">{g.date}</span>
                  <StatusBadge tone={g.grade === 'B' ? 'pending' : 'graded'}>{g.grade}</StatusBadge>
                  <span className="w-8 text-right font-mono text-[12px] font-bold tabular-nums">{g.score}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard hover>
            <h3 className="font-display text-[16px] font-bold tracking-tight">Class teacher</h3>
            <div className="mt-2.5 flex items-center gap-3">
              <Avatar initials={child.teacher.split(' ').map((w) => w[0]).join('')} index={3} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{child.teacher}</p>
                <p className="font-mono text-[10.5px] text-text-secondary">{child.class} · replies within a day</p>
              </div>
              <GlassButton size="sm" icon={<Phone size={13} />} onClick={() => pushToast({ title: 'Message sent', body: `Your note reached ${child.teacher}.`, tone: 'success' })}>Message</GlassButton>
            </div>
          </GlassCard>

          <StudentNotesPanel
            grade={linked.grade} section={linked.section} roll={linked.roll}
            focusRecordId={flagFocus}
          />
        </div>
      </div>
    </div>
  );
}
