// Retire the old offline cache; prices must come from the current server.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('driptrack-')).map(k => caches.delete(k)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
