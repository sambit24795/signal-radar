#!/usr/bin/env -S npx tsx
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import {
  buildSources,
  createNotionClient,
  createTopicQueue,
  runRadar,
  RadarConfigSchema,
  type Enriched,
  type RadarConfig,
} from '@radar/core';

const USAGE = `usage:
  radar run [--dry] [--config <file>] [--data-dir <dir>]
  radar sources [--config <file>]
  radar notion:init --parent <pageId>   create the Topic Queue database, print its id

env (also read from ./.env): DEEPSEEK_API_KEY, NOTION_TOKEN, NOTION_DB_ID,
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GITHUB_TOKEN`;

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
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [cmd] = positionals;
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (values.help || !cmd) return void console.log(USAGE);
  if (cmd === 'run') return cmdRun(values);
  if (cmd === 'sources') return cmdSources(values);
  if (cmd === 'notion:init') return cmdNotionInit(values);
  console.error(`unknown command: ${cmd}\n${USAGE}`);
  process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
