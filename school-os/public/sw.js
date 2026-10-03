/* School OS service worker — app-shell + hashed-asset caching.
 *
 * Versioned caches: bump CACHE_VERSION with each release; the activate
 * handler deletes every cache from older versions so stale application
 * code is never served indefinitely.
 *
 * NEVER cached, by design:
 *  - cross-origin requests (Supabase REST/auth/storage/realtime, fonts) —
 *    auth tokens and school data always go to the network;
 *  - same-origin /api/* (backend proxy) and non-GET requests;
 *  - anything outside the asset allowlist below. Unknown same-origin
 *    payloads fall through to the network untouched.
 */

/* eslint-disable no-restricted-globals */
const CACHE_VERSION = 'school-os-v1';
const SHELL_CACHE = `${CACHE_VERSION}::shell`;
const ASSET_CACHE = `${CACHE_VERSION}::assets`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => null))))
      // Activate promptly so a freshly installed worker controls pages on
      // the next navigation; navigations are network-first, so this never
      // pins the app to stale HTML.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Navigations: network first (fresh HTML + headers every time), cached
 *  app shell when offline, plain 503 only if neither is available. */
async function networkFirstShell(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/', fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const shell = await cache.match('/');
    if (shell) return shell;
    return new Response('School OS is offline and the app shell is not cached yet.', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }
}

/** Hashed build assets (/assets/*): immutable, safe to cache first. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => undefined);
  return fresh;
}

/** Icons + manifest: serve fast, refresh in the background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => undefined);
      return fresh;
    })
    .catch(() => undefined);
  return hit || refresh.then((fresh) => {
    if (fresh) return fresh;
    throw new Error('offline');
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Cross-origin (Supabase, fonts, …): always network, never cached.
  if (url.origin !== self.location.origin) return;
  // Same-origin backend proxy: always network, never cached.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  if (
    url.pathname.startsWith('/icons/')
    || url.pathname === '/manifest.webmanifest'
    || url.pathname === '/favicon.ico'
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }
  // Anything else same-origin: network only. No indiscriminate caching.
});
