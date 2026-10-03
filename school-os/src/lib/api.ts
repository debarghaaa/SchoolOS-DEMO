import { useEffect, useRef, useState } from 'react';
import {
  ASSIGNMENTS, CLASSES, ENROLMENT_TREND, FEE_COLLECTION,
  FILES, GRADE_DIST, HOUSE_POINTS, NOTIFICATIONS,
  STUDENTS, SUBJECT_LIST, SUBMISSIONS, TEACHERS,
} from './data';
import { canAccess, canDo, type Action } from './permissions';
import {
  API_LATENCY, AUDIT_LOGS, FEATURE_FLAGS, INVOICES, PLAN_MIX,
  PLATFORM_MAU, PLATFORM_TOTALS, PLATFORM_USERS, STORAGE_BY_TENANT, TENANTS, TENANT_GROWTH,
} from './platform-data';
import {
  CHILD_GRADES, FAMILY_ANNOUNCEMENTS, LINKED_CHILDREN, STUDENT_FEEDBACK,
  STUDENT_GRADES, STUDENT_SCOPE, TEACHER_SCOPE, childAssignments, studentAssignments,
  studentSubmissions, studentToday, teacherAssignments, teacherClasses, teacherPendingGrades,
  teacherStudents, teacherToday, timetableFor, todayFor,
} from './scoped';
import type { Role, RouteId } from './types';

/* =====================================================================
   Simulated backend client.
   In production each function below is an HTTP call and the server —
   never the UI — enforces: authentication, tenant isolation, role
   permissions and object-level scope (assigned classes, linked children).
   Here we mirror that contract: every accessor checks authorization
   FIRST and returns only the data the role may receive, so no page can
   over-fetch by accident. A 403-style ForbiddenError is raised (and
   rendered) if a check fails. See docs/RBAC.md for the server contract.
   ===================================================================== */

export class ForbiddenError extends Error {
  status = 403;
  constructor(resource: string) {
    super(`Not authorized to access ${resource}.`);
    this.name = 'ForbiddenError';
  }
}

export interface Session {
  role: Role;
  /** tenant the user belongs to (null = platform scope for super-admin) */
  tenantId: string | null;
}

export const sessionFor = (role: Role): Session => ({
  role,
  tenantId: role === 'super-admin' ? null : 'T-001',
});

