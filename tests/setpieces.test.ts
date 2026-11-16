/**
 * Set pieces (docs/ACTION-RPG.md §14): the Festsaal choice as four things in the room, and the
 * timelines of the endings staged in the engine.
 */
import { describe, expect, it } from 'vitest';
import { FESTSAAL_LABELS, festsaalSpots } from '../src/systems/interiors/festsaal';
import type { Door, IRoom, Win } from '../src/systems/interiors/types';
import { STAGE_SECONDS, STAGE_SECONDS_REDUCED, stageAt } from '../src/systems/story/endings/stage';

const room = {
  index: 3,
  id: 'KB-B01/B01.2.og-festsaal',
  roomId: 'B01.2.og-festsaal',
  floor: 250,
  cx: 10,
  cz: 5,
  // 20 × 10 m, u along +x, v along +z
  frame: { ox: 0, oz: 0, ux: 1, uz: 0, vx: 0, vz: 1, L: 20, W: 10 },
} as unknown as IRoom;
const door = { a: 3, b: 4, kind: 'inner', cx: 0, cz: 5, nx: -1, nz: 0, floor: 250 } as unknown as Door;
const win = { room: 3, cx: 9, cz: 0, nx: 0, nz: -1, y0: 251, y1: 253 } as unknown as Win;

describe('the Festsaal choice: four things in the room', () => {
  const spots = festsaalSpots(room, [door], [win]);
  const at = (k: string) => spots.find((s) => s.key === k)!;

  it('places the handle, the ducat, the clock and the way out — one each, apart', () => {
    expect(spots.map((s) => s.key).sort()).toEqual(['dukat', 'nichts', 'tuergriff', 'uhr']);
    expect(Object.keys(FESTSAAL_LABELS).sort()).toEqual(['dukat', 'nichts', 'tuergriff', 'uhr']);
    for (const a of spots)
      for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.key}–${b.key}`).toBeGreaterThan(1.5);
  });

  it('the ducat lies on the window sill (inside), the way out is inside the door, the clock far from it', () => {
    expect(at('dukat').y).toBeCloseTo(251.02, 2);
    expect(at('dukat').z).toBeGreaterThan(0);
    expect(at('dukat').z).toBeLessThan(0.5);
    expect(at('nichts').x).toBeGreaterThan(0);
    expect(at('nichts').x).toBeLessThan(1);
    expect(at('uhr').x).toBeGreaterThan(15);
    // Hanne at the centre holds the handle out towards the door
    expect(Math.hypot(at('tuergriff').x - room.cx, at('tuergriff').z - room.cz)).toBeLessThan(1);
    expect(at('tuergriff').x).toBeLessThan(room.cx);
    for (const s of spots) expect(s.y).toBeGreaterThan(room.floor);
  });
});

describe('endings staged in the engine', () => {
  it('each ending fades in, plays, fades out to the card', () => {
    for (const id of ['museum', 'burn', 'keep'] as const) {
      const T = STAGE_SECONDS[id];
      expect(stageAt(id, 0, false).fade).toBeGreaterThan(0.8);
      expect(stageAt(id, T / 2, false).fade).toBeLessThan(0.05);
      expect(stageAt(id, T, false).fade).toBeGreaterThan(0.9);
    }
  });

  it('museum: the camera rises and the fog lifts towards dawn; keep: the dark closes, the view turns round', () => {
    const m0 = stageAt('museum', 0.5, false);
    const m1 = stageAt('museum', 9, false);
    expect(m1.rise).toBeGreaterThan(m0.rise + 4);
    expect(m1.fog).toBeLessThan(0.4);
    expect(m1.sun).toBeGreaterThan(0.8);
    const k1 = stageAt('keep', 9, false);
    expect(k1.dark).toBeCloseTo(1, 2);
    expect(k1.turn).toBeCloseTo(Math.PI, 2);
    expect(stageAt('burn', 9, false).pitch).toBeGreaterThan(0.6);
  });

  it('reduced motion: no flight (two still shots, no camera path in between), shorter', () => {
    expect(STAGE_SECONDS_REDUCED).toBeLessThan(STAGE_SECONDS.museum);
    const T = STAGE_SECONDS_REDUCED;
    for (const id of ['museum', 'keep', 'burn'] as const) {
      const a = stageAt(id, T * 0.2, true);
      const b = stageAt(id, T * 0.45, true);
      expect(a.rise).toBe(b.rise);
      expect(a.turn).toBe(b.turn);
    }
    expect(stageAt('burn', 9, true).pitch).toBeCloseTo(-0.05, 5);
  });
});
