/**
 * Node side of the quest validation (`pnpm validate`, vitest): reads content/quests/*.quests.json
 * and checks them against the packs (speakers, codex facts, clues), the story chapters and the
 * playable area. Node only — never imported by the game bundle.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LoadedPack } from '../../content/validate';
import type { QuestFile } from '../../rpg/types';
import { type QuestValidation, validateQuests } from './validate';

export function loadQuestFiles(root: string): { files: { file: string; data: QuestFile }[]; parseErrors: string[] } {
  const dir = join(root, 'content/quests');
  const files: { file: string; data: QuestFile }[] = [];
  const parseErrors: string[] = [];
  if (!existsSync(dir)) return { files, parseErrors };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.quests.json')).sort()) {
    const rel = `content/quests/${f}`;
    try {
      files.push({ file: rel, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) as QuestFile });
    } catch (err) {
      parseErrors.push(`ERROR ${rel}: invalid JSON (${(err as Error).message})`);
    }
  }
  return { files, parseErrors };
}

export function questRefs(packs: LoadedPack[], chapters: Set<string>, bounds?: { x0: number; z0: number; x1: number; z1: number }) {
  const all = <T>(k: string) => packs.flatMap((p) => ((p.pack as unknown as Record<string, T[] | undefined>)[k] ?? []) as T[]);
  const speakers = all<{ id: string; historical?: boolean }>('speakers');
  return {
    speakers: new Set(speakers.map((s) => s.id)),
    historical: new Set(speakers.filter((s) => s.historical).map((s) => s.id)),
    facts: new Set(all<{ id: string }>('facts').map((f) => f.id)),
    clues: new Set(all<{ id: string }>('clues').map((c) => c.id)),
    chapters,
    bounds,
  };
}

/** Validate and print; returns the result (ok = no errors). */
export function checkQuests(root: string, packs: LoadedPack[], chapters: Set<string>, bounds?: { x0: number; z0: number; x1: number; z1: number }, verbose = false): { ok: boolean; result: QuestValidation } {
  const { files, parseErrors } = loadQuestFiles(root);
  const result = validateQuests(files, questRefs(packs, chapters, bounds));
  const line = (i: { level: string; file: string; id?: string; message: string }) => `${i.level === 'error' ? 'ERROR' : 'warn '} ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`;
  for (const e of parseErrors) console.log(e);
  for (const e of result.errors) console.log(line(e));
  if (verbose) for (const w of result.warnings) console.log(line(w));
  const s = result.stats;
  console.log(
    `${s.files} quest file(s): ${s.quests} quests (${s.main} main, ${s.side} side), ${s.objectives} objectives, ${s.items} items · ${result.warnings.length} warning(s)${verbose || !result.warnings.length ? '' : ' (STORY_VERBOSE=1 to list)'}`,
  );
  return { ok: result.ok && parseErrors.length === 0, result };
}
