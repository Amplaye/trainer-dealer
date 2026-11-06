// Offline support: everything is cached at install, so the app opens even without a network.
// Bump VERSION on every release: it is what makes the phone notice the update.
const VERSION = 'v3.1.0';
const CACHE = 'trainer-dealer-' + VERSION;
const FILES = ['./', 'index.html', 'css/app.css', 'fonts/playfair-700.woff2', 'js/logic.js', 'js/quiz.js', 'js/app.js', 'data/tda.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('trainer-dealer-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
