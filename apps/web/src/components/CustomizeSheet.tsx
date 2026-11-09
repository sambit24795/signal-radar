import { useEffect, useRef, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import type { SourceRef } from '../lib/feed';
import { CloseIcon } from '../icons';
import { SourcesEditor } from './Editors';
import { TopicPicker } from './TopicPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  niches: Niche[];
  allSources: SourceRef[];
  enabledSourceIds: Set<string>;
  onNiches: (niches: Niche[]) => void;
  onToggleSource: (id: string) => void;
  onStartOver: () => void;
  /** Signed in and the last background save to the account failed. */
  syncError?: boolean;
}

export function CustomizeSheet({
  open,
  onClose,
  niches,
  allSources,
  enabledSourceIds,
  onNiches,
  onToggleSource,
  onStartOver,
  syncError = false,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) setConfirming(false);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-inner">
          <div className="sheet-head">
            <h2 id="sheet-title" className="sheet-title">
              Customize
            </h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div className="sheet-body">
            <section aria-labelledby="niches-h">
              <h3 id="niches-h" className="sheet-h">
                Your topics
              </h3>
              <p className="hint">
                Stories are ranked by how well they match the words behind each topic.
              </p>
              <TopicPicker niches={niches} onChange={onNiches} />
            </section>

            <section aria-labelledby="sources-h">
              <h3 id="sources-h" className="sheet-h">
                Sources
              </h3>
              <p className="hint">Where stories are read from. Switch off any you do not want.</p>
              <SourcesEditor
                sources={allSources}
                enabled={enabledSourceIds}
                onToggle={onToggleSource}
              />
            </section>
          </div>

          <div className="sheet-foot">
            {confirming ? (
              <div className="sheet-foot-start" role="alert">
                <span className="confirm-q">Clear all your topics?</span>
                <button type="button" className="link" onClick={onStartOver}>
                  Yes, clear them
                </button>
                <button type="button" className="link-quiet" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="sheet-foot-start">
                {niches.length > 0 && (
                  <button type="button" className="link-quiet" onClick={() => setConfirming(true)}>
                    Start over
                  </button>
                )}
                {syncError && <span className="warn">Not saved to your account yet.</span>}
              </div>
            )}
            <button type="button" className="btn btn-solid" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
