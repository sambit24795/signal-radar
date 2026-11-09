import { useState } from 'react';
import { PAYMENTS_TEST_MODE, startCheckout } from '../lib/billing';
import { refreshMe, type MeState } from '../lib/me';
import { navigate } from '../lib/route';
import { Link } from './Link';

const FREE = [
  'The ranked Read view across every source',
  'Niches and sources saved on this device',
  'No account needed',
];

const PRO = [
  'AI scoring for every item',
  'A hook and an angle written for each one',
  'An Ideas queue that learns from what you pick and skip',
  'A Telegram digest after each run',
  'Picked items synced to Notion',
];

export function Pricing({ me }: { me: MeState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = me.status === 'ready' ? me.me : null;
  const sub = ready?.subscription;
  const onPaid = sub?.status === 'active';

  const upgrade = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await startCheckout();
      if (res.upgraded) {
        await refreshMe();
        navigate('/queue');
      } else if (res.url) {
        location.assign(res.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="pricing-title">
      <h2 id="pricing-title" className="page-title page-title-lg">
        Free reads the radar. Pro works the queue.
      </h2>

      <div className="plans">
        <section className="plan" aria-labelledby="plan-free">
          <h3 id="plan-free" className="plan-title">
            Free
          </h3>
          <p className="plan-price">
            <span className="price">$0</span>
          </p>
          <ul className="plan-list">
            {FREE.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <Link to="read" className="btn">
            Open the radar
          </Link>
        </section>

        <section className="plan" aria-labelledby="plan-pro">
          <h3 id="plan-pro" className="plan-title">
            Pro
          </h3>
          <p className="plan-price">
            <span className="price">$5</span>
            <span className="meta"> per month, 7 days free</span>
          </p>
          <ul className="plan-list">
            {PRO.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {me.status === 'ready' ? (
            onPaid ? (
              <Link to="queue" className="btn">
                You are on Pro. Open the queue
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-solid"
                disabled={busy}
                onClick={() => void upgrade()}
              >
                {busy
                  ? 'One moment'
                  : sub?.status === 'trialing'
                    ? 'Upgrade now'
                    : 'Upgrade to Pro'}
              </button>
            )
          ) : (
            <Link to="signin" signup className="btn btn-solid">
              Start 7-day trial
            </Link>
          )}
          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>

      <p className="meta pricing-note">
        Cancel any time; you keep Pro until the period you paid for ends.
        {PAYMENTS_TEST_MODE && ' Payments are in test mode, so upgrading does not charge you.'}
      </p>
    </section>
  );
}
