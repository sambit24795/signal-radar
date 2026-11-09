import { useMemo, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import type { Data } from '../hooks';
import { formatClock, formatUpdated } from '../lib/format';
import type { Prefs } from '../lib/prefs';
import { rankFeed } from '../lib/rankClient';
import { selectView, visibleTabs, type TabId } from '../lib/view';
import { CustomizeSheet } from './CustomizeSheet';
import { ItemList, Skeleton } from './ItemList';
import { NicheChips } from './NicheChips';
import { EmptyState, ErrorState } from './States';
import { Tabs } from './Tabs';

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
  onReset: () => void;
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
  onReset,
}: Props) {
  const [tab, setTab] = useState<TabId>('top');
  const [nicheId, setNicheId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const ranked = useMemo(
    () =>
      data.status === 'ready' && prefs
        ? rankFeed(data.feed.items, prefs.niches, { sources: prefs.sources, topN: 500 })
        : [],
    [data, prefs],
  );

  const tabs = useMemo(() => visibleTabs(prefs?.sources ?? []), [prefs]);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'top';
  const activeNiche = prefs?.niches.some((n) => n.id === nicheId) ? nicheId : null;
  const rows = useMemo(
    () => selectView(ranked, activeTab, activeNiche),
    [ranked, activeTab, activeNiche],
  );

  const defaults = data.status === 'ready' ? data.defaults : null;
  const updatedAt = data.status === 'ready' ? data.feed.updatedAt : null;

  return (
    <>
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
          {install && (
            <button type="button" className="link" onClick={install}>
              Install app
            </button>
          )}
          <button type="button" className="btn" onClick={() => setSheetOpen(true)}>
            Customize
          </button>
        </div>
      </div>

      {tabs.length > 1 && <Tabs tabs={tabs} active={activeTab} onChange={setTab} />}
      {prefs && <NicheChips niches={prefs.niches} active={activeNiche} onChange={setNicheId} />}

      <div
        id="feed-panel"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={-1}
        className="panel"
      >
        {data.status === 'loading' && <Skeleton />}
        {data.status === 'error' && <ErrorState message={data.message} onRetry={retry} />}
        {data.status === 'ready' &&
          (rows.length > 0 && prefs ? (
            <ItemList
              key={`${activeTab}:${activeNiche}`}
              items={rows}
              niches={prefs.niches}
              now={now}
            />
          ) : (
            <EmptyState
              filtered={activeNiche !== null}
              onCustomize={() => setSheetOpen(true)}
              onClearFilter={() => setNicheId(null)}
            />
          ))}
      </div>

      {defaults && prefs && (
        <CustomizeSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          niches={prefs.niches}
          allSources={defaults.sources}
          enabledSourceIds={new Set(prefs.sources.map((s) => s.id))}
          onNiches={onNiches}
          onToggleSource={onToggleSource}
          onReset={() => {
            onReset();
            setNicheId(null);
          }}
          syncError={syncError}
        />
      )}
    </>
  );
}
