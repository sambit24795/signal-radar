import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['packages/core/test/setup.ts'],
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // DB tests share one Postgres database, so test files run one at a time.
    fileParallelism: false,
  },
});
