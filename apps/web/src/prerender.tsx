import { renderToString } from 'react-dom/server';
import { Frame } from './components/Frame';
import { Landing } from './components/Landing';
import { Pricing } from './components/Pricing';
import type { MeState } from './lib/me';
import type { PrerenderPath } from './lib/site';

const noop = () => {};
const me: MeState = { status: 'loading' };

/**
 * The static markup for each pre-rendered route, as the app's first client render would draw it:
 * no session yet and no feed yet (the top-5 strip shows its skeleton and fills in on the client).
 * The build writes these into the HTML; see `build/prerender.ts`.
 */
export function renderPages(): Record<PrerenderPath, string> {
  const page = (route: 'landing' | 'pricing', children: React.ReactNode) =>
    renderToString(
      <Frame route={route} me={me} dark={false} onToggleTheme={noop} onSignOut={noop}>
        {children}
      </Frame>,
    );
  return {
    '/': page('landing', <Landing data={{ status: 'loading' }} now={0} retry={noop} />),
    '/pricing': page('pricing', <Pricing me={me} />),
  };
}
