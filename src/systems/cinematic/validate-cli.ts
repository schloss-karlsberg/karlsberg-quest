/**
 * `pnpm validate`: every content/cinematics/<ref>.json must be a valid cinematic (the same checks
 * the runtime makes, keys.ts `normalize`). Node only (scripts/validate-content.ts).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ID_RE, normalize } from './keys';
import type { CinematicFile } from './types';

export function checkCinematics(root: string): { ok: boolean; refs: string[]; errors: string[] } {
  const dir = join(root, 'content/cinematics');
  const errors: string[] = [];
  const files: Record<string, CinematicFile> = {};
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const ref = f.replace(/\.json$/, '');
      if (!ID_RE.test(ref)) errors.push(`ERROR content/cinematics/${f}: the file name is not an id`);
      try {
        files[ref] = JSON.parse(readFileSync(join(dir, f), 'utf8')) as CinematicFile;
      } catch (err) {
        errors.push(`ERROR content/cinematics/${f}: invalid JSON (${(err as Error).message})`);
      }
    }
  }
  for (const [ref, file] of Object.entries(files)) {
    if ('ref' in (file as object)) errors.push(`ERROR content/cinematics/${ref}.json: a file cannot have a ref`);
    const n = normalize({ id: typeof file.id === 'string' ? file.id : ref, ref }, files);
    if (!n.ok) errors.push(`ERROR content/cinematics/${ref}.json: ${n.error}`);
  }
  return { ok: errors.length === 0, refs: Object.keys(files), errors };
}
