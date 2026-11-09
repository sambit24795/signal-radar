import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // API_PORT lives in the repo-root .env, shared with `pnpm api:dev`.
  const env = loadEnv(mode, '../..', '');
  const apiPort = env.API_PORT || '8787';
  return {
    plugins: [react()],
    server: { proxy: { '/api': `http://localhost:${apiPort}` } },
  };
});
