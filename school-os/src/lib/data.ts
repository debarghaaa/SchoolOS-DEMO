import type {
  Assignment, FileItem, LabProblem, LeaveApplication, Notification,
  RoleMeta, SchoolClass, StaffMember, Student, Submission, Teacher, TimetableSlot,
} from './types';

/* =====================================================================
   CANONICAL SCHOOL DATASET — Northview High, Kolkata.

   This module is the single source of truth for the school workspace.
   Every page, modal, register, report and notification derives from these
   records; nothing here is duplicated elsewhere. Identities are
   deterministic (seeded RNG + explicit pins), so the same person keeps
   the same id, name and email in every module across every reload.

   Rules honored by this dataset:
   - One record per person. Generated names are unique; the only shared
     names are pinned (siblings share one guardian).
   - Every student sits in a canonical class (grades 6-12, sections A-C).
     Class strength, class averages and rosters are computed from the
     student records, never hardcoded.
   - Teachers teach canonical subjects from canonical departments and are
     assigned to canonical classes they are eligible to teach.
   - Assignments, submissions, timetable slots, parents, files, events and
     leave records reference canonical records only.
   ===================================================================== */

/* ---------------- Role personas (login switcher) ---------------- */

export const ROLES: RoleMeta[] = [
  { id: 'super-admin', label: 'Super Admin', description: 'Multi-school control · Northview Trust', initials: 'SA', name: 'Aarav Mehta', email: 'aarav@northview.edu' },
  { id: 'school-admin', label: 'School Admin', description: 'Northview High · Kolkata', initials: 'AM', name: 'Ananya Rao', email: 'admin@northview.edu' },
  { id: 'teacher', label: 'Teacher', description: 'Physics · Grade 10–11', initials: 'RS', name: 'Rohan Sen', email: 'rohan@northview.edu' },
  { id: 'student', label: 'Student', description: 'Grade 10-B · Roll 14', initials: 'ID', name: 'Ishita Dutta', email: 'ishita@northview.edu' },
  { id: 'parent', label: 'Parent', description: 'Guardian of Ishita Dutta', initials: 'PD', name: 'Priya Dutta', email: 'priya.dutta@mail.com' },
];

/* ---------------- Deterministic helpers ---------------- */

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(42);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('');
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Claimed full names — guarantees one identity per person. */
const usedNames = new Set<string>();
const claimName = (name: string) => { usedNames.add(name); };

