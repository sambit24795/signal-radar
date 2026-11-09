import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { refreshMe } from '../lib/me';
import { justOnboarded } from '../lib/onboarding';
import {
  decideQueueItem,
  fetchQueue,
  initialQueue,
  queueReducer,
  STATUS_LABEL,
  type QueueItem,
  type QueueStatus,
} from '../lib/queue';

const STATUSES: QueueStatus[] = ['new', 'picked', 'skipped'];

interface Toast {
  id: number;
  message: string;
  /** Present when the decision can still be reverted. */
  undo?: { item: QueueItem; index: number };
}

type Load = 'loading' | 'ready' | 'more' | 'error';

export function Queue() {
  const [status, setStatus] = useState<QueueStatus>('new');
  const [state, dispatch] = useReducer(queueReducer, initialQueue);
  const [load, setLoad] = useState<Load>('loading');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const toastId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const fail = useCallback((e: unknown) => {
    // 401/402 mean the session or plan changed under us; the gate takes over.
    if (e instanceof ApiError && (e.status === 401 || e.status === 402)) void refreshMe();
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean, signal: { stale: boolean }) => {
      setLoad(append ? 'more' : 'loading');
      try {
        const page = await fetchQueue(status, cursor);
        if (signal.stale) return;
        dispatch({ type: 'loaded', page, append });
        setLoad('ready');
      } catch (e) {
        if (signal.stale) return;
        fail(e);
        setLoad('error');
      }
    },
    [status, fail],
  );

  useEffect(() => {
    const signal = { stale: false };
    dispatch({ type: 'clear' });
    setToast(null);
    void loadPage(null, false, signal);
    return () => {
      signal.stale = true;
    };
  }, [loadPage]);

  const say = useCallback((message: string, undo?: Toast['undo']) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, undo });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const decide = useCallback(
    async (item: QueueItem, to: QueueStatus) => {
      if (item.status === to) return;
      const index = stateRef.current.items.findIndex((i) => i.id === item.id);
      dispatch({ type: 'remove', id: item.id });
      say(to === 'new' ? 'Moved back to New.' : to === 'picked' ? 'Picked.' : 'Skipped.', {
        item,
        index,
      });
      try {
        await decideQueueItem(item.id, to);
      } catch (e) {
        dispatch({ type: 'restore', item, index });
        fail(e);
        say('Could not save that. The item is back where it was.');
      }
    },
    [say, fail],
  );

  const undo = useCallback(async () => {
    const u = toast?.undo;
    if (!u) return;
    setToast(null);
    dispatch({ type: 'restore', item: u.item, index: u.index });
    try {
      await decideQueueItem(u.item.id, u.item.status);
    } catch (e) {
      dispatch({ type: 'remove', id: u.item.id });
      fail(e);
      say('Could not undo that. Try again in a moment.');
    }
  }, [toast, say, fail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('dialog[open]')) return;
      const { items, selected } = stateRef.current;
      const current = items.find((i) => i.id === selected);
      switch (e.key) {
        case 'j':
          dispatch({ type: 'move', delta: 1 });
          break;
        case 'k':
          dispatch({ type: 'move', delta: -1 });
          break;
        case 'p':
          if (current) void decide(current, 'picked');
          break;
        case 's':
          if (current) void decide(current, 'skipped');
          break;
        case 'u':
          if (toast?.undo) void undo();
          else if (current && status !== 'new') void decide(current, 'new');
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, undo, toast, status]);

  const { items, nextCursor, selected } = state;
  const welcomed = justOnboarded.use();

  return (
    <section aria-labelledby="queue-title">
      <div className="page-head">
        <h2 id="queue-title" className="page-title">
          Make queue
        </h2>
        <div className="seg" role="group" aria-label="Queue status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className="seg-btn"
              aria-pressed={s === status}
              onClick={() => setStatus(s)}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {welcomed && (
        <p className="note" role="status">
          You are set up. The queue fills on the next radar run, using the niches and feeds you just
          chose.
        </p>
      )}
      <p className="hint kbd-hint">
        Keys: <kbd>j</kbd> <kbd>k</kbd> move, <kbd>p</kbd> pick, <kbd>s</kbd> skip, <kbd>u</kbd>{' '}
        undo.
      </p>

      {load === 'loading' && (
        <ol className="items" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="qrow skeleton">
              <span className="rank" />
              <div className="item-body">
                <div className="bar" style={{ width: `${86 - i * 11}%` }} />
                <div className="bar short" style={{ width: `${44 + i * 6}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {load === 'error' && (
        <div className="state" role="alert">
          <h2 className="state-title">The queue did not load</h2>
          <p>
            <button
              type="button"
              className="link"
              onClick={() => void loadPage(null, false, { stale: false })}
            >
              Try again
            </button>
          </p>
          <p className="meta">{error}</p>
        </div>
      )}

      {(load === 'ready' || load === 'more') &&
        (items.length === 0 ? (
          <div className="state">
            <h2 className="state-title">
              {status === 'new' ? 'Nothing waiting' : `Nothing ${status} yet`}
            </h2>
            <p>
              {status === 'new'
                ? 'New items land here after each radar run. Check back after the next one.'
                : 'Items you move here show up in this list.'}
            </p>
          </div>
        ) : (
          <ol className="items">
            {items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                selected={item.id === selected}
                onSelect={() => dispatch({ type: 'select', id: item.id })}
                onDecide={(to) => void decide(item, to)}
              />
            ))}
          </ol>
        ))}

      {nextCursor && (load === 'ready' || load === 'more') && (
        <div className="more">
          <button
            type="button"
            className="btn"
            disabled={load === 'more'}
            onClick={() => void loadPage(nextCursor, true, { stale: false })}
          >
            {load === 'more' ? 'Loading' : 'Load more'}
          </button>
        </div>
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button type="button" className="toast-btn" onClick={() => void undo()}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function QueueRow({
  item,
  selected,
  onSelect,
  onDecide,
}: {
  item: QueueItem;
  selected: boolean;
  onSelect: () => void;
  onDecide: (to: QueueStatus) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const meta = [item.source, item.niche, item.format].filter(Boolean).join(' · ');

  return (
    <li
      ref={ref}
      className="qrow"
      aria-current={selected ? 'true' : undefined}
      onFocusCapture={onSelect}
    >
      <span className="rank" title="Score">
        {Math.round(item.score)}
      </span>
      <div className="item-body">
        <h3 className="item-title">
          <a href={item.url} rel="noopener" target="_blank">
            {item.title}
          </a>
        </h3>
        <p className="meta">{meta}</p>
        {item.hook && <p className="q-hook">{item.hook}</p>}
        {item.angle && <p className="q-angle">{item.angle}</p>}
        {item.titleDraft && (
          <p className="q-draft">
            <span className="meta">Title draft</span> {item.titleDraft}
          </p>
        )}
        <div className="q-actions">
          {item.status !== 'picked' && (
            <button
              type="button"
              className={item.status === 'new' ? 'btn btn-solid' : 'btn'}
              onClick={() => onDecide('picked')}
            >
              Pick
            </button>
          )}
          {item.status !== 'skipped' && (
            <button type="button" className="btn" onClick={() => onDecide('skipped')}>
              Skip
            </button>
          )}
          {item.status !== 'new' && (
            <button type="button" className="btn btn-quiet" onClick={() => onDecide('new')}>
              Back to New
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
