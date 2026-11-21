/**
 * The Karlsbergquelle's fern clumps as a distance LOD (tri budget phase B, docs/PERFORMANCE.md
 * §3.5): the scanned CC0 clump where the player stands at home base (by the trough and the trail
 * through the hollow), the stylised forest fern further out, at the same spots.
 */
import { describe, expect, it } from 'vitest';
import { PIECES, TRAIL, toLocal, toWorld, trailLine } from '../src/systems/quelle/layout';
import { SetBuilder } from '../src/systems/scenery/builder';
import { FERN_NEAR, FERN_TRAIL, fernDetailed, fernFarHeight, quelleSet } from '../src/systems/scenery/quelle';
import { loadPalaceData } from './interiors-fixture';

const { h2025 } = loadPalaceData();
const heightAt = (x: number, z: number) => h2025.heightAt(x, z);
const T = PIECES.trough;

function ferns(era: '1789' | 'today') {
  const b = new SetBuilder(heightAt, true, true);
  quelleSet.build(b, { era, gateOpen: 0 });
  return b.models
    .filter((m) => m.id === 'nature.fern.02' || m.id === 'nature2.ferns#fern')
    .map((m) => {
      const [u, w] = toLocal(m.matrix.elements[12]!, m.matrix.elements[14]!);
      return { id: m.id, u, w, d: Math.hypot(u - T.u, w - T.w) };
    });
}

describe('Quelle fern LOD', () => {
  it('keeps the detailed clump by the trough and on the trail through the hollow', () => {
    expect(fernDetailed(T.u, T.w)).toBe(true);
    expect(fernDetailed(T.u + FERN_NEAR - 0.2, T.w)).toBe(true);
    // the forecourt and the trail up to the spring
    for (const p of trailLine(TRAIL[0]!, 0.5)) {
      const [u, w] = toLocal(p.x, p.z);
      if (Math.hypot(u - T.u, w - T.w) <= 12) expect(fernDetailed(u, w + FERN_TRAIL * 0.8), `${u}/${w}`).toBe(true);
    }
  });

  it('switches to the stylised fern beyond the home-base area', () => {
    // far up the ravine, off the trail
    expect(fernDetailed(T.u + 30, T.w - 8)).toBe(false);
    // the trail's far ends do not count (only its stretch through the hollow)
    const end = TRAIL[0]![0]!;
    expect(fernDetailed(end[0], end[1])).toBe(false);
  });

  it('places the same clumps as before, detailed near and stylised far (today)', () => {
    const all = ferns('today');
    // 18 in the hollow + the brook banks
    expect(all.length).toBeGreaterThanOrEqual(28);
    for (const f of all) expect(f.id, `${f.u.toFixed(1)}/${f.w.toFixed(1)} at ${f.d.toFixed(1)} m`).toBe(fernDetailed(f.u, f.w) ? 'nature.fern.02' : 'nature2.ferns#fern');
    // every clump within 8 m of the trough is detailed; the brook's far banks are not
    expect(all.filter((f) => f.d <= 8).every((f) => f.id === 'nature.fern.02')).toBe(true);
    const far = all.filter((f) => f.id === 'nature2.ferns#fern');
    expect(far.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...far.map((f) => f.d))).toBeGreaterThan(FERN_NEAR);
    const near = all.length - far.length;
    // the triangle sum of the clumps drops by a quarter or more (the brook's banks up the ravine)
    expect(near * 5624 + far.length * 288).toBeLessThan(all.length * 5624 * 0.75);
  });

  it('the far fern stands about as high as the detailed clump', () => {
    // detailed: 0.4 m authored crown × 0.55 × s
    for (const s of [0.65, 1, 1.15]) {
      expect(fernFarHeight(s)).toBeGreaterThan(0.4 * 0.55 * s);
      expect(fernFarHeight(s)).toBeLessThan(0.4 * 0.55 * s * 1.6);
    }
    expect(toWorld(T.u, T.w)[0]).toBeTypeOf('number');
  });
});
