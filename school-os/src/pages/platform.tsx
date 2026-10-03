import { useState } from 'react';
import {
  ArrowUpRight, Ban, Building2, Check, Download, Plus, Power, RotateCcw, ShieldCheck, X,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, sessionFor, useScopedQuery } from '../lib/api';
import { canDo } from '../lib/permissions';
import { inr } from '../lib/platform-data';
import type { Role } from '../lib/types';
import { useApp } from '../lib/store';
import type { AuditLog, Invoice, PlatformUser, Tenant } from '../lib/types';
import { cn } from '../lib/utils';
import {
  Avatar, Can, ChartCard, DataTable, Drawer, ErrorState, FieldLabel, GlassButton,
  GlassCard, GlassInput, GlassSelect, LoadingCards, Modal, SectionHead, StatusBadge, type Column,
} from '../components/glass';
import { ChartTip } from './dashboard';

const CH = { hi: 'var(--color-baby-blue-ice)', mid: 'var(--color-periwinkle-3)', low: 'var(--color-periwinkle-2)' };

function Gate({ loading, error, reload, children }: { loading: boolean; error: Error | null; reload: () => void; children: React.ReactNode }) {
  if (loading) return <LoadingCards count={3} />;
  if (error) return <GlassCard><ErrorState title={error.name === 'ForbiddenError' ? 'Not authorized' : 'Could not load'} body={error.message} onRetry={reload} /></GlassCard>;
  return <>{children}</>;
}

const TENANT_TONE: Record<Tenant['status'], string> = { active: 'graded', trial: 'pending', suspended: 'overdue', churned: 'closed' };

/* ================= SCHOOLS ================= */
export function Schools() {
  const { role, go, pushToast } = useApp();
  const q = useScopedQuery(`platform:tenants:${role}`, () => api.tenants(sessionFor(role)));
  const [plan, setPlan] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <Gate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (() => {
        const rows = q.data!.filter((t) => plan === 'all' || t.plan === plan);
        const active = q.data!.filter((t) => t.status === 'active').length;
        return (
          <div className="animate-fade-up space-y-5">
            <div className="grid gap-5 sm:grid-cols-4">
              {[
                { l: 'Total schools', v: String(q.data!.length) },
                { l: 'Active', v: String(active) },
                { l: 'In trial', v: String(q.data!.filter((t) => t.status === 'trial').length) },
                { l: 'Combined MRR', v: inr(q.data!.reduce((a, t) => a + t.mrr, 0)) },
              ].map((s) => (
                <GlassCard key={s.l} hover>
                  <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
                  <p className="font-display mt-2 text-[30px] leading-none font-bold text-text-primary tabular-nums">{s.v}</p>
                </GlassCard>
              ))}
            </div>
            <GlassCard>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <SectionHead title="All schools" body={`${rows.length} tenants on Northview Cloud`} />
                <div className="flex gap-2">
                  <GlassSelect value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Filter by plan">
                    <option value="all">All plans</option>
                    <option value="Starter">Starter</option>
                    <option value="Growth">Growth</option>
                    <option value="Enterprise">Enterprise</option>
                  </GlassSelect>
                  <Can do="tenant.create">
                    <GlassButton variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>Create school</GlassButton>
                  </Can>
                </div>
              </div>
              <DataTable
                rows={rows} pageSize={8}
                columns={[
                  {
                    key: 'school', header: 'School', sortable: true, sortValue: (r) => r.school,
                    render: (r, i) => (
                      <span className="flex items-center gap-3">
                        <Avatar initials={r.school.split(' ').map((w) => w[0]).slice(0, 2).join('')} index={i} />
                        <span><span className="block font-semibold">{r.school}</span><span className="block font-mono text-[11px] text-text-secondary">{r.id} · {r.city}</span></span>
                      </span>
                    ),
                  },
                  { key: 'plan', header: 'Plan', render: (r) => <StatusBadge tone={r.plan === 'Enterprise' ? 'active' : 'neutral'}>{r.plan}</StatusBadge> },
                  { key: 'students', header: 'Students', sortable: true, sortValue: (r) => r.students, render: (r) => <span className="font-mono tabular-nums">{r.students.toLocaleString()}</span> },
                  {
                    key: 'health', header: 'Health', sortable: true, sortValue: (r) => r.health,
                    render: (r) => (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-periwinkle-2/40">
                          <span className={cn('block h-full rounded-full', r.health >= 90 ? 'bg-periwinkle-3' : r.health >= 75 ? 'bg-warning' : 'bg-error')} style={{ width: `${r.health}%` }} />
                        </span>
                        <span className="font-mono text-[12px] tabular-nums">{r.health}%</span>
                      </span>
                    ),
                  },
                  { key: 'mrr', header: 'MRR', sortable: true, sortValue: (r) => r.mrr, render: (r) => <span className="font-mono font-semibold tabular-nums">{r.mrr === 0 ? '—' : inr(r.mrr)}</span> },
                  { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={TENANT_TONE[r.status]} dot>{r.status}</StatusBadge> },
                  { key: 'act', header: '', render: () => <GlassButton size="sm" variant="ghost" icon={<ArrowUpRight size={13} />} onClick={() => go('tenants')}>Manage</GlassButton> },
                ]}
                searchable searchKeys={['school', 'city', 'id']}
                searchPlaceholder="Search schools, cities, IDs…"
              />
            </GlassCard>
            <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create school" subtitle="Provisions an isolated tenant."
              footer={<>
                <GlassButton variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</GlassButton>
                <GlassButton variant="primary" onClick={async () => {
                  const res = await api.createTenant(sessionFor(role), name || 'Untitled School');
                  setCreateOpen(false); setName('');
                  pushToast({ title: 'Tenant provisioned', body: `${res.id} is ready for onboarding.`, tone: 'success' });
                }}>Provision</GlassButton>
              </>}>
              <FieldLabel>School name</FieldLabel>
              <GlassInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside Public School" />
            </Modal>
          </div>
        );
      })()}
    </Gate>
  );
}

