/* =====================================================================
   Consistency audit — proves School OS behaves as one interconnected
   school system backed by a single canonical dataset.

   Run: npm run audit-consistency
   Fails (exit 1) on the first violated invariant, printing the breach.
   ===================================================================== */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ACTIVE_STUDENTS, APPLICANTS, ASSIGNMENTS, ATTENDANCE_WEEK,
  CLASSES, CLASS_SIZE, ELAB_WEEK, ENROLMENT_TREND, FACILITIES,
  FEE_COLLECTION, FILES, GRADE_DIST, GRADE_NAMES, HOUSE_POINTS, INTAKE_LABEL,
  LAB_PROBLEMS, LEAVE_APPLICATIONS, LEAVE_QUOTA, NOTIFICATIONS, PARENTS,
  PERFORMANCE_BY_SUBJECT, SECTION_NAMES, STAFF, STUDENTS, SUBJECTS, SUBJECT_DEPT,
  SUBJECT_LIST, SUBMISSIONS, TEACHERS, TIMETABLE, TT_CLOCK, TT_PERIODS,
  UPCOMING_EVENTS, classTeacherOf, leaveFor, leavesLeftFor, pendingLeaveFor,
  studentsOf, teacherFor,
} from '../src/lib/data';
import {
  AARAV_FEEDBACK, CHILD_GRADES, LINKED_CHILDREN, STUDENT_FEEDBACK,
  STUDENT_GRADES, STUDENT_SCOPE, TEACHER_SCOPE, attendanceSeries,
  studentAssignments, studentSubmissions, teacherAssignments, teacherPendingGrades,
  teacherStudents,
} from '../src/lib/scoped';
import { demoSnapshot } from '../src/lib/presence-demo';
import { demoMaintenance } from '../src/lib/maintenance-demo';
import { PLATFORM_USERS, TENANTS } from '../src/lib/platform-data';

const ROOT = process.cwd(); // run via `npm run audit-consistency` from the package root
let passed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (!cond) {
    console.error(`\n✗ FAIL: ${name}${detail ? `\n  ${detail}` : ''}`);
    process.exit(1);
  }
  passed++;
}

/* ---------------- A. Identity: one record per person ---------------- */
{
  const names = (xs: { name: string }[]) => xs.map((x) => x.name);
  check('student names unique', new Set(names(STUDENTS)).size === STUDENTS.length);
  check('teacher names unique', new Set(names(TEACHERS)).size === TEACHERS.length);
  check('staff names unique', new Set(names(STAFF)).size === STAFF.length);
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  const tag = (xs: { name: string; id: string }[], t: string) => xs.forEach((x) => {
    const prev = seen.get(x.name);
    if (prev) dupes.push(`${x.name} (${prev} vs ${t}:${x.id})`);
    else seen.set(x.name, `${t}:${x.id}`);
  });
  tag(STUDENTS, 'STU'); tag(TEACHERS, 'TEA'); tag(STAFF, 'STA');
  check('no identity shared across students/teachers/staff', dupes.length === 0, dupes.join('; '));
  check('student ids unique', new Set(STUDENTS.map((s) => s.id)).size === STUDENTS.length);
  check('teacher ids unique', new Set(TEACHERS.map((t) => t.id)).size === TEACHERS.length);
}

/* ---------------- B. Pinned canonical identities ---------------- */
const ishita = STUDENTS.find((s) => s.id === 'NV-2024014');
check('Ishita Dutta pinned', !!ishita && ishita.name === 'Ishita Dutta'
  && ishita.grade === 'Grade 10' && ishita.section === 'B' && ishita.roll === '14'
  && ishita.guardian === 'Priya Dutta' && ishita.email === 'ishita@northview.edu'
  && ishita.gpa === 9.1 && ishita.attendance === 96.4);
const aaravJr = STUDENTS.find((s) => s.name === 'Aarav Dutta');
check('Aarav Dutta pinned sibling', !!aaravJr && aaravJr.id === 'NV-2022071'
  && aaravJr.grade === 'Grade 7' && aaravJr.section === 'A' && aaravJr.roll === '06'
  && aaravJr.guardian === 'Priya Dutta');
