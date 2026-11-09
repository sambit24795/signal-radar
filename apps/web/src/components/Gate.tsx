import { Link } from './Link';
import type { MeState } from '../lib/me';

interface Props {
  me: MeState;
  /** What the signed-out visitor needs: queue or settings. */
  feature: 'queue' | 'settings' | 'welcome';
}

export function Gate({ me, feature }: Props) {
  if (me.status === 'loading') {
    return (
      <div className="state" aria-busy="true">
        <p className="meta">Checking your session</p>
      </div>
    );
  }
  if (me.status === 'error') {
    return (
      <div className="state" role="alert">
        <h2 className="state-title">Could not check your session</h2>
        <p>The server did not answer. Reload the page to try again.</p>
        <p className="meta">{me.message}</p>
      </div>
    );
  }

  if (feature === 'welcome' && me.status === 'anon') {
    return (
      <div className="state">
        <h2 className="state-title">Set up your radar after you sign in</h2>
        <p>
          Create a free account to pick your niches and feeds. Pro is free for the first 7 days.
        </p>
        <div className="auth-actions">
          <Link to="signin" signup className="btn btn-solid">
            Create an account
          </Link>
          <Link to="signin" className="link">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (feature === 'settings') {
    return (
      <div className="state">
        <h2 className="state-title">Settings live with your account</h2>
        <p>Sign in to save niches, sources and delivery options.</p>
        <div className="auth-actions">
          <Link to="signin" className="btn btn-solid">
            Sign in
          </Link>
          <Link to="signin" signup className="link">
            Create an account
          </Link>
        </div>
      </div>
    );
  }

  if (me.status === 'anon') {
    return (
      <div className="state">
        <h2 className="state-title">Ideas is a Pro feature</h2>
        <p>
          It takes the best of each radar run, adds a hook and an angle for each item, and learns
          from what you pick and skip. The first 7 days are free.
        </p>
        <div className="auth-actions">
          <Link to="signin" signup className="btn btn-solid">
            Start 7-day trial
          </Link>
          <Link to="signin" className="link">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="state">
      <h2 className="state-title">The queue needs Pro</h2>
      <p>Your account is on the Free plan, so Ideas is switched off.</p>
      <div className="auth-actions">
        <Link to="pricing" className="btn btn-solid">
          See Pro
        </Link>
      </div>
    </div>
  );
}
