import { formatDate } from './plan';
import type { Currency, Pass } from '@radar/core/passes';

export type { Currency, Pass };

const DAY = 86_400_000;
/** How many days before the end the app says Pro is ending. */
const ENDING_SOON_DAYS = 3;

export const CURRENCY_SYMBOL: Record<Currency, string> = { INR: '₹', USD: '$' };

/** Money from an amount in minor units (paise or cents): ₹99, $2, $1.25. */
export function formatMoney(amount: number, currency: Currency): string {
  const value = amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2);
  return `${CURRENCY_SYMBOL[currency]}${value}`;
}

/**
 * The pass price per calendar month (a year is 12 months). Rupees are rounded to whole units;
 * dollars keep their cents.
 */
export function perMonth(amount: number, days: number, currency: Currency): string {
  const minor = amount / Math.max(1, Math.round(days / (365 / 12)));
  const rounded = currency === 'INR' ? Math.round(minor / 100) * 100 : Math.round(minor);
  return `${formatMoney(rounded, currency)} a month`;
}

export function durationLabel(days: number): string {
  return days >= 365 ? '1 year' : `${days} days`;
}

/** Whole days from now until `iso`; null when there is no usable date, 0 once it has passed. */
export function daysLeft(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const end = Date.parse(iso);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - now) / DAY));
}

/** "Pro until 12 Mar 2027", or '' when there is no usable date. */
export function proUntilNote(iso: string | null | undefined): string {
  const date = formatDate(iso ?? null);
  return date ? `Pro until ${date}` : '';
}

/** The quiet warning when Pro ends within three days; '' when it is further off. */
export function endingSoonNote(iso: string | null | undefined, now = Date.now()): string {
  const days = daysLeft(iso, now);
  if (days === null || days > ENDING_SOON_DAYS) return '';
  if (days === 0) return 'Pro ends today.';
  return `Pro ends in ${days} ${days === 1 ? 'day' : 'days'}.`;
}
