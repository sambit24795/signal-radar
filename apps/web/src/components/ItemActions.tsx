import type { ScoredItem } from '@radar/core/ranking';
import {
  requestSummary,
  dispatchSummary,
  freeLeft,
  needsRequest,
  summaries,
  IDLE,
} from '../lib/summary';
import { useMe } from '../lib/me';
import { Link } from './Link';
import { SaveToIdeas } from './SaveToIdeas';

interface Props {
  url: string;
  title: string;
  /** Present on Read stories: adds "Save to Ideas" beside Summarize. */
  save?: { item: ScoredItem; niche: string | null };
}

/** The quiet actions under a story: Save to Ideas and Summarize, and the summary when it is open. */
export function ItemActions({ url, title, save }: Props) {
  const me = useMe();
  const state = summaries.use().get(url) ?? IDLE;
  const isPro = me.status === 'ready' && me.me.subscription.isPro;
  const signedIn = me.status === 'ready';
  const left = freeLeft.use();
  // Shown only once the account has used one, and never to Pro.
  const leftNote =
    signedIn && !isPro && left && left.remaining < left.limit
      ? `${left.remaining} left today`
      : null;
  const panelId = `sum-${url.replace(/[^a-z0-9]/gi, '').slice(-24)}`;

  const toggle = () => {
    if (state.open) return dispatchSummary(url, { type: 'toggle' });
    if (!signedIn) return dispatchSummary(url, { type: 'pitch' });
    if (needsRequest(state)) void requestSummary(url);
    else dispatchSummary(url, { type: 'toggle' });
  };

  const label =
    state.status === 'pending' ? 'Reading the page…' : state.open ? 'Hide summary' : 'Summarize';

  return (
    <div className="item-extras">
      <div className="item-actions">
        {save && <SaveToIdeas item={save.item} niche={save.niche} />}
        <button
          type="button"
          className="link-quiet"
          aria-expanded={state.open}
          aria-controls={panelId}
          aria-label={`${label === 'Reading the page…' ? 'Summarize' : label}. ${title}`}
          onClick={toggle}
        >
          {label}
        </button>
      </div>
      {state.open && (
        <div id={panelId} className="sum" aria-live="polite">
          {state.status === 'pending' && <p className="sum-note">Reading the page…</p>}
          {state.status === 'ok' && (
            <>
              <p className="sum-tldr">{state.tldr}</p>
              {state.points && state.points.length > 0 && (
                <ul className="sum-points">
                  {state.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <p className="sum-foot">
                A machine summary of the page. It can miss things.
                {leftNote && ` ${leftNote}.`}
              </p>
            </>
          )}
          {state.status === 'unreadable' && (
            <p className="sum-note">
              Couldn&rsquo;t read this page. It may be a video, or sit behind a login.{' '}
              <a className="link" href={url} rel="noopener" target="_blank">
                Open it
              </a>
              .
            </p>
          )}
          {state.status === 'error' && (
            <p className="sum-note" role="alert">
              {state.message}{' '}
              <button
                type="button"
                className="link-quiet sum-retry"
                onClick={() => void requestSummary(url)}
              >
                Try again
              </button>
            </p>
          )}
          {state.status === 'pitch' && (
            <p className="sum-note" role="status">
              Summaries need an account.{' '}
              <Link to="signin" signup className="link">
                Create one
              </Link>{' '}
              or{' '}
              <Link to="signin" className="link">
                sign in
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
