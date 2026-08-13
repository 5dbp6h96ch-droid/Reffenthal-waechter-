self.addEventListener('push', (event) => {
  const fallback = {
    title: 'R(h)einschiffer',
    body: 'Neue Benachrichtigung',
    url: '/',
  };

  let data = fallback;
  try {
    if (event.data) data = { ...fallback, ...event.data.json() };
  } catch {
    try {
      if (event.data) data.body = event.data.text();
    } catch {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/_expo/static/js/ios/bundle.js',
      badge: '/_expo/static/js/ios/bundle.js',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
