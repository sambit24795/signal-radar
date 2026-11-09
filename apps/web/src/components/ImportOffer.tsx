import { useState } from 'react';
import { saveConfig, type ServerConfig } from '../lib/config';
import type { Defaults } from '../lib/feed';
import { importFlagKey, importPayload } from '../lib/prefsMerge';
import type { StoredPrefs } from '../lib/prefs';

interface Props {
  userId: string;
  stored: StoredPrefs;
  config: ServerConfig;
  defaults: Defaults;
  onDone: () => void;
}

/** One quiet line, shown once: copy this device's niches and sources to the new account. */
export function ImportOffer({ userId, stored, config, defaults, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const finish = () => {
    try {
      localStorage.setItem(importFlagKey(userId), '1');
    } catch {
      /* private mode: the offer may reappear next visit */
    }
    onDone();
  };

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await saveConfig({ ...config, ...importPayload(stored, defaults) });
      finish();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div className="offer" role="region" aria-label="Import from this device">
      <p>
        Use the niches and sources from this device on your account?{' '}
        {failed && <span className="warn">Could not import. Try again.</span>}
      </p>
      <div className="offer-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
          {busy ? 'Importing' : 'Import'}
        </button>
        <button type="button" className="link" onClick={finish}>
          No thanks
        </button>
      </div>
    </div>
  );
}
