/**
 * Every fight content places (playtest round 5, docs/ACTION-RPG.md §5.5): quest spawns from
 * content/quests and story `enemy` spawns from content/story, with the pack overrides they carry,
 * the tier quests give them (CHAPTER_TIER) and the build a player has when they meet it. Not a
 * test file itself: `combat-balance.test.ts` fights each one with the bots.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnemyGroupState } from '../src/rpg/types';
import { CHAPTER_TIER } from '../src/systems/quests/logic';
import type { Build, Encounter } from './combat-bots';
import { CHAPTERS } from './combat-bots';

export interface ContentEncounter {
  /** quest id + objective, or story file:beat + group. */
  id: string;
  chapter: string;
  build: Build;
  enc: Encounter;
  boss: boolean;
  /** The chapter's first regular fight (the masher must come through it). */
  first: boolean;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BOSSES = new Set(['schuldbuch', 'pikeur', 'strohmann', 'steinbrecher']);
const PICK = ['escorts', 'wave', 'aggro', 'veiled'] as const;

/** The build a player has in each chapter. */
export function buildOf(chapter: string): Build {
  return CHAPTERS[chapter]!.build;
}

const chapterOfFile = (f: string): string => {
  const n = Number(f.slice(0, 2));
  return n === 0 ? 'tour' : `k${n}`;
};

function extra(s: Record<string, unknown>, quest?: string): Partial<EnemyGroupState> {
  const out: Record<string, unknown> = {};
  for (const k of PICK) if (s[k] !== undefined) out[k] = s[k];
  if (quest) out.quest = quest;
  if (typeof s.radius === 'number') out.radius = s.radius;
  return out as Partial<EnemyGroupState>;
}

export function contentEncounters(): ContentEncounter[] {
  const out: ContentEncounter[] = [];
  for (const f of readdirSync(join(ROOT, 'content/quests')).filter((x) => /^0\d-.*\.quests\.json$/.test(x)).sort()) {
    const chapter = chapterOfFile(f);
    const data = JSON.parse(readFileSync(join(ROOT, 'content/quests', f), 'utf8')) as { quests: { id: string; objectives: { id: string; spawn?: Record<string, unknown>[] }[] }[] };
    for (const q of data.quests)
      for (const o of q.objectives)
        (o.spawn ?? []).forEach((s, i) => {
          const kind = String(s.kind);
          const boss = s.boss === true || BOSSES.has(kind);
          out.push({
            id: `${q.id}.${o.id}${i ? `.${i}` : ''}`,
            chapter,
            build: buildOf(chapter),
            boss,
            first: false,
            enc: { kind, count: Number(s.count ?? 1), tier: Number(s.tier ?? (boss ? 1 : CHAPTER_TIER[chapter])), era: String(s.era), extra: extra(s, q.id) },
          });
        });
  }
  const walk = (x: unknown, at: string, chapter: string): void => {
    if (Array.isArray(x)) for (const v of x) walk(v, at, chapter);
    else if (x && typeof x === 'object') {
      const a = x as Record<string, unknown>;
      if (a.do === 'enemy' && a.op === 'spawn' && typeof a.kind === 'string' && !out.some((e) => e.id === `${at}.${String(a.group)}`)) {
        const boss = a.boss === true || BOSSES.has(a.kind);
        out.push({ id: `${at}.${String(a.group)}`, chapter, build: buildOf(chapter), boss, first: false, enc: { kind: a.kind, count: Number(a.count ?? 1), tier: Number(a.tier ?? 1), era: String(a.era), extra: extra(a) } });
      }
      for (const v of Object.values(a)) walk(v, at, chapter);
    }
  };
  for (const f of readdirSync(join(ROOT, 'content/story')).filter((x) => /^0\d-.*\.story\.json$/.test(x)).sort()) {
    const chapter = chapterOfFile(f);
    const data = JSON.parse(readFileSync(join(ROOT, 'content/story', f), 'utf8')) as { beats: { id: string }[] };
    for (const b of data.beats) walk(b, `${chapter}:${b.id}`, chapter);
  }
  // the chapter's first regular fight on the main path (docs/ACTION-RPG.md §11)
  for (const id of FIRST) {
    const e = out.find((x) => x.id === id);
    if (e) e.first = true;
  }
  return out;
}

/** The first regular fight of each chapter on the main path. */
export const FIRST = ['q.k1.registratur.briefe', 'q.k2.spur.streuner', 'q.k3.nachmittag.schatten', 'q.k4.karren.fresser'];
