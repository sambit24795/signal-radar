import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const SeenSchema = z.object({
  version: z.literal(1),
  /** item id (hash of canonical URL) -> ISO time first seen */
  entries: z.record(z.string(), z.string()),
});
export type SeenStore = z.infer<typeof SeenSchema>;

export const emptySeen = (): SeenStore => ({ version: 1, entries: {} });

export async function loadSeen(path: string, warn?: (m: string) => void): Promise<SeenStore> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return emptySeen();
  }
  try {
    return SeenSchema.parse(JSON.parse(raw));
  } catch (e) {
    warn?.(`seen store ${path} is unreadable (${(e as Error).message}); starting empty`);
    return emptySeen();
  }
}

export async function saveSeen(path: string, store: SeenStore): Promise<void> {
  const entries = Object.fromEntries(
    Object.entries(store.entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ version: 1, entries }, null, 2) + '\n');
}

/** Drop entries first seen more than `ttlDays` ago. */
export function pruneSeen(store: SeenStore, now: Date, ttlDays = 30): SeenStore {
  const cutoff = now.getTime() - ttlDays * 86_400_000;
  const entries: Record<string, string> = {};
  for (const [id, at] of Object.entries(store.entries)) {
    const t = Date.parse(at);
    if (!Number.isNaN(t) && t >= cutoff) entries[id] = at;
  }
  return { version: 1, entries };
}

export function markSeen(store: SeenStore, ids: string[], now: Date): SeenStore {
  const entries = { ...store.entries };
  for (const id of ids) entries[id] ??= now.toISOString();
  return { version: 1, entries };
}

export function filterUnseen<T extends { id: string }>(items: T[], store: SeenStore): T[] {
  return items.filter((i) => !(i.id in store.entries));
}
