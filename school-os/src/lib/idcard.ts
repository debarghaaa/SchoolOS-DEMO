import { INTAKE_LABEL, STAFF, STUDENTS, TEACHERS } from './data';
import type { Role, StaffMember, Student, Teacher } from './types';

/* =====================================================================
   Digital ID cards + QR verification.

   Every card renders ONLY canonical records (the same Student / Teacher /
   StaffMember objects every other module uses). The QR encodes a single
   opaque credential inside a /verify/<token> URL — never names, contact
   details, or any other profile field. Two token namespaces:

   - live:  uuid stored in Supabase `id_tokens`, resolved server-side by
            the SECURITY DEFINER verify_id_token() RPC (safe projection);
   - demo:  d1.<role>.<pid>.<ver>.<sig8> — deterministic, tamper-evident,
            resolved locally from canonical data. Demo-grade by design.

   Regenerating (admin) rotates the credential: previously issued QR codes
   stop verifying in both namespaces.
   ===================================================================== */

export type IdRole = 'student' | 'teacher' | 'employee';

export const SCHOOL = {
  name: 'Northview High',
  place: 'Kolkata',
  trust: 'Northview Trust',
  code: 'NVH',
  slug: 'northview-high',
} as const;

export interface IdCardLine {
  label: string;
  value: string;
}

export interface IdCardData {
  role: IdRole;
  profileKey: string;
  fullName: string;
  initials: string;
  institutionalId: string;
  roleLabel: string;
  lines: IdCardLine[];
  session: string;
  email: string;
  phone: string;
  guardian: string;
  hue: number;
}

export function studentCard(s: Student): IdCardData {
  return {
    role: 'student',
    profileKey: s.id,
    fullName: s.name,
    initials: s.initials,
    institutionalId: s.id,
    roleLabel: 'Student',
    lines: [
      { label: 'Class', value: `${s.grade}-${s.section}` },
      { label: 'Roll No', value: s.roll },
      { label: 'House', value: s.house },
    ],
    session: INTAKE_LABEL,
    email: s.email,
    phone: s.phone,
    guardian: s.guardian,
    hue: hashStr(s.id),
  };
}

export function teacherCard(t: Teacher): IdCardData {
  return {
    role: 'teacher',
    profileKey: t.id,
    fullName: t.name,
    initials: t.initials,
    institutionalId: t.id,
    roleLabel: 'Faculty',
    lines: [
      { label: 'Department', value: t.dept },
      { label: 'Subject', value: t.subject },
      { label: 'Classes', value: t.classes.join(', ') },
    ],
    session: INTAKE_LABEL,
    email: t.email,
    phone: t.phone,
    guardian: '',
    hue: hashStr(t.id),
  };
}

export function staffCard(s: StaffMember): IdCardData {
  return {
    role: 'employee',
    profileKey: s.id,
    fullName: s.name,
    initials: s.initials,
    institutionalId: s.id,
    roleLabel: 'Staff',
    lines: [
      { label: 'Designation', value: s.role },
      { label: 'Department', value: s.dept },
    ],
    session: '',
    email: s.email,
    phone: s.phone,
    guardian: '',
    hue: hashStr(s.id),
  };
}

/* ---------------- private-field visibility ----------------
   Contact details (and guardian info) print on a card only when the
   viewer is permitted to see them. The public verification page never
   receives them regardless of role. */

export type CardRelation = 'self' | 'linked' | 'assigned' | 'other';

export function canSeePrivate(viewer: Role, relation: CardRelation): boolean {
  if (viewer === 'school-admin' || viewer === 'super-admin') return true;
  if (relation === 'self') return true;
  if (viewer === 'teacher' && relation === 'assigned') return true;
  if (viewer === 'parent' && relation === 'linked') return true;
  return false;
}

/* ---------------- hashing + demo token codec ---------------- */

export function hashStr(input: string): number {
  // cyrb53 — tiny deterministic sync hash for demo tokens and hues.
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

function hex8(input: string): string {
  return (hashStr(input) % 0xffffffff).toString(16).padStart(8, '0');
}

const DEMO_SALT = 'northview-id-demo-v1';

export function tokenKey(role: IdRole, pid: string): string {
  return `${role}:${pid}`;
}

export function demoToken(role: IdRole, pid: string, version: number): string {
  const sig = hex8(`${SCHOOL.slug}:${role}:${pid}:${version}:${DEMO_SALT}`);
  return `d1.${role}.${pid}.${version}.${sig}`;
}

export interface ParsedDemoToken {
  role: IdRole;
  pid: string;
  version: number;
}

export function parseDemoToken(token: string): ParsedDemoToken | null {
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'd1') return null;
  const [, role, pid, ver, sig] = parts;
  if (role !== 'student' && role !== 'teacher' && role !== 'employee') return null;
  if (!pid || !/^\d+$/.test(ver)) return null;
  const version = Number(ver);
  if (demoToken(role, pid, version) !== token) return null; // bad signature
  void sig;
  return { role, pid, version };
}

