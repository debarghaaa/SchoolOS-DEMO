/* =====================================================================
   Maintenance — types, labels and pure helpers.

   Facilities, maintenance requests and scheduled tasks behind the Overview
   maintenance summary card and the dedicated /maintenance hero page.
   OVERDUE IS DERIVED, never stored: a request is overdue when it is not
   completed and its expected completion date is before today.
   ===================================================================== */

export type MaintenancePriority = 'critical' | 'high' | 'medium' | 'low';
export type RequestStatus = 'open' | 'in_progress' | 'completed';
export type TaskStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type FacilityStatus = 'operational' | 'maintenance_required' | 'under_maintenance' | 'unavailable';

export interface MaintenanceRequest {
  id: string;
  title: string;
  location: string;
  category: string;
  priority: MaintenancePriority;
  status: RequestStatus;
  /** ISO timestamp. */
  reportedAt: string;
  assignedStaff: string;
  /** yyyy-mm-dd, or null when no target date is set. */
  expectedCompletion: string | null;
  /** ISO timestamp, set when completed. */
  completedAt: string | null;
  description: string;
}

export interface MaintenanceTask {
  id: string;
  task: string;
  location: string;
  category: string;
  /** yyyy-mm-dd. */
  scheduledDate: string;
  assignedStaff: string;
  status: TaskStatus;
  completedAt: string | null;
  notes: string;
}

export interface Facility {
  id: string;
  name: string;
  kind: string;
  status: FacilityStatus;
  note: string;
}

export interface MaintenanceData {
  requests: MaintenanceRequest[];
  tasks: MaintenanceTask[];
  facilities: Facility[];
  syncedAt: Date;
}

export const PRIORITIES: MaintenancePriority[] = ['critical', 'high', 'medium', 'low'];
export const REQUEST_STATUSES: RequestStatus[] = ['open', 'in_progress', 'completed'];
export const TASK_STATUSES: TaskStatus[] = ['scheduled', 'in_progress', 'completed', 'cancelled'];
export const FACILITY_STATUSES: FacilityStatus[] = [
  'operational', 'maintenance_required', 'under_maintenance', 'unavailable',
];

export const PRIORITY_LABEL: Record<MaintenancePriority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed',
};
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};
export const FACILITY_STATUS_LABEL: Record<FacilityStatus, string> = {
  operational: 'Operational', maintenance_required: 'Maintenance Required',
  under_maintenance: 'Under Maintenance', unavailable: 'Unavailable',
};

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Overdue = not completed and the target date is before today. */
export function isOverdue(r: MaintenanceRequest, today: string = todayLocal()): boolean {
  return r.status !== 'completed' && r.expectedCompletion !== null && r.expectedCompletion < today;
}

export interface MaintenanceCounts {
  totalRequests: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  scheduledTasks: number;
  /** Non-completed requests with critical priority. */
  critical: number;
}

export function maintenanceCounts(data: MaintenanceData, today: string = todayLocal()): MaintenanceCounts {
  const open = data.requests.filter((r) => r.status === 'open').length;
  const inProgress = data.requests.filter((r) => r.status === 'in_progress').length;
  const completed = data.requests.filter((r) => r.status === 'completed').length;
  return {
    totalRequests: data.requests.length,
    open, inProgress, completed,
    overdue: data.requests.filter((r) => isOverdue(r, today)).length,
    scheduledTasks: data.tasks.filter((t) => t.status === 'scheduled').length,
    critical: data.requests.filter((r) => r.priority === 'critical' && r.status !== 'completed').length,
  };
}

/* ---------------- Supabase row mapping (snake_case → camelCase) ---------------- */

type Row = Record<string, string | null>;

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === 'string' ? v : '';
}

function optStr(row: Row, key: string): string | null {
  const v = row[key];
  return typeof v === 'string' && v !== '' ? v : null;
}

export function mapRequest(row: Row): MaintenanceRequest {
  return {
    id: str(row, 'id'), title: str(row, 'title'), location: str(row, 'location'),
    category: str(row, 'category') || 'General',
    priority: (str(row, 'priority') || 'medium') as MaintenancePriority,
    status: (str(row, 'status') || 'open') as RequestStatus,
    reportedAt: str(row, 'reported_at'), assignedStaff: str(row, 'assigned_staff'),
    expectedCompletion: optStr(row, 'expected_completion'),
    completedAt: optStr(row, 'completed_at'), description: str(row, 'description'),
  };
}

export function mapTask(row: Row): MaintenanceTask {
  return {
    id: str(row, 'id'), task: str(row, 'task'), location: str(row, 'location'),
    category: str(row, 'category') || 'General', scheduledDate: str(row, 'scheduled_date'),
    assignedStaff: str(row, 'assigned_staff'),
    status: (str(row, 'status') || 'scheduled') as TaskStatus,
    completedAt: optStr(row, 'completed_at'), notes: str(row, 'notes'),
  };
}

export function mapFacility(row: Row): Facility {
  return {
    id: str(row, 'id'), name: str(row, 'name'), kind: str(row, 'kind') || 'Other',
    status: (str(row, 'status') || 'operational') as FacilityStatus, note: str(row, 'note'),
  };
}
