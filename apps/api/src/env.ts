import { z } from 'zod';

export const ApiEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
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
