import { useState } from 'react';
import type { ScoredItem } from '@radar/core/ranking';
import { ApiError } from '../lib/api';
import { addToIdeas, ideaBody, markSaved, openQueueOn, savedLinks } from '../lib/ideas';
import { refreshMe, useMe } from '../lib/me';
import { showGate } from '../lib/gate';
import { Link } from './Link';

type Phase = 'idle' | 'saving' | 'error';

interface Props {
  item: ScoredItem;
  /** Name of the first topic the story matched. */
  niche: string | null;
}

/** A quiet "Save to Ideas" action for a story (it sits in the item's action row). Any signed-in account saves it; signed-out visitors get the sign-in sheet. */
export function SaveToIdeas({ item, niche }: Props) {
  const me = useMe();
  const saved = savedLinks.use().get(item.url);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');

  const signedIn = me.status === 'ready';

  if (saved) {
    return (
      <span className="item-save-done" role="status">
        {saved === 'existing' ? 'Saved' : 'Saved to Ideas'}
        <Link
          to="queue"
          className="link-quiet"
          onClick={() => openQueueOn('new')}
          aria-label={`Open Ideas. ${item.title}`}
        >
          Open
        </Link>
      </span>
    );
  }

  const save = async () => {
    if (!signedIn) {
      showGate('save');
      return;
    }
    setPhase('saving');
    try {
      const { existed } = await addToIdeas(ideaBody(item, niche));
      markSaved(item.url, existed ? 'existing' : 'saved');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        void refreshMe();
        showGate('save');
        setPhase('idle');
        return;
      }
      setMessage(e instanceof Error ? e.message : 'Could not save that.');
      setPhase('error');
    }
  };

  return (
    <>
      <button
        type="button"
        className="link-quiet"
        disabled={phase === 'saving'}
        aria-label={`Save to Ideas. ${item.title}`}
        onClick={() => void save()}
      >
        {phase === 'saving' ? 'Saving' : 'Save to Ideas'}
      </button>
      {phase === 'error' && (
        <span className="item-save-note" role="alert">
          {message}
        </span>
      )}
    </>
  );
}
