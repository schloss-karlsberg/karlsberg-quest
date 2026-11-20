import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Recorded voices are optional (public/voice/ is gitignored until the audio is licensed). With no
 * public/voice/manifest.json, serve / emit an empty one, so the game's manifest fetch never hits a
 * 404 (a browser console error in every e2e spec). A real manifest from the voice pipeline wins.
 */
const EMPTY_VOICE_MANIFEST = '{"version":1,"lines":{}}\n';
const VOICE_MANIFEST = 'public/voice/manifest.json';

function voiceManifestFallback(): Plugin {
  return {
    name: 'kq-voice-manifest-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0]?.endsWith('/voice/manifest.json') && !existsSync(VOICE_MANIFEST)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(EMPTY_VOICE_MANIFEST);
          return;
        }
        next();
      });
    },
    generateBundle() {
      if (!existsSync(VOICE_MANIFEST)) this.emitFile({ type: 'asset', fileName: 'voice/manifest.json', source: EMPTY_VOICE_MANIFEST });
    },
  };
}

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  plugins: [voiceManifestFallback()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0,
    // bundle output apart from the art assets (public/assets → dist/assets)
    assetsDir: 'app',
  },
  server: { port: 5280 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
