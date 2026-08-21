const TEST_APP_ORIGIN = 'https://rheinschiffer-test.5dbp6h96ch.workers.dev';
const TEST_APP_HOME = `${TEST_APP_ORIGIN}/#/`;

self.addEventListener('push', (event) => {
  const fallback = {
    title: 'R(h)einschiffer',
    body: 'Neue Benachrichtigung',
    url: TEST_APP_HOME,
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
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || TEST_APP_HOME },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let target = event.notification.data?.url || TEST_APP_HOME;
  try {
    const parsed = new URL(target, TEST_APP_ORIGIN);
    // Diese Test-PWA darf Push-Klicks ausschließlich ins aktuelle Testsystem führen.
    target = parsed.origin === TEST_APP_ORIGIN ? parsed.href : TEST_APP_HOME;
  } catch {
    target = TEST_APP_HOME;
  }

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Nur ein Fenster derselben aktuellen Test-Origin wiederverwenden.
    const existing = clients.find((client) => {
      try {
        return new URL(client.url).origin === TEST_APP_ORIGIN;
      } catch {
        return false;
      }
    });

    if (existing) {
      if ('navigate' in existing && existing.url !== target) {
        try {
          await existing.navigate(target);
        } catch {
          // Falls Navigation nicht möglich ist, wenigstens das aktuelle Testfenster fokussieren.
        }
      }
      if ('focus' in existing) return existing.focus();
    }

    return self.clients.openWindow(target);
  })());
});
