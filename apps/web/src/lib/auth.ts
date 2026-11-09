import { api, ApiError } from './api';

/** Better Auth email/password endpoints, called with plain fetch (no client dependency). */
export function signUp(email: string, password: string): Promise<unknown> {
  const name = email.split('@')[0] || email;
  return api('/api/auth/sign-up/email', { method: 'POST', json: { name, email, password } });
}

export function signIn(email: string, password: string): Promise<unknown> {
  return api('/api/auth/sign-in/email', { method: 'POST', json: { email, password } });
}

export function signOut(): Promise<unknown> {
  return api('/api/auth/sign-out', { method: 'POST', json: {} });
}

/** Turns an auth failure into a sentence that names the problem and the way out. */
export function authErrorMessage(err: unknown, mode: 'signin' | 'signup'): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.';
  if (err.status === 0) return 'Could not reach the server. Check your connection and try again.';
  if (mode === 'signin' && (err.status === 401 || err.status === 400)) {
    return 'That email and password do not match.';
  }
  if (mode === 'signup' && (err.code === 'USER_ALREADY_EXISTS' || err.status === 422)) {
    return 'An account with that email already exists. Sign in instead.';
  }
  if (err.code === 'PASSWORD_TOO_SHORT') return 'Use a password of at least 8 characters.';
  if (err.status === 403) return 'The server refused this request. Reload the page and try again.';
  return err.message;
}
