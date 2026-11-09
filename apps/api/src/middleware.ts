import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from './app.js';
import { isPro } from './http.js';

export function requireAuth({ auth }: RouteDeps) {
  return createMiddleware<AppVars>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) throw new HTTPException(401, { message: 'authentication required' });
    c.set('user', session.user);
    await next();
  });
}

/** Does this user currently have Pro (active, unexpired trial, or paid period left)? */
export async function userIsPro(db: RouteDeps['db'], userId: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.userId, userId));
  return isPro(sub);
}

/** Must run after requireAuth. */
export function requirePro({ db }: RouteDeps) {
  return createMiddleware<AppVars>(async (c, next) => {
    if (!(await userIsPro(db, c.get('user').id))) {
      throw new HTTPException(402, { message: 'Pro subscription required' });
    }
    await next();
  });
}
