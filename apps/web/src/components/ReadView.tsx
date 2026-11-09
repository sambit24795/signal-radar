import { useMemo, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import type { Data } from '../hooks';
import { formatClock, formatUpdated } from '../lib/format';
import type { Prefs } from '../lib/prefs';
import { rankFeed } from '../lib/rankClient';
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
          {hasTopics && (
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
            <div className="subhead-actions">
              <SourceMenu options={sourceOptions} value={savedKinds} onChange={onSourceKinds} />
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
            {(data.status === 'loading' || settling) && <Skeleton />}
            {data.status === 'error' && <ErrorState message={data.message} onRetry={retry} />}
            {data.status === 'ready' &&
              !settling &&
              prefs &&
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
