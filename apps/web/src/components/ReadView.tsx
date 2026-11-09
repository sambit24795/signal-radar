import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import type { Data } from '../hooks';
import { formatClock, formatUpdated } from '../lib/format';
import type { Prefs } from '../lib/prefs';
import { rankFeed } from '../lib/rankClient';
import { navigate, useSearchString } from '../lib/route';
import { filterItems, MIN_EVERYWHERE, parseSearch, searchHref } from '../lib/search';
import {
  ALL_TOPICS,
  effectiveKinds,
  selectView,
  topicTabs,
  visibleSourceKinds,
  type SourceKind,
} from '../lib/view';
import { CustomizeSheet } from './CustomizeSheet';
import { ItemList, Skeleton } from './ItemList';
import { SearchField } from './SearchField';
import { SearchResults } from './SearchResults';
import { SourceMenu } from './SourceMenu';
import { EmptyState, ErrorState } from './States';
import { Tabs } from './Tabs';
import { TopicsPanel } from './TopicsPanel';

interface Props {
  data: Data;
  retry: () => void;
  prefs: Prefs | null;
  now: number;
  stale: boolean;
  install: (() => void) | null;
  syncError: boolean;
  onNiches: (niches: Niche[]) => void;
  onToggleSource: (id: string) => void;
  onSourceKinds: (kinds: SourceKind[]) => void;
  onStartOver: () => void;
  onShowAll: () => void;
  /** The session or the account's saved topics are still loading. */
  settling: boolean;
}

