import { useEffect, useMemo, useState } from 'react';
import { fetchDefaults, fetchFeed, type Defaults, type Feed } from './lib/feed';
import { loadPrefs, resolvePrefs } from './lib/prefs';
import { rankFeed } from './lib/rankClient';

// Placeholder until the real UI lands: ranked list as plain text.
export function App() {
  const [data, setData] = useState<{ defaults: Defaults; feed: Feed } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchDefaults(), fetchFeed()])
      .then(([defaults, feed]) => setData({ defaults, feed }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const ranked = useMemo(() => {
    if (!data) return [];
    const prefs = resolvePrefs(loadPrefs(localStorage), data.defaults);
    return rankFeed(data.feed.items, prefs.niches, { sources: prefs.sources, topN: 50 });
  }, [data]);

  if (error) return <p>Could not load the feed: {error}</p>;
  if (!data) return <p>Loading...</p>;
  return (
    <main>
      <h1>Signal Radar</h1>
      <ol>
        {ranked.map((item) => (
          <li key={item.id}>
            <a href={item.url} rel="noopener">
              {item.title}
            </a>{' '}
            ({item.source}, score {item.score})
          </li>
        ))}
      </ol>
    </main>
  );
}
