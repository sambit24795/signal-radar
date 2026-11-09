import { useEffect, useRef, useState } from 'react';
import { ItemActions } from './ItemActions';
import { copyText, queueMeta, type QueueItem, type QueueStatus } from '../lib/queue';

interface Props {
  item: QueueItem;
  now: number;
  selected: boolean;
  /** Show the one-time "what Pick and Skip do" line under this item. */
  hint: boolean;
  onDismissHint: () => void;
  onSelect: () => void;
  onDecide: (to: QueueStatus) => void;
}

/** One idea: the story, what it is, then the angle on it. Pick and Skip say what they do. */
export function QueueRow({ item, now, selected, hint, onDismissHint, onSelect, onDecide }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const summary = item.summary?.trim() || '';
  const why = item.why?.trim() || '';
  const hasExtra = !!(item.hook || item.angle || item.titleDraft || why);
  // With no summary there is nothing to lead with, so the rest is shown straight away.
  const collapsible = hasExtra && !!summary;
  const copy = copyText(item);

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(copy.text);
      setCopied(true);
    } catch {
      /* clipboard blocked: the text is on the page to select */
    }
  };

  return (
    <li
      ref={ref}
      className="qrow"
      aria-current={selected ? 'true' : undefined}
      onFocusCapture={onSelect}
    >
      <h3 className="item-title">
        <a href={item.url} rel="noopener" target="_blank">
          {item.title}
        </a>
      </h3>
      <p className="meta">{queueMeta(item, now).join(' · ')}</p>
      {summary && <p className="q-summary">{summary}</p>}

      {hasExtra && (
        <div
          id={`more-${item.id}`}
          className={collapsible && !more ? 'q-extra q-extra-collapsed' : 'q-extra'}
        >
          {item.hook && (
            <p className="q-hook">
              <span className="q-label">Hook</span>
              {item.hook}
            </p>
          )}
          {item.angle && (
            <p className="q-line">
              <span className="q-label">Angle</span>
              {item.angle}
            </p>
          )}
          {item.titleDraft && (
            <p className="q-line">
              <span className="q-label">Title draft</span>
              {item.titleDraft}
            </p>
          )}
          {why && (
            <p className="q-line q-why">
              <span className="q-label">Why it&rsquo;s here</span>
              {why}
            </p>
          )}
        </div>
      )}
      {collapsible && (
        <button
          type="button"
          className="link-quiet q-more"
          aria-expanded={more}
          aria-controls={`more-${item.id}`}
          onClick={() => setMore(!more)}
        >
          {more ? 'Less' : 'More'}
        </button>
      )}

      <ItemActions url={item.url} title={item.title} />

      <div className="q-actions">
        {item.status !== 'picked' && (
          <button
            type="button"
            className={item.status === 'new' ? 'btn btn-solid' : 'btn'}
            title="Save this idea to your Picked list"
            aria-label={`Pick: save to your Picked list. ${item.title}`}
            onClick={() => onDecide('picked')}
          >
            Pick
          </button>
        )}
        {item.status !== 'skipped' && (
          <button
            type="button"
            className="btn"
            title="Skip: take this off your list"
            aria-label={`Skip: take this off your list. ${item.title}`}
            onClick={() => onDecide('skipped')}
          >
            Skip
          </button>
        )}
        {item.status === 'picked' && (
          <button type="button" className="btn" onClick={() => void doCopy()}>
            {copied ? 'Copied' : copy.label}
          </button>
        )}
        {item.status !== 'new' && (
          <button type="button" className="link-quiet" onClick={() => onDecide('new')}>
            Back to New
          </button>
        )}
      </div>
      {hint && (
        <p className="q-hint">
          Pick saves this idea to your Picked tab. Skip takes it off the list. Both can be undone.{' '}
          <button type="button" className="link-quiet" onClick={onDismissHint}>
            Got it
          </button>
        </p>
      )}
    </li>
  );
}
