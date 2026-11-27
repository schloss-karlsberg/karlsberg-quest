import { defineConfig } from '@playwright/test';
import { ciScale, desktopViewport, isCI } from './e2e/helpers/ci';
import { slotDir, slotPort } from './scripts/dev/heavy-env.mjs';

// KQ_E2E_PORT: run several worktrees' suites side by side without reusing each other's server.
// Without it, a run inside scripts/dev/heavy.sh slot k (KQ_HEAVY_SLOT) uses 5281 + k, so jobs in
// different slots never reuse each other's preview server. The artifacts dir (wiped at each run
// start) is test-results/artifacts in slot 0 and test-results/artifacts-slot<k> in slot k, so two
// jobs from the same checkout never wipe each other's.
const PORT = slotPort(5281, 'KQ_E2E_PORT');
const shardMinutes = process.env.KQ_E2E_CAMPAIGN === '1' ? 240 : 180;

export default defineConfig({
  testDir: 'e2e',
  timeout: ciScale(120_000),
  expect: { timeout: ciScale(30_000) },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  // Keep setup and artifact upload headroom in the corresponding e2e.yml job budgets.
  globalTimeout: isCI ? shardMinutes * 60_000 : 0,
  reporter: isCI ? [['github'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }]] : [['list']],
  outputDir: slotDir('test-results/artifacts'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    // The game already selects Niedrig for SwiftShader, with DPR 1, shorter LOD distances and no shadows.
    viewport: isCI ? { width: 640, height: 360 } : desktopViewport,
    // CI runs the full Chromium build (new headless), not chrome-headless-shell: when SwiftShader falls
    // behind on synchronous kq.step draws, the shell's renderer and browser processes grow by about
    // 30-40 MB/s each until the 16 GB runner is OOM-killed; full Chromium stays flat (TASK-075).
    ...(isCI ? { channel: 'chromium' } : {}),
    // No traces: a 30-minute chapter trace is huge and rarely needed. Failure screenshots stay.
    trace: 'off',
    screenshot: isCI ? 'only-on-failure' : 'off',
    launchOptions: {
      // WebGL in headless Chromium: ANGLE on SwiftShader (software) is deterministic and needs no GPU.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
