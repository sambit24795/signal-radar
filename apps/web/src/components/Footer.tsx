import { navigate, type RouteName } from '../lib/route';
import { Link } from './Link';

const LEGAL: { to: RouteName; label: string }[] = [
  { to: 'terms', label: 'Terms' },
  { to: 'privacy', label: 'Privacy' },
  { to: 'refunds', label: 'Refunds' },
  { to: 'contact', label: 'Contact' },
];

interface Props {
  /** Signed-out visitors get a way back to the landing page. */
  about?: boolean;
  /** Off on the Pricing page itself. */
  pricing?: boolean;
}

/** The site footer: one quiet, centred line of links, then the copyright. */
export function PolicyLinks({ about = false, pricing = false }: Props) {
  return (
    <div className="foot">
      <nav className="foot-links" aria-label="Site">
        {about && (
          <a
            href="/about"
            onClick={(e) => {
              e.preventDefault();
              navigate('/about');
            }}
          >
            About
          </a>
        )}
        {pricing && <Link to="pricing">Pricing</Link>}
        {LEGAL.map((l) => (
          <Link key={l.to} to={l.to}>
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="foot-copy">© {new Date().getFullYear()} Signal Radar</p>
    </div>
  );
}
