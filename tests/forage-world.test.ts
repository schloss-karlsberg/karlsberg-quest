/**
 * Forage (TASK-090) against the other systems' rules: what a thrown chestnut does to an enemy,
 * to the pack and to the deer, where the staff may swing although fighting is off, the swing's
 * arc event, and the new key next to keys the player already bound.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, REBINDABLE, effectiveBindings, yieldNewDefaults } from '../src/player/input';
import { touchIconFor, touchName } from '../src/player/touchMap';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { DEER, createDeer, stepDeer } from '../src/systems/animals/deer';
import { COMBO, PELT, forageOnly, segmentHitsBody, upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, type SimEvent, type SimInput } from '../src/systems/combat/sim';
import { PathGraph } from '../src/systems/hunt/graph';
import type { PlayerSense } from '../src/systems/hunt/perception';
import { NOISE, type PackOptions, PackSim, type SimWorld } from '../src/systems/hunt/sim';

const DT = 1 / 60;

function input(o: Partial<SimInput> = {}): SimInput {
  return { x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: '1789', time: 'day', ...o };
}

function one(kind: string, o: Partial<EnemyGroupState> = {}) {
  const groups: Record<string, EnemyGroupState> = {};
  const stats = deriveStats({ level: 4, talents: {}, equipped: { weapon: 'item.stab.eisen', charms: [] } });
  const s = new CombatSim({ heightAt: () => 0 }, groups, { gentle: false, reducedMotion: false, stats, sweep: false, konter: false, waerme: false, dritter: false });
  upsertGroup(groups, { group: 'g', kind, era: '1789', x: 0, z: -8, count: 1, tier: 1, ...o });
  s.step(DT, input());
  const e = s.live()[0]!;
  return { s, e };
}

describe('a thrown chestnut and an enemy (CombatSim.pelt)', () => {
  it('stings a small body, wakes it and makes it flinch, at most once every few seconds', () => {
    const { s, e } = one('nebelling');
    const hp = e.hp;
    expect(s.pelt(e, 0, 0)).toBe('hit');
    expect(e.hp).toBe(hp - PELT.damage);
    expect(e.aggro).toBe(true);
    expect(e.state).toBe('stagger');
    const evs = s.step(DT, input());
    expect(evs.some((v) => v.type === 'hit' && v.damage === PELT.damage && !v.heavy)).toBe(true);
    // the next one right away stings but does not stagger again
    for (let t = 0; t < 1; t += DT) s.step(DT, input({ x: 0, z: 30 }));
    const before = e.state;
    expect(before).not.toBe('stagger');
    expect(s.pelt(e, 0, 0)).toBe('hit');
    expect(e.state).toBe(before);
    for (let t = 0; t < PELT.staggerEvery; t += DT) s.step(DT, input({ x: 0, z: 30 }));
    s.pelt(e, 0, 0);
    expect(e.state).toBe('stagger');
  });

  it('never ends an enemy: the last blow is the staff’s', () => {
    const { s, e } = one('nebelling');
    for (let i = 0; i < 40; i++) s.pelt(e, 0, 0);
    expect(e.hp).toBe(1);
    expect(s.live()).toContain(e);
    // a third of a first Hieb at most: no ranged way round a fight
    expect(PELT.damage).toBeLessThanOrEqual(4);
  });

  it('only glances off armour and bosses; mist lights let it through; nothing happens in a safe place', () => {
    const stone = one('steinfresser');
    const hp = stone.e.hp;
    expect(stone.s.pelt(stone.e, 0, 0)).toBe('glance');
    expect(stone.e.hp).toBe(hp - PELT.glance);
    expect(stone.e.state).not.toBe('stagger');

    const light = one('irrlicht');
    const lhp = light.e.hp;
    expect(light.s.pelt(light.e, 0, 0)).toBe('through');
    expect(light.e.hp).toBe(lhp);

    const safe = one('nebelling');
    safe.s.step(DT, input({ safe: 'home' }));
    const shp = safe.e.hp;
    expect(safe.s.pelt(safe.e, 0, 0)).toBe('through');
    expect(safe.e.hp).toBe(shp);
  });

  it('finds the body on its way, and misses over its head or beside it', () => {
    // a body 0.5 m wide and 1.6 m tall at (0, 0, -5)
    const hit = segmentHitsBody(0, 1.2, -4, 0, 1.0, -6, 0, 0, -5, 0.5, 1.6);
    expect(hit).toBeCloseTo(0.25, 5);
    expect(segmentHitsBody(0, 3.2, -4, 0, 3.0, -6, 0, 0, -5, 0.5, 1.6)).toBeNull();
    expect(segmentHitsBody(1.2, 1.2, -4, 1.2, 1.0, -6, 0, 0, -5, 0.5, 1.6)).toBeNull();
    expect(segmentHitsBody(0, 1.2, -1, 0, 1.1, -2, 0, 0, -5, 0.5, 1.6)).toBeNull();
  });
});

describe('the staff', () => {
  it('reports where it came down (plants are cut there), hit or not', () => {
    const groups: Record<string, EnemyGroupState> = {};
    const stats = deriveStats({ level: 1, talents: {}, equipped: { weapon: 'item.stab.esche', charms: [] } });
    const s = new CombatSim({ heightAt: () => 0 }, groups, { gentle: false, reducedMotion: false, stats, sweep: false, konter: false, waerme: false, dritter: false });
    const evs: SimEvent[] = [...s.step(DT, input({ x: 5, z: 6, yaw: 0.4, attackPressed: true }))];
    for (let t = 0; t < 0.5; t += DT) evs.push(...s.step(DT, input({ x: 5, z: 6, yaw: 0.4 })));
    const arc = evs.find((v) => v.type === 'arc');
    expect(arc).toMatchObject({ type: 'arc', kind: 'light', x: 5, z: 6, yaw: 0.4, reach: COMBO.reach, arcDeg: COMBO.arcDeg });
    expect(evs.filter((v) => v.type === 'arc')).toHaveLength(1);
    // in a place where nothing can be hurt (the tour: fighting off) it still swings and reports
    const safe: SimEvent[] = [...s.step(DT, input({ attackPressed: true, safe: 'disabled' }))];
    for (let t = 0; t < 0.5; t += DT) safe.push(...s.step(DT, input({ safe: 'disabled' })));
    expect(safe.some((v) => v.type === 'arc')).toBe(true);
    // and costs no Atem there: mowing a patch of fern never ends in „außer Atem“
    const full = s.p.st.stamina;
    for (let n = 0; n < 12; n++) {
      s.step(DT, input({ attackPressed: true, safe: 'disabled' }));
      for (let t = 0; t < 0.45; t += DT) s.step(DT, input({ safe: 'disabled' }));
    }
    expect(s.p.st.stamina).toBeGreaterThanOrEqual(full);
  });

  it('may swing in the guided tour although fighting is off, and nowhere else it is lowered', () => {
    expect(forageOnly({ 'combat.disabled': true, 'tour.slice': true })).toBe(true);
    expect(forageOnly({ 'combat.disabled': true })).toBe(false);
    expect(forageOnly({ 'tour.slice': true })).toBe(false);
    expect(forageOnly({})).toBe(false);
  });
});

describe('a noise that is not the player', () => {
  const world: SimWorld = { heightAt: () => 300, surfaceAt: () => 'meadow', coverAt: () => 0, bounds: () => ({ x0: -300, z0: -300, x1: 300, z1: 300 }) };
  const nodes: number[] = [];
  const edges: number[] = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) nodes.push(-80 + j * 20, 300, -80 + i * 20);
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++) {
      if (j + 1 < 9) edges.push(i * 9 + j, i * 9 + j + 1, 0, 20);
      if (i + 1 < 9) edges.push(i * 9 + j, (i + 1) * 9 + j, 0, 20);
    }
  const graph = new PathGraph({ nodes, edges });
  const opts = (o: Partial<PackOptions> = {}): PackOptions => ({ x: 0, z: 0, radius: 80, intensity: 0.5, hounds: 4, pikeur: false, seed: 7, sight: 30, beacon: 40, gentle: false, rauhnacht: false, ...o });
  // the player is far away and unseen
  const away: PlayerSense = { x: 250, y: 300, z: 250, stance: 'prone', noise: 0, visibility: 0, lanternLit: false, speed: 0, flying: false };

  it('a calm pack on patrol sends its nearest hound to look, and calms down again', () => {
    const sim = new PackSim(world, graph, opts(), { x: 250, z: 250 });
    for (let i = 0; i < 60; i++) sim.update(DT, { ...away });
    expect(sim.state).toBe('calm');
    const hounds = sim.agents.filter((a) => a.kind === 'hound');
    const h0 = hounds[0]!;
    const spot = { x: h0.x + 9, z: h0.z + 4 };
    const before = Math.hypot(h0.x - spot.x, h0.z - spot.z);
    expect(sim.noise(spot.x, spot.z, 0.7)).toBeGreaterThan(0);
    const looker = [...hounds].sort((a, b) => b.awareness - a.awareness)[0]!;
    expect(looker.awareness).toBe(NOISE.look);
    // never enough for a chase by itself
    expect(Math.max(...hounds.map((a) => a.awareness))).toBeLessThan(0.5);
    for (let i = 0; i < 4 * 60; i++) sim.update(DT, { ...away });
    expect(sim.state).toBe('suspicious');
    expect(Math.hypot(looker.x - spot.x, looker.z - spot.z)).toBeLessThan(Math.max(6, before * 0.6));
    for (let i = 0; i < 20 * 60; i++) sim.update(DT, { ...away });
    expect(sim.state).toBe('calm');
    expect(sim.caught).toBeNull();
  });

  it('is ignored out of earshot, by a pack that is already hunting, and in the staged modes', () => {
    const far = new PackSim(world, graph, opts(), { x: 250, z: 250 });
    far.update(DT, { ...away });
    const h = far.agents[0]!;
    expect(far.noise(h.x + NOISE.range * 3, h.z, 1)).toBe(0);
    expect(far.noise(h.x + 2, h.z, 0)).toBe(0);

    const hunting = new PackSim(world, graph, opts(), { x: 250, z: 250 });
    hunting.update(DT, { ...away });
    hunting.force('chasing', { x: 0, z: 0 });
    expect(hunting.noise(hunting.agents[0]!.x + 2, hunting.agents[0]!.z, 1)).toBe(0);

    for (const mode of ['parforce', 'drive', 'finale'] as const) {
      const staged = new PackSim(world, graph, opts({ mode, target: { x: 60, z: 0 } }), { x: 250, z: 250 });
      expect(staged.noise(staged.agents[0]!.x + 2, staged.agents[0]!.z, 1), mode).toBe(0);
    }
  });

  it('makes the deer look up; right next to them, twice, they bolt', () => {
    const still = { x: 60, z: 0, speed: 0, stance: 'crouch' as const };
    const deer = createDeer({ op: 'spawn', kind: 'reh', look: 'ricke', id: 'ricke', x: 0, z: 0, era: 'today' });
    stepDeer(deer, DT, { player: still, los: false, noise: [{ x: 22, z: 0, loud: 0.7 }] });
    expect(deer.state).toBe('graze');
    expect(deer.meter).toBeGreaterThan(0);
    expect(deer.meter).toBeLessThan(DEER.ALERT_AT);
    stepDeer(deer, DT, { player: still, los: false, noise: [{ x: 2, z: 0, loud: 0.7 }] });
    expect(deer.state).toBe('alert');
    stepDeer(deer, DT, { player: still, los: false, noise: [{ x: 1, z: 1, loud: 0.7 }] });
    for (let t = 0; t < DEER.TELL_S + 0.1 && deer.state === 'alert'; t += DT) stepDeer(deer, DT, { player: { ...still, x: 14, speed: 3.2, stance: 'stand' }, los: true });
    expect(deer.state).toBe('flee');
  });
});

describe('the throw key', () => {
  it('is F, rebindable, and has a touch button of its own', () => {
    expect(DEFAULT_BINDINGS.throw).toEqual(['KeyF']);
    expect(REBINDABLE).toContain('throw');
    // no other default sits on F
    for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) if (action !== 'throw') expect(codes, action).not.toContain('KeyF');
    expect(touchName('throw')).toBe('Kastanie');
    expect(touchIconFor('F')).toBe('throw');
  });

  it('gives way to a key the player already put on F', () => {
    expect(yieldNewDefaults({})).toEqual({});
    const mine = yieldNewDefaults({ lantern: ['KeyF'] });
    expect(mine).toEqual({ lantern: ['KeyF'], throw: [] });
    expect(effectiveBindings(mine).throw).toEqual([]);
    expect(effectiveBindings(mine).lantern).toEqual(['KeyF']);
    // a choice the player made for the throw itself stays
    expect(yieldNewDefaults({ throw: ['KeyJ'], lantern: ['KeyF'] })).toEqual({ throw: ['KeyJ'], lantern: ['KeyF'] });
  });
});
