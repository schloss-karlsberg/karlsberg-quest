import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0,
  },
  server: { port: 5280 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
