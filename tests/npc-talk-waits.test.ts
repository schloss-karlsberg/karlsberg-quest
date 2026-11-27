/**
 * A person takes E only while it has something to say (TASK-076, `hasWords` in
 * src/systems/npc/logic.ts). So a beat or a reaction that waits for a talk (`talked`, or a
 * conversation event) must not wait for someone who has nothing to say then: that would be a
 * soft-lock. Checked for every beat `complete` and every `on[].when` of the tour and the chapters,
 * with the flags the beat's own `enter` sets.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TriggerFlag } from '../src/content/triggers';
import type { ContentPack, DialogueLine } from '../src/content/types';
import { hasWords, talkLines } from '../src/systems/npc/logic';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => JSON.parse(readFileSync(`${ROOT}${path}`, 'utf8')) as unknown;
const LINES: DialogueLine[] = readdirSync(`${ROOT}content/packs`)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => (read(`content/packs/${f}`) as ContentPack).dialogue ?? [])
  .filter((l) => l.trigger.event === 'npc:talk');

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

function* objects(v: unknown): Generator<Json> {
  if (Array.isArray(v)) for (const x of v) yield* objects(x);
  else if (isObj(v)) {
    yield v;
    for (const x of Object.values(v)) yield* objects(x);
  }
}

/** Flags a beat's `enter` sets to a truthy value (the talk can depend on them). */
function enterFlags(beat: Json): Record<string, TriggerFlag> {
  const out: Record<string, TriggerFlag> = {};
  for (const o of objects(beat.enter)) {
    if (o.do !== 'flag' || !isObj(o.set)) continue;
    for (const [k, v] of Object.entries(o.set)) if (v !== null && v !== false && v !== undefined) out[k] = v as TriggerFlag;
  }
  return out;
}

interface Wait { npc: string; chapter?: string; topic?: string }

/** The talk waits of a condition that block it: `all` needs each, `any` only one; a branch without a talk wait never blocks. */
function blockingWaits(cond: unknown): Wait[][] {
  if (!isObj(cond)) return [];
  if (Array.isArray(cond.all)) return cond.all.flatMap(blockingWaits);
  if (Array.isArray(cond.any)) {
    const branches = cond.any.map(blockingWaits);
    // one branch with no talk wait (a timer, a flag, …) is a way out
    return branches.some((b) => b.length === 0) ? [] : [branches.flat().flat()];
  }
  if (isObj(cond.talked) && typeof cond.talked.npc === 'string') return [[cond.talked as unknown as Wait]];
  if (cond.event === 'npc:conversation' && isObj(cond.match) && typeof cond.match.npc === 'string' && cond.match.open === false) return [[{ npc: cond.match.npc }]];
  return [];
}

describe('beats that wait for a talk (TASK-076)', () => {
  const stories = readdirSync(`${ROOT}content/story`).filter((f) => f.endsWith('.story.json') && !f.startsWith('99-'));

  it('only wait for someone who has something to say then', () => {
    const problems: string[] = [];
    let checked = 0;
    for (const file of stories) {
      const story = read(`content/story/${file}`) as Json;
      const chapterOf = new Map<string, Set<string>>();
      const eraOf = new Map<string, string>();
      for (const o of objects(story)) {
        if (o.do !== 'npc' || o.op !== 'spawn' || typeof o.npc !== 'string') continue;
        const set = chapterOf.get(o.npc) ?? new Set<string>();
        set.add(String(o.chapter ?? story.chapter));
        chapterOf.set(o.npc, set);
        if (typeof o.era === 'string' && !eraOf.has(o.npc)) eraOf.set(o.npc, o.era);
      }
      const conditions: { where: string; cond: unknown; flags: Record<string, TriggerFlag> }[] = [];
      const reactions = (owner: Json, where: string, flags: Record<string, TriggerFlag>) => {
        for (const r of Array.isArray(owner.on) ? owner.on : []) if (isObj(r)) conditions.push({ where: `${where} on ${String(r.id ?? '?')}`, cond: r.when, flags });
      };
      reactions(story, 'story', {});
      for (const beat of Array.isArray(story.beats) ? story.beats.filter(isObj) : []) {
        const flags = enterFlags(beat);
        conditions.push({ where: String(beat.id), cond: beat.complete, flags });
        reactions(beat, String(beat.id), flags);
      }
      for (const { where, cond, flags } of conditions) {
        for (const group of blockingWaits(cond)) {
          checked++;
          // a group is met when one of its waits can happen
          const ok = group.some((w) => {
            // a wait for one topic: whenever that topic is in the menu, the person offers E
            if (w.topic) return true;
            const chapters = w.chapter ? [w.chapter] : [...(chapterOf.get(w.npc) ?? [String(story.chapter)])];
            return chapters.some((chapter) => {
              const lines = talkLines(LINES, w.npc, chapter);
              const c = { era: eraOf.get(w.npc) ?? String(story.era ?? ''), flags, chapter, beat: where, clues: [] };
              return hasWords(lines, w.npc, chapter, c, new Set(), 0);
            });
          });
          if (!ok) problems.push(`${file} ${where}: waits for a talk with ${group.map((w) => w.npc).join(' / ')}, who has nothing to say then`);
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
    expect(problems).toEqual([]);
  });

  it('the check sees a wait for someone with nothing to say', () => {
    const silentAfter = [{ id: 'x.greet', speaker: 'x', text_de: 'Hallo.', trigger: { event: 'npc:talk', npc: 'x', chapter: 'c', topic: 'greet', flag: 'x.ready' } }] as DialogueLine[];
    const c = { era: 'today', flags: {}, chapter: 'c', beat: 'b', clues: [] };
    expect(hasWords(silentAfter, 'x', 'c', c, new Set(), 0)).toBe(false);
    expect(hasWords(silentAfter, 'x', 'c', { ...c, flags: { 'x.ready': true } }, new Set(), 0)).toBe(true);
    expect(blockingWaits({ any: [{ talked: { npc: 'x' } }, { timer: 60 }] })).toEqual([]);
    expect(blockingWaits({ all: [{ flag: 'f' }, { talked: { npc: 'x' } }] })).toEqual([[{ npc: 'x' }]]);
    expect(blockingWaits({ event: 'npc:conversation', match: { npc: 'x', open: false } })).toEqual([[{ npc: 'x' }]]);
  });
});
