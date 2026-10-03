export type Role = 'super-admin' | 'school-admin' | 'teacher' | 'student' | 'parent';

export interface RoleMeta {
  id: Role;
  label: string;
  description: string;
  initials: string;
  name: string;
  email: string;
}

export type RouteId =
  | 'overview'
  /* platform (super-admin) */
  | 'schools' | 'tenants' | 'users' | 'subscriptions'
  | 'feature-flags' | 'platform-analytics' | 'audit-logs' | 'system-settings'
  /* school */
  | 'students-directory' | 'students-admissions' | 'students-performance'
  | 'teachers-faculty' | 'teachers-staff'
  | 'parents' | 'classes-classes' | 'subjects'
  | 'my-classes' | 'my-children'
  | 'attendance' | 'assignments' | 'submissions' | 'grades'
  | 'timetable' | 'elab' | 'files' | 'notifications' | 'settings'
  | 'maintenance'
  | 'leave-management'
  | 'student-flags';

export interface TreeChild {
  id: RouteId;
  label: string;
  mono: string;
}

export interface TreeNode {
  id: string;
  label: string;
  icon: string;
  route?: RouteId;
  children?: TreeChild[];
}

export interface Student {
  id: string;
  name: string;
  initials: string;
  grade: string;
  section: string;
  roll: string;
  gender: 'F' | 'M';
  attendance: number;
  gpa: number;
  status: 'active' | 'probation' | 'alumni' | 'pending';
  guardian: string;
  phone: string;
  email: string;
  house: string;
  joined: string;
}

export interface Teacher {
  id: string;
  name: string;
  initials: string;
  subject: string;
  dept: string;
  classes: string[];
  load: number;
  status: 'full-time' | 'part-time' | 'leave' | 'contract';
  email: string;
  phone: string;
  experience: number;
  rating: number;
}

export interface StaffMember {
  id: string;
  name: string;
  initials: string;
  role: string;
  dept: string;
  status: 'active' | 'leave' | 'contract';
  email: string;
  phone: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  grade: string;
  section: string;
  teacher: string;
  students: number;
  room: string;
  avg: number;
  trend: number[];
}

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  class: string;
  due: string;
  dueLabel: string;
  status: 'draft' | 'published' | 'closed' | 'overdue';
  submitted: number;
  total: number;
  avgScore: number | null;
  teacher: string;
}

export interface Submission {
  id: string;
  student: string;
  studentId: string;
  assignment: string;
  assignmentId: string;
  submittedAt: string;
  status: 'on-time' | 'late' | 'missing' | 'graded';
  score: number | null;
  max: number;
}

export interface TimetableSlot {
  day: string;
  period: number;
  time: string;
  subject: string;
  teacher: string;
  room: string;
  class: string;
  kind: 'lecture' | 'lab' | 'sports' | 'arts' | 'break';
}

export interface FileItem {
  id: string;
  name: string;
  kind: 'folder' | 'pdf' | 'sheet' | 'doc' | 'slide' | 'image' | 'video' | 'code';
  size: string;
  modified: string;
  owner: string;
  shared: number;
  starred: boolean;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  kind: 'academic' | 'attendance' | 'fee' | 'event' | 'system' | 'leave' | 'note' | 'flag';
  read: boolean;
  priority: 'normal' | 'high';
  audience: Role[];
  /** Deep link: clicking a notification opens its source record. Leave
   *  notifications carry the application id; note/flag notifications carry
   *  the student (and record) so the profile surface can open the exact
   *  record, not just the route. */
  ref: { route: RouteId; leaveId?: string; studentId?: string; recordId?: string; recordType?: 'note' | 'flag' };
}

export interface LeaveApplication {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantRole: 'student' | 'teacher';
  /** Class teacher for students, school admin for teachers. */
  approverName: string;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  /** Set when rejected. */
  note: string | null;
}

export interface LabProblem {
  id: string;
  code: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  topic: string;
  acceptance: number;
  solved: boolean;
  attempted: boolean;
  description: string;
  examples: { input: string; output: string; explanation: string }[];
  constraints: string[];
  starter: Record<string, string>;
  tests: { input: string; expected: string }[];
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}

/* ---------------- Platform (super-admin) ---------------- */
export type TenantStatus = 'active' | 'trial' | 'suspended' | 'churned';
export type Plan = 'Starter' | 'Growth' | 'Enterprise';

export interface Tenant {
  id: string;
  school: string;
  city: string;
  plan: Plan;
  status: TenantStatus;
  students: number;
  staff: number;
  storageGb: number;
  mrr: number;
  health: number;
  renewed: string;
  sso: boolean;
}

export interface PlatformUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: string;
  tenant: string;
  status: 'active' | 'locked' | 'invited';
  lastActive: string;
}

export interface Invoice {
  id: string;
  tenant: string;
  plan: Plan;
  amount: number;
  due: string;
  status: 'paid' | 'due' | 'overdue';
}

export interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description: string;
  staging: boolean;
  production: boolean;
  rollout: number;
  updated: string;
}

export interface AuditLog {
  id: string;
  time: string;
  actor: string;
  action: string;
  tenant: string;
  ip: string;
  result: 'allowed' | 'denied';
}
