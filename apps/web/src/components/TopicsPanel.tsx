import { useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import { TopicPicker } from './TopicPicker';

interface Props {
  onDone: (niches: Niche[]) => void;
  onSkip: () => void;
}

/** First visit with no topics: ask what they follow before showing a feed ranked for no one. */
export function TopicsPanel({ onDone, onSkip }: Props) {
  const [niches, setNiches] = useState<Niche[]>([]);
  return (
    <section className="topics-panel" aria-labelledby="topics-title">
      <h2 id="topics-title" className="page-title">
        What do you follow?
      </h2>
      <p className="lede">
        Pick a few topics and this page ranks the day&rsquo;s stories for them. Change them any time
        from Customize.
      </p>
      <TopicPicker niches={niches} onChange={setNiches} />
      <div className="welcome-foot">
        <button
          type="button"
          className="btn btn-solid"
          disabled={niches.length === 0}
          onClick={() => onDone(niches)}
        >
          Show my feed
        </button>
        <button type="button" className="link" onClick={onSkip}>
          Skip, show everything
        </button>
      </div>
      <p className="hint">Skipping ranks by what is moving fastest, with no topics.</p>
    </section>
  );
}
