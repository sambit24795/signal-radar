import { useEffect, useState } from 'react';
import { formatPrice, PASSES, type Currency, type Pass } from '@radar/core/passes';
import {
  createOrder,
  fetchPasses,
  loadCheckout,
  openCheckout,
  verifyPayment,
} from '../lib/billing';
import { showGate, setGateNext } from '../lib/gate';
import { refreshMe, type MeState } from '../lib/me';
import { formatDate } from '../lib/plan';
import { CURRENCY_SYMBOL, durationLabel, perMonth } from '../lib/passes';
import { FREE_SHORT, PRO_SHORT } from '../lib/tiers';
import { Link } from './Link';

/** Razorpay's checkout is a light page, so it gets the app's light-theme ink for its buttons. */
const CHECKOUT_INK = '#26251e';

export function Pricing({ me }: { me: MeState }) {
  const [currency, setCurrency] = useState<Currency>('USD');
  /** Null until the server has said whether Razorpay keys are set. */
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [paidUntil, setPaidUntil] = useState('');

  useEffect(() => {
    let live = true;
    fetchPasses()
      .then((info) => {
        if (!live) return;
        setCurrency(info.currency);
        setEnabled(info.enabled);
      })
      .catch(() => {
        /* the prices still show; the Buy buttons stay disabled */
      });
    return () => {
      live = false;
    };
  }, []);

  const buy = async (pass: Pass) => {
    if (me.status !== 'ready') {
      setGateNext('/pricing');
      showGate('pro');
      return;
    }
    if (enabled !== true || busy !== null) return;
    setBusy(pass.id);
    setError('');
    setPaidUntil('');
    try {
      await loadCheckout();
      const order = await createOrder(pass.id, currency);
      openCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: `${durationLabel(pass.days)} of Pro`,
        order_id: order.orderId,
        prefill: { email: order.email },
        theme: { color: CHECKOUT_INK },
        modal: { ondismiss: () => setBusy(null) },
        handler: (signature) => {
          verifyPayment(signature)
            .then(async (res) => {
              setPaidUntil(res.currentPeriodEnd);
              await refreshMe();
            })
            .catch(() =>
              setError(
                'Payment went through but we could not confirm it; reload the page in a moment.',
              ),
            )
            .finally(() => setBusy(null));
        },
      });
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'Could not start payment. Try again.');
    }
  };

  const until = paidUntil || (me.status === 'ready' ? me.me.proUntil : '');
  const other: Currency = currency === 'INR' ? 'USD' : 'INR';

  return (
    <section aria-labelledby="pricing-title">
      <h2 id="pricing-title" className="page-title page-title-lg">
        Pay once. No subscription.
      </h2>
      <p className="lede pricing-lede">
        Pro writes a hook, an angle and a title draft for every story you queue, and keeps the ideas
        you save.
      </p>

      <ul className="passes">
        {PASSES.map((pass) => (
          <li key={pass.id} className="pass">
            <div className="pass-head">
              <h3 className="pass-title">{durationLabel(pass.days)}</h3>
              {pass.id === 'p365' && <span className="meta">Best value</span>}
            </div>
            <p className="pass-price">
              <span className="price">{formatPrice(pass, currency)}</span>
            </p>
            {pass.days > 31 && (
              <p className="meta">
                {perMonth(currency === 'INR' ? pass.inr : pass.usd, pass.days, currency)}
              </p>
            )}
            <button
              type="button"
              className="btn btn-solid"
              aria-label={`Buy ${durationLabel(pass.days)} of Pro`}
              disabled={enabled !== true || busy !== null}
              onClick={() => void buy(pass)}
            >
              {busy === pass.id ? 'One moment' : 'Buy'}
            </button>
          </li>
        ))}
      </ul>

      {until && (
        <p className="pass-status" role={paidUntil ? 'status' : undefined}>
          You’re Pro until {formatDate(until)}.
        </p>
      )}

      <div className="pass-notes">
        <button type="button" className="text-btn" onClick={() => setCurrency(other)}>
          Prices in {CURRENCY_SYMBOL[currency]} · Show in {CURRENCY_SYMBOL[other]}
        </button>
        <p className="meta">
          Payments by Razorpay: UPI, cards, netbanking. Buying means you accept the{' '}
          <Link to="terms" className="link">
            terms
          </Link>
          ; refunds within 7 days are covered by the{' '}
          <Link to="refunds" className="link">
            refund policy
          </Link>
          .
        </p>
        <p className="meta">Time adds up: buying again extends your Pro.</p>
        {enabled === false && <p className="meta">Payments open soon.</p>}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="tier-lists">
        <section aria-labelledby="pricing-free">
          <h2 id="pricing-free">Free</h2>
          <ul>
            {FREE_SHORT.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="pricing-pro">
          <h2 id="pricing-pro">Pro</h2>
          <ul>
            {PRO_SHORT.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      </div>

      {me.status !== 'ready' && (
        <p className="meta pricing-signin">New accounts get 7 days of Pro free.</p>
      )}
    </section>
  );
}
