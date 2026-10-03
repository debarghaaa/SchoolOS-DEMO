import { useState } from 'react';
import { Building2, ShieldCheck } from 'lucide-react';
import { ROLES } from '../lib/data';
import { useApp } from '../lib/store';
import { cn } from '../lib/utils';
import { Avatar, FieldLabel, GlassButton, GlassCard, GlassInput, GlassSelect, GlassTextarea, SectionHead, StatusBadge, Tabs } from '../components/glass';

type Tab = 'school' | 'academic' | 'prefs' | 'access';

export function Settings() {
  const { role, pushToast } = useApp();
  const [tab, setTab] = useState<Tab>('school');
  const readOnly = role === 'student' || role === 'parent';

  return (
    <div className="animate-fade-up space-y-5">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs<Tab>
            value={tab} onChange={setTab}
            tabs={[
              { id: 'school', label: 'School profile' },
              { id: 'academic', label: 'Academic year' },
              { id: 'prefs', label: 'Preferences' },
              { id: 'access', label: 'Roles & access' },
            ]}
          />
          {readOnly && <StatusBadge tone="pending">View only for your role</StatusBadge>}
        </div>
      </GlassCard>

      {tab === 'school' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <GlassCard className="xl:col-span-2">
            <SectionHead title="Northview High School" body="Kolkata · CBSE Affiliation 2430123 · Est. 1987" />
            <fieldset disabled={readOnly} className="grid gap-3.5 sm:grid-cols-2">
              <div><FieldLabel>School name</FieldLabel><GlassInput defaultValue="Northview High School" /></div>
              <div><FieldLabel>Short code</FieldLabel><GlassInput defaultValue="NVH-KOL" className="font-mono" /></div>
              <div className="sm:col-span-2"><FieldLabel>Address</FieldLabel><GlassInput defaultValue="14 Lake Terrace, Ballygunge, Kolkata 700029" /></div>
              <div><FieldLabel>Principal</FieldLabel><GlassInput defaultValue="Dr. S. Chatterjee" /></div>
              <div><FieldLabel>Contact</FieldLabel><GlassInput defaultValue="+91 33 4000 1122" /></div>
              <div className="sm:col-span-2"><FieldLabel>About</FieldLabel><GlassTextarea rows={3} defaultValue="A 2,400-student K-12 school focused on sciences, athletics and code literacy." /></div>
            </fieldset>
            {!readOnly && (
              <div className="mt-5 flex justify-end gap-2 border-t border-periwinkle-2/40 pt-4">
                <GlassButton variant="ghost">Discard</GlassButton>
                <GlassButton variant="primary" icon={<Building2 size={15} />} onClick={() => pushToast({ title: 'Profile saved', body: 'School profile updated across all portals.', tone: 'success' })}>Save changes</GlassButton>
              </div>
            )}
          </GlassCard>
          <GlassCard hover>
            <h3 className="font-display text-[16px] font-bold text-text-primary">Trust & compliance</h3>
            <div className="mt-3 space-y-2.5">
              {[['CBSE affiliation', 'Valid till 2028', 'graded'], ['Fire safety NOC', 'Valid till Mar 2027', 'graded'], ['Data privacy audit', 'Due Nov 2026', 'pending']].map(([t, s, tone]) => (
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
        </div>
      )}

      {tab === 'academic' && (
        <GlassCard>
          <SectionHead title="Academic year 2026–27" body="Terms, grading scale and working days" />
          <fieldset disabled={readOnly} className="grid gap-3.5 sm:grid-cols-3">
            <div><FieldLabel>Term 1</FieldLabel><GlassInput defaultValue="Apr 2026 – Sep 2026" /></div>
            <div><FieldLabel>Term 2</FieldLabel><GlassInput defaultValue="Oct 2026 – Mar 2027" /></div>
            <div><FieldLabel>Grading scale</FieldLabel><GlassSelect><option>10-pt GPA</option><option>Percentage</option><option>Letter</option></GlassSelect></div>
            <div><FieldLabel>Week starts on</FieldLabel><GlassSelect><option>Monday</option><option>Sunday</option></GlassSelect></div>
            <div><FieldLabel>Pass threshold</FieldLabel><GlassInput defaultValue="40%" /></div>
            <div><FieldLabel>Attendance alert below</FieldLabel><GlassInput defaultValue="85%" /></div>
          </fieldset>
          {!readOnly && (
            <div className="mt-5 flex justify-end border-t border-periwinkle-2/40 pt-4">
              <GlassButton variant="primary" onClick={() => pushToast({ title: 'Academic settings saved', body: 'Applies to all gradebooks from tomorrow.', tone: 'success' })}>Save settings</GlassButton>
            </div>
          )}
        </GlassCard>
      )}

      {tab === 'prefs' && <PrefsTab />}

      {tab === 'access' && (
        <GlassCard>
          <SectionHead title="Roles & access" body="Five roles · switch anytime from the sidebar" />
          <div className="grid gap-3 md:grid-cols-2">
            {ROLES.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-periwinkle-2/35 bg-white/35 p-4">
                <Avatar initials={r.initials} index={i} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-text-primary">{r.label}</p>
                  <p className="truncate text-[12px] text-text-secondary">{r.description}</p>
                  <p className="truncate font-mono text-[10.5px] text-text-secondary">{r.name} · {r.email}</p>
                </div>
                <ShieldCheck size={16} className="shrink-0 text-text-secondary" />
              </div>
            ))}
          </div>
          <RoleMatrix />
        </GlassCard>
      )}
    </div>
  );
}