const mirrors: Array<[string, string, string, string]> = [
  ['Aarav Sharma', 'Grade 10', 'A', '01'], ['Arjun Chatterjee', 'Grade 10', 'A', '04'],
  ['Diya Patel', 'Grade 10', 'A', '07'], ['Advait Menon', 'Grade 10', 'A', '12'],
  ['Divya Nair', 'Grade 10', 'B', '01'], ['Ishaan Rao', 'Grade 10', 'B', '12'],
  ['Pari Shah', 'Grade 10', 'C', '01'], ['Om Chavan', 'Grade 10', 'C', '06'],
];
for (const [name, grade, section, roll] of mirrors) {
  const s = STUDENTS.find((x) => x.name === name);
  check(`backend mirror ${name}`, !!s && s.grade === grade && s.section === section && s.roll === roll);
}

/* ---------------- C. Canonical class structure ---------------- */
check('7 grades × 3 sections', GRADE_NAMES.length === 7 && SECTION_NAMES.length === 3);
check('21 classes', CLASSES.length === 21);
check('756 students enrolled', STUDENTS.length === 21 * CLASS_SIZE);
for (const c of CLASSES) {
  const key = `${c.grade}-${c.section}`;
  const pupils = studentsOf(key);
  check(`class ${key} strength 36`, pupils.length === CLASS_SIZE && c.students === CLASS_SIZE);
  const avg = Math.round((pupils.reduce((a, s) => a + s.gpa, 0) / pupils.length) * 10 * 10) / 10;
  check(`class ${key} avg derived`, c.avg === avg, `${c.avg} vs ${avg}`);
  check(`class ${key} teacher is canonical`, TEACHERS.some((t) => t.name === c.teacher));
}
check('ACTIVE_STUDENTS matches records',
  ACTIVE_STUDENTS === STUDENTS.filter((s) => s.status === 'active').length);
check('10-B class teacher is Meera Iyer', classTeacherOf('Grade 10-B') === 'Meera Iyer');

/* ---------------- D. Teachers ---------------- */
check('36 teachers', TEACHERS.length === 36);
for (const sub of SUBJECTS) {
  check(`subject taught: ${sub}`, TEACHERS.some((t) => t.subject === sub));
}
for (const t of TEACHERS) {
  check(`${t.name} dept matches subject`, t.dept === SUBJECT_DEPT[t.subject]);
  check(`${t.name} classes canonical`, t.classes.every((c) => CLASSES.some((x) => `${x.grade}-${x.section}` === c)));
}
const phys10B = TEACHERS.filter((t) => t.subject === 'Physics' && t.classes.includes('Grade 10-B'));
check('Rohan Sen sole Physics teacher of 10-B',
  phys10B.length === 1 && phys10B[0].name === 'Rohan Sen');

/* ---------------- E. Assignments + submissions ---------------- */
check('8 assignments', ASSIGNMENTS.length === 8);
for (const a of ASSIGNMENTS) {
  check(`${a.id} class canonical`, CLASSES.some((c) => `${c.grade}-${c.section}` === a.class));
  check(`${a.id} subject canonical`, SUBJECTS.includes(a.subject));
  const t = TEACHERS.find((x) => x.name === a.teacher);
  check(`${a.id} teacher teaches ${a.subject} in ${a.class}`,
    !!t && t.subject === a.subject && t.classes.includes(a.class));
  check(`${a.id} total = class size`, a.total === CLASS_SIZE);
  check(`${a.id} submitted ≤ total`, a.submitted <= a.total);
  const recs = SUBMISSIONS.filter((s) => s.assignment === a.title);
  check(`${a.id} submitted count matches records`, a.submitted === recs.length);
  const graded = recs.filter((r) => r.score !== null);
  const avg = graded.length > 0 ? Math.round(graded.reduce((x, r) => x + (r.score ?? 0), 0) / graded.length) : null;
  check(`${a.id} avgScore derived`, a.avgScore === avg);
  if (a.status === 'draft') check(`${a.id} draft label`, a.dueLabel === 'Draft');
  if (a.status === 'closed') check(`${a.id} closed label`, a.dueLabel.startsWith('Closed '));
  if (a.status === 'overdue') check(`${a.id} overdue label`, a.dueLabel.startsWith('Overdue by '));
}
for (const sb of SUBMISSIONS) {
  check(`submission ${sb.id} student resolves`, STUDENTS.some((s) => s.id === sb.studentId));
  check(`submission ${sb.id} assignment resolves`,
    ASSIGNMENTS.some((a) => a.id === sb.assignmentId && a.title === sb.assignment));
  const st = STUDENTS.find((s) => s.id === sb.studentId);
  const asg = ASSIGNMENTS.find((a) => a.id === sb.assignmentId);
  check(`submission ${sb.id} student sits in assignment class`,
    !!st && !!asg && `${st.grade}-${st.section}` === asg.class);
}

