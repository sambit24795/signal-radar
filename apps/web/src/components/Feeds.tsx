import { useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../lib/api';
import type { DraftFeed } from '../lib/config';
import { checkFeed, hostOf, MAX_CUSTOM_FEEDS, type FeedCheck } from '../lib/feeds';
import { TrashIcon } from '../icons';

/** The feeds added so far, each with a way to take it off again. */
export function FeedList({
  feeds,
  onRemove,
}: {
  feeds: DraftFeed[];
  onRemove: (url: string) => void;
}) {
  if (feeds.length === 0) return null;
  return (
    <ul className="feed-list">
      {feeds.map((f) => (
        <li key={f.url} className="feed-row">
          <div className="feed-main">
            <span className="feed-title">{f.title}</span>
            <span className="meta">{hostOf(f.url)}</span>
          </div>
          <button
            type="button"
            className="btn btn-quiet"
            aria-label={`Remove ${f.title}`}
            onClick={() => onRemove(f.url)}
          >
            <TrashIcon /> Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

type Phase =
  | { name: 'idle' }
  | { name: 'checking' }
  | { name: 'found'; feed: FeedCheck }
  | { name: 'error'; message: string };

/**
 * Paste a feed URL, have the server read it, and see the title and a sample before adding it.
 * Not a <form>, so it can sit inside the Settings form.
 */
export function FeedAdder({
  have,
  onAdd,
}: {
  /** Urls already in the list. */
  have: Set<string>;
  onAdd: (feed: DraftFeed) => void;
}) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const input = useRef<HTMLInputElement>(null);
  const full = have.size >= MAX_CUSTOM_FEEDS;

  const check = async () => {
    const text = url.trim();
    if (!text || phase.name === 'checking') return;
    setPhase({ name: 'checking' });
    try {
      const feed = await checkFeed(text);
      if (have.has(feed.url)) {
        setPhase({ name: 'error', message: 'That feed is already in your list.' });
      } else {
        setPhase({ name: 'found', feed });
      }
    } catch (e) {
      const message =
        e instanceof ApiError && e.status === 402
          ? 'Your own feeds are part of Pro.'
          : e instanceof Error
            ? e.message
            : 'Could not read that feed.';
      setPhase({ name: 'error', message });
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void check();
    }
  };

  const add = () => {
    if (phase.name !== 'found') return;
    const { id, url: canonical, title } = phase.feed;
    onAdd({ id, url: canonical, title });
    setUrl('');
    setPhase({ name: 'idle' });
    input.current?.focus();
  };

  if (full) {
    return (
      <p className="hint">
        You have {MAX_CUSTOM_FEEDS} feeds, the most one account can follow. Remove one to add
        another.
      </p>
    );
  }

  return (
    <div className="feed-add">
      <label className="field">
        <span className="field-label">Add a feed URL</span>
        <div className="field-row">
          <input
            ref={input}
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (phase.name !== 'checking') setPhase({ name: 'idle' });
            }}
            onKeyDown={onKey}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://example.com/feed.xml"
            aria-invalid={phase.name === 'error' ? true : undefined}
            aria-describedby={phase.name === 'error' ? 'feed-error' : undefined}
          />
          <button
            type="button"
            className="btn"
            disabled={!url.trim() || phase.name === 'checking'}
            onClick={() => void check()}
          >
            {phase.name === 'checking' ? 'Checking' : 'Check'}
          </button>
        </div>
      </label>

      {phase.name === 'error' && (
        <p id="feed-error" className="warn" role="alert">
          {phase.message}
        </p>
      )}

      {phase.name === 'found' && (
        <div className="feed-found" role="status">
          <p className="feed-title">{phase.feed.title}</p>
          <p className="meta">
            {hostOf(phase.feed.url)} · {phase.feed.itemCount}{' '}
            {phase.feed.itemCount === 1 ? 'item' : 'items'}
          </p>
          <ul className="feed-sample">
            {phase.feed.sample.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-solid" onClick={add}>
            Add this feed
          </button>
        </div>
      )}
    </div>
  );
}
