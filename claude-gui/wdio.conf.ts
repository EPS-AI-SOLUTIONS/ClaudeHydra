/**
 * WebdriverIO Configuration for Tauri E2E Tests
 *
 * Uses tauri-driver to connect to the REAL Tauri application.
 * No mocks - tests run against the actual Rust backend + React frontend.
 *
 * Requirements:
 * - cargo install tauri-driver
 * - Release build: src-tauri/target/release/claude-gui.exe
 * - msedgedriver in drivers/ directory
 */

import { type ChildProcess, spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TAURI_APP_PATH = path.resolve(__dirname, 'src-tauri/target/release/claude-gui.exe');

const DRIVERS_DIR = path.resolve(__dirname, 'drivers');

let tauriDriver: ChildProcess | null = null;
let viteServer: ChildProcess | null = null;

/** Wait for Vite dev server to be ready at localhost:4200 */
async function waitForVite(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get('http://localhost:4200', (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Vite dev server did not start within ${timeoutMs}ms`);
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  autoCompileOpts: {
    tsNodeOpts: {
      project: './tsconfig.e2e.json',
    },
  },

  specs: ['./tests/e2e-tauri/**/*.spec.ts'],

  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      browserName: 'edge',
      'tauri:options': {
        application: TAURI_APP_PATH,
        webviewOptions: {},
      },
    },
  ],

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  reporters: ['spec'],

  hostname: '127.0.0.1',
  port: 4444,

  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  beforeSession: async () => {
    // 1. Start Vite dev server
    console.log('[WDIO] Starting Vite dev server...');
    viteServer = spawn('npx', ['vite', '--port', '4200'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      cwd: __dirname,
    });
    viteServer.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[vite] ${msg}`);
    });
    viteServer.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[vite:err] ${msg}`);
    });

    await waitForVite();
    console.log('[WDIO] Vite dev server ready at http://localhost:4200');

    // 2. Start tauri-driver
    console.log('[WDIO] Starting tauri-driver...');
    const env = { ...process.env };
    env.PATH = DRIVERS_DIR + path.delimiter + (env.PATH || '');

    tauriDriver = spawn('tauri-driver', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env,
    });

    tauriDriver.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[tauri-driver] ${msg}`);
    });
    tauriDriver.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[tauri-driver:err] ${msg}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('[WDIO] tauri-driver started (pid:', tauriDriver.pid, ')');
  },

  before: async () => {
    const url = await browser.getUrl();
    console.log('[WDIO] Current URL:', url);

    if (url === 'about:blank' || !url.includes('localhost')) {
      await browser.pause(3000);
      const url2 = await browser.getUrl();
      console.log('[WDIO] URL after wait:', url2);

      if (url2 === 'about:blank' || !url2.includes('localhost')) {
        console.log('[WDIO] Navigating to http://localhost:4200...');
        await browser.url('http://localhost:4200');
      }
    }

    // Wait for the app to load (React renders the aside element)
    await browser.waitUntil(
      async () => {
        try {
          const aside = await $('aside');
          return await aside.isDisplayed();
        } catch {
          return false;
        }
      },
      {
        timeout: 30000,
        interval: 500,
        timeoutMsg: 'Tauri app UI did not load within 30 seconds',
      },
    );
    console.log('[WDIO] Tauri app UI loaded successfully');
  },

  afterSession: async () => {
    if (tauriDriver) {
      console.log('[WDIO] Stopping tauri-driver...');
      tauriDriver.kill();
      tauriDriver = null;
    }
    if (viteServer) {
      console.log('[WDIO] Stopping Vite dev server...');
      viteServer.kill();
      viteServer = null;
    }
  },
};