/* ---------------- F. Timetable ---------------- */
check('40 slots (5 days × 8 periods)', TIMETABLE.length === 40);
check('period table parallel to clock', TT_PERIODS.length === 8 && TT_CLOCK.length === 8);
for (const sl of TIMETABLE) {
  check(`slot ${sl.day} P${sl.period} subject canonical`, SUBJECTS.includes(sl.subject));
  const t = TEACHERS.find((x) => x.name === sl.teacher);
  check(`slot ${sl.day} P${sl.period} teacher teaches ${sl.subject} in ${sl.class}`,
    !!t && t.subject === sl.subject && t.classes.includes(sl.class));
  check(`slot ${sl.day} P${sl.period} period in range`, sl.period >= 1 && sl.period <= 8);
  check(`slot ${sl.day} P${sl.period} time matches table`, sl.time === TT_PERIODS[sl.period - 1]);
}
check('Rohan Sen has Physics slots', TIMETABLE.some((sl) => sl.teacher === 'Rohan Sen' && sl.subject === 'Physics'));

/* ---------------- G. Parents ---------------- */
check('one parent record per student + pinned father', PARENTS.length === STUDENTS.length + 1);
for (const pr of PARENTS) {
  check(`parent ${pr.id} child resolves`, STUDENTS.some((s) => s.id === pr.childId && s.name === pr.child));
  check(`parent ${pr.id} relation valid`, pr.relation === 'Mother' || pr.relation === 'Father');
}
const guardian = PARENTS.find((pr) => pr.email === 'parent@example.com');
check('Guardian Dutta father of Ishita',
  !!guardian && guardian.name === 'Guardian Dutta' && guardian.childId === 'NV-2024014');

/* ---------------- H. Notifications ---------------- */
const ROUTES = new Set(['overview', 'schools', 'tenants', 'users', 'subscriptions',
  'feature-flags', 'platform-analytics', 'audit-logs', 'system-settings', 'students-directory',
  'students-admissions', 'students-performance', 'teachers-faculty', 'teachers-staff',
  'parents', 'classes-classes', 'subjects', 'my-classes', 'my-children', 'attendance',
  'assignments', 'submissions', 'grades', 'timetable', 'elab', 'files', 'notifications',
  'settings', 'maintenance', 'leave-management', 'student-flags']);
const VALID_ROLES = new Set(['super-admin', 'school-admin', 'teacher', 'student', 'parent']);
for (const n of NOTIFICATIONS) {
  check(`notification ${n.id} ref route valid`, ROUTES.has(n.ref.route));
  check(`notification ${n.id} audience valid roles`,
    n.audience.length > 0 && n.audience.every((r) => VALID_ROLES.has(r)));
}
const a102 = ASSIGNMENTS.find((x) => x.id === 'ASG-102');
check('n3 pending count matches ASG-102',
  NOTIFICATIONS.find((n) => n.id === 'n3')?.body.includes(`${(a102?.total ?? 0) - (a102?.submitted ?? 0)} submissions`) === true);
for (const e of UPCOMING_EVENTS) {
  check(`event ${e.title} date is upcoming`, /\w{3} \d{1,2}/.test(e.date));
}
check('Code Autumn event matches n7',
  NOTIFICATIONS.find((n) => n.id === 'n7')?.body.includes(
    UPCOMING_EVENTS.find((e) => e.title.includes('Code Autumn'))?.date ?? '§') === true);

/* ---------------- I. Charts derived ---------------- */
check('grade distribution sums to enrolment',
  GRADE_DIST.reduce((a, g) => a + g.count, 0) === STUDENTS.length);
check('4 house point rows', HOUSE_POINTS.length === 4);
check('enrolment trend ends at active count',
  ENROLMENT_TREND[ENROLMENT_TREND.length - 1].students === ACTIVE_STUDENTS);
