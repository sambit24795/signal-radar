import { useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import { MAX_NICHES } from '../lib/presets';
import { addTopicFromQuery, findTopic } from '../lib/topics';

interface Props {
  query: string;
  niches: Niche[];
  onNiches: (niches: Niche[]) => void;
  /** Opens Customize, at this topic when given. */
  onCustomize: (topicId?: string) => void;
}

/** Above search results: offers the query as a topic when none of the reader's topics is it. */
export function AddAsTopic({ query, niches, onNiches, onCustomize }: Props) {
  const [added, setAdded] = useState<{ query: string; id: string } | null>(null);
  const text = query.trim();

  if (added && added.query === text && niches.some((n) => n.id === added.id)) {
    return (
      <p className="find-status" role="status">
        Added. Your radar will include {text.toLowerCase()} from the next refresh.{' '}
        <button type="button" className="link-quiet" onClick={() => onCustomize(added.id)}>
          Edit keywords
        </button>
      </p>
    );
  }
  if (findTopic(niches, text)) return null;

  if (niches.length >= MAX_NICHES) {
    return (
      <p className="find-status">
        Not one of your topics, and you have {MAX_NICHES} already, the most a radar can hold.{' '}
        <button type="button" className="link-quiet" onClick={() => onCustomize()}>
          Open Customize
        </button>
      </p>
    );
  }

  return (
    <p className="find-status">
      Not one of your topics.{' '}
      <button
        type="button"
        className="link add-topic"
        onClick={() => {
          const res = addTopicFromQuery(niches, text);
          if (res.kind !== 'added') return;
          onNiches(res.niches);
          setAdded({ query: text, id: res.niche.id });
        }}
      >
        Add &ldquo;{text}&rdquo; as a topic
      </button>
    </p>
  );
}
