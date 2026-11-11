# Briefs written for each creator

Feedback (2026-11-10): every brief is written for one hard-coded person. `packages/core/src/score/prompt.ts` says
"a solo creator who makes YouTube Shorts and long videos" and "owns a Steam Deck". Fix: ask each user what they make
and for whom, build the prompt from that, and let them rewrite briefs later.

## Profile

One `creator` object per user, stored as a new nullable jsonb column on `user_config` (drizzle migration). All fields
are optional, and an empty profile means neutral wording.

```ts
interface CreatorProfile {
  makes: ('video' | 'shorts' | 'posts' | 'linkedin' | 'writing' | 'podcast')[]; // any number
  audience?: string; // ≤ 80 chars, e.g. "junior web devs"
  resources?: string; // ≤ 120 chars, e.g. "Steam Deck, a Mac, free tools only"
  tone?: 'plain' | 'playful' | 'technical';
}
```

The type and its validation (zod) live in `packages/core` so the API, the CLI run and the web share them. Labels:

- video: "YouTube videos"
- shorts: "Shorts, Reels, TikTok"
- posts: "X or Threads posts"
- linkedin: "LinkedIn posts"
- writing: "Blog or newsletter"
- podcast: "Podcast"

## Prompt

- `buildSystemPrompt(niches, feedback, profile?)`. Remove "YouTube Shorts and long videos" and "Steam Deck"
  entirely.
- **Opening line:** "…a creator who makes <makes labels, or 'content'> about these topics, for <audience>" (the
  audience part only when it is set).
- **Signals:** "ability to make it" uses `resources` when set; otherwise "can a solo creator make it with free or
  common tools".
- **Tone:** one line for hook and title ("plain and direct" / "playful" / "precise and technical").
- **Words:** "worth making a video about" → "worth making something about". The JSON shape stays the same.
  `format`: keep `short | long | skip`, and reinterpret it as a quick piece vs. an in-depth one. Don't change the
  schema.
- **Angle and title** match the first `makes` choice (a video angle for video, a thread structure for posts, and so
  on). Say so in the prompt.
- **Profile text is user input.** Clamp the lengths, strip newlines, and quote it in the prompt as data.

## Where it's asked

- **Onboarding** (`Welcome.tsx`): after topics, one optional step. Heading "What do you make?". Below it: the
  `makes` choices as a checkbox list, "Who is it for?" (one line), "What do you have to work with?" (one line),
  and tone as three radio options. Buttons: "Continue" and "Skip for now". Everyone sees it (it's cheap), and the
  copy says it shapes the hooks and angles.
- **Settings:** a "Your briefs" section with the same fields, saved through the existing settings save. Free users
  see it with one line saying briefs are part of Pro, and can still fill it in.
- API: extend the existing user config GET/PUT (wherever niches are saved) with `creator`. Validate with the shared
  zod schema.

## Using it

- The add-link route, `POST /api/queue/:id/brief` and the nightly/CLI run (`pnpm radar run`, per-user scoring) all
  pass the user's profile to `buildSystemPrompt`.
- **Rewrite:** on Ideas rows, the Pro action reads "Write brief" when there is no hook and "Rewrite brief" when
  there is one. The endpoint is the same and the brief is overwritten.

## Tests

- **Prompt:** no "Steam Deck" or "YouTube" without a profile; the profile's makes, audience, resources and tone
  appear; newlines in user text are stripped and lengths clamped.
- **API:** the config round-trips `creator`; invalid values return 400; the brief route uses the profile (the fake
  model sees it in the system prompt).
- **Web:** profile form logic (any pure helpers).

Checks: typecheck, lint, tests, web build. Commit is left to the user.
