import { serve } from '@hono/node-server';
import { createDb } from '@radar/db';
import { createApp } from './app.js';
import { parseEnv } from './env.js';

const env = parseEnv(process.env);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const app = createApp({ db: createDb(databaseUrl), env });
const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