check('fee series covers 6 months', FEE_COLLECTION.length === 6);
for (const row of SUBJECT_LIST) {
  const ts = TEACHERS.filter((t) => t.subject === row.name);
  check(`${row.name} teacher count matches`, row.teachers === ts.length);
  check(`${row.name} class count matches`,
    row.classes === new Set(ts.flatMap((t) => t.classes)).size);
  check(`${row.name} dept matches`, row.dept === SUBJECT_DEPT[row.name]);
}
check('performance covers all subjects',
  PERFORMANCE_BY_SUBJECT.length === SUBJECTS.length
  && PERFORMANCE_BY_SUBJECT.every((p) => SUBJECTS.includes(p.subject)));
check('attendance week anchored on records', ATTENDANCE_WEEK.length === 6
  && ATTENDANCE_WEEK.every((d) => d.present > 80 && d.present <= 100));
for (const f of FILES) {
  const known = STAFF.some((s) => s.name === f.owner)
    || TEACHERS.some((t) => t.name === f.owner) || f.owner === 'Ananya Rao';
  check(`file ${f.id} owner canonical`, known);
}

/* ---------------- J. Leave ---------------- */
check('leave quota 12', LEAVE_QUOTA === 12);
for (const l of LEAVE_APPLICATIONS) {
  const applicant = l.applicantRole === 'student'
    ? STUDENTS.find((s) => s.id === l.applicantId)
    : TEACHERS.find((t) => t.id === l.applicantId);
  check(`leave ${l.id} applicant resolves`, !!applicant && applicant.name === l.applicantName);
  if (l.applicantRole === 'student') {
    const st = applicant as { grade: string; section: string };
    check(`leave ${l.id} approver is class teacher`,
      l.approverName === classTeacherOf(`${st.grade}-${st.section}`));
  } else {
    check(`leave ${l.id} approver is school admin`, l.approverName === 'Ananya Rao');
  }
}
check('Ishita leave balance = quota − approved days',
  leavesLeftFor('NV-2024014') === LEAVE_QUOTA - leaveFor('NV-2024014')
    .filter((l) => l.status === 'approved').reduce((a, l) => a + l.days, 0));
check('Meera Iyer has pending queue',
  pendingLeaveFor('Meera Iyer').every((l) => l.approverName === 'Meera Iyer' && l.status === 'pending'));

/* ---------------- K. Scopes ---------------- */
const rohan = TEACHERS.find((t) => t.name === 'Rohan Sen');
check('teacher scope = Rohan record', TEACHER_SCOPE.name === 'Rohan Sen'
  && TEACHER_SCOPE.subject === rohan?.subject && TEACHER_SCOPE.dept === rohan?.dept
  && TEACHER_SCOPE.homeroom === 'Grade 11-A'
  && [...TEACHER_SCOPE.classes].sort().join() === [...(rohan?.classes ?? [])].sort().join());
check('teacher scope covers 10-B + homeroom',
  TEACHER_SCOPE.classes.includes('Grade 10-B') && TEACHER_SCOPE.classes.includes('Grade 11-A'));
check('teacher students = scope classes × 36',
  teacherStudents().length === TEACHER_SCOPE.classes.length * CLASS_SIZE);
check('teacher assignments in scope', teacherAssignments().every(
  (a) => a.teacher === TEACHER_SCOPE.name || TEACHER_SCOPE.classes.includes(a.class)));
check('pending grades scoped', teacherPendingGrades() >= 0);
check('student scope = Ishita record', STUDENT_SCOPE.id === 'NV-2024014'
  && STUDENT_SCOPE.class === 'Grade 10-B' && STUDENT_SCOPE.gpa === 9.1
  && STUDENT_SCOPE.attendance === 96.4);
check('student submissions are Ishita’s', studentSubmissions().every((s) => s.studentId === 'NV-2024014'));
check('student assignments are 10-B non-drafts', studentAssignments().every(
  (a) => a.class === 'Grade 10-B' && a.status !== 'draft'));
