import { describe, expect, it } from 'vitest';
import {
  createPushSender,
  formatPush,
  sendMessage,
  sendPush,
  TelegramError,
  type PushSender,
} from '../src/index.js';
import type { Enriched } from '../src/score/types.js';
import { res } from './helpers.js';

const item = (title: string, aiTitle?: string): Enriched => ({
  id: title,
  url: 'https://example.com/a',
  title,
  snippet: '',
  source: 'HN',
  sourceKind: 'hn',
  momentum: { perHour: 1 },
  tags: [],
  media: { type: 'article' },
  keywordScore: 1,
  score: 10,
  niches: [],
  ...(aiTitle
    ? {
        ai: {
          score: 80,
          why: 'w',
          summary: 's',
          hook: 'h',
          angle: 'a',
          title: aiTitle,
          format: 'short' as const,
          effort: 'S' as const,
        },
      }
    : {}),
});

const sub = (n: string) => ({
  endpoint: `https://push.test/${n}`,
  keys: { p256dh: 'p', auth: 'a' },
});

describe('formatPush', () => {
  it('uses the count, the top ai title and the queue url', () => {
    expect(formatPush([item('Raw', 'AI title'), item('Other')], 4)).toEqual({
      title: '4 new in your queue',
      body: 'AI title',
      url: '/queue',
      tag: 'queue',
    });
  });

  it('falls back to the raw title and clips the body to 120 chars', () => {
    expect(formatPush([item('Raw title')], 1).body).toBe('Raw title');
    const long = formatPush([item('x'.repeat(300))], 1).body;
    expect(long).toHaveLength(120);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('sendPush', () => {
  const payload = { title: 't', body: 'b', url: '/queue', tag: 'queue' };

  it('sends to every subscription with a 12 h ttl and normal urgency', async () => {
    const seen: unknown[] = [];
    const sender: PushSender = async (s, body, o) => {
      seen.push([s.endpoint, JSON.parse(body), o]);
    };
    const out = await sendPush(sender, [sub('a'), sub('b')], payload);
    expect(out).toEqual({ sent: 2, gone: [], errors: [] });
    expect(seen[0]).toEqual([sub('a').endpoint, payload, { ttl: 43200, urgency: 'normal' }]);
  });

  it('reports 404 and 410 as gone and keeps going past other failures', async () => {
    const codes: Record<string, number | undefined> = { a: 404, b: 410, c: 500, d: undefined };
    const sender: PushSender = async (s) => {
      const code = codes[s.endpoint.split('/').pop() ?? ''];
      if (code === undefined && !s.endpoint.endsWith('/e')) throw new Error('boom');
      if (code !== undefined) throw Object.assign(new Error('x'), { statusCode: code });
    };
    const out = await sendPush(sender, ['a', 'b', 'c', 'd', 'e'].map(sub), payload);
    expect(out.sent).toBe(1);
    expect(out.gone).toEqual([sub('a').endpoint, sub('b').endpoint]);
    expect(out.errors).toEqual(['push HTTP 500', 'push: boom']);
  });
});

describe('createPushSender', () => {
  it('is null unless all three VAPID vars are set', () => {
    expect(createPushSender({})).toBeNull();
    expect(createPushSender({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' })).toBeNull();
    expect(
      createPushSender({
        VAPID_PUBLIC_KEY: 'a',
        VAPID_PRIVATE_KEY: 'b',
        VAPID_SUBJECT: 'mailto:a@b.c',
      }),
    ).toBeTypeOf('function');
  });
});

describe('telegram sendMessage', () => {
  it('posts plain text to the chat', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return res('{"ok":true}');
    };
    await sendMessage(f, 'tok', 42, 'hi');
    expect(calls[0]?.url).toBe('https://api.telegram.org/bottok/sendMessage');
    expect(calls[0]?.body).toMatchObject({ chat_id: 42, text: 'hi' });
    expect(calls[0]?.body.parse_mode).toBeUndefined();
  });

  it('throws a TelegramError with the status and no token in the message', async () => {
    const err = await sendMessage(async () => res('', 403), 'secret-token', 1, 'x').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TelegramError);
    expect((err as TelegramError).status).toBe(403);
    expect((err as Error).message).not.toContain('secret-token');
  });
});
