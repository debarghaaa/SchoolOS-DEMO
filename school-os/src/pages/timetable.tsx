import { useMemo, useState } from 'react';
import { CalendarDays, FlaskConical, MapPin, Palette, Trophy, User } from 'lucide-react';
import { CLASSES, SCHOOL_DAY_RANGE, TT_DAYS, TT_PERIODS } from '../lib/data';
import { LINKED_CHILDREN, STUDENT_SCOPE, TEACHER_SCOPE, livePeriod, teacherSlots, timetableFor, todayName } from '../lib/scoped';
import { useApp } from '../lib/store';
import type { TimetableSlot } from '../lib/types';
import { cn } from '../lib/utils';
import { Drawer, GlassButton, GlassCard, GlassSelect, SectionHead, StatusBadge } from '../components/glass';

const KIND_STYLE: Record<TimetableSlot['kind'], { chip: string; bar: string; icon: React.ReactNode }> = {
  lecture: { chip: 'bg-white/35 border-periwinkle-2/50', bar: 'bg-baby-blue-ice', icon: <User size={11} /> },
  lab: { chip: 'bg-white/35 border-periwinkle-2/50', bar: 'bg-periwinkle-3', icon: <FlaskConical size={11} /> },
  sports: { chip: 'bg-white/35 border-periwinkle-3/50', bar: 'bg-periwinkle-2', icon: <Trophy size={11} /> },
  arts: { chip: 'bg-white/35 border-periwinkle-2/50', bar: 'bg-baby-blue-ice', icon: <Palette size={11} /> },
  break: { chip: 'bg-transparent border-dashed border-periwinkle-2/50', bar: 'bg-periwinkle-2/40', icon: null },
};

/* Timetable — scoped per role:
   - teacher: ONLY their own teaching periods (everything else reads "Free")
   - student: own class · parent: linked children's classes · admin: any class */
