/**
 * Action-RPG content, track A (docs/ACTION-RPG.md §11.0–11.2): the prologue, chapter 1 and chapter 2
 * as quest chains. No quiz gates are left in their story files; every main quest is wired into the
 * beats; no stance cards (the epilogue reads deeds); the catalogue's codex facts are taught;
 * nothing spawns at a memorial; and the XP carries the player to the level targets.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/rpg/enemies';
import { levelForXp } from '../src/rpg/stats';
import { CODEX_XP } from '../src/systems/progression/logic';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = <T>(p: string): T => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8')) as T;

interface Obj {
  id: string;
  type: string;
  count?: number;
  enemy?: string;
  bonus_xp?: number;
  clue?: string;
  where?: { x: number; z: number; r?: number };
  spawn?: { kind: string; x: number; z: number; count?: number }[];
  place?: { x: number; z: number }[];
}
interface Quest {
  id: string;
  kind: 'main' | 'side';
  history?: { fact?: string; sources?: unknown[] }[];
  rewards?: { xp?: number; codex?: string[] };
  stance?: { flag: string; options: { value: string }[] };
  objectives: Obj[];
}
interface QuestFile {
  chapter: string;
  quests: Quest[];
}
type Json = Record<string, unknown>;

const CHAPTERS = [
  { id: 'prolog', story: 'content/story/00-prolog.story.json', quests: 'content/quests/00-prolog.quests.json', levels: [3, 3] },
  { id: 'k1', story: 'content/story/01-kapitel-1.story.json', quests: 'content/quests/01-kapitel-1.quests.json', levels: [5, 6] },
  { id: 'k2', story: 'content/story/02-kapitel-2.story.json', quests: 'content/quests/02-kapitel-2.quests.json', levels: [7, 8] },
] as const;
const data = CHAPTERS.map((c) => ({ ...c, s: json<Json>(c.story), q: json<QuestFile>(c.quests) }));

/** Every object in a JSON tree. */
function* walk(v: unknown): Generator<Json> {
  if (Array.isArray(v)) for (const x of v) yield* walk(x);
  else if (v && typeof v === 'object') {
    yield v as Json;
    for (const x of Object.values(v)) yield* walk(x);
  }
}
/** All conditions of a story file (beat `complete`, beat and chapter reaction `when`). */
function conditions(s: Json): unknown[] {
  const out: unknown[] = [];
  for (const r of (s.on as Json[] | undefined) ?? []) out.push(r.when);
  for (const b of s.beats as Json[]) {
    out.push(b.complete);
    for (const r of (b.on as Json[] | undefined) ?? []) out.push(r.when);
  }
  return out;
}

