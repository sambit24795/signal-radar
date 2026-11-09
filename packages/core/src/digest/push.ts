import webpush from 'web-push';
import type { Enriched } from '../score/types.js';

export interface PushSubscriptionInfo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushSendOptions {
  /** Seconds the push service may hold the message. */
  ttl: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
}

/** Sends one encrypted message. Rejects with an error carrying `statusCode` on a push-service error. */
export type PushSender = (
  sub: PushSubscriptionInfo,
  payload: string,
  opts: PushSendOptions,
) => Promise<void>;

export const PUSH_TTL_SECONDS = 12 * 60 * 60;
const BODY_MAX = 120;

/** Notification text for a run that queued `created` new items; `items` are best-first. */
export function formatPush(items: Enriched[], created: number): PushPayload {
  const top = items[0];
  const raw = (top?.ai?.title ?? top?.title ?? '').replace(/\s+/g, ' ').trim();
  const body = raw.length > BODY_MAX ? `${raw.slice(0, BODY_MAX - 1)}…` : raw;
  return { title: `${created} new in your queue`, body, url: '/queue', tag: 'queue' };
}

/** Real sender backed by `web-push`, or null when the VAPID env is incomplete (push disabled). */
export function createPushSender(env: Record<string, string | undefined>): PushSender | null {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  const vapidDetails = { subject, publicKey, privateKey };
  return async (sub, payload, opts) => {
    await webpush.sendNotification(sub, payload, {
      vapidDetails,
      TTL: opts.ttl,
      urgency: opts.urgency,
    });
  };
}

const statusOf = (e: unknown): number | undefined =>
  typeof e === 'object' && e !== null && 'statusCode' in e
    ? Number((e as { statusCode: unknown }).statusCode)
    : undefined;

export interface PushResult {
  sent: number;
  /** Endpoints the push service reports as expired (404/410); delete them. */
  gone: string[];
  /** Other failures, safe to log (no endpoint, which is a capability URL). */
  errors: string[];
}

/** Send `payload` to every subscription. Never throws. */
export async function sendPush(
  sender: PushSender,
  subs: PushSubscriptionInfo[],
  payload: PushPayload,
): Promise<PushResult> {
  const body = JSON.stringify(payload);
  const out: PushResult = { sent: 0, gone: [], errors: [] };
  for (const sub of subs) {
    try {
      await sender(sub, body, { ttl: PUSH_TTL_SECONDS, urgency: 'normal' });
      out.sent++;
    } catch (e) {
      const status = statusOf(e);
      if (status === 404 || status === 410) out.gone.push(sub.endpoint);
      else out.errors.push(status ? `push HTTP ${status}` : `push: ${(e as Error).message}`);
    }
  }
  return out;
}
