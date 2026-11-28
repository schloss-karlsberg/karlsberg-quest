/**
 * Forage (TASK-090, docs/ACTION-RPG.md §7.1): the pure rules. A thrown chestnut's aim, arc and
 * bounces, what leaves the pack, what a cut plant drops, how cut plants grow back, and the save.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, deserializeState, serializeState } from '../src/core/state';
import { DROP, NUT, THROW, arcPoints, clampAim, createForageSlice, createNut, deflectNut, dropChance, flightTime, mowCircle, normalizeForage, plantKey, rollDrop, solveThrow, stepNut } from '../src/systems/forage/logic';
import { ProgressionCore, createProgressionSlice } from '../src/systems/progression/logic';
import { itemDef } from '../src/rpg/items';
import { CUT, PlantCuts, cutFactor } from '../src/world/vegetation/cuts';

const DT = 1 / 60;
const flat = () => 0;
const dry = () => false;

describe('throwing a chestnut: the arc', () => {
  it('lands where it was aimed, near or far, uphill or down', () => {
    for (const to of [{ x: 3, y: 0, z: -2 }, { x: -9, y: 2.5, z: 11 }, { x: 0, y: -3, z: -21 }]) {
      const from = { x: 0, y: 1.45, z: 0 };
      const v = solveThrow(from, to);
      const n = createNut(from, v);
      const ground = (x: number, z: number) => (Math.hypot(x - to.x, z - to.z) < 0.6 ? to.y - THROW.radius : -99);
      let ev = null;
      for (let i = 0; i < 300 && !ev; i++) ev = stepNut(n, DT, ground, dry);
      expect(ev, JSON.stringify(to)).toBe('bounce');
      expect(Math.hypot(n.x - to.x, n.z - to.z)).toBeLessThan(0.35);
      expect(n.age).toBeCloseTo(v.t, 1);
    }
  });

  it('is a readable lob: longer in the air the farther it goes, always rising first', () => {
    expect(flightTime(2)).toBeLessThan(flightTime(10));
    expect(flightTime(10)).toBeLessThan(flightTime(22));
    expect(flightTime(0)).toBeGreaterThanOrEqual(0.55);
    expect(flightTime(500)).toBeLessThanOrEqual(1.25);
    const from = { x: 0, y: 1.45, z: 0 };
    for (const d of [2, 8, 22]) expect(solveThrow(from, { x: d, y: 0, z: 0 }).vy).toBeGreaterThan(0);
    // the preview draws the same arc and ends on the target
    const to = { x: 6, y: 0.4, z: -8 };
    const v = solveThrow(from, to);
    const pts = new Float32Array(20 * 3);
    arcPoints(from, v, v.t, 20, pts);
    expect(pts[57]).toBeCloseTo(to.x, 4);
    expect(pts[58]).toBeCloseTo(to.y, 4);
    expect(pts[59]).toBeCloseTo(to.z, 4);
    expect(Math.max(...Array.from({ length: 20 }, (_, i) => pts[i * 3 + 1]!))).toBeGreaterThan(from.y);
  });

  it('keeps the landing point between 2 and 22 m', () => {
    const from = { x: 10, y: 1.4, z: 10 };
    const far = clampAim(from, { x: 110, y: 0, z: 10 });
    expect(far.x - from.x).toBeCloseTo(THROW.range, 5);
    const near = clampAim(from, { x: 10.2, y: 0, z: 10 });
    expect(Math.hypot(near.x - from.x, near.z - from.z)).toBeCloseTo(THROW.minRange, 5);
    expect(clampAim(from, { x: 15, y: 0, z: 12 })).toEqual({ x: 15, y: 0, z: 12 });
    // straight down at the feet: still a throw, forward
    const feet = clampAim(from, { x: 10, y: 0, z: 10 });
    expect(Math.hypot(feet.x - from.x, feet.z - from.z)).toBeCloseTo(THROW.minRange, 5);
  });

  it('bounces, lies still for a moment and is gone', () => {
    const n = createNut({ x: 0, y: 1.45, z: 0 }, solveThrow({ x: 0, y: 1.45, z: 0 }, { x: 8, y: 0, z: 0 }));
    const evs: string[] = [];
    for (let i = 0; i < 600 && n.alive; i++) {
      const ev = stepNut(n, DT, flat, dry);
      if (ev) evs.push(ev);
    }
    expect(evs[0]).toBe('bounce');
    expect(evs.filter((e) => e === 'bounce').length).toBeLessThanOrEqual(THROW.bounces);
    expect(evs.at(-1)).toBe('gone');
    expect(evs).toContain('rest');
    expect(n.alive).toBe(false);
    // it rolled on a little past the first landing, not back
    expect(n.x).toBeGreaterThan(8);
    expect(n.x).toBeLessThan(12);
    expect(n.age).toBeLessThan(THROW.life);
  });

  it('water swallows it; a trunk turns it back and spends it', () => {
    const wet = createNut({ x: 0, y: 1.45, z: 0 }, solveThrow({ x: 0, y: 1.45, z: 0 }, { x: 5, y: 0, z: 0 }));
    let ev = null;
    for (let i = 0; i < 300 && !ev; i++) ev = stepNut(wet, DT, flat, () => true);
    expect(ev).toBe('splash');
    expect(wet.alive).toBe(false);

    const n = createNut({ x: 0, y: 1.2, z: 0 }, { vx: 9, vy: 2, vz: 0 });
    deflectNut(n, 1, 0);
    expect(n.vx).toBeLessThan(0);
    expect(Math.abs(n.vx)).toBeLessThan(9 * 0.3);
    expect(n.spent).toBe(true);
    // moving away already: left alone
    const away = createNut({ x: 0, y: 1.2, z: 0 }, { vx: -4, vy: 0, vz: 0 });
    deflectNut(away, 1, 0);
    expect(away.vx).toBe(-4);
  });
});

describe('one chestnut leaves the pack per throw', () => {
  function core() {
    const slice = createProgressionSlice();
    const emitted: string[] = [];
    const c = new ProgressionCore(() => slice, {
      emit: (type) => emitted.push(type),
      item: (id) => itemDef(id),
      setMembers: () => [],
      statOptions: () => ({ gentle: false, rauhnacht: false }),
      setLevelFlag: () => {},
    });
    return { c, slice, emitted };
  }

  it('remove takes what is there, deletes the last one and uses nothing up', () => {
    const { c, slice, emitted } = core();
    expect(c.remove(NUT)).toBe(0);
    c.grantItem(NUT, 3);
    emitted.length = 0;
    expect(c.remove(NUT)).toBe(1);
    expect(c.count(NUT)).toBe(2);
    expect(c.remove(NUT, 5)).toBe(2);
    expect(slice.inventory[NUT]).toBeUndefined();
    expect(c.remove(NUT)).toBe(0);
    // no item:use: a chestnut is not a consumable (combat applies nothing, no quick-slot pulse)
    expect(emitted).toEqual([]);
    expect(itemDef(NUT)).toMatchObject({ kind: 'collectible', stack: 99 });
  });
});

describe('what a cut plant drops', () => {
  it('the chance starts at a tenth, grows with every empty plant up to the cap, and is halved outside the forest', () => {
    expect(dropChance(0)).toBeCloseTo(DROP.chance, 6);
    expect(dropChance(2)).toBeCloseTo(DROP.chance + 2 * DROP.dryStep, 6);
    expect(dropChance(100)).toBeCloseTo(DROP.chance + DROP.dryMax, 6);
    expect(dropChance(0, 0.2)).toBeCloseTo(DROP.chance * DROP.open, 6);
    expect(dropChance(100, 1)).toBeLessThan(0.4);
  });

  it('is seeded: the same play finds the same chestnuts', () => {
    const play = () => {
      const s = createForageSlice();
      const out: boolean[] = [];
      for (let i = 0; i < 400; i++) out.push(rollDrop(s, plantKey(500 + i * 2.13, -700 + i * 1.7)));
      return { out, s };
    };
    const a = play();
    const b = play();
    expect(a.out).toEqual(b.out);
    expect(a.s).toEqual(b.s);
    // "sometimes": about one plant in five or six, and never a long drought
    const found = a.out.filter(Boolean).length;
    expect(a.s.found).toBe(found);
    expect(a.s.cuts).toBe(400);
    expect(found).toBeGreaterThan(400 * 0.13);
    expect(found).toBeLessThan(400 * 0.26);
    let run = 0;
    let longest = 0;
    for (const hit of a.out) {
      run = hit ? 0 : run + 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThan(30);
  });

  it('the same plant gives a different roll the next time it has grown back', () => {
    const s = createForageSlice();
    const key = plantKey(640.2, -612.4);
    const rolls = Array.from({ length: 60 }, () => rollDrop(s, key));
    expect(rolls.some(Boolean)).toBe(true);
    expect(rolls.some((r) => !r)).toBe(true);
    expect(plantKey(640.2, -612.4)).toBe(plantKey(640.21, -612.42));
    expect(plantKey(640.2, -612.4)).not.toBe(plantKey(642.2, -612.4));
  });
});

describe('cut plants grow back', () => {
  it('a stub, then two steps, then whole again after the regrow time', () => {
    expect(cutFactor(0)).toBe(CUT.stub);
    expect(cutFactor(CUT.regrow * 0.5)).toBe(CUT.stub);
    expect(cutFactor(CUT.regrow * 0.6)).toBe(0.45);
    expect(cutFactor(CUT.regrow * 0.9)).toBe(0.75);
    expect(cutFactor(CUT.regrow)).toBe(1);
  });

  it('the layers rebuild once per change: a cut, each step, the end', () => {
    const cuts = new PlantCuts();
    cuts.tick(10);
    expect(cuts.factorAt(5, 5)).toBe(1);
    const v0 = cuts.version;
    cuts.add(5, 5, 1.5);
    expect(cuts.version).toBe(v0 + 1);
    expect(cuts.factorAt(5.5, 5.5)).toBe(CUT.stub);
    expect(cuts.factorAt(7, 5)).toBe(1);
    // nothing changes between steps: no rebuild
    expect(cuts.tick(10 + CUT.regrow * 0.3)).toBe(false);
    expect(cuts.version).toBe(v0 + 1);
    expect(cuts.tick(10 + CUT.regrow * 0.56)).toBe(true);
    expect(cuts.factorAt(5, 5)).toBe(0.45);
    expect(cuts.tick(10 + CUT.regrow * 0.81)).toBe(true);
    expect(cuts.factorAt(5, 5)).toBe(0.75);
    expect(cuts.tick(10 + CUT.regrow + 0.1)).toBe(true);
    expect(cuts.factorAt(5, 5)).toBe(1);
    expect(cuts.count).toBe(0);
    expect(cuts.version).toBe(v0 + 4);
  });

  it('overlapping cuts take the shorter one; the list is capped; a clock that ran back clears it', () => {
    const cuts = new PlantCuts();
    cuts.tick(0);
    cuts.add(0, 0, 2);
    cuts.tick(CUT.regrow * 0.6);
    cuts.add(1, 0, 2);
    expect(cuts.factorAt(0.5, 0)).toBe(CUT.stub);
    expect(cuts.factorAt(-1.5, 0)).toBe(0.45);
    for (let i = 0; i < CUT.max + 10; i++) cuts.add(100 + i * 5, 0, 1);
    expect(cuts.count).toBe(CUT.max);
    expect(cuts.factorAt(0.5, 0)).toBe(1);
    cuts.tick(1);
    expect(cuts.count).toBe(0);
  });

  it('a swing mows the half-disc ahead, a ring the whole disc', () => {
    // yaw 0 faces −z
    const light = mowCircle(10, 20, 0, 2.6, 70);
    expect(light.x).toBeCloseTo(10, 6);
    expect(light.z).toBeCloseTo(20 - 1.3, 6);
    expect(light.r).toBeCloseTo(1.3, 6);
    // nothing behind the player, the tip of the reach is in
    expect(Math.hypot(10 - light.x, 20.4 - light.z)).toBeGreaterThan(light.r);
    expect(Math.hypot(10 - light.x, 20 - 2.55 - light.z)).toBeLessThan(light.r);
    const east = mowCircle(0, 0, -Math.PI / 2, 3, 110);
    expect(east.x).toBeGreaterThan(1);
    expect(Math.abs(east.z)).toBeLessThan(1e-6);
    expect(mowCircle(4, 5, 1, 4.6, 360)).toEqual({ x: 4, z: 5, r: 4.6 });
  });
});

describe('the save', () => {
  it('round-trips the forage slice and the count; an older save without the slice loads', () => {
    const state = createInitialState();
    const prog = (state.systems.progression = createProgressionSlice());
    prog.inventory[NUT] = 7;
    state.systems.forage = { cuts: 41, dry: 3, found: 6, thrown: 9, hints: ['throw'] };
    const loaded = deserializeState(serializeState(state));
    expect(loaded.systems.forage).toEqual(state.systems.forage);
    expect(loaded.systems.progression?.inventory[NUT]).toBe(7);
    expect(normalizeForage(loaded.systems.forage)).toEqual(state.systems.forage);

    const old = createInitialState();
    old.systems.progression = createProgressionSlice();
    old.systems.progression.inventory[NUT] = 2;
    const again = deserializeState(serializeState(old));
    expect(again.systems.forage).toBeUndefined();
    expect(normalizeForage(again.systems.forage)).toEqual(createForageSlice());
    expect(again.systems.progression?.inventory[NUT]).toBe(2);
  });

  it('repairs a damaged slice field by field', () => {
    expect(normalizeForage({ cuts: 'x', dry: -4, found: 2.9, thrown: null, hints: ['cut', 3, 'cut'] })).toEqual({ cuts: 0, dry: 0, found: 2, thrown: 0, hints: ['cut'] });
    expect(normalizeForage(null)).toEqual(createForageSlice());
  });
});
