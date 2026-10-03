import type { AuditLog, FeatureFlag, Invoice, PlatformUser, Tenant } from './types';
import { STAFF, STUDENTS, TEACHERS } from './data';

/* ---------------- Tenants / schools ---------------- */
export const TENANTS: Tenant[] = [
  { id: 'T-001', school: 'Northview High', city: 'Kolkata', plan: 'Enterprise', status: 'active', students: STUDENTS.length, staff: TEACHERS.length + STAFF.length, storageGb: 68.4, mrr: 184000, health: 98, renewed: 'Mar 2027', sso: true },
  { id: 'T-002', school: 'Lakewood International', city: 'Bengaluru', plan: 'Growth', status: 'active', students: 1820, staff: 104, storageGb: 44.1, mrr: 96000, health: 96, renewed: 'Jan 2027', sso: true },
  { id: 'T-003', school: 'St. Aurelius Academy', city: 'Mumbai', plan: 'Enterprise', status: 'active', students: 3105, staff: 172, storageGb: 91.7, mrr: 226000, health: 99, renewed: 'Jun 2027', sso: true },
  { id: 'T-004', school: 'Greenfield Public', city: 'Delhi', plan: 'Growth', status: 'trial', students: 640, staff: 38, storageGb: 9.2, mrr: 0, health: 88, renewed: 'Trial · 12d left', sso: false },
  { id: 'T-005', school: 'Vidya Valley', city: 'Pune', plan: 'Starter', status: 'active', students: 412, staff: 26, storageGb: 6.8, mrr: 24000, health: 94, renewed: 'Dec 2026', sso: false },
  { id: 'T-006', school: 'Heritage Girls School', city: 'Jaipur', plan: 'Growth', status: 'active', students: 1188, staff: 71, storageGb: 28.3, mrr: 74000, health: 95, renewed: 'Feb 2027', sso: true },
  { id: 'T-007', school: 'Coastal Ridge High', city: 'Chennai', plan: 'Starter', status: 'suspended', students: 356, staff: 22, storageGb: 5.1, mrr: 18000, health: 61, renewed: 'Suspended', sso: false },
  { id: 'T-008', school: 'Maple Leaf School', city: 'Hyderabad', plan: 'Growth', status: 'trial', students: 289, staff: 19, storageGb: 3.4, mrr: 0, health: 90, renewed: 'Trial · 21d left', sso: false },
];

export const PLATFORM_TOTALS = {
  schools: TENANTS.length,
  active: TENANTS.filter((t) => t.status === 'active').length,
  trial: TENANTS.filter((t) => t.status === 'trial').length,
  students: TENANTS.reduce((a, t) => a + t.students, 0),
  staff: TENANTS.reduce((a, t) => a + t.students, 0),
  users: TENANTS.reduce((a, t) => a + t.students + t.staff, 0) + 4200,
  mrr: TENANTS.reduce((a, t) => a + t.mrr, 0),
  storageGb: Math.round(TENANTS.reduce((a, t) => a + t.storageGb, 0) * 10) / 10,
};