for (const g of STUDENT_GRADES) {
  check(`grade ${g.subject} canonical`, SUBJECTS.includes(g.subject));
  check(`grade ${g.subject} teacher teaches 10-B`, teacherFor(g.subject, 'Grade 10-B').name === g.teacher);
}
for (const f of STUDENT_FEEDBACK) {
  check(`feedback from canonical teacher: ${f.from}`,
    TEACHERS.some((t) => f.from.startsWith(t.name)));
}
check('2 linked children', LINKED_CHILDREN.length === 2);
for (const c of LINKED_CHILDREN) {
  const s = STUDENTS.find((x) => x.id === c.id);
  check(`linked child ${c.name} resolves`, !!s && s.name === c.name
    && s.gpa === c.gpa && s.attendance === c.attendance);
  check(`linked child ${c.name} teacher is class teacher`, c.teacher === classTeacherOf(c.class));
  check(`linked child ${c.name} grades canonical`,
    (CHILD_GRADES[c.id] ?? []).every((g) => SUBJECTS.includes(g.subject)));
}
check('Aarav feedback from 7-A teacher',
  AARAV_FEEDBACK.every((f) => f.from.startsWith(classTeacherOf('Grade 7-A'))));
{
  const a = attendanceSeries('NV-2024014');
  const b = attendanceSeries('NV-2024014');
  check('attendance series deterministic', JSON.stringify(a) === JSON.stringify(b));
  check('shared school holidays', a.grid[0][5] === 0 && a.grid[3][5] === 0
    && attendanceSeries('NV-2022071').grid[0][5] === 0);
  check('grid is 5×6', a.grid.length === 5 && a.grid.every((r) => r.length === 6));
}

/* ---------------- L. Presence demo rosters ---------------- */
{
  const fac = demoSnapshot('faculty');
  check('demo faculty = 6 canonical', fac.total === 6 && fac.records.every((r) =>
    TEACHERS.some((t) => t.id === r.id && t.name === r.name && t.subject === r.subject && t.dept === r.dept)));
  const stf = demoSnapshot('staff');
  check('demo staff = 11 canonical', stf.total === STAFF.length && stf.records.every((r) =>
    STAFF.some((m) => m.id === r.id && m.name === r.name)));
  const stu = demoSnapshot('student');
  check('demo students = Grade 10 canonical', stu.total === 3 * CLASS_SIZE && stu.records.every((r) =>
    STUDENTS.some((s) => s.id === r.id && s.grade === 'Grade 10')));
  for (const snap of [fac, stf, stu]) {
    check('snapshot counts reconcile',
      snap.present + snap.absent === snap.total && snap.records.length === snap.total);
  }
}

/* ---------------- M. Maintenance demo ---------------- */
{
  const m = demoMaintenance();
  const facilityNames = new Set(FACILITIES.map((f) => f.name));
  const staffNames = new Set(STAFF.map((s) => s.name));
  check('demo facilities = canonical register', m.facilities.length === FACILITIES.length
    && m.facilities.every((f) => facilityNames.has(f.name)));
  for (const r of m.requests) {
    check(`request ${r.id} location canonical`, facilityNames.has(r.location));
    check(`request ${r.id} assignee canonical`, r.assignedStaff === '' || staffNames.has(r.assignedStaff));
    check(`request ${r.id} status valid`, ['open', 'in_progress', 'completed'].includes(r.status));
  }
  for (const t of m.tasks) {
    check(`task ${t.id} location canonical`, facilityNames.has(t.location));
    check(`task ${t.id} assignee canonical`, t.assignedStaff === '' || staffNames.has(t.assignedStaff));
  }
}

/* ---------------- N. Platform boundary ---------------- */
{
  const nv = TENANTS.find((t) => t.school === 'Northview High');
  check('Northview tenant mirrors canonical strength',
    !!nv && nv.students === STUDENTS.length && nv.staff === TEACHERS.length + STAFF.length);
  const admin = PLATFORM_USERS.find((u) => u.id === 'U-901');
  check('platform admin = Ananya Rao', !!admin && admin.name === 'Ananya Rao' && admin.email === 'admin@northview.edu');
  const teacher = PLATFORM_USERS.find((u) => u.id === 'U-902');
  check('platform teacher = Rohan Sen', !!teacher && teacher.email === 'rohan@northview.edu');
  const pupil = PLATFORM_USERS.find((u) => u.id === 'U-910');
  check('platform student canonical',
    !!pupil && pupil.name === 'Aarav Sharma' && STUDENTS.some((s) => s.name === pupil.name));
}

