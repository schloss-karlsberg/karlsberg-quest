/**
 * The party after every ending (bible 06-enden §8, beat e3 of content/story/05-enden.story.json),
 * headless on the story engine: e2 ends on `story.party`, e3 builds the party for the chosen ending
 * (cue bridge `party:set`), plays Gerold's speech and rolls the credits (`party:credits`), speaks
 * one short line per `party:spotlight`, and ends on `story.credits` (set by the story system on
 * `credits:done`), placing the guide and the doubles for one post-game line each.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPOT_LAST, SPOT_ROUND } from '../src/systems/party/placements';
import { type RunOptions, type StoryEnv, type StorySlice, StoryEngine, createStorySlice } from '../src/systems/story/engine';
import type { Action, FlagValue, NpcAction, StoryFile } from '../src/systems/story/types';
import type { ContentPack } from '../src/content/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = <T>(p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8')) as T;
const ENDEN = json<StoryFile>('content/story/05-enden.story.json');
const PARTY = json<ContentPack>('content/packs/party.pack.json');
const SPEAKERS = new Set([...(json<ContentPack>('content/packs/speakers.pack.json').speakers ?? []), ...(PARTY.speakers ?? [])].map((s) => s.id));

function env(flags: Record<string, FlagValue>): StoryEnv {
  return {
    era: 'today',
    x: 1200,
    z: -1095,
    flags,
    inventory: { clues: [], nouns: [], items: [] },
    chronik: {},
    scan: 0,
    map: false,
    stance: 'stand',
    lantern: false,
    caseFacts: () => null,
  };
}

function run(at: string, flags: Record<string, FlagValue>) {
  let slice: StorySlice = createStorySlice();
  const runs: { src: string; actions: Action[] }[] = [];
  const engine = new StoryEngine([ENDEN], () => slice, {
    run: (actions: Action[], o: RunOptions) => runs.push({ src: o.source, actions }),
    chapterEntered: () => {},
    beatEntered: () => {},
    chapterCompleted: () => {},
  });
  engine.goto('enden', at);
  const tick = () => engine.tick(0.1, env(flags));
  tick();
  const all = () => runs.flatMap((r) => r.actions);
  const cues = () => all().filter((a): a is Extract<Action, { do: 'cue' }> => a.do === 'cue');
  const says = () => all().filter((a): a is Extract<Action, { do: 'say' }> => a.do === 'say');
  return { engine, runs, tick, slice: () => slice, all, cues, says, flags };
}

const VARIANTS = [
  { flag: 'museum', variant: 'museum', speech: 'imhoff.end.museum_1', laub: null },
  { flag: 'verbrennen', variant: 'burn', speech: 'imhoff.end.verbrennen_1', laub: 'laub.end.fest_verbrennen' },
  { flag: 'behalten', variant: 'keep', speech: 'imhoff.end.behalten', laub: 'laub.end.fest_behalten' },
] as const;

describe('beat e2 → e3: the epilogue button hands over to the party', () => {
  it('e2 completes on the flag story.party (set by the epilogue button), e3 follows', () => {
    const r = run('e2', { 'flag.end': 'museum' });
    expect(r.slice().beat).toBe('e2');
    r.flags['story.party'] = 'museum';
    r.tick();
    expect(r.slice().beat).toBe('e3');
  });

  it('e1 clears a party on entry and on resume („Ende noch einmal wählen“)', () => {
    const e1 = ENDEN.beats.find((b) => b.id === 'e1')!;
    const clear = e1.enter?.find((a) => a.do === 'cue' && a.id === 'party:clear');
    expect(clear?.onResume).toBe(true);
  });
});

describe('beat e3: the party for each ending', () => {
  for (const v of VARIANTS) {
    it(`${v.flag}: dusk at the plateau, party:set ${v.variant}, Gerold's speech, then party:credits`, () => {
      const r = run('e3', { 'flag.end': v.flag });
      const enter = r.all();
      expect(enter.some((a) => a.do === 'look' && a.time === 'dusk')).toBe(true);
      expect(enter.some((a) => a.do === 'teleport' && Math.hypot(a.x - 1200, a.z + 1095) < 1)).toBe(true);
      const cues = r.cues();
      expect(cues.filter((c) => c.id === 'party:set').map((c) => c.data?.variant)).toEqual([v.variant]);
      const credits = cues.filter((c) => c.id === 'party:credits');
      expect(credits).toHaveLength(1);
      expect(credits[0]?.data?.lines).toBeUndefined();
      // the credits roll after the speech: the cue is the last action of the variant's reaction
      const reaction = r.runs.find((x) => x.actions.some((a) => a.do === 'cue' && a.id === 'party:set'))!;
      expect(reaction.actions.at(-1)).toMatchObject({ do: 'cue', id: 'party:credits' });
      const ids = r.says().map((s) => s.id);
      expect(ids).toContain('imhoff.end.ankunft');
      expect(ids).toContain(v.speech);
      // Laub at the party: A silent, B fading, C one sentence (§8.4)
      const laub = r.says().filter((s) => s.speaker === 'laub');
      expect(laub.map((s) => s.id)).toEqual(v.laub ? [v.laub] : []);
      for (const s of r.says()) expect(SPEAKERS.has(s.speaker!), s.speaker).toBe(true);
    });
  }

  it('one short line per spotlight (9 holds of ~2.2 s), Mats per ending, Gerold last', () => {
    for (const v of VARIANTS) {
      const r = run('e3', { 'flag.end': v.flag });
      const before = r.says().length;
      const order = [...SPOT_ROUND, SPOT_LAST];
      order.forEach((who, i) => {
        r.engine.onEvent('party:spotlight', { who, i });
        r.tick();
      });
      const lines = r.says().slice(before);
      expect(lines).toHaveLength(order.length);
      for (const l of lines) {
        expect(SPEAKERS.has(l.speaker!), l.speaker).toBe(true);
        // readable inside one hold
        expect(l.text!.length, l.text).toBeLessThanOrEqual(46);
        expect(l.ms).toBeLessThanOrEqual(2600);
      }
      expect(lines.map((l) => l.speaker)).toEqual(['herzogd', 'mannd', 'hanned', 'peterd', 'jostd', 'solld', 'liesed', 'mats', 'imhoff']);
      expect(lines[7]!.text).toBe(v.flag === 'museum' ? 'Mein Kompass zeigt jetzt richtig!' : 'Mein Kompass zeigt wieder komisch.');
    }
  });

  it('a spotlight that does not match plays nothing', () => {
    const r = run('e3', { 'flag.end': 'museum' });
    const before = r.says().length;
    r.engine.onEvent('party:spotlight', { who: 'extra.4', i: 3 });
    r.tick();
    expect(r.says().length).toBe(before);
  });

  it('completes on story.credits (credits:done): the guide and the doubles stay talkable, combat back, ending C opens Q', () => {
    const r = run('e3', { 'flag.end': 'behalten' });
    expect(r.slice().beat).toBe('e3');
    r.engine.onEvent('credits:done', { skipped: false });
    r.flags['story.credits'] = true;
    r.tick();
    expect(r.slice().active).toBe(false);
    expect(r.slice().completed).toContain('enden');
    const npcs = r.all().filter((a): a is NpcAction => a.do === 'npc' && a.op === 'spawn');
    expect(npcs.map((n) => n.npc).sort()).toEqual(['hanned', 'herzogd', 'imhoff', 'jostd', 'liesed', 'mannd', 'peterd', 'solld']);
    // one post-game line each (the npc system plays npc:talk greet lines of chapter 'enden')
    for (const n of npcs) {
      const greet = (PARTY.dialogue ?? []).filter((d) => d.trigger.event === 'npc:talk' && d.trigger.npc === n.npc && d.trigger.chapter === 'enden' && d.trigger.topic === 'greet');
      expect(greet, n.npc).toHaveLength(1);
      expect(n.era).toBe('today');
    }
    expect(r.all().some((a) => a.do === 'flag' && a.set['combat.disabled'] === false)).toBe(true);
    expect(r.all().some((a) => a.do === 'flag' && a.set['shift.allowed'] === true)).toBe(true);
  });

  it('a resume after the credits ended does not rebuild the party or roll them again', () => {
    const r = run('e3', { 'flag.end': 'museum', 'story.credits': true });
    expect(r.cues().filter((c) => c.id === 'party:set' || c.id === 'party:credits')).toEqual([]);
  });
});
