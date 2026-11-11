import { PRICE } from './tiers';

export const REPO_URL = 'https://github.com/sambit24795/signal-radar';

export interface PageMeta {
  title: string;
  description: string;
}

/** Title and description for the two pages that are pre-rendered at build. */
export const PAGE_META = {
  '/': {
    title: 'Signal Radar: find the story before the algorithm does',
    description:
      'A ranked radar of what is moving in the niches you follow. Search it, summarize pages without opening them, save ideas, and on Pro get a hook, angle and title for each.',
  },
  '/pricing': {
    title: 'Pricing · Signal Radar',
    description: `Free keeps an Ideas queue and 3 page summaries a day. Pro is prepaid: ${PRICE.pro} for 30 days, ₹99 in India, and it writes the hook, angle and title for each story.`,
  },
  '/terms': {
    title: 'Terms · Signal Radar',
    description:
      'Plain terms for Signal Radar: one-time Pro passes, no auto-renew, the 7-day trial, and what happens to your account.',
  },
  '/privacy': {
    title: 'Privacy · Signal Radar',
    description:
      'What Signal Radar stores, how payments work through Razorpay, and how summaries use an AI model.',
  },
  '/refunds': {
    title: 'Refunds · Signal Radar',
    description: 'Full refund within 7 days of a Pro pass purchase, on request by email.',
  },
  '/contact': {
    title: 'Contact · Signal Radar',
    description: 'How to reach Signal Radar about your account, a payment or a refund.',
  },
} as const satisfies Record<string, PageMeta>;

export type PrerenderPath = keyof typeof PAGE_META;