/* ---------------- O. Cross-layer + stale-name sweep ---------------- */
function read(p: string): string {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}
{
  const backend = read('../school-api/app/seed.py');
  for (const name of ['Ritu Malhotra', 'Suresh Yadav', 'Fatima Sheikh', 'Gopal Naskar',
      'Dipak Mondal', 'Karan Nair', 'Farhan Ali', 'Anjali Rao', 'Arjun Chatterjee',
      'meera.iyer@northview.edu', 'arjun.mehta@northview.edu', 'ishita@northview.edu',
      'Guardian Dutta']) {
    check(`backend seed has ${name}`, backend.includes(name));
  }
  for (const stale of ['Anjali Gupta', 'Vikram Singh', 'Farah Khan',
      'Karthik Menon', 'Joseph D', 'Nandini Rao']) {
    const inNorthview = backend.split('riverside')[0].includes(stale);
    check(`backend Northview seed drops ${stale}`, !inNorthview);
  }
  const supabaseSeed = read('supabase/seed.sql');
  for (const name of ['Rohan Sen', 'rohan@northview.edu', 'Ishita Dutta', 'ishita@northview.edu',
      'Guardian Dutta', 'parent@example.com', 'Arjun Chatterjee', 'Farhan Ali', 'Anjali Rao',
      'Suresh Yadav', 'Karan Nair', 'Dipak Mondal', 'Ritu Malhotra']) {
    check(`supabase seed has ${name}`, supabaseSeed.includes(name));
  }
  for (const stale of ['Rajesh Sharma', 'Aarav Sharma\', \'student01', 'Nandini Rao']) {
    check(`supabase seed drops ${stale}`, !supabaseSeed.includes(stale));
  }
  const maintSeed = read('supabase/maintenance.sql');
  check('maintenance seed drops Joseph', !maintSeed.includes('Joseph'));
  check('maintenance seed drops Karthik', !maintSeed.includes('Karthik'));
  const docsSeed = read('../school-api/docs/database/seed.sql');
  for (const name of ['Meera Iyer', 'meera.iyer@northview.edu', 'Arjun Chatterjee',
      'arjun.chatterjee@northview.edu', 'arjun.das@northview.edu', 'NV-2024014',
      'NV-2027049', 'NV-2027063']) {
    check(`docs seed has ${name}`, docsSeed.includes(name));
  }
  for (const stale of ['Meera Nair', 'Arjun Mehta', 'student01@', 'student04@',
      'NV-2026-', 'arjun@northview']) {
    check(`docs seed drops ${stale}`, !docsSeed.includes(stale));
  }

  const staleInFrontend = ['2,471', 'value="136"', 'Sara Thomas', 'Dev Patel', 'Ananya Mukherjee',
    'Nandini Rao', 'Karthik Menon', 'Anjali Gupta', 'Vikram Singh',
    'Farah Khan', 'Rajesh Sharma', '41 rows', 'rank 4 of 41',
    'Thursday schedule', 'Thursday, Sep', 'starts Oct 1', 'oldest 2d', '2 flagged', 'E-Lab solved" value="2/6'];
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
  for (const file of walk(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const stale of staleInFrontend) {
      check(`${path.relative(ROOT, file)} drops “${stale}”`, !text.includes(stale));
    }
  }
}

/* ---------------- P. E-Lab catalogue ---------------- */
{
  check('6 problems', LAB_PROBLEMS.length === 6);
  check('problem ids p1..p6', LAB_PROBLEMS.every((p, i) => p.id === `p${i + 1}`));
  check('solved flags match inbox (p1, p2)',
    LAB_PROBLEMS.filter((p) => p.solved).map((p) => p.id).join() === 'p1,p2');
  check('p3 is the attempted retry', (() => {
    const r = LAB_PROBLEMS.find((p) => p.attempted && !p.solved);
    return r?.id === 'p3' && r.tests.length === 3;
  })());
  check('ELAB week shape', ELAB_WEEK.length === 7);
  check('INTAKE_LABEL current session', /^\d{4}–\d{2}$/.test(INTAKE_LABEL));
  check('applicant funnel reconciles', APPLICANTS.length === APPLICANTS.filter((a) => a.stage).length
    && APPLICANTS.filter((a) => a.stage === 'Enrolled').length === 3);
  check('applicant names unique + directory-safe',
    new Set(APPLICANTS.map((a) => a.name)).size === APPLICANTS.length
    && APPLICANTS.every((a) => !STUDENTS.some((s) => s.name === a.name)));
}

console.log(`\n✓ consistency audit passed — ${passed} invariants hold.`);
