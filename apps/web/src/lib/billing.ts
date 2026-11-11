import type { Currency, Pass } from './passes';
import { api } from './api';

export interface PassesInfo {
  currency: Currency;
  passes: { id: Pass['id']; days: number; amount: number; label: string }[];
  enabled: boolean;
}

/** The public price list; the server picks the currency from the visitor's country. */
export function fetchPasses(currency?: Currency): Promise<PassesInfo> {
  return api<PassesInfo>(`/api/billing/passes${currency ? `?currency=${currency}` : ''}`);
}

export interface Order {
  orderId: string;
  amount: number;
  currency: Currency;
  keyId: string;
  name: string;
  email: string;
}

export function createOrder(passId: Pass['id'], currency: Currency): Promise<Order> {
  return api<Order>('/api/billing/order', { method: 'POST', json: { passId, currency } });
}

export interface PaymentSignature {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** Confirms the signature on the server, which then adds the days to the account. */
export function verifyPayment(signature: PaymentSignature): Promise<{ currentPeriodEnd: string }> {
  return api<{ currentPeriodEnd: string }>('/api/billing/verify', {
    method: 'POST',
    json: signature,
  });
}

export interface CheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { email: string };
  theme: { color: string };
  handler: (signature: PaymentSignature) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open: () => void };
  }
}

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

/** Loads Razorpay's checkout.js once, on the first Buy tap. No script on page load. */
export function loadCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser.'));
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null; // a later tap may still work
        reject(new Error('Could not load checkout. Check your connection and try again.'));
      };
      document.head.append(script);
    });
  }
  return loading;
}

export function openCheckout(options: CheckoutOptions): void {
  if (!window.Razorpay) throw new Error('Checkout is not loaded.');
  new window.Razorpay(options).open();
}
