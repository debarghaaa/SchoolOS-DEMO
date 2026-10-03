import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* =====================================================================
   Live presence feed — Supabase session management.

   The islands never assert their own role or tenant. They authenticate to
   the FastAPI backend (which validates the password and resolves the real
   membership), then exchange that session for a Supabase feed token whose
   server-stamped `app_metadata` claims drive RLS. See supabase/README.md.
   ===================================================================== */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** Same-origin `/api` through the Vite proxy by default; override to point elsewhere. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export const FEED_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Feed source: the live Supabase feed when configured, else the temporary
 *  FastAPI demo feed served from the local database (badged "Demo" in UI). */
export const FEED_SOURCE: 'supabase' | 'demo' = FEED_CONFIGURED ? 'supabase' : 'demo';

export interface FeedClaims {
  tenantId: string;
  role: string;
  classes: string[];
  /** JWT `sub`: the caller's profile id by directory convention. */
  userId: string;
}

export class FeedError extends Error {
  status: number | null;
  constructor(name: string, message: string, status: number | null = null) {
    super(message);
    this.name = name;
    this.status = status;
  }
}

export const notConfigured = () => new FeedError(
  'NotConfiguredError',
  'Presence feed is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
);
export const signinRequired = () => new FeedError(
  'SigninRequiredError',
  'Connect with your school login to stream the live presence feed.',
);

const LS_ACCESS = 'schoolos.feed.access';
const LS_REFRESH = 'schoolos.feed.refresh';

interface Envelope<T> { success: boolean; data: T | null; error: { code: string; message: string } | null }
interface TokenPair { access_token: string; refresh_token: string }
interface MembershipOption { tenant_id: string; tenant_slug: string | null; tenant_name: string | null; role: string }
interface LoginResponse {
  tokens: TokenPair | null;
  user: { email: string };
  memberships: MembershipOption[];
  requires_selection: boolean;
  select_token: string | null;
  can_access_platform: boolean;
}

interface UserSummary {
  email: string;
  tenant_id: string | null;
  role: string | null;
}

async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    throw new FeedError(
      body?.error?.code === 'forbidden' ? 'ForbiddenError' : 'FeedApiError',
      body?.error?.message ?? `Request failed (${res.status}).`,
    );
  }
  return body.data as T;
}

/** Decode the (server-signed) feed JWT to route UX. Enforcement stays in RLS. */
export function decodeFeedClaims(accessToken: string): FeedClaims {
  const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
    sub?: string;
    app_metadata?: { tenant_id?: string; role?: string; classes?: string[] };
  };
  const md = payload.app_metadata ?? {};
  if (!md.tenant_id || !md.role) throw new FeedError('ForbiddenError', 'Feed session carries no tenant claims.');
  return { tenantId: md.tenant_id, role: md.role, classes: md.classes ?? [], userId: payload.sub ?? '' };
}

