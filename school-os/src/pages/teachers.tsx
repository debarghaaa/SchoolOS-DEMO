import { useMemo, useState } from 'react';
import { Clock, Mail, Plus, Star } from 'lucide-react';
import { STAFF, TEACHERS } from '../lib/data';
import { staffCard, teacherCard } from '../lib/idcard';
import { ProfileIdSection } from '../components/idcard';
import { useApp } from '../lib/store';
import type { StaffMember, Teacher } from '../lib/types';
import {
  Avatar, Can, DataTable, Drawer, FieldLabel, GlassButton, GlassCard, GlassInput, GlassSelect,
  Modal, SectionHead, StatusBadge, type Column,
} from '../components/glass';

const STATUS_TONE: Record<string, string> = { 'full-time': 'active', 'part-time': 'pending', leave: 'late', contract: 'neutral' };

export function Faculty() {
  const { pushToast } = useApp();
  const [dept, setDept] = useState('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<Teacher | null>(null);

  const depts = useMemo(() => ['all', ...Array.from(new Set(TEACHERS.map((t) => t.dept)))], []);
  const deptCount = depts.length - 1;
  const avgLoad = (TEACHERS.reduce((a, t) => a + t.load, 0) / TEACHERS.length).toFixed(1);
  const onLeave = TEACHERS.filter((t) => t.status === 'leave').length;
  const rows = TEACHERS.filter((t) => dept === 'all' || t.dept === dept);

  const columns: Column<Teacher>[] = [
    {
      key: 'name', header: 'Teacher', sortable: true, sortValue: (r) => r.name,
      render: (r, i) => (
        <span className="flex items-center gap-3">
          <Avatar initials={r.initials} index={i} />
          <span>
            <span className="block font-semibold text-text-primary">{r.name}</span>
            <span className="block font-mono text-[11px] text-text-secondary">{r.id} · {r.experience} yrs exp</span>
          </span>
        </span>
      ),
    },
    { key: 'subject', header: 'Subject', sortable: true, sortValue: (r) => r.subject, render: (r) => <span className="font-semibold">{r.subject}</span> },
    { key: 'dept', header: 'Dept', render: (r) => <span className="text-text-secondary">{r.dept}</span> },
    {
      key: 'classes', header: 'Classes',
      render: (r) => <span className="font-mono text-[11.5px] text-text-secondary">{r.classes.join(' · ')}</span>,
    },
    {
      key: 'load', header: 'Load/wk', sortable: true, sortValue: (r) => r.load,
      render: (r) => <span className="font-mono text-[12px] tabular-nums">{r.load} hrs</span>,
    },
    {
      key: 'rating', header: 'Rating', sortable: true, sortValue: (r) => r.rating,
      render: (r) => <span className="inline-flex items-center gap-1 font-mono text-[12px] font-semibold tabular-nums"><Star size={12} className="fill-icon-accent text-icon-accent" />{r.rating.toFixed(1)}</span>,
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={STATUS_TONE[r.status]} dot>{r.status}</StatusBadge> },
  ];

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        {[
          { l: 'Teaching staff', v: String(TEACHERS.length), d: `across ${deptCount} departments` },
          { l: 'Avg. weekly load', v: `${avgLoad} hrs`, d: 'target band 14–18 hrs' },
          { l: 'On leave today', v: String(onLeave), d: 'faculty roster' },
        ].map((s) => (
          <GlassCard key={s.l} hover>
            <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{s.l}</p>
            <p className="font-display mt-2 text-[30px] leading-none font-bold text-text-primary tabular-nums">{s.v}</p>
            <p className="mt-2 text-[12.5px] text-text-secondary">{s.d}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHead title="Faculty roster" body={`${rows.length} teachers · click a row header to sort`} />
          <div className="flex flex-wrap items-center gap-2">
            <GlassSelect value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department">
              {depts.map((d) => <option key={d} value={d}>{d === 'all' ? 'All departments' : d}</option>)}
            </GlassSelect>
            <Can do="teacher.invite">
              <GlassButton variant="primary" icon={<Plus size={15} />} onClick={() => setInviteOpen(true)}>Invite teacher</GlassButton>
            </Can>
          </div>
        </div>
        <DataTable
          rows={rows} columns={columns} pageSize={8}
          searchable searchKeys={['name', 'id', 'subject', 'dept']}
          searchPlaceholder="Search by name, subject or department…"
          onRowClick={setSelected}
        />
      </GlassCard>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite teacher" subtitle="Sends a joining link with department onboarding."
        footer={<>
          <GlassButton variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</GlassButton>
          <GlassButton variant="primary" icon={<Mail size={15} />} onClick={() => { setInviteOpen(false); pushToast({ title: 'Invite sent', body: 'The candidate will receive onboarding steps by email.', tone: 'success' }); }}>Send invite</GlassButton>
        </>}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2"><FieldLabel>Full name</FieldLabel><GlassInput placeholder="e.g. Naina Kulkarni" /></div>
          <div><FieldLabel>Department</FieldLabel><GlassSelect><option>Sciences</option><option>Humanities</option><option>Technology</option><option>Commerce</option><option>Arts</option></GlassSelect></div>
          <div><FieldLabel>Subject</FieldLabel><GlassInput placeholder="e.g. Physics" /></div>
          <div className="sm:col-span-2"><FieldLabel>Email</FieldLabel><GlassInput placeholder="name@mail.com" type="email" /></div>
        </div>
      </Modal>

      <Drawer
        open={!!selected} onClose={() => setSelected(null)}
        title={selected?.name ?? ''} subtitle={selected ? `${selected.id} · ${selected.dept} · ${selected.status}` : ''}
        footer={<GlassButton variant="ghost" onClick={() => setSelected(null)}>Close</GlassButton>}
      >
        {selected && (
          <div className="space-y-4">
            <ProfileIdSection
              card={teacherCard(selected)}
              natural={{ kind: 'teacher', name: selected.name }}
              relation="other"
            />
            <dl className="space-y-2.5 rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4 text-[13px]">
              {[['Subject', selected.subject], ['Classes', selected.classes.join(', ')], ['Load', `${selected.load} hrs / week`], ['Rating', selected.rating.toFixed(1)], ['Email', selected.email], ['Phone', selected.phone]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="truncate text-right font-semibold text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function Staff() {
  const { pushToast } = useApp();
  const [staffSel, setStaffSel] = useState<StaffMember | null>(null);
  return (
    <div className="animate-fade-up space-y-5">
      <GlassCard>
        <SectionHead
          title="Support staff" body={`${STAFF.length} operations & administration members shown`}
          action={<Can do="staff.manage"><GlassButton variant="primary" icon={<Plus size={15} />} onClick={() => pushToast({ title: 'Role drafted', body: 'New staff requisition saved as draft.', tone: 'success' })}>New requisition</GlassButton></Can>}
        />
        <div className="grid gap-3 md:grid-cols-2">
          {STAFF.map((s, i) => (
            <button key={s.id} onClick={() => setStaffSel(s)} className="flex w-full cursor-pointer flex-wrap items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 px-4 py-3.5 text-left transition-all duration-300 hover:-translate-y-[1px] hover:bg-lavender-2/70">
              <Avatar initials={s.initials} index={i} />
              <div className="min-w-[150px] flex-1">
                <p className="text-[13.5px] font-bold text-text-primary">{s.name}</p>
                <p className="font-mono text-[11px] text-text-secondary">{s.id} · {s.role}</p>
              </div>
              <span className="hidden items-center gap-1.5 font-mono text-[11px] text-text-secondary sm:flex"><Clock size={12} />{s.dept}</span>
              <StatusBadge tone={s.status === 'active' ? 'active' : s.status === 'leave' ? 'late' : 'neutral'} dot>{s.status}</StatusBadge>
            </button>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard hover>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Shift coverage today</h3>
          <div className="mt-3 space-y-2.5">
            {[['Front office', 100], ['Transport', 86], ['Library', 100], ['Labs', 75], ['Counselling', 50]].map(([k, v]) => (
              <div key={k as string} className="flex items-center gap-3">
                <span className="w-28 text-[12.5px] font-semibold text-text-primary">{k}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-periwinkle-2/40">
                  <span className="block h-full rounded-full bg-periwinkle-3" style={{ width: `${v}%` }} />
                </span>
                <span className="w-10 text-right font-mono text-[11.5px] text-text-secondary tabular-nums">{v}%</span>
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard hover>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Pending requests</h3>
          <div className="mt-3 space-y-2">
            {[
              ['Leave approval · Anjali Rao', 'Counselling · 2 days', 'pending', 'Review'],
              ['Overtime · Transport team', 'Athletics meet Saturday', 'neutral', 'Approve'],
              ['New hire · Assistant librarian', 'Shortlist of 4 ready', 'active', 'View'],
            ].map(([t, s, tone, act]) => (
              <div key={t} className="flex items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-text-primary">{t}</p>
                  <p className="font-mono text-[10.5px] text-text-secondary">{s}</p>
                </div>
                <StatusBadge tone={tone}>{tone === 'pending' ? 'Pending' : tone === 'active' ? 'Ready' : 'Open'}</StatusBadge>
                <GlassButton size="sm" onClick={() => pushToast({ title: act === 'View' ? 'Shortlist opened' : 'Request updated', body: t, tone: 'success' })}>{act}</GlassButton>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <Drawer
        open={!!staffSel} onClose={() => setStaffSel(null)}
        title={staffSel?.name ?? ''} subtitle={staffSel ? `${staffSel.id} · ${staffSel.dept} · ${staffSel.status}` : ''}
        footer={<GlassButton variant="ghost" onClick={() => setStaffSel(null)}>Close</GlassButton>}
      >
        {staffSel && (
          <div className="space-y-4">
            <ProfileIdSection
              card={staffCard(staffSel)}
              natural={{ kind: 'employee', name: staffSel.name }}
              relation="other"
            />
            <dl className="space-y-2.5 rounded-2xl border border-periwinkle-2/40 bg-white/35 p-4 text-[13px]">
              {[['Designation', staffSel.role], ['Department', staffSel.dept], ['Status', staffSel.status], ['Email', staffSel.email], ['Phone', staffSel.phone]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="truncate text-right font-semibold text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Drawer>
    </div>
  );
}
