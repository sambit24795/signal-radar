#!/usr/bin/env -S npx tsx
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { createDb, createPgStore, runMigrations, schema, type Db } from '@radar/db';
import {
  buildSources,
  createNotionClient,
  createTopicQueue,
  runForUsers,
  runRadar,
  RadarConfigSchema,
  type Enriched,
  type RadarConfig,
} from '@radar/core';

const USAGE = `usage:
  radar run [--config <file>]           fetch once, write the shared feed, then queue items per Pro user (needs DATABASE_URL)
  radar run --dry [--config <file>]     print the ranked table, write nothing (no database needed)
  radar run --local [--data-dir <dir>]  single-user mode: data/seen.json + Notion + one Telegram chat
  radar sources [--config <file>]
  radar db:migrate                      apply SQL migrations to DATABASE_URL
  radar user:list                       users with plan, status, trial end, niches
  radar user:pro --email <e>            dev: make a user Pro/active
  radar notion:init --parent <pageId>   create the Topic Queue database, print its id
  radar telegram:webhook <publicBaseUrl>  point the bot at <base>/api/telegram/webhook (needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET)
  radar telegram:webhook --delete       remove the bot webhook

env (also read from ./.env): DATABASE_URL, DEEPSEEK_API_KEY, TELEGRAM_BOT_TOKEN, GITHUB_TOKEN,
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (Web Push),
  and for --local: NOTION_TOKEN, NOTION_DB_ID, TELEGRAM_CHAT_ID`;

async function loadConfig(file: string): Promise<{ config: RadarConfig; root: string }> {
  const path = resolve(file);
  const mod = (await import(pathToFileURL(path).href)) as { default: unknown };
  return { config: RadarConfigSchema.parse(mod.default), root: dirname(path) };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function momentumLabel(i: Enriched): string {
  const m = i.momentum;
  const raw = m.points ?? m.stars;
  if (!raw) return '-';
  return `${Math.round(m.perHour * 10) / 10}/h (${raw}${m.stars !== undefined ? '★' : 'p'})`;
}

export function renderTable(items: Enriched[], width = process.stdout.columns || 120): string {
  const rows = items.map((it, idx) => [
    String(idx + 1),
    (it.ai?.score ?? it.score).toFixed(1),
    it.ai ? `${it.ai.format}/${it.ai.effort}` : '-',
    momentumLabel(it),
    clip(it.source, 18),
    it.title,
  ]);
  const head = ['#', 'score', 'fmt', 'momentum', 'source', 'title'];
  const w = head.map((h, c) => Math.max(h.length, ...rows.map((r) => (r[c] as string).length)));
  const fixed = w.slice(0, 5).reduce((a, b) => a + b, 0) + 3 * 5 + 2;
  const titleW = Math.max(30, width - fixed);
  const line = (r: string[]) =>
    r
      .map((cell, c) =>
        c === 5
          ? clip(cell, titleW)
          : c === 0 || c === 1
            ? cell.padStart(w[c] ?? 0)
            : cell.padEnd(w[c] ?? 0),
      )
      .join('  ');
  return [line(head), ...rows.map(line)].join('\n');
}

function openDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('set DATABASE_URL (see .env.example)');
  return createDb(url);
}

