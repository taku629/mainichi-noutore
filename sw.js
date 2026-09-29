const CACHE = 'mainichi-noutore-v20';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icon-192.png', 'icon-512.png',
  'demo-dd.mp4', 'demo-calc.mp4', 'demo-nb.mp4', 'demo-mk.mp4', 'demo-dual.mp4', 'demo-stroop.mp4', 'demo-vf.mp4',
  'demo-vs.mp4', 'demo-ds.mp4', 'demo-wr.mp4', 'demo-tmt.mp4', 'demo-sym.mp4', 'demo-st.mp4', 'demo-pl.mp4'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-remind') {
    e.waitUntil(self.registration.showNotification('🧠 まいにち脳トレ', {
      body: '今日の習慣チェックとベンチマークの時間です。2分で記録できます。',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
    }));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./'));
});
