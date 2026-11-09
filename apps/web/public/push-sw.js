/* global self, URL */
// Imported by the generated service worker (workbox.importScripts). Handles Web Push.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* not JSON: fall back to the defaults below */
  }
  const title = data.title || 'Signal Radar';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      tag: data.tag || 'queue',
      data: { url: data.url || '/queue' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/queue',
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
});
