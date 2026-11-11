import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export { schema };
export * from './schema.js';
export { createPgStore, grantPass, type PassGrant } from './store.js';

export type Db = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

export function createDb(url: string): Db {
  const client = postgres(url, { onnotice: () => {} });
  return drizzle({ client, schema });
}

export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Applies pending SQL migrations. Given a URL, opens and closes its own connection. */
export async function runMigrations(dbOrUrl: Db | string): Promise<void> {
  if (typeof dbOrUrl === 'string') {
    const db = createDb(dbOrUrl);
    try {
      await migrate(db, { migrationsFolder });
    } finally {
      await db.$client.end();
    }
    return;
  }
  await migrate(dbOrUrl, { migrationsFolder });
}

// inferred row types
export type User = typeof schema.user.$inferSelect;
export type Subscription = typeof schema.subscription.$inferSelect;
export type NewSubscription = typeof schema.subscription.$inferInsert;
export type UserConfig = typeof schema.userConfig.$inferSelect;
export type NewUserConfig = typeof schema.userConfig.$inferInsert;
export type FeedItemRow = typeof schema.feedItem.$inferSelect;
export type NewFeedItemRow = typeof schema.feedItem.$inferInsert;
export type QueueItemRow = typeof schema.queueItem.$inferSelect;
export type NewQueueItemRow = typeof schema.queueItem.$inferInsert;
export type SeenRow = typeof schema.seen.$inferSelect;
export type PushSubscriptionRow = typeof schema.pushSubscription.$inferSelect;
export type PassPurchaseRow = typeof schema.passPurchase.$inferSelect;
export type NewPassPurchaseRow = typeof schema.passPurchase.$inferInsert;
