import type { SourceConfig } from '../schema.js';
import { createGithub } from './github.js';
import { createDevto } from './devto.js';
import { createHn } from './hn.js';
import { createLobsters } from './lobsters.js';
import { createMastodon } from './mastodon.js';
import { createReddit } from './reddit.js';
import { createRss } from './rss.js';
import type { BuildOptions, Source } from './types.js';

export type { BuildOptions, Source, SourceContext, SourceStatus } from './types.js';
export { parseHn } from './hn.js';
export { parseRedditJson } from './reddit.js';
export { parseGithub } from './github.js';
export { parseLobsters } from './lobsters.js';
export { parseDevto } from './devto.js';
export { parseMastodonLinks } from './mastodon.js';
export { parseFeed, parseFeedTitle, resolveFeedUrl } from './rss.js';

type Factories = {
  [T in SourceConfig['type']]: (
    cfg: Extract<SourceConfig, { type: T }>,
    opts: BuildOptions,
  ) => Source;
};

/** Adding a source type: write one file under sources/, register it here, add a config entry. */
const factories: Factories = {
  hn: createHn,
  reddit: createReddit,
  github: createGithub,
  rss: createRss,
  lobsters: createLobsters,
  devto: createDevto,
  mastodon: createMastodon,
};

export function buildSource(cfg: SourceConfig, opts: BuildOptions): Source {
  const make = factories[cfg.type] as (c: SourceConfig, o: BuildOptions) => Source;
  return make(cfg, opts);
}

export function buildSources(cfgs: SourceConfig[], opts: BuildOptions): Source[] {
  return cfgs.map((c) => buildSource(c, opts));
}
