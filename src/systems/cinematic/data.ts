import type { CinematicFile } from './types';

/** All cinematic files bundled by Vite (content/cinematics/<ref>.json), by ref (the file name). */
export function loadBundledCinematics(): Record<string, CinematicFile> {
  const mods = import.meta.glob<CinematicFile>('/content/cinematics/*.json', { eager: true, import: 'default' });
  const out: Record<string, CinematicFile> = {};
  for (const [file, data] of Object.entries(mods)) out[file.replace(/^.*\//, '').replace(/\.json$/, '')] = data;
  return out;
}
