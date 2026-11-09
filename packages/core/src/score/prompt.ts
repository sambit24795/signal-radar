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

export function buildSystemPrompt(niches: Niche[], feedback: Feedback): string {
  const nicheLines = niches.map((n) => `- ${n.id}: ${n.name}`).join('\n');
  const parts = [
    `You are the research assistant of a solo creator who makes YouTube Shorts and long videos in these niches:\n${nicheLines}`,
    `Judge whether the item the user sends is worth making a video about. Score 0-100 using these signals:
- niche fit
- novelty (can the creator be first to cover it?)
- visual/demo-ability (can it be screen-recorded?)
- ability to make it (the creator owns a Steam Deck; free tools beat paid ones)
- momentum (points or stars per hour)
- evergreen vs. news (news decays fast, evergreen keeps paying)
Be harsh: most items deserve under 50. Give 80+ only for items that clearly deserve a video this week.`,
    `Reply with one JSON object and nothing else, in exactly this shape:
{"score": 0-100 number, "why": "one sentence reason", "hook": "opening line, at most 12 words", "angle": "one sentence on how to cover it", "title": "video title", "format": "short" | "long" | "skip", "effort": "S" | "M" | "L"}
Use format "skip" when it is not worth a video. effort is S (under 2h), M (half a day) or L (multi-day).`,
  ];
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
