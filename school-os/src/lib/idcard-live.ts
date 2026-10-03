import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureFeedClient, feedClaims, FeedError, FEED_SOURCE, type FeedClaims,
} from './supabase';
import {
  bumpIdTokenVersion, demoToken, idTokenVersion, isUuidToken,
  resolveDemoVerification, SCHOOL, subscribeIdTokenVersions,
  type IdRole, type VerifiedProfile, type VerifyResult,
} from './idcard';

/* =====================================================================
   ID credentials — live Supabase `id_tokens` rows when configured and the
   canonical record maps to a live row, demo-derived tokens otherwise.

   The QR always encodes an opaque credential; nothing about the live /
   demo split changes what a scan reveals (the safe projection only).
   ===================================================================== */

export const ID_LIVE = FEED_SOURCE === 'supabase';

export type IdNaturalKey =
  | { kind: 'student'; grade: string; section: string; roll: string }
  | { kind: 'teacher'; name: string }
  | { kind: 'employee'; name: string };

export interface IdCredential {
  token: string;
  version: number;
  source: 'live' | 'demo';
  loading: boolean;
  regenerate: () => Promise<void>;
}

/** Canonical record → live row id. Students match on the unique
 *  (grade, section, roll); faculty/staff match on name. */
async function resolveLiveRecord(
  client: SupabaseClient, claims: FeedClaims, natural: IdNaturalKey,
): Promise<string | null> {
  if (natural.kind === 'student') {
    const { data } = await client.from('students').select('id')
      .eq('tenant_id', claims.tenantId)
      .eq('grade', natural.grade).eq('section', natural.section).eq('roll', natural.roll)
      .maybeSingle();
    return (data as unknown as { id: string } | null)?.id ?? null;
  }
  const table = natural.kind === 'teacher' ? 'faculty' : 'staff_members';
  const { data } = await client.from(table).select('id')
    .eq('tenant_id', claims.tenantId).eq('name', natural.name)
    .limit(1).maybeSingle();
  return (data as unknown as { id: string } | null)?.id ?? null;
}

interface TokenRow {
  token: string;
  version: number;
}

async function fetchLiveToken(
  client: SupabaseClient, claims: FeedClaims,
  kind: IdRole, recordId: string,
): Promise<TokenRow | null> {
  const { data, error } = await client.from('id_tokens').select('token,version')
    .eq('school_id', claims.tenantId).eq('kind', kind).eq('record_id', recordId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as TokenRow;
}

export function useIdToken(
  role: IdRole, pid: string, natural: IdNaturalKey,
): IdCredential {
  const [demoVer, setDemoVer] = useState(() => idTokenVersion(role, pid));
  const [live, setLive] = useState<TokenRow | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(ID_LIVE);

  useEffect(() => subscribeIdTokenVersions(() => setDemoVer(idTokenVersion(role, pid))), [role, pid]);

  useEffect(() => {
    if (!ID_LIVE) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ensureFeedClient()
      .then(async (client) => {
        const claims = feedClaims() as FeedClaims;
        const rid = await resolveLiveRecord(client, claims, natural).catch(() => null);
        if (cancelled) return;
        setRecordId(rid);
        if (rid) {
          const row = await fetchLiveToken(client, claims, role, rid).catch(() => null);
          if (!cancelled) setLive(row);
        }
        if (!cancelled) setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // natural is a fresh object per render; key on its stable parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, pid, JSON.stringify(natural)]);

  const regenerate = useCallback(async () => {
    // Demo namespace always rotates so previously shown QR codes die.
    bumpIdTokenVersion(role, pid);
    setDemoVer(idTokenVersion(role, pid));
    if (!ID_LIVE) return;
    const client = await ensureFeedClient();
    const claims = feedClaims() as FeedClaims;
    if (claims.role !== 'school-admin') return; // RLS enforces; skip the round-trip
    const rid = recordId ?? await resolveLiveRecord(client, claims, natural).catch(() => null);
    if (!rid) {
      throw new FeedError('FeedApiError', 'No live record to rotate — the demo credential was rotated instead.');
    }
    const { data, error } = await client.from('id_tokens').upsert({
      school_id: claims.tenantId, kind: role, record_id: rid,
      token: crypto.randomUUID(), version: (live?.version ?? 0) + 1, issued_at: new Date().toISOString(),
    }, { onConflict: 'school_id,kind,record_id' }).select('token,version').single();
    if (error || !data) throw new FeedError('FeedApiError', 'Could not rotate the live credential.');
    setLive(data as unknown as TokenRow);
    setRecordId(rid);
  }, [role, pid, natural, recordId, live?.version]);

  if (live) return { token: live.token, version: live.version, source: 'live', loading, regenerate };
  return { token: demoToken(role, pid, demoVer), version: demoVer, source: 'demo', loading, regenerate };
}

/* ---------------- verification ---------------- */

export async function resolveVerification(token: string): Promise<VerifyResult> {
  if (!isUuidToken(token)) return resolveDemoVerification(token);
  if (!ID_LIVE) return { status: 'invalid', reason: 'live-unavailable' };
  try {
    const client = await ensureFeedClient();
    const { data, error } = await client.rpc('verify_id_token', { p_token: token });
    if (error || !data) return { status: 'invalid', reason: 'live-error' };
    const row = (Array.isArray(data) ? data[0] : data) as unknown as Record<string, string | number | boolean> | undefined;
    if (!row || row.verified !== true) return { status: 'invalid', reason: 'unknown' };
    const kind = String(row.kind) as IdRole;
    const profile: VerifiedProfile = {
      school: SCHOOL.name,
      role: kind,
      roleLabel: kind === 'student' ? 'Student' : kind === 'teacher' ? 'Faculty' : 'Staff',
      name: String(row.display_name ?? ''),
      initials: String(row.display_name ?? '').split(' ').map((w) => w[0]).slice(0, 2).join(''),
      institutionalId: '',
      line1: String(row.line1 ?? ''),
      line2: String(row.line2 ?? ''),
      version: Number(row.version ?? 1),
      source: 'live',
    };
    return { status: 'valid', profile };
  } catch {
    return { status: 'invalid', reason: 'live-error' };
  }
}
