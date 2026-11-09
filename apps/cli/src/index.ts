#!/usr/bin/env -S npx tsx
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildSources,
  loadSeen,
  markSeen,
  pruneSeen,
  runPipeline,
  saveSeen,
  writeFeed,
  RadarConfigSchema,
  type RadarConfig,
  type ScoredItem,
} from '@radar/core';

const USAGE = `usage:
  radar run [--dry] [--config <file>] [--data-dir <dir>]
  radar sources [--config <file>]`;

async function loadConfig(file: string): Promise<{ config: RadarConfig; root: string }> {
  const path = resolve(file);
  const mod = (await import(pathToFileURL(path).href)) as { default: unknown };
  return { config: RadarConfigSchema.parse(mod.default), root: dirname(path) };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function momentumLabel(i: ScoredItem): string {
  const m = i.momentum;
  const raw = m.points ?? m.stars;
  if (!raw) return '-';
  return `${Math.round(m.perHour * 10) / 10}/h (${raw}${m.stars !== undefined ? '★' : 'p'})`;
}

export function renderTable(items: ScoredItem[], width = process.stdout.columns || 120): string {
  const rows = items.map((it, idx) => [
    String(idx + 1),
    it.score.toFixed(1),
    momentumLabel(it),
    clip(it.source, 18),
    it.title,
  ]);
  const head = ['#', 'score', 'momentum', 'source', 'title'];
  const w = head.map((h, c) => Math.max(h.length, ...rows.map((r) => (r[c] as string).length)));
  const fixed = w.slice(0, 4).reduce((a, b) => a + b, 0) + 3 * 4 + 2;
  const titleW = Math.max(30, width - fixed);
  const line = (r: string[]) =>
    r
      .map((cell, c) =>
        c === 4
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
  const seenPath = resolve(dataDir, 'seen.json');
  const now = new Date();
  const warn = (m: string) => console.error(`warn: ${m}`);

  const seen = pruneSeen(await loadSeen(seenPath, warn), now, config.seenTtlDays);
  const res = await runPipeline(config, { seen, now, warn });

  const bySource = res.results
    .map((r) => {
      const status = r.skipped ? `skipped (${r.error})` : r.error ? `FAILED (${r.error})` : 'ok';
      return `  ${r.source.id.padEnd(28)} ${String(r.items.length).padStart(4)} items  ${status}`;
    })
    .join('\n');
  console.log(`sources:\n${bySource}`);
  const c = res.counts;
  console.log(
    `\nfetched ${c.fetched} -> normalized ${c.normalized} -> deduped ${c.afterDedupe} ` +
      `-> unseen ${c.afterSeen} -> prefiltered ${c.afterPrefilter} -> top ${c.final}\n`,
  );
  console.log(renderTable(res.items));

  if (values.dry) {
    console.log('\n(dry run: nothing written)');
    return;
  }
  await writeFeed(resolve(dataDir, 'feed.json'), res.items, now);
  await saveSeen(
    seenPath,
    markSeen(
      seen,
      res.items.map((i) => i.id),
      now,
    ),
  );
  console.log(`\nwrote ${resolve(dataDir, 'feed.json')} and updated ${seenPath}`);
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
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [cmd] = positionals;
  if (values.help || !cmd) return void console.log(USAGE);
  if (cmd === 'run') return cmdRun(values);
  if (cmd === 'sources') return cmdSources(values);
  console.error(`unknown command: ${cmd}\n${USAGE}`);
  process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
