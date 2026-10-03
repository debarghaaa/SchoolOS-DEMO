import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { NOTIFICATIONS } from './data';
import { canAccess, OVERVIEW_META } from './permissions';
import type { Notification, Role, RouteId, Toast } from './types';

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  route: RouteId;
  go: (r: RouteId) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  railCollapsed: boolean;
  setRailCollapsed: (v: boolean) => void;
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  notifications: Notification[];
  unread: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  pushNotification: (n: Notification) => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
}

const AppCtx = createContext<AppState | null>(null);

/** Persistence hooks fired whenever a notification is marked read —
 *  live feeds (e.g. leave) register here to sync `is_read` back. */
type NotificationReadHook = (id: string) => void;
const readHooks = new Set<NotificationReadHook>();

export function registerNotificationReadHook(fn: NotificationReadHook): () => void {
  readHooks.add(fn);
  return () => { readHooks.delete(fn); };
}

function fireReadHooks(ids: string[]): void {
  for (const id of ids) {
    for (const hook of readHooks) {
      try { hook(id); } catch { /* hooks are fire-and-forget */ }
    }
  }
}

let toastSeq = 1;

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('school-admin');
  const [route, setRoute] = useState<RouteId>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(NOTIFICATIONS);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastSeq++;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    // Rebuild the workspace for the new role: always land on its own Overview.
    setRoute('overview');
    setSidebarOpen(false);
  }, []);

  const go = useCallback((r: RouteId) => {
    setRoute(r);
    setSidebarOpen(false);
    setPaletteOpen(false);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    fireReadHooks([id]);
  }, []);
  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      fireReadHooks(prev.filter((n) => !n.read).map((n) => n.id));
      return prev.map((n) => ({ ...n, read: true }));
    });
  }, []);
  const pushNotification = useCallback((n: Notification) => {
    // Dedupe by id — realtime replays and multi-mount bridges must not
    // duplicate inbox items.
    setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  const value: AppState = {
    role, setRole, route, go,
    sidebarOpen, setSidebarOpen, railCollapsed, setRailCollapsed,
    notifOpen, setNotifOpen, paletteOpen, setPaletteOpen,
    notifications, unread, markRead, markAllRead, pushNotification,
    toasts, pushToast, dismissToast,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

/** Notifications visible to the current role (audience-scoped). */
export function useMyNotifications(): Notification[] {
  const { notifications, role } = useApp();
  return useMemo(() => notifications.filter((n) => n.audience.includes(role)), [notifications, role]);
}

export interface RouteMeta { title: string; crumb: string[]; blurb: string }

const ROUTE_TITLES: Record<Exclude<RouteId, 'overview'>, RouteMeta> = {
  /* platform */
  schools: { title: 'Schools', crumb: ['Platform', 'Schools'], blurb: 'Every tenant school with plan, strength and health.' },
  tenants: { title: 'Tenants', crumb: ['Platform', 'Tenants'], blurb: 'Provisioning, regions, SSO and lifecycle per tenant.' },
  users: { title: 'Users', crumb: ['Platform', 'Users'], blurb: 'Cross-tenant identities, roles and access state.' },
  subscriptions: { title: 'Subscriptions', crumb: ['Platform', 'Subscriptions'], blurb: 'Plans, MRR, invoices and renewals.' },
  'feature-flags': { title: 'Feature Flags', crumb: ['Platform', 'Feature Flags'], blurb: 'Staged rollouts across staging and production.' },
  'platform-analytics': { title: 'Platform Analytics', crumb: ['Platform', 'Analytics'], blurb: 'Usage, latency, storage and error budgets.' },
  'audit-logs': { title: 'Audit Logs', crumb: ['Platform', 'Audit Logs'], blurb: 'Every privileged action, allowed or denied.' },
  'system-settings': { title: 'System Settings', crumb: ['Platform', 'System'], blurb: 'Platform-wide configuration and guardrails.' },
  /* school */
  'students-directory': { title: 'Student Directory', crumb: ['Students', 'Directory'], blurb: '' },
  'students-admissions': { title: 'Admissions', crumb: ['Students', 'Admissions'], blurb: 'Pipeline from enquiry to enrolment for 2026–27.' },
  'students-performance': { title: 'Performance', crumb: ['Students', 'Performance'], blurb: 'Grade bands, subject averages and GPA movement.' },
  'teachers-faculty': { title: 'Faculty', crumb: ['Teachers', 'Faculty'], blurb: 'Teaching staff, workloads and department coverage.' },
  'teachers-staff': { title: 'Staff', crumb: ['Teachers', 'Staff'], blurb: 'Operations, administration and support roles.' },
  parents: { title: 'Parents', crumb: ['Northview High', 'Parents'], blurb: 'Guardians linked to enrolled students.' },
  'classes-classes': { title: 'Classes', crumb: ['Classes', 'Classes'], blurb: 'Sections, class teachers, strength and averages.' },
  subjects: { title: 'Subjects', crumb: ['Classes', 'Subjects'], blurb: 'Curriculum coverage across grades and departments.' },
  'my-classes': { title: 'My Classes', crumb: ['Workspace', 'My Classes'], blurb: '' },
  'my-children': { title: 'My Children', crumb: ['Family', 'Children'], blurb: 'Profiles, schedules and progress for your linked children.' },
  attendance: { title: 'Attendance', crumb: ['Workspace', 'Attendance'], blurb: '' },
  assignments: { title: 'Assignments', crumb: ['Workspace', 'Assignments'], blurb: '' },
  submissions: { title: 'Submissions', crumb: ['Workspace', 'Submissions'], blurb: '' },
  grades: { title: 'Grades', crumb: ['Workspace', 'Grades'], blurb: '' },
  timetable: { title: 'Timetable', crumb: ['Workspace', 'Timetable'], blurb: '' },
  elab: { title: 'E-Lab', crumb: ['Northview High', 'E-Lab'], blurb: 'Practice arena — solve, run and submit code.' },
  files: { title: 'Files', crumb: ['Workspace', 'Files'], blurb: 'Shared drive for calendars, reports and resources.' },
  notifications: { title: 'Notifications', crumb: ['Workspace', 'Notifications'], blurb: 'Only the updates addressed to your role.' },
  settings: { title: 'Settings', crumb: ['Northview High', 'Settings'], blurb: 'School profile, academic year and preferences.' },
  maintenance: { title: 'Maintenance', crumb: ['Northview High', 'Maintenance'], blurb: '' },
  'leave-management': { title: 'Leave Management', crumb: ['Workspace', 'Leave'], blurb: '' },
  'student-flags': { title: 'Student Flags & Notes', crumb: ['Northview High', 'Flags & Notes'], blurb: '' },
};

const SCOPED_BLURBS: Partial<Record<RouteId, Partial<Record<Role, string>>>> = {
  'students-directory': {
    'school-admin': 'Search, filter and manage the full student ledger.',
    teacher: 'Students in your assigned classes · read-only.',
  },
  'my-classes': {
    teacher: 'Classes you teach, with today’s periods and registers.',
    student: 'Your enrolled class, subjects and teachers.',
  },
  maintenance: {
    'school-admin': 'Facilities, repair requests and scheduled work, live from the feed.',
    teacher: 'Campus repair status and scheduled work · read-only.',
  },
  attendance: {
    'school-admin': 'Faculty & staff punch attendance, live from the feed.',
    teacher: 'Mark and review registers for your assigned classes.',
    student: 'Your attendance record, streak and leave balance.',
    parent: 'Attendance for your linked children.',
  },
  assignments: {
    'school-admin': 'Coursework lifecycle — drafts to graded submissions.',
    teacher: 'Coursework for your assigned classes.',
    student: 'Your pending and completed work.',
    parent: 'Pending and recent work for your linked children.',
  },
  submissions: {
    'school-admin': 'All submissions awaiting review and grading.',
    teacher: 'Submissions from your assigned classes.',
    student: 'Everything you have turned in, with scores.',
  },
  grades: {
    'school-admin': 'Gradebooks and publishing controls.',
    teacher: 'Gradebooks for your assigned classes.',
    student: 'Your scores and report card.',
    parent: 'Scores and report cards for your linked children.',
  },
  'student-flags': {
    'school-admin': 'Central notes, concerns and flags for every student, live from the feed.',
  },
  'leave-management': {
    'school-admin': 'Teacher applications awaiting your decision, live from the feed.',
    teacher: 'Your queue of student applications plus your own leave.',
    student: 'Apply for leave and track every application.',
  },
  timetable: {
    'school-admin': 'Weekly grid with rooms, teachers and lab blocks.',
    teacher: 'Your teaching schedule for the week.',
    student: 'Your class timetable.',
    parent: 'Class timetables for your linked children.',
  },
};

/** Role-aware route metadata — the Overview identity changes per role. */
export function getRouteMeta(route: RouteId, role: Role): RouteMeta {
  if (route === 'overview') return OVERVIEW_META[role];
  const base = ROUTE_TITLES[route];
  const scoped = SCOPED_BLURBS[route]?.[role];
  return scoped ? { ...base, blurb: scoped } : base;
}

export { canAccess };
