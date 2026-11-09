import { getJson } from '../http.js';
import type { RawItem, SourceConfig } from '../schema.js';
import type { BuildOptions, Source, SourceContext } from './types.js';

type GithubConfig = Extract<SourceConfig, { type: 'github' }>;

interface Repo {
  full_name: string;
  html_url: string;
  description?: string | null;
  stargazers_count: number;
  forks_count?: number;
  created_at: string;
  topics?: string[];
  language?: string | null;
  owner?: { login?: string };
}

export function parseGithub(json: unknown): RawItem[] {
  const repos = (json as { items?: Repo[] }).items ?? [];
  return repos.map((r) => {
    const item: RawItem = {
      url: r.html_url,
      title: r.full_name,
      snippet: r.description ?? '',
      stars: r.stargazers_count,
      publishedAt: r.created_at,
      tags: [...(r.topics ?? []), ...(r.language ? [r.language.toLowerCase()] : [])],
      media: { type: 'repo' },
    };
    if (r.owner?.login) item.author = r.owner.login;
    return item;
  });
}

export function createGithub(cfg: GithubConfig, _opts: BuildOptions): Source {
  return {
    id: cfg.id ?? 'github',
    name: 'GitHub',
    kind: 'github',
    alwaysInclude: cfg.alwaysInclude,
    status: { ok: cfg.enabled, ...(cfg.enabled ? {} : { reason: 'disabled in config' }) },
    async fetch(ctx: SourceContext) {
      const since = new Date(ctx.now.getTime() - cfg.daysBack * 86400_000)
        .toISOString()
        .slice(0, 10);
      const token = ctx.env['GITHUB_TOKEN'];
      const headers: Record<string, string> = {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
      const items: RawItem[] = [];
      const seen = new Set<string>();
      let failed = 0;
      // Sequential: the unauthenticated search limit is 10 requests/minute.
      for (const topic of cfg.topics) {
        const q = encodeURIComponent(`topic:${topic} created:>${since}`);
        const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${cfg.perTopic}`;
        try {
          for (const it of parseGithub(await getJson(ctx.fetch, url, headers))) {
            if (seen.has(it.url)) continue;
            seen.add(it.url);
            items.push(it);
          }
        } catch (e) {
          failed++;
          ctx.warn(`github[${topic}]: ${(e as Error).message}`);
        }
      }
      if (failed === cfg.topics.length) throw new Error('all GitHub topic searches failed');
      return items;
    },
  };
}
