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
  feedDays,
  selectView,
  stepTopic,
  topicsFromSearch,
  toggleTopic,
  topicOptions,
  visibleSourceKinds,
  withTopics,
  type SourceKind,
} from '../lib/view';
import { useTopicItems } from '../lib/topicItems';
import { AddAsTopic } from './AddAsTopic';
import { CustomizeSheet } from './CustomizeSheet';
import { ItemList, Skeleton } from './ItemList';
import { SearchField } from './SearchField';
import { SearchResults } from './SearchResults';
import { SourceMenu } from './SourceMenu';
import { EmptyState, ErrorState } from './States';
import { TopicMenu } from './TopicMenu';
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

/** Stable empty selection, so memo dependencies don't change every render. */
const NO_KINDS: readonly string[] = [];

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [focusTopic, setFocusTopic] = useState<string | undefined>(undefined);
  const openSheet = useCallback((topicId?: string) => {
    setFocusTopic(topicId);
    setSheetOpen(true);
  }, []);

  // The query and the topic live in the URL (/read?q=…&topic=…); the field keeps its own text
  // while typing.
  const search = useSearchString();
  const { q, all } = parseSearch(search);
  const topics = useMemo(() => (prefs ? topicOptions(prefs.niches) : []), [prefs]);
  const activeTopics = useMemo(
    () => (prefs ? topicsFromSearch(search, prefs.niches) : []),
    [search, prefs],
  );
  const activeTopic = activeTopics.length === 1 ? activeTopics[0]! : ALL_TOPICS;
  const topicRef = useRef(activeTopic);
  topicRef.current = activeTopic;
  const topicsRef = useRef(activeTopics);
  topicsRef.current = activeTopics;
  const setTopics = useCallback((ids: readonly string[]) => {
    navigate(withTopics(location.pathname, ids), true);
  }, []);
  const setTopic = useCallback(
    (id: string) => setTopics(id === ALL_TOPICS ? [] : [id]),
    [setTopics],
  );
  const [draft, setDraft] = useState(q);
  const committed = useRef(q);
  const field = useRef<HTMLInputElement>(null);
  const commit = useCallback((next: string, everywhere = false) => {
    committed.current = next.trim();
    navigate(
      withTopics(searchHref(location.pathname, { q: next, all: everywhere }), topicsRef.current),
      true,
    );
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
  // Keys: "/" searches, "t" opens the topic menu, "[" and "]" step through the topics.
  const searching = q !== '';
  const topicIds = useMemo(() => topics.map((t) => t.id), [topics]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.key === '/') {
        e.preventDefault();
        field.current?.focus();
      } else if (!searching && topicIds.length > 1) {
        if (e.key === 't') {
          e.preventDefault();
          setTopicOpen(true);
        } else if (e.key === '[' || e.key === ']') {
          e.preventDefault();
          setTopic(stepTopic(topicIds, topicRef.current, e.key === ']' ? 1 : -1));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searching, topicIds, setTopic]);
  const clearSearch = () => {
    setDraft('');
    commit('');
    field.current?.focus();
  };

  // What each topic reads from beyond the shared feed (a news search, subreddits).
  const topic = useTopicItems(prefs?.niches, !settling && !!prefs && !prefs.needsTopics);

  const ranked = useMemo(
    () =>
      data.status === 'ready' && prefs && !prefs.needsTopics
        ? rankFeed(data.feed.items, prefs.niches, {
            sources: prefs.sources,
            topN: Infinity,
            topic,
          })
        : [],
    [data, prefs, topic],
  );

  const sourceOptions = useMemo(() => visibleSourceKinds(prefs?.sources ?? []), [prefs]);
  const savedKinds = prefs?.sourceKinds ?? NO_KINDS;
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
      selectView(ranked, activeTopics.length ? activeTopics : null, narrowed ? activeKinds : null),
    [ranked, activeTopics, activeKinds, narrowed],
  );

  // Search looks through everything loaded, not only the stories that matched the reader's topics.
  const found = useMemo(
    () =>
      q && !all && data.status === 'ready' && prefs
        ? filterItems(
            rankFeed([...data.feed.items, ...topic.items], [], {
              sources: prefs.sources,
              topN: 2000,
            }),
            q,
          )
        : null,
    [data, prefs, q, all, topic],
  );

  const defaults = data.status === 'ready' ? data.defaults : null;
  const updatedAt = data.status === 'ready' ? data.feed.updatedAt : null;
  const asking = data.status === 'ready' && !settling && prefs?.needsTopics === true;
  const hasTopics = !!prefs && prefs.niches.length > 0;
  const days = data.status === 'ready' ? feedDays(data.feed.items, now) : 1;

  return (
    <>
      {asking ? (
        <TopicsPanel onDone={onNiches} onSkip={onShowAll} />
      ) : (
        <>
          <SearchField ref={field} value={draft} onChange={setDraft} onClear={clearSearch} />
          {!q && (
            <div className="filterbar">
              {(hasTopics || sourceOptions.length > 1) && (
                <>
                  {hasTopics && (
                    <TopicMenu
                      options={topics}
                      active={activeTopics}
                      onToggle={(id) =>
                        setTopics(
                          toggleTopic(
                            activeTopics,
                            id,
                            prefs!.niches.map((n) => n.id),
                          ),
                        )
                      }
                      open={topicOpen}
                      onOpenChange={setTopicOpen}
                    />
                  )}
                  {sourceOptions.length > 1 && (
                    <SourceMenu
                      options={sourceOptions}
                      value={savedKinds}
                      onChange={onSourceKinds}
                    />
                  )}
                </>
              )}
              <div className="filterbar-actions">
                {install && (
                  <button type="button" className="chip" onClick={install}>
                    Install app
                  </button>
                )}
                <button type="button" className="chip" onClick={() => openSheet()}>
                  Customize
                </button>
              </div>
              <p className="meta updated" aria-live="polite">
                {data.status === 'ready'
                  ? stale
                    ? `Offline. Showing the feed from ${formatClock(updatedAt) || 'earlier'}.`
                    : updatedAt
                      ? `Updated ${formatUpdated(updatedAt, now)}`
                      : ''
                  : data.status === 'loading'
                    ? 'Loading the feed'
                    : ''}
              </p>
            </div>
          )}

          <div id="feed-panel" aria-label="Stories" tabIndex={-1} className="panel">
            {q && q.length >= MIN_EVERYWHERE && !settling && prefs && (
              <AddAsTopic
                query={q}
                niches={prefs.niches}
                onNiches={onNiches}
                onCustomize={openSheet}
              />
            )}
            {q && all && !settling && (
              <SearchResults query={q} now={now} onBack={() => commit(q)} />
            )}
            {q && !all && data.status === 'ready' && !settling && prefs && (
              <>
                <p className="find-status" role="status">
                  {found && found.length > 0
                    ? `${found.length} in the feed. `
                    : 'Nothing in the feed matches. '}
                  {q.length >= MIN_EVERYWHERE && (
                    <button type="button" className="link-quiet" onClick={() => commit(q, true)}>
                      Search everywhere for &ldquo;{q}&rdquo;
                    </button>
                  )}
                </p>
                {found && found.length > 0 && (
                  <ItemList
                    key={`find:${q}`}
                    items={found}
                    niches={prefs.niches}
                    now={now}
                    saveable
                    paged
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
                  key={`${activeTopics.join(',')}:${activeKinds.join(',')}`}
                  items={rows}
                  niches={prefs.niches}
                  now={now}
                  saveable
                  paged
                  end={`That\u2019s everything from the last ${days === 1 ? 'day' : `${days} days`}.`}
                />
              ) : (
                <EmptyState
                  topic={activeTopics.length > 0}
                  source={narrowed}
                  onCustomize={() => openSheet()}
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
          onClose={() => {
            setSheetOpen(false);
            setFocusTopic(undefined);
          }}
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
          {...(focusTopic ? { focusTopicId: focusTopic } : {})}
        />
      )}
    </>
  );
}