/* ================= TENANTS ================= */
export function Tenants() {
  const { role, pushToast } = useApp();
  const q = useScopedQuery(`platform:tenants:${role}`, () => api.tenants(sessionFor(role)));
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Tenant['status']>>({});

  const statusOf = (t: Tenant) => statuses[t.id] ?? t.status;

  return (
    <Gate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (
        <div className="animate-fade-up">
          <GlassCard>
            <SectionHead title="Tenant operations" body="Lifecycle, regions, SSO and storage per tenant" />
            <div className="grid gap-3 md:grid-cols-2">
              {q.data!.map((t) => {
                const st = statusOf(t);
                return (
                  <div key={t.id} className="rounded-[20px] border border-periwinkle-2/40 bg-white/35 p-4 transition-all duration-300 hover:-translate-y-[2px] hover:bg-lavender-2/70">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-[15.5px] font-bold tracking-tight text-text-primary">{t.school}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-text-secondary">{t.id} · ap-south-1 · {t.city}</p>
                      </div>
                      <StatusBadge tone={TENANT_TONE[st]} dot>{st}</StatusBadge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      {[['Users', `${(t.students + t.staff).toLocaleString()}`], ['Storage', `${t.storageGb} GB`], ['SSO', t.sso ? 'On' : 'Off']].map(([l, v]) => (
                        <div key={l} className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-2 py-2">
                          <p className="font-mono text-[12px] font-bold text-text-primary">{v}</p>
                          <p className="font-mono text-[9.5px] tracking-wider text-text-secondary uppercase">{l}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <GlassButton size="sm" className="flex-1" onClick={() => setSelected(t)}>Configure</GlassButton>
                      <Can do="tenant.manage">
                        {st === 'suspended' ? (
                          <GlassButton size="sm" icon={<Power size={13} />} onClick={() => { setStatuses((p) => ({ ...p, [t.id]: 'active' })); pushToast({ title: 'Tenant reactivated', body: `${t.school} is live again.`, tone: 'success' }); }}>Reactivate</GlassButton>
                        ) : (
                          <GlassButton size="sm" variant="danger-ghost" icon={<Ban size={13} />} onClick={() => { setStatuses((p) => ({ ...p, [t.id]: 'suspended' })); pushToast({ title: 'Tenant suspended', body: `${t.school} logins are now blocked.`, tone: 'warning' }); }}>Suspend</GlassButton>
                        )}
                      </Can>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.school ?? ''} subtitle={selected ? `${selected.id} · ${selected.plan} plan · renews ${selected.renewed}` : ''}
            footer={<GlassButton variant="primary" onClick={() => { setSelected(null); pushToast({ title: 'Tenant saved', body: 'Configuration applied to all regions.', tone: 'success' }); }}>Save configuration</GlassButton>}>
            {selected && (
              <div className="space-y-3.5">
                <div><FieldLabel>Custom domain</FieldLabel><GlassInput defaultValue={`${selected.school.toLowerCase().split(' ')[0]}.northview.cloud`} className="font-mono" /></div>
                <div><FieldLabel>Region</FieldLabel><GlassSelect><option>ap-south-1 (Mumbai)</option><option>ap-south-2 (Hyderabad)</option></GlassSelect></div>
                <ToggleRow label="Single sign-on (SAML)" sub="Enforced for staff" initial={selected.sso} />
                <ToggleRow label="Guardian SMS digest" sub="Batch parent notifications" initial />
                <ToggleRow label="Maintenance window" sub="Sundays 02:00–04:00 IST" initial={false} />
                <div className="rounded-2xl border border-error/50 bg-white/40 p-4">
                  <p className="text-[13px] font-bold text-error">Danger zone</p>
                  <p className="mt-1 text-[12px] text-text-secondary">Offboarding wipes tenant data after a 30-day hold.</p>
                  <GlassButton size="sm" variant="danger-ghost" className="mt-2" icon={<Ban size={13} />} onClick={() => pushToast({ title: 'Offboarding scheduled', body: 'Legal hold applied · data retained 30 days.', tone: 'warning' })}>Offboard tenant</GlassButton>
                </div>
              </div>
            )}
          </Drawer>
        </div>
      )}
    </Gate>
  );
}

function ToggleRow({ label, sub, initial }: { label: string; sub: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button onClick={() => setOn(!on)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-3 text-left">
      <span className={cn('relative h-[22px] w-10 shrink-0 rounded-full transition-colors', on ? 'bg-periwinkle-3' : 'bg-lavender-2')}>
        <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-[3px]')} />
      </span>
      <span className="flex-1"><span className="block text-[13px] font-bold text-text-primary">{label}</span><span className="block font-mono text-[10.5px] text-text-secondary">{sub}</span></span>
    </button>
  );
}

/* ================= USERS ================= */
export function PlatformUsers() {
  const { role, pushToast } = useApp();
  const [roleFilter, setRoleFilter] = useState('all');
  const q = useScopedQuery(`platform:users:${role}`, () => api.platformUsers(sessionFor(role)));

  const cols: Column<PlatformUser>[] = [
    {
      key: 'name', header: 'User', sortable: true, sortValue: (r) => r.name,
      render: (r, i) => (
        <span className="flex items-center gap-3">
          <Avatar initials={r.initials} index={i} />
          <span><span className="block font-semibold">{r.name}</span><span className="block font-mono text-[11px] text-text-secondary">{r.id} · {r.email}</span></span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', render: (r) => <StatusBadge tone={r.role === 'School Admin' ? 'active' : 'neutral'}>{r.role}</StatusBadge> },
    { key: 'tenant', header: 'Tenant', render: (r) => <span className="text-text-secondary">{r.tenant}</span> },
    { key: 'active', header: 'Last active', render: (r) => <span className="font-mono text-[12px] text-text-secondary">{r.lastActive}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={r.status === 'active' ? 'graded' : r.status === 'locked' ? 'overdue' : 'pending'} dot>{r.status}</StatusBadge> },
    {
      key: 'act', header: '',
      render: (r) => (
        <Can do="platformuser.manage">
          <GlassButton size="sm" variant="ghost" onClick={() => pushToast({ title: r.status === 'locked' ? 'Account unlocked' : 'Session reset', body: `${r.email} notified by email.`, tone: 'success' })}>
            {r.status === 'locked' ? 'Unlock' : 'Reset'}
          </GlassButton>
        </Can>
      ),
    },
  ];

  return (
    <Gate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (
        <div className="animate-fade-up">
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionHead title="Platform users" body="Identities across all tenants" />
              <div className="flex gap-2">
                <GlassSelect value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
                  <option value="all">All roles</option>
                  <option value="School Admin">School Admin</option>
                  <option value="Teacher">Teacher</option>
                  <option value="Student">Student</option>
                </GlassSelect>
                <Can do="platformuser.manage">
                  <GlassButton variant="primary" icon={<Plus size={15} />} onClick={() => pushToast({ title: 'Invite sent', body: 'Admin invite dispatched with 48-hr expiry.', tone: 'success' })}>Invite admin</GlassButton>
                </Can>
              </div>
            </div>
            <DataTable
              rows={q.data!.filter((u) => roleFilter === 'all' || u.role === roleFilter)}
              columns={cols} pageSize={8}
              searchable searchKeys={['name', 'email', 'tenant']}
              searchPlaceholder="Search name, email or tenant…"
            />
          </GlassCard>
        </div>
      )}
    </Gate>
  );
}

/* ================= SUBSCRIPTIONS ================= */
export function Subscriptions() {
  const { role, pushToast } = useApp();
  const q = useScopedQuery(`platform:billing:${role}`, () => api.billing(sessionFor(role)));
  const [planOpen, setPlanOpen] = useState<Invoice | null>(null);

  const cols: Column<Invoice>[] = [
    { key: 'id', header: 'Invoice', render: (r) => <span className="font-mono text-[12px] font-semibold">{r.id}</span> },
    { key: 'tenant', header: 'Tenant', sortable: true, sortValue: (r) => r.tenant, render: (r) => <span className="font-semibold">{r.tenant}</span> },
    { key: 'plan', header: 'Plan', render: (r) => <StatusBadge tone={r.plan === 'Enterprise' ? 'active' : 'neutral'}>{r.plan}</StatusBadge> },
    { key: 'amount', header: 'Amount', sortable: true, sortValue: (r) => r.amount, render: (r) => <span className="font-mono font-semibold tabular-nums">{inr(r.amount)}</span> },
    { key: 'due', header: 'Due', render: (r) => <span className="font-mono text-[12px] text-text-secondary">{r.due}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={r.status === 'paid' ? 'graded' : r.status === 'due' ? 'pending' : 'overdue'} dot>{r.status}</StatusBadge> },
    {
      key: 'act', header: '',
      render: (r) => (
        <Can do="billing.manage">
          <GlassButton size="sm" variant="ghost" onClick={() => setPlanOpen(r)}>Change plan</GlassButton>
        </Can>
      ),
    },
  ];

  return (
    <Gate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (
        <div className="animate-fade-up space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <GlassCard hover>
              <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">MRR</p>
              <p className="font-display mt-2 text-[32px] leading-none font-bold tabular-nums">{inr(q.data!.mrr)}</p>
              <p className="mt-2 text-[12.5px] text-text-secondary">+6.1% month over month</p>
            </GlassCard>
            <GlassCard hover>
              <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">Open invoices</p>
              <p className="font-display mt-2 text-[32px] leading-none font-bold tabular-nums">{q.data!.invoices.filter((i) => i.status !== 'paid').length}</p>
              <p className="mt-2 text-[12.5px] text-text-secondary">1 overdue · auto-retry on</p>
            </GlassCard>
            <GlassCard hover>
              <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">Trial conversion</p>
              <p className="font-display mt-2 text-[32px] leading-none font-bold tabular-nums">64%</p>
              <p className="mt-2 text-[12.5px] text-text-secondary">trailing 90 days</p>
            </GlassCard>
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <GlassCard className="xl:col-span-2">
              <SectionHead title="Invoices" body="Latest billing across tenants"
                action={<GlassButton size="sm" icon={<Download size={14} />} onClick={() => pushToast({ title: 'Ledger exported', body: 'billing-sep-2026.csv downloaded.', tone: 'info' })}>Export</GlassButton>} />
              <DataTable rows={q.data!.invoices} columns={cols} pageSize={6} />
            </GlassCard>
            <ChartCard title="MRR by plan" subtitle="₹ lakhs · recurring">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={q.data!.mix} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="plan" axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={<ChartTip suffix="L" />} cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }} />
                    <Bar dataKey="mrr" name="MRR ₹L" radius={[6, 10, 10, 6]} barSize={26}>
                      {q.data!.mix.map((p, i) => <Cell key={p.plan} fill={i === 2 ? CH.hi : i === 1 ? CH.mid : CH.low} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {q.data!.mix.map((p) => (
                <div key={p.plan} className="mt-1.5 flex justify-between text-[12px]"><span className="text-text-secondary">{p.plan}</span><span className="font-mono font-semibold tabular-nums">{p.tenants} tenants</span></div>
              ))}
            </ChartCard>
          </div>
          <Modal open={!!planOpen} onClose={() => setPlanOpen(null)} title={`Change plan · ${planOpen?.tenant ?? ''}`} subtitle="Prorated immediately · effective next cycle."
            footer={<>
              <GlassButton variant="ghost" onClick={() => setPlanOpen(null)}>Cancel</GlassButton>
              <GlassButton variant="primary" onClick={() => { setPlanOpen(null); pushToast({ title: 'Plan updated', body: 'Proration invoice generated automatically.', tone: 'success' }); }}>Apply plan</GlassButton>
            </>}>
            <FieldLabel>New plan</FieldLabel>
            <GlassSelect><option>Starter · ₹24k/mo</option><option>Growth · ₹74k/mo</option><option>Enterprise · custom</option></GlassSelect>
          </Modal>
        </div>
      )}
    </Gate>
  );
}

/* ================= FEATURE FLAGS ================= */
export function FeatureFlags() {
  const { role, pushToast } = useApp();
  const q = useScopedQuery(`platform:flags:${role}`, () => api.flags(sessionFor(role)));
  const [rollouts, setRollouts] = useState<Record<string, number>>({});
  const [prod, setProd] = useState<Record<string, boolean>>({});

  return (
    <Gate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (
        <div className="animate-fade-up">
          <GlassCard>
            <SectionHead title="Feature flags" body="Staged rollouts · changes audit-logged automatically" />
            <div className="space-y-2.5">
              {q.data!.map((f) => {
                const pct = rollouts[f.key] ?? f.rollout;
                const on = prod[f.key] ?? f.production;
                return (
                  <div key={f.id} className="rounded-[20px] border border-periwinkle-2/40 bg-white/35 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-[200px]">
                        <p className="font-display text-[15px] font-bold text-text-primary">{f.name}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-text-secondary">{f.key} · updated {f.updated}</p>
                        <p className="mt-1 text-[12.5px] text-text-secondary">{f.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={f.staging ? 'graded' : 'closed'}>staging {f.staging ? 'on' : 'off'}</StatusBadge>
                        <Can do="flag.manage">
                          <button
                            onClick={() => { setProd((p) => ({ ...p, [f.key]: !on })); pushToast({ title: on ? 'Flag disabled' : 'Flag enabled', body: `${f.key} in production.`, tone: on ? 'warning' : 'success' }); }}
                            className={cn('relative h-[26px] w-12 shrink-0 cursor-pointer rounded-full transition-colors', on ? 'bg-periwinkle-3' : 'bg-lavender-2')}
                            aria-label={`Toggle ${f.name} in production`} aria-pressed={on}
                          >
                            <span className={cn('absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[26px]' : 'left-[3px]')} />
                          </button>
                        </Can>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="font-mono text-[10.5px] tracking-wider text-text-secondary uppercase">rollout</span>
                      <input
                        type="range" min={0} max={100} step={5} value={pct} disabled={!canDoGate(role)}
                        onChange={(e) => setRollouts((p) => ({ ...p, [f.key]: Number(e.target.value) }))}
                        onMouseUp={() => { void api.setFlagRollout(sessionFor(role), f.key, pct); pushToast({ title: 'Rollout updated', body: `${f.key} → ${pct}% of production.`, tone: 'info' }); }}
                        className="h-1.5 flex-1 cursor-pointer accent-periwinkle-3 disabled:cursor-not-allowed"
                        aria-label={`${f.name} rollout percent`}
                      />
                      <span className="w-12 text-right font-mono text-[12px] font-bold tabular-nums">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      )}
    </Gate>
  );
}
function canDoGate(role: Role): boolean {
  return canDo(role, 'flag.manage');
}

/* ================= PLATFORM ANALYTICS ================= */
export function PlatformAnalytics() {
  const { role } = useApp();
  const q = useScopedQuery(`platform:analytics:${role}`, () => api.platformAnalytics(sessionFor(role)));
  return (
    <Gate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (
        <div className="animate-fade-up space-y-5">
          <div className="grid gap-5 sm:grid-cols-4">
            {[['DAU · today', '10,204', '+3.1%'], ['MAU', '14,610', '+2.4%'], ['API p95', '210 ms', '−18 ms'], ['Error budget left', '99.92%', '30d window']].map(([l, v, d]) => (
              <GlassCard key={l} hover>
                <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{l}</p>
                <p className="font-display mt-2 text-[28px] leading-none font-bold tabular-nums">{v}</p>
                <p className="mt-2 font-mono text-[11px] text-text-secondary">{d}</p>
              </GlassCard>
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard title="Active usage" subtitle="DAU vs MAU · trailing 7 weeks">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={q.data!.mau} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gMau" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CH.hi} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={CH.hi} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                    <XAxis dataKey="w" axisLine={false} tickLine={false} dy={6} />
                    <YAxis axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="mau" name="mau" stroke={CH.hi} strokeWidth={2.4} fill="url(#gMau)" dot={false} />
                    <Area type="monotone" dataKey="dau" name="dau" stroke={CH.low} strokeWidth={2} strokeDasharray="5 4" fill="transparent" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard title="API latency (p95)" subtitle="Milliseconds · last 24 hours">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={q.data!.latency} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gLat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CH.mid} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CH.mid} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                    <XAxis dataKey="h" axisLine={false} tickLine={false} dy={6} />
                    <YAxis axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<ChartTip suffix=" ms" />} />
                    <Area type="monotone" dataKey="p95" name="p95" stroke={CH.mid} strokeWidth={2.4} fill="url(#gLat)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard title="Storage by tenant" subtitle="GB · shared drive + backups">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={q.data!.storage} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)" vertical={false} />
                    <XAxis dataKey="tenant" axisLine={false} tickLine={false} dy={6} tick={{ fontSize: 10 }} interval={0} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip suffix=" GB" />} cursor={{ fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)' }} />
                    <Bar dataKey="gb" name="storage" radius={[7, 7, 3, 3]} fill={CH.mid} fillOpacity={0.9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <GlassCard hover>
              <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Service health</h3>
              <div className="mt-3 space-y-2.5">
                {[['API gateway', '99.99%', 99.9], ['Postgres primary', '99.98%', 99.8], ['Redis cache', '100%', 100], ['Object storage', '99.95%', 99.5], ['SMS provider', '98.70%', 96]].map(([k, v, w]) => (
                  <div key={k as string} className="flex items-center gap-3">
                    <span className="w-32 text-[12.5px] font-semibold text-text-primary">{k}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-periwinkle-2/40">
                      <span className="block h-full rounded-full bg-periwinkle-3" style={{ width: `${w}%` }} />
                    </span>
                    <span className="w-14 text-right font-mono text-[11.5px] text-text-secondary tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-success"><ShieldCheck size={13} /> incident-free for 41 days</p>
            </GlassCard>
          </div>
        </div>
      )}
    </Gate>
  );
}

/* ================= AUDIT LOGS ================= */
export function AuditLogs() {
  const { role, pushToast } = useApp();
  const q = useScopedQuery(`platform:audit:${role}`, () => api.auditLogs(sessionFor(role)));
  const [result, setResult] = useState('all');

  const cols: Column<AuditLog>[] = [
    { key: 'time', header: 'Time', render: (r) => <span className="font-mono text-[11.5px] text-text-secondary whitespace-nowrap">{r.time}</span> },
    { key: 'actor', header: 'Actor', render: (r) => <span className="font-mono text-[11.5px]">{r.actor}</span> },
    { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-[12px] font-semibold">{r.action}</span> },
    { key: 'tenant', header: 'Tenant', render: (r) => <span className="text-text-secondary">{r.tenant}</span> },
    { key: 'ip', header: 'IP', render: (r) => <span className="font-mono text-[11.5px] text-text-secondary">{r.ip}</span> },
    {
      key: 'result', header: 'Result',
      render: (r) => r.result === 'allowed'
        ? <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-success bg-white/40 rounded px-1.5 py-0.5"><Check size={12} />ALLOW</span>
        : <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-error bg-white/40 rounded px-1.5 py-0.5"><X size={12} />DENY</span>,
    },
  ];

  return (
    <Gate loading={q.loading} error={q.error} reload={q.reload}>
      {q.data && (
        <div className="animate-fade-up">
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionHead title="Audit trail" body={`${q.data!.length} events · immutable · retained 7 years`} />
              <div className="flex gap-2">
                <GlassSelect value={result} onChange={(e) => setResult(e.target.value)} aria-label="Filter by result">
                  <option value="all">All results</option>
                  <option value="allowed">Allowed</option>
                  <option value="denied">Denied</option>
                </GlassSelect>
                <GlassButton size="sm" icon={<Download size={14} />} onClick={() => pushToast({ title: 'Audit exported', body: 'Signed CSV with checksum downloaded.', tone: 'info' })}>Export</GlassButton>
              </div>
            </div>
            <DataTable
              rows={q.data!.filter((a) => result === 'all' || a.result === result)}
              columns={cols} pageSize={8}
              searchable searchKeys={['actor', 'action', 'tenant']}
              searchPlaceholder="Search actor, action or tenant…"
            />
          </GlassCard>
        </div>
      )}
    </Gate>
  );
}

/* ================= SYSTEM SETTINGS ================= */
export function SystemSettings() {
  const { pushToast } = useApp();
  return (
    <div className="animate-fade-up grid gap-5 xl:grid-cols-2">
      <GlassCard>
        <SectionHead title="Platform configuration" body="Applies to all tenants immediately" />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div><FieldLabel>Default region</FieldLabel><GlassSelect><option>ap-south-1 (Mumbai)</option><option>ap-south-2 (Hyderabad)</option></GlassSelect></div>
          <div><FieldLabel>Backup retention</FieldLabel><GlassSelect><option>30 days</option><option>90 days</option><option>1 year</option></GlassSelect></div>
          <div><FieldLabel>Session timeout</FieldLabel><GlassSelect><option>8 hours</option><option>24 hours</option><option>7 days</option></GlassSelect></div>
          <div><FieldLabel>Password policy</FieldLabel><GlassSelect><option>Standard</option><option>Strict (MFA enforced)</option></GlassSelect></div>
        </div>
        <div className="mt-4 space-y-2">
          <ToggleRow label="Tenant self-signup" sub="Allow trial creation without sales" initial />
          <ToggleRow label="Maintenance mode" sub="Read-only banner for all tenants" initial={false} />
          <ToggleRow label="PII export watermarking" sub="Stamp exports with actor identity" initial />
        </div>
        <div className="mt-5 flex justify-end border-t border-periwinkle-2/40 pt-4">
          <GlassButton variant="primary" onClick={() => pushToast({ title: 'System settings saved', body: 'Propagated to all regions in 40s.', tone: 'success' })}>Save settings</GlassButton>
        </div>
      </GlassCard>

      <div className="space-y-5">
        <GlassCard hover>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Compliance</h3>
          <div className="mt-3 space-y-2.5">
            {[['SOC 2 Type II', 'Valid till Jun 2027', 'graded'], ['ISO 27001', 'Valid till Jan 2027', 'graded'], ['DPDP audit', 'Scheduled Nov 2026', 'pending']].map(([t, s, tone]) => (
              <div key={t} className="rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5">
                <p className="text-[12.5px] font-bold text-text-primary">{t}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-[10.5px] text-text-secondary">{s}</span>
                  <StatusBadge tone={tone}>{tone === 'graded' ? 'Valid' : 'Due'}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard hover>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Operations</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <GlassButton icon={<RotateCcw size={15} />} onClick={() => pushToast({ title: 'Cache purged', body: 'CDN + Redis cleared across regions.', tone: 'info' })}>Purge cache</GlassButton>
            <GlassButton icon={<Building2 size={15} />} onClick={() => pushToast({ title: 'Snapshot started', body: 'Full platform backup queued.', tone: 'info' })}>Run backup</GlassButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
