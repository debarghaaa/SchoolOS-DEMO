import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { subscribePwaUpdate, useOnlineStatus } from '../lib/pwa';
import { useApp } from '../lib/store';

/* PWA shell extras — mounted once. A slim offline pill (the service worker
 * keeps the cached shell usable; Supabase realtime resubscribes itself on
 * reconnect) and a one-shot toast when a new release is waiting. Neither
 * touches layout, navigation, or any existing surface. */
export function PwaShell() {
  const { pushToast } = useApp();
  const online = useOnlineStatus();

  useEffect(() => subscribePwaUpdate(() => {
    pushToast({ title: 'Update ready', body: 'Reload to load the newest School OS.', tone: 'info' });
  }), [pushToast]);

  if (online) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4" role="status">
      <p className="glass-surface pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[11.5px] font-semibold text-text-primary shadow-lift">
        <WifiOff size={14} />
        You’re offline · cached content only · changes sync on reconnect
      </p>
    </div>
  );
}
