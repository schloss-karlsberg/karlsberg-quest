/**
 * pnpm validate — checks every content/**\/*.pack.json (sources, confidence labels, references,
 * case solvability). Exit code 1 on any error.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentPack } from '../src/content/types.ts';
import { type LoadedPack, formatIssues, validateContent } from '../src/content/validate.ts';
import { checkStories, loadStoryFiles } from '../src/systems/story/validate-cli.ts';
import { checkQuests } from '../src/systems/quests/validate-cli.ts';
import { checkPhotoTargets } from '../src/systems/photo/validate-cli.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function findPacks(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: false })
    .map(String)
    .filter((f) => f.endsWith('.pack.json'))
    .map((f) => join(dir, f))
    .sort();
}

export function loadPacks(root = ROOT): { packs: LoadedPack[]; parseErrors: string[] } {
  const packs: LoadedPack[] = [];
  const parseErrors: string[] = [];
  for (const file of findPacks(join(root, 'content'))) {
    const rel = relative(root, file);
    try {
      packs.push({ file: rel, pack: JSON.parse(readFileSync(file, 'utf8')) as ContentPack });
    } catch (err) {
      parseErrors.push(`ERROR ${rel}: invalid JSON (${(err as Error).message})`);
    }
  }
  return { packs, parseErrors };
}

export function gameBounds(root = ROOT) {
  const p = join(root, 'public/data/terrain/meta.json');
  if (!existsSync(p)) return undefined;
  const m = JSON.parse(readFileSync(p, 'utf8'));
  const e = m.extentLocal;
  return { x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { packs, parseErrors } = loadPacks();
  const r = validateContent(packs, { bounds: gameBounds() });
  const out = formatIssues(r);
  if (parseErrors.length) console.log(parseErrors.join('\n'));
  if (out) console.log(out);
  console.log(`\n${packs.length} pack(s): ${Object.entries(r.stats).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  const verbose = !!process.env.STORY_VERBOSE;
  const chapters = new Set(loadStoryFiles(ROOT).files.map((f) => f.story.chapter));
  const photo = checkPhotoTargets(ROOT, packs, gameBounds(), verbose);
  const quests = checkQuests(ROOT, packs, chapters, gameBounds(), verbose);
  const story = checkStories(ROOT, packs, verbose, { quests: quests.result.questIds, items: quests.result.itemIds });
  if (!quests.ok) {
    console.log('✗ quest files invalid');
    process.exit(1);
  }
  if (!photo.ok) {
    console.log('✗ photo targets invalid');
    process.exit(1);
  }
  if (!story.ok) {
    console.log('✗ story files invalid');
    process.exit(1);
  }
  if (!r.ok || parseErrors.length) {
    console.log(`✗ content invalid: ${r.errors.length + parseErrors.length} error(s), ${r.warnings.length} warning(s)`);
    process.exit(1);
  }
  console.log(`✓ content valid (${r.warnings.length} warning(s))`);
}
