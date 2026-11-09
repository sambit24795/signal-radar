import type { NotionLike } from '../src/notion/index.js';

type Call = { method: string; args: Record<string, unknown> };

/** In-memory Notion fake: pages keyed by URL; query supports the URL and Status filters. */
export function fakeNotion(
  seed: { id: string; url?: string; status?: string; properties?: Record<string, unknown> }[] = [],
) {
  const calls: Call[] = [];
  const rows = [...seed];
  const rec = (method: string, args: Record<string, unknown>) => calls.push({ method, args });
  const notion: NotionLike = {
    databases: {
      create: async (args) => {
        rec('databases.create', args);
        return { id: 'db-new' };
      },
      retrieve: async (args) => {
        rec('databases.retrieve', args);
        return { data_sources: [{ id: 'ds-1' }] };
      },
    },
    dataSources: {
      query: async (args) => {
        rec('dataSources.query', args);
        const f = args.filter as {
          property: string;
          url?: { equals: string };
          select?: { equals: string };
        };
        const results = rows.filter((r) =>
          f.property === 'URL' ? r.url === f.url?.equals : r.status === f.select?.equals,
        );
        return { results: results.slice(0, (args.page_size as number | undefined) ?? 100) };
      },
    },
    pages: {
      create: async (args) => {
        rec('pages.create', args);
        return {};
      },
      update: async (args) => {
        rec('pages.update', args);
        return {};
      },
    },
  };
  return Object.assign(notion, { calls });
}
