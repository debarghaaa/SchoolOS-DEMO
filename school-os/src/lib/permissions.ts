import type { Role, RouteId, TreeNode } from './types';

/* =====================================================================
   Permission model.
   - UI reads this to GENERATE navigation and actions (never to merely
     hide unauthorized items with CSS — they are never rendered).
   - This is NOT the security boundary: the backend must independently
     enforce every permission, tenant isolation and object-level scope
     (see docs/RBAC.md). The api layer (lib/api.ts) simulates that.
   ===================================================================== */

export type Action =
  | 'student.create' | 'student.export'
  | 'teacher.invite' | 'staff.manage'
  | 'class.create' | 'subject.manage'
  | 'admission.manage'
  | 'attendance.mark' | 'attendance.export'
  | 'presence.faculty' | 'presence.staff' | 'presence.students'
  | 'maintenance.manage'
  | 'assignment.create' | 'assignment.remind'
  | 'submission.grade' | 'submission.export'
  | 'grade.publish'
  | 'assignment.submit'
  | 'leave.apply' | 'leave.approve'
  | 'flag.manage'
  | 'idcard.manage'
  | 'file.upload'
  | 'announce.send'
  | 'schoolsettings.edit'
  | 'tenant.create' | 'tenant.manage'
  | 'platformuser.manage'
  | 'billing.manage'
  | 'flag.manage'
  | 'audit.read'
  | 'systemsettings.edit';

const ROLE_ACTIONS: Record<Role, Action[]> = {
  'super-admin': [
    'tenant.create', 'tenant.manage', 'platformuser.manage', 'billing.manage',
    'flag.manage', 'audit.read', 'systemsettings.edit', 'announce.send',
  ],
  'school-admin': [
    'student.create', 'student.export', 'teacher.invite', 'staff.manage',
    'class.create', 'subject.manage', 'admission.manage',
    'attendance.export',
    'presence.faculty', 'presence.staff', 'maintenance.manage',
    'assignment.create', 'assignment.remind', 'submission.grade', 'submission.export',
    'grade.publish', 'file.upload', 'announce.send', 'schoolsettings.edit',
    'leave.approve', 'flag.manage', 'idcard.manage',
  ],
  teacher: [
    'attendance.mark', 'attendance.export', 'presence.students',
    'assignment.create', 'assignment.remind', 'submission.grade', 'submission.export',
    'file.upload', 'leave.apply', 'leave.approve',
  ],
  student: ['assignment.submit', 'leave.apply', 'file.upload'],
  parent: ['leave.apply'],
};

