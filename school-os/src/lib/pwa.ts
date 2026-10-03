import { useCallback, useEffect, useState } from 'react';

/* =====================================================================
   PWA plumbing — native install prompt capture, standalone detection,
   online status, and production service-worker registration.

   The browser owns installation: we only capture `beforeinstallprompt`,
   hold it, and fire it from the in-app Install button. No fake download
   mechanism anywhere — unsupported browsers simply never see the button.
   ===================================================================== */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const updateListeners = new Set<() => void>();

function notifyInstall(): void {
  installListeners.forEach((l) => l());
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Fired when a new service worker finishes installing while an older one
 *  still controls the page (i.e. a release is waiting behind a reload). */
export function subscribePwaUpdate(fn: () => void): () => void {
  updateListeners.add(fn);
  return () => { updateListeners.delete(fn); };
}

/** Call once from main.tsx. Registers the worker in production builds
 *  only — dev keeps HMR authoritative and cache-free. */
export function initPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold the prompt; it fires only from the Install button click.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyInstall();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              updateListeners.forEach((l) => l());
            }
          });
        });
      }).catch(() => undefined);
    });
  }
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export function usePwaInstall(): {
  canInstall: boolean;
  installed: boolean;
  promptInstall: () => Promise<InstallOutcome>;
} {
  const [, bump] = useState(0);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const refresh = () => {
      setInstalled(isStandalone());
      bump((n) => n + 1);
    };
    installListeners.add(refresh);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', refresh);
    return () => {
      installListeners.delete(refresh);
      mq.removeEventListener('change', refresh);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const prompt = deferredPrompt;
    if (!prompt) return 'unavailable';
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // The prompt object is single-use either way; the browser re-fires the
    // event on a later visit if the user dismissed.
    deferredPrompt = null;
    notifyInstall();
    return outcome;
  }, []);

  return { canInstall: deferredPrompt !== null && !installed, installed, promptInstall };
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
