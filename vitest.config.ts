import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['packages/core/test/setup.ts'],
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
});
