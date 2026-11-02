/**
 * Campaign content (content/packs/*.pack.json, transcribed from content/bible): validity, solvability
 * with story flags, decoys, codex completeness, hints, trigger events and clue placement.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { gameBounds, loadPacks } from '../scripts/validate-content';
import type { Clue, ContentPack } from '../src/content/types';
import { validateContent } from '../src/content/validate';

const ROOT = new URL('..', import.meta.url).pathname;
const { packs: allPacks, parseErrors } = loadPacks(ROOT);
const packs = allPacks.filter((p) => p.file.startsWith('content/packs/'));
const merged = <K extends keyof ContentPack>(k: K) => packs.flatMap((p) => (p.pack[k] ?? []) as NonNullable<ContentPack[K]> & unknown[]);
const clues = merged('clues') as Clue[];
const cases = merged('cases') as NonNullable<ContentPack['cases']>;
const facts = merged('facts') as NonNullable<ContentPack['facts']>;
const dialogue = merged('dialogue') as NonNullable<ContentPack['dialogue']>;
const hints = merged('hints') as NonNullable<ContentPack['hints']>;

/** Chapter order; clue.chapter and case ids (case.<chapter>) use these ids. */
const CHAPTERS = ['p', 'k1', 'k2', 'k3', 'k4'];
/** Flags set by story systems, not by clues (see the hand-off notes). */
const STORY_FLAGS = new Set([
  'flag.k3_teil_b', // ch. 3 part B opens after 6 chapter nouns or the 1st confirmation
  'flag.k4_finale', // ch. 4 finale opens with the 2nd confirmation
  'flag.k2_tor', // ch. 2 choice at the gate: leuchten / dunkel
  'flag.k3_objekt', // ch. 3 rescued object: tuergriff / dukat / uhr / nichts
]);
/** Events from src/core/events.ts and src/systems/contracts.ts plus the custom events of the campaign. */
const KNOWN_EVENTS = new Set([
  'game:start', 'era:change', 'scan:mode', 'player:caught', 'hub:enter', 'hub:leave',
  'story:chapter', 'story:beat', 'story:ending', 'hunt:alert', 'hunt:horn', 'lantern:oil', 'lantern:empty',
  'clue:found', 'echo:start', 'echo:end', 'chronik:batch', 'chronik:case-complete', 'codex:unlocked', 'oblivion:progress',
  // custom (documented in the hand-off): NPC conversation topics, barks, epilogue blocks
  'npc:talk', 'bark:idle', 'bark:enter-fire', 'bark:npc-near', 'epilog:line',
]);
const INTACT = new Set(['1789', '1793-02', '1793-07']);

/** Simulates a full playthrough: finds every clue whose requirements (clues, flags) are met. */
function playthrough(maxChapter = CHAPTERS.length - 1) {
  const pool = clues.filter((c) => CHAPTERS.indexOf(c.chapter ?? '') <= maxChapter);
  const found = new Set<string>();
  const flags = new Set(STORY_FLAGS);
  const nouns = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of pool) {
      if (found.has(c.id)) continue;
      if (!(c.requires?.clues ?? []).every((r) => found.has(r))) continue;
      if (!(c.requires?.flags ?? []).every((f) => flags.has(f))) continue;
      found.add(c.id);
      c.reveals.nouns?.forEach((n) => nouns.add(n));
      c.reveals.flags?.forEach((f) => flags.add(f));
      grew = true;
    }
  }
  return { found, flags, nouns, pool };
}