function PrefsTab() {
  const { pushToast } = useApp();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    sms: true, push: true, email: false, weekly: true, fee: true, marketing: false,
  });
  const toggle = (k: string) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <GlassCard>
        <SectionHead title="Notification channels" body="How you receive updates" />
        <div className="space-y-2">
          {[['sms', 'SMS alerts', 'Attendance + emergencies'], ['push', 'Push notifications', 'App + web'], ['email', 'Email digest', 'Daily at 7 PM'], ['weekly', 'Weekly summary', 'Sundays at 9 AM']].map(([k, t, s]) => (
            <button key={k} onClick={() => toggle(k)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-3 text-left">
              <Toggle on={prefs[k]} />
              <span className="flex-1"><span className="block text-[13px] font-bold text-text-primary">{t}</span><span className="block font-mono text-[10.5px] text-text-secondary">{s}</span></span>
            </button>
          ))}
        </div>
      </GlassCard>
      <GlassCard>
        <SectionHead title="Workspace" body="Display and regional options" />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div><FieldLabel>Language</FieldLabel><GlassSelect><option>English</option><option>Hindi</option><option>Bengali</option></GlassSelect></div>
          <div><FieldLabel>Timezone</FieldLabel><GlassSelect><option>Asia/Kolkata</option><option>UTC</option></GlassSelect></div>
          <div><FieldLabel>Date format</FieldLabel><GlassSelect><option>DD MMM YYYY</option><option>MM/DD/YYYY</option></GlassSelect></div>
          <div><FieldLabel>Density</FieldLabel><GlassSelect><option>Comfortable</option><option>Compact</option></GlassSelect></div>
        </div>
        <div className="mt-5 flex justify-end border-t border-periwinkle-2/40 pt-4">
          <GlassButton variant="primary" onClick={() => pushToast({ title: 'Preferences saved', body: 'Your workspace updated instantly.', tone: 'success' })}>Save preferences</GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cn('relative h-[22px] w-10 shrink-0 rounded-full transition-colors', on ? 'bg-periwinkle-3' : 'bg-lavender-2')}>
      <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-[3px]')} />
    </span>
  );
}

function RoleMatrix() {
  const rows: [string, boolean[]][] = [
    ['Admissions', [true, true, false, false, false]],
    ['Registers', [true, true, true, false, false]],
    ['Gradebooks', [true, true, true, false, false]],
    ['E-Lab submit', [true, true, true, true, false]],
    ['Fee records', [true, true, false, false, true]],
    ['Settings', [true, true, false, false, false]],
  ];
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-periwinkle-2/40">
      <table className="w-full min-w-[560px] border-collapse bg-white/35 text-[12.5px]">
        <thead>
          <tr className="border-b border-periwinkle-2/40">
            <th className="px-4 py-3 text-left font-mono text-[10.5px] tracking-wider text-text-secondary uppercase">Capability</th>
            {['Super', 'Admin', 'Teacher', 'Student', 'Parent'].map((h) => (
              <th key={h} className="px-3 py-3 text-center font-mono text-[10.5px] tracking-wider text-text-secondary uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([cap, cells]) => (
            <tr key={cap} className="border-b border-periwinkle-2/25 last:border-0">
              <td className="px-4 py-2.5 font-semibold text-text-primary">{cap}</td>
              {cells.map((c, i) => (
                <td key={i} className="px-3 py-2.5 text-center">
                  <span className={cn('inline-grid h-6 w-6 place-items-center rounded-full font-mono text-[11px] font-bold', c ? 'bg-periwinkle-3 text-text-primary' : 'bg-lavender-2/60 text-text-muted')}>
                    {c ? '✓' : '–'}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
