import { defineConfig } from '@playwright/test';

// KQ_E2E_PORT: run several worktrees' suites side by side without reusing each other's server.
// Without it, a run inside scripts/dev/heavy.sh slot k (KQ_HEAVY_SLOT) uses 5281 + k, so jobs in
// different slots never reuse each other's preview server.
const PORT = Number(process.env.KQ_E2E_PORT ?? 5281 + (Number.parseInt(process.env.KQ_HEAVY_SLOT ?? '', 10) || 0));

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // WebGL in headless Chromium: ANGLE on SwiftShader (software) is deterministic and needs no GPU.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
