import { describe, expect, it } from 'vitest';
import {
  createTopicQueue,
  resolveDataSourceId,
  TOPIC_QUEUE_PROPERTIES,
  upsertAll,
  upsertItem,
} from '../src/notion/index.js';
import type { Enriched } from '../src/score/types.js';
import { NOW } from './helpers.js';
import { fakeNotion } from './fakeNotion.js';

const item = (url = 'https://example.com/a'): Enriched => ({
  id: 'a',
  url,
  title: 'Original title',
  snippet: '',
  source: 'r/SteamDeck, test',
  sourceKind: 'reddit',
  momentum: { perHour: 12.34 },
  tags: [],
  media: { type: 'article' },
  keywordScore: 2,
  score: 40.4,
  niches: ['handheld'],
  ai: {
    score: 77,
    why: 'Because.',
    hook: 'A hook',
    angle: 'An angle',
    title: 'Better title',
    format: 'short',
    effort: 'M',
  },
});

describe('createTopicQueue', () => {
  it('creates the database with exactly the handoff fields and returns its id', async () => {
    const n = fakeNotion();
    expect(await createTopicQueue(n, 'page-1')).toBe('db-new');
    const args = n.calls[0]?.args as {
      parent: unknown;
      initial_data_source: { properties: Record<string, unknown> };
    };
    expect(args.parent).toEqual({ type: 'page_id', page_id: 'page-1' });
    expect(Object.keys(args.initial_data_source.properties)).toEqual([
      'Title',
      'Source',
      'URL',
      'Score',
      'Hook',
      'Angle',
      'Format',
      'Effort',
      'Niche',
      'Status',
      'Found',
      'Momentum',
    ]);
    expect(TOPIC_QUEUE_PROPERTIES.Status.select.options.map((o) => o.name)).toEqual([
      'Inbox',
      'Picked',
      'Scripted',
      'Posted',
      'Skipped',
    ]);
  });
});

describe('upsert', () => {
  it('resolves the data source id from the database id', async () => {
    expect(await resolveDataSourceId(fakeNotion(), 'db')).toBe('ds-1');
  });

  it('queries by URL first and creates with Status=Inbox and Found=now', async () => {
    const n = fakeNotion();
    expect(await upsertItem(n, 'ds-1', item(), NOW)).toBe('created');
    expect(n.calls.map((c) => c.method)).toEqual(['dataSources.query', 'pages.create']);
    expect(n.calls[0]?.args.filter).toEqual({
      property: 'URL',
      url: { equals: 'https://example.com/a' },
    });
    const create = n.calls[1]?.args as {
      parent: unknown;
      properties: Record<string, unknown>;
    };
    expect(create.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds-1' });
    expect(create.properties.Status).toEqual({ select: { name: 'Inbox' } });
    expect(create.properties.Found).toEqual({ date: { start: NOW.toISOString() } });
    expect(create.properties.Score).toEqual({ number: 77 });
    // commas are not allowed in select option names
    expect(create.properties.Source).toEqual({ select: { name: 'r/SteamDeck  test' } });
  });

  it('updates an existing row without touching Status, Found or Title', async () => {
    const n = fakeNotion([{ id: 'page-9', url: 'https://example.com/a' }]);
    expect(await upsertItem(n, 'ds-1', item(), NOW)).toBe('updated');
    expect(n.calls.map((c) => c.method)).toEqual(['dataSources.query', 'pages.update']);
    const props = (n.calls[1]?.args as { properties: Record<string, unknown> }).properties;
    expect(props).not.toHaveProperty('Status');
    expect(props).not.toHaveProperty('Found');
    expect(props).not.toHaveProperty('Title');
    expect(props.Score).toEqual({ number: 77 });
  });

  it('uses the keyword rank as Score in none mode and sets no AI fields', async () => {
    const n = fakeNotion();
    const plain: Enriched = { ...item(), ai: undefined };
    await upsertItem(n, 'ds-1', plain, NOW);
    const props = (n.calls[1]?.args as { properties: Record<string, unknown> }).properties;
    expect(props.Score).toEqual({ number: 40 });
    expect(props).not.toHaveProperty('Hook');
  });

  it('keeps going when one item fails and reports it', async () => {
    const n = fakeNotion();
    const orig = n.pages.create;
    n.pages.create = async (a) => {
      if ((a.properties as { URL: { url: string } }).URL.url.endsWith('bad'))
        throw new Error('boom');
      return orig(a);
    };
    const warnings: string[] = [];
    const r = await upsertAll(
      n,
      'ds-1',
      [item('https://example.com/bad'), item('https://example.com/ok')],
      NOW,
      (m) => warnings.push(m),
    );
    expect(r).toEqual({ created: 1, updated: 0, failed: ['https://example.com/bad'] });
    expect(warnings).toHaveLength(1);
  });
});
