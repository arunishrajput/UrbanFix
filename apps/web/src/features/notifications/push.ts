import { api } from '../../lib/api';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Asks for notification permission and, when the server has VAPID keys,
 * subscribes this device to Web Push so updates arrive even when the app is closed.
 */
export async function enablePush(vapidPublicKey: string | null): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted' || !vapidPublicKey || !('serviceWorker' in navigator)) return permission;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
    const json = sub.toJSON();
    await api('/push/subscribe', { body: { endpoint: json.endpoint, keys: json.keys } });
  } catch {
    // Push is an enhancement; in-app and socket notifications keep working.
  }
  return permission;
}
