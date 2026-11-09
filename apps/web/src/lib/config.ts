import type { Niche } from '@radar/core/ranking';
import { api } from './api';
import { createStore } from './store';

export interface ServerConfig {
  niches: Niche[];
  /** Enabled source ids; empty means "the defaults". */
  sources: string[];
  topN: number;
  telegramChatId: string | null;
  notion: { dbId: string; hasToken: boolean } | null;
}

export interface ConfigState {
  config: ServerConfig | null;
  /** The last background save failed. */
  syncError: boolean;
}

const store = createStore<ConfigState>({ config: null, syncError: false });
export const useConfig = store.use;
export const getConfig = store.get;

let timer: ReturnType<typeof setTimeout> | undefined;

export async function loadConfig(): Promise<void> {
  try {
    const res = await api<{ config: ServerConfig | null }>('/api/me/config');
    store.set({ config: res.config, syncError: false });
  } catch {
    /* keep local prefs; the Read view still works */
  }
}

export function clearConfig(): void {
  clearTimeout(timer);
  store.set({ config: null, syncError: false });
}

/** The body PUT /api/me/config expects. A stored Notion token is kept by omitting it. */
export function toBody(cfg: ServerConfig, notionToken?: string): Record<string, unknown> {
  return {
    niches: cfg.niches,
    sources: cfg.sources,
    topN: cfg.topN,
    telegramChatId: cfg.telegramChatId,
    notion: cfg.notion
      ? notionToken
        ? { token: notionToken, dbId: cfg.notion.dbId }
        : { dbId: cfg.notion.dbId }
      : null,
  };
}

/** Full save (Settings form). Throws on failure so the form can say so. */
export async function saveConfig(next: ServerConfig, notionToken?: string): Promise<void> {
  clearTimeout(timer);
  const res = await api<{ config: ServerConfig }>('/api/me/config', {
    method: 'PUT',
    json: toBody(next, notionToken),
  });
  store.set({ config: res.config, syncError: false });
}

/** Quick edits from the Customize sheet: applied at once, saved after a short pause. */
export function patchConfig(patch: Partial<Pick<ServerConfig, 'niches' | 'sources'>>): void {
  const cur = store.get().config;
  if (!cur) return;
  store.set({ config: { ...cur, ...patch }, syncError: false });
  clearTimeout(timer);
  timer = setTimeout(() => {
    const cfg = store.get().config;
    if (!cfg) return;
    api('/api/me/config', { method: 'PUT', json: toBody(cfg) }).catch(() =>
      store.set((s) => ({ ...s, syncError: true })),
    );
  }, 600);
}
