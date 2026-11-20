/**
 * Node side of the photo target validation (`pnpm validate`, vitest): reads
 * content/photo/targets.json and checks it against the codex facts and the playable area
 * (contract C3, src/systems/photo/data.ts). Node only — never imported by the game bundle.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LoadedPack } from '../../content/validate';
import { type PhotoIssue, validatePhotoTargets } from './data';

export const PHOTO_TARGETS_FILE = 'content/photo/targets.json';

type Bounds = { x0: number; z0: number; x1: number; z1: number };

/** Parse and validate; ids = the known target ids (empty when the file is missing or broken). */
export function loadPhotoTargets(root: string, packs: LoadedPack[], bounds?: Bounds): { ok: boolean; ids: Set<string>; errors: PhotoIssue[]; warnings: PhotoIssue[]; parseError: string | null } {
  const path = join(root, PHOTO_TARGETS_FILE);
  if (!existsSync(path)) return { ok: true, ids: new Set(), errors: [], warnings: [], parseError: null };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { ok: false, ids: new Set(), errors: [], warnings: [], parseError: `ERROR ${PHOTO_TARGETS_FILE}: invalid JSON (${(err as Error).message})` };
  }
  const facts = new Set(packs.flatMap((p) => (p.pack.facts ?? []).map((f) => f.id)));
  return { ...validatePhotoTargets(PHOTO_TARGETS_FILE, data, { facts, bounds }), parseError: null };
}

/** Validate and print (ok = no errors). */
export function checkPhotoTargets(root: string, packs: LoadedPack[], bounds?: Bounds, verbose = false): { ok: boolean; ids: Set<string> } {
  const r = loadPhotoTargets(root, packs, bounds);
  if (r.parseError) console.log(r.parseError);
  const line = (i: PhotoIssue) => `${i.level === 'error' ? 'ERROR' : 'warn '} ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`;
  for (const e of r.errors) console.log(line(e));
  if (verbose) for (const w of r.warnings) console.log(line(w));
  console.log(`${r.ids.size} photo target(s) · ${r.warnings.length} warning(s)${verbose || !r.warnings.length ? '' : ' (STORY_VERBOSE=1 to list)'}`);
  return { ok: r.ok && !r.parseError, ids: r.ids };
}
