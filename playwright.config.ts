import { defineConfig } from '@playwright/test';
import { slotDir, slotPort } from './scripts/dev/heavy-env.mjs';

// KQ_E2E_PORT: run several worktrees' suites side by side without reusing each other's server.
// Without it, a run inside scripts/dev/heavy.sh slot k (KQ_HEAVY_SLOT) uses 5281 + k, so jobs in
// different slots never reuse each other's preview server. The artifacts dir (wiped at each run
// start) is test-results/artifacts in slot 0 and test-results/artifacts-slot<k> in slot k, so two
// jobs from the same checkout never wipe each other's.
const PORT = slotPort(5281, 'KQ_E2E_PORT');
const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: ci,
  // Leave time for setup and artifact upload within the hosted job's 90-minute deadline.
  globalTimeout: ci ? 75 * 60_000 : 0,
  reporter: ci ? [['github'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }]] : [['list']],
  outputDir: slotDir('test-results/artifacts'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 1280, height: 720 },
    trace: ci ? 'retain-on-failure' : 'off',
    screenshot: ci ? 'only-on-failure' : 'off',
    launchOptions: {
      // WebGL in headless Chromium: ANGLE on SwiftShader (software) is deterministic and needs no GPU.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
