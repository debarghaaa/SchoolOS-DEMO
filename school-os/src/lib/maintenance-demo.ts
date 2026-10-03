import {
  type Facility, type MaintenanceData, type MaintenanceTask, type MaintenanceRequest,
} from './maintenance';
import { FACILITIES as CANON_FACILITIES } from './data';

/* =====================================================================
   Maintenance demo state — zero-setup prototype testing.
   Facilities and assignees resolve against the canonical dataset; only live
   request/task statuses are demo state.

   Pure client-side example data (no login, no backend, no Supabase) with
   dates relative to today so overdue / due-today / upcoming states always
   render. Loading demo is module-level so the Overview card and the hero
   page always agree; mutations apply to the module-level copy so every
   hook instance stays in sync. Exiting demo discards local edits.
   ===================================================================== */

const loaded = new Set<'maintenance'>();
const listeners = new Set<() => void>();

export function isMaintenanceDemoLoaded(): boolean {
  return loaded.has('maintenance');
}

export function setMaintenanceDemoLoaded(on: boolean): void {
  const had = loaded.has('maintenance');
  if (on) loaded.add('maintenance');
  else {
    loaded.delete('maintenance');
    demoData = null;
  }
  if (had !== on) listeners.forEach((l) => l());
}

export function subscribeMaintenanceDemoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let demoData: MaintenanceData | null = null;
const dataListeners = new Set<() => void>();

export function subscribeDemoMaintenance(listener: () => void): () => void {
  dataListeners.add(listener);
  return () => { dataListeners.delete(listener); };
}

export function mutateDemoMaintenance(fn: (d: MaintenanceData) => MaintenanceData): void {
  demoData = fn(demoMaintenance());
  dataListeners.forEach((l) => l());
}

/** yyyy-mm-dd offset from today; time defaults to 09:15 local for reported_at. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function reported(daysAgo: number): string {
  return `${dayOffset(-daysAgo)}T09:15:00`;
}

interface RequestSeed {
  title: string; location: string; category: MaintenanceRequest['category'];
  priority: MaintenanceRequest['priority']; status: MaintenanceRequest['status'];
  reportedDaysAgo: number; assignedStaff: string;
  expectedInDays: number | null; description: string;
}

const REQUESTS: RequestSeed[] = [
  { title: 'Burst pipe in ground floor restroom', location: 'Ground Floor Restrooms', category: 'Plumbing', priority: 'critical', status: 'in_progress', reportedDaysAgo: 1, assignedStaff: 'Farhan Ali', expectedInDays: 1, description: 'Water supply isolated; refit underway.' },
  { title: 'Chemistry lab fume hood not extracting', location: 'Science Laboratories', category: 'HVAC', priority: 'high', status: 'open', reportedDaysAgo: 2, assignedStaff: '', expectedInDays: 3, description: 'Hood 2 airflow below threshold.' },
  { title: 'Flickering lights in Classroom Block A', location: 'Classroom Block A', category: 'Electrical', priority: 'medium', status: 'open', reportedDaysAgo: 3, assignedStaff: 'Dipak Mondal', expectedInDays: 5, description: 'Rooms A-4 and A-6 affected.' },
  { title: 'Library air-conditioning weak', location: 'Central Library', category: 'HVAC', priority: 'medium', status: 'in_progress', reportedDaysAgo: 2, assignedStaff: 'Farhan Ali', expectedInDays: 2, description: 'Compressor service scheduled.' },
  { title: 'Sports field irrigation leak', location: 'Sports Complex', category: 'Plumbing', priority: 'low', status: 'open', reportedDaysAgo: 4, assignedStaff: '', expectedInDays: 9, description: 'North-east corner sprinkler line.' },
  { title: 'Auditorium stage lights unresponsive', location: 'Auditorium', category: 'Electrical', priority: 'high', status: 'open', reportedDaysAgo: 6, assignedStaff: 'Dipak Mondal', expectedInDays: -1, description: 'DMX controller fault; annual day rehearsals at risk.' },
  { title: 'Main gate intercom crackling', location: 'Main Building', category: 'IT', priority: 'low', status: 'completed', reportedDaysAgo: 9, assignedStaff: 'Dipak Mondal', expectedInDays: -6, description: 'Handset replaced.' },
  { title: 'Chemistry lab gas line inspection', location: 'Science Laboratories', category: 'Safety', priority: 'critical', status: 'open', reportedDaysAgo: 0, assignedStaff: '', expectedInDays: 0, description: 'Annual certification due today; labs closed until signed off.' },
  { title: 'Corridor repainting, first floor', location: 'Main Building', category: 'Civil', priority: 'low', status: 'completed', reportedDaysAgo: 12, assignedStaff: 'Ramesh Kumar', expectedInDays: -5, description: 'Two coats, weekend work.' },
  { title: 'Server room UPS battery swelling', location: 'Main Building', category: 'Electrical', priority: 'high', status: 'in_progress', reportedDaysAgo: 1, assignedStaff: 'Dipak Mondal', expectedInDays: 4, description: 'Bank B flagged by monitoring; replacement ordered.' },
  { title: 'Playground swing chain worn', location: 'Sports Complex', category: 'Civil', priority: 'medium', status: 'open', reportedDaysAgo: 1, assignedStaff: '', expectedInDays: 7, description: 'North frame, middle swing; cordoned off.' },
  { title: 'Staff room water purifier service', location: 'Classroom Block A', category: 'Plumbing', priority: 'low', status: 'completed', reportedDaysAgo: 7, assignedStaff: 'Ramesh Kumar', expectedInDays: -3, description: 'Filters replaced, TDS normal.' },
];

interface TaskSeed {
  task: string; location: string; category: string; scheduledInDays: number;
  assignedStaff: string; status: MaintenanceTask['status']; notes: string;
}

const TASKS: TaskSeed[] = [
  { task: 'Quarterly fire extinguisher inspection', location: 'Main Building', category: 'Safety', scheduledInDays: 4, assignedStaff: 'Ramesh Kumar', status: 'scheduled', notes: 'All floors.' },
  { task: 'HVAC filter replacement', location: 'HVAC Plant', category: 'HVAC', scheduledInDays: 6, assignedStaff: 'Farhan Ali', status: 'scheduled', notes: '' },
  { task: 'Playground equipment safety check', location: 'Sports Complex', category: 'Civil', scheduledInDays: 11, assignedStaff: '', status: 'scheduled', notes: '' },
  { task: 'Overhead water tank cleaning', location: 'Main Building', category: 'Plumbing', scheduledInDays: -2, assignedStaff: 'Ramesh Kumar', status: 'completed', notes: 'Chlorination done.' },
];

interface FacilitySeed { name: string; kind: string; status: Facility['status']; note: string }

/** Live demo state overlaid on the canonical facility register. */
const FACILITY_STATE: Record<string, { status: Facility['status']; note: string }> = {
  'Main Building': { status: 'operational', note: '' },
  'Classroom Block A': { status: 'operational', note: '' },
  'Science Laboratories': { status: 'maintenance_required', note: 'Fume hood service due' },
  'Central Library': { status: 'operational', note: '' },
  'Ground Floor Restrooms': { status: 'under_maintenance', note: 'Plumbing refit in progress' },
  'Sports Complex': { status: 'operational', note: '' },
  'Electrical Systems': { status: 'operational', note: '' },
  'HVAC Plant': { status: 'maintenance_required', note: 'Filter replacement overdue' },
  Auditorium: { status: 'operational', note: '' },
};

