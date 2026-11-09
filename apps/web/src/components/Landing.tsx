import { useMemo } from 'react';
import type { Data } from '../hooks';
import { formatUpdated } from '../lib/format';
import { rankFeed } from '../lib/rankClient';
import { ItemList, Skeleton } from './ItemList';
import { Link } from './Link';

const STEPS = [
  {
    title: 'Pick your niches',
    body: 'Start from sixteen topics or write your own keywords. On Pro, add RSS feeds for subjects the built-in sources do not cover.',
  },
  {
    title: 'The radar ranks',
    body: 'Each run reads the sources, drops duplicates and orders what is left by keyword match and momentum. There is no engagement feed and nothing is recommended to you.',
  },
  {
    title: 'Make what is moving',
    body: 'Free reads the ranked list. Pro adds a hook, an angle and a title for the best items, in a queue that learns from what you pick and skip.',
  },
];

export function Landing({ data, now, retry }: { data: Data; now: number; retry: () => void }) {
  const top = useMemo(
    () =>
      data.status === 'ready'
        ? rankFeed(data.feed.items, data.defaults.niches, {
            sources: data.defaults.sources,
            topN: 5,
          })
        : [],
    [data],
  );

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="landing-title">
        <h2 id="landing-title" className="hero-title">
          Find the story before the algorithm does.
        </h2>
        <p className="hero-pitch">
          Signal Radar is an algorithm-free radar for creators. It reads Hacker News, Reddit, GitHub
          and the feeds you choose, ranks every story against the niches you follow, and shows you
          what is moving. On Pro, the best of each run comes back as a queue of ready hooks.
        </p>
        <div className="hero-actions">
          <Link to="read" className="btn btn-solid btn-lg">
            Open the radar
          </Link>
          <Link to="signin" signup className="btn btn-lg">
            Start 7-day trial
          </Link>
        </div>
        <p className="meta">Reading is free and needs no account.</p>
      </section>

      <section className="lsec" aria-labelledby="landing-live">
        <div className="lsec-head">
          <h3 id="landing-live" className="lsec-title">
            On the radar right now
          </h3>
          <p className="meta" aria-live="polite">
            {data.status === 'ready' && data.feed.updatedAt
              ? `Updated ${formatUpdated(data.feed.updatedAt, now)}`
              : data.status === 'loading'
                ? 'Loading the feed'
                : ''}
          </p>
          <p className="lsec-note">
            Ranked for the default niches. Your radar follows the niches you pick.
          </p>
        </div>
        <div className="lsec-body">
          {data.status === 'loading' && <Skeleton count={5} />}
          {data.status === 'error' && (
            <div className="state" role="alert">
              <h3 className="state-title">The feed did not load</h3>
              <p>
                <button type="button" className="link" onClick={retry}>
                  Try again
                </button>
              </p>
            </div>
          )}
          {data.status === 'ready' &&
            (top.length > 0 ? (
              <>
                <ItemList items={top} niches={data.defaults.niches} now={now} />
                <p className="lsec-more">
                  <Link to="read" className="link">
                    Read the full ranked list
                  </Link>
                </p>
              </>
            ) : (
              <p className="lede">
                Nothing has matched yet. The first run fills the feed.{' '}
                <Link to="read" className="link">
                  Open the radar
                </Link>
              </p>
            ))}
        </div>
      </section>

      <section className="lsec" aria-labelledby="landing-how">
        <div className="lsec-head">
          <h3 id="landing-how" className="lsec-title">
            How it works
          </h3>
        </div>
        <ol className="lsec-body steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="rank" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h4 className="step-title">{s.title}</h4>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lsec" aria-labelledby="landing-plans">
        <div className="lsec-head">
          <h3 id="landing-plans" className="lsec-title">
            Free and Pro
          </h3>
        </div>
        <div className="lsec-body">
          <div className="plans plans-brief">
            <div className="plan">
              <h4 className="plan-title">Free</h4>
              <p className="plan-price">
                <span className="price">$0</span>
              </p>
              <p>
                The ranked radar across every source, with your niches saved on your device. No
                account.
              </p>
            </div>
            <div className="plan">
              <h4 className="plan-title">Pro</h4>
              <p className="plan-price">
                <span className="price">$5</span>
                <span className="meta"> per month, 7 days free</span>
              </p>
              <p>
                The Make queue with a hook and angle for each item, your own RSS feeds, a Telegram
                digest and Notion sync.
              </p>
            </div>
          </div>
          <p className="lsec-more">
            <Link to="pricing" className="link">
              Compare the plans
            </Link>
          </p>
        </div>
      </section>

      <section className="closing" aria-labelledby="landing-close">
        <h3 id="landing-close" className="closing-title">
          See what is moving today.
        </h3>
        <div className="hero-actions">
          <Link to="read" className="btn btn-solid btn-lg">
            Open the radar
          </Link>
          <Link to="signin" signup className="btn btn-lg">
            Start 7-day trial
          </Link>
        </div>
      </section>
    </div>
  );
}
