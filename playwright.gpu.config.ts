import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Real-GPU screenshots (ANGLE on Metal instead of SwiftShader): the look the owner sees. Only the
 * `e2e/gpu/*.gpu.ts` specs, so the normal suite never runs them. Wrap runs in the exclusive lane of
 * scripts/dev/heavy.sh (a quiet machine):
 *   KQ_E2E_PORT=5361 scripts/dev/heavy.sh --exclusive -- npx playwright test -c playwright.gpu.config.ts --workers=1
 */
const PORT = Number(process.env.KQ_E2E_PORT ?? 5281 + (Number.parseInt(process.env.KQ_HEAVY_SLOT ?? '', 10) || 0));

export default defineConfig({
  ...base,
  testDir: 'e2e/gpu',
  testMatch: /.*\.gpu\.ts$/,
  outputDir: 'test-results/gpu-artifacts',
  use: {
    ...base.use,
    baseURL: `http://127.0.0.1:${PORT}/`,
    launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: { ...base.webServer!, command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`, url: `http://127.0.0.1:${PORT}/` },
});
