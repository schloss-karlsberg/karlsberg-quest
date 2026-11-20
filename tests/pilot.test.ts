import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';
import { compassDeg, relBearing, summarizeEnemies, summarizeSimEvent, telegraphLeft, wrap180 } from '../src/debug/pilot';
import type { SimEvent } from '../src/systems/combat/sim';

/** Bullet-time pilot (src/debug/pilot.ts): the observation's pure parts. */

const enemy = (o: Record<string, unknown> = {}) =>
  ({
    id: 'e1',
    kind: 'streuner',
    x: 0,
    z: -10,
    hp: 30,
    maxHp: 40,
    state: 'approach',
    t: 0,
    windup: 0,
    attack: null,
    boss: false,
    elite: false,
    stun: 0,
    def: { name_de: 'Streuner' },
    ...o,
  }) as never;

describe('pilot geometry', () => {
  it('compass degrees follow kq.teleport (0 = north, 90 = east)', () => {
    expect(compassDeg(0)).toBe(0);
    expect(compassDeg(-Math.PI / 2)).toBeCloseTo(90);
    expect(compassDeg(Math.PI / 2)).toBeCloseTo(270);
  });

  it('wraps to (−180, 180]', () => {
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
    expect(wrap180(180)).toBe(180);
  });

  it('relative bearing: + is right, ±180 behind', () => {
    // facing north (yaw 0 looks to −z)
    expect(relBearing(0, 0, 0, 0, -5)).toBeCloseTo(0);
    expect(relBearing(0, 0, 0, 5, 0)).toBeCloseTo(90);
    expect(relBearing(0, 0, 0, -5, 0)).toBeCloseTo(-90);
    expect(Math.abs(relBearing(0, 0, 0, 0, 5))).toBeCloseTo(180);
    // facing east: north is to the left
    expect(relBearing(0, 0, -Math.PI / 2, 0, -5)).toBeCloseTo(-90);
  });
});

describe('pilot enemies', () => {
  it('telegraph time left only while winding up', () => {
    expect(telegraphLeft({ state: 'windup', t: 0.2, windup: 0.7 })).toBe(0.5);
    expect(telegraphLeft({ state: 'windup', t: 0.9, windup: 0.7 })).toBe(0);
    expect(telegraphLeft({ state: 'strike', t: 0.1, windup: 0.7 })).toBeNull();
  });

  it('summarises the nearby enemies, nearest first, within 40 m', () => {
    const list = [
      enemy({ id: 'far', x: 0, z: -60 }),
      enemy({ id: 'b', x: 6, z: 0, state: 'windup', t: 0.1, windup: 0.6, attack: { id: 'biss', kind: 'melee' } }),
      enemy({ id: 'a', x: 0, z: -3, elite: true, title: 'Leithund' }),
    ];
    const out = summarizeEnemies(0, 0, 0, list, (e) => (e as { id: string }).id === 'a');
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
    expect(out[0]).toMatchObject({ d: 3, bearing: 0, onScreen: true, name: 'Leithund (Streuner)', elite: true, telegraph: null, attack: null });
    expect(out[1]).toMatchObject({ d: 6, bearing: 90, onScreen: false, state: 'windup', telegraph: 0.5, attack: 'biss (melee)', hp: 30, max: 40 });
  });
});

describe('pilot events', () => {
  const e = { id: 'e1', kind: 'irrlicht', hp: 12 } as never;
  it('keeps hits, hurts, dodges, KOs and bounces compact', () => {
    expect(summarizeSimEvent({ type: 'hit', e, damage: 8.4, heavy: true, finisher: false, weak: false, armored: false, gebannt: false, dirX: 0, dirZ: 1 } as SimEvent, 0.123)).toEqual({ type: 'hit', t: 0.12, id: 'e1', kind: 'irrlicht', dmg: 8, heavy: true, hpLeft: 12 });
    expect(summarizeSimEvent({ type: 'playerHit', damage: 11, by: 'irrlicht', x: 0, z: 0, pushX: 0, pushZ: 0, heavy: false }, 0.2)).toEqual({ type: 'hurt', t: 0.2, dmg: 11, by: 'irrlicht', heavy: false });
    expect(summarizeSimEvent({ type: 'dodge', vx: 1, vz: 0, perfect: true, stumble: false, dur: 0.35 }, 0)).toEqual({ type: 'dodge', t: 0, perfect: true });
    expect(summarizeSimEvent({ type: 'killed', e, by: 'light' } as SimEvent, 0)).toMatchObject({ type: 'ko', id: 'e1' });
    expect(summarizeSimEvent({ type: 'blocked', e, skill: null }, 0)).toMatchObject({ type: 'bounce', kind: 'irrlicht' });
    expect(summarizeSimEvent({ type: 'telegraph', e, attack: { id: 'flare', kind: 'ranged' }, dur: 0.75 } as unknown as SimEvent, 0)).toMatchObject({ type: 'telegraph', attack: 'flare (ranged)', dur: 0.75 });
  });

  it('drops the noise', () => {
    expect(summarizeSimEvent({ type: 'chargeFull' }, 0)).toBeNull();
    expect(summarizeSimEvent({ type: 'impact', p: {} as never, hitPlayer: false }, 0)).toBeNull();
  });
});

describe('loop advance / renderOnce (pilot stepping)', () => {
  it('advances without rendering and renders on demand with the frame time', () => {
    const renders: number[] = [];
    let updates = 0;
    const loop = new FixedStepLoop({ update: () => updates++, render: (dt) => renders.push(dt) }, 60, () => 0, () => {});
    loop.advance(3);
    expect(updates).toBe(3);
    expect(loop.tick).toBe(3);
    expect(renders).toEqual([]);
    loop.renderOnce(3 / 60);
    loop.renderOnce(5);
    expect(renders[0]).toBeCloseTo(0.05);
    expect(renders[1]).toBe(0.25);
  });
});
