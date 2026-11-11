import {
  AUDIENCE_MAX,
  cleanLine,
  CREATOR_MAKES,
  RESOURCES_MAX,
  type CreatorMake,
  type CreatorProfile,
  type CreatorTone,
} from '@radar/core/ranking';

export const emptyCreator = (): CreatorProfile => ({ makes: [] });

/** Add or remove one thing the user makes, keeping the canonical order. */
export function toggleMake(p: CreatorProfile, make: CreatorMake): CreatorProfile {
  const has = p.makes.includes(make);
  const makes = CREATOR_MAKES.filter((m) => (m === make ? !has : p.makes.includes(m)));
  return { ...p, makes };
}

/** Picking the tone that is already set clears it. */
export function setTone(p: CreatorProfile, tone: CreatorTone | undefined): CreatorProfile {
  const next: CreatorProfile = { makes: p.makes };
  if (p.audience !== undefined) next.audience = p.audience;
  if (p.resources !== undefined) next.resources = p.resources;
  if (tone && tone !== p.tone) next.tone = tone;
  return next;
}

/** The form's draft in the shape the server stores: one-line, clamped, blanks removed. */
export function normalizeCreator(p: CreatorProfile): CreatorProfile {
  const out: CreatorProfile = { makes: CREATOR_MAKES.filter((m) => p.makes.includes(m)) };
  const audience = cleanLine(p.audience ?? '', AUDIENCE_MAX);
  const resources = cleanLine(p.resources ?? '', RESOURCES_MAX);
  if (audience) out.audience = audience;
  if (resources) out.resources = resources;
  if (p.tone) out.tone = p.tone;
  return out;
}

export function isEmptyCreator(p: CreatorProfile | null | undefined): boolean {
  if (!p) return true;
  const n = normalizeCreator(p);
  return n.makes.length === 0 && !n.audience && !n.resources && !n.tone;
}

/** What to save: null when nothing was filled in. */
export function creatorToSave(p: CreatorProfile): CreatorProfile | null {
  return isEmptyCreator(p) ? null : normalizeCreator(p);
}