/** A feed-scoped client carrying the feed JWT. Realtime auth is set explicitly. */
export function feedClient(feedToken: string): SupabaseClient {
  const client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    global: { headers: { Authorization: `Bearer ${feedToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  client.realtime.setAuth(feedToken);
  return client;
}

/* ---------------- FastAPI session + exchange ---------------- */

export interface TenantChoice { selectToken: string; options: MembershipOption[] }

export class TenantChoiceNeeded extends Error {
  choice: TenantChoice;
  constructor(choice: TenantChoice) {
    super('Choose a school to continue.');
    this.name = 'TenantChoiceNeeded';
    this.choice = choice;
  }
}

function storeTokens(pair: TokenPair) {
  localStorage.setItem(LS_ACCESS, pair.access_token);
  localStorage.setItem(LS_REFRESH, pair.refresh_token);
}

/** Authenticated FastAPI call for feed consumers (demo source). */
export function feedApi<T>(path: string, token: string): Promise<T> {
  return api<T>(path, { method: 'GET' }, token);
}

/** Authenticated FastAPI mutation for API consumers (POST/DELETE etc.). */
export async function feedMutate<T>(path: string, token: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.success) {
    const code = body?.error?.code ?? '';
    throw new FeedError(
      code === 'forbidden' ? 'ForbiddenError'
        : code === 'rate_limited' ? 'RateLimitedError' : 'FeedApiError',
      body?.error?.message ?? `Request failed (${res.status}).`,
      res.status,
    );
  }
  return body.data as T;
}

export function clearFeedSession() {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  feedState.client = null;
  feedState.claims = null;
  feedState.demo = null;
}

async function finishLogin(data: LoginResponse): Promise<TokenPair> {
  if (data.tokens) return data.tokens;
  if (data.requires_selection && data.select_token) {
    if (data.memberships.length === 1) {
      const picked = await api<LoginResponse>('/auth/select-tenant', {
        method: 'POST',
        body: JSON.stringify({ select_token: data.select_token, tenant_id: data.memberships[0].tenant_id }),
      });
      if (picked.tokens) return picked.tokens;
    }
    if (data.memberships.length > 0) {
      throw new TenantChoiceNeeded({ selectToken: data.select_token, options: data.memberships });
    }
  }
  throw new FeedError('ForbiddenError', 'This login has no school membership to stream presence for.');
}

export async function loginAndStore(email: string, password: string): Promise<void> {
  const data = await api<LoginResponse>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  storeTokens(await finishLogin(data));
}

export async function selectTenantAndStore(selectToken: string, tenantId: string): Promise<void> {
  const picked = await api<LoginResponse>('/auth/select-tenant', {
    method: 'POST', body: JSON.stringify({ select_token: selectToken, tenant_id: tenantId }),
  });
  if (!picked.tokens) throw new FeedError('FeedApiError', 'School selection did not return a session.');
  storeTokens(picked.tokens);
}

async function exchangeWith(access: string): Promise<{ token: string; claims: FeedClaims }> {
  const out = await api<{ access_token: string }>('/auth/supabase-token', { method: 'POST' }, access);
  return { token: out.access_token, claims: decodeFeedClaims(out.access_token) };
}

/* ---------------- Shared feed state (one session, all islands) ---------------- */

export interface DemoSession {
  token: string;
  claims: FeedClaims;
}

interface FeedState {
  client: SupabaseClient | null;
  claims: FeedClaims | null;
  demo: DemoSession | null;
  email: string | null;
  inflight: Promise<SupabaseClient> | null;
}

const feedState: FeedState = { client: null, claims: null, demo: null, email: null, inflight: null };

export function feedClaims(): FeedClaims | null {
  return feedState.claims;
}

export function feedEmail(): string | null {
  return feedState.email;
}

/** Resolve the shared authed client, refreshing/exchanging as needed. */
export function ensureFeedClient(): Promise<SupabaseClient> {
  if (feedState.client) return Promise.resolve(feedState.client);
  if (feedState.inflight) return feedState.inflight;
  feedState.inflight = (async () => {
    if (!FEED_CONFIGURED) throw notConfigured();
    let access = localStorage.getItem(LS_ACCESS);
    const refresh = localStorage.getItem(LS_REFRESH);
    if (!access) throw signinRequired();
    try {
      const { token, claims } = await exchangeWith(access);
      feedState.client = feedClient(token);
      feedState.claims = claims;
      return feedState.client;
    } catch (e) {
      if ((e as Error).name !== 'FeedApiError' || !refresh) throw e;
      // Access token may have expired: refresh the FastAPI session once, then retry.
      try {
        const pair = await api<TokenPair>('/auth/refresh', {
          method: 'POST', body: JSON.stringify({ refresh_token: refresh }),
        });
        storeTokens(pair);
        access = pair.access_token;
      } catch {
        clearFeedSession();
        throw signinRequired();
      }
      try {
        const { token, claims } = await exchangeWith(access);
        feedState.client = feedClient(token);
        feedState.claims = claims;
        return feedState.client;
      } catch {
        clearFeedSession();
        throw signinRequired();
      }
    }
  })();
  try {
    return feedState.inflight;
  } finally {
    feedState.inflight.then(
      () => { feedState.inflight = null; },
      () => { feedState.inflight = null; },
    );
  }
}

async function demoFromAccess(access: string): Promise<DemoSession> {
  const me = await api<UserSummary>('/auth/me', {}, access);
  if (!me.tenant_id || !me.role) {
    throw new FeedError('ForbiddenError', 'This login has no school membership to stream presence for.');
  }
  const claims: FeedClaims = { tenantId: me.tenant_id, role: me.role, classes: [], userId: '' };
  feedState.demo = { token: access, claims };
  feedState.claims = claims;
  feedState.email = me.email;
  return feedState.demo;
}

/** Resolve the shared demo session, refreshing the FastAPI tokens as needed. */
export async function ensureDemoSession(): Promise<DemoSession> {
  if (feedState.demo) return feedState.demo;
  const access = localStorage.getItem(LS_ACCESS);
  const refresh = localStorage.getItem(LS_REFRESH);
  if (!access) throw signinRequired();
  try {
    return await demoFromAccess(access);
  } catch (e) {
    // Only a 401 (expired access token) is worth a refresh + retry.
    if (!(e instanceof FeedError) || e.status !== 401 || !refresh) throw e;
    try {
      const pair = await api<TokenPair>('/auth/refresh', {
        method: 'POST', body: JSON.stringify({ refresh_token: refresh }),
      });
      storeTokens(pair);
      return await demoFromAccess(pair.access_token);
    } catch {
      clearFeedSession();
      throw signinRequired();
    }
  }
}

/** Establish the feed session after a stored FastAPI login (either source). */
async function finishConnect(): Promise<FeedClaims> {
  const access = localStorage.getItem(LS_ACCESS) as string;
  if (!FEED_CONFIGURED) return (await demoFromAccess(access)).claims;
  const { token, claims } = await exchangeWith(access);
  feedState.client = feedClient(token);
  feedState.claims = claims;
  return claims;
}

/** Full interactive connect: login (or tenant pick) then feed session. */
export async function connectFeed(email: string, password: string): Promise<FeedClaims> {
  await loginAndStore(email, password);
  feedState.email = email;
  return finishConnect();
}

export async function connectFeedWithTenant(choice: TenantChoice, tenantId: string): Promise<FeedClaims> {
  await selectTenantAndStore(choice.selectToken, tenantId);
  return finishConnect();
}