/* ---------------- Platform users ---------------- */
export const PLATFORM_USERS: PlatformUser[] = [
  { id: 'U-901', name: 'Ananya Rao', initials: 'AM', email: 'admin@northview.edu', role: 'School Admin', tenant: 'Northview High', status: 'active', lastActive: '2 min ago' },
  { id: 'U-902', name: 'Rohan Sen', initials: 'RS', email: 'rohan@northview.edu', role: 'Teacher', tenant: 'Northview High', status: 'active', lastActive: '18 min ago' },
  { id: 'U-903', name: 'Kavita Rao', initials: 'KR', email: 'kavita@lakewood.edu', role: 'School Admin', tenant: 'Lakewood International', status: 'active', lastActive: '1 hr ago' },
  { id: 'U-904', name: 'Joseph Pereira', initials: 'JP', email: 'joseph@aurelius.edu', role: 'School Admin', tenant: 'St. Aurelius Academy', status: 'active', lastActive: '3 hrs ago' },
  { id: 'U-905', name: 'Farah Ahmed', initials: 'FA', email: 'farah@greenfield.edu', role: 'School Admin', tenant: 'Greenfield Public', status: 'invited', lastActive: 'Invite pending' },
  { id: 'U-906', name: 'Rahul Menon', initials: 'RM', email: 'rahul@coastalridge.edu', role: 'Teacher', tenant: 'Coastal Ridge High', status: 'locked', lastActive: '6 days ago' },
  { id: 'U-907', name: 'Meera Krishnan', initials: 'MK', email: 'meera@vidyavalley.edu', role: 'Teacher', tenant: 'Vidya Valley', status: 'active', lastActive: 'Yesterday' },
  { id: 'U-908', name: 'Arjun Bhatia', initials: 'AB', email: 'arjun@mapleleaf.edu', role: 'School Admin', tenant: 'Maple Leaf School', status: 'invited', lastActive: 'Invite pending' },
  { id: 'U-909', name: 'Sara Mathews', initials: 'SM', email: 'sara@heritage.edu', role: 'Teacher', tenant: 'Heritage Girls School', status: 'active', lastActive: '44 min ago' },
  { id: 'U-910', name: 'Aarav Sharma', initials: 'AS', email: 'aarav.sharma@northview.edu', role: 'Student', tenant: 'Northview High', status: 'active', lastActive: '9 min ago' },
];

/* ---------------- Billing ---------------- */
export const INVOICES: Invoice[] = [
  { id: 'INV-2041', tenant: 'Northview High', plan: 'Enterprise', amount: 184000, due: 'Oct 01, 2026', status: 'due' },
  { id: 'INV-2040', tenant: 'St. Aurelius Academy', plan: 'Enterprise', amount: 226000, due: 'Sep 20, 2026', status: 'paid' },
  { id: 'INV-2039', tenant: 'Lakewood International', plan: 'Growth', amount: 96000, due: 'Sep 18, 2026', status: 'paid' },
  { id: 'INV-2038', tenant: 'Heritage Girls School', plan: 'Growth', amount: 74000, due: 'Sep 15, 2026', status: 'paid' },
  { id: 'INV-2037', tenant: 'Vidya Valley', plan: 'Starter', amount: 24000, due: 'Sep 10, 2026', status: 'paid' },
  { id: 'INV-2036', tenant: 'Coastal Ridge High', plan: 'Starter', amount: 18000, due: 'Aug 28, 2026', status: 'overdue' },
];

export const PLAN_MIX = [
  { plan: 'Starter', tenants: 2, mrr: 42 },
  { plan: 'Growth', tenants: 4, mrr: 170 },
  { plan: 'Enterprise', tenants: 2, mrr: 410 },
];

/* ---------------- Feature flags ---------------- */
export const FEATURE_FLAGS: FeatureFlag[] = [
  { id: 'F-01', name: 'E-Lab contests', key: 'elab.contests', description: 'Seasonal coding contests with house leaderboards.', staging: true, production: true, rollout: 100, updated: 'Sep 20' },
  { id: 'F-02', name: 'AI timetable solver', key: 'timetable.solver_v2', description: 'Constraint solver for clash-free master timetables.', staging: true, production: false, rollout: 25, updated: 'Sep 22' },
  { id: 'F-03', name: 'Guardian SMS digest', key: 'notify.sms_digest', description: 'Evening SMS digest for parents instead of per-event pings.', staging: true, production: true, rollout: 60, updated: 'Sep 18' },
  { id: 'F-04', name: 'Offline attendance', key: 'attendance.offline', description: 'Queue register marks when the network drops.', staging: true, production: false, rollout: 10, updated: 'Sep 23' },
  { id: 'F-05', name: 'Fee autopay (UPI)', key: 'billing.upi_autopay', description: 'Recurring UPI mandates for term fees.', staging: false, production: false, rollout: 0, updated: 'Sep 12' },
  { id: 'F-06', name: 'New gradebook grid', key: 'grades.grid_v3', description: 'Faster inline grading with keyboard flow.', staging: true, production: true, rollout: 100, updated: 'Sep 09' },
];

