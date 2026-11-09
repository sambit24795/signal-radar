import { useEffect, useRef, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import type { SourceRef } from '../lib/feed';
import { keywordText, newNicheId, parseKeywords } from '../lib/niches';
import { CloseIcon, PlusIcon, TrashIcon } from '../icons';

interface Props {
  open: boolean;
  onClose: () => void;
  niches: Niche[];
  allSources: SourceRef[];
  enabledSourceIds: Set<string>;
  onNiches: (niches: Niche[]) => void;
  onToggleSource: (id: string) => void;
  onReset: () => void;
}

const TYPE_LABEL: Record<SourceRef['type'], string> = {
  hn: 'Hacker News',
  reddit: 'Reddit',
  github: 'GitHub',
  rss: 'Feed',
};

export function CustomizeSheet({
  open,
  onClose,
  niches,
  allSources,
  enabledSourceIds,
  onNiches,
  onToggleSource,
  onReset,
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
              <ul className="niche-list">
                {niches.map((n, i) => (
                  <NicheEditor
                    key={n.id}
                    niche={n}
                    canRemove={niches.length > 1}
                    onChange={(next) => onNiches(niches.map((x, j) => (j === i ? next : x)))}
                    onRemove={() => onNiches(niches.filter((_, j) => j !== i))}
                  />
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() =>
                  onNiches([
                    ...niches,
                    { id: newNicheId(niches), name: 'New niche', weight: 1, keywords: ['keyword'] },
                  ])
                }
              >
                <PlusIcon /> Add niche
              </button>
            </section>

            <section aria-labelledby="sources-h">
              <h3 id="sources-h" className="sheet-h">
                Sources
              </h3>
              <ul className="source-list">
                {allSources.map((s) => (
                  <li key={s.id}>
                    <label className="source">
                      <input
                        type="checkbox"
                        checked={enabledSourceIds.has(s.id)}
                        onChange={() => onToggleSource(s.id)}
                      />
                      <span className="source-name">{s.name}</span>
                      <span className="meta">{TYPE_LABEL[s.type]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="sheet-foot">
            <button type="button" className="link" onClick={onReset}>
              Reset to defaults
            </button>
            <button type="button" className="btn btn-solid" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function NicheEditor({
  niche,
  canRemove,
  onChange,
  onRemove,
}: {
  niche: Niche;
  canRemove: boolean;
  onChange: (n: Niche) => void;
  onRemove: () => void;
}) {
  // Local drafts let someone type "a, b" without the list re-normalising mid-word.
  const [name, setName] = useState(niche.name);
  const [words, setWords] = useState(() => keywordText(niche));
  const keywords = parseKeywords(words, niche.keywords);
  const valid = name.trim().length > 0 && keywords.length > 0;

  const commit = (nextName: string, nextWords: string) => {
    const kws = parseKeywords(nextWords, niche.keywords);
    if (nextName.trim() && kws.length > 0)
      onChange({ ...niche, name: nextName.trim(), keywords: kws });
  };

  return (
    <li className="niche">
      <label className="field">
        <span className="field-label">Name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            commit(e.target.value, words);
          }}
          autoComplete="off"
        />
      </label>
      <label className="field">
        <span className="field-label">Keywords, separated by commas</span>
        <input
          value={words}
          onChange={(e) => {
            setWords(e.target.value);
            commit(name, e.target.value);
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!valid}
        />
      </label>
      <div className="niche-foot">
        {valid ? (
          <span />
        ) : (
          <span className="warn">Needs a name and at least one keyword to apply.</span>
        )}
        {canRemove && (
          <button type="button" className="btn btn-quiet" onClick={onRemove}>
            <TrashIcon /> Remove
          </button>
        )}
      </div>
    </li>
  );
}
