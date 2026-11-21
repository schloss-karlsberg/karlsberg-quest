import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

/**
 * The mobile UI tour (e2e/mobile/tour.pw.ts, docs/MOBILE-UI-PASS.md): its own config so the normal
 * suite never picks it up and so it runs on the REAL GPU (ANGLE Metal, as scripts/dev/storyboard.mjs)
 * instead of the suite's SwiftShader. Start it through scripts/dev/mobile-tour.ts (one unit per
 * heavy-lock hold).
 *
 * KQ_MOBILE_PORT (default 5340): the preview server's port. KQ_MOBILE_HEADED=1: a headed window
 * (if headless Chromium falls back to SwiftShader on this machine; the tour aborts on a software
 * renderer unless KQ_MOBILE_ALLOW_SOFT=1).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.KQ_MOBILE_PORT ?? 5340);

export default defineConfig({
  testDir: '.',
  testMatch: 'tour.pw.ts',
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: resolve(ROOT, 'test-results/mobile-tour/_pw'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    headless: process.env.KQ_MOBILE_HEADED !== '1',
    launchOptions: {
      // real GPU: ANGLE on Metal (the suite's playwright.config.ts uses SwiftShader on purpose)
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