export function Timetable() {
  const { role, pushToast } = useApp();
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';
  const isParent = role === 'parent';

  const [cls, setCls] = useState(isStudent ? STUDENT_SCOPE.class : 'Grade 10-B');
  const [childId, setChildId] = useState(LINKED_CHILDREN[0].id);
  const [day, setDay] = useState(todayName());
  const [view, setView] = useState<'week' | 'day'>('week');
  const [selected, setSelected] = useState<TimetableSlot | null>(null);

  const effectiveClass = isStudent ? STUDENT_SCOPE.class : isParent ? LINKED_CHILDREN.find((c) => c.id === childId)!.class : cls;
  const mine = useMemo(() => (isTeacher ? teacherSlots() : []), [isTeacher]);
  const weekSlots = useMemo(
    () => (isTeacher ? mine : timetableFor(effectiveClass)),
    [isTeacher, mine, effectiveClass],
  );
  const daySlots = useMemo(() => {
    if (!isTeacher) return weekSlots.filter((t) => t.day === day);
    // Teacher day list: own periods merged with free blocks
    return TT_PERIODS.map((time, p) => {
      const own = mine.find((t) => t.day === day && t.period === p + 1);
      if (own) return own;
      if (p === 4) return { day, period: p + 1, time, subject: 'Lunch Break', teacher: '', room: '—', class: '', kind: 'break' as const };
      return { day, period: p + 1, time, subject: 'Free period', teacher: '', room: '—', class: '', kind: 'break' as const };
    });
  }, [weekSlots, mine, day, isTeacher]);

  const slotFor = (d: string, p: number) => weekSlots.find((t) => t.day === d && t.period === p);

  const title = isTeacher ? 'My teaching schedule' : isParent ? 'Children’s timetables' : isStudent ? 'My timetable' : 'Weekly timetable';
  const blurb = isTeacher
    ? `${TEACHER_SCOPE.subject} · only your periods are shown`
    : `${effectiveClass} · ${TT_PERIODS.length} periods · ${SCHOOL_DAY_RANGE} · Term 2`;

  return (
    <div className="animate-fade-up space-y-5">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead title={title} body={blurb} />
          <div className="flex flex-wrap items-center gap-2">
            {isParent && (
              <GlassSelect value={childId} onChange={(e) => setChildId(e.target.value)} aria-label="Select child">
                {LINKED_CHILDREN.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.class}</option>)}
              </GlassSelect>
            )}
            {!isTeacher && !isStudent && !isParent && (
              <GlassSelect value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Select class">
                {CLASSES.map((c) => `${c.grade}-${c.section}`).map((c) => <option key={c}>{c}</option>)}
              </GlassSelect>
            )}
            <div className="flex rounded-xl border border-periwinkle-2/50 bg-white/35 p-1">
              {(['week', 'day'] as const).map((v) => (
                <button
                  key={v} onClick={() => setView(v)}
                  className={v === view ? 'rounded-lg bg-periwinkle-3 px-3 py-1.5 text-[12px] font-semibold text-text-primary' : 'cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold text-text-secondary'}
                >
                  {v === 'week' ? 'Week grid' : 'Day list'}
                </button>
              ))}
            </div>
            <GlassButton icon={<CalendarDays size={15} />} onClick={() => pushToast({ title: 'Synced to calendar', body: `${isTeacher ? 'Teaching schedule' : effectiveClass} exported as .ics.`, tone: 'success' })}>Sync</GlassButton>
          </div>
        </div>

        <div className="mt-1 mb-4 flex flex-wrap gap-2 font-mono text-[10.5px] text-text-secondary">
          {[['Lecture', 'var(--color-baby-blue-ice)'], ['Lab', 'var(--color-periwinkle-3)'], ['Sports', 'var(--color-periwinkle-2)'], ['Arts', 'var(--color-baby-blue-ice)'], ['Break', 'color-mix(in srgb, var(--color-periwinkle-2) 40%, transparent)']].map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5 rounded-full border border-periwinkle-2/40 bg-white/35 px-2.5 py-1">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}
            </span>
          ))}
          {isTeacher && <span className="ml-auto hidden sm:inline">scoped · {mine.length} periods/week · unassigned time hidden</span>}
          {!isTeacher && (() => { const lp = livePeriod(weekSlots); const today = todayName(); return <span className="ml-auto hidden sm:inline">today · {today}{TT_DAYS.includes(today) ? (lp ? ` · Period ${lp.period} in session` : ' · no period in session') : ' · weekend'}</span>; })()}
        </div>

        {view === 'week' ? (
          <div className="overflow-x-auto rounded-2xl border border-periwinkle-2/40">
            <table className="w-full min-w-[860px] border-collapse bg-white/35">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-[86px] bg-alice-blue/85 px-3 py-3 font-mono text-[10.5px] tracking-wider text-text-secondary uppercase backdrop-blur-md">Period</th>
                  {TT_DAYS.map((d) => (
                    <th key={d} className={cn('px-2 py-3 text-[12.5px] font-bold', d === todayName() ? 'text-text-primary' : 'text-text-secondary')}>
                      {d}
                      {d === todayName() && <span className="ml-1.5 rounded-full bg-periwinkle-3 px-1.5 py-0.5 font-mono text-[9px] text-text-primary">today</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TT_PERIODS.map((time, p) => (
                  <tr key={time} className="tt-row">
                    <td className="sticky left-0 z-10 bg-alice-blue/85 px-3 py-2 backdrop-blur-md">
                      <p className="font-mono text-[11px] font-semibold text-text-primary">P{p + 1}</p>
                      <p className="font-mono text-[10px] text-text-secondary">{time}</p>
                    </td>
                    {TT_DAYS.map((d) => {
                      const s = slotFor(d, p + 1);
                      // Teacher grid: unassigned periods render as quiet "Free" cells
                      if (!s) {
                        return (
                          <td key={d} className="tt-cell px-1.5 py-1.5 align-top">
                            <div className="rounded-xl border border-dashed border-periwinkle-2/40 px-2 py-2.5 text-center font-mono text-[10px] text-text-secondary">
                              {p === 4 ? 'lunch' : 'free'}
                            </div>
                          </td>
                        );
                      }
                      const st = KIND_STYLE[s.kind];
                      const isNow = d === 'Thursday' && p + 1 === 4;
                      return (
                        <td key={d} className="tt-cell px-1.5 py-1.5 align-top">
                          <button
                            onClick={() => setSelected(s)}
                            className={cn(
                              'relative w-full cursor-pointer overflow-hidden rounded-xl border p-2 text-left transition-all duration-300 hover:-translate-y-[1px] hover:shadow-lift',
                              st.chip,
                              isNow && 'ring-2 ring-baby-blue-ice/70',
                            )}
                          >
                            <span className={cn('absolute top-0 left-0 h-full w-[3px]', st.bar)} />
                            <span className="block truncate pl-1.5 text-[11.5px] leading-tight font-bold text-text-primary">{s.subject}</span>
                            {s.kind !== 'break' && (
                              <span className="mt-0.5 block truncate pl-1.5 font-mono text-[9.5px] text-text-secondary">{isTeacher ? `${s.class} · R${s.room}` : `${s.teacher.split(' ')[0]} · R${s.room}`}</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              {TT_DAYS.map((d) => (
                <button
                  key={d} onClick={() => setDay(d)}
                  className={cn(
                    'shrink-0 cursor-pointer rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-all',
                    day === d ? 'bg-periwinkle-3 text-text-primary shadow' : 'border border-periwinkle-2/50 bg-white/35 text-text-secondary hover:bg-lavender-2/70',
                  )}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {daySlots.map((s) => {
                const st = KIND_STYLE[s.kind];
                const free = s.subject === 'Free period';
                return (
                  <button
                    key={s.period} onClick={() => !free && setSelected(s)} disabled={free}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                      free ? 'cursor-default border-dashed border-periwinkle-2/40 bg-transparent opacity-60' : 'cursor-pointer border-periwinkle-2/35 bg-white/35 hover:-translate-y-[1px] hover:bg-lavender-2/70',
                    )}
                  >
                    <span className="w-14 shrink-0">
                      <span className="block font-mono text-[11px] font-bold text-text-primary">{s.time}</span>
                      <span className="block font-mono text-[10px] text-text-secondary">P{s.period}</span>
                    </span>
                    <span className={cn('h-10 w-1 shrink-0 rounded-full', st.bar)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-text-primary">{s.subject}</span>
                      <span className="block font-mono text-[11px] text-text-secondary">
                        {free ? 'no class assigned' : s.kind === 'break' ? 'recess' : isTeacher ? `${s.class} · Room ${s.room}` : `${s.teacher} · Room ${s.room}`}
                      </span>
                    </span>
                    {!free && s.kind !== 'break' && <StatusBadge tone="neutral">{s.kind}</StatusBadge>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </GlassCard>

      <Drawer
        open={!!selected} onClose={() => setSelected(null)}
        title={selected?.subject ?? ''} subtitle={selected ? `${selected.day} · Period ${selected.period} · ${selected.time}` : ''}
        footer={selected?.kind !== 'break' ? <GlassButton variant="primary" onClick={() => { pushToast({ title: 'Joined classroom', body: 'Opening the virtual room for this period.', tone: 'info' }); setSelected(null); }}>Join classroom</GlassButton> : undefined}
      >
        {selected && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <User size={14} /> {selected.teacher || '—'}
              </div>
              <div className="mt-2 flex items-center gap-2 font-mono text-[11.5px] text-text-secondary">
                <MapPin size={13} /> Room {selected.room} · {selected.class || effectiveClass}
              </div>
            </div>
            {selected.kind !== 'break' && (
              <div className="rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4 text-[13px] text-text-secondary">
                <p className="font-semibold text-text-primary">This period</p>
                <p className="mt-1">Bring the {selected.kind === 'lab' ? 'lab manual and safety gear' : selected.kind === 'sports' ? 'house kit and water bottle' : 'textbook and notebook'}. Homework from last period will be checked.</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
