/** Prepaid Pro passes: pay once for a block of Pro time. Prices are fixed per currency. */

export type PassId = 'p30' | 'p90' | 'p365';
export type Currency = 'INR' | 'USD';

export interface Pass {
  id: PassId;
  days: number;
  /** Indian price in paise. */
  inr: number;
  /** Price elsewhere in US cents. */
  usd: number;
}

export const PASSES: readonly Pass[] = [
  { id: 'p30', days: 30, inr: 9900, usd: 200 },
  { id: 'p90', days: 90, inr: 24900, usd: 500 },
  { id: 'p365', days: 365, inr: 79900, usd: 1500 },
];

const DAY_MS = 86_400_000;

/**
 * INR for India, USD everywhere else. Country comes from Cloudflare's `CF-IPCountry`;
 * when it is missing, an `Accept-Language` naming an Indian English variant counts as India.
 */
export function currencyFor(
  country: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Currency {
  // A country header wins when present; Accept-Language is only the fallback.
  if (country) return country.toUpperCase() === 'IN' ? 'INR' : 'USD';
  if (acceptLanguage && /(?:^|[,;\s])[a-z]{2}-IN\b/i.test(acceptLanguage)) return 'INR';
  return 'USD';
}

/** ₹99 / $2; amounts are in paise/cents and prices are always whole units. */
export function formatPrice(pass: Pass, currency: Currency): string {
  const amount = currency === 'INR' ? pass.inr : pass.usd;
  return currency === 'INR' ? `₹${amount / 100}` : `$${amount / 100}`;
}

/** Adds pass days to the end of the current Pro time, or from now if it has lapsed. */
export function extendUntil(currentEnd: Date | null, now: Date, days: number): Date {
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  return new Date(base.getTime() + days * DAY_MS);
}
