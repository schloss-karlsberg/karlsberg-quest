/** Validate pack references, story and quest progression, cinematics and photo targets. */
import { type Dirent, type Stats, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentPack } from '../src/content/types.ts';
import { type LoadedPack, formatIssues, validateContent } from '../src/content/validate.ts';
import { checkStories, loadStoryFiles } from '../src/systems/story/validate-cli.ts';
import { checkQuests, loadQuestFiles } from '../src/systems/quests/validate-cli.ts';
import { checkCinematics } from '../src/systems/cinematic/validate-cli.ts';
import { checkPhotoTargets } from '../src/systems/photo/validate-cli.ts';
import { runtimeEvents } from './content-validation/catalog';
import { validateProgression } from './content-validation/progression';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function findPacks(dir: string): { files: string[]; linkedDirectories: string[] } {
  const files: string[] = [];
  const linkedDirectories: string[] = [];
  const walk = (parent: string) => {
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const file = join(parent, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      let type: Dirent | Stats = entry;
      if (entry.isSymbolicLink()) {
        try {
          type = statSync(file);
        } catch {
          continue;
        }
        if (type.isDirectory()) linkedDirectories.push(file);
      }
      if (type.isFile() && entry.name.endsWith('.pack.json')) files.push(file);
    }
  };
  if (existsSync(dir)) walk(dir);
  return { files: files.sort(), linkedDirectories: linkedDirectories.sort() };
}

export function loadPacks(root = ROOT): { packs: LoadedPack[]; errors: string[] } {
  const packs: LoadedPack[] = [];
  const { files, linkedDirectories } = findPacks(join(root, 'content'));
  const errors = linkedDirectories.map((dir) => `ERROR ${relative(root, dir)}: symbolic links to directories are not supported`);
  for (const file of files) {
    const rel = relative(root, file);
    try {
      packs.push({ file: rel, pack: JSON.parse(readFileSync(file, 'utf8')) as ContentPack });
    } catch (err) {
      errors.push(`ERROR ${rel}: invalid JSON (${(err as Error).message})`);
    }
  }
  return { packs, errors };
}

export function gameBounds(root = ROOT) {
  const p = join(root, 'public/data/terrain/meta.json');
  if (!existsSync(p)) return undefined;
  const m = JSON.parse(readFileSync(p, 'utf8'));
  const e = m.extentLocal;
  return { x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { packs, errors } = loadPacks();
  const r = validateContent(packs, { bounds: gameBounds() });
  const out = formatIssues(r);
  if (errors.length) console.log(errors.join('\n'));
  if (out) console.log(out);
  console.log(`\n${packs.length} pack(s): ${Object.entries(r.stats).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  const verbose = !!process.env.STORY_VERBOSE;
  const stories = loadStoryFiles(ROOT).files;
  const chapters = new Set(stories.map((f) => f.story.chapter));
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
  const cine = checkCinematics(ROOT);
  if (cine.errors.length) console.log(cine.errors.join('\n'));
  if (!cine.ok) {
    console.log('✗ cinematic files invalid');
    process.exit(1);
  }
  console.log(`✓ ${cine.refs.length} cinematic file(s)`);
  if (!r.ok || errors.length) {
    console.log(`✗ content invalid: ${r.errors.length + errors.length} error(s), ${r.warnings.length} warning(s)`);
    process.exit(1);
  }
  const flow = validateProgression(stories, loadQuestFiles(ROOT).files, packs, runtimeEvents(ROOT));
  const flowErrors = flow.filter(i => i.level === 'error');
  const flowWarnings = flow.filter(i => i.level === 'warning');
  if (flow.length) console.log(formatIssues({ errors: flowErrors, warnings: flowWarnings }));
  console.log(`Progression: ${flowErrors.length} error(s), ${flowWarnings.length} warning(s)`);
  if (flowErrors.length) process.exit(1);
  const totalWarnings = r.warnings.length + photo.warnings + quests.result.warnings.length + story.result.warnings.length + flowWarnings.length;
  console.log(`✓ content valid (${totalWarnings} warning(s))`);
}
