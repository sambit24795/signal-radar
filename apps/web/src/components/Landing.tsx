import { useMemo } from 'react';
import type { Data } from '../hooks';
import { formatUpdated } from '../lib/format';
import { rankFeed } from '../lib/rankClient';
import { REPO_URL } from '../lib/site';
import { FREE_FEATURES, PRICE, PRO_FEATURES } from '../lib/tiers';
import { ItemList, Skeleton } from './ItemList';
import { Link } from './Link';

interface Beat {
  /** File stem under /marketing, without `-light.webp`. */
  shot: string;
  /** CSS pixels; the files are 2x. */
  size: [number, number];
  title: string;
  pro?: boolean;
  body: string;
  alt: string;
}

const BEATS: Beat[] = [
  {
    shot: 'read',
    size: [420, 520],
    title: 'Read the radar',
    body: 'Choose the topics you follow, or write your own keywords. Every story from every source is scored on keyword match and momentum: points, stars and comments per hour. The ranking runs in your browser, so reading needs no account.',
    alt: 'The Read view: a search field, topic tabs, and a ranked list of stories with source, age, points and score.',
  },
  {
    shot: 'search',
    size: [420, 520],
    title: 'Search anything',
    body: 'Search the feed for a word and the list narrows to what matches. If the feed has not seen it yet, Search everywhere asks the live sources directly.',
    alt: 'The search field holding the word claude, with matching stories listed below and a link to search everywhere.',
  },
  {
    shot: 'summarize',
    size: [420, 427],
    title: 'Summarize without opening',
    body: 'Summarize reads the page and gives you a short summary and a few points, so you can tell whether it is worth the tab. It is machine-written and says so under every summary. A free account gets 3 new summaries a day; a page someone already summarized costs nothing.',
    alt: 'A story with its summary open: a two-line summary and three bullet points, then a note that it can miss things.',
  },
  {
    shot: 'ideas',
    size: [420, 700],
    title: 'Save it to Ideas',
    body: 'Save any story from Read, or paste a link, and it goes to your Ideas queue. Each run also adds new stories ranked for your topics. Pick what is worth making something about, skip the rest, and undo either.',
    alt: 'The Ideas page with a field to add a link, and a queue of stories each with Pick and Skip buttons.',
  },
  {
    shot: 'hooks',
    size: [420, 480],
    pro: true,
    title: 'A hook, an angle, a title',
    body: 'On Pro, each queued story arrives with a hook, an angle and a title draft, and the queue learns from what you pick and skip. They are drafts. You edit them and post them yourself.',
    alt: 'A queued story with a written hook, an angle and a title draft under its summary.',
  },
  {
    shot: 'digest',
    size: [420, 311],
    pro: true,
    title: 'The digest comes to you',
    body: 'After each run, one message on Telegram and, if you switch it on, a push on your phone. If you keep ideas in a Notion database, Pro syncs the queue there too.',
    alt: 'The Notifications settings: web push switched on, and Telegram connected.',
  },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is free?',
    a: 'Reading. The ranked Read view, with search and every source, needs no account. A free account adds an Ideas queue of up to 10 new stories a run, 10 saved links a day and 3 new page summaries a day.',
  },
  {
    q: 'What does Pro cost?',
    a: `${PRICE.pro} a month. The first 7 days are a trial. You can cancel any time and keep Pro until the period you paid for ends.`,
  },
  {
    q: 'Where do the stories come from?',
    a: 'Hacker News, Lobsters, DEV, Mastodon trending, Reddit and GitHub, plus RSS feeds: GamingOnLinux, The Verge, Product Hunt, Fireship on YouTube, Google News and Neovim releases. Pro lets you add your own feeds.',
  },
  {
    q: 'Does it post anywhere?',
    a: 'No. It never posts, replies or messages anyone but you. Hooks and titles are drafts for you to edit and publish yourself.',
  },
  {
    q: 'What does the AI do?',
    a: 'Ranking in Read is keyword match and momentum, with no AI. Page summaries and, on Pro, the scoring of your queue and the hooks, angles and title drafts come from a language model. It works from the story text, can be wrong, and does not choose your topics for you.',
  },
  {
    q: 'What happens to my data?',
    a: 'Topics and sources stay in your browser until you sign up. An account stores your email, topics, queue and saved links, and story text goes to the AI provider for summaries and scoring.',
  },
  {
    q: 'Can I run it myself?',
    a: (
      <>
        Yes. It is open source under AGPL-3.0 and runs on Node and Postgres with your own keys. The
        code and setup steps are{' '}
        <a className="link" href={REPO_URL} rel="noopener">
          on GitHub
        </a>
        .
      </>
    ),
  },
];

