/** „Der Gruppe folgen“ leads to the group along its route, not to the next stop (playtest 2026-11-28). */
import { describe, expect, it } from 'vitest';
import route from '../content/routes/p-fuehrung.json';
import { EventBus } from '../src/core/events';
import { LEAD, groupLeadPoint } from '../src/systems/walk/find';
import { Polyline, buildRoute } from '../src/systems/walk/route';
import { WalkRuntime, type WalkBus } from '../src/systems/walk/runtime';
import type { Route, WalkSlice } from '../src/systems/walk/types';

const ROUTE = route as Route;
const DT = 1 / 20;

describe('groupLeadPoint', () => {
  // a straight route along +x
  const line = new Polyline([[0, 0], [200, 0]]);

  it('behind the group: on the route, at most lookahead ahead of the player, never past the tail', () => {
    const p = groupLeadPoint(line, 100, 6, { x: 10, z: 2 })!;
    expect(p).toEqual({ x: 10 + LEAD.lookahead, z: 0 });
    const near = groupLeadPoint(line, 100, 6, { x: 85, z: 1 })!;
    expect(near).toEqual({ x: 94, z: 0 });
  });

  it('with the group: on the guide', () => {
    expect(groupLeadPoint(line, 100, 6, { x: 96, z: 1 })).toEqual({ x: 100, z: 0 });
  });

  it('far off the route: back onto it first', () => {
    expect(groupLeadPoint(line, 100, 6, { x: 40, z: 30 })).toEqual({ x: 40, z: 0 });
  });

  it('ahead of the guide: no lead (the stop leads)', () => {
    expect(groupLeadPoint(line, 100, 6, { x: 120, z: 0 })).toBeNull();
  });
});

describe('WalkRuntime.leadFor', () => {
  function setup() {
    const bus = new EventBus();
    const player = { x: 630, z: -520 };
    const slice: WalkSlice = { walkers: [], groups: [] };
    const rt = new WalkRuntime({
      bus: bus as unknown as WalkBus,
      routes: new Map([[ROUTE.id, ROUTE]]),
      slice: () => slice,
      log: () => {},
      world: { heightAt: () => 300, player: () => player, era: () => 'today', reducedMotion: () => false },
      bodies: () => ({ setPos() {}, face() {}, setSpeed() {}, play() {}, setVisible() {}, dispose() {} }),
    });
    const req = (r: Record<string, unknown>) => bus.emit('npc:walk', r as never);
    const members = Array.from({ length: 14 }, (_, i) => `extra.m${i}`);
    req({ op: 'group', group: 'fuehrung', leader: 'imhoff', members });
    req({ op: 'follow', group: 'fuehrung', leader: 'imhoff' });
    // t4: walk to the Felsenpfad, the group warped to the Einstieg
    req({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to: 'felsen', speed: 1.9, wait: { for: 'player', r: 25 } });
    req({ op: 'warp', group: 'fuehrung', to: 'einstieg' });
    return { rt, player, req };
  }

  it('the playtest spot by the bank (639.0, −514.9): the marker leads along the route to the group, not across to the stop', () => {
    const { rt, player } = setup();
    // the guide walks on ahead while the player stays close behind
    for (let i = 0; i < 20 * 20; i++) {
      const L = rt.npcs.get('imhoff')!;
      player.x = L.x - 6;
      player.z = L.z + 4;
      rt.update(DT);
    }
    player.x = 639.0;
    player.z = -514.9;
    const lead = rt.leadFor(682.9, -596.1)!;
    expect(lead).not.toBeNull();
    const line = buildRoute(ROUTE).line;
    // on the walked route, not at the stop
    expect(line.project(lead.x, lead.z).dist).toBeLessThan(0.01);
    expect(Math.hypot(lead.x - 682.9, lead.z - -596.1)).toBeGreaterThan(20);
    // between the player and the guide, along the route
    const w = rt.walkers.get('imhoff')!;
    const ps = line.project(player.x, player.z).s;
    const ls = line.project(lead.x, lead.z).s;
    expect(ls).toBeGreaterThan(ps);
    expect(ls).toBeLessThanOrEqual(w.s + 1e-6);
    expect(ls - ps).toBeLessThanOrEqual(LEAD.lookahead + 1e-6);
  });

  it('only for the stop the guide walks to, only while the group follows and he walks', () => {
    const { rt, req } = setup();
    expect(rt.leadFor(897.2, -845.3)).toBeNull();
    expect(rt.leadFor(682.9, -596.1)).not.toBeNull();
    req({ op: 'hold', group: 'fuehrung' });
    expect(rt.leadFor(682.9, -596.1)).toBeNull();
    req({ op: 'release', group: 'fuehrung' });
    req({ op: 'warp', group: 'fuehrung', to: 'felsen' });
    expect(rt.walkers.get('imhoff')!.arrived).toBe(true);
    expect(rt.leadFor(682.9, -596.1)).toBeNull();
  });
});
