import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Niche } from '@radar/core/ranking';
import { Gate } from './components/Gate';
import { ImportOffer } from './components/ImportOffer';
import { Landing } from './components/Landing';
import { Link } from './components/Link';
import { Masthead } from './components/Masthead';
import { Pricing } from './components/Pricing';
import { Queue } from './components/Queue';
import { ReadView } from './components/ReadView';
import { Settings } from './components/Settings';
import { SignIn } from './components/SignIn';
import { Welcome } from './components/Welcome';
import { useInstallPrompt, useNow, useOnline, useRadarData } from './hooks';
import { signOut } from './lib/auth';
import { clearConfig, loadConfig, patchConfig, useConfig } from './lib/config';
import { clearMe, useMe } from './lib/me';
import {
  loadPrefs,
  startOver,
  resolvePrefs,
  savePrefs,
  type StoredPrefs,
  type Theme,
} from './lib/prefs';
import { hasOpenedRadar, landingRedirect, markRadarOpened } from './lib/landing';
import { justOnboarded, useOnboardingDismissed } from './lib/onboarding';
import { importFlagKey, mergeServerConfig, shouldOfferImport } from './lib/prefsMerge';
import { navigate, useRoute, type RouteName } from './lib/route';
import type { SourceKind } from './lib/view';

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

const TITLES: Record<RouteName, string> = {
  landing: 'Signal Radar: find the story before the algorithm does',
  welcome: 'Set up your radar · Signal Radar',
  read: 'Read · Signal Radar',
  queue: 'Ideas · Signal Radar',
  settings: 'Settings · Signal Radar',
  pricing: 'Pricing · Signal Radar',
  signin: 'Sign in · Signal Radar',
};

const offeredBefore = (userId: string) => {
  try {
    return localStorage.getItem(importFlagKey(userId)) !== null;
  } catch {
    return false;
  }
};

