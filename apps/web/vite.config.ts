import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // API_PORT lives in the repo-root .env, shared with `pnpm api:dev`.
  const env = loadEnv(mode, '../..', '');
  const apiPort = env.API_PORT || '8787';
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/mark.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Signal Radar',
          short_name: 'Signal Radar',
          description: 'A ranked radar of what is moving in the niches you follow.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f7f7f4',
          theme_color: '#f7f7f4',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // The last feed (and defaults) keeps working offline.
              urlPattern: ({ url }) => url.pathname.startsWith('/api/feed'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'radar-feed',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 8, maxAgeSeconds: 7 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    server: { proxy: { '/api': `http://localhost:${apiPort}` } },
  };
});
