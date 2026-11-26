/**
 * Real-GPU playtest round (2026-11-19, "stuck at the lake"): the rules behind the fixes.
 *  - Irrlichter (and every enemy) stay within reach of the shore: no kiting over open water.
 *  - The opening lessons (level 1–2): one attacker at a time, bodies keep out from under the camera.
 *  - The player wades into the shallows but deep water holds them back like a wall.
 */
import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, SHORE_REACH_M, STANDOFF_M, type SimInput } from '../src/systems/combat/sim';
import { Player, type PlayerWorld, WADE_LIMIT_M } from '../src/player/player';
import { EventBus } from '../src/core/events';

function input(o: Partial<SimInput> = {}): SimInput {
  return { x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: 'today', time: 'day', ...o };
}

/** A lake east of x = 10: depth inside = x − 10 (m). */
const lakeDepth = (x: number) => x - 10;

describe('enemies keep to the shore', () => {
  it('an Irrlicht placed over open water drifts back to within reach of the bank', () => {
    const groups: Record<string, EnemyGroupState> = {};
    const s = new CombatSim({ heightAt: () => 0, waterDepth: (x) => lakeDepth(x) }, groups, { gentle: false, reducedMotion: false, stats: deriveStats(null), sweep: false, konter: false, waerme: false, dritter: false });
    upsertGroup(groups, { group: 'w', kind: 'irrlicht', era: 'today', x: 22, z: 0, count: 1, radius: 0 });
    s.step(1 / 60, input());
    const e = s.live()[0]!;
    e.x = 25;
    for (let i = 0; i < 240; i++) s.step(1 / 60, input({ x: 0, z: 0 }));
    expect(lakeDepth(e.x)).toBeLessThanOrEqual(SHORE_REACH_M + 0.3);
  });
});

describe('the opening lessons', () => {
  it('level 1–2: one attacker at a time, and a body eases out from under the camera', () => {
    const groups: Record<string, EnemyGroupState> = {};
    const s = new CombatSim({ heightAt: () => 0 }, groups, { gentle: false, reducedMotion: false, stats: deriveStats(null), sweep: false, konter: false, waerme: false, dritter: false });
    s.setNovice(true);
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: 'today', x: 0, z: -3, count: 1, radius: 0 });
    s.step(1 / 60, input());
    const e = s.live()[0]!;
    e.x = 0.2;
    e.z = -0.4;
    for (let i = 0; i < 30; i++) s.step(1 / 60, input());
    expect(Math.hypot(e.x, e.z)).toBeGreaterThan(STANDOFF_M * 0.8);
  });
});

describe('deep water', () => {
  function walker(waterDepth: PlayerWorld['waterDepth'] = lakeDepth): Player {
    const world: PlayerWorld = {
      heightAt: () => 0,
      collide: (x, z) => ({ x, z, hit: false }),
      bounds: () => ({ x0: -1000, z0: -1000, x1: 1000, z1: 1000 }),
      surfaceAt: () => 'meadow',
      coverAt: () => 0,
      canFly: () => true,
      waterDepth,
    };
    const keys = new Set<string>(['right']);
    const inp = {
      isDown: (k: string) => keys.has(k),
      wasPressed: () => false,
      takeMouse: () => ({ dx: 0, dy: 0 }),
    } as unknown as ConstructorParameters<typeof Player>[1];
    const p = new Player(world, inp, new EventBus() as ConstructorParameters<typeof Player>[2]);
    p.teleport(0, 0, 0);
    return p;
  }

  it('samples the proposed position once per dry step', () => {
    const depth = vi.fn(lakeDepth);
    const p = walker(depth);
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    expect(depth).toHaveBeenCalledTimes(60);
    expect(p.stats.inWater).toBe(0);
  });

  it('the player wades into the shallows and stops at the wading line', () => {
    const p = walker();
    for (let i = 0; i < 60 * 12; i++) p.update(1 / 60);
    expect(p.position.x).toBeGreaterThan(10);
    expect(lakeDepth(p.position.x)).toBeLessThanOrEqual(WADE_LIMIT_M + 0.05);
    expect(p.stats.deepWater).toBe(true);
    expect(p.position).toBeInstanceOf(Vector3);
  });
});