function uniqueName(firstPool: string[]): string {
  for (let i = 0; i < 80; i++) {
    const n = `${pick(firstPool)} ${pick(LAST)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  // Practically unreachable (pools hold 2,000+ combinations for ~1,600
  // people). Middle-initial fallback keeps the guarantee absolute.
  const base = `${pick(firstPool)} ${pick(LAST)}`;
  let k = 0;
  let n = base;
  while (usedNames.has(n)) { k++; n = `${base.split(' ')[0]} ${'ABCDEFGHJKLMN'[k % 13]} ${base.split(' ')[1]}`; }
  usedNames.add(n);
  return n;
}

/** Guardian name sharing the student's surname; kept unique. */
function guardianFor(surname: string): string {
  for (let i = 0; i < 80; i++) {
    const n = `${pick(rand() > 0.5 ? FIRST_F : FIRST_M)} ${surname}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  let n = `${pick(FIRST_F)} ${surname}`;
  while (usedNames.has(n)) n = `G ${n}`;
  usedNames.add(n);
  return n;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateAt = (offsetDays: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
};
const isoAt = (offsetDays: number): string => dateAt(offsetDays).toISOString().slice(0, 10);
const fmtShort = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const DAY = 86400000;

/* ---------------- Canonical school structure ---------------- */

export const GRADE_NAMES = ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
export const SECTION_NAMES = ['A', 'B', 'C'];
export const CLASS_SIZE = 36;
export const DEPARTMENTS = ['Sciences', 'Humanities', 'Technology', 'Commerce', 'Arts'];
export const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Geography',
  'Computer Science', 'Economics', 'Art', 'General Science', 'Social Science', 'Hindi',
];
export const SUBJECT_DEPT: Record<string, string> = {
  Mathematics: 'Sciences', Physics: 'Sciences', Chemistry: 'Sciences', Biology: 'Sciences',
  'General Science': 'Sciences', English: 'Humanities', History: 'Humanities',
  Geography: 'Humanities', 'Social Science': 'Humanities', Hindi: 'Humanities',
  'Computer Science': 'Technology', Economics: 'Commerce', Art: 'Arts',
};
const SUBJECT_TIER: Record<string, 'senior' | 'middle' | 'core'> = {
  Mathematics: 'core', English: 'core', 'Computer Science': 'core', Art: 'core', Hindi: 'core',
  Physics: 'senior', Chemistry: 'senior', Biology: 'senior',
  History: 'senior', Geography: 'senior', Economics: 'senior',
  'General Science': 'middle', 'Social Science': 'middle',
};
const SUBJECT_CODE: Record<string, string> = {
  Mathematics: 'MAT', Physics: 'PHY', Chemistry: 'CHE', Biology: 'BIO', English: 'ENG',
  History: 'HIS', Geography: 'GEO', 'Computer Science': 'CSC', Economics: 'ECO',
  Art: 'ART', 'General Science': 'GSC', 'Social Science': 'SSC', Hindi: 'HIN',
};

interface ClassKey { grade: string; section: string; key: string }
const CLASS_ORDER: ClassKey[] = GRADE_NAMES.flatMap((grade) =>
  SECTION_NAMES.map((section) => ({ grade, section, key: `${grade}-${section}` })),
);
const SENIOR_KEYS = CLASS_ORDER.filter(({ grade }) => Number(grade.replace('Grade ', '')) >= 9).map((c) => c.key);
const MIDDLE_KEYS = CLASS_ORDER.filter(({ grade }) => Number(grade.replace('Grade ', '')) < 9).map((c) => c.key);
const ALL_KEYS = CLASS_ORDER.map((c) => c.key);

function eligibleKeys(subject: string): string[] {
  const tier = SUBJECT_TIER[subject];
  if (tier === 'senior') return SENIOR_KEYS;
  if (tier === 'middle') return MIDDLE_KEYS;
  return ALL_KEYS;
}

const FIRST_F = [
  'Aarohi', 'Ananya', 'Diya', 'Divya', 'Ira', 'Ishita', 'Kavya', 'Meera', 'Myra', 'Navya',
  'Pari', 'Pooja', 'Priya', 'Riya', 'Sara', 'Sneha', 'Tara', 'Zara', 'Anaya', 'Kiara',
  'Aishwarya', 'Bhavna', 'Charvi', 'Devika', 'Eshita', 'Farah', 'Gauri', 'Hridya', 'Jaya', 'Lakshmi',
];
const FIRST_M = [
  'Aarav', 'Aditya', 'Advait', 'Arjun', 'Ayaan', 'Dev', 'Ishaan', 'Kabir', 'Krishna', 'Om',
  'Reyansh', 'Rohan', 'Rudra', 'Vihaan', 'Vivaan', 'Yash', 'Amit', 'Arnav', 'Dhruv', 'Farhan',
  'Gaurav', 'Harsh', 'Jai', 'Karan', 'Manav', 'Nikhil', 'Pranav', 'Rahul', 'Sahil', 'Varun',
];
const LAST = [
  'Sharma', 'Verma', 'Iyer', 'Reddy', 'Nair', 'Gupta', 'Mehta', 'Khan', 'Das', 'Sen',
  'Rao', 'Menon', 'Joshi', 'Patel', 'Chatterjee', 'Bose', 'Kulkarni', 'Desai', 'Pillai', 'Bhatt',
  'Yadav', 'Malhotra', 'Shah', 'Thakur', 'Chavan', 'Dutta', 'Mondal', 'Naskar', 'Ali', 'Kaur',
  'Singh', 'Agarwal', 'Banerjee', 'Ghosh', 'Chopra',
];
const HOUSES = ['Raman', 'Tagore', 'Ashoka', 'Kalam'];

/* ---------------- Students (canonical identities) ---------------- */

interface StudentPin {
  name: string; grade: string; section: string; roll: string;
  id?: string; gpa?: number; attendance?: number;
  guardian?: string; house?: string; email?: string;
}

const STUDENT_PINS: StudentPin[] = [
  // Grade 10-A — mirrors the backend demo feed and login fixtures (rolls 1-12).
  { name: 'Aarav Sharma', grade: 'Grade 10', section: 'A', roll: '01' },
  { name: 'Rahul Verma', grade: 'Grade 10', section: 'A', roll: '02' },
  { name: 'Priya Sharma', grade: 'Grade 10', section: 'A', roll: '03' },
  { name: 'Arjun Chatterjee', grade: 'Grade 10', section: 'A', roll: '04' },
  { name: 'Neha Iyer', grade: 'Grade 10', section: 'A', roll: '05' },
  { name: 'Karan Joshi', grade: 'Grade 10', section: 'A', roll: '06' },
  { name: 'Diya Patel', grade: 'Grade 10', section: 'A', roll: '07' },
  { name: 'Arjun Nair', grade: 'Grade 10', section: 'A', roll: '08' },
  { name: 'Myra Reddy', grade: 'Grade 10', section: 'A', roll: '09' },
  { name: 'Reyansh Iyer', grade: 'Grade 10', section: 'A', roll: '10' },
  { name: 'Sara Khan', grade: 'Grade 10', section: 'A', roll: '11' },
  { name: 'Advait Menon', grade: 'Grade 10', section: 'A', roll: '12' },
  // Grade 10-B — mirrors the backend demo feed; roll 14 is the student persona.
  { name: 'Divya Nair', grade: 'Grade 10', section: 'B', roll: '01' },
  { name: 'Aditya Rao', grade: 'Grade 10', section: 'B', roll: '02' },
  { name: 'Sneha Kulkarni', grade: 'Grade 10', section: 'B', roll: '03' },
  { name: 'Vikram Reddy', grade: 'Grade 10', section: 'B', roll: '04' },
  { name: 'Pooja Menon', grade: 'Grade 10', section: 'B', roll: '05' },
  { name: 'Rahul Patel', grade: 'Grade 10', section: 'B', roll: '06' },
  { name: 'Ira Bose', grade: 'Grade 10', section: 'B', roll: '07' },
  { name: 'Krishna Yadav', grade: 'Grade 10', section: 'B', roll: '08' },
  { name: 'Tara Desai', grade: 'Grade 10', section: 'B', roll: '09' },
  { name: 'Dev Malhotra', grade: 'Grade 10', section: 'B', roll: '10' },
  { name: 'Anaya Joshi', grade: 'Grade 10', section: 'B', roll: '11' },
  { name: 'Ishaan Rao', grade: 'Grade 10', section: 'B', roll: '12' },
  {
    name: 'Ishita Dutta', grade: 'Grade 10', section: 'B', roll: '14', id: 'NV-2024014',
    gpa: 9.1, attendance: 96.4, guardian: 'Priya Dutta', house: 'Raman',
    email: 'ishita@northview.edu',
  },
  // Grade 10-C — mirrors the backend login fixtures.
  { name: 'Pari Shah', grade: 'Grade 10', section: 'C', roll: '01' },
  { name: 'Yash Thakur', grade: 'Grade 10', section: 'C', roll: '02' },
  { name: 'Navya Pillai', grade: 'Grade 10', section: 'C', roll: '03' },
  { name: 'Rudra Verma', grade: 'Grade 10', section: 'C', roll: '04' },
  { name: 'Kiara Bhatt', grade: 'Grade 10', section: 'C', roll: '05' },
  { name: 'Om Chavan', grade: 'Grade 10', section: 'C', roll: '06' },
  // Grade 7-A — the younger sibling linked to the parent persona.
  {
    name: 'Aarav Dutta', grade: 'Grade 7', section: 'A', roll: '06', id: 'NV-2022071',
    gpa: 8.4, attendance: 93.1, guardian: 'Priya Dutta', house: 'Raman',
  },
];
interface TeacherPin { name: string; subject: string; email?: string; homeroom?: string }
const TEACHER_PINS: TeacherPin[] = [
  { name: 'Rohan Sen', subject: 'Physics', email: 'rohan@northview.edu', homeroom: 'Grade 11-A' },
  { name: 'Meera Iyer', subject: 'Mathematics', email: 'meera.iyer@northview.edu', homeroom: 'Grade 10-B' },
  { name: 'Arjun Mehta', subject: 'English', email: 'arjun.mehta@northview.edu', homeroom: 'Grade 9-A' },
  { name: 'Amit Verma', subject: 'Physics', homeroom: 'Grade 10-A' },
  { name: 'Priya Nair', subject: 'Mathematics', homeroom: 'Grade 10-C' },
  { name: 'Arjun Das', subject: 'English', homeroom: 'Grade 11-B' },
  { name: 'Kavita Rao', subject: 'Chemistry', homeroom: 'Grade 11-C' },
  { name: 'Vikram Iyer', subject: 'History', homeroom: 'Grade 12-A' },
  { name: 'Sunita Joshi', subject: 'Biology', homeroom: 'Grade 12-B' },
];
TEACHER_PINS.forEach((p) => claimName(p.name));

/* ---------------- Staff + facilities ---------------- */

export const STAFF: StaffMember[] = [
  { id: 'S-01', name: 'Ritu Malhotra', initials: 'RM', role: 'Registrar', dept: 'Administration', status: 'active', email: 'ritu.malhotra@northview.edu', phone: '+91 98110 22334' },
  { id: 'S-02', name: 'Suresh Yadav', initials: 'SY', role: 'Transport Manager', dept: 'Operations', status: 'active', email: 'suresh.yadav@northview.edu', phone: '+91 98110 22335' },
  { id: 'S-03', name: 'Fatima Sheikh', initials: 'FS', role: 'Librarian', dept: 'Library', status: 'active', email: 'fatima.sheikh@northview.edu', phone: '+91 98110 22336' },
  { id: 'S-04', name: 'Gopal Naskar', initials: 'GN', role: 'Lab Technician', dept: 'Sciences', status: 'active', email: 'gopal.naskar@northview.edu', phone: '+91 98110 22337' },
  { id: 'S-05', name: 'Anjali Rao', initials: 'AR', role: 'Counsellor', dept: 'Wellbeing', status: 'active', email: 'anjali.rao@northview.edu', phone: '+91 98110 22338' },
  { id: 'S-06', name: 'Dipak Mondal', initials: 'DM', role: 'IT Administrator', dept: 'Technology', status: 'active', email: 'dipak.mondal@northview.edu', phone: '+91 98110 22339' },
  { id: 'S-07', name: 'Rohit Sharma', initials: 'RS', role: 'Admissions Officer', dept: 'Admissions', status: 'active', email: 'rohit.sharma@northview.edu', phone: '+91 98110 22340' },
  { id: 'S-08', name: 'Karan Nair', initials: 'KN', role: 'Security Officer', dept: 'Campus Safety', status: 'active', email: 'karan.nair@northview.edu', phone: '+91 98110 22341' },
  { id: 'S-09', name: 'Kiran Desai', initials: 'KD', role: 'Sports Coordinator', dept: 'Athletics', status: 'active', email: 'kiran.desai@northview.edu', phone: '+91 98110 22342' },
  { id: 'S-10', name: 'Farhan Ali', initials: 'FA', role: 'Maintenance Supervisor', dept: 'Facilities', status: 'active', email: 'farhan.ali@northview.edu', phone: '+91 98110 22343' },
  { id: 'S-11', name: 'Ramesh Kumar', initials: 'RK', role: 'Maintenance Technician', dept: 'Facilities', status: 'active', email: 'ramesh.kumar@northview.edu', phone: '+91 98110 22344' },
];
STAFF.forEach((s) => claimName(s.name));

// Claim every pinned identity BEFORE generation so random draws can never
// collide with staff, teachers, guardians or family members.
TEACHER_PINS.forEach((p) => claimName(p.name));
STAFF.forEach((member) => claimName(member.name));
claimName('Guardian Dutta');

STUDENT_PINS.forEach((p) => claimName(p.name));
STUDENT_PINS.forEach((p) => { if (p.guardian) claimName(p.guardian); });

function pinGender(name: string): 'F' | 'M' {
  return FIRST_F.includes(name.split(' ')[0]) ? 'F' : 'M';
}

function buildStudents(): Student[] {
  const list: Student[] = [];
  let seq = 0;
  for (const { grade, section } of CLASS_ORDER) {
    for (let slot = 1; slot <= CLASS_SIZE; slot++) {
      const roll = String(slot).padStart(2, '0');
      const pin = STUDENT_PINS.find((p) => p.grade === grade && p.section === section && p.roll === roll);
      seq++;
      const name = pin?.name ?? uniqueName(rand() > 0.5 ? FIRST_F : FIRST_M);
      const parts = name.split(' ');
      const surname = parts[parts.length - 1];
      const female = pin ? pinGender(name) === 'F' : FIRST_F.includes(parts[0]);
      list.push({
        id: pin?.id ?? `NV-${2024000 + seq * 7 + 11}`,
        name,
        initials: initialsOf(name),
        grade,
        section,
        roll,
        gender: female ? 'F' : 'M',
        attendance: pin?.attendance ?? round1(82 + rand() * 18),
        gpa: pin?.gpa ?? round1(6.4 + rand() * 3.6),
        status: rand() > 0.965 ? 'probation' : rand() > 0.975 ? 'pending' : 'active',
        guardian: pin?.guardian ?? guardianFor(surname),
        phone: `+91 98${String(10000000 + Math.floor(rand() * 89999999))}`,
        email: pin?.email ?? `${parts[0]}.${surname}@northview.edu`.toLowerCase(),
        house: pin?.house ?? pick(HOUSES),
        joined: `${2019 + Math.floor(rand() * 6)}-0${1 + Math.floor(rand() * 8)}-${10 + Math.floor(rand() * 18)}`,
      });
    }
  }
  return list;
}

export const STUDENTS: Student[] = buildStudents();

/** Students of a canonical class key such as 'Grade 10-B', ordered by roll. */
export function studentsOf(className: string): Student[] {
  const grade = className.slice(0, -2);
  const section = className.slice(-1);
  return STUDENTS
    .filter((s) => s.grade === grade && s.section === section)
    .sort((a, b) => a.roll.localeCompare(b.roll));
}

export const ACTIVE_STUDENTS = STUDENTS.filter((s) => s.status === 'active').length;

/* ---------------- Teachers ---------------- */


const tierSubjects = (senior: boolean): string[] =>
  senior
    ? ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Geography', 'Computer Science', 'Economics', 'Art', 'Hindi']
    : ['Mathematics', 'English', 'Computer Science', 'Art', 'Hindi', 'General Science', 'Social Science'];

function pickExtras(from: string[], exclude: string, count: number): string[] {
  const pool = from.filter((c) => c !== exclude);
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const c = pick(pool);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function buildTeachers(): Teacher[] {
  const list: Teacher[] = [];
  // One class teacher per canonical class, aligned with CLASS_ORDER.
  CLASS_ORDER.forEach(({ key }, i) => {
    const pin = TEACHER_PINS.find((p) => p.homeroom === key);
    const senior = SENIOR_KEYS.includes(key);
    const name = pin?.name ?? uniqueName(rand() > 0.5 ? FIRST_F : FIRST_M);
    const subject = pin?.subject ?? pick(tierSubjects(senior));
    // Rohan Sen is the only Physics teacher assigned to Grade 10-B (his scope class).
    const pool = (senior ? SENIOR_KEYS : MIDDLE_KEYS)
      .filter((c) => subject !== 'Physics' || c !== 'Grade 10-B' || pin?.name === 'Rohan Sen');
    // Pinned teachers cover their assignments' classes: Rohan drafts for 10-A,
    // Arjun sets 10-B English, Kavita sets 12-C Chemistry.
    const extras = pin?.name === 'Rohan Sen'
      ? ['Grade 10-B', 'Grade 10-A']
      : pin?.name === 'Arjun Mehta'
        ? ['Grade 10-B', ...pickExtras(pool.filter((c) => c !== 'Grade 10-B'), key, 1)]
        : pin?.name === 'Kavita Rao'
          ? ['Grade 12-C', ...pickExtras(pool.filter((c) => c !== 'Grade 12-C'), key, 1)]
          : pickExtras(pool, key, senior ? 2 : 1);
    const classes = [key, ...extras];
    list.push({
      id: `T-${100 + i}`,
      name,
      initials: initialsOf(name),
      subject,
      classes,
      load: 12 + Math.floor(rand() * 10),
      status: pin ? 'full-time' : rand() > 0.9 ? 'leave' : rand() > 0.8 ? 'part-time' : 'full-time',
      email: pin?.email ?? `${name.split(' ')[0]}.${name.split(' ').slice(-1)[0]}@northview.edu`.toLowerCase(),
      phone: `+91 98${String(10000000 + Math.floor(rand() * 89999999))}`,
      dept: SUBJECT_DEPT[subject],
      experience: 2 + Math.floor(rand() * 18),
      rating: round1(3.9 + rand() * 1.1),
    });
  });
  // Specialists guarantee every canonical subject is taught and every
  // assignment's (subject, class) pair has a real teacher.
  const specialistNeeds: Array<[string, string]> = [
    ['Computer Science', 'Grade 11-B'],
    ['Geography', 'Grade 9-A'],
    ['Economics', 'Grade 12-A'],
  ];
  for (let k = 0; k < 15; k++) {
    const subject = SUBJECTS[k % SUBJECTS.length];
    const need = specialistNeeds.find(([s]) => s === subject);
    const eligible = subject === 'Physics'
      ? eligibleKeys(subject).filter((c) => c !== 'Grade 10-B')
      : eligibleKeys(subject);
    const forced = need ? need[1] : eligible[Math.floor(rand() * eligible.length)];
    const name = uniqueName(rand() > 0.5 ? FIRST_F : FIRST_M);
    list.push({
      id: `T-${200 + k}`,
      name,
      initials: initialsOf(name),
      subject,
      classes: [forced, ...pickExtras(eligible, forced, 1)],
      load: 10 + Math.floor(rand() * 8),
      status: rand() > 0.92 ? 'leave' : 'full-time',
      email: `${name.split(' ')[0]}.${name.split(' ').slice(-1)[0]}@northview.edu`.toLowerCase(),
      phone: `+91 98${String(10000000 + Math.floor(rand() * 89999999))}`,
      dept: SUBJECT_DEPT[subject],
      experience: 2 + Math.floor(rand() * 18),
      rating: round1(3.9 + rand() * 1.1),
    });
  }
  return list;
}

export const TEACHERS: Teacher[] = buildTeachers();

export function teacherBySubject(subject: string): Teacher {
   
  return TEACHERS.find((t) => t.subject === subject) as Teacher;
}

/** The teacher of `subject` assigned to `className`. The subject lead takes
    the class on when nobody is assigned yet, so the reference is always valid. */
export function teacherFor(subject: string, className: string): Teacher {
  const direct = TEACHERS.find((t) => t.subject === subject && t.classes.includes(className));
  if (direct) return direct;
  const lead = teacherBySubject(subject);
  if (!lead.classes.includes(className)) lead.classes.push(className);
  return lead;
}

/** Faculty names that mirror the backend demo feed. */
export const FEED_FACULTY_NAMES = [
  'Rohan Sen', 'Meera Iyer', 'Arjun Mehta',
  'Amit Verma', 'Priya Nair', 'Arjun Das',
];

/* ---------------- Classes (derived from students + class teachers) ---------------- */

export const CLASSES: SchoolClass[] = CLASS_ORDER.map(({ grade, section, key }, i) => {
  const pupils = studentsOf(key);
  const avg = pupils.reduce((a, s) => a + s.gpa, 0) / pupils.length;
  return {
    id: `CLS-${grade.replace('Grade ', '')}${section}`,
    name: `Grade ${grade.replace('Grade ', '')} · Section ${section}`,
    grade,
    section,
    teacher: TEACHERS[i].name,
    students: pupils.length,
    room: `${100 + Math.floor(rand() * 40)}`,
    avg: round1(avg * 10),
    trend: Array.from({ length: 8 }, () => Math.round(70 + rand() * 26)),
  };
});

export function classTeacherOf(className: string): string {
  return CLASSES.find((c) => `${c.grade}-${c.section}` === className)?.teacher ?? '';
}


export const FACILITIES = [
  { name: 'Main Building', kind: 'Building' },
  { name: 'Classroom Block A', kind: 'Classrooms' },
  { name: 'Science Laboratories', kind: 'Laboratories' },
  { name: 'Central Library', kind: 'Library' },
  { name: 'Ground Floor Restrooms', kind: 'Restrooms' },
  { name: 'Sports Complex', kind: 'Sports facilities' },
  { name: 'Electrical Systems', kind: 'Electrical systems' },
  { name: 'HVAC Plant', kind: 'HVAC' },
  { name: 'Auditorium', kind: 'Other school facilities' },
];

/* ---------------- Assignments + submissions ---------------- */

interface AssignmentSpec {
  id: string; title: string; subject: string; class: string;
  teacher: string; dueOffset: number; submitted: number;
  status?: 'draft' | 'closed';
}

const ASG_SPECS: AssignmentSpec[] = [
  { id: 'ASG-101', title: 'Quadratic Functions Problem Set', subject: 'Mathematics', class: 'Grade 10-B', teacher: 'Meera Iyer', dueOffset: 3, submitted: 30 },
  { id: 'ASG-102', title: 'Thermodynamics Lab Report', subject: 'Physics', class: 'Grade 11-A', teacher: 'Rohan Sen', dueOffset: 2, submitted: 26 },
  { id: 'ASG-103', title: 'Essay: The Partition Narratives', subject: 'English', class: 'Grade 10-B', teacher: 'Arjun Mehta', dueOffset: 1, submitted: 33 },
  { id: 'ASG-104', title: 'Organic Chemistry Worksheet 4', subject: 'Chemistry', class: 'Grade 12-C', teacher: 'Kavita Rao', dueOffset: -10, submitted: 22 },
  { id: 'ASG-105', title: 'Sorting Algorithms Implementation', subject: 'Computer Science', class: 'Grade 11-B', teacher: teacherFor('Computer Science', 'Grade 11-B').name, dueOffset: 5, submitted: 12 },
  { id: 'ASG-106', title: 'Map Work: River Systems of India', subject: 'Geography', class: 'Grade 9-A', teacher: teacherFor('Geography', 'Grade 9-A').name, dueOffset: 4, submitted: 5 },
  { id: 'ASG-107', title: 'Draft: Annual Science Exhibition', subject: 'Physics', class: 'Grade 10-A', teacher: 'Rohan Sen', dueOffset: 8, submitted: 0, status: 'draft' },
  { id: 'ASG-108', title: 'Balance Sheet Analysis', subject: 'Economics', class: 'Grade 12-A', teacher: teacherFor('Economics', 'Grade 12-A').name, dueOffset: -14, submitted: 33, status: 'closed' },
];

export const SUBMISSIONS: Submission[] = (() => {
  const out: Submission[] = [];
  let seq = 0;
  ASG_SPECS.forEach((spec, k) => {
    if (spec.submitted === 0) return;
    const pupils = studentsOf(spec.class).slice(0, spec.submitted);
    const due = dateAt(spec.dueOffset);
    pupils.forEach((s, j) => {
      seq++;
      const h = j + k * 3;
      const status: Submission['status'] = h % 9 === 4 ? 'missing' : h % 7 === 3 ? 'late' : h % 3 === 0 ? 'graded' : 'on-time';
      const stamp = new Date(due.getTime() - (1 + (j % 5)) * DAY);
      out.push({
        id: `SUB-${String(seq).padStart(3, '0')}`,
        assignment: spec.title,
        assignmentId: spec.id,
        student: s.name,
        studentId: s.id,
        submittedAt: status === 'missing' ? '—' : `${fmtShort(stamp)}, ${String(8 + (j % 10)).padStart(2, '0')}:${String(10 + ((j * 7) % 49))} AM`,
        status,
        score: status === 'graded' ? 68 + ((j * 5 + k) % 30) : null,
        max: 100,
      });
    });
  });
  return out;
})();

export const ASSIGNMENTS: Assignment[] = ASG_SPECS.map((spec) => {
  const records = SUBMISSIONS.filter((s) => s.assignment === spec.title);
  const grades = records.map((r) => r.score).filter((g): g is number => g !== null);
  const due = dateAt(spec.dueOffset);
  const status: Assignment['status'] = spec.status ?? (spec.dueOffset < 0 ? 'overdue' : 'published');
  const dueLabel =
    status === 'draft' ? 'Draft' :
    status === 'closed' ? `Closed ${fmtShort(due)}` :
    spec.dueOffset < 0 ? `Overdue by ${-spec.dueOffset} days` :
    spec.dueOffset === 0 ? 'Due today' : `Due ${fmtShort(due)}`;
  return {
    id: spec.id,
    title: spec.title,
    subject: spec.subject,
    class: spec.class,
    teacher: spec.teacher,
    due: isoAt(spec.dueOffset),
    dueLabel,
    status,
    submitted: records.length,
    total: studentsOf(spec.class).length,
    avgScore: grades.length > 0 ? Math.round(grades.reduce((a, g) => a + g, 0) / grades.length) : null,
  };
});

/* ---------------- Timetable (canonical subjects, rooms, teachers) ---------------- */

export const TT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const TT_PERIODS = [
  '08:00–08:45', '08:50–09:35', '09:50–10:35', '10:40–11:25',
  '11:40–12:25', '12:30–13:15', '13:45–14:30', '14:35–15:20',
];
/** Minutes-since-midnight clock parallel to TT_PERIODS (live-period detection). */
export const TT_CLOCK = [
  { start: 480, end: 525 }, { start: 530, end: 575 }, { start: 590, end: 635 },
  { start: 640, end: 685 }, { start: 700, end: 745 }, { start: 750, end: 795 },
  { start: 825, end: 870 }, { start: 875, end: 920 },
];
/** '08:00 – 15:20' derived from the period table. */
export const SCHOOL_DAY_RANGE = `${TT_PERIODS[0].slice(0, 5)} – ${TT_PERIODS[TT_PERIODS.length - 1].slice(-5)}`;

const TT_SUBJECTS: string[][] = [
  ['Mathematics', 'English', 'Biology', 'Biology', 'History', 'Art', 'Hindi', 'Computer Science'],
  ['Physics', 'Mathematics', 'Chemistry', 'Chemistry', 'Geography', 'English', 'Art', 'Economics'],
  ['English', 'Biology', 'Mathematics', 'Physics', 'Computer Science', 'Economics', 'Geography', 'Hindi'],
  ['Chemistry', 'Physics', 'Biology', 'Biology', 'Mathematics', 'Hindi', 'Economics', 'History'],
  ['History', 'English', 'Physics', 'Mathematics', 'Computer Science', 'Art', 'Geography', 'Hindi'],
];
const ROOM_FOR_SUBJECT: Record<string, string> = {
  Biology: 'Science Lab', Chemistry: 'Science Lab', Physics: 'Science Lab',
  'Computer Science': 'E-Lab', Art: 'Art Studio', Sports: 'Sports Complex',
};
const KIND_FOR_SUBJECT: Record<string, TimetableSlot['kind']> = {
  Physics: 'lab', Chemistry: 'lab', Biology: 'lab', 'Computer Science': 'lab',
  Art: 'arts', Sports: 'sports',
};

export const TIMETABLE: TimetableSlot[] = TT_DAYS.flatMap((day, d) =>
  TT_PERIODS.map((time, i) => {
    const subject = TT_SUBJECTS[d][i];
    const teacher = teacherFor(subject, 'Grade 10-B').name;
    return {
      day,
      period: i + 1,
      time,
      subject,
      teacher,
      room: ROOM_FOR_SUBJECT[subject] ?? 'Room 204',
      class: 'Grade 10-B',
      kind: KIND_FOR_SUBJECT[subject] ?? 'lecture',
    };
  }),
);

/* ---------------- Attendance registers (canonical rosters) ---------------- */

export type RegisterMark = 'present' | 'absent' | 'late';

/** Morning-register roster for any canonical class; default marks are deterministic. */
export function registerFor(className: string): Array<Student & { mark: RegisterMark }> {
  return studentsOf(className).map((s, i) => ({
    ...s,
    mark: (i % 17 === 5 ? 'absent' : i % 11 === 3 ? 'late' : 'present') as RegisterMark,
  }));
}

export const ATTENDANCE_ROSTER = registerFor('Grade 10-B');

/** Whole-school week trend, anchored on the mean of student attendance records. */
export const ATTENDANCE_WEEK = (() => {
  const mean = STUDENTS.reduce((a, s) => a + s.attendance, 0) / STUDENTS.length;
  const offsets = [-1.1, 0.4, -0.3, 0.9, -0.6, 0.2];
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => ({
    day,
    present: Math.round((mean + offsets[i]) * 10) / 10,
  }));
})();

/* ---------------- Parents (one record per student + pinned father) ---------------- */

export const PARENTS = (() => {
  const recs = STUDENTS.map((s, i) => ({
    id: `PAR-${500 + i}`,
    name: s.guardian,
    initials: initialsOf(s.guardian),
    child: s.name,
    childId: s.id,
    relation: FIRST_F.includes(s.guardian.split(' ')[0]) ? 'Mother' : 'Father',
    phone: s.phone,
    email: `${s.guardian.toLowerCase().replace(/\s+/g, '.')}@mail.com`,
    occupation: pick(['Doctor', 'Engineer', 'Professor', 'Banker', 'Designer', 'Civil Servant']),
  }));
  // Second guardian of the student persona — mirrors the backend parent login.
  recs.push({
    id: `PAR-${500 + recs.length}`,
    name: 'Guardian Dutta',
    initials: 'GD',
    child: 'Ishita Dutta',
    childId: 'NV-2024014',
    relation: 'Father',
    phone: recs.find((r) => r.childId === 'NV-2024014')?.phone ?? '',
    email: 'parent@example.com',
    occupation: 'Engineer',
  });
  return recs;
})();

/* ---------------- Applicants (prospective families, pre-enrolment) ---------------- */

export type ApplicantStage = 'Enquiry' | 'Application' | 'Assessment' | 'Interview' | 'Offered' | 'Enrolled';

export interface Applicant {
  id: string; name: string; grade: string; source: string; score: number; stage: ApplicantStage;
}

const APPLICANT_SOURCES = ['Open Day', 'Website', 'Referral', 'Camp'];
const APPLICANT_STAGES: ApplicantStage[] = [
  ...Array<ApplicantStage>(14).fill('Enquiry'),
  ...Array<ApplicantStage>(11).fill('Application'),
  ...Array<ApplicantStage>(9).fill('Assessment'),
  ...Array<ApplicantStage>(6).fill('Interview'),
  ...Array<ApplicantStage>(5).fill('Offered'),
  ...Array<ApplicantStage>(3).fill('Enrolled'),
];

function applicantGrade(): string {
  const r = rand();
  if (r < 0.6) return 'Grade 6';
  if (r < 0.78) return 'Grade 7';
  if (r < 0.9) return 'Grade 8';
  return 'Grade 9';
}

export const APPLICANTS: Applicant[] = APPLICANT_STAGES.map((stage, i) => ({
  id: `APP-${String(i + 1).padStart(3, '0')}`,
  name: uniqueName(rand() > 0.5 ? FIRST_F : FIRST_M),
  grade: applicantGrade(),
  source: APPLICANT_SOURCES[i % APPLICANT_SOURCES.length],
  score: 62 + Math.floor(rand() * 37),
  stage,
}));

/** Academic session containing today (April–March), e.g. '2026–27'. */
export const INTAKE_LABEL = (() => {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}–${String(y + 1).slice(2)}`;
})();

/** Grade 6 seats for the session; remaining = capacity minus enrolled offers. */
export const GRADE6_SEATS = 120;
export const SEATS_REMAINING = GRADE6_SEATS - APPLICANTS.filter((a) => a.stage === 'Enrolled').length;

/* ---------------- Notifications (with deep links) ---------------- */

const pending102 = (() => {
  const a = ASSIGNMENTS.find((x) => x.id === 'ASG-102');
  return a ? a.total - a.submitted : 0;
})();

export const NOTIFICATIONS: Notification[] = [
  { id: 'n1', title: 'Unit Test II begins Monday', body: `Grade 10 unit tests begin ${fmtShort(dateAt(4))}. Date-sheet is live in Timetable.`, time: '12 min ago', kind: 'academic', read: false, priority: 'high', audience: ['school-admin', 'teacher', 'student', 'parent'], ref: { route: 'timetable' } },
  { id: 'n2', title: 'Ishita Dutta marked present', body: 'Grade 10-B · Period 1 · Biology · 08:04 AM', time: '38 min ago', kind: 'attendance', read: false, priority: 'normal', audience: ['student', 'parent'], ref: { route: 'attendance' } },
  { id: 'n3', title: 'Lab report due in 2 days', body: `Thermodynamics Lab Report · Grade 11-A · ${pending102} submissions still pending.`, time: '1 hr ago', kind: 'academic', read: false, priority: 'high', audience: ['school-admin', 'teacher', 'student', 'parent'], ref: { route: 'assignments' } },
  { id: 'n4', title: 'Substitute request approved', body: 'Arjun Mehta covers Grade 11-B English tomorrow.', time: '2 hr ago', kind: 'system', read: false, priority: 'normal', audience: ['teacher'], ref: { route: 'overview' } },
  { id: 'n5', title: 'Inter-house athletics finals', body: `${fmtShort(dateAt(6))} · Main ground · Houses report by 8:30 AM.`, time: '3 hr ago', kind: 'event', read: false, priority: 'normal', audience: ['school-admin', 'teacher', 'student', 'parent'], ref: { route: 'timetable' } },
  { id: 'n6', title: 'Fee receipts verified', body: 'September fee cycle closed. 12 pending reminders queued.', time: '5 hr ago', kind: 'fee', read: false, priority: 'normal', audience: ['school-admin'], ref: { route: 'students-admissions' } },
  { id: 'n7', title: 'E-Lab contest: Code Autumn', body: `Starts ${fmtShort(dateAt(1))} · 5 problems · House leaderboard live.`, time: 'Yesterday', kind: 'event', read: false, priority: 'normal', audience: ['student'], ref: { route: 'elab' } },
  { id: 'n8', title: 'New admission enquiry', body: 'Grade 6 enquiry from the Mukherjee family assigned to you.', time: 'Yesterday', kind: 'system', read: false, priority: 'normal', audience: ['teacher'], ref: { route: 'students-admissions' } },
  { id: 'n9', title: 'Maintenance window', body: 'E-Lab servers patch Sunday 2–4 AM. No downtime expected.', time: '2 days ago', kind: 'system', read: true, priority: 'normal', audience: ['school-admin', 'teacher', 'student', 'parent'], ref: { route: 'overview' } },
];

/* ---------------- Files, E-Lab week, upcoming ---------------- */

export const FILES: FileItem[] = [
  { id: 'F-01', name: 'Unit Test II Date-sheet.pdf', kind: 'pdf', size: '1.2 MB', modified: '2 days ago', owner: 'Ananya Rao', shared: 108, starred: true },
  { id: 'F-02', name: 'Thermodynamics Lab Manual.pdf', kind: 'pdf', size: '8.4 MB', modified: '3 days ago', owner: 'Rohan Sen', shared: 36, starred: false },
  { id: 'F-03', name: 'Quadratic Functions Slides.pptx', kind: 'slide', size: '4.1 MB', modified: '5 days ago', owner: 'Meera Iyer', shared: 36, starred: true },
  { id: 'F-04', name: 'Inter-house Athletics Circular.pdf', kind: 'pdf', size: '640 KB', modified: '1 week ago', owner: 'Kiran Desai', shared: 756, starred: false },
  { id: 'F-05', name: 'Fee Receipts — September.csv', kind: 'sheet', size: '212 KB', modified: '1 week ago', owner: 'Ananya Rao', shared: 2, starred: false },
];

export const ELAB_WEEK = [
  { d: 'M', min: 42 }, { d: 'T', min: 58 }, { d: 'W', min: 35 }, { d: 'T', min: 71 }, { d: 'F', min: 64 }, { d: 'S', min: 28 }, { d: 'S', min: 0 },
];

export const UPCOMING_EVENTS = [
  { date: fmtShort(dateAt(1)), title: 'Code Autumn · E-Lab Contest', tag: 'All grades · contest', tone: 'high' as const },
  { date: fmtShort(dateAt(3)), title: 'Unit Test I — Mathematics', tag: 'Grade 10-B · 09:00 AM', tone: 'high' as const },
  { date: fmtShort(dateAt(4)), title: 'Unit Test II begins', tag: 'Grade 10 · date-sheet live', tone: 'high' as const },
  { date: fmtShort(dateAt(6)), title: 'Inter-house Athletics Finals', tag: 'Main ground · 8:30 AM', tone: 'normal' as const },
  { date: fmtShort(dateAt(10)), title: 'Science Exhibition — Round 1', tag: 'Grade 11 · Science Labs', tone: 'normal' as const },
  { date: fmtShort(dateAt(15)), title: 'Parent-teacher conference', tag: 'Grade 10 · Main Hall', tone: 'normal' as const },
];

/* ---------------- Charts (derived from canonical records) ---------------- */

export const PERFORMANCE_BY_SUBJECT = [
  { subject: 'Mathematics', avg: 84, target: 85 }, { subject: 'Physics', avg: 82, target: 84 },
  { subject: 'Chemistry', avg: 81, target: 83 }, { subject: 'Biology', avg: 83, target: 84 },
  { subject: 'English', avg: 86, target: 85 }, { subject: 'History', avg: 79, target: 83 },
  { subject: 'Geography', avg: 80, target: 83 }, { subject: 'Computer Science', avg: 88, target: 86 },
  { subject: 'Economics', avg: 81, target: 84 }, { subject: 'Art', avg: 87, target: 86 },
  { subject: 'General Science', avg: 82, target: 84 }, { subject: 'Social Science', avg: 80, target: 83 },
  { subject: 'Hindi', avg: 83, target: 85 },
];

export const SUBJECT_LIST = SUBJECTS.map((name) => {
  const teachers = TEACHERS.filter((t) => t.subject === name);
  const perf = PERFORMANCE_BY_SUBJECT.find((p) => p.subject === name);
  return {
    code: `${SUBJECT_CODE[name]}-${SUBJECT_TIER[name] === 'middle' ? '07' : '10'}`,
    name,
    dept: SUBJECT_DEPT[name],
    classes: new Set(teachers.flatMap((t) => t.classes)).size,
    teachers: teachers.length,
    avg: perf?.avg ?? 80,
  };
});

const GRADE_BANDS: Array<[string, number, number]> = [
  ['A+ (9–10)', 9, 10.01], ['A (8–9)', 8, 9], ['B (7–8)', 7, 8], ['C (6–7)', 6, 7], ['D (<6)', 0, 6],
];
export const GRADE_DIST = GRADE_BANDS.map(([band, lo, hi]) => ({
  band,
  count: STUDENTS.filter((s) => s.gpa >= lo && s.gpa < hi).length,
}));

export const HOUSE_POINTS = HOUSES.map((house) => {
  const members = STUDENTS.filter((s) => s.house === house);
  const mean = members.reduce((a, s) => a + s.gpa, 0) / Math.max(1, members.length);
  return { house, points: Math.round(mean * 160) };
});

const ENROL_DELTAS = [34, 116, 82, 36, 23];
const ENROL_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const ENROL_ADMISSIONS = [120, 210, 260, 180, 96, 64];
/** Strength trend anchored on the live active-student count (September = today). */
export const ENROLMENT_TREND = (() => {
  const values: number[] = [ACTIVE_STUDENTS];
  for (let k = ENROL_DELTAS.length - 1; k >= 0; k--) values.unshift(values[0] - ENROL_DELTAS[k]);
  return ENROL_MONTHS.map((m, i) => ({ m, students: values[i], admissions: ENROL_ADMISSIONS[i] }));
})();
export const ADMISSIONS_SERIES = ENROL_ADMISSIONS;

/** Fee collection % by month (no fee ledger is modelled; September is in progress). */
export const FEE_COLLECTION = [
  { m: 'Apr', collected: 96 }, { m: 'May', collected: 97 }, { m: 'Jun', collected: 95 },
  { m: 'Jul', collected: 98 }, { m: 'Aug', collected: 97 }, { m: 'Sep', collected: 89 },
];

export const BIRTHDAYS = [
  { name: 'Ishita Dutta', detail: 'Grade 10-B · turns 16', initials: 'ID' },
  { name: 'Kavita Rao', detail: 'Chemistry · 12 yrs at Northview', initials: 'KR' },
  { name: 'Arjun Mehta', detail: 'English · 8 yrs at Northview', initials: 'AM' },
];

/* ---------------- E-Lab problems ---------------- */

const PY_SUM = 'n = int(input())\narr = list(map(int, input().split()))\n# print the sum\n';
const JS_SUM = 'const fs = require("fs");\nconst data = fs.readFileSync(0, "utf-8").trim().split(/\\s+/).map(Number);\n// print the sum\n';

export const LAB_PROBLEMS: LabProblem[] = [
  {
    id: 'p1', code: 'EL-101', title: 'Sum of Array', difficulty: 'Easy', topic: 'arrays',
    acceptance: 92, solved: true, attempted: true,
    description: 'Read N followed by N integers and print their sum.',
    examples: [{ input: '5\n1 2 3 4 5', output: '15', explanation: '1+2+3+4+5 = 15.' }],
    constraints: ['1 ≤ N ≤ 10^5', '|Ai| ≤ 10^9'],
    starter: { python: PY_SUM, javascript: JS_SUM },
    tests: [
      { input: '5 1 2 3 4 5', expected: '15' },
      { input: '3 10 -2 1', expected: '9' },
      { input: '1 100', expected: '100' },
      { input: '4 0 0 0 0', expected: '0' },
    ],
  },
  {
    id: 'p2', code: 'EL-102', title: 'Palindrome Check', difficulty: 'Easy', topic: 'strings',
    acceptance: 88, solved: true, attempted: true,
    description: 'Given a string S, print YES if it reads the same forwards and backwards, else NO.',
    examples: [{ input: 'madam', output: 'YES', explanation: '“madam” reversed is “madam”.' }],
    constraints: ['1 ≤ |S| ≤ 10^5', 'S contains lowercase letters only'],
    starter: {
      python: 's = input().strip()\n# print YES or NO\n',
      javascript: 'const fs = require("fs");\nconst s = fs.readFileSync(0, "utf-8").trim();\n// print YES or NO\n',
    },
    tests: [
      { input: 'madam', expected: 'YES' },
      { input: 'school', expected: 'NO' },
      { input: 'a', expected: 'YES' },
      { input: 'naman', expected: 'YES' },
      { input: 'house', expected: 'NO' },
    ],
  },
  {
    id: 'p3', code: 'EL-103', title: 'Attendance Streak', difficulty: 'Medium', topic: 'arrays',
    acceptance: 64, solved: false, attempted: true,
    description: 'Given N days of attendance (1 present, 0 absent), print the longest streak of consecutive present days.',
    examples: [{ input: '7\n1 1 0 1 1 1 0', output: '3', explanation: 'Days 4–6 form the longest streak of 3.' }],
    constraints: ['1 ≤ N ≤ 10^5'],
    starter: {
      python: 'n = int(input())\narr = list(map(int, input().split()))\n# print the longest streak\n',
      javascript: 'const fs = require("fs");\nconst data = fs.readFileSync(0, "utf-8").trim().split(/\\s+/).map(Number);\n// print the longest streak\n',
    },
    tests: [
      { input: '7 1 1 0 1 1 1 0', expected: '3' },
      { input: '5 1 1 1 1 1', expected: '5' },
      { input: '4 0 0 1 0', expected: '1' },
    ],
  },
  {
    id: 'p4', code: 'EL-104', title: 'Top Two Houses', difficulty: 'Medium', topic: 'sorting',
    acceptance: 71, solved: false, attempted: false,
    description: 'Given each house total, print the top two houses by points.',
    examples: [{ input: 'house totals', output: 'top two houses', explanation: 'Sort descending, take two.' }],
    constraints: ['4 houses', 'points fit in 32-bit ints'],
    starter: {
      python: '# read house totals, print the top two\n',
      javascript: '// read house totals, print the top two\n',
    },
    tests: [
      { input: 'Raman=180 Tagore=170', expected: 'Raman Tagore' },
      { input: 'Ashoka=200 Kalam=190', expected: 'Ashoka Kalam' },
      { input: 'Kalam=150 Raman=160', expected: 'Raman Kalam' },
    ],
  },
  {
    id: 'p5', code: 'EL-105', title: 'Timetable Clash Detector', difficulty: 'Hard', topic: 'intervals',
    acceptance: 43, solved: false, attempted: false,
    description: 'Given period intervals for each class, detect whether any teacher is double-booked.',
    examples: [{ input: 'slots…', output: 'OK or CLASH', explanation: 'No teacher may own two slots at once.' }],
    constraints: ['1 ≤ slots ≤ 500'],
    starter: {
      python: '# read slots, print OK or CLASH\n',
      javascript: '// read slots, print OK or CLASH\n',
    },
    tests: [
      { input: '2 P1-Maths P2-Physics', expected: 'OK' },
      { input: '2 P1-Maths P1-Physics', expected: 'CLASH' },
      { input: '3 P1-M P2-P P3-C', expected: 'OK' },
      { input: '3 P1-M P1-P P2-C', expected: 'CLASH' },
      { input: '1 P4-Bio', expected: 'OK' },
      { input: '4 P1-M P2-M P3-M P3-P', expected: 'CLASH' },
    ],
  },
  {
    id: 'p6', code: 'EL-106', title: 'Class Average', difficulty: 'Easy', topic: 'math',
    acceptance: 95, solved: false, attempted: false,
    description: 'Given marks of N students, print the class average rounded to one decimal.',
    examples: [{ input: '4\n78 92 85 90', output: '86.2', explanation: '(78+92+85+90)/4 = 86.25 → 86.2.' }],
    constraints: ['1 ≤ N ≤ 200', '0 ≤ marks ≤ 100'],
    starter: {
      python: 'n = int(input())\nmarks = list(map(int, input().split()))\n# print the average\n',
      javascript: 'const fs = require("fs");\nconst data = fs.readFileSync(0, "utf-8").trim().split(/\\s+/).map(Number);\n// print the average\n',
    },
    tests: [
      { input: '4 78 92 85 90', expected: '86.2' },
      { input: '2 100 0', expected: '50.0' },
      { input: '3 81 81 81', expected: '81.0' },
    ],
  },
];

// EL-104 works the canonical house table: the example is computed,
// so it can never drift from the standings.
{
  const top2 = [...HOUSE_POINTS].sort((a, b) => b.points - a.points).slice(0, 2);
  const el104 = LAB_PROBLEMS.find((p) => p.id === 'p4');
  if (el104) {
    const table = HOUSE_POINTS.map((h) => `${h.house}=${h.points}`).join(' ');
    el104.examples = [{ input: table, output: top2.map((h) => h.house).join(' '), explanation: 'Sort descending, take two.' }];
  }
}

/* ---------------- Leave (canonical applicants + approvers) ---------------- */

const studentByName = (name: string): Student => STUDENTS.find((s) => s.name === name) as Student;
const teacherByName = (name: string): Teacher => TEACHERS.find((t) => t.name === name) as Teacher;

const leaveRec = (
  id: string, applicant: Student | Teacher, role: 'student' | 'teacher',
  approverName: string, fromOff: number, toOff: number,
  reason: string, status: LeaveApplication['status'], note: string | null = null,
): LeaveApplication => ({
  id,
  applicantId: applicant.id,
  applicantName: applicant.name,
  applicantRole: role,
  approverName,
  from: isoAt(fromOff),
  to: isoAt(toOff),
  days: toOff - fromOff + 1,
  reason,
  status,
  note,
});

export const LEAVE_APPLICATIONS: LeaveApplication[] = [
  leaveRec('L-101', studentByName('Ishita Dutta'), 'student', 'Meera Iyer', -20, -19, 'Viral fever · medical certificate attached', 'approved'),
  leaveRec('L-102', studentByName('Ishita Dutta'), 'student', 'Meera Iyer', 5, 5, 'Family event out of station', 'pending'),
  leaveRec('L-103', studentByName('Aarav Dutta'), 'student', classTeacherOf('Grade 7-A'), -12, -12, 'Dental appointment', 'approved'),
  leaveRec('L-104', studentByName('Aarav Dutta'), 'student', classTeacherOf('Grade 7-A'), 3, 5, 'Cousin’s wedding in Delhi', 'rejected', 'Term tests that week — please apply for 1 day only.'),
  leaveRec('L-105', studentByName('Priya Sharma'), 'student', 'Amit Verma', 2, 3, 'Inter-school debate travel', 'pending'),
  leaveRec('L-108', studentByName('Pari Shah'), 'student', 'Priya Nair', -6, -5, 'Fever · rested at home', 'approved'),
  leaveRec('L-109', studentByName('Navya Pillai'), 'student', 'Priya Nair', 4, 4, 'Sibling’s recital', 'pending'),
  leaveRec('L-106', teacherByName('Rohan Sen'), 'teacher', 'Ananya Rao', 6, 7, 'CBSE physics workshop, Delhi', 'pending'),
  leaveRec('L-107', teacherByName('Meera Iyer'), 'teacher', 'Ananya Rao', -8, -8, 'Bank work', 'approved'),
  leaveRec('L-110', teacherByName('Arjun Mehta'), 'teacher', 'Ananya Rao', 9, 13, 'Family vacation', 'rejected', 'Exceeds casual leave — convert to earned leave via HR.'),
];

export const LEAVE_QUOTA = 12;

export function leaveFor(studentId: string): LeaveApplication[] {
  return LEAVE_APPLICATIONS
    .filter((l) => l.applicantId === studentId)
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** Casual-leave balance: quota minus approved days taken. */
export function leavesLeftFor(studentId: string): number {
  const taken = LEAVE_APPLICATIONS
    .filter((l) => l.applicantId === studentId && l.status === 'approved')
    .reduce((a, l) => a + l.days, 0);
  return LEAVE_QUOTA - taken;
}

export function pendingLeaveFor(approverName: string): LeaveApplication[] {
  return LEAVE_APPLICATIONS.filter((l) => l.approverName === approverName && l.status === 'pending');
}

export function approvedLeavesFor(approverName: string): LeaveApplication[] {
  return LEAVE_APPLICATIONS.filter((l) => l.approverName === approverName && l.status !== 'pending');
}
