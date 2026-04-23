/* Site Visit — Service Worker
   Caches the app shell + CDN libraries so the PWA works offline
   after the first load. Bump CACHE_VERSION to invalidate old caches. */

const CACHE_VERSION = 'site-visit-v2';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Cache app shell (fail the install if these fail)
    await cache.addAll(APP_SHELL);
    // Try CDN assets but don't block install on them (network may be flaky)
    await Promise.all(CDN_ASSETS.map(url =>
      fetch(url, { mode: 'cors' })
        .then(resp => { if (resp.ok) return cache.put(url, resp); })
        .catch(() => { /* ignore */ })
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for navigations so updates reach the user quickly
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match('./index.html');
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for everything else
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && (req.url.startsWith(self.location.origin) || CDN_ASSETS.includes(req.url))) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      return new Response('Offline', { status: 503 });
    }
  })());
});
