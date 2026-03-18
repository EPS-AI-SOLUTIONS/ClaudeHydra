/// <reference types="vitest/config" />

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

/**
 * Generates sw-manifest.json in dist/ after build completes.
 * This manifest is fetched by public/sw.js at runtime for precaching.
 * Replaces vite-plugin-pwa which was incompatible with Vite 6+ monorepo
 * (secondary Rollup build resolved wrong Vite version).
 */
function swManifestPlugin(): Plugin {
  return {
    name: 'sw-manifest-generator',
    apply: 'build',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const entries: Array<{ url: string; revision: string | null }> = [];

      // Collect hashed assets (JS/CSS) — no revision needed (hash in filename)
      try {
        const assetsDir = join(distDir, 'assets');
        for (const file of readdirSync(assetsDir)) {
          if (/\.(js|css)$/.test(file) && !file.endsWith('.map')) {
            entries.push({ url: `/assets/${file}`, revision: null });
          }
        }
      } catch {
        // No assets dir — skip
      }

      // Collect WASM files
      try {
        const wasmDir = join(distDir, 'wasm');
        for (const file of readdirSync(wasmDir)) {
          if (file.endsWith('.wasm') || file.endsWith('.js')) {
            const stat = statSync(join(wasmDir, file));
            entries.push({ url: `/wasm/${file}`, revision: stat.mtimeMs.toString(36) });
          }
        }
      } catch {
        // No wasm dir — skip
      }

      // index.html — needs revision since filename doesn't change
      try {
        const stat = statSync(join(distDir, 'index.html'));
        entries.push({ url: '/index.html', revision: stat.mtimeMs.toString(36) });
      } catch {
        // No index.html — skip
      }

      // manifest.json
      try {
        const stat = statSync(join(distDir, 'manifest.json'));
        entries.push({ url: '/manifest.json', revision: stat.mtimeMs.toString(36) });
      } catch {
        // skip
      }

      writeFileSync(join(distDir, 'sw-manifest.json'), JSON.stringify(entries, null, 2));
      console.log(`[sw-manifest] Generated ${entries.length} precache entries`);
    },
  };
}

/**
 * Vite plugin to serve pre-compressed WASM files (.br / .gz) in dev mode.
 *
 * When a browser requests a .wasm file and sends Accept-Encoding: br/gzip,
 * this middleware serves the pre-compressed version with correct Content-Encoding
 * header, saving ~800 KB of transfer even during local development.
 *
 * In production, Fly.io's edge CDN handles this automatically for static assets.
 */
