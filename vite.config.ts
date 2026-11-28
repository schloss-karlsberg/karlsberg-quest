import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { t } from './src/i18n/index.ts';
import { blocksToHtml, collectNotes, escapeHtml, parseMarkdown } from './src/ui/releaseNotes.ts';

const root = import.meta.dirname;
const NOTES_DIR = resolve(root, 'content/release-notes');

/** package.json "version" (bumped by release-please). */
const version = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }).version;

/** Short SHA of HEAD; 'dev' when git is unavailable (e.g. a source tarball). */
function gitBuild(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}
const build = gitBuild();

/** All player notes (content/release-notes/vX.Y.Z.md) as one static page, newest first. */
export function renderNewsPage(): string {
  let files: Record<string, string> = {};
  try {
    for (const f of readdirSync(NOTES_DIR)) if (f.endsWith('.md')) files[f] = readFileSync(resolve(NOTES_DIR, f), 'utf8');
  } catch {
    files = {};
  }
  const notes = collectNotes(files);
  const sections = notes.length
    ? notes.map((n) => `<section id="v${escapeHtml(n.version)}">\n${blocksToHtml(parseMarkdown(n.markdown), 1)}\n</section>`).join('\n')
    : '<p>Noch keine Einträge.</p>';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Karlsberg Quest – Neuigkeiten</title>
<meta name="description" content="Was ist neu in Karlsberg Quest? Alle Versionen für Spielerinnen und Spieler.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<style>
:root {
  --paper: #e8dcc0; --paper-edge: #b9a57c; --ink: #2a2118; --ink-soft: #5a4a37;
  --ink-faint: rgba(42, 33, 24, 0.45); --rule: rgba(84, 110, 140, 0.28); --margin: rgba(170, 60, 45, 0.55);
  --accent: #8c2f1f; --night: #14110d;
  --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--night); color: var(--ink); font-family: var(--serif); padding: 32px 16px; }
main {
  position: relative; max-width: 720px; margin: 0 auto; padding: 34px 32px 30px 76px; border-radius: 3px 8px 8px 3px;
  background-color: var(--paper);
  background-image:
    radial-gradient(ellipse at 20% 10%, rgba(255, 250, 235, 0.55), transparent 60%),
    radial-gradient(ellipse at 85% 90%, rgba(120, 85, 40, 0.22), transparent 55%),
    linear-gradient(90deg, transparent 0 52px, var(--margin) 52px 53.5px, transparent 53.5px),
    repeating-linear-gradient(180deg, transparent 0 29px, var(--rule) 29px 30px);
  box-shadow: 0 0 0 1px rgba(60, 40, 20, 0.25), 0 18px 60px rgba(0, 0, 0, 0.55), 0 0 80px rgba(80, 50, 20, 0.25) inset;
}
h1 { font-weight: 400; font-size: 44px; line-height: 1.05; margin: 0 0 4px; font-variant: small-caps; }
.sub { font-style: italic; font-size: 20px; color: var(--ink-soft); margin: 0 0 24px; }
h2 { font-weight: 400; font-size: 28px; margin: 0 0 6px; font-variant: small-caps; }
h3 { font-weight: 400; font-style: italic; font-size: 21px; color: var(--accent); margin: 16px 0 4px; }
p, li { font-size: 18px; line-height: 1.5; }
ul { margin: 0 0 6px; padding-left: 22px; }
section + section { margin-top: 26px; padding-top: 18px; border-top: 1px dashed var(--ink-faint); }
a { color: var(--accent); }
.play { display: inline-block; margin: 0 0 24px; padding: 9px 22px 7px; border: 1.5px solid var(--ink); border-radius: 3px;
  background: var(--ink); color: var(--paper); text-decoration: none; font-size: 19px; box-shadow: 3px 3px 0 rgba(42, 33, 24, 0.3); }
.play:hover, .play:focus-visible { background: #3b2e21; }
footer { margin-top: 28px; font-size: 14px; color: var(--ink-soft); }
@media (max-width: 560px) {
  body { padding: 16px; }
  main { padding: 24px 18px 22px 30px; background-image:
    radial-gradient(ellipse at 20% 10%, rgba(255, 250, 235, 0.55), transparent 60%),
    linear-gradient(90deg, transparent 0 14px, var(--margin) 14px 15.5px, transparent 15.5px),
    repeating-linear-gradient(180deg, transparent 0 29px, var(--rule) 29px 30px); }
  h1 { font-size: 34px; }
}
</style>
</head>
<body>
<main>
<h1>Karlsberg Quest</h1>
<p class="sub">Neuigkeiten für Spielerinnen und Spieler</p>
<a class="play" href="./">Zum Spiel</a>
${sections}
<footer>Aktuelle ${escapeHtml(t('title.version', { version, build }))} · <a href="./">Zurück zum Spiel</a></footer>
</main>
</body>
</html>
`;
}

/** Emits dist/neu.html at build time and serves /neu.html in dev and preview-less dev runs. */
function releaseNotesPage(): Plugin {
  return {
    name: 'kq-release-notes-page',
    configureServer(server) {
      server.watcher.add(NOTES_DIR);
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0]!.endsWith('/neu.html')) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderNewsPage());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'neu.html', source: renderNewsPage() });
    },
  };
}

/**
 * Recorded voices are optional (public/voice/ holds committed synthetic MOSS clips only, and may be empty). With no
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

/**
 * Paths the dev server must not watch. Agents create git worktrees under .claude/worktrees (each a full repo copy
 * with its own index.html and tsconfig.json), and tools write task files, test reports and voice output next to the
 * sources; any of these used to trigger a full page reload of the running game. The globs are anchored at this
 * checkout's root, not `**\/.claude/**`: a dev server started inside a worktree lives under .claude/ itself and
 * would otherwise ignore all of its own sources.
 */
export const WATCH_IGNORED = ['.claude', '.agents', '.mc', 'dist', 'test-results', 'playwright-report', '.voice-raw'].map(
  (dir) => `${resolve(root, dir).replaceAll('\\', '/')}/**`,
);

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  // Only these two literals reach the bundle (src/buildInfo.ts); never env vars from here.
  define: {
    __KQ_VERSION__: JSON.stringify(version),
    __KQ_BUILD__: JSON.stringify(build),
  },
  plugins: [releaseNotesPage(), voiceManifestFallback()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0,
    // bundle output apart from the art assets (public/assets → dist/assets)
    assetsDir: 'app',
  },
  server: { port: 5280, watch: { ignored: WATCH_IGNORED } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Keep named FAIL lines in captured logs and avoid an overwriting terminal progress panel.
    reporters: [['default', { summary: false }], ...(process.env.GITHUB_ACTIONS === 'true' ? ['github-actions'] : [])],
  },
});
