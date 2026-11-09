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

/**
 * Send the digest. Returns false (without calling the API) when the token or chat id is unset;
 * throws on an API error so the caller can warn.
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
  const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: formatDigest(items, created),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
  });
  // Never put the URL (it holds the bot token) in the error.
  if (!res.ok) throw new Error(`telegram HTTP ${res.status}`);
  return true;
}
