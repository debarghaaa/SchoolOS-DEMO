import {
  ASSIGNMENTS, CLASSES, STUDENTS, SUBMISSIONS, TEACHERS, TIMETABLE, TT_CLOCK, TT_PERIODS,
  classTeacherOf, studentsOf, teacherFor,
} from './data';
import type { Assignment, Student, Teacher, TimetableSlot } from './types';
import { hashStr } from './presence';

/* =====================================================================
   Authorization scopes — mirrors what the backend would resolve from the
   authenticated session (tenant_id, user_id, linked class/child ids).
   Every scoped selector below is the *only* data its role may receive.
   Scopes resolve against the canonical dataset: names, classes and
   teachers always match the underlying records.
   ===================================================================== */

export function todayName(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

/** ISO week number of today (1–53). */
export function isoWeek(): number {
  const dt = new Date(); dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const w1 = new Date(dt.getFullYear(), 0, 4);
  return 1 + Math.round(((dt.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

/** The slot in session right now (weekday + clock), if any. */
export function livePeriod(slots: TimetableSlot[]): TimetableSlot | null {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const day = todayName();
  return slots.find((t) => {
    if (t.day !== day) return false;
    const c = TT_CLOCK[t.period - 1];
    return c !== undefined && mins >= c.start && mins < c.end;
  }) ?? null;
}

/* ---------------- Teacher: Rohan Sen · Physics ---------------- */

const ROHAN = TEACHERS.find((t) => t.name === 'Rohan Sen') as Teacher;

export const TEACHER_SCOPE = {
  name: ROHAN.name,
  subject: ROHAN.subject,
  dept: ROHAN.dept,
  // Class keys this teacher is assigned to (object-level authorization)
  classes: [...ROHAN.classes],
  homeroom: (() => {
    const c = CLASSES.find((x) => x.teacher === ROHAN.name);
    return c ? `${c.grade}-${c.section}` : '';
  })(),
};

export function teacherStudents(): Student[] {
  return TEACHER_SCOPE.classes.flatMap((c) => studentsOf(c));
}

export function teacherAssignments(): Assignment[] {
  return ASSIGNMENTS.filter(
    (a) => a.teacher === TEACHER_SCOPE.name || TEACHER_SCOPE.classes.includes(a.class),
  );
}

export function teacherSlots(): TimetableSlot[] {
  return TIMETABLE.filter((t) => t.teacher === TEACHER_SCOPE.name);
}

export function teacherToday(day = todayName()): TimetableSlot[] {
  return teacherSlots().filter((t) => t.day === day);
}

/** Ungraded, non-missing submissions from this teacher's own students. */
export function teacherPendingGrades(): number {
  const scopeIds = new Set(teacherStudents().map((s) => s.id));
  const scopeWork = new Set(teacherAssignments().map((a) => a.title));
  return SUBMISSIONS.filter(
    (s) => s.score === null && s.status !== 'missing' && scopeIds.has(s.studentId) && scopeWork.has(s.assignment),
  ).length;
}

export function teacherClasses() {
  return CLASSES.filter((c) => TEACHER_SCOPE.classes.includes(`${c.grade}-${c.section}`));
}

/* ---------------- Student: Ishita Dutta · Grade 10-B ---------------- */

const ISHITA = STUDENTS.find((s) => s.id === 'NV-2024014') as Student;

export const STUDENT_SCOPE = {
  id: ISHITA.id,
  name: ISHITA.name,
  class: `${ISHITA.grade}-${ISHITA.section}`,
  grade: ISHITA.grade,
  section: ISHITA.section,
  roll: ISHITA.roll,
  gpa: ISHITA.gpa,
  attendance: ISHITA.attendance,
};

export function studentAssignments(): Assignment[] {
  return ASSIGNMENTS.filter((a) => a.class === STUDENT_SCOPE.class && a.status !== 'draft');
}

export function studentToday(day = todayName()): TimetableSlot[] {
  return TIMETABLE.filter((t) => t.day === day && t.class === STUDENT_SCOPE.class);
}

export function studentSubmissions() {
  const mine = SUBMISSIONS.filter((s) => s.studentId === STUDENT_SCOPE.id);
  if (mine.length > 0) return mine;
  // Fallback: representative personal inbox derived from class work
  return studentAssignments().slice(0, 4).map((a, i) => ({
    id: `MINE-${i}`,
    student: STUDENT_SCOPE.name,
    studentId: STUDENT_SCOPE.id,
    assignment: a.title,
    assignmentId: a.id,
    submittedAt: a.status === 'overdue' ? '—' : `Sep ${21 + (i % 3)}, 08:1${i} AM`,
    status: (a.status === 'overdue' ? 'missing' : i === 0 ? 'graded' : 'on-time') as 'missing' | 'graded' | 'on-time',
    score: i === 0 ? 92 : null,
    max: 100,
  }));
}

function gradeRec(subject: string, code: string, score: number, grade: string, teacher: string, date: string) {
  return { subject, code, score, grade, teacher, date };
}

export const STUDENT_GRADES = [
  gradeRec('Computer Science', 'CSC-10', 98, 'A+', teacherFor('Computer Science', 'Grade 10-B').name, 'Sep 20'),
  gradeRec('Mathematics', 'MAT-10', 94, 'A+', 'Meera Iyer', 'Sep 19'),
  gradeRec('English', 'ENG-10', 92, 'A+', 'Arjun Mehta', 'Sep 17'),
  gradeRec('Biology', 'BIO-10', 90, 'A+', teacherFor('Biology', 'Grade 10-B').name, 'Sep 15'),
  gradeRec('Physics', 'PHY-10', 89, 'A', 'Rohan Sen', 'Sep 12'),
  gradeRec('Chemistry', 'CHE-10', 86, 'A', teacherFor('Chemistry', 'Grade 10-B').name, 'Sep 10'),
];

export const STUDENT_FEEDBACK = [
  { from: 'Meera Iyer · Mathematics', text: 'Beautiful working on the quadratics set — try the olympiad extension next.', time: '2 days ago' },
  { from: 'Rohan Sen · Physics', text: 'Lab technique is excellent. Show units on every line of the report.', time: '4 days ago' },
  { from: 'Arjun Mehta · English', text: 'Partition essay shortlisted for the inter-school review. Well done.', time: '1 week ago' },
];

/* ---------------- Parent: Priya Dutta · 2 linked children ---------------- */
export interface LinkedChild {
  id: string;
  name: string;
  initials: string;
  class: string;
  grade: string;
  section: string;
  roll: string;
  gpa: number;
  attendance: number;
  teacher: string;
  avatar: number;
}

function linkedChild(studentId: string, avatar: number): LinkedChild {
  const s = STUDENTS.find((x) => x.id === studentId) as Student;
  const classKey = `${s.grade}-${s.section}`;
  return {
    id: s.id, name: s.name, initials: s.initials, class: classKey,
    grade: s.grade, section: s.section, roll: s.roll,
    gpa: s.gpa, attendance: s.attendance,
    teacher: classTeacherOf(classKey), avatar,
  };
}

export const LINKED_CHILDREN: LinkedChild[] = [
  linkedChild('NV-2024014', 0),
  linkedChild('NV-2022071', 2),
];

export function childAssignments(childClass: string): Assignment[] {
  return ASSIGNMENTS.filter((a) => a.class === childClass && a.status !== 'draft');
}

export const CHILD_GRADES: Record<string, { subject: string; score: number; grade: string; date: string }[]> = {
  'NV-2024014': STUDENT_GRADES.map((g) => ({ subject: g.subject, score: g.score, grade: g.grade, date: g.date })),
  'NV-2022071': [
    { subject: 'Mathematics', score: 88, grade: 'A', date: 'Sep 20' },
    { subject: 'General Science', score: 86, grade: 'A', date: 'Sep 18' },
    { subject: 'English', score: 84, grade: 'A', date: 'Sep 16' },
    { subject: 'Social Science', score: 81, grade: 'A', date: 'Sep 13' },
    { subject: 'Hindi', score: 79, grade: 'B', date: 'Sep 11' },
  ],
};

export const AARAV_FEEDBACK = [
  { from: `${classTeacherOf('Grade 7-A')} · Class Teacher`, text: 'Aarav reads aloud beautifully. Mental-maths drills will lift his speed.', time: '3 days ago' },
];

/* ---------------- Per-student attendance history ---------------- */

/** Deterministic per student: streak, trailing-6-week percentages, 30-cell grid.
    School holidays (two Saturdays) are shared; late marks are personal. */
export function attendanceSeries(studentId: string): { streak: number; weeks: number[]; grid: number[][] } {
  let h = hashStr(`attendance:${studentId}`) >>> 0;
  const next = (): number => {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
  const streak = 5 + Math.floor(next() * 20);
  const weeks = Array.from({ length: 6 }, () => Math.round((88 + next() * 11) * 10) / 10);
  const grid: number[][] = Array.from({ length: 5 }, () => Array.from({ length: 6 }, () => 1));
  grid[0][5] = 0;
  grid[3][5] = 0;
  let placed = 0;
  while (placed < 2) {
    const r = Math.floor(next() * 5);
    const c = Math.floor(next() * 5);
    if (grid[r][c] === 1) { grid[r][c] = 2; placed++; }
  }
  return { streak, weeks, grid };
}

/* Timetable for any class: the 10-B master grid, deterministically rotated
   for other classes so every child sees their own schedule. */
export function timetableFor(cls: string): TimetableSlot[] {
  if (cls === 'Grade 10-B') return TIMETABLE.filter((t) => t.class === cls);
  const shift = cls.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
  return TIMETABLE.filter((t) => t.class === 'Grade 10-B').map((t) => {
    if (t.kind === 'break') return { ...t, class: cls };
    const pool = TIMETABLE.filter((x) => x.day === t.day && x.kind !== 'break' && x.class === 'Grade 10-B');
    const alt = pool[(pool.indexOf(t) + shift) % pool.length];
    return { ...t, subject: alt.subject, teacher: alt.teacher, room: alt.room, kind: alt.kind, class: cls };
  });
}

export function todayFor(cls: string, day = todayName()): TimetableSlot[] {
  return timetableFor(cls).filter((t) => t.day === day);
}

export { TT_PERIODS };

/* ---------------- Family announcements (parent + student audience) ---------------- */
export const FAMILY_ANNOUNCEMENTS = [
  { date: 'Sep 24', title: 'PTM slots open for Grade 10-B', body: 'Book a 10-minute slot with Meera Iyer before Sep 28.' },
  { date: 'Sep 22', title: 'Term fee due Oct 15', body: 'Q3 invoice of ₹18,400 is available under Fees.' },
  { date: 'Sep 20', title: 'Athletics finals this Saturday', body: 'Raman house marches at 8:30 AM. Kit check on Friday.' },
];