const FACILITIES: FacilitySeed[] = CANON_FACILITIES.map((f) => ({
  name: f.name, kind: f.kind, ...FACILITY_STATE[f.name],
}));

function buildDemoMaintenance(): MaintenanceData {
  const requests: MaintenanceRequest[] = REQUESTS.map((r, i) => ({
    id: `demo-mreq-${String(i + 1).padStart(2, '0')}`,
    title: r.title, location: r.location, category: r.category,
    priority: r.priority, status: r.status, reportedAt: reported(r.reportedDaysAgo),
    assignedStaff: r.assignedStaff,
    expectedCompletion: r.expectedInDays === null ? null : dayOffset(r.expectedInDays),
    completedAt: r.status === 'completed' ? reported(Math.max(r.reportedDaysAgo - 2, 0)) : null,
    description: r.description,
  }));
  const tasks: MaintenanceTask[] = TASKS.map((t, i) => ({
    id: `demo-mtask-${String(i + 1).padStart(2, '0')}`,
    task: t.task, location: t.location, category: t.category,
    scheduledDate: dayOffset(t.scheduledInDays), assignedStaff: t.assignedStaff,
    status: t.status,
    completedAt: t.status === 'completed' ? `${dayOffset(t.scheduledInDays)}T14:00:00` : null,
    notes: t.notes,
  }));
  const facilities: Facility[] = FACILITIES.map((f, i) => ({
    id: `demo-fac-${String(i + 1).padStart(2, '0')}`,
    name: f.name, kind: f.kind, status: f.status, note: f.note,
  }));
  return { requests, tasks, facilities, syncedAt: new Date() };
}

export function demoMaintenance(): MaintenanceData {
  if (!demoData) demoData = buildDemoMaintenance();
  return demoData;
}