async function cmdRunDb(values: { config: string }) {
  const { config } = await loadConfig(values.config);
  const db = openDb();
  try {
    const res = await runForUsers(config, createPgStore(db), {
      warn: (m) => console.error(`warn: ${m}`),
    });
    const bySource = res.results
      .map((r) => {
        const status = r.skipped ? `skipped (${r.error})` : r.error ? `FAILED (${r.error})` : 'ok';
        return `  ${r.source.id.padEnd(28)} ${String(r.items.length).padStart(4)} items  ${status}`;
      })
      .join('\n');
    console.log(`sources:\n${bySource}`);
    console.log(
      `\nfetched ${res.fetched} -> deduped ${res.deduped}; feed_item rows upserted: ${res.feedRows}` +
        `\nscoring: ${res.provider}; users processed: ${res.users.length}`,
    );
    for (const u of res.users) {
      console.log(
        `  ${(u.email ?? u.userId).padEnd(28)} candidates ${u.candidates}, scored ${u.scored}` +
          `, failed ${u.scoringFailed}, queued ${u.queued}, seen +${u.seenMarked}` +
          `, telegram ${u.digestSent ? 'sent' : 'skipped'}, push ${u.pushSent}` +
          (u.notion
            ? `, notion ${u.notion.created}+${u.notion.updated}/${u.notion.failed} failed`
            : '') +
          (u.error ? `  ERROR: ${u.error}` : ''),
      );
    }
    if (res.users.some((u) => u.error)) process.exitCode = 1;
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

async function cmdMigrate() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('set DATABASE_URL (see .env.example)');
  await runMigrations(url);
  console.log('migrations applied');
}

async function cmdUserList() {
  const db = openDb();
  try {
    const rows = await db
      .select({
        email: schema.user.email,
        plan: schema.subscription.plan,
        status: schema.subscription.status,
        trialEndsAt: schema.subscription.trialEndsAt,
        niches: schema.userConfig.niches,
        telegram: schema.userConfig.telegramChatId,
      })
      .from(schema.user)
      .leftJoin(schema.subscription, eq(schema.subscription.userId, schema.user.id))
      .leftJoin(schema.userConfig, eq(schema.userConfig.userId, schema.user.id))
      .orderBy(schema.user.createdAt);
    if (!rows.length) return void console.log('no users');
    for (const r of rows) {
      console.log(
        `${r.email.padEnd(32)} ${(r.plan ?? 'free').padEnd(5)} ${(r.status ?? 'none').padEnd(9)}` +
          ` trial ends ${r.trialEndsAt?.toISOString().slice(0, 10) ?? '-'}` +
          `  niches ${r.niches?.length ?? 0}  telegram ${r.telegram ? 'yes' : 'no'}`,
      );
    }
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

async function cmdUserPro(values: { email?: string }) {
  if (!values.email) throw new Error('usage: radar user:pro --email <email>');
  const db = openDb();
  try {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.email, values.email));
    if (!u) throw new Error(`no user with email ${values.email}`);
    const set = { plan: 'pro', status: 'active', provider: 'stub', trialEndsAt: null } as const;
    await db
      .insert(schema.subscription)
      .values({ userId: u.id, ...set })
      .onConflictDoUpdate({ target: schema.subscription.userId, set });
    console.log(`${u.email} is now pro/active`);
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

async function cmdRun(values: { dry?: boolean; config: string; 'data-dir'?: string }) {
  const { config, root } = await loadConfig(values.config);
  const dataDir = resolve(values['data-dir'] ?? resolve(root, config.dataDir));
  const warn = (m: string) => console.error(`warn: ${m}`);

  const res = await runRadar(config, { dataDir, dry: values.dry, warn });
  const p = res.pipeline;

  const bySource = p.results
    .map((r) => {
      const status = r.skipped ? `skipped (${r.error})` : r.error ? `FAILED (${r.error})` : 'ok';
      return `  ${r.source.id.padEnd(28)} ${String(r.items.length).padStart(4)} items  ${status}`;
    })
    .join('\n');
  console.log(`sources:\n${bySource}`);
  const c = p.counts;
  console.log(
    `\nfetched ${c.fetched} -> normalized ${c.normalized} -> deduped ${c.afterDedupe} ` +
      `-> unseen ${c.afterSeen} -> prefiltered ${c.afterPrefilter} -> top ${c.final}`,
  );
  console.log(
    `scoring: ${res.provider}` +
      (res.provider === 'none'
        ? ' (keyword + momentum rank only)'
        : ` (${res.items.length} scored, ${res.scoringFailed} failed, ` +
          `${res.feedback.picked.length} picked / ${res.feedback.skipped.length} skipped examples)`) +
      '\n',
  );
  console.log(renderTable(res.items));
  const hooks = res.items.filter((i) => i.ai).slice(0, 5);
  if (hooks.length) {
    console.log('\nhooks:');
    for (const i of hooks)
      console.log(`  ${(i.ai?.score ?? 0).toFixed(0).padStart(3)}  ${i.ai?.hook}`);
  }

  if (values.dry) {
    console.log('\n(dry run: nothing written, no Notion or Telegram calls)');
    return;
  }
  const n = res.notion;
  console.log(
    `\nnotion: ${n ? `${n.created} created, ${n.updated} updated, ${n.failed.length} failed` : 'skipped'}` +
      `   telegram: ${res.digestSent ? 'sent' : 'skipped'}   seen +${res.seenMarked}`,
  );
  console.log(`wrote ${resolve(dataDir, 'feed.json')} and ${resolve(dataDir, 'seen.json')}`);
}

async function cmdNotionInit(values: { parent?: string }) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('set NOTION_TOKEN (an internal integration token)');
  if (!values.parent) throw new Error('usage: radar notion:init --parent <pageId>');
  const id = await createTopicQueue(createNotionClient(token), values.parent);
  console.log(`created Topic Queue database.\nNOTION_DB_ID=${id}`);
  console.log('Set that as the NOTION_DB_ID secret / env var.');
}

async function cmdTelegramWebhook(base: string | undefined, remove: boolean) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('set TELEGRAM_BOT_TOKEN');
  let body: Record<string, unknown>;
  let method: string;
  if (remove) {
    method = 'deleteWebhook';
    body = {};
  } else {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) throw new Error('set TELEGRAM_WEBHOOK_SECRET');
    if (!base) throw new Error('usage: radar telegram:webhook <publicBaseUrl> | --delete');
    const url = new URL(base);
    if (url.protocol !== 'https:') throw new Error('the public base URL must be https');
    method = 'setWebhook';
    body = {
      url: `${url.origin}${url.pathname.replace(/\/+$/, '')}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ['message'],
    };
  }
  // Never print the URL (it holds the bot token).
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !json.ok) {
    throw new Error(`telegram ${method} failed: ${json.description ?? `HTTP ${res.status}`}`);
  }
  console.log(remove ? 'webhook removed' : `webhook set to ${String(body.url)}`);
}

async function cmdSources(values: { config: string }) {
  const { config } = await loadConfig(values.config);
  const sources = buildSources(config.sources, { rsshubBase: config.rsshubBase });
  console.log(`rsshubBase: ${config.rsshubBase ?? '(unset)'}   provider: ${config.provider}\n`);
  for (const s of sources) {
    const status = s.status.ok ? 'enabled' : `disabled (${s.status.reason})`;
    const flag = s.alwaysInclude ? ' [alwaysInclude]' : '';
    console.log(`${s.id.padEnd(30)} ${s.kind.padEnd(7)} ${status}${flag}`);
  }
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      dry: { type: 'boolean', default: false },
      config: { type: 'string', default: 'radar.config.ts' },
      'data-dir': { type: 'string' },
      parent: { type: 'string' },
      local: { type: 'boolean', default: false },
      delete: { type: 'boolean', default: false },
      email: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [cmd] = positionals;
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (values.help || !cmd) return void console.log(USAGE);
  if (cmd === 'run') return values.dry || values.local ? cmdRun(values) : cmdRunDb(values);
  if (cmd === 'db:migrate') return cmdMigrate();
  if (cmd === 'user:list') return cmdUserList();
  if (cmd === 'user:pro') return cmdUserPro(values);
  if (cmd === 'sources') return cmdSources(values);
  if (cmd === 'notion:init') return cmdNotionInit(values);
  if (cmd === 'telegram:webhook') return cmdTelegramWebhook(positionals[1], values.delete);
  console.error(`unknown command: ${cmd}\n${USAGE}`);
  process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
