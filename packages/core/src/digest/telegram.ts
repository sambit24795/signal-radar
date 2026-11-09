import type { FetchFn } from '../http.js';
import type { Enriched } from '../score/types.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s: string) => esc(s).replace(/"/g, '&quot;');

/** HTML message for the Telegram Bot API (limit 4096 chars; the top items stay well under it). */
export function formatDigest(items: Enriched[], created: number): string {
  const lines = [`<b>Signal Radar</b>: ${created} new, top ${items.length}`];
  items.forEach((it, i) => {
    const score = it.ai ? String(Math.round(it.ai.score)) : it.score.toFixed(0);
    const title = it.ai?.title ?? it.title;
    lines.push('', `${i + 1}. <b>${esc(title)}</b> (${score})`);
    if (it.ai) lines.push(esc(it.ai.hook));
    lines.push(`<a href="${attr(it.url)}">${esc(new URL(it.url).hostname)}</a>`);
  });
  return lines.join('\n').slice(0, 4000);
}

/** A Bot API failure. Carries the HTTP status but never the URL (it holds the bot token). */
export class TelegramError extends Error {
  constructor(readonly status: number) {
    super(`telegram HTTP ${status}`);
    this.name = 'TelegramError';
  }
}

async function postMessage(
  fetchFn: FetchFn,
  token: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new TelegramError(res.status);
}

/** Plain-text reply to a chat. Throws `TelegramError` on an API error. */
export async function sendMessage(
  fetchFn: FetchFn,
  token: string,
  chatId: string | number,
  text: string,
): Promise<void> {
  await postMessage(fetchFn, token, {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
  });
}

/**
 * Send the digest. Returns false (without calling the API) when the token or chat id is unset;
 * throws a `TelegramError` on an API error so the caller can warn (403 = the user blocked the bot).
 */
export async function sendDigest(
  fetchFn: FetchFn,
  env: Record<string, string | undefined>,
  items: Enriched[],
  created: number,
): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || items.length === 0) return false;
  await postMessage(fetchFn, token, {
    chat_id: chatId,
    text: formatDigest(items, created),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
  return true;
}
