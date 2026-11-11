import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { schema, type Db } from '@radar/db';
import type { ApiEnv } from './env.js';
import radarConfig from '../../../radar.config.js';

export const TRIAL_DAYS = 7;

export function createAuth(db: Db, env: ApiEnv) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Dev only: allow Cloudflare quick tunnels (vite allows them too) for testing on a phone.
    trustedOrigins:
      env.NODE_ENV === 'production'
        ? [env.WEB_ORIGIN]
        : [env.WEB_ORIGIN, 'https://*.trycloudflare.com'],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Every new user gets the default niches (so the pipeline has something to score
            // before they open Settings) and a 7-day Pro trial.
            const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
            await db
              .insert(schema.userConfig)
              .values({ userId: user.id, niches: radarConfig.niches })
              .onConflictDoNothing();
            await db
              .insert(schema.subscription)
              .values({
                userId: user.id,
                plan: 'pro',
                status: 'trialing',
                trialEndsAt,
                provider: 'stub',
              })
              .onConflictDoNothing();
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
