// Roundtable service worker: lets the app open offline and load fast.
// It only caches the app itself (page, icons, fonts, the two CDN libraries).
// Calls to AI providers are never touched or cached.

const VERSION = 'roundtable-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];
// Third-party files the page needs to look and work right offline.
const ASSET_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // API calls are POSTs: leave them alone
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // The page itself: try the network first so updates show up, fall back to the saved copy offline.
  if (sameOrigin && (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html'))) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) (await caches.open(VERSION)).put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Icons, manifest, fonts and libraries: serve the saved copy, refresh it in the background.
  if (sameOrigin || ASSET_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      const refresh = fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })());
  }
  // Anything else (openrouter.ai, api.anthropic.com, …) goes straight to the network.
});