function needRoute(s: Session, route: RouteId) {
  if (!canAccess(s.role, route)) throw new ForbiddenError(`route:${route}`);
}
function needAction(s: Session, action: Action, resource: string) {
  if (!canDo(s.role, action)) throw new ForbiddenError(resource);
}
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Overviews (one endpoint per role) ---------------- */
export const api = {
  async platformOverview(s: Session) {
    needRoute(s, 'overview');
    if (s.role !== 'super-admin') throw new ForbiddenError('platform metrics');
    await wait();
    return {
      totals: PLATFORM_TOTALS,
      growth: TENANT_GROWTH,
      planMix: PLAN_MIX,
      tenants: TENANTS,
      flags: FEATURE_FLAGS.slice(0, 4),
      audit: AUDIT_LOGS.slice(0, 5),
      invoicesDue: INVOICES.filter((i) => i.status !== 'paid'),
    };
  },

  async schoolOverview(s: Session) {
    needRoute(s, 'overview');
    if (s.role !== 'school-admin') throw new ForbiddenError('school metrics');
    await wait();
    return {
      students: STUDENTS, teachers: TEACHERS, classes: CLASSES,
      enrolment: ENROLMENT_TREND,
      houses: HOUSE_POINTS, grades: GRADE_DIST, fees: FEE_COLLECTION,
      attention: ASSIGNMENTS.filter((a) => a.status === 'published' || a.status === 'overdue').slice(0, 4),
    };
  },

  async teachingOverview(s: Session) {
    needRoute(s, 'overview');
    if (s.role !== 'teacher') throw new ForbiddenError('teaching workspace');
    await wait();
    return {
      scope: TEACHER_SCOPE,
      today: teacherToday(),
      classes: teacherClasses(),
      students: teacherStudents(),
      assignments: teacherAssignments(),
      pendingGrades: teacherPendingGrades(),
    };
  },

  async studentOverview(s: Session) {
    needRoute(s, 'overview');
    if (s.role !== 'student') throw new ForbiddenError('student workspace');
    await wait();
    return {
      me: STUDENT_SCOPE,
      today: studentToday(),
      assignments: studentAssignments(),
      grades: STUDENT_GRADES.slice(0, 4),
      feedback: STUDENT_FEEDBACK.slice(0, 2),
    };
  },

  async familyOverview(s: Session) {
    needRoute(s, 'overview');
    if (s.role !== 'parent') throw new ForbiddenError('family workspace');
    await wait();
    return { children: LINKED_CHILDREN, announcements: FAMILY_ANNOUNCEMENTS };
  },

  /* Presence islands are LIVE: they stream from the Supabase feed via
     useLivePresence (./presence-live.ts), not from this simulated client. */

  /* ---------------- Platform resources (super-admin only) ---------------- */
  async tenants(s: Session) { needRoute(s, 'tenants'); await wait(150); return TENANTS; },
  async platformUsers(s: Session, q = '') {
    needRoute(s, 'users'); await wait(150);
    return PLATFORM_USERS.filter((u) => `${u.name} ${u.email} ${u.tenant}`.toLowerCase().includes(q.toLowerCase()));
  },
  async billing(s: Session) { needRoute(s, 'subscriptions'); await wait(150); return { invoices: INVOICES, mix: PLAN_MIX, mrr: PLATFORM_TOTALS.mrr }; },
  async flags(s: Session) { needRoute(s, 'feature-flags'); await wait(150); return FEATURE_FLAGS; },
  async platformAnalytics(s: Session) {
    needRoute(s, 'platform-analytics'); await wait(150);
    return { mau: PLATFORM_MAU, latency: API_LATENCY, storage: STORAGE_BY_TENANT, growth: TENANT_GROWTH };
  },
  async auditLogs(s: Session) { needRoute(s, 'audit-logs'); await wait(150); return AUDIT_LOGS; },

  /* ---------------- School resources (scoped by role) ---------------- */
  async students(s: Session) {
    needRoute(s, 'students-directory'); await wait(150);
    if (s.role === 'teacher') return { rows: teacherStudents(), readOnly: true, scopeNote: `Assigned classes · ${TEACHER_SCOPE.classes.join(', ')}` };
    return { rows: STUDENTS, readOnly: false, scopeNote: 'Northview High · all grades' };
  },

  async attendanceRegister(s: Session) {
    needRoute(s, 'attendance'); await wait(150);
    if (s.role === 'teacher') {
      return {
        mode: 'register' as const,
        classes: TEACHER_SCOPE.classes,
        scopeNote: 'You can only mark registers for your assigned classes.',
      };
    }
    return { mode: 'register' as const, classes: CLASSES.map((c) => `${c.grade}-${c.section}`), scopeNote: 'All classes · Northview High' };
  },

  async assignments(s: Session) {
    needRoute(s, 'assignments'); await wait(150);
    if (s.role === 'teacher') return { rows: teacherAssignments(), scopeNote: 'Your assignments · assigned classes' };
    if (s.role === 'student') return { rows: studentAssignments(), scopeNote: `${STUDENT_SCOPE.class} · your work` };
    if (s.role === 'parent') {
      const rows = LINKED_CHILDREN.flatMap((c) =>
        childAssignments(c.class).map((a) => ({ ...a, childName: c.name })),
      );
      return { rows, scopeNote: 'Linked children only' };
    }
    return { rows: ASSIGNMENTS, scopeNote: 'All classes · Northview High' };
  },

  async submissions(s: Session) {
    needRoute(s, 'submissions'); await wait(150);
    if (s.role === 'student') return { rows: studentSubmissions(), personal: true };
    return {
      rows: s.role === 'teacher'
        ? SUBMISSIONS.filter((x) => teacherStudents().some((t) => t.id === x.studentId))
        : SUBMISSIONS,
      personal: false,
    };
  },

  async childDetail(s: Session, childId: string) {
    needRoute(s, 'my-children');
    const child = LINKED_CHILDREN.find((c) => c.id === childId);
    if (!child) throw new ForbiddenError('unlinked student record');
    await wait(150);
    return {
      child,
      today: todayFor(child.class),
      assignments: childAssignments(child.class),
      grades: CHILD_GRADES[child.id] ?? [],
      timetable: timetableFor(child.class),
    };
  },

  async myClasses(s: Session) {
    needRoute(s, 'my-classes'); await wait(150);
    if (s.role === 'teacher') return { kind: 'teach' as const, classes: teacherClasses(), today: teacherToday(), scope: TEACHER_SCOPE };
    return { kind: 'learn' as const, timetable: timetableFor(STUDENT_SCOPE.class), me: STUDENT_SCOPE };
  },

  async notifications(s: Session) {
    await wait(120);
    return NOTIFICATIONS.filter((n) => n.audience.includes(s.role));
  },

  async files(s: Session) {
    needRoute(s, 'files'); await wait(150);
    return { rows: FILES, canUpload: canDo(s.role, 'file.upload') };
  },

  async subjects(s: Session) {
    needRoute(s, 'subjects'); await wait(150);
    return { rows: SUBJECT_LIST, classes: CLASSES };
  },

  /* ---------------- Guarded mutations (all permission-checked) ---------------- */
  async createTenant(s: Session, name: string) {
    needAction(s, 'tenant.create', 'tenant provisioning'); await wait(300);
    return { id: `T-${String(TENANTS.length + 1).padStart(3, '0')}`, name };
  },
  async setFlagRollout(s: Session, key: string, pct: number) {
    needAction(s, 'flag.manage', `flag:${key}`); await wait(200);
    return { key, pct };
  },
};

/* ---------------- Query hook with loading / error / 403 states ---------------- */
interface QueryState<T> { data: T | null; loading: boolean; error: Error | null; reload: () => void }

const cache = new Map<string, unknown>();

export function useScopedQuery<T>(key: string, fn: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T | null>(() => (cache.has(key) ? (cache.get(key) as T) : null));
  const [loading, setLoading] = useState(!cache.has(key));
  const [error, setError] = useState<Error | null>(null);
  const seq = useRef(0);

  const run = () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (id !== seq.current) return;
        cache.set(key, d);
        setData(d);
      })
      .catch((e: Error) => { if (id === seq.current) setError(e); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error, reload: run };
}
