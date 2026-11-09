import { describe, expect, it } from 'vitest';
import { fetchFeedback } from '../src/notion/index.js';
import { buildSystemPrompt } from '../src/score/index.js';
import { niches } from './helpers.js';
import { fakeNotion } from './fakeNotion.js';

const row = (id: string, status: string, title: string, hook = '') => ({
  id,
  status,
  properties: {
    Title: { title: [{ plain_text: title }] },
    Hook: { rich_text: hook ? [{ plain_text: hook }] : [] },
    Source: { select: { name: 'HN' } },
    Niche: { multi_select: [{ name: 'ai' }] },
  },
});

describe('fetchFeedback', () => {
  it('reads Picked and Skipped rows, newest-edited first, capped at the limit', async () => {
    const n = fakeNotion([
      row('1', 'Picked', 'Picked A', 'hook A'),
      row('2', 'Picked', 'Picked B'),
      row('3', 'Skipped', 'Skipped A'),
      row('4', 'Inbox', 'Inbox A'),
    ]);
    const fb = await fetchFeedback(n, 'ds-1', 1);
    expect(fb.picked.map((e) => e.title)).toEqual(['Picked A']);
    expect(fb.picked[0]).toMatchObject({ hook: 'hook A', source: 'HN', niches: ['ai'] });
    expect(fb.skipped.map((e) => e.title)).toEqual(['Skipped A']);
    const q = n.calls[0]?.args as { sorts: unknown; page_size: number };
    expect(q.sorts).toEqual([{ timestamp: 'last_edited_time', direction: 'descending' }]);
    expect(q.page_size).toBe(1);
  });

  it('makes no calls when the limit is 0', async () => {
    const n = fakeNotion();
    expect(await fetchFeedback(n, 'ds-1', 0)).toEqual({ picked: [], skipped: [] });
    expect(n.calls).toHaveLength(0);
  });

  it('feeds the examples into the scoring prompt', async () => {
    const fb = await fetchFeedback(
      fakeNotion([row('1', 'Picked', 'Picked A', 'hook A'), row('3', 'Skipped', 'Skipped A')]),
      'ds-1',
      10,
    );
    const sys = buildSystemPrompt(niches, fb);
    expect(sys).toContain('Picked A');
    expect(sys).toContain('hook: hook A');
    expect(sys).toContain('Skipped A');
  });
});
