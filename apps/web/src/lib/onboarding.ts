import type { Niche } from '@radar/core/ranking';
import { createStore } from './store';
import { MAX_CUSTOM_FEEDS } from './feeds';
import { MAX_NICHES, presetById, presetToNiche, type PresetFeed } from './presets';

/** Set when onboarding finishes, so the Make queue can say why it is still empty. */
export const justOnboarded = createStore(false);

/** Skipping or finishing in this tab means do not send the user back to setup again. */
const dismissed = createStore(false);
export const useOnboardingDismissed = dismissed.use;
export const dismissOnboarding = () => dismissed.set(true);

/** Toggle a preset: remove its niche when selected, add it (if there is room) otherwise. */
export function togglePreset(niches: Niche[], presetId: string): Niche[] {
  if (niches.some((n) => n.id === presetId)) return niches.filter((n) => n.id !== presetId);
  const p = presetById(presetId);
  if (!p || niches.length >= MAX_NICHES) return niches;
  return [...niches, presetToNiche(p)];
}

/** Suggested feeds from the chosen presets, deduplicated by URL, in preset order. */
export function suggestedFeeds(niches: Niche[]): PresetFeed[] {
  const seen = new Set<string>();
  const out: PresetFeed[] = [];
  for (const n of niches) {
    for (const f of presetById(n.id)?.feeds ?? []) {
      if (seen.has(f.url)) continue;
      seen.add(f.url);
      out.push(f);
    }
  }
  return out;
}

/** The first `max` suggestions, pre-checked; the rest stay unchecked so the cap is never exceeded. */
export function defaultFeedPicks(
  suggestions: PresetFeed[],
  already: { url: string }[] = [],
  max = MAX_CUSTOM_FEEDS,
): Set<string> {
  const taken = new Set(already.map((f) => f.url));
  const picks = new Set<string>();
  for (const f of suggestions) {
    if (taken.size + picks.size >= max) break;
    if (!taken.has(f.url)) picks.add(f.url);
  }
  return picks;
}
