interface EmptyProps {
  filtered: boolean;
  onCustomize: () => void;
  onClearFilter: () => void;
}

export function EmptyState({ filtered, onCustomize, onClearFilter }: EmptyProps) {
  return (
    <div className="state">
      <h2 className="state-title">Nothing matches here</h2>
      <p>
        {filtered
          ? 'No items in this view match that niche.'
          : 'No items in this view match your niches.'}{' '}
        {filtered ? (
          <>
            <button type="button" className="link" onClick={onClearFilter}>
              Show all niches
            </button>{' '}
            or{' '}
          </>
        ) : (
          'Try another tab, or '
        )}
        <button type="button" className="link" onClick={onCustomize}>
          edit your niches
        </button>
        .
      </p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state" role="alert">
      <h2 className="state-title">The feed did not load</h2>
      <p>
        The server did not answer, and there is no saved copy to show yet.{' '}
        <button type="button" className="link" onClick={onRetry}>
          Try again
        </button>
      </p>
      <p className="meta">{message}</p>
    </div>
  );
}