describe('campaign packs', () => {
  it('parse and validate with zero errors', () => {
    expect(parseErrors).toEqual([]);
    expect(packs.length).toBeGreaterThanOrEqual(9);
    const r = validateContent(allPacks, { bounds: gameBounds(ROOT) });
    expect(r.errors.map((e) => `${e.file} [${e.id}] ${e.message}`)).toEqual([]);
    // campaign packs themselves produce no warnings
    expect(r.warnings.filter((w) => w.file.startsWith('content/packs/')).map((w) => `${w.id}: ${w.message}`)).toEqual([]);
  });

  it('has 40 codex cards, 8 relief patterns and a label on every fact', () => {
    const codex = packs.find((p) => p.file.endsWith('codex.pack.json'))!.pack.facts!;
    expect(codex.filter((f) => /^cx\.\d\d$/.test(f.id))).toHaveLength(40);
    const rm = codex.filter((f) => f.id.startsWith('rm.'));
    expect(rm).toHaveLength(8);
    expect(rm.every((f) => f.tags?.includes('reliefmuster'))).toBe(true);
    for (const f of facts) expect(f.tags?.some((t) => /^label:(FAKT|STRITTIG|LEGENDE|FIKTION)$/.test(t)), f.id).toBe(true);
  });

  it('every clue has a chapter and every story flag a source', () => {
    for (const c of clues) expect(CHAPTERS, c.id).toContain(c.chapter);
    const revealed = new Set(clues.flatMap((c) => c.reveals.flags ?? []));
    const readingFlags = new Set(cases.flatMap((cs) => cs.entries.map((e) => e.flag).filter(Boolean)));
    for (const c of clues) for (const f of c.requires?.flags ?? []) expect(revealed.has(f) || STORY_FLAGS.has(f), `${c.id} requires ${f}`).toBe(true);
    for (const d of dialogue) {
      const f = d.trigger.flag as string | undefined;
      if (f) expect(revealed.has(f) || STORY_FLAGS.has(f) || readingFlags.has(f), `${d.id} uses ${f}`).toBe(true);
    }
  });

  it('every clue can be found in a playthrough (requires clues and flags)', () => {
    const { found } = playthrough();
    expect(clues.filter((c) => !found.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it('every case is solvable from its own and earlier chapters, and every decoy noun is obtainable', () => {
    for (const cs of cases) {
      const ch = CHAPTERS.indexOf(cs.id.replace(/^case\./, ''));
      expect(ch, cs.id).toBeGreaterThanOrEqual(0);
      const { nouns } = playthrough(ch);
      for (const e of cs.entries)
        for (const b of e.blanks) {
          const where = `${e.id}/${b.id}`;
          if (e.kind === 'fact') {
            expect(nouns.has(b.correct!), `${where}: correct ${b.correct}`).toBe(true);
            for (const a of b.alsoCorrect ?? []) expect(nouns.has(a), `${where}: alsoCorrect ${a}`).toBe(true);
          }
          expect(b.accepts?.length, `${where}: accepts`).toBeGreaterThanOrEqual(2);
          for (const a of b.accepts ?? []) expect(nouns.has(a), `${where}: decoy/option ${a} not obtainable by chapter ${cs.id}`).toBe(true);
        }
      expect(cs.entries.filter((e) => e.kind === 'fact').length % 3, `${cs.id}: fact entries in batches of three`).toBe(0);
      for (const e of cs.entries.filter((x) => x.kind === 'reading')) expect(e.flag, `${e.id}: reading flag`).toMatch(/^flag\./);
    }
  });

  it('has three escalating hints per case', () => {
    for (const cs of cases) {
      const hs = hints.filter((h) => h.caseId === cs.id).sort((a, b) => a.level - b.level);
      expect(hs.map((h) => h.level), cs.id).toEqual([1, 2, 3]);
      for (let i = 1; i < hs.length; i++) expect(hs[i]!.afterSeconds!).toBeGreaterThan(hs[i - 1]!.afterSeconds!);
    }
  });

  it('dialogue triggers use known events', () => {
    for (const d of dialogue) expect(KNOWN_EVENTS, `${d.id}: ${d.trigger.event}`).toContain(d.trigger.event);
    // trigger references to clues point at existing clues
    const clueIds = new Set(clues.map((c) => c.id));
    for (const d of dialogue)
      if (['clue:found', 'echo:start', 'echo:end'].includes(d.trigger.event) && typeof d.trigger.id === 'string')
        expect(clueIds.has(d.trigger.id), `${d.id} -> ${d.trigger.id}`).toBe(true);
  });
});

// ---- placement against the prepared terrain and palace data
const dataDir = `${ROOT}public/data`;
const meta = JSON.parse(readFileSync(`${dataDir}/terrain/meta.json`, 'utf8'));
const ground = new Uint8Array(inflateSync(readFileSync(`${dataDir}/terrain/ground.u8.deflate`)));
const WATER = 5;
const rooms = JSON.parse(readFileSync(`${dataDir}/palace/rooms.json`, 'utf8')).rooms as { roomId: string; polygon: [number, number][] }[];
const buildings = JSON.parse(readFileSync(`${dataDir}/palace/footprints.json`, 'utf8')).buildings as { id: string; ring: [number, number][] }[];

const groundAt = (x: number, z: number) => {
  const c = Math.round((x - meta.origin.x) / meta.cell);
  const r = Math.round((z - meta.origin.z) / meta.cell);
  return ground[r * meta.cols + c];
};
function inRing(x: number, z: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToRing(x: number, z: number, ring: [number, number][]) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j]!;
    const [bx, bz] = ring[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return d;
}

describe('campaign clue placement', () => {
  const M = 6; // walkable margin inside the terrain extent
  const e = meta.extentLocal;

  it('all clues lie inside the walkable area and not in water', () => {
    for (const c of clues) {
      const { x, z } = c.where;
      expect(x > e.x0 + M && x < e.x1 - M && z > e.z0 + M && z < e.z1 - M, `${c.id} (${x}, ${z}) outside walkable area`).toBe(true);
      expect(groundAt(x, z), `${c.id} (${x}, ${z}) is in water`).not.toBe(WATER);
    }
  });

  it('room-anchored clues lie inside their room polygon', () => {
    const byId = new Map(rooms.map((r) => [r.roomId, r]));
    const roomClues = clues.filter((c) => c.where.anchor && byId.has(c.where.anchor));
    expect(roomClues.length).toBeGreaterThan(0);
    for (const c of roomClues) expect(inRing(c.where.x, c.where.z, byId.get(c.where.anchor!)!.polygon), c.id).toBe(true);
  });

  it('clues inside solid footprints (intact eras) are interior room clues or reachable from outside', () => {
    const roomIds = new Set(rooms.map((r) => r.roomId));
    for (const c of clues) {
      const eras = Array.isArray(c.where.era) ? c.where.era : [c.where.era];
      if (!eras.some((x) => INTACT.has(x))) continue;
      for (const b of buildings) {
        if (!inRing(c.where.x, c.where.z, b.ring)) continue;
        const interior = !!c.where.anchor && roomIds.has(c.where.anchor);
        const reachable = c.where.radius > distToRing(c.where.x, c.where.z, b.ring) + 0.5;
        expect(interior || reachable, `${c.id} is inside ${b.id} but neither a room clue nor reachable from outside`).toBe(true);
      }
    }
  });
});
