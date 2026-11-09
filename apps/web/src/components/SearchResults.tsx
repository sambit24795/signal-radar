import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { searchEverywhere, sourceName, type EverywhereResult } from '../lib/search';
import { ItemList, Skeleton } from './ItemList';

type State =
  | { status: 'loading' }
  | { status: 'ready'; result: EverywhereResult }
  | { status: 'error'; message: string };

interface Props {
  query: string;
  now: number;
  onBack: () => void;
}

/** Results from the live sources for one query, in the same list as the feed. */
export function SearchResults({ query, now, onBack }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    searchEverywhere(query).then(
      (result) => live && setState({ status: 'ready', result }),
      (e: unknown) =>
        live &&
        setState({
          status: 'error',
          message:
            e instanceof ApiError && e.status === 429
              ? e.message
              : 'Could not search right now. Check your connection and try again.',
        }),
    );
    return () => {
      live = false;
    };
  }, [query, attempt]);

  const back = (
    <button type="button" className="link-quiet" onClick={onBack}>
      Back to the feed
    </button>
  );

  if (state.status === 'loading') {
    return (
      <>
        <p className="find-status" role="status">
          Searching for &ldquo;{query}&rdquo;&hellip;
        </p>
        <Skeleton count={5} />
      </>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="state" role="alert">
        <h2 className="state-title">The search did not run</h2>
        <p>
          {state.message}{' '}
          <button type="button" className="link" onClick={retry}>
            Try again
          </button>
          , or{' '}
          <button type="button" className="link" onClick={onBack}>
            go back to the feed
          </button>
          .
        </p>
      </div>
    );
  }

  const { items, failed } = state.result;
  return (
    <>
      <p className="find-status" role="status">
        {items.length > 0
          ? `${items.length} results for “${query}” from Hacker News, news sites, GitHub and DEV.`
          : `Nothing found for “${query}”.`}{' '}
        {back}
      </p>
      {failed.length > 0 && (
        <p className="find-status find-warn">
          {failed.map(sourceName).join(' and ')} did not answer.{' '}
          <button type="button" className="link-quiet" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {items.length > 0 && <ItemList items={items} niches={[]} now={now} saveable />}
    </>
  );
}
