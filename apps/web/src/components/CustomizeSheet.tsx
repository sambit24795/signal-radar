import { useEffect, useRef } from 'react';
import type { Niche } from '@radar/core/ranking';
import type { SourceRef } from '../lib/feed';
import { CloseIcon } from '../icons';
import { NichesEditor, SourcesEditor } from './Editors';

interface Props {
  open: boolean;
  onClose: () => void;
  niches: Niche[];
  allSources: SourceRef[];
  enabledSourceIds: Set<string>;
  onNiches: (niches: Niche[]) => void;
  onToggleSource: (id: string) => void;
  onReset: () => void;
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
  onReset,
  syncError = false,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
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
                Niches
              </h3>
              <p className="hint">Items are ranked by how well they match these keywords.</p>
              <NichesEditor niches={niches} onChange={onNiches} />
            </section>

            <section aria-labelledby="sources-h">
              <h3 id="sources-h" className="sheet-h">
                Sources
              </h3>
              <SourcesEditor
                sources={allSources}
                enabled={enabledSourceIds}
                onToggle={onToggleSource}
              />
            </section>
          </div>

          <div className="sheet-foot">
            <div className="sheet-foot-start">
              <button type="button" className="link" onClick={onReset}>
                Reset to defaults
              </button>
              {syncError && <span className="warn">Not saved to your account yet.</span>}
            </div>
            <button type="button" className="btn btn-solid" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
