/// <reference lib="webworker" />
/**
 * Service worker: precaches the app shell (offline-capable) and shows Web Push
 * notifications, opening the related issue when tapped.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();

self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data?.json() as { title: string; body: string; url?: string; tag?: string };
    } catch {
      return { title: 'UrbanFix', body: event.data?.text() ?? '' };
    }
  })();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: data.url ?? '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) {
        void existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
