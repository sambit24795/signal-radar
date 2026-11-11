import { useEffect, useMemo, useState } from 'react';
import {
  topicSourceKey,
  topicSourcesOf,
  type Item,
  type Niche,
  type TopicSource,
} from '@radar/core/ranking';
import { api } from './api';

/** Items fetched for the user's topic sources, and which topics each one was fetched for (by url). */
export interface TopicItems {
  items: Item[];
  owners: ReadonlyMap<string, readonly string[]>;
}

export const NO_TOPIC_ITEMS: TopicItems = { items: [], owners: new Map() };

export interface TopicPlan {
  /** Each distinct source once. */
  sources: TopicSource[];
  /** Source key -> ids of the topics that read from it. */
  byKey: Map<string, string[]>;
}

/** What to ask the server for: every topic's sources, each distinct one once. */
export function planTopicSources(niches: readonly Niche[]): TopicPlan {
  const sources = new Map<string, TopicSource>();
  const byKey = new Map<string, string[]>();
  for (const n of niches) {
    for (const s of topicSourcesOf(n)) {
      const key = topicSourceKey(s);
      sources.set(key, s);
      const ids = byKey.get(key) ?? [];
      if (!ids.includes(n.id)) ids.push(n.id);
      byKey.set(key, ids);
    }
  }
  return { sources: [...sources.values()], byKey };
}

export interface TopicFeedResult {
  results: { source: TopicSource; items: Item[] }[];
  failed: string[];
}

/** Merges the server's per-source results into one item list (one entry per url) with its owners. */
export function buildTopicItems(res: TopicFeedResult, byKey: Map<string, string[]>): TopicItems {
  const items = new Map<string, Item>();
  const owners = new Map<string, string[]>();
  for (const { source, items: list } of res.results) {
    const ids = byKey.get(topicSourceKey(source)) ?? [];
    for (const item of list) {
      if (!items.has(item.url)) items.set(item.url, item);
      const mine = owners.get(item.url) ?? [];
      for (const id of ids) if (!mine.includes(id)) mine.push(id);
      owners.set(item.url, mine);
    }
  }
  return { items: [...items.values()], owners };
}

const TTL_MS = 10 * 60 * 1000;
const memo = new Map<string, { at: number; value: TopicItems }>();

/** Live items for the topic sources. Failures leave the feed as it is: topic sources are a bonus, not a gate. */
export function useTopicItems(niches: readonly Niche[] | undefined, enabled: boolean): TopicItems {
  const plan = useMemo(() => planTopicSources(enabled && niches ? niches : []), [niches, enabled]);
  const key = useMemo(
    () => plan.sources.map(topicSourceKey).sort().join('|') + '#' + [...plan.byKey].join(';'),
    [plan],
  );
  const [state, setState] = useState<{ key: string; value: TopicItems }>({
    key: '',
    value: NO_TOPIC_ITEMS,
  });

  useEffect(() => {
    if (plan.sources.length === 0) {
      setState({ key, value: NO_TOPIC_ITEMS });
      return;
    }
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setState({ key, value: hit.value });
      return;
    }
    let live = true;
    api<TopicFeedResult>('/api/topics/feed', { method: 'POST', json: { sources: plan.sources } })
      .then((res) => {
        const value = buildTopicItems(res, plan.byKey);
        if (res.failed.length === 0) memo.set(key, { at: Date.now(), value });
        if (live) setState({ key, value });
      })
      .catch(() => {
        /* keep what is on screen */
      });
    return () => {
      live = false;
    };
  }, [key, plan]);

  return state.value;
}

/** Subreddits matching a topic name, or null when Reddit would not answer right now. */
export async function findTopicSubreddits(name: string): Promise<TopicSource[] | null> {
  try {
    const res = await api<{ reddit: TopicSource[]; available: boolean }>('/api/topics/sources', {
      method: 'POST',
      json: { name },
    });
    return res.available ? res.reddit : null;
  } catch {
    return null;
  }
}
