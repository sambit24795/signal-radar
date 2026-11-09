import { Client } from '@notionhq/client';
import type { Enriched, Feedback, FeedbackExample } from '../score/types.js';

/** The slice of the Notion SDK we use; tests pass a fake. Notion API version 2025-09-03 (data sources). */
export interface NotionLike {
  databases: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    retrieve(args: { database_id: string }): Promise<{ data_sources?: { id: string }[] }>;
  };
  dataSources: {
    query(args: Record<string, unknown>): Promise<{ results: unknown[] }>;
  };
  pages: {
    create(args: Record<string, unknown>): Promise<unknown>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
}

export function createNotionClient(token: string): NotionLike {
  return new Client({ auth: token }) as unknown as NotionLike;
}

export const STATUSES = ['Inbox', 'Picked', 'Scripted', 'Posted', 'Skipped'] as const;

/** Exactly the fields of the Topic Queue database. */
export const TOPIC_QUEUE_PROPERTIES = {
  Title: { title: {} },
  Source: { select: {} },
  URL: { url: {} },
  Score: { number: { format: 'number' } },
  Hook: { rich_text: {} },
  Angle: { rich_text: {} },
  Format: { select: { options: ['short', 'long', 'skip'].map((name) => ({ name })) } },
  Effort: { select: { options: ['S', 'M', 'L'].map((name) => ({ name })) } },
  Niche: { multi_select: {} },
  Status: { select: { options: STATUSES.map((name) => ({ name })) } },
  Found: { date: {} },
  Momentum: { number: { format: 'number' } },
} as const;

/** Create the Topic Queue database under a page; returns the database id. */
export async function createTopicQueue(notion: NotionLike, parentPageId: string): Promise<string> {
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: 'Topic Queue' } }],
    initial_data_source: { properties: TOPIC_QUEUE_PROPERTIES },
  });
  return db.id;
}

/** Notion API v2025-09-03 queries and creates pages against the data source, not the database. */
export async function resolveDataSourceId(notion: NotionLike, databaseId: string): Promise<string> {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const id = db.data_sources?.[0]?.id;
  if (!id)
    throw new Error(
      `database ${databaseId} has no data source (is it shared with the integration?)`,
    );
  return id;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const text = (s: string) => ({ rich_text: [{ type: 'text', text: { content: clip(s, 2000) } }] });
// Select option names cannot contain commas.
const option = (s: string) => ({ name: clip(s.replace(/,/g, ' '), 100) });

function scoreProps(item: Enriched) {
  const props: Record<string, unknown> = {
    // Without AI the keyword+momentum rank is all we have.
    Score: { number: item.ai?.score ?? Math.round(item.score) },
    Niche: { multi_select: item.niches.map(option) },
    Momentum: { number: Math.round(item.momentum.perHour * 10) / 10 },
  };
  if (item.ai) {
    props.Hook = text(item.ai.hook);
    props.Angle = text(item.ai.angle);
    props.Format = { select: { name: item.ai.format } };
    props.Effort = { select: { name: item.ai.effort } };
  }
  return props;
}

export type UpsertOutcome = 'created' | 'updated';

/**
 * Upsert one item by URL. New rows get Status=Inbox and Found=now; existing rows only get their
 * scoring fields refreshed, so Status (and anything the user edited by hand) is never overwritten.
 */
export async function upsertItem(
  notion: NotionLike,
  dataSourceId: string,
  item: Enriched,
  now: Date,
): Promise<UpsertOutcome> {
  const found = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: { property: 'URL', url: { equals: item.url } },
    page_size: 1,
  });
  const existing = found.results[0] as { id?: string } | undefined;
  if (existing?.id) {
    await notion.pages.update({ page_id: existing.id, properties: scoreProps(item) });
    return 'updated';
  }
  await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: {
      Title: {
        title: [{ type: 'text', text: { content: clip(item.ai?.title ?? item.title, 200) } }],
      },
      Source: { select: option(item.source) },
      URL: { url: item.url },
      Status: { select: { name: 'Inbox' } },
      Found: { date: { start: now.toISOString() } },
      ...scoreProps(item),
    },
    ...(item.ai
      ? {
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: clip(`Why: ${item.ai.why}`, 2000) } }],
              },
            },
          ],
        }
      : {}),
  });
  return 'created';
}

export interface UpsertSummary {
  created: number;
  updated: number;
  /** URLs whose upsert threw; they should not be marked seen. */
  failed: string[];
}

export async function upsertAll(
  notion: NotionLike,
  dataSourceId: string,
  items: Enriched[],
  now: Date,
  warn: (m: string) => void,
): Promise<UpsertSummary> {
  const out: UpsertSummary = { created: 0, updated: 0, failed: [] };
  for (const item of items) {
    try {
      out[await upsertItem(notion, dataSourceId, item, now)]++;
    } catch (e) {
      out.failed.push(item.url);
      warn(`notion: failed to upsert ${item.url}: ${(e as Error).message}`);
    }
  }
  return out;
}

// ---- feedback loop ----

type Prop = {
  title?: { plain_text?: string }[];
  rich_text?: { plain_text?: string }[];
  select?: { name?: string } | null;
  multi_select?: { name?: string }[];
};

const plain = (p?: Prop) =>
  (p?.title ?? p?.rich_text ?? [])
    .map((t) => t.plain_text ?? '')
    .join('')
    .trim();

function toExample(page: unknown): FeedbackExample | null {
  const props = (page as { properties?: Record<string, Prop> }).properties ?? {};
  const title = plain(props.Title);
  if (!title) return null;
  const ex: FeedbackExample = { title };
  const source = props.Source?.select?.name;
  if (source) ex.source = source;
  const hook = plain(props.Hook);
  if (hook) ex.hook = hook;
  const angle = plain(props.Angle);
  if (angle) ex.angle = angle;
  const niches = (props.Niche?.multi_select ?? []).map((n) => n.name ?? '').filter(Boolean);
  if (niches.length) ex.niches = niches;
  return ex;
}

/** The most recently edited Picked and Skipped rows (up to `limit` each), as few-shot examples. */
export async function fetchFeedback(
  notion: NotionLike,
  dataSourceId: string,
  limit: number,
): Promise<Feedback> {
  if (limit <= 0) return { picked: [], skipped: [] };
  const read = async (status: 'Picked' | 'Skipped') => {
    const r = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: { property: 'Status', select: { equals: status } },
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: limit,
    });
    return r.results
      .slice(0, limit)
      .map(toExample)
      .filter((e): e is FeedbackExample => e !== null);
  };
  const [picked, skipped] = await Promise.all([read('Picked'), read('Skipped')]);
  return { picked, skipped };
}
