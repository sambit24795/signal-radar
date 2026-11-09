import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Niche } from '@radar/core/ranking';
import { saveConfig, type DraftFeed, type ServerConfig } from '../lib/config';
import type { Defaults } from '../lib/feed';
import { hostOf, MAX_CUSTOM_FEEDS } from '../lib/feeds';
import { keywordText, newNicheId, parseKeywords } from '../lib/niches';
import {
  defaultFeedPicks,
  dismissOnboarding,
  justOnboarded,
  suggestedFeeds,
  togglePreset,
} from '../lib/onboarding';
import { MAX_NICHES, PRESETS } from '../lib/presets';
import { navigate } from '../lib/route';
import { CheckIcon, PlusIcon, TrashIcon } from '../icons';
import { SourcesEditor } from './Editors';
import { FeedAdder, FeedList } from './Feeds';
import { Link } from './Link';

interface Props {
  config: ServerConfig;
  defaults: Defaults;
  isPro: boolean;
  /** Niches kept on this device from before the account existed. */
  localNiches: Niche[] | null;
}

const PRESET_IDS = new Set(PRESETS.map((p) => p.id));

/** Two short steps after sign-up: what you follow, then where it is read from. */
export function Welcome({ config, defaults, isPro, localNiches }: Props) {
  const allIds = defaults.sources.map((s) => s.id);
  const [step, setStep] = useState<1 | 2>(1);
  const [niches, setNiches] = useState<Niche[]>(() =>
    (localNiches ?? (config.niches.length > 0 ? config.niches : defaults.niches)).slice(
      0,
      MAX_NICHES,
    ),
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
          {(['Niches', 'Sources'] as const).map((label, i) => (
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

          <ul className="chips chips-wrap" aria-label="Topics">
            {PRESETS.map((p) => {
              const on = niches.some((n) => n.id === p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    disabled={!on && niches.length >= MAX_NICHES}
                    onClick={() => setNiches(togglePreset(niches, p.id))}
                  >
                    {on && <CheckIcon />}
                    {p.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="meta" aria-live="polite">
            {niches.length} of {MAX_NICHES} selected
          </p>

          {niches.length > 0 && (
            <div className="picked">
              <h3 className="sheet-h">Your niches</h3>
              <ul>
                {niches.map((n) => (
                  <PickedNiche
                    key={n.id}
                    niche={n}
                    onChange={(next) => setNiches(niches.map((x) => (x.id === n.id ? next : x)))}
                    onRemove={() => setNiches(niches.filter((x) => x.id !== n.id))}
                  />
                ))}
              </ul>
            </div>
          )}

          {niches.length < MAX_NICHES && (
            <AddOwn onAdd={(n) => setNiches([...niches, { ...n, id: newNicheId(niches) }])} />
          )}

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
              Back to niches
            </button>
          </div>
          <p className="hint">
            {isPro ? 'Your queue fills on the next radar run.' : 'You will land on the Read view.'}
          </p>
        </>
      )}
    </section>
  );
}

/** One chosen niche: its keywords at a glance, editable on demand. */
function PickedNiche({
  niche,
  onChange,
  onRemove,
}: {
  niche: Niche;
  onChange: (n: Niche) => void;
  onRemove: () => void;
}) {
  const custom = !PRESET_IDS.has(niche.id);
  const [name, setName] = useState(niche.name);
  const [words, setWords] = useState(() => keywordText(niche));
  const kws = parseKeywords(words, niche.keywords);
  const valid = name.trim().length > 0 && kws.length > 0;

  const commit = (nextName: string, nextWords: string) => {
    const k = parseKeywords(nextWords, niche.keywords);
    if (nextName.trim() && k.length > 0) onChange({ ...niche, name: nextName.trim(), keywords: k });
  };

  return (
    <li className="picked-row">
      <details>
        <summary>
          <span className="picked-name">{niche.name}</span>
          <span className="meta picked-kw">{keywordText(niche)}</span>
        </summary>
        <div className="picked-edit">
          {custom && (
            <label className="field">
              <span className="field-label">Name</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  commit(e.target.value, words);
                }}
                autoComplete="off"
              />
            </label>
          )}
          <label className="field">
            <span className="field-label">Keywords, separated by commas</span>
            <input
              value={words}
              onChange={(e) => {
                setWords(e.target.value);
                commit(name, e.target.value);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!valid}
            />
          </label>
          <div className="niche-foot">
            {valid ? <span /> : <span className="warn">Needs at least one keyword to apply.</span>}
            <button type="button" className="btn btn-quiet" onClick={onRemove}>
              <TrashIcon /> Remove
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}

function AddOwn({ onAdd }: { onAdd: (n: Omit<Niche, 'id'>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [words, setWords] = useState('');
  const kws = parseKeywords(words, []);

  if (!open) {
    return (
      <button type="button" className="btn btn-quiet add-own" onClick={() => setOpen(true)}>
        <PlusIcon /> Add your own
      </button>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || kws.length === 0) return;
    onAdd({ name: name.trim(), weight: 1, keywords: kws });
    setName('');
    setWords('');
    setOpen(false);
  };

  return (
    <form className="add-own-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </label>
      <label className="field">
        <span className="field-label">Keywords, separated by commas</span>
        <input
          value={words}
          onChange={(e) => setWords(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="urban gardening, composting, raised beds"
        />
      </label>
      <div className="auth-actions">
        <button type="submit" className="btn" disabled={!name.trim() || kws.length === 0}>
          Add niche
        </button>
        <button type="button" className="link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
