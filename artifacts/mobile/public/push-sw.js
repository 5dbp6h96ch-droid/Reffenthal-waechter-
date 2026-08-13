self.addEventListener('push', (event) => {
  const fallback = {
    title: 'R(h)einschiffer',
    body: 'Neue Benachrichtigung',
    url: '/',
  };

  let data = fallback;
  try {
    if (event.data) {
      const parsed = event.data.json();
      const notification = parsed.notification || {};
      data = {
        ...fallback,
        ...parsed,
        title: notification.title || parsed.title || fallback.title,
        body: notification.body || parsed.body || fallback.body,
        url: notification.navigate || parsed.url || fallback.url,
      };
    }
  } catch {
    try {
      if (event.data) data.body = event.data.text();
    } catch {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
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
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    }),
  );
});
