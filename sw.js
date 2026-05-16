// ─────────────────────────────────────────────
// DRIPTRACK Service Worker
// Handles: PWA install, offline cache, push notifications
// ─────────────────────────────────────────────
const CACHE_NAME = 'driptrack-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/watchlist.html',
  '/product.html',
  '/login.html',
  '/register.html',
  '/account.html',
  '/api-connector.js',
];

// ── INSTALL — cache static assets ─────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-fatal — some assets may not exist yet
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — clean old caches ────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — network-first, cache fallback ──────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: non-GET, API calls, external resources
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (!url.origin.includes(self.location.hostname) && !url.origin.includes('localhost')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful HTML/JS/CSS responses
        if (response.ok && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // For page navigation, serve the cached index
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// ── PUSH NOTIFICATIONS ─────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'DRIPTRACK', body: event.data.text() }; }

  const { title = 'DRIPTRACK', body = 'Price update', url = '/', icon = '/icon-192.png' } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      tag: 'driptrack-alert',
      data: { url },
      actions: [
        { action: 'view', title: 'View Deal →' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
      vibrate: [200, 100, 200],
    })
  );
});

// ── NOTIFICATION CLICK ─────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/watchlist.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.hostname) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
