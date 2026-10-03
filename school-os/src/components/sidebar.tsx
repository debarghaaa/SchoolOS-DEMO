import { useState } from 'react';
import {
  Bell, Boxes, Building2, CalendarCheck, CalendarCheck2, CalendarRange, ChartColumn, ChevronRight,
  ClipboardList, Flag, FolderOpen, GraduationCap, LayoutDashboard, Presentation,
  ScrollText, Settings2, Shapes, SquareTerminal, Users, Wallet, Wrench, X,
} from 'lucide-react';
import { ROLES } from '../lib/data';
import { useLiveLeave } from '../lib/leave-live';
import { useLiveFlags } from '../lib/flags-live';
import { flagBadgeCount } from '../lib/flags';
import { getNav } from '../lib/permissions';
import { useApp, useMyNotifications } from '../lib/store';
import type { RouteId } from '../lib/types';
import { cn } from '../lib/utils';
import { Avatar, GlassPanel } from './glass';

const ICONS: Record<string, React.ReactNode> = {
  'layout-dashboard': <LayoutDashboard size={17} />,
  'graduation-cap': <GraduationCap size={17} />,
  'presentation': <Presentation size={17} />,
  'shapes': <Shapes size={17} />,
  'calendar-check-2': <CalendarCheck2 size={17} />,
  'calendar-check': <CalendarCheck size={17} />,
  'clipboard-list': <ClipboardList size={17} />,
  'calendar-range': <CalendarRange size={17} />,
  'terminal-square': <SquareTerminal size={17} />,
  'folder-open': <FolderOpen size={17} />,
  'settings-2': <Settings2 size={17} />,
  'building': <Building2 size={17} />,
  'boxes': <Boxes size={17} />,
  'users': <Users size={17} />,
  'wallet': <Wallet size={17} />,
  'flag': <Flag size={17} />,
  'chart': <ChartColumn size={17} />,
  'scroll': <ScrollText size={17} />,
  'bell': <Bell size={17} />,
  'wrench': <Wrench size={17} />,
};

