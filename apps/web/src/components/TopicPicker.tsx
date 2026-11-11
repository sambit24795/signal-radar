import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  topicSourceKey,
  topicSourceLabel,
  topicSourcesOf,
  withoutTopicSource,
  type Niche,
} from '@radar/core/ranking';
import { keywordText, newNicheId, parseKeywords } from '../lib/niches';
import { togglePreset } from '../lib/onboarding';
import { MAX_NICHES, PRESETS } from '../lib/presets';
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon } from '../icons';

const PRESET_IDS = new Set(PRESETS.map((p) => p.id));

interface Props {
  niches: Niche[];
  onChange: (niches: Niche[]) => void;
  /** A topic to open for editing, e.g. the one just added from search. */
  openId?: string;
}

/**
 * Topics as the user chose them: the picked ones first (each with its keywords on demand), then the
 * rest of the library as plain "+ Topic" words to add, then "add your own".
 */
export function TopicPicker({ niches, onChange, openId }: Props) {
  const full = niches.length >= MAX_NICHES;
  const left = PRESETS.filter((p) => !niches.some((n) => n.id === p.id));

  return (
    <div className="topics">
      {niches.length > 0 && (
        <ul className="topic-rows" aria-label="Your topics">
          {niches.map((n) => (
            <TopicRow
              key={n.id}
              niche={n}
              startOpen={n.id === openId}
              onChange={(next) => onChange(niches.map((x) => (x.id === n.id ? next : x)))}
              onRemove={() => onChange(niches.filter((x) => x.id !== n.id))}
            />
          ))}
        </ul>
      )}

      {left.length > 0 && (
        <>
          <p className="topic-lead" id="topic-add-h">
            {niches.length > 0 ? 'Add more' : 'Tap the ones you follow'}
          </p>
          <ul className="topic-add" aria-labelledby="topic-add-h">
            {left.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="topic-add-btn"
                  disabled={full}
                  onClick={() => onChange(togglePreset(niches, p.id))}
                >
                  <PlusIcon />
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!full && <AddOwn onAdd={(n) => onChange([...niches, { ...n, id: newNicheId(niches) }])} />}
      {full && <p className="meta">You have {MAX_NICHES} topics, the most a radar can hold.</p>}
    </div>
  );
}

/** One chosen topic: its keywords at a glance, editable on demand. */
function TopicRow({
  niche,
  startOpen,
  onChange,
  onRemove,
}: {
  niche: Niche;
  startOpen: boolean;
  onChange: (n: Niche) => void;
  onRemove: () => void;
}) {
  const custom = !PRESET_IDS.has(niche.id);
  const [open, setOpen] = useState(startOpen);
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (startOpen) row.current?.scrollIntoView({ block: 'center' });
  }, [startOpen]);
  const [name, setName] = useState(niche.name);
  const [words, setWords] = useState(() => keywordText(niche));
  const kws = parseKeywords(words, niche.keywords);
  const shownSources = topicSourcesOf(niche).filter((s) => s.type !== 'news');
  const valid = name.trim().length > 0 && kws.length > 0;

  const commit = (nextName: string, nextWords: string) => {
    const k = parseKeywords(nextWords, niche.keywords);
    if (nextName.trim() && k.length > 0) onChange({ ...niche, name: nextName.trim(), keywords: k });
  };

  return (
    <li className="topic-row" ref={row}>
      <div className="topic-line">
        <div className="topic-main">
          <span className="picked-name">{niche.name}</span>
          {!open && <p className="meta picked-kw">{keywordText(niche)}</p>}
        </div>
        <span className="topic-actions">
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-expanded={open}
            aria-label={open ? `Done editing ${niche.name}` : `Edit keywords for ${niche.name}`}
            onClick={() => setOpen(!open)}
          >
            {open ? <CheckIcon /> : <PencilIcon />}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label={`Remove ${niche.name}`}
            onClick={onRemove}
          >
            <CloseIcon />
          </button>
        </span>
      </div>
      {/* The Google News search is automatic, so only sources the user added are listed. */}
      {shownSources.length > 0 && (
        <ul className="topic-sources" aria-label={`Sources for ${niche.name}`}>
          {shownSources.map((src) => {
            const label = topicSourceLabel(src);
            return (
              <li key={topicSourceKey(src)}>
                <span>{label}</span>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={`Remove ${label}`}
                  onClick={() => onChange(withoutTopicSource(niche, topicSourceKey(src)))}
                >
                  <CloseIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <div className="picked-edit">
          {custom && (
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
          )}
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
          {!valid && <p className="warn">Needs at least one keyword to apply.</p>}
        </div>
      )}
    </li>
  );
}

function AddOwn({ onAdd }: { onAdd: (n: Omit<Niche, 'id'>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [words, setWords] = useState('');
  const kws = parseKeywords(words, []);

  if (!open) {
    return (
      <button type="button" className="topic-add-btn add-own" onClick={() => setOpen(true)}>
        <PlusIcon /> Add your own topic
      </button>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || kws.length === 0) return;
    onAdd({ name: name.trim(), weight: 1, keywords: kws });
    setName('');
    setWords('');
    setOpen(false);
  };

  return (
    <form className="add-own-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Topic name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </label>
      <label className="field">
        <span className="field-label">Words that signal it, separated by commas</span>
        <input
          value={words}
          onChange={(e) => setWords(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="urban gardening, composting, raised beds"
        />
      </label>
      <div className="auth-actions">
        <button type="submit" className="btn" disabled={!name.trim() || kws.length === 0}>
          Add topic
        </button>
        <button type="button" className="text-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
