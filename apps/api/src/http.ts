import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { Subscription } from '@radar/db';

export function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    return badRequest('invalid JSON body');
  }
  const res = schema.safeParse(json);
  if (!res.success) return badRequest(formatZodError(res.error));
  return res.data;
}

export function parseQuery<T extends z.ZodType>(c: Context, schema: T): z.infer<T> {
  const res = schema.safeParse(c.req.query());
  if (!res.success) return badRequest(formatZodError(res.error));
  return res.data;
}

function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

/** Pro = active, or trialing with an unexpired trial. */
export function isPro(
  sub: Pick<Subscription, 'status' | 'trialEndsAt'> | undefined,
  now = new Date(),
): boolean {
  if (!sub) return false;
  if (sub.status === 'active') return true;
  return sub.status === 'trialing' && sub.trialEndsAt !== null && sub.trialEndsAt > now;
}