function wasmPrecompressedServe(): Plugin {
  return {
    name: 'wasm-precompressed-serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith('.wasm')) {
          next();
          return;
        }

        const acceptEncoding = req.headers['accept-encoding'] || '';
        const publicDir = resolve(__dirname, 'public');
        const wasmPath = resolve(publicDir, req.url.slice(1));

        // Try Brotli first (best ratio: ~25% of original)
        if (acceptEncoding.includes('br')) {
          try {
            const brData = readFileSync(`${wasmPath}.br`);
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Content-Encoding', 'br');
            res.setHeader('Content-Length', String(brData.byteLength));
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.end(brData);
            return;
          } catch {
            // .br file not available — try gzip
          }
        }

        // Try Gzip (fallback: ~38% of original)
        if (acceptEncoding.includes('gzip')) {
          try {
            const gzData = readFileSync(`${wasmPath}.gz`);
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Length', String(gzData.byteLength));
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.end(gzData);
            return;
          } catch {
            // .gz file not available — fall through to default
          }
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix = no VITE_ filter)
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8082';
  const partnerBackendUrl = env.VITE_PARTNER_BACKEND_URL || 'http://localhost:8081';

  const isProd = mode === 'production';

  return {
    plugins: [
      wasm(),
      topLevelAwait(),
      wasmPrecompressedServe(),
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', { target: '19' }]],
        },
      }),
      tailwindcss(),
      // PWA: custom SW manifest generator replaces vite-plugin-pwa (which was
      // incompatible with Vite 6+ monorepo due to secondary Rollup build
      // resolving wrong Vite version). The actual SW lives in public/sw.js.
      swManifestPlugin(),
      // Bundle size tracking: always generate stats.html on build, auto-open in analyze mode
      ...(isProd
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
          manualChunks(id: string) {
            // NOTE: BaseMessageBubble/BaseCodeBlock are NOT carved out from shared-ui
            // because the React Compiler prevents Rollup from splitting them.
            // Instead, vendor-markdown is loaded on-demand via dynamic import() in
            // BaseMessageBubble itself (see MarkdownRenderer.tsx lazy wrapper).
            // ── React core ──────────────────────────────────────────
            if (
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            // ── Zustand state management ────────────────────────────
            if (id.includes('/node_modules/zustand/')) {
              return 'vendor-zustand';
            }
            // ── TanStack React Query ────────────────────────────────
            if (id.includes('/node_modules/@tanstack/react-query/') && !id.includes('devtools')) {
              return 'vendor-query';
            }
            // ── TanStack DevTools (dev-only, eagerly loaded) ────────
            if (id.includes('/node_modules/@tanstack/react-query-devtools/')) {
              return 'vendor-devtools';
            }
            // ── TanStack Virtual ────────────────────────────────────
            if (
              id.includes('/node_modules/@tanstack/react-virtual/') ||
              id.includes('/node_modules/@tanstack/virtual-core/')
            ) {
              return 'vendor-virtual';
            }
            // ── Motion / Framer Motion ──────────────────────────────
            if (id.includes('/node_modules/motion/')) {
              return 'vendor-motion';
            }
            // ── i18n ────────────────────────────────────────────────
            if (id.includes('/node_modules/i18next') || id.includes('/node_modules/react-i18next/')) {
              return 'vendor-i18n';
            }
            // ── Markdown rendering (heavy: highlight.js ~250kB) ─────
            if (
              id.includes('/node_modules/react-markdown/') ||
              id.includes('/node_modules/remark-') ||
              id.includes('/node_modules/rehype-') ||
              id.includes('/node_modules/highlight.js/') ||
              id.includes('/node_modules/lowlight/') ||
              id.includes('/node_modules/hast-') ||
              id.includes('/node_modules/mdast-') ||
              id.includes('/node_modules/micromark') ||
              id.includes('/node_modules/unified/') ||
              id.includes('/node_modules/unist-')
            ) {
              return 'vendor-markdown';
            }
            // ── Zod schema validation ───────────────────────────────
            if (id.includes('/node_modules/zod/')) {
              return 'vendor-zod';
            }
            // ── Lucide icons (tree-shaken but still ~80kB) ──────────
            if (id.includes('/node_modules/lucide-react/')) {
              return 'vendor-lucide';
            }
            // ── OpenTelemetry + Zone.js (telemetry stack ~300kB) ────
            if (id.includes('/node_modules/@opentelemetry/') || id.includes('/node_modules/zone.js/')) {
              return 'vendor-otel';
            }
            // ── UI utilities (sonner, dompurify, etc.) ─────────────
            if (id.includes('/node_modules/sonner/') || id.includes('/node_modules/dompurify/')) {
              return 'vendor-ui';
            }
            // ── @jaskier/* workspace packages (shared app code) ─────
            // These resolve through symlinks to ../packages/*
            // IMPORTANT: telemetry.ts is excluded — it pulls in ~131KB of @opentelemetry/*
            // and must stay in its own async chunk (loaded via dynamic import() in main.tsx).
            if (
              (id.includes('/packages/core/') && !id.includes('/telemetry')) ||
              id.includes('/packages/state/') ||
              id.includes('/packages/i18n/')
            ) {
              return 'shared-core';
            }
            // MarkdownRenderer is dynamically imported by BaseMessageBubble.
            // Force it into its own chunk so vendor-markdown (329 KB) stays
            // out of the critical path — loaded only when chat view renders.
            if (id.includes('MarkdownRenderer')) {
              return 'lazy-markdown';
            }
            if (
              id.includes('/packages/hydra-app/') ||
              id.includes('/packages/chat-module/') ||
              id.includes('/packages/ui/')
            ) {
              return 'shared-ui';
            }
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
