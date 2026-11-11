import type { MeState } from '../lib/me';
import type { RouteName } from '../lib/route';
import { MoonIcon, RadarMark, SunIcon } from '../icons';
import { AccountMenu } from './AccountMenu';
import { Link } from './Link';

interface Props {
  route: RouteName;
  me: MeState;
  dark: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

const NAV: { to: RouteName; label: string }[] = [
  { to: 'read', label: 'Read' },
  { to: 'queue', label: 'Ideas' },
  { to: 'pricing', label: 'Pricing' },
];

export function Masthead({ route, me, dark, onToggleTheme, onSignOut }: Props) {
  const brand = (
    <Link to="read" aria-label="Signal Radar, home">
      <RadarMark />
      <span>Signal Radar</span>
    </Link>
  );
  return (
    <header className="masthead">
      {/* The landing page's own headline is its h1; elsewhere the wordmark is. */}
      {route === 'landing' ? (
        <p className="wordmark">{brand}</p>
      ) : (
        <h1 className="wordmark">{brand}</h1>
      )}
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="nav-link"
            data-label={n.label}
            aria-current={route === n.to ? 'page' : undefined}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="masthead-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <AccountMenu me={me} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