function Brand({ onClose, scope }: { onClose?: () => void; scope: string }) {
  return (
    <div className="flex items-center gap-3 px-2 pt-1 pb-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--color-baby-blue-ice),var(--color-periwinkle-2))] shadow-brand">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
          <path d="M9 20.5 16 9l7 11.5" stroke="var(--color-text-primary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="22.6" r="1.7" fill="var(--color-text-primary)" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-[16px] font-extrabold tracking-tight text-text-primary">Northview</p>
        <p className="font-mono truncate text-[10.5px] tracking-wide text-text-secondary">{scope}</p>
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Close navigation" className="btn-glass grid h-9 w-9 cursor-pointer place-items-center rounded-xl lg:hidden">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/* Sidebar badge for Leave Management — real data, role-specific: students
   see unread leave notifications; teachers and admins see the pending
   applications awaiting their own decision. Null while unknown. */
function useLeaveBadgeCount(): number | null {
  const { role } = useApp();
  const mine = useMyNotifications();
  const q = useLiveLeave();
  if (role === 'student') {
    return mine.filter((n) => !n.read && n.kind === 'leave').length;
  }
  if (role === 'teacher' || role === 'school-admin') {
    if (!q.data) return null;
    return q.data.applications.filter((a) => a.status === 'pending' && q.canDecide(a)).length;
  }
  return null;
}

/* Sidebar badge for Student Flags & Notes (admin only): active flags at
   High/Critical severity. Null while unknown. */
function useFlagBadgeCount(): number | null {
  const { role } = useApp();
  const q = useLiveFlags();
  if (role !== 'school-admin') return null;
  if (!q.data) return null;
  return flagBadgeCount(q.visibleRecords);
}

/* Navigation is generated from the role — unauthorized modules are absent
   from the tree itself, never rendered then hidden. */
function FileTree() {
  const { route, go, role } = useApp();
  const nav = getNav(role);
  const leaveBadge = useLeaveBadgeCount();
  const flagBadge = useFlagBadgeCount();
  const [open, setOpen] = useState<Record<string, boolean>>({ students: true, classes: true, assignments: true, teachers: false });

  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));
  const folderActive = (children?: { id: RouteId }[]) => children?.some((c) => c.id === route);

  return (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-1">
      <p className="px-3 pt-1 pb-2 font-mono text-[10px] font-medium tracking-[0.14em] text-text-secondary uppercase">
        {role === 'super-admin' ? 'platform / root' : 'workspace / root'}
      </p>
      <ul className="space-y-1">
        {nav.map((node) => {
          if (node.route) {
            const active = node.route === route;
            return (
              <li key={node.id}>
                <button
                  onClick={() => go(node.route!)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'tree-node flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-[12.5px] text-text-primary',
                    'hover:bg-lavender-2/70 hover:text-text-primary',
                    active && 'tree-active font-semibold',
                  )}
                >
                  <span className={cn(active ? 'text-text-primary' : 'text-text-secondary')}>{ICONS[node.icon]}</span>
                  <span className="flex-1 text-left">{node.label}</span>
                  {node.route === 'leave-management' && leaveBadge != null && leaveBadge > 0 && (
                    <span aria-label={`${leaveBadge} leave items need attention`} className="grid h-5 min-w-5 place-items-center rounded-full bg-periwinkle-3 px-1 font-mono text-[10px] font-semibold text-text-primary shadow">
                      {leaveBadge > 99 ? '99+' : leaveBadge}
                    </span>
                  )}
                  {node.route === 'student-flags' && flagBadge != null && flagBadge > 0 && (
                    <span aria-label={`${flagBadge} flags need attention`} className="grid h-5 min-w-5 place-items-center rounded-full bg-periwinkle-3 px-1 font-mono text-[10px] font-semibold text-text-primary shadow">
                      {flagBadge > 99 ? '99+' : flagBadge}
                    </span>
                  )}
                  {node.id === 'elab' && (
                    <span className="rounded-md bg-baby-blue-ice px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-text-primary">LIVE</span>
                  )}
                </button>
              </li>
            );
          }

          const expanded = !!open[node.id];
          const active = folderActive(node.children);
          return (
            <li key={node.id}>
              <button
                onClick={() => toggle(node.id)}
                aria-expanded={expanded}
                className={cn(
                  'tree-node flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-[12.5px]',
                  active ? 'bg-periwinkle-2 font-semibold text-text-primary shadow-[inset_3px_0_0_0_var(--color-baby-blue-ice)]' : 'text-text-secondary hover:bg-lavender-2/70 hover:text-text-primary',
                  active && !expanded && 'bg-periwinkle-2/60',
                )}
              >
                <span className={cn('text-text-primary', active && 'text-text-primary')}>{ICONS[node.icon]}</span>
                <span className="flex-1 text-left">{node.label}</span>
                <span className="font-mono text-[10px] text-text-secondary">{node.children!.length}</span>
                <ChevronRight size={14} className={cn('tree-caret text-text-secondary', expanded && 'open')} />
              </button>
              <div className={cn('tree-children', expanded && 'open')}>
                <div>
                  <ul className="mt-0.5 mb-1 ml-[21px] space-y-0.5 border-l border-periwinkle-2/20 pl-2.5">
                    {node.children!.map((child) => {
                      const childActive = child.id === route;
                      return (
                        <li key={child.id}>
                          <button
                            onClick={() => go(child.id)}
                            aria-current={childActive ? 'page' : undefined}
                            className={cn(
                              'tree-node flex w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-[12px] text-text-primary',
                              'hover:bg-lavender-2/70 hover:text-text-primary',
                              childActive && 'tree-active font-semibold',
                            )}
                          >
                            <span className="flex-1 truncate text-left">{child.label}</span>
                            <span className={cn('font-mono text-[9.5px]', childActive ? 'text-text-primary' : 'text-text-secondary')}>{child.mono}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RoleCard() {
  const { role, setRole } = useApp();
  const current = ROLES.find((r) => r.id === role)!;
  return (
    <GlassPanel className="mt-4 p-3!">
      <div className="flex items-center gap-2.5">
        <Avatar initials={current.initials} size="md" index={1} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-text-primary">{current.name}</p>
          <p className="truncate text-[11.5px] text-text-secondary">{current.label}</p>
        </div>
      </div>
      <label htmlFor="role-switch" className="mt-2.5 mb-1 block font-mono text-[10px] tracking-[0.1em] text-text-secondary uppercase">log in as</label>
      <select
        id="role-switch"
        value={role}
        onChange={(e) => setRole(e.target.value as typeof role)}
        className="field h-9 w-full cursor-pointer rounded-lg px-2.5 font-mono text-[11.5px] text-text-primary"
      >
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>{r.label} — {r.name}</option>
        ))}
      </select>
    </GlassPanel>
  );
}

export function SidebarDesktop() {
  const { railCollapsed, role } = useApp();
  if (railCollapsed) return <RailCollapsed />;
  const scope = role === 'super-admin' ? 'cloud · platform' : role === 'school-admin' ? 'school-os · 2026-27' : role === 'teacher' ? 'teaching · physics' : role === 'student' ? 'grade 10-B · roll 14' : 'family · 2 children';
  return (
    <aside data-glass="primary" className="glass-surface glass-elevated sticky top-4 hidden h-[calc(100vh-2rem)] w-[296px] shrink-0 flex-col rounded-[28px] p-4 lg:flex" aria-label="Sidebar">
      <Brand scope={scope} />
      <FileTree />
      <RoleCard />
      <p className="mt-3 px-2 text-center font-mono text-[10px] text-text-secondary">v4.2 · synced 2 min ago</p>
    </aside>
  );
}

function RailCollapsed() {
  const { route, go, role, setRailCollapsed } = useApp();
  const leaveBadge = useLeaveBadgeCount();
  const flagBadge = useFlagBadgeCount();
  const items = getNav(role).flatMap((n) =>
    n.route ? [{ id: n.route, icon: n.icon, label: n.label }] : n.children!.map((c) => ({ id: c.id, icon: n.icon, label: `${n.label} · ${c.label}` })),
  ).slice(0, 10);
  return (
    <aside data-glass="primary" className="glass-surface sticky top-4 hidden h-[calc(100vh-2rem)] w-[84px] shrink-0 flex-col items-center rounded-[28px] p-3 lg:flex" aria-label="Collapsed sidebar">
      <button onClick={() => setRailCollapsed(false)} title="Expand sidebar" className="grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-periwinkle-2 text-text-primary">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
          <path d="M9 20.5 16 9l7 11.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Primary collapsed">
        {items.map((i) => (
          <button
            key={i.id} title={i.label} onClick={() => go(i.id)}
            className={cn(
              'relative grid h-11 w-11 cursor-pointer place-items-center rounded-xl border border-transparent text-text-primary hover:bg-lavender-2/70 hover:text-text-primary',
              route === i.id && 'tree-active',
            )}
          >
            {ICONS[i.icon]}
            {i.id === 'leave-management' && leaveBadge != null && leaveBadge > 0 && (
              <span aria-hidden className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-periwinkle-3 ring-2 ring-white/50" />
            )}
            {i.id === 'student-flags' && flagBadge != null && flagBadge > 0 && (
              <span aria-hidden className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-periwinkle-3 ring-2 ring-white/50" />
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function SidebarMobile() {
  const { sidebarOpen, setSidebarOpen, role } = useApp();
  if (!sidebarOpen) return null;
  const scope = role === 'super-admin' ? 'cloud · platform' : role === 'school-admin' ? 'school-os · 2026-27' : role === 'teacher' ? 'teaching · physics' : role === 'student' ? 'grade 10-B · roll 14' : 'family · 2 children';
  return (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="animate-fade-in absolute inset-0 bg-text-primary/45 backdrop-blur-[6px]" onClick={() => setSidebarOpen(false)} />
      <aside data-glass="floating" className="glass-surface animate-slide-in-right absolute top-0 left-0 flex h-full w-[320px] max-w-[88vw] flex-col rounded-r-[40px] p-4">
        <Brand onClose={() => setSidebarOpen(false)} scope={scope} />
        <FileTree />
        <RoleCard />
      </aside>
    </div>
  );
}
