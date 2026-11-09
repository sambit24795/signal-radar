import { useEffect, useRef, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import { saveConfig, type DraftFeed, type ServerConfig } from '../lib/config';
import type { Defaults } from '../lib/feed';
import { hostOf, MAX_CUSTOM_FEEDS } from '../lib/feeds';
import {
  defaultFeedPicks,
  dismissOnboarding,
  justOnboarded,
  suggestedFeeds,
} from '../lib/onboarding';
import { MAX_NICHES, PRESETS } from '../lib/presets';
import { navigate } from '../lib/route';
import { SourcesEditor } from './Editors';
import { FeedAdder, FeedList } from './Feeds';
import { Link } from './Link';
import { TopicPicker } from './TopicPicker';

interface Props {
  config: ServerConfig;
  defaults: Defaults;
  isPro: boolean;
  /** Niches kept on this device from before the account existed. */
  localNiches: Niche[] | null;
}

/** Two short steps after sign-up: what you follow, then where it is read from. */
export function Welcome({ config, defaults, isPro, localNiches }: Props) {
  const allIds = defaults.sources.map((s) => s.id);
  const [step, setStep] = useState<1 | 2>(1);
  const [niches, setNiches] = useState<Niche[]>(() =>
    (localNiches ?? config.niches).slice(0, MAX_NICHES),
  );
  const [enabled, setEnabled] = useState(
    () => new Set(config.sources.length > 0 ? config.sources : allIds),
  );
  const [feeds, setFeeds] = useState<DraftFeed[]>(() => config.customFeeds);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) first.current = false;
    else heading.current?.focus();
  }, [step]);

  const suggestions = suggestedFeeds(niches);
  const feedUrls = new Set(feeds.map((f) => f.url));
  const suggestedUrls = new Set(suggestions.map((f) => f.url));
  const manual = feeds.filter((f) => !PRESETS.some((p) => p.feeds.some((pf) => pf.url === f.url)));

  const toSources = () => {
    // Pre-check the suggestions that are new to this visit; keep what the user already decided.
    const fresh = suggestions.filter((f) => !seen.has(f.url));
    const presetUrls = new Set(PRESETS.flatMap((p) => p.feeds.map((f) => f.url)));
    const kept = feeds.filter((f) => !presetUrls.has(f.url) || suggestedUrls.has(f.url));
    const picks = defaultFeedPicks(fresh, kept);
    setFeeds([
      ...kept,
      ...fresh.filter((f) => picks.has(f.url)).map((f) => ({ url: f.url, title: f.title })),
    ]);
    setSeen(new Set([...seen, ...fresh.map((f) => f.url)]));
    setStep(2);
  };

  const toggleSuggested = (url: string, title: string) =>
    setFeeds(feedUrls.has(url) ? feeds.filter((f) => f.url !== url) : [...feeds, { url, title }]);

  const skip = async () => {
    dismissOnboarding();
    try {
      // Saving what is already there stamps the account as onboarded.
      await saveConfig(config, undefined, false);
    } catch {
      /* the next visit offers setup again */
    }
    navigate('/read');
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await saveConfig(
        {
          ...config,
          niches,
          sources: allIds.filter((id) => enabled.has(id)),
          customFeeds: feeds,
        },
        undefined,
        isPro,
      );
      dismissOnboarding();
      justOnboarded.set(isPro);
      navigate(isPro ? '/queue' : '/read');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      setBusy(false);
    }
  };

  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-top">
        <ol className="stepbar" aria-label="Setup steps">
          {(['Topics', 'Sources'] as const).map((label, i) => (
            <li key={label} aria-current={step === i + 1 ? 'step' : undefined}>
              <span className="rank" aria-hidden="true">
                {i + 1}
              </span>{' '}
              {label}
            </li>
          ))}
        </ol>
        <button type="button" className="link" onClick={() => void skip()}>
          Skip for now
        </button>
      </div>

      {step === 1 ? (
        <>
          <h2 id="welcome-title" className="page-title" ref={heading} tabIndex={-1}>
            What do you follow?
          </h2>
          <p className="lede">
            Tap the topics you cover. Each one brings its own keywords, which you can edit. You can
            change all of this later in Settings.
          </p>

          <TopicPicker niches={niches} onChange={setNiches} />

          <div className="welcome-foot">
            <button
              type="button"
              className="btn btn-solid"
              disabled={niches.length === 0}
              onClick={toSources}
            >
              Next: sources
            </button>
            {niches.length === 0 && <span className="hint">Pick at least one topic.</span>}
          </div>
        </>
      ) : (
        <>
          <h2 id="welcome-title" className="page-title" ref={heading} tabIndex={-1}>
            Where should it read?
          </h2>
          <p className="lede">
            The built-in sources cover tech and games well. Feeds fill in the rest.
          </p>

          <div className="welcome-sec">
            <h3 className="sheet-h">Built-in sources</h3>
            <SourcesEditor
              sources={defaults.sources}
              enabled={enabled}
              onToggle={(id) => {
                const next = new Set(enabled);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setEnabled(next);
              }}
            />
          </div>

          {isPro ? (
            <>
              {suggestions.length > 0 && (
                <div className="welcome-sec">
                  <h3 className="sheet-h">Feeds for your niches</h3>
                  <p className="hint">
                    Checked feeds are added to your radar. Uncheck any you do not want.
                  </p>
                  <ul className="source-list">
                    {suggestions.map((f) => (
                      <li key={f.url}>
                        <label className="source">
                          <input
                            type="checkbox"
                            checked={feedUrls.has(f.url)}
                            disabled={!feedUrls.has(f.url) && feeds.length >= MAX_CUSTOM_FEEDS}
                            onChange={() => toggleSuggested(f.url, f.title)}
                          />
                          <span className="source-name">{f.title}</span>
                          <span className="meta">{hostOf(f.url)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="welcome-sec">
                <h3 className="sheet-h">Your own feeds</h3>
                <p className="hint">
                  Any RSS or Atom feed. We read it first so you can see what you are adding.
                </p>
                <FeedList
                  feeds={manual}
                  onRemove={(url) => setFeeds(feeds.filter((f) => f.url !== url))}
                />
                <FeedAdder
                  have={feedUrls}
                  onAdd={(f) => setFeeds([...feeds.filter((x) => x.url !== f.url), f])}
                />
              </div>
            </>
          ) : (
            <div className="welcome-sec">
              <h3 className="sheet-h">Feeds</h3>
              <p className="hint">
                Topics like space or personal finance need feeds to rank. Adding your own is part of
                Pro.
              </p>
              <Link to="pricing" className="link">
                See Pro
              </Link>
            </div>
          )}

          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
          <div className="welcome-foot">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy}
              onClick={() => void finish()}
            >
              {busy ? 'Saving' : 'Finish setup'}
            </button>
            <button type="button" className="link" onClick={() => setStep(1)}>
              Back to topics
            </button>
          </div>
          <p className="hint">
            {isPro ? (
              <>
                Your queue fills on the next radar run. Push and Telegram alerts are in Settings,
                under Notifications.
              </>
            ) : (
              'You will land on the Read view.'
            )}
          </p>
        </>
      )}
    </section>
  );
}