export function isUuidToken(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
}

export function verifyDeepLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/verify/${token}`;
}

/* ---------------- demo credential store ----------------
   Version per profile; regenerating bumps it, which invalidates older
   demo QR codes at verify time. Module-level like the other demo stores. */

const demoVersions = new Map<string, number>();
const demoVersionListeners = new Set<() => void>();

export function idTokenVersion(role: IdRole, pid: string): number {
  return demoVersions.get(tokenKey(role, pid)) ?? 1;
}

export function bumpIdTokenVersion(role: IdRole, pid: string): number {
  const next = idTokenVersion(role, pid) + 1;
  demoVersions.set(tokenKey(role, pid), next);
  demoVersionListeners.forEach((l) => l());
  return next;
}

export function subscribeIdTokenVersions(fn: () => void): () => void {
  demoVersionListeners.add(fn);
  return () => { demoVersionListeners.delete(fn); };
}

/* ---------------- verification resolution (demo namespace) ---------------- */

export interface VerifiedProfile {
  school: string;
  role: IdRole;
  roleLabel: string;
  name: string;
  initials: string;
  institutionalId: string;
  line1: string;
  line2: string;
  version: number;
  source: 'demo' | 'live';
}

export type VerifyResult =
  | { status: 'valid'; profile: VerifiedProfile }
  | { status: 'invalid'; reason: 'malformed' | 'unknown' | 'tampered' | 'revoked' | 'live-unavailable' | 'live-error' };

export function cardForVerified(p: VerifiedProfile): IdCardData {
  return {
    role: p.role,
    profileKey: p.institutionalId,
    fullName: p.name,
    initials: p.initials,
    institutionalId: p.institutionalId,
    roleLabel: p.roleLabel,
    lines: [
      { label: p.role === 'student' ? 'Class' : 'Detail', value: p.line1 },
      { label: 'Status', value: p.line2 },
    ],
    session: '',
    email: '',
    phone: '',
    guardian: '',
    hue: hashStr(p.institutionalId),
  };
}

export function resolveDemoVerification(token: string): VerifyResult {
  const parsed = parseDemoToken(token);
  if (!parsed) {
    // Distinguish "not our format" from "our format, forged signature".
    const parts = token.split('.');
    if (parts.length === 5 && parts[0] === 'd1') return { status: 'invalid', reason: 'tampered' };
    return { status: 'invalid', reason: 'malformed' };
  }
  const { role, pid, version } = parsed;
  if (version !== idTokenVersion(role, pid)) return { status: 'invalid', reason: 'revoked' };
  if (role === 'student') {
    const s = STUDENTS.find((x) => x.id === pid);
    if (!s) return { status: 'invalid', reason: 'unknown' };
    const card = studentCard(s);
    return {
      status: 'valid',
      profile: {
        school: SCHOOL.name, role, roleLabel: 'Student', name: card.fullName,
        initials: card.initials, institutionalId: card.institutionalId,
        line1: `${s.grade}-${s.section} · Roll ${s.roll}`, line2: `House ${s.house}`,
        version, source: 'demo',
      },
    };
  }
  if (role === 'teacher') {
    const t = TEACHERS.find((x) => x.id === pid);
    if (!t) return { status: 'invalid', reason: 'unknown' };
    return {
      status: 'valid',
      profile: {
        school: SCHOOL.name, role, roleLabel: 'Faculty', name: t.name,
        initials: t.initials, institutionalId: t.id,
        line1: `${t.subject} · ${t.dept}`, line2: t.classes.join(', '),
        version, source: 'demo',
      },
    };
  }
  const m = STAFF.find((x) => x.id === pid);
  if (!m) return { status: 'invalid', reason: 'unknown' };
  return {
    status: 'valid',
    profile: {
      school: SCHOOL.name, role, roleLabel: 'Staff', name: m.name,
      initials: m.initials, institutionalId: m.id,
      line1: `${m.role} · ${m.dept}`, line2: m.status,
      version, source: 'demo',
    },
  };
}
