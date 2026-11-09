import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---- Better Auth core tables (shape expected by its Drizzle adapter) ----

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ---- app tables ----

export type Plan = 'free' | 'pro';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
export type SubscriptionProvider = 'lemonsqueezy' | 'stub';

export const subscription = pgTable('subscription', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  plan: text('plan').$type<Plan>().notNull().default('free'),
  status: text('status').$type<SubscriptionStatus>().notNull().default('none'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  provider: text('provider').$type<SubscriptionProvider>().notNull().default('stub'),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Same shape as `RadarConfig.niches` in @radar/core. */
export interface NicheConfig {
  id: string;
  name: string;
  weight?: number;
  keywords: (string | { term: string; weight?: number })[];
}

/** A user-supplied RSS/Atom feed. `id` is `custom:<short hash of url>`. */
export interface CustomFeedConfig {
  id: string;
  url: string;
  title: string;
}

export interface NotionConfig {
  token: string;
  dbId: string;
}

export const userConfig = pgTable('user_config', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  niches: jsonb('niches').$type<NicheConfig[]>().notNull().default([]),
  /** Enabled source ids. */
  sources: jsonb('sources').$type<string[]>().notNull().default([]),
  topN: integer('top_n').notNull().default(10),
  customFeeds: jsonb('custom_feeds').$type<CustomFeedConfig[]>().notNull().default([]),
  telegramChatId: text('telegram_chat_id'),
  notion: jsonb('notion').$type<NotionConfig | null>(),
  /** Set the first time the user saves or skips their setup; null sends them to onboarding. */
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Shared public feed, written once per run. */
export const feedItem = pgTable(
  'feed_item',
  {
    url: text('url').primaryKey(),
    title: text('title').notNull(),
    source: text('source').notNull(),
    sourceType: text('source_type').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    /** snippet, momentum (points/comments/stars/perHour), media, author, tags. */
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    keywordScore: real('keyword_score').notNull().default(0),
    nicheIds: text('niche_ids')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    index('feed_item_published_idx').on(t.publishedAt),
    index('feed_item_score_idx').on(t.keywordScore),
  ],
);

export type QueueStatus = 'new' | 'picked' | 'skipped';

export const queueItem = pgTable(
  'queue_item',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title').notNull(),
    source: text('source').notNull(),
    niche: text('niche'),
    score: real('score').notNull().default(0),
    hook: text('hook'),
    angle: text('angle'),
    titleDraft: text('title_draft'),
    format: text('format'),
    reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
    status: text('status').$type<QueueStatus>().notNull().default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('queue_item_user_url_uq').on(t.userId, t.url),
    index('queue_item_user_status_created_idx').on(t.userId, t.status, t.createdAt),
  ],
);

export const seen = pgTable(
  'seen',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.url] })],
);

export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    keys: jsonb('keys').$type<{ p256dh: string; auth: string }>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('push_subscription_user_idx').on(t.userId)],
);

/** One-time token behind the `t.me/<bot>?start=<token>` link that connects a user's Telegram chat. */
export const telegramLink = pgTable(
  'telegram_link',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('telegram_link_user_idx').on(t.userId)],
);
