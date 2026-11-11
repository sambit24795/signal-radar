/** Browser-safe: no runtime imports. The zod schema lives in creator.ts. */
export const CREATOR_MAKES = [
  'video',
  'shorts',
  'posts',
  'linkedin',
  'writing',
  'podcast',
] as const;
export type CreatorMake = (typeof CREATOR_MAKES)[number];

export const CREATOR_TONES = ['plain', 'playful', 'technical'] as const;
export type CreatorTone = (typeof CREATOR_TONES)[number];

export const MAKES_LABELS: Record<CreatorMake, string> = {
  video: 'YouTube videos',
  shorts: 'Shorts, Reels, TikTok',
  posts: 'X or Threads posts',
  linkedin: 'LinkedIn posts',
  writing: 'Blog or newsletter',
  podcast: 'Podcast',
};

export const TONE_LABELS: Record<CreatorTone, string> = {
  plain: 'Plain and direct',
  playful: 'Playful',
  technical: 'Precise and technical',
};

export const AUDIENCE_MAX = 80;
export const RESOURCES_MAX = 120;

export interface CreatorProfile {
  makes: CreatorMake[];
  audience?: string;
  resources?: string;
  tone?: CreatorTone;
}

/** One line of user text: newlines and control characters become spaces, then clamped. */
export function cleanLine(s: string, max: number): string {
  return s
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
