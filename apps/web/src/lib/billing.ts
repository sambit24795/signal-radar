import { api } from './api';

export interface CheckoutResult {
  url: string | null;
  upgraded: boolean;
}

export const startCheckout = () => api<CheckoutResult>('/api/billing/checkout', { method: 'POST' });
export const cancelPlan = () => api<{ ok: true }>('/api/billing/cancel', { method: 'POST' });

/** The API runs a stub provider until phase 5; the web build says so honestly. */
export const PAYMENTS_TEST_MODE = import.meta.env.VITE_PAYMENTS_PROVIDER !== 'lemonsqueezy';
