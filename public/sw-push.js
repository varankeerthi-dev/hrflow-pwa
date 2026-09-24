// Service Worker Push & Notification Click Handler for HRFlow PWA

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/mobile';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing open tab if available
      for (let client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client && urlToOpen) {
            client.navigate(urlToOpen);
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'HRFlow Notification';
    const options = {
      body: payload.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [200, 100, 200],
      tag: payload.tag || `hrflow-notif-${Date.now()}`,
      renotify: true,
      data: payload.data || { url: '/mobile' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const title = 'HRFlow Notification';
    const options = {
      body: event.data.text(),
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [200, 100, 200],
      data: { url: '/mobile' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});
