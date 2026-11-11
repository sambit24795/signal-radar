import {
  AUDIENCE_MAX,
  cleanLine,
  MAKES_LABELS,
  RESOURCES_MAX,
  type CreatorMake,
  type CreatorProfile,
  type CreatorTone,
} from '../creatorProfile.js';
import type { Niche, ScoredItem } from '../schema.js';
import type { Feedback, FeedbackExample } from './types.js';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function exampleLine(e: FeedbackExample): string {
  const bits = [`- "${clip(e.title, 140)}"`];
  if (e.source) bits.push(`[${e.source}]`);
  if (e.niches?.length) bits.push(`(${e.niches.join(', ')})`);
  if (e.hook) bits.push(`hook: ${clip(e.hook, 100)}`);
  return bits.join(' ');
}

const FORM: Record<CreatorMake, string> = {
  video: 'a video angle: what to show on screen and how the video is structured',
  shorts: 'a short vertical clip: one idea, a fast hook, a single payoff',
  posts: 'a post or thread: a first line that stops the scroll, then a short structure',
  linkedin: 'a LinkedIn post: a strong first line, a personal or practical take, a short structure',
  writing: 'a written piece: a thesis and an outline for a blog post or newsletter issue',
  podcast: 'a podcast segment: the question to open with and the talking points',
};

const TONE: Record<CreatorTone, string> = {
  plain: 'plain and direct',
  playful: 'playful',
  technical: 'precise and technical',
};

/** Quote user text as data: one line, clamped, double quotes and backslashes made harmless. */
const quoted = (s: string, max: number) => `"${cleanLine(s, max).replace(/["\\]/g, "'")}"`;

export function buildSystemPrompt(
  niches: Niche[],
  feedback: Feedback,
  profile?: CreatorProfile | null,
): string {
  const nicheLines = niches.map((n) => `- ${n.id}: ${n.name}`).join('\n');
  const makes = (profile?.makes ?? []).filter((m) => m in MAKES_LABELS);
  const audience = profile?.audience ? cleanLine(profile.audience, AUDIENCE_MAX) : '';
  const resources = profile?.resources ? cleanLine(profile.resources, RESOURCES_MAX) : '';
  const tone = profile?.tone && profile.tone in TONE ? profile.tone : undefined;
  const makesText = makes.length ? makes.map((m) => MAKES_LABELS[m]).join(', ') : 'content';
  const opening = `You are the research assistant of a creator who makes ${makesText} about these topics${
    audience ? `, for ${quoted(audience, AUDIENCE_MAX)}` : ''
  }:\n${nicheLines}`;
  const ability = resources
    ? `ability to make it (what the creator has to work with: ${quoted(resources, RESOURCES_MAX)}; free tools beat paid ones)`
    : 'ability to make it (can a solo creator make it with free or common tools?)';
  const first = makes[0];
  const parts = [
    opening,
    `Judge whether the item the user sends is worth making something about. Score 0-100 using these signals:
- niche fit
- novelty (can the creator be first to cover it?)
- demo-ability (can it be shown, not just told?)
- ${ability}
- momentum (points or stars per hour)
- evergreen vs. news (news decays fast, evergreen keeps paying)
Be harsh: most items deserve under 50. Give 80+ only for items that clearly deserve to be made this week.`,
    `Reply with one JSON object and nothing else, in exactly this shape:
{"score": 0-100 number, "why": "one sentence reason", "summary": "1-2 plain sentences, at most 45 words", "hook": "opening line, at most 12 words", "angle": "one sentence on how to cover it", "title": "title for the piece", "format": "short" | "long" | "skip", "effort": "S" | "M" | "L"}
summary says what the story actually is: facts only, no hype, no opinion, no mention of the creator.
Use format "skip" when it is not worth making. Otherwise "short" means a quick piece and "long" an in-depth one. effort is S (under 2h), M (half a day) or L (multi-day).`,
  ];
  if (first) {
    parts.push(
      `Write the angle and title for the creator's main format, ${MAKES_LABELS[first]}: ${FORM[first]}.`,
    );
  }
  if (tone) parts.push(`Write the hook and title in a ${TONE[tone]} tone.`);
  if (feedback.picked.length) {
    parts.push(
      `The creator PICKED these earlier items, so they like this kind of topic:\n${feedback.picked.map(exampleLine).join('\n')}`,
    );
  }
  if (feedback.skipped.length) {
    parts.push(
      `The creator SKIPPED these earlier items, so avoid scoring this kind of topic high:\n${feedback.skipped.map(exampleLine).join('\n')}`,
    );
  }
  return parts.join('\n\n');
}

export function buildUserPrompt(item: ScoredItem): string {
  return JSON.stringify({
    title: item.title,
    source: item.source,
    url: item.url,
    snippet: clip(item.snippet, 600),
    publishedAt: item.publishedAt,
    niches: item.niches,
    momentumPerHour: Math.round(item.momentum.perHour * 10) / 10,
    points: item.momentum.points ?? item.momentum.stars,
    comments: item.momentum.comments,
    type: item.media.type,
  });
}