/** Light and dark screenshots. `dark` is null when the theme follows the system. */
function Shot({ beat, dark }: { beat: Beat; dark: boolean | null }) {
  const [w, h] = beat.size;
  return (
    <picture>
      <source
        srcSet={`/marketing/${beat.shot}-dark.webp`}
        media={dark === null ? '(prefers-color-scheme: dark)' : dark ? 'all' : 'not all'}
      />
      <img
        src={`/marketing/${beat.shot}-light.webp`}
        width={w}
        height={h}
        alt={beat.alt}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

export function Landing({
  data,
  now,
  retry,
  dark = null,
}: {
  data: Data;
  now: number;
  retry: () => void;
  dark?: boolean | null;
}) {
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
        <h1 id="landing-title" className="hero-title">
          Find the story before the algorithm does.
        </h1>
        <p className="hero-pitch">
          Signal Radar reads Hacker News, Reddit, GitHub and a handful of feeds, and ranks every
          story against the topics you follow. There is no engagement feed and nothing is
          recommended to you. You see what is moving, and you decide what is worth making something
          about.
        </p>
        <div className="hero-actions">
          <Link to="read" className="btn btn-solid btn-lg">
            Open the radar
          </Link>
          <Link to="signin" signup className="btn btn-lg">
            Create a free account
          </Link>
        </div>
        <p className="meta">
          Reading needs no account. Pro is {PRICE.pro} a month after a 7-day trial.
        </p>
      </section>

      <section className="lsec" aria-labelledby="landing-live">
        <div className="lsec-head">
          <h2 id="landing-live" className="lsec-title">
            On the radar right now
          </h2>
          <p className="meta" aria-live="polite">
            {data.status === 'ready' && data.feed.updatedAt
              ? `Updated ${formatUpdated(data.feed.updatedAt, now)}`
              : data.status === 'loading'
                ? 'Loading the feed'
                : ''}
          </p>
          <p className="lsec-note">
            Ranked for the default topics. Your radar follows the topics you pick.
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

      <section className="lsec lsec-beats" aria-labelledby="landing-how">
        <div className="lsec-head">
          <h2 id="landing-how" className="lsec-title">
            From a feed to a draft
          </h2>
          <p className="lsec-note">Four steps are free. The last two are Pro.</p>
        </div>
        <ol className="beats">
          {BEATS.map((b, i) => (
            <li key={b.shot} className="beat">
              <div className="beat-text">
                <p className="beat-no" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                  {b.pro && <span className="tag">Pro</span>}
                </p>
                <h3 className="beat-title">
                  {b.title}
                  {b.pro && <span className="sr-only"> (Pro)</span>}
                </h3>
                <p className="beat-body">{b.body}</p>
              </div>
              <figure className="beat-fig">
                <Shot beat={b} dark={dark} />
              </figure>
            </li>
          ))}
        </ol>
      </section>

      <section className="lsec" aria-labelledby="landing-plans">
        <div className="lsec-head">
          <h2 id="landing-plans" className="lsec-title">
            Free and Pro
          </h2>
        </div>
        <div className="lsec-body">
          <div className="plans plans-brief">
            <section className="plan" aria-labelledby="landing-plan-free">
              <h3 id="landing-plan-free" className="plan-title">
                Free
              </h3>
              <p className="plan-price">
                <span className="price">{PRICE.free}</span>
              </p>
              <ul className="plan-list">
                {FREE_FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link to="signin" signup className="btn">
                Create a free account
              </Link>
            </section>
            <section className="plan" aria-labelledby="landing-plan-pro">
              <h3 id="landing-plan-pro" className="plan-title">
                Pro
              </h3>
              <p className="plan-price">
                <span className="price">{PRICE.pro}</span>
                <span className="meta">{PRICE.proPeriod}</span>
              </p>
              <ul className="plan-list">
                {PRO_FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link to="signin" signup className="btn btn-solid">
                Start 7-day trial
              </Link>
            </section>
          </div>
          <p className="meta lsec-more">{PRICE.cancelNote}</p>
        </div>
      </section>

      <section className="lsec" aria-labelledby="landing-faq">
        <div className="lsec-head">
          <h2 id="landing-faq" className="lsec-title">
            Questions
          </h2>
        </div>
        <div className="lsec-body faq">
          {FAQ.map((f) => (
            <details key={f.q} className="faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing" aria-labelledby="landing-close">
        <h2 id="landing-close" className="closing-title">
          See what is moving today.
        </h2>
        <div className="hero-actions">
          <Link to="read" className="btn btn-solid btn-lg">
            Open the radar
          </Link>
          <Link to="signin" signup className="btn btn-lg">
            Start 7-day trial
          </Link>
        </div>
      </section>

      <footer className="footer landing-foot">
        <p>
          Open source under AGPL-3.0.{' '}
          <a className="link" href={REPO_URL} rel="noopener">
            Source on GitHub
          </a>
          . It never posts for you.
        </p>
      </footer>
    </div>
  );
}
