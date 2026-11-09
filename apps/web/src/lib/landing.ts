/** Set the first time the Read view opens, so repeat visitors skip the landing page. */
export const OPENED_KEY = 'signal-radar:opened';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function hasOpenedRadar(storage: Store): boolean {
  try {
    return storage.getItem(OPENED_KEY) !== null;
  } catch {
    return false;
  }
}

export function markRadarOpened(storage: Store): void {
  try {
    storage.setItem(OPENED_KEY, '1');
  } catch {
    /* private mode: the landing page just shows again */
  }
}

/**
 * Where `/` should send the visitor. Signed-in people and anyone who has opened the radar before
 * go straight to it; first-time visitors (and anyone whose session check failed) see the landing page.
 * `null` means stay; `'wait'` means the session check is still running and nothing is known yet.
 */
export function landingRedirect(
  session: 'loading' | 'anon' | 'error' | 'ready',
  opened: boolean,
): '/read' | 'wait' | null {
  if (session === 'ready' || opened) return '/read';
  if (session === 'loading') return 'wait';
  return null;
}
