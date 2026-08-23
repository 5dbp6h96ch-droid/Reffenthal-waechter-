function normalizePushUrl(value) {
  const raw = typeof value === 'string' && value ? value : '/#/pegel';
  const appPath = raw.startsWith('#/') ? `/${raw}` : raw;
  try { return new URL(appPath, self.location.origin).href; }
  catch { return new URL('/#/pegel', self.location.origin).href; }
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'R(h)einschiffer', body: event.data?.text() || '' }; }
  const title = data.title || 'R(h)einschiffer';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    data: { url: normalizePushUrl(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = normalizePushUrl(event.notification?.data?.url);
  event.waitUntil(clients.openWindow(url));
});
