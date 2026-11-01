/* Popote & Mijote — fonctionnement hors ligne */
const CACHE = 'popote-mijote-v3';
const FILES = ['./', './index.html', './styles.css', './app.js', './parser.js', './config.js', './recettes.json', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-512.png', './apple-touch-icon.png',
  './fraunces.woff2', './figtree-400.woff2', './figtree-500.woff2', './figtree-600.woff2', './figtree-700.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
      clearTimeout(t);
      if (res.ok) cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
