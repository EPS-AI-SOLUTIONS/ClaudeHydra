/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";
import os from "os";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Get CPU cores for parallel processing
const cpuCores = os.cpus().length;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    // Gzip compression
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // Only compress files > 1KB
    }),
    // Brotli compression (better ratio)
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ],

  // Vitest configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },

  // Build optimization - code splitting
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core - smallest, most stable
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          // Markdown rendering (heavy) - lazy loaded with chat views
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') ||
              id.includes('unified') || id.includes('mdast') || id.includes('hast') ||
              id.includes('micromark') || id.includes('highlight.js')) {
            return 'vendor-markdown';
          }
          // Animation library
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          // Icons - tree-shaken
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // State management
          if (id.includes('zustand')) {
            return 'vendor-state';
          }
          // Tauri APIs
          if (id.includes('@tauri-apps')) {
            return 'vendor-tauri';
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
    // Minification - use terser for better parallelization
    minify: 'terser',
    terserOptions: {
      maxWorkers: Math.max(1, cpuCores - 1),
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug', 'console.warn'],
      },
    },
    target: 'esnext',
    // Preload critical modules
    modulePreload: {
      polyfill: true,
    },
    // Source maps for debugging
    sourcemap: false,
    // CSS code splitting
    cssCodeSplit: true,
  },

  // Remove console.log and debugger in production builds
  esbuild: {
    pure: ['console.log', 'console.warn', 'console.debug'],
    drop: ['debugger'],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 4200,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 4201,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Proxy Ollama API for browser mode (bypasses CORS)
    proxy: {
      '/api/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
    },
  },
}));