describe('Action-RPG content A: prologue, chapter 1, chapter 2', () => {
  it('no Chronik gates are left: no confirmed / caseComplete / reading conditions', () => {
    for (const d of data) {
      const keys = [...walk(conditions(d.s))].flatMap((o) => Object.keys(o));
      expect(keys.filter((k) => k === 'confirmed' || k === 'caseComplete' || k === 'reading'), d.id).toEqual([]);
      // nor actions that open the board or fill readings
      const actions = [...walk(d.s)].filter((o) => typeof o.do === 'string').map((o) => o.do);
      expect(actions.filter((a) => a === 'chronik' || a === 'readings'), d.id).toEqual([]);
    }
  });

  it('each chapter has at least four main quests and two to four side quests', () => {
    for (const d of data) {
      const main = d.q.quests.filter((q) => q.kind === 'main').length;
      const side = d.q.quests.filter((q) => q.kind === 'side').length;
      expect(main, d.id).toBeGreaterThanOrEqual(4);
      expect(side, d.id).toBeGreaterThanOrEqual(2);
      expect(side, d.id).toBeLessThanOrEqual(4);
    }
  });

  it('every main quest is offered or started by the story, and some beat waits on it', () => {
    for (const d of data) {
      const started = new Set([...walk(d.s)].filter((o) => o.do === 'quest' && (o.op === 'offer' || o.op === 'start')).map((o) => o.id as string));
      const waited = new Set([...walk(conditions(d.s))].filter((o) => o.quest && typeof o.quest === 'object').map((o) => (o.quest as Json).id as string));
      for (const q of d.q.quests.filter((x) => x.kind === 'main')) {
        expect(started.has(q.id), `${q.id} offered/started`).toBe(true);
        expect(waited.has(q.id), `${q.id} waited on`).toBe(true);
      }
    }
  });

  it('no stance cards: every side quest of the prologue, K1 and K2 is a deed the epilogue tells', () => {
    const S5 = json<{ epilogue: { readings: { deeds?: { flag: string }[] }[] } }>('content/story/05-enden.story.json');
    const PACK = json<{ dialogue: { trigger: { flag?: string } }[] }>('content/packs/enden.pack.json');
    const story = new Set(S5.epilogue.readings.flatMap((r) => (r.deeds ?? []).map((d) => d.flag)));
    const pack = new Set(PACK.dialogue.map((d) => d.trigger.flag).filter(Boolean));
    for (const d of data)
      for (const q of d.q.quests) {
        expect(q.stance, q.id).toBeUndefined();
        if (q.kind === 'side') {
          expect(story.has(`quest.${q.id}`), `${q.id} (story fallback)`).toBe(true);
          expect(pack.has(`quest.${q.id}`), `${q.id} (endings pack)`).toBe(true);
        }
      }
  });

  it('every codex fact of the catalogue (§11.0–11.2) is taught by a history line or a reward', () => {
    const doc = readFileSync(`${ROOT}docs/ACTION-RPG.md`, 'utf8');
    const part = doc.slice(doc.indexOf('### 11.0'), doc.indexOf('### 11.3'));
    const catalogue = new Set(part.match(/\b(?:cx|rm)\.\d+\b/g) ?? []);
    expect(catalogue.size).toBeGreaterThan(30);
    const taught = new Set(data.flatMap((d) => d.q.quests.flatMap((q) => [...(q.history ?? []).map((h) => h.fact), ...(q.rewards?.codex ?? [])])).filter(Boolean));
    expect([...catalogue].filter((f) => !taught.has(f))).toEqual([]);
    // facts are real: every one is in the codex pack
    const codex = new Set(json<{ facts: { id: string }[] }>('content/packs/codex.pack.json').facts.map((f) => f.id));
    expect([...taught].filter((f) => !codex.has(f!))).toEqual([]);
  });

  it('nothing spawns or lies at a memorial (quest objectives and story actions)', () => {
    const memorials = data.flatMap((d) => [...walk(d.s)].filter((o) => o.do === 'memorial' && typeof o.x === 'number').map((o) => ({ x: o.x as number, z: o.z as number, r: (o.r as number) ?? 20 })));
    expect(memorials.length).toBeGreaterThan(0); // the Rondell (k1)
    const pts: { what: string; x: number; z: number }[] = [];
    for (const d of data) {
      for (const q of d.q.quests)
        for (const o of q.objectives) {
          for (const s of o.spawn ?? []) pts.push({ what: `${q.id}.${o.id} spawn`, x: s.x, z: s.z });
          for (const p of o.place ?? []) pts.push({ what: `${q.id}.${o.id} pickup`, x: p.x, z: p.z });
          if (o.type === 'kill' && o.where) pts.push({ what: `${q.id}.${o.id} fight`, x: o.where.x, z: o.where.z });
        }
      for (const a of [...walk(d.s)].filter((o) => (o.do === 'enemy' && o.op === 'spawn') || o.do === 'loot'))
        if (typeof a.x === 'number') pts.push({ what: `${d.id} ${String(a.do)} ${String(a.group ?? a.id)}`, x: a.x, z: a.z as number });
    }
    for (const m of memorials) for (const p of pts) expect(Math.hypot(p.x - m.x, p.z - m.z), p.what).toBeGreaterThan(m.r + 40);
  });

  it('the XP carries the player to the level targets (prologue L3, chapter 1 L5–6, chapter 2 L7–8)', () => {
    const xpOf = new Map(ENEMIES.map((e) => [e.id, e.xp]));
    const seen = new Set<string>();
    let total = 0;
    for (const d of data) {
      for (const q of d.q.quests) {
        total += q.rewards?.xp ?? 0;
        for (const o of q.objectives) {
          total += o.bonus_xp ?? 0;
          if (o.type === 'kill' && o.enemy) total += (o.count ?? 1) * (xpOf.get(o.enemy) ?? 0);
        }
        for (const f of [...(q.history ?? []).map((h) => h.fact), ...(q.rewards?.codex ?? [])])
          if (f && !seen.has(f)) {
            seen.add(f);
            total += CODEX_XP;
          }
      }
      const lvl = levelForXp(total);
      expect(lvl, `${d.id}: ${total} XP`).toBeGreaterThanOrEqual(d.levels[0]);
      expect(lvl, `${d.id}: ${total} XP`).toBeLessThanOrEqual(d.levels[1]);
    }
  });

  it('every history line names its sources, except the fiction notes', () => {
    // cx.38 (what is invented) and cx.42 (the spring's memory, the 1789 Brunnenstube) are FIKTION cards
    const fiction = new Set(['cx.38', 'cx.42']);
    for (const d of data)
      for (const q of d.q.quests) for (const h of q.history ?? []) if (!fiction.has(h.fact ?? '')) expect((h.sources ?? []).length, `${q.id} ${h.fact}`).toBeGreaterThan(0);
  });
});
