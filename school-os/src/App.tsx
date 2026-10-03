import { useEffect, useState } from 'react';
import { SidebarDesktop, SidebarMobile } from './components/sidebar';
import { BottomNav, Topbar } from './components/topbar';
import { CommandPalette, NotificationPanel, Toasts } from './components/overlays';
import { PwaShell } from './components/pwa';
import { GlassDefs, LoadingCards } from './components/glass';
import { AppProvider, canAccess, getRouteMeta, useApp } from './lib/store';
import { SchoolOverview } from './pages/dashboard';
import { FamilyOverview, PlatformOverview, StudentOverview, TeachingOverview } from './pages/overviews';
import { Admissions, ParentsPage, Performance, StudentsDirectory } from './pages/students';
import { Faculty, Staff } from './pages/teachers';
import { Classes, Subjects } from './pages/classes';
import { MyClasses } from './pages/my-classes';
import { MyChildren } from './pages/my-children';
import { Attendance } from './pages/attendance';
import { Maintenance } from './pages/maintenance';
import { LeaveLiveBridge, LeaveManagement } from './pages/leave-management';
import { FlagLiveBridge, StudentFlags } from './pages/student-flags';
import { Assignments } from './pages/assignments';
import { Timetable } from './pages/timetable';
import { ELab } from './pages/elab';
import { Files } from './pages/files';
import { Notifications } from './pages/notifications';
import { Settings } from './pages/settings';
import {
  AuditLogs, FeatureFlags, PlatformAnalytics, PlatformUsers, Schools,
  Subscriptions, SystemSettings, Tenants,
} from './pages/platform';

/* Every login constructs its own workspace: the Overview is chosen by
   role, and every other route is checked against role permissions. */
function Page() {
  const { route, role } = useApp();
  if (!canAccess(role, route)) {
    const meta = getRouteMeta(route, role);
    return (
      <div data-glass="primary" className="glass-surface rounded-[28px] p-10 text-center">
        <p className="font-mono text-[11px] tracking-[0.14em] text-error uppercase">403 · forbidden</p>
        <p className="font-display mt-2 text-[20px] font-bold text-error">Restricted for {role}</p>
        <p className="mt-2 text-[13.5px] text-text-secondary">Your role cannot access “{meta.title}”. Switch logins from the sidebar to explore another workspace.</p>
      </div>
    );
  }
  switch (route) {
    case 'overview':
      switch (role) {
        case 'super-admin': return <PlatformOverview />;
        case 'school-admin': return <SchoolOverview />;
        case 'teacher': return <TeachingOverview />;
        case 'student': return <StudentOverview />;
        case 'parent': return <FamilyOverview />;
      }
      break;
    /* platform */
    case 'schools': return <Schools />;
    case 'tenants': return <Tenants />;
    case 'users': return <PlatformUsers />;
    case 'subscriptions': return <Subscriptions />;
    case 'feature-flags': return <FeatureFlags />;
    case 'platform-analytics': return <PlatformAnalytics />;
    case 'audit-logs': return <AuditLogs />;
    case 'system-settings': return <SystemSettings />;
    /* school */
    case 'students-directory': return <StudentsDirectory />;
    case 'students-admissions': return <Admissions />;
    case 'students-performance': return <Performance />;
    case 'teachers-faculty': return <Faculty />;
    case 'teachers-staff': return <Staff />;
    case 'parents': return <ParentsPage />;
    case 'classes-classes': return <Classes />;
    case 'subjects': return <Subjects />;
    case 'my-classes': return <MyClasses />;
    case 'my-children': return <MyChildren />;
    case 'attendance': return <Attendance />;
    case 'assignments': return <Assignments initialTab="assignments" />;
    case 'submissions': return <Assignments initialTab="submissions" />;
    case 'grades': return <Assignments initialTab="grades" />;
    case 'timetable': return <Timetable />;
    case 'elab': return <ELab />;
    case 'files': return <Files />;
    case 'notifications': return <Notifications />;
    case 'settings': return <Settings />;
    case 'maintenance': return <Maintenance />;
    case 'leave-management': return <LeaveManagement />;
    case 'student-flags': return <StudentFlags />;
  }
}

function Shell() {
  const { route, role } = useApp();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), 650);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    document.title = `${getRouteMeta(route, role).title} · Northview`;
    window.scrollTo({ top: 0 });
  }, [route, role]);

  return (
    <div className="app-mesh relative z-[1] mx-auto flex min-h-full max-w-[1560px] gap-5 px-4 pb-24 sm:px-6 lg:px-8 lg:pb-10">
      <SidebarDesktop />
      <SidebarMobile />
      <div className="min-w-0 flex-1">
        <Topbar />
        <main className="pt-2" aria-label={getRouteMeta(route, role).title}>
          <p className="mb-4 hidden px-1 text-[13px] text-text-secondary sm:block">{getRouteMeta(route, role).blurb}</p>
          {booting ? <LoadingCards count={6} /> : <Page key={`${role}:${route}`} />}
        </main>
        <footer className="mt-8 hidden items-center justify-between px-1 pb-2 font-mono text-[10.5px] text-text-muted lg:flex">
          <span>northview {role === 'super-admin' ? 'cloud · platform' : 'school-os · term 2 / 2026-27'} · {role}</span>
          <span>● all systems normal · 99.98% uptime</span>
        </footer>
      </div>
      <BottomNav />
      <NotificationPanel />
      <CommandPalette />
      <Toasts />
      <LeaveLiveBridge />
      <FlagLiveBridge />
      <PwaShell />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <GlassDefs />
      <Shell />
    </AppProvider>
  );
}
