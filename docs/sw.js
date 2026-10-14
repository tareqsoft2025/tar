// خدمة تخزين مؤقت: تعمل الصفحة دون إنترنت بعد أول زيارة
const CACHE = 'prayer-v3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'places.js', 'core.js', 'azkar.js', 'lib/adhan.umd.min.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/plex-400.ttf', 'fonts/plex-500.ttf', 'fonts/plex-700.ttf', 'fonts/amiri-400.ttf'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// الشبكة أولاً (لتصل التحديثات) ثم الذاكرة المؤقتة
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
