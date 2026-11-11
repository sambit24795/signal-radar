import { useState, type FormEvent } from 'react';
import { authErrorMessage, signIn, signUp } from '../lib/auth';
import { takeGateNext } from '../lib/gate';
import { refreshMe, type MeState } from '../lib/me';
import { navigate } from '../lib/route';
import { Link } from './Link';

interface Props {
  me: MeState;
  startSignup: boolean;
  onSignOut: () => void;
}

export function SignIn({ me, startSignup, onSignOut }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>(startSignup ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me.status === 'ready') {
    return (
      <section className="auth" aria-labelledby="auth-title">
        <h2 id="auth-title" className="page-title">
          Signed in
        </h2>
        <p className="lede">
          You are signed in as <span className="mono-inline">{me.me.user.email}</span>.
        </p>
        <div className="auth-actions">
          <Link to="queue" className="btn btn-solid">
            Open the queue
          </Link>
          <button type="button" className="text-btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </section>
    );
  }

  const signup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await (signup ? signUp(email.trim(), password) : signIn(email.trim(), password));
      await refreshMe();
      // A new account still needs onboarding; an existing one returns where it was asked from.
      const back = takeGateNext();
      navigate(signup ? '/welcome' : (back ?? '/queue'));
    } catch (err) {
      setError(authErrorMessage(err, mode));
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    setMode(signup ? 'signin' : 'signup');
    setError('');
  };

  return (
    <section className="auth" aria-labelledby="auth-title">
      <h2 id="auth-title" className="page-title">
        {signup ? 'Create your account' : 'Sign in'}
      </h2>
      {signup && <p className="lede">Pro is free for 7 days. No card needed.</p>}
      <form onSubmit={submit} noValidate={false} className="form">
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'auth-error' : undefined}
          />
        </label>
        <label className="field">
          <span className="field-label">Password{signup ? ', at least 8 characters' : ''}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 8 : undefined}
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'auth-error' : undefined}
          />
        </label>
        {error && (
          <p id="auth-error" className="warn" role="alert">
            {error}
          </p>
        )}
        <div className="auth-actions">
          <button type="submit" className="btn btn-solid" disabled={busy}>
            {busy ? 'One moment' : signup ? 'Start free trial' : 'Sign in'}
          </button>
          <button type="button" className="text-btn" onClick={toggle}>
            {signup ? 'I already have an account' : 'Create an account'}
          </button>
        </div>
      </form>
    </section>
  );
}
