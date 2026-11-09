import { z } from 'zod';

export const ApiEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
  PAYMENTS_PROVIDER: z.enum(['stub', 'lemonsqueezy']).default('stub'),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  NODE_ENV: z.string().optional(),
});
export type ApiEnv = z.infer<typeof ApiEnvSchema>;

/** Validates process.env-like input; empty strings count as unset. */
export function parseEnv(raw: Record<string, string | undefined>): ApiEnv {
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''),
  );
  return ApiEnvSchema.parse(cleaned);
}
