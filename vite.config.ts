/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix = no VITE_ filter)
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8082';
  const partnerBackendUrl = env.VITE_PARTNER_BACKEND_URL || 'http://localhost:8081';

  return {
    plugins: [
      wasm(),
      topLevelAwait(),
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', { target: '19' }]],
        },
      }),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Disable SW generation during build — vite-plugin-pwa 0.21 is incompatible
        // with Vite 6+ Environment API in monorepo with mixed Vite versions (6.4 + 7.3).
        // The secondary Rollup build picks up vite@7.3's node:module chunks and fails.
        // Re-enable when vite-plugin-pwa releases Vite 6/7 compatible version.
        disable: mode === 'production',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
      // #38 â€” Bundle size tracking: always generate stats.html on build, auto-open in analyze mode
      ...(mode === 'production'
        ? [(visualizer as any)({ open: false, filename: 'dist/stats.html', gzipSize: true, brotliSize: true })]
        : mode === 'analyze'
          ? [(visualizer as any)({ open: true, filename: 'dist/stats.html', gzipSize: true, brotliSize: true })]
          : []),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      exclude: ['@tailwindcss/oxide', 'fsevents', 'lightningcss', 'tailwindcss'],
    },
    server: {
      port: 5199,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: backendUrl.startsWith('https'),
        },
        '/ws': {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
        },
        '/partner-api': {
          target: partnerBackendUrl,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/partner-api/, '/api'),
        },
      },
    },
    preview: {
      port: 4199,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: backendUrl.startsWith('https'),
        },
        '/ws': {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
        },
        '/partner-api': {
          target: partnerBackendUrl,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/partner-api/, '/api'),
        },
      },
    },
    // Worker environment config — externalize WASM runtime imports for Web Workers
    worker: {
      rollupOptions: {
        external: (id: string) => id.endsWith('.node') || id.startsWith('/wasm/') || id.includes('../pkg'),
      },
    },
    build: {
      target: 'esnext',
      sourcemap: true,
      rollupOptions: {
        // Externalize:
        // 1. Native .node binaries (e.g. @tailwindcss/oxide platform packages)
        // 2. WASM runtime imports (resolved at runtime from /public, not at build time)
        // 3. WASM pkg references (from vite-plugin-wasm commonjs transform)
        external: (id: string) => id.endsWith('.node') || id.startsWith('/wasm/') || id.includes('../pkg'),
        output: {
          manualChunks: {
            'vendor-motion': ['motion'],
            'vendor-i18n': ['i18next', 'react-i18next'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-ui': ['sonner', 'tailwind-merge', 'clsx', 'dompurify'],
            'vendor-zod': ['zod'],
            'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight', 'highlight.js'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
