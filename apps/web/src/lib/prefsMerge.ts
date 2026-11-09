import type { Defaults } from './feed';
import type { ServerConfig } from './config';
import type { StoredPrefs } from './prefs';

/** Signed in: the account's niches and sources win. Empty server fields fall back to this device. */
export function mergeServerConfig(
  stored: StoredPrefs,
  config: ServerConfig | null,
  defaults: Defaults | null,
): StoredPrefs {
  if (!config) return stored;
  const niches = config.niches.length > 0 ? config.niches : stored.niches;
  const disabledSources =
    config.sources.length > 0 && defaults
      ? defaults.sources.map((s) => s.id).filter((id) => !config.sources.includes(id))
      : stored.disabledSources;
  return { ...stored, niches, disabledSources };
}

export const importFlagKey = (userId: string) => `signal-radar:import-offered:${userId}`;

/** Offer once, when the account has nothing saved but this device does. */
export function shouldOfferImport(
  stored: StoredPrefs,
  config: ServerConfig | null,
  alreadyOffered: boolean,
): boolean {
  if (!config || alreadyOffered) return false;
  if (config.niches.length > 0 || config.sources.length > 0) return false;
  return stored.niches !== null || stored.disabledSources.length > 0;
}

export function importPayload(
  stored: StoredPrefs,
  defaults: Defaults,
): { niches: ServerConfig['niches']; sources: string[] } {
  const off = new Set(stored.disabledSources);
  return {
    niches: stored.niches ?? [],
    sources: defaults.sources.map((s) => s.id).filter((id) => !off.has(id)),
  };
}
