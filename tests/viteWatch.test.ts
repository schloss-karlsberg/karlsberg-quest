import { matchesGlob, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import config, { WATCH_IGNORED } from '../vite.config';

const root = resolve(import.meta.dirname, '..');
const ignored = (rel: string) => WATCH_IGNORED.some((g) => matchesGlob(resolve(root, rel).replaceAll('\\', '/'), g));

describe('vite dev server watch', () => {
  it('passes the ignore list to the dev server', () => {
    expect((config as { server?: { watch?: { ignored?: unknown } } }).server?.watch?.ignored).toBe(WATCH_IGNORED);
  });

  it('ignores agent worktrees and tool output', () => {
    for (const p of [
      '.claude/worktrees/agent-1/index.html',
      '.claude/worktrees/agent-1/tsconfig.json',
      '.claude/settings.local.json',
      '.agents/skills/contribute/SKILL.md',
      '.mc/tasks/todo/TASK-001-x.md',
      'test-results/run/trace.zip',
      'playwright-report/index.html',
      'dist/index.html',
      '.voice-raw/a.wav',
    ]) {
      expect(ignored(p), p).toBe(true);
    }
  });

  // Also holds when this checkout is itself a worktree under .claude/worktrees.
  it('still watches game sources and content', () => {
    for (const p of ['index.html', 'src/main.ts', 'content/story/00-tour.story.json', 'public/assets/LICENSES.json', 'tsconfig.json']) {
      expect(ignored(p), p).toBe(false);
    }
  });
});
