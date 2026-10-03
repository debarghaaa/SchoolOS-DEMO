/* =====================================================================
   Presence — shared record/snapshot shapes for the overview islands.

   Data comes from the live Supabase feed (see ./presence-live.ts); this
   module keeps only the shapes both the islands and the feed client agree
   on, plus the stable hash used for avatar hues.
   ===================================================================== */

export type PresenceStatus = 'present' | 'absent';

export type Audience = 'faculty' | 'staff' | 'student';

export type StaffType =
  | 'Administrative Staff'
  | 'Security'
  | 'Maintenance'
  | 'Transport'
  | 'IT Support'
  | 'Library Staff'
  | 'Laboratory Staff'
  | 'Support Staff';

export interface FacultyPresenceRecord {
  id: string;
  name: string;
  initials: string;
  subject: string;
  dept: string;
  status: PresenceStatus;
  punchIn: string | null;
  punchOut: string | null;
}

export interface StaffPresenceRecord {
  id: string;
  name: string;
  initials: string;
  role: string;
  dept: string;
  staffType: StaffType;
  status: PresenceStatus;
  punchIn: string | null;
  punchOut: string | null;
}

export interface StudentPresenceRecord {
  id: string;
  name: string;
  initials: string;
  grade: string;
  section: string;
  roll: string;
  status: PresenceStatus;
  punchIn: string | null;
  punchOut: string | null;
}

export interface PresenceSnapshot<T> {
  records: T[];
  present: number;
  absent: number;
  total: number;
  syncedAt: Date;
}

/** FNV-1a hash — stable per id, used for deterministic avatar hues. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const STAFF_TYPES: StaffType[] = [
  'Administrative Staff',
  'Security',
  'Maintenance',
  'Transport',
  'IT Support',
  'Library Staff',
  'Laboratory Staff',
  'Support Staff',
];
