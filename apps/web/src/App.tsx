import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import { CustomizeSheet } from './components/CustomizeSheet';
import { ItemList, Skeleton } from './components/ItemList';
import { Masthead } from './components/Masthead';
import { NicheChips } from './components/NicheChips';
import { EmptyState, ErrorState } from './components/States';
import { Tabs } from './components/Tabs';
import { useInstallPrompt, useNow, useOnline, useRadarData } from './hooks';
import { formatClock, formatUpdated } from './lib/format';
import {
  loadPrefs,
  resetPrefs,
  resolvePrefs,
  savePrefs,
  type StoredPrefs,
  type Theme,
} from './lib/prefs';
import { rankFeed } from './lib/rankClient';
import { selectView, visibleTabs, type TabId } from './lib/view';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#1b1a16' : '#f7f7f4');
}

export function App() {
  const { data, retry } = useRadarData();
  const online = useOnline();
  const now = useNow();
  const install = useInstallPrompt();

  const [stored, setStored] = useState<StoredPrefs>(() => loadPrefs(localStorage));
  const [tab, setTab] = useState<TabId>('top');
  const [nicheId, setNicheId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => applyTheme(stored.theme), [stored.theme, systemDark]);

  const update = useCallback((next: StoredPrefs) => {
    setStored(next);
    savePrefs(localStorage, next);
  }, []);

  const defaults = data.status === 'ready' ? data.defaults : null;
  const prefs = useMemo(
    () => (defaults ? resolvePrefs(stored, defaults) : null),
    [stored, defaults],
  );

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

  const dark = stored.theme === 'dark' || (stored.theme === 'system' && systemDark);
  const updatedAt = data.status === 'ready' ? data.feed.updatedAt : null;
  const stale = data.status === 'ready' && (!online || data.failedRefresh);

  const setNiches = (niches: Niche[]) => update({ ...stored, niches });
  const toggleSource = (id: string) =>
    update({
      ...stored,
      disabledSources: stored.disabledSources.includes(id)
        ? stored.disabledSources.filter((s) => s !== id)
        : [...stored.disabledSources, id],
    });

  return (
    <>
      <a className="skip" href="#feed-panel">
        Skip to the feed
      </a>
      <div className="page">
        <Masthead
          dark={dark}
          onToggleTheme={() => update({ ...stored, theme: dark ? 'light' : 'dark' })}
          onCustomize={() => setSheetOpen(true)}
        />

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
          {install && (
            <button type="button" className="link" onClick={install}>
              Install app
            </button>
          )}
        </div>

        {tabs.length > 1 && <Tabs tabs={tabs} active={activeTab} onChange={setTab} />}
        {prefs && <NicheChips niches={prefs.niches} active={activeNiche} onChange={setNicheId} />}

        <main
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
        </main>

        <footer className="footer">
          <p>Pro: AI-scored hooks and a personal queue, coming soon.</p>
        </footer>
      </div>

      {defaults && prefs && (
        <CustomizeSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          niches={prefs.niches}
          allSources={defaults.sources}
          enabledSourceIds={new Set(prefs.sources.map((s) => s.id))}
          onNiches={setNiches}
          onToggleSource={toggleSource}
          onReset={() => {
            setStored(resetPrefs(localStorage));
            setNicheId(null);
          }}
        />
      )}
    </>
  );
}
