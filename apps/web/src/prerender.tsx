import { renderToString } from 'react-dom/server';
import { Frame } from './components/Frame';
import { PolicyLinks } from './components/Footer';
import { Landing } from './components/Landing';
import { Contact, Privacy, Refunds, Terms } from './components/Legal';
import { Pricing } from './components/Pricing';
import type { MeState } from './lib/me';
import type { RouteName } from './lib/route';
import type { PrerenderPath } from './lib/site';

const noop = () => {};
const me: MeState = { status: 'loading' };

const ROUTES: Record<PrerenderPath, RouteName> = {
  '/': 'landing',
  '/pricing': 'pricing',
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/refunds': 'refunds',
  '/contact': 'contact',
};

/**
 * The static markup for each pre-rendered route, as the app's first client render would draw it:
 * no session yet and no feed yet (the top-5 strip shows its skeleton and fills in on the client).
 * The build writes these into the HTML; see `build/prerender.ts`.
 */
export function renderPages(): Record<PrerenderPath, string> {
  const page = (path: PrerenderPath, children: React.ReactNode) =>
    renderToString(
      <Frame
        route={ROUTES[path]}
        me={me}
        dark={false}
        onToggleTheme={noop}
        onSignOut={noop}
        footer={
          ROUTES[path] === 'landing' ? undefined : (
            <footer className="footer">
              <PolicyLinks pricing={ROUTES[path] !== 'pricing'} />
            </footer>
          )
        }
      >
        {children}
      </Frame>,
    );
  return {
    '/': page('/', <Landing data={{ status: 'loading' }} now={0} retry={noop} />),
    '/pricing': page('/pricing', <Pricing me={me} />),
    '/terms': page('/terms', <Terms />),
    '/privacy': page('/privacy', <Privacy />),
    '/refunds': page('/refunds', <Refunds />),
    '/contact': page('/contact', <Contact />),
  };
}