/** Single gate for every action button in the app. */
export function canDo(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

/* ---------------- Authorized routes per role ---------------- */
export const ROLE_ROUTES: Record<Role, RouteId[]> = {
  'super-admin': ['overview', 'schools', 'tenants', 'users', 'subscriptions', 'feature-flags', 'platform-analytics', 'audit-logs', 'system-settings'],
  'school-admin': ['overview', 'students-directory', 'students-admissions', 'students-performance', 'teachers-faculty', 'teachers-staff', 'parents', 'classes-classes', 'subjects', 'attendance', 'assignments', 'submissions', 'grades', 'timetable', 'notifications', 'files', 'elab', 'settings', 'maintenance', 'leave-management', 'student-flags'],
  teacher: ['overview', 'my-classes', 'students-directory', 'attendance', 'assignments', 'submissions', 'grades', 'timetable', 'elab', 'notifications', 'files', 'maintenance', 'leave-management'],
  student: ['overview', 'my-classes', 'assignments', 'submissions', 'grades', 'attendance', 'timetable', 'files', 'elab', 'notifications', 'leave-management'],
  parent: ['overview', 'my-children', 'attendance', 'assignments', 'grades', 'timetable', 'notifications', 'files'],
};

export function canAccess(role: Role, route: RouteId): boolean {
  return ROLE_ROUTES[role].includes(route);
}

/* ---------------- Role-generated navigation ----------------
   Each role gets a purpose-built tree. Unauthorized modules are absent
   from the structure itself — there is nothing to hide or disable. */

const SUPER_NAV: TreeNode[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard', route: 'overview' },
  { id: 'schools', label: 'Schools', icon: 'building', route: 'schools' },
  { id: 'tenants', label: 'Tenants', icon: 'boxes', route: 'tenants' },
  { id: 'users', label: 'Users', icon: 'users', route: 'users' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'wallet', route: 'subscriptions' },
  { id: 'flags', label: 'Feature Flags', icon: 'flag', route: 'feature-flags' },
  { id: 'analytics', label: 'Platform Analytics', icon: 'chart', route: 'platform-analytics' },
  { id: 'audit', label: 'Audit Logs', icon: 'scroll', route: 'audit-logs' },
  { id: 'syssettings', label: 'System Settings', icon: 'settings-2', route: 'system-settings' },
];

const ADMIN_NAV: TreeNode[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard', route: 'overview' },
  {
    id: 'students', label: 'Students', icon: 'graduation-cap',
    children: [
      { id: 'students-directory', label: 'Directory', mono: 'stu/dir' },
      { id: 'students-admissions', label: 'Admissions', mono: 'stu/adm' },
      { id: 'students-performance', label: 'Performance', mono: 'stu/prf' },
    ],
  },
  {
    id: 'teachers', label: 'Teachers', icon: 'presentation',
    children: [
      { id: 'teachers-faculty', label: 'Faculty', mono: 'tch/fac' },
      { id: 'teachers-staff', label: 'Staff', mono: 'tch/stf' },
    ],
  },
  { id: 'parents', label: 'Parents', icon: 'users', route: 'parents' },
  {
    id: 'classes', label: 'Classes', icon: 'shapes',
    children: [
      { id: 'classes-classes', label: 'Classes', mono: 'cls/all' },
      { id: 'subjects', label: 'Subjects', mono: 'cls/sub' },
    ],
  },
  { id: 'attendance', label: 'Attendance', icon: 'calendar-check-2', route: 'attendance' },
  { id: 'leave', label: 'Leave Management', icon: 'calendar-check', route: 'leave-management' },
  { id: 'flag', label: 'Student Flags & Notes', icon: 'flag', route: 'student-flags' },
  {
    id: 'assignments', label: 'Assignments', icon: 'clipboard-list',
    children: [
      { id: 'assignments', label: 'Assignments', mono: 'asg/all' },
      { id: 'submissions', label: 'Submissions', mono: 'asg/sub' },
      { id: 'grades', label: 'Grades', mono: 'asg/grd' },
    ],
  },
  { id: 'timetable', label: 'Timetable', icon: 'calendar-range', route: 'timetable' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', route: 'notifications' },
  { id: 'files', label: 'Files', icon: 'folder-open', route: 'files' },
  { id: 'elab', label: 'E-Lab', icon: 'terminal-square', route: 'elab' },
  { id: 'maintenance', label: 'Maintenance', icon: 'wrench', route: 'maintenance' },
  { id: 'settings', label: 'Settings', icon: 'settings-2', route: 'settings' },
];

const TEACHER_NAV: TreeNode[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard', route: 'overview' },
  { id: 'my-classes', label: 'My Classes', icon: 'shapes', route: 'my-classes' },
  { id: 'students', label: 'Students', icon: 'graduation-cap', route: 'students-directory' },
  { id: 'attendance', label: 'Attendance', icon: 'calendar-check-2', route: 'attendance' },
  { id: 'leave', label: 'Leave Management', icon: 'calendar-check', route: 'leave-management' },
  {
    id: 'assignments', label: 'Assignments', icon: 'clipboard-list',
    children: [
      { id: 'assignments', label: 'Assignments', mono: 'asg/all' },
      { id: 'submissions', label: 'Submissions', mono: 'asg/sub' },
      { id: 'grades', label: 'Grades', mono: 'asg/grd' },
    ],
  },
  { id: 'timetable', label: 'Timetable', icon: 'calendar-range', route: 'timetable' },
  { id: 'elab', label: 'E-Lab', icon: 'terminal-square', route: 'elab' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', route: 'notifications' },
  { id: 'files', label: 'Files', icon: 'folder-open', route: 'files' },
  { id: 'maintenance', label: 'Maintenance', icon: 'wrench', route: 'maintenance' },
];

const STUDENT_NAV: TreeNode[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard', route: 'overview' },
  { id: 'my-classes', label: 'My Classes', icon: 'shapes', route: 'my-classes' },
  {
    id: 'assignments', label: 'Assignments', icon: 'clipboard-list',
    children: [
      { id: 'assignments', label: 'Assignments', mono: 'asg/all' },
      { id: 'submissions', label: 'My Submissions', mono: 'asg/sub' },
      { id: 'grades', label: 'My Grades', mono: 'asg/grd' },
    ],
  },
  { id: 'attendance', label: 'Attendance', icon: 'calendar-check-2', route: 'attendance' },
  { id: 'leave', label: 'Leave Management', icon: 'calendar-check', route: 'leave-management' },
  { id: 'timetable', label: 'Timetable', icon: 'calendar-range', route: 'timetable' },
  { id: 'files', label: 'Files', icon: 'folder-open', route: 'files' },
  { id: 'elab', label: 'E-Lab', icon: 'terminal-square', route: 'elab' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', route: 'notifications' },
];

const PARENT_NAV: TreeNode[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard', route: 'overview' },
  { id: 'my-children', label: 'My Children', icon: 'users', route: 'my-children' },
  { id: 'attendance', label: 'Attendance', icon: 'calendar-check-2', route: 'attendance' },
  { id: 'assignments', label: 'Assignments', icon: 'clipboard-list', route: 'assignments' },
  { id: 'grades', label: 'Grades', icon: 'chart', route: 'grades' },
  { id: 'timetable', label: 'Timetable', icon: 'calendar-range', route: 'timetable' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', route: 'notifications' },
  { id: 'files', label: 'Files', icon: 'folder-open', route: 'files' },
];

export function getNav(role: Role): TreeNode[] {
  switch (role) {
    case 'super-admin': return SUPER_NAV;
    case 'school-admin': return ADMIN_NAV;
    case 'teacher': return TEACHER_NAV;
    case 'student': return STUDENT_NAV;
    case 'parent': return PARENT_NAV;
  }
}

/* ---------------- Overview identity per role ---------------- */
export const OVERVIEW_META: Record<Role, { title: string; crumb: string[]; blurb: string }> = {
  'super-admin': {
    title: 'Platform Overview',
    crumb: ['Northview Cloud', 'Platform'],
    blurb: 'Tenant health, subscriptions, usage and audit activity across the whole SaaS platform.',
  },
  'school-admin': {
    title: 'School Overview',
    crumb: ['Northview High', 'Overview'],
    blurb: 'Enrolment, attendance, fees and events for Northview High · Kolkata.',
  },
  teacher: {
    title: 'Teaching Overview',
    crumb: ['My Workspace', 'Teaching'],
    blurb: 'Your classes, today’s periods, registers to mark and work to grade.',
  },
  student: {
    title: 'My Overview',
    crumb: ['My Workspace', 'Home'],
    blurb: 'Today’s classes, pending work, recent grades and your E-Lab streak.',
  },
  parent: {
    title: 'Family Overview',
    crumb: ['My Family', 'Home'],
    blurb: 'Schedule, attendance, grades and announcements for your linked children.',
  },
};

/* ---------------- Role-aware search index ---------------- */
export function getSearchIndex(role: Role): { route: RouteId; label: string; hint: string }[] {
  const flat: { route: RouteId; label: string; hint: string }[] = [];
  const walk = (nodes: TreeNode[], parent: string) => {
    nodes.forEach((n) => {
      if (n.route) flat.push({ route: n.route, label: parent ? `${parent} · ${n.label}` : n.label, hint: n.id });
      n.children?.forEach((c) => flat.push({ route: c.id, label: `${n.label} · ${c.label}`, hint: c.mono }));
    });
  };
  walk(getNav(role), '');
  return flat;
}

/* ---------------- Mobile bottom nav per role ---------------- */
export const BOTTOM_NAV: Record<Role, RouteId[]> = {
  'super-admin': ['overview', 'tenants', 'audit-logs', 'users'],
  'school-admin': ['overview', 'attendance', 'assignments', 'notifications'],
  teacher: ['overview', 'attendance', 'assignments', 'grades'],
  student: ['overview', 'assignments', 'grades', 'elab'],
  parent: ['overview', 'my-children', 'grades', 'notifications'],
};
