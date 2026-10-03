import { Bell, CalendarRange, ChevronRight, ClipboardList, Command, Download, Menu, PanelLeft, Search, SquareTerminal } from 'lucide-react';
import { ROLES } from '../lib/data';
import { BOTTOM_NAV, canAccess } from '../lib/permissions';
import { usePwaInstall } from '../lib/pwa';
import { getRouteMeta, useApp, useMyNotifications } from '../lib/store';
import type { RouteId } from '../lib/types';
import { Avatar } from './glass';
import { cn } from '../lib/utils';

export function Topbar() {
  const { role, route, setSidebarOpen, railCollapsed, setRailCollapsed, setNotifOpen, setPaletteOpen } = useApp();
  const mine = useMyNotifications();
  const unread = mine.filter((n) => !n.read).length;
  const meta = getRouteMeta(route, role);
  const current = ROLES.find((r) => r.id === role)!;

  return (
    <header className="sticky top-0 z-40 -mx-4 px-4 pt-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div data-glass="primary" className="glass-surface glass-elevated flex items-center gap-2.5 rounded-[22px] px-3 py-2.5 sm:gap-3 sm:px-4">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          className="btn-glass grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl lg:hidden"
        >
          <Menu size={18} />
        </button>
        <button
          onClick={() => setRailCollapsed(!railCollapsed)}
          aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="btn-ghost hidden h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl lg:grid"
        >
          <PanelLeft size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 font-mono text-[10.5px] tracking-wide text-text-secondary">
            <span className="hidden truncate sm:inline">{meta.crumb[0]}</span>
            <ChevronRight size={12} className="hidden shrink-0 sm:inline" />
            <span className="truncate text-text-primary">{meta.crumb[1]}</span>
          </nav>
          <h1 className="font-display truncate text-[19px] leading-tight font-bold tracking-tight text-text-primary sm:text-[21px]">
            {meta.title}
          </h1>
        </div>

        <InstallButton />

        {/* Search trigger */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="field hidden h-10 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13px] text-text-muted md:flex md:w-[240px] xl:w-[300px]"
          aria-label="Search (Ctrl+K)"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search anything…</span>
          <kbd className="flex items-center gap-0.5 rounded-md border border-periwinkle-2/25 bg-white/35 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
            <Command size={10} />K
          </kbd>
        </button>
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Search"
          className="btn-glass grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl md:hidden"
        >
          <Search size={17} />
        </button>

        <QuickActions />

        {/* Notifications */}
        {canAccess(role, 'notifications') || role === 'super-admin' ? (
          <button
            onClick={() => setNotifOpen(true)}
            aria-label={`Notifications, ${unread} unread`}
            className="btn-glass relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl"
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-periwinkle-3 px-1 font-mono text-[10px] font-semibold text-text-primary shadow">
                {unread}
              </span>
            )}
          </button>
        ) : null}

        <div className="hidden items-center gap-2.5 rounded-xl border border-periwinkle-2/20 bg-white/35 py-1 pr-3 pl-1 sm:flex">
          <Avatar initials={current.initials} size="sm" index={1} />
          <div className="leading-tight">
            <p className="max-w-[110px] truncate text-[12px] font-bold text-text-primary">{current.name}</p>
            <p className="text-[10.5px] text-text-secondary">{current.label}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

/* Native PWA install — rendered only while the browser holds a deferred
   install prompt and the app is not already installed/standalone. */
function InstallButton() {
  const { canInstall, promptInstall } = usePwaInstall();
  if (!canInstall) return null;
  return (
    <button
      onClick={() => void promptInstall()}
      title="Install School OS"
      aria-label="Install School OS"
      className="btn-glass flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 text-[13px] font-semibold"
    >
      <Download size={16} />
      <span className="hidden md:inline">Install School OS</span>
    </button>
  );
}

/* Only shortcuts the current role is authorized to open. */
function QuickActions() {
  const { go, route, role } = useApp();
  const items = [
    { id: 'assignments' as const, icon: <ClipboardList size={16} />, label: 'Assignments' },
    { id: 'timetable' as const, icon: <CalendarRange size={16} />, label: 'Timetable' },
    { id: 'elab' as const, icon: <SquareTerminal size={16} />, label: 'E-Lab' },
  ].filter((i) => canAccess(role, i.id));
  if (items.length === 0) return null;
  return (
    <div className="hidden items-center gap-1 lg:flex">
      {items.map((i) => (
        <button
          key={i.id} onClick={() => go(i.id)} title={i.label} aria-label={i.label}
          className={cn(
            'grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-transparent transition-colors',
            route === i.id ? 'bg-periwinkle-2 text-text-primary' : 'text-text-secondary hover:bg-lavender-2/70 hover:text-text-primary',
          )}
        >
          {i.icon}
        </button>
      ))}
      <span className="mx-1 h-6 w-px bg-periwinkle-3/50" />
    </div>
  );
}

/* Mobile bottom navigation — generated per role. */
const BOTTOM_ICONS: Record<string, React.ReactNode> = {
  overview: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  attendance: <CalendarRange size={19} />,
  assignments: <ClipboardList size={19} />,
  elab: <SquareTerminal size={19} />,
  grades: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>,
  notifications: <Bell size={19} />,
  tenants: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>,
  'audit-logs': <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>,
  users: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 8.5a3.5 3.5 0 0 1 0 5.8M18.5 15.5c1.6.7 2.7 2 3 4.5" /></svg>,
  'my-children': <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="3" /><circle cx="16" cy="10" r="2.4" /><path d="M2.5 19c.7-2.8 2.9-4.3 5.5-4.3s4.8 1.5 5.5 4.3M14.5 15.4c2.3.3 4 1.6 4.6 3.9" /></svg>,
};
const BOTTOM_LABELS: Record<string, string> = {
  overview: 'Home', attendance: 'Attend', assignments: 'Tasks', elab: 'E-Lab', grades: 'Grades',
  notifications: 'Alerts', tenants: 'Tenants', 'audit-logs': 'Audit', users: 'Users', 'my-children': 'Kids',
};

export function BottomNav() {
  const { route, go, role } = useApp();
  const items: RouteId[] = BOTTOM_NAV[role];
  return (
    <nav aria-label="Mobile" className="fixed inset-x-3 z-40 lg:hidden" style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
      <div data-glass="floating" className="glass-surface flex items-center justify-around rounded-[24px] px-2 py-2">
        {items.map((id) => (
          <button
            key={id}
            onClick={() => go(id)}
            className={cn(
              'flex min-w-[62px] cursor-pointer flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[10.5px] font-semibold transition-colors',
              route === id ? 'bg-periwinkle-2 text-text-primary' : 'text-text-secondary',
            )}
          >
            {BOTTOM_ICONS[id]}
            {BOTTOM_LABELS[id]}
          </button>
        ))}
      </div>
    </nav>
  );
}
