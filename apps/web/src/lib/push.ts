import { api, ApiError } from './api';

export type PushStatus = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on';

export interface PushFacts {
  supported: boolean;
  hasKey: boolean;
  permission: NotificationPermission | 'default';
  subscribed: boolean;
}

/** Pure: the order matters. No browser support beats a missing key, which beats a blocked prompt. */
export function resolveStatus(f: PushFacts): PushStatus {
  if (!f.supported) return 'unsupported';
  if (!f.hasKey) return 'unavailable';
  if (f.permission === 'denied') return 'denied';
  return f.subscribed && f.permission === 'granted' ? 'on' : 'off';
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone/iPad Safari only offers push to an installed PWA; this is true in a plain browser tab. */
export function needsInstall(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return /iphone|ipad|ipod/i.test(nav.userAgent) && nav.standalone === false;
}

async function fetchKey(): Promise<string | null> {
  try {
    const res = await api<{ publicKey: string }>('/api/push/key');
    return res.publicKey || null;
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function status(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  const key = await fetchKey();
  let subscribed = false;
  try {
    subscribed = (await currentSubscription()) !== null;
  } catch {
    /* treat as off */
  }
  return resolveStatus({
    supported: true,
    hasKey: key !== null,
    permission: Notification.permission,
    subscribed,
  });
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Asks permission, subscribes this device and registers it. Returns the resulting status. */
export async function subscribe(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  const key = await fetchKey();
  if (!key) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    return resolveStatus({ supported: true, hasKey: true, permission, subscribed: false });
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    }));
  const json = sub.toJSON();
  try {
    await api('/api/push/subscribe', {
      method: 'POST',
      json: { endpoint: json.endpoint, keys: json.keys },
    });
  } catch (e) {
    await sub.unsubscribe().catch(() => undefined);
    throw e;
  }
  return 'on';
}

export async function unsubscribe(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  const sub = await currentSubscription();
  if (sub) {
    try {
      await api('/api/push/subscribe', { method: 'DELETE', json: { endpoint: sub.endpoint } });
    } catch (e) {
      // A 403 (lapsed Pro) still lets the device drop its own subscription.
      if (!(e instanceof ApiError && e.status === 403)) throw e;
    }
    await sub.unsubscribe();
  }
  return status();
}
