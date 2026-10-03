import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BellRing, CheckCheck, CircleAlert, CircleCheck, Info, Search, TriangleAlert } from 'lucide-react';
import { queueLeaveSelection } from '../lib/leave-live';
import { queueFlagSelection } from '../lib/flags-live';
import { getSearchIndex } from '../lib/permissions';
import { useApp, useMyNotifications } from '../lib/store';
import { cn } from '../lib/utils';
import { Drawer, GlassButton, GlassPopover, StatusBadge } from './glass';

/* ---------------- Toasts ---------------- */
const TOAST_ICON = {
  success: <CircleCheck size={17} className="text-success" />,
  info: <Info size={17} className="text-icon-accent" />,
  warning: <TriangleAlert size={17} className="text-warning" />,
  error: <CircleAlert size={17} className="text-error" />,
};
export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-[90] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2.5 lg:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <GlassPopover key={t.id} className="animate-slide-in-right pointer-events-auto flex items-start gap-3 rounded-[18px]! p-3.5">
          <span className="mt-0.5 shrink-0">{TOAST_ICON[t.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-text-primary">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[12.5px] leading-snug text-text-secondary">{t.body}</p>}
          </div>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="cursor-pointer text-text-muted hover:text-text-primary">✕</button>
        </GlassPopover>
      ))}
    </div>
  );
}

/* ---------------- Notification panel ---------------- */
const KIND_TONE: Record<string, string> = {
  academic: 'neutral', attendance: 'present', fee: 'pending', event: 'neutral', system: 'closed', leave: 'pending', note: 'neutral', flag: 'pending',
};
export function NotificationPanel() {
  const { notifOpen, setNotifOpen, markRead, markAllRead, go, role } = useApp();
  const notifications = useMyNotifications();
  return (
    <Drawer
      open={notifOpen}
      onClose={() => setNotifOpen(false)}
      title="Notifications"
      subtitle={`${notifications.filter((n) => !n.read).length} unread · synced just now`}
      footer={<GlassButton variant="ghost" icon={<CheckCheck size={15} />} onClick={markAllRead}>Mark all read</GlassButton>}
    >
      <div className="space-y-2.5">
        {notifications.length === 0 && (
          <p className="rounded-2xl border border-dashed border-periwinkle-2/20 bg-white/35 p-6 text-center text-[13px] text-text-secondary">
            No notifications addressed to {role}. You’re all caught up.
          </p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => { markRead(n.id); setNotifOpen(false); if (n.ref.leaveId) queueLeaveSelection(n.ref.leaveId); if (n.ref.studentId || n.ref.recordId) queueFlagSelection(n.ref.studentId ?? null, n.ref.recordId ?? null); go(n.ref.route); }}
            className={cn(
              'w-full cursor-pointer rounded-2xl border p-3.5 text-left transition-all duration-300 hover:-translate-y-[1px]',
              n.read ? 'border-periwinkle-2/30 bg-white/35' : 'border-periwinkle-3/60 bg-periwinkle/50 shadow-lift',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <StatusBadge tone={KIND_TONE[n.kind]}>{n.kind}</StatusBadge>
              <span className="font-mono text-[10.5px] text-text-secondary">{n.time}</span>
            </div>
            <p className="mt-2 text-[13.5px] font-bold text-text-primary">{n.title}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-text-secondary">{n.body}</p>
            {!n.read && <span className="mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-text-primary"><BellRing size={11} /> NEW</span>}
          </button>
        ))}
      </div>
      {role !== 'super-admin' && (
        <GlassButton
          className="mt-4 w-full" variant="glass"
          icon={<ArrowRight size={15} />}
          onClick={() => { setNotifOpen(false); go('notifications'); }}
        >
          Open full inbox
        </GlassButton>
      )}
    </Drawer>
  );
}

/* ---------------- Command palette ---------------- */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, go, role } = useApp();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [paletteOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowed = getSearchIndex(role);
    if (!q) return allowed.slice(0, 7);
    return allowed.filter((s) => `${s.label} ${s.hint}`.toLowerCase().includes(q)).slice(0, 9);
  }, [query, role]);

  if (!paletteOpen) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="animate-fade-in absolute inset-0 bg-text-primary/45 backdrop-blur-[6px]" onClick={() => setPaletteOpen(false)} />
      <GlassPopover className="animate-scale-in relative w-full max-w-[560px] overflow-hidden rounded-[24px]! p-2">
        <div className="flex items-center gap-2.5 rounded-2xl border border-periwinkle-2/20 bg-white/35 px-4">
          <Search size={16} className="text-text-secondary" />
          <input
            ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules, records, actions…"
            className="h-12 w-full bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded-md border border-periwinkle-2/25 bg-white/35 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">esc</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-text-secondary">No matches for “{query}”. Try “attendance” or “timetable”.</p>
          )}
          {results.map((r) => (
            <button
              key={r.route}
              onClick={() => go(r.route)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-lavender-2/70"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-periwinkle-3/50 bg-periwinkle-2/50 font-mono text-[11px] font-semibold text-text-primary">
                {r.label.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-text-primary">{r.label}</span>
                <span className="block truncate font-mono text-[11px] text-text-secondary">{r.hint}</span>
              </span>
              <ArrowRight size={14} className="text-text-muted" />
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-periwinkle-2/15 px-4 py-2.5 font-mono text-[10.5px] text-text-muted">
          <span>northview · {role}</span>
          <span>↵ to open</span>
        </div>
      </GlassPopover>
    </div>
  );
}