export function ReadView({
  data,
  retry,
  prefs,
  now,
  stale,
  install,
  syncError,
  onNiches,
  onToggleSource,
  onSourceKinds,
  onStartOver,
  onShowAll,
  settling,
}: Props) {
  const [topic, setTopic] = useState<string>(ALL_TOPICS);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The query lives in the URL (/read?q=…); the field keeps its own text while typing.
  const { q, all } = parseSearch(useSearchString());
  const [draft, setDraft] = useState(q);
  const committed = useRef(q);
  const field = useRef<HTMLInputElement>(null);
  const commit = useCallback((next: string, everywhere = false) => {
    committed.current = next.trim();
    navigate(searchHref(location.pathname, { q: next, all: everywhere }), true);
  }, []);
  useEffect(() => {
    if (q !== committed.current) {
      committed.current = q;
      setDraft(q);
    }
  }, [q]);
  useEffect(() => {
    if (draft.trim() === committed.current) return;
    const t = setTimeout(() => commit(draft), 180);
    return () => clearTimeout(t);
  }, [draft, commit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      field.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const clearSearch = () => {
    setDraft('');
    commit('');
    field.current?.focus();
  };

  const ranked = useMemo(
    () =>
      data.status === 'ready' && prefs && !prefs.needsTopics
        ? rankFeed(data.feed.items, prefs.niches, { sources: prefs.sources, topN: 500 })
        : [],
    [data, prefs],
  );

  const tabs = useMemo(() => (prefs ? topicTabs(prefs.niches) : []), [prefs]);
  const activeTopic = tabs.some((t) => t.id === topic) ? topic : ALL_TOPICS;
  const sourceOptions = useMemo(() => visibleSourceKinds(prefs?.sources ?? []), [prefs]);
  const savedKinds = prefs?.sourceKinds ?? [];
  const activeKinds = useMemo(
    () =>
      effectiveKinds(
        savedKinds,
        sourceOptions.map((o) => o.id),
      ),
    [savedKinds, sourceOptions],
  );
  const narrowed = activeKinds.length < sourceOptions.length;
  const rows = useMemo(
    () =>
      selectView(
        ranked,
        activeTopic === ALL_TOPICS ? null : activeTopic,
        narrowed ? activeKinds : null,
      ),
    [ranked, activeTopic, activeKinds, narrowed],
  );

  // Search looks through everything loaded, not only the stories that matched the reader's topics.
  const found = useMemo(
    () =>
      q && !all && data.status === 'ready' && prefs
        ? filterItems(rankFeed(data.feed.items, [], { sources: prefs.sources, topN: 2000 }), q)
        : null,
    [data, prefs, q, all],
  );

  const defaults = data.status === 'ready' ? data.defaults : null;
  const updatedAt = data.status === 'ready' ? data.feed.updatedAt : null;
  const asking = data.status === 'ready' && !settling && prefs?.needsTopics === true;
  const hasTopics = !!prefs && prefs.niches.length > 0;

  return (
    <>
      {asking ? (
        <TopicsPanel onDone={onNiches} onSkip={onShowAll} />
      ) : (
        <>
          <SearchField ref={field} value={draft} onChange={setDraft} onClear={clearSearch} />
          {hasTopics && !q && (
            <Tabs
              tabs={tabs}
              active={activeTopic}
              onChange={setTopic}
              label="Topics"
              panelId="feed-panel"
              idPrefix="topic"
            />
          )}

          <div className="subhead">
            <p className="meta" aria-live="polite">
              {q
                ? all
                  ? ''
                  : found
                    ? `${found.length} in the feed`
                    : ''
                : data.status === 'ready'
                  ? stale
                    ? `Offline. Showing the feed from ${formatClock(updatedAt) || 'earlier'}.`
                    : updatedAt
                      ? `Updated ${formatUpdated(updatedAt, now)}`
                      : ''
                  : data.status === 'loading'
                    ? 'Loading the feed'
                    : ''}
            </p>
            <div className="subhead-actions">
              {!q && (
                <SourceMenu options={sourceOptions} value={savedKinds} onChange={onSourceKinds} />
              )}
              {install && (
                <button type="button" className="text-btn" onClick={install}>
                  Install app
                </button>
              )}
              <button type="button" className="text-btn" onClick={() => setSheetOpen(true)}>
                Customize
              </button>
            </div>
          </div>

          <div
            id="feed-panel"
            role="tabpanel"
            aria-labelledby={hasTopics ? `topic-${activeTopic}` : undefined}
            aria-label={hasTopics ? undefined : 'Feed'}
            tabIndex={-1}
            className="panel"
          >
            {q && all && !settling && (
              <SearchResults query={q} now={now} onBack={() => commit(q)} />
            )}
            {q && !all && data.status === 'ready' && !settling && prefs && (
              <>
                {q.length >= MIN_EVERYWHERE && (
                  <p className="find-status">
                    {found && found.length === 0 ? 'Nothing in the feed matches. ' : ''}
                    <button type="button" className="link-quiet" onClick={() => commit(q, true)}>
                      Search everywhere for &ldquo;{q}&rdquo;
                    </button>
                  </p>
                )}
                {found && found.length > 0 && (
                  <ItemList
                    key={`find:${q}`}
                    items={found}
                    niches={prefs.niches}
                    now={now}
                    saveable
                  />
                )}
              </>
            )}
            {(data.status === 'loading' || settling) && !(q && all) && <Skeleton />}
            {data.status === 'error' && <ErrorState message={data.message} onRetry={retry} />}
            {data.status === 'ready' &&
              !settling &&
              prefs &&
              !q &&
              (rows.length > 0 ? (
                <ItemList
                  key={`${activeTopic}:${activeKinds.join(',')}`}
                  items={rows}
                  niches={prefs.niches}
                  now={now}
                  saveable
                />
              ) : (
                <EmptyState
                  topic={activeTopic !== ALL_TOPICS}
                  source={narrowed}
                  onCustomize={() => setSheetOpen(true)}
                  onClearFilter={() => {
                    setTopic(ALL_TOPICS);
                    onSourceKinds([]);
                  }}
                />
              ))}
          </div>
        </>
      )}

      {defaults && prefs && (
        <CustomizeSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          niches={prefs.niches}
          allSources={defaults.sources}
          enabledSourceIds={new Set(prefs.sources.map((s) => s.id))}
          onNiches={onNiches}
          onToggleSource={onToggleSource}
          onStartOver={() => {
            onStartOver();
            setTopic(ALL_TOPICS);
            setSheetOpen(false);
          }}
          syncError={syncError}
        />
      )}
    </>
  );
}
