/**
 * Node side of the story validation (used by `pnpm validate` and the vitest suite): reads
 * content/story/*.story.json and checks them against the content packs. Node only — never
 * imported by the game bundle.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LoadedPack } from '../../content/validate';
import type { StoryFile } from './types';
import type { Route } from '../walk/types';
import { type StoryValidation, checkRoutes, validateStories } from './validate';

/** content/routes/*.json (the tour's walk routes) and the content/cinematics/*.json ids. */
export function loadWalkRefs(root: string): { routes: Map<string, Route>; cinematics: Set<string> } {
  const routes = new Map<string, Route>();
  const rdir = join(root, 'content/routes');
  if (existsSync(rdir))
    for (const f of readdirSync(rdir).filter((n) => n.endsWith('.json'))) {
      const r = JSON.parse(readFileSync(join(rdir, f), 'utf8')) as Route;
      routes.set(r.id, r);
    }
  const cdir = join(root, 'content/cinematics');
  const cinematics = new Set(existsSync(cdir) ? readdirSync(cdir).filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, '')) : []);
  return { routes, cinematics };
}

export function loadStoryFiles(root: string): { files: { file: string; story: StoryFile }[]; parseErrors: string[] } {
  const dir = join(root, 'content/story');
  const files: { file: string; story: StoryFile }[] = [];
  const parseErrors: string[] = [];
  if (!existsSync(dir)) return { files, parseErrors };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.story.json')).sort()) {
    const rel = `content/story/${f}`;
    try {
      files.push({ file: rel, story: JSON.parse(readFileSync(join(dir, f), 'utf8')) as StoryFile });
    } catch (err) {
      parseErrors.push(`ERROR ${rel}: invalid JSON (${(err as Error).message})`);
    }
  }
  return { files, parseErrors };
}

export function storyRefs(packs: LoadedPack[]) {
  const ids = (k: 'clues' | 'nouns' | 'speakers' | 'dialogue') => new Set(packs.flatMap((p) => (p.pack[k] ?? []).map((x: { id: string }) => x.id)));
  return { clues: ids('clues'), nouns: ids('nouns'), speakers: ids('speakers'), dialogue: ids('dialogue') };
}

/** Validate and print; returns false on errors. Warnings (content not written yet) are summarised. */
export function checkStories(root: string, packs: LoadedPack[], verbose = false, rpg: { quests?: Set<string>; items?: Set<string> } = {}): { ok: boolean; result: StoryValidation } {
  const { files, parseErrors } = loadStoryFiles(root);
  const walk = loadWalkRefs(root);
  const result = validateStories(files, { ...storyRefs(packs), ...rpg, ...walk });
  for (const i of checkRoutes(walk.routes)) {
    result.errors.push(i);
    result.ok = false;
  }
  const line = (i: { level: string; file: string; id?: string; message: string }) => `${i.level === 'error' ? 'ERROR' : 'warn '} ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`;
  for (const e of parseErrors) console.log(e);
  for (const e of result.errors) console.log(line(e));
  if (verbose) for (const w of result.warnings) console.log(line(w));
  const s = result.stats;
  console.log(
    `${files.length} story file(s): ${s.chapters} chapters, ${s.beats} beats, ${s.lines} lines · ${result.warnings.length} warning(s)${verbose || !result.warnings.length ? '' : ' (STORY_VERBOSE=1 to list)'}`,
  );
  return { ok: result.ok && parseErrors.length === 0, result };
}