/* ---------------- Audit logs ---------------- */
export const AUDIT_LOGS: AuditLog[] = [
  { id: 'A-7712', time: 'Sep 24 · 09:41', actor: 'aarav@northview (super-admin)', action: 'tenant.update Northview High · plan Enterprise', tenant: 'Northview High', ip: '49.37.112.8', result: 'allowed' },
  { id: 'A-7711', time: 'Sep 24 · 09:12', actor: 'admin@northview (school-admin)', action: 'student.export Grade 10-B · 36 rows', tenant: 'Northview High', ip: '49.37.98.201', result: 'allowed' },
  { id: 'A-7710', time: 'Sep 24 · 08:58', actor: 'rahul@coastalridge (teacher)', action: 'tenant.read Coastal Ridge High · billing', tenant: 'Coastal Ridge High', ip: '103.22.61.40', result: 'denied' },
  { id: 'A-7709', time: 'Sep 23 · 17:22', actor: 'system (cron)', action: 'backup.snapshot all tenants · 257 GB', tenant: '—', ip: 'internal', result: 'allowed' },
  { id: 'A-7708', time: 'Sep 23 · 15:04', actor: 'kavita@lakewood (school-admin)', action: 'flag.read timetable.solver_v2', tenant: 'Lakewood International', ip: '157.34.210.9', result: 'denied' },
  { id: 'A-7707', time: 'Sep 23 · 11:47', actor: 'aarav@northview (super-admin)', action: 'tenant.suspend Coastal Ridge High · non-payment', tenant: 'Coastal Ridge High', ip: '49.37.112.8', result: 'allowed' },
  { id: 'A-7706', time: 'Sep 22 · 19:31', actor: 'aarav.sharma@northview (student)', action: 'gradebook.read Grade 10-B · peers', tenant: 'Northview High', ip: '49.37.77.112', result: 'denied' },
  { id: 'A-7705', time: 'Sep 22 · 10:15', actor: 'joseph@aurelius (school-admin)', action: 'user.invite 4 teachers', tenant: 'St. Aurelius Academy', ip: '182.68.14.77', result: 'allowed' },
];

/* ---------------- Platform chart series ---------------- */
export const TENANT_GROWTH = [
  { m: 'Apr', tenants: 4, users: 8200 },
  { m: 'May', tenants: 5, users: 9800 },
  { m: 'Jun', tenants: 6, users: 12100 },
  { m: 'Jul', tenants: 7, users: 13400 },
  { m: 'Aug', tenants: 7, users: 14200 },
  { m: 'Sep', tenants: 8, users: 14900 },
];
export const PLATFORM_MAU = [
  { w: 'W32', dau: 8200, mau: 12400 }, { w: 'W33', dau: 8600, mau: 12800 },
  { w: 'W34', dau: 9100, mau: 13200 }, { w: 'W35', dau: 8900, mau: 13100 },
  { w: 'W36', dau: 9400, mau: 13700 }, { w: 'W37', dau: 9800, mau: 14100 },
  { w: 'W38', dau: 10200, mau: 14600 },
];
export const API_LATENCY = [
  { h: '12a', p95: 180 }, { h: '3a', p95: 140 }, { h: '6a', p95: 160 }, { h: '9a', p95: 320 },
  { h: '12p', p95: 410 }, { h: '3p', p95: 380 }, { h: '6p', p95: 290 }, { h: '9p', p95: 210 },
];
export const STORAGE_BY_TENANT = TENANTS.filter((t) => t.status !== 'churned').map((t) => ({
  tenant: t.school.split(' ')[0], gb: t.storageGb,
}));
export const ERROR_RATE = [
  { d: 'Mon', rate: 0.12 }, { d: 'Tue', rate: 0.09 }, { d: 'Wed', rate: 0.11 },
  { d: 'Thu', rate: 0.08 }, { d: 'Fri', rate: 0.14 }, { d: 'Sat', rate: 0.07 },
];

export const inr = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN')}`;