export function App() {
  const { data, retry } = useRadarData();
  const online = useOnline();
  const now = useNow();
  const install = useInstallPrompt();
  const route = useRoute();
  const me = useMe();
  const { config, syncError } = useConfig();
  const dismissed = useOnboardingDismissed();

  const [stored, setStored] = useState<StoredPrefs>(() => loadPrefs(localStorage));
  const [systemDark, setSystemDark] = useState(prefersDark);
  const [offerDone, setOfferDone] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => applyTheme(stored.theme), [stored.theme, systemDark]);

  // The account's saved config follows the session.
  const userId = me.status === 'ready' ? me.me.user.id : null;
  useEffect(() => {
    if (userId) void loadConfig();
    else if (me.status === 'anon') clearConfig();
  }, [userId, me.status]);

  useEffect(() => {
    document.title = TITLES[route.name];
    window.scrollTo(0, 0);
    if (firstRoute.current) firstRoute.current = false;
    else mainRef.current?.focus({ preventScroll: true });
  }, [route.name]);

  // First visit to the radar: remember it, so `/` goes straight to Read next time.
  useEffect(() => {
    if (route.name === 'read') markRadarOpened(localStorage);
  }, [route.name]);

  // `/` is for first-time visitors; the queue note only lives on the queue.
  const redirect =
    route.name === 'landing' ? landingRedirect(me.status, hasOpenedRadar(localStorage)) : null;
  const needsSetup =
    userId !== null && config !== null && config.onboardedAt === null && !dismissed;
  useEffect(() => {
    if (
      needsSetup &&
      (route.name === 'landing' || route.name === 'read' || route.name === 'queue')
    ) {
      navigate('/welcome', true);
    } else if (redirect && redirect !== 'wait') {
      navigate(redirect, true);
    }
  }, [needsSetup, redirect, route.name]);
  useEffect(() => {
    if (route.name !== 'queue') justOnboarded.set(false);
  }, [route.name]);

  const update = useCallback((next: StoredPrefs) => {
    setStored(next);
    savePrefs(localStorage, next);
  }, []);

  const defaults = data.status === 'ready' ? data.defaults : null;
  const signedIn = userId !== null && config !== null;
  const effective = useMemo(
    () => mergeServerConfig(stored, config, defaults),
    [stored, config, defaults],
  );
  const prefs = useMemo(
    () => (defaults ? resolvePrefs(effective, defaults) : null),
    [effective, defaults],
  );

  const dark = stored.theme === 'dark' || (stored.theme === 'system' && systemDark);
  const stale = data.status === 'ready' && (!online || data.failedRefresh);

  const setNiches = (niches: Niche[]) => {
    if (signedIn) patchConfig({ niches });
    update({ ...stored, niches: signedIn ? stored.niches : niches, showAll: false });
  };
  const toggleSource = (id: string) => {
    if (signedIn && prefs && defaults) {
      const on = new Set(prefs.sources.map((s) => s.id));
      if (on.has(id)) on.delete(id);
      else on.add(id);
      patchConfig({ sources: defaults.sources.map((s) => s.id).filter((s) => on.has(s)) });
    } else {
      update({
        ...stored,
        disabledSources: stored.disabledSources.includes(id)
          ? stored.disabledSources.filter((s) => s !== id)
          : [...stored.disabledSources, id],
      });
    }
  };
  const setSourceKinds = (sourceKinds: SourceKind[]) => update({ ...stored, sourceKinds });
  const clearTopics = () => {
    setStored(startOver(localStorage));
    if (signedIn) patchConfig({ niches: [] });
  };
  const showEverything = () => update({ ...stored, niches: null, showAll: true });
  const settling = me.status === 'loading' || (userId !== null && config === null);

  const onSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      /* the cookie may already be gone; treat as signed out */
    }
    clearMe();
    clearConfig();
    if (route.name === 'queue' || route.name === 'settings' || route.name === 'welcome') {
      navigate('/');
    }
  }, [route.name]);

  const offer =
    userId && config && defaults && !offerDone && route.name !== 'signin'
      ? shouldOfferImport(stored, config, offeredBefore(userId))
      : false;

  return (
    <>
      <a className="skip" href="#main">
        Skip to the content
      </a>
      <div className={route.name === 'landing' ? 'page page-wide' : 'page'}>
        <Masthead
          route={route.name}
          me={me}
          dark={dark}
          onToggleTheme={() => update({ ...stored, theme: dark ? 'light' : 'dark' })}
          onSignOut={() => void onSignOut()}
        />

        {offer && userId && config && defaults && (
          <ImportOffer
            userId={userId}
            stored={stored}
            config={config}
            defaults={defaults}
            onDone={() => setOfferDone(true)}
          />
        )}

        <main id="main" ref={mainRef} tabIndex={-1} className="main">
          {route.name === 'landing' &&
            (redirect === null && !needsSetup ? (
              <Landing data={data} now={now} retry={retry} />
            ) : (
              <p className="meta" aria-busy="true">
                Loading
              </p>
            ))}
          {route.name === 'welcome' &&
            (me.status === 'ready' ? (
              config && defaults ? (
                <Welcome
                  config={config}
                  defaults={defaults}
                  isPro={me.me.subscription.isPro}
                  localNiches={stored.niches}
                />
              ) : (
                <p className="meta" aria-busy="true">
                  Loading your settings
                </p>
              )
            ) : (
              <Gate me={me} feature="welcome" />
            ))}
          {route.name === 'read' && (
            <ReadView
              data={data}
              retry={retry}
              prefs={prefs}
              now={now}
              stale={stale}
              install={install}
              syncError={syncError}
              onNiches={setNiches}
              onToggleSource={toggleSource}
              onSourceKinds={setSourceKinds}
              onStartOver={clearTopics}
              onShowAll={showEverything}
              settling={settling}
            />
          )}
          {route.name === 'queue' &&
            (me.status === 'ready' && me.me.subscription.isPro ? (
              <Queue />
            ) : (
              <Gate me={me} feature="queue" />
            ))}
          {route.name === 'settings' &&
            (me.status === 'ready' ? (
              <Settings me={me.me} defaults={defaults} />
            ) : (
              <Gate me={me} feature="settings" />
            ))}
          {route.name === 'pricing' && <Pricing me={me} />}
          {route.name === 'signin' && (
            <SignIn me={me} startSignup={route.signup} onSignOut={() => void onSignOut()} />
          )}
        </main>

        {route.name !== 'pricing' &&
          route.name !== 'landing' &&
          route.name !== 'welcome' &&
          !(me.status === 'ready' && me.me.subscription.isPro) && (
            <footer className="footer">
              <p>
                Pro adds AI-scored hooks and a personal queue.{' '}
                <Link to="pricing" className="link">
                  See Pricing
                </Link>
              </p>
            </footer>
          )}
      </div>
    </>
  );
}
