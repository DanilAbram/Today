/* Today — offline support. Serves the app from cache, refreshes it in the background. */
const CACHE = 'today-v4';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'logic.js', 'i18n.js', 'langs.js', 'manifest.webmanifest',
  'fonts/fraunces-latin.woff2', 'fonts/fraunces-latin-ext.woff2', 'fonts/figtree-latin.woff2', 'fonts/figtree-latin-ext.woff2',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: instant from cache, then update the cache for next time.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const fresh = fetch(req)
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined));
        return hit || fresh;
      })
    )
  );
});

// Tapping a reminder brings the app forward.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
