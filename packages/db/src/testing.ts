import { sql } from 'drizzle-orm';
import { createDb, runMigrations, type Db } from './index.js';

export const testDbUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://radar:radar@localhost:5432/radar_test';

/** True when the test database accepts connections. Logs a clear skip message otherwise. */
export async function testDbAvailable(): Promise<boolean> {
  const db = createDb(testDbUrl);
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    console.warn(
      `[skip] test database unreachable at ${new URL(testDbUrl).host}; run "pnpm db:up" to enable DB tests`,
    );
    return false;
  } finally {
    await db.$client.end({ timeout: 1 }).catch(() => {});
  }
}

/** Connects to the test database and applies migrations. */
export async function openTestDb(): Promise<Db> {
  await runMigrations(testDbUrl);
  return createDb(testDbUrl);
}

/** Empties every table (users cascade to all per-user tables). */
export async function resetTestDb(db: Db): Promise<void> {
  await db.execute(sql`truncate table "user", feed_item restart identity cascade`);
}
