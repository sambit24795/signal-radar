import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { refreshMe } from '../lib/me';
import { useNow } from '../hooks';
import { justOnboarded } from '../lib/onboarding';
import {
  decideQueueItem,
  fetchQueue,
  hintSeen,
  initialQueue,
  markHintSeen,
  queueReducer,
  STATUS_LABEL,
  type QueueItem,
  type QueueStatus,
} from '../lib/queue';
import { QueueRow } from './QueueRow';
import { Tabs } from './Tabs';

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
  const [hint, setHint] = useState(() => !hintSeen(localStorage));
  const now = useNow();
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

  const dismissHint = useCallback(() => {
    markHintSeen(localStorage);
    setHint(false);
  }, []);

  const decide = useCallback(
    async (item: QueueItem, to: QueueStatus) => {
      if (item.status === to) return;
      dismissHint();
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
    [say, fail, dismissHint],
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
          Your ideas
        </h2>
        <details className="keys">
          <summary>Keys</summary>
          <p>
            <kbd>j</kbd> <kbd>k</kbd> move, <kbd>p</kbd> pick, <kbd>s</kbd> skip, <kbd>u</kbd> undo
          </p>
        </details>
      </div>
      <p className="lede queue-lede">
        Stories picked for your topics after each run. Pick the ones worth making something about
        and skip the rest. Picked ideas are kept on the Picked tab.
      </p>
      <Tabs
        tabs={STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] }))}
        active={status}
        onChange={(id) => setStatus(id as QueueStatus)}
        label="Idea status"
        panelId="queue-panel"
        idPrefix="qstatus"
      />
      {welcomed && (
        <p className="note" role="status">
          You are set up. Ideas arrive after the next radar run, using the topics and feeds you just
          chose.
        </p>
      )}
      <div
        id="queue-panel"
        role="tabpanel"
        aria-labelledby={`qstatus-${status}`}
        className="qpanel"
      >
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
                {status === 'new'
                  ? 'Nothing to review'
                  : status === 'picked'
                    ? 'No picked ideas yet'
                    : 'Nothing skipped'}
              </h2>
              <p>
                {status === 'new'
                  ? 'New ideas arrive after each radar run, usually every few hours. Each one is a story matched to your topics.'
                  : status === 'picked'
                    ? 'Ideas you pick are saved here, ready to copy when you sit down to make something.'
                    : 'Skipped ideas wait here in case you change your mind.'}
              </p>
            </div>
          ) : (
            <ol className="items">
              {items.map((item, i) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  now={now}
                  hint={hint && status === 'new' && i === 0}
                  onDismissHint={dismissHint}
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
      </div>

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
