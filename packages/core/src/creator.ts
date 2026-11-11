import { z } from 'zod';
import {
  AUDIENCE_MAX,
  CREATOR_MAKES,
  CREATOR_TONES,
  RESOURCES_MAX,
  type CreatorProfile,
} from './creatorProfile.js';

export * from './creatorProfile.js';

/** Blank strings are dropped so "nothing typed" and "not set" mean the same. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s ? s : undefined));

export const CreatorProfileSchema = z
  .object({
    makes: z
      .array(z.enum(CREATOR_MAKES))
      .max(CREATOR_MAKES.length)
      .transform((m) => [...new Set(m)]),
    audience: optionalText(AUDIENCE_MAX),
    resources: optionalText(RESOURCES_MAX),
    tone: z.enum(CREATOR_TONES).optional(),
  })
  .transform((p) => {
    const out: CreatorProfile = { makes: p.makes };
    if (p.audience) out.audience = p.audience;
    if (p.resources) out.resources = p.resources;
    if (p.tone) out.tone = p.tone;
    return out;
  });
