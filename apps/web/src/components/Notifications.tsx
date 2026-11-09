import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { refreshMe, type Me } from '../lib/me';
import { needsInstall, status, subscribe, unsubscribe, type PushStatus } from '../lib/push';
import { Link } from './Link';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 2 * 60 * 1000;

/** Pro-only alert channels. Actions here apply at once; they are not part of "Save changes". */
export function Notifications({ me }: { me: Me }) {
  return (
    <section className="settings-sec" aria-labelledby="set-notify">
      <h3 id="set-notify" className="sheet-h">
        Notifications
      </h3>
      {me.subscription.isPro ? (
        <>
          <p className="hint">Hear about new queue items without opening the app.</p>
          <PushRow />
          {me.telegramAvailable && <TelegramRow connected={me.telegramConnected} />}
        </>
      ) : (
        <>
          <p className="hint">
            Get a push on this device or a Telegram message when new items land in your queue. This
            is part of Pro.
          </p>
          <Link to="pricing" className="link">
            See Pro
          </Link>
        </>
      )}
    </section>
  );
}

function PushRow() {
  const [st, setSt] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void status().then((s) => live && setSt(s));
    return () => {
      live = false;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      setSt(st === 'on' ? await unsubscribe() : await subscribe());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change push. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (st === null) {
    return (
      <p className="meta" aria-busy="true">
        Checking this device
      </p>
    );
  }

  if (st === 'unavailable') {
    return <p className="hint">Push is not switched on for this server.</p>;
  }

  if (st === 'unsupported') {
    return (
      <p className="hint">
        {needsInstall()
          ? 'On iPhone and iPad, add Signal Radar to your Home Screen and open it from there to turn on push.'
          : 'This browser cannot receive push notifications.'}
      </p>
    );
  }

  return (
    <div className="note-block">
      <div className="note-row">
        <div className="note-text">
          <p id="push-label" className="note-name">
            Push on this device
          </p>
          <p id="push-desc" className="hint">
            {st === 'denied'
              ? 'Notifications are blocked for this site. Allow them in your browser or system settings for this site, then come back and switch this on.'
              : 'One alert after a run that adds items to your queue. Other devices are set up on their own.'}
          </p>
        </div>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={st === 'on'}
          disabled={busy || st === 'denied'}
          aria-labelledby="push-label"
          aria-describedby="push-desc"
          onChange={() => void toggle()}
        />
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Wait = 'idle' | 'waiting' | 'timeout';

function TelegramRow({ connected }: { connected: boolean }) {
  const [wait, setWait] = useState<Wait>('idle');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const startedAt = useRef(0);

  // While the link is out, ask the server every few seconds whether the bot saw /start.
  useEffect(() => {
    if (wait !== 'waiting') return;
    const id = setInterval(() => {
      if (Date.now() - startedAt.current > POLL_LIMIT_MS) setWait('timeout');
      else void refreshMe();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [wait]);

  useEffect(() => {
    if (connected && wait !== 'idle') setWait('idle');
  }, [connected, wait]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ url: string }>('/api/me/telegram/link', { method: 'POST' });
      setUrl(res.url);
      startedAt.current = Date.now();
      setWait('waiting');
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? 'Telegram is not set up on this server.'
          : e instanceof ApiError
            ? e.message
            : 'Could not start the link. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/me/telegram', { method: 'DELETE' });
      await refreshMe();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not disconnect. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="note-block">
      <div className="note-row">
        <div className="note-text">
          <p className="note-name">Telegram</p>
          <p className="hint" role="status">
            {connected
              ? 'Connected. Your digest arrives in Telegram after each run.'
              : wait === 'waiting'
                ? 'Waiting for you to press Start in Telegram.'
                : wait === 'timeout'
                  ? 'Still not connected. The link may have expired, so start again.'
                  : 'Get the digest as a Telegram message after each run.'}
          </p>
          {wait === 'waiting' && url && (
            <a className="link" href={url} target="_blank" rel="noopener noreferrer">
              Open Telegram again
            </a>
          )}
        </div>
        {connected ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy || wait === 'waiting'}
            onClick={() => void connect()}
          >
            Connect Telegram
          </button>
        )}
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
