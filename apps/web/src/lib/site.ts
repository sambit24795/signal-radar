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
    description: `Free keeps an Ideas queue and 3 page summaries a day. Pro is ${PRICE.pro} a month after a 7-day trial and writes the hook, angle and title for each story.`,
  },
} as const satisfies Record<string, PageMeta>;

export type PrerenderPath = keyof typeof PAGE_META;
