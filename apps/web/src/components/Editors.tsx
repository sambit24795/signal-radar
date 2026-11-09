import { useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import type { SourceRef } from '../lib/feed';
import { keywordText, newNicheId, parseKeywords } from '../lib/niches';
import { PlusIcon, TrashIcon } from '../icons';

export const TYPE_LABEL: Record<SourceRef['type'], string> = {
  hn: 'Hacker News',
  reddit: 'Reddit',
  github: 'GitHub',
  rss: 'Feed',
};

export function NichesEditor({
  niches,
  onChange,
}: {
  niches: Niche[];
  onChange: (niches: Niche[]) => void;
}) {
  return (
    <>
      <ul className="niche-list">
        {niches.map((n, i) => (
          <NicheEditor
            key={n.id}
            niche={n}
            canRemove={niches.length > 1}
            onChange={(next) => onChange(niches.map((x, j) => (j === i ? next : x)))}
            onRemove={() => onChange(niches.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() =>
          onChange([
            ...niches,
            { id: newNicheId(niches), name: 'New niche', weight: 1, keywords: ['keyword'] },
          ])
        }
      >
        <PlusIcon /> Add niche
      </button>
    </>
  );
}

export function SourcesEditor({
  sources,
  enabled,
  onToggle,
}: {
  sources: SourceRef[];
  enabled: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="source-list">
      {sources.map((s) => (
        <li key={s.id}>
          <label className="source">
            <input type="checkbox" checked={enabled.has(s.id)} onChange={() => onToggle(s.id)} />
            <span className="source-name">{s.name}</span>
            <span className="meta">{TYPE_LABEL[s.type]}</span>
          </label>
        </li>
      ))}
    </ul>
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
