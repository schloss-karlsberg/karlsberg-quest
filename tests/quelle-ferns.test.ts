/**
 * The Karlsbergquelle's fern clumps as a distance LOD (tri budget phase B, docs/PERFORMANCE.md
 * §3.5): the scanned CC0 clump where the player stands at home base (by the trough and the trail
 * through the hollow), the stylised forest fern further out, at the same spots.
 */
import { describe, expect, it } from 'vitest';
import { PIECES, TRAIL, toLocal, toWorld, trailLine } from '../src/systems/quelle/layout';
import { SetBuilder } from '../src/systems/scenery/builder';
import { FERN_NEAR, FERN_TRAIL, HOLLOW_FERNS, fernDetailed, fernFarHeight, quelleSet } from '../src/systems/scenery/quelle';
import { loadPalaceData } from './interiors-fixture';

const { h2025 } = loadPalaceData();
const heightAt = (x: number, z: number) => h2025.heightAt(x, z);
const T = PIECES.trough;

/** The big ferns of the hollow (TASK-087) are stylised ones by design, at any distance. */
const isBig = (u: number, w: number) => HOLLOW_FERNS.some(([fu, fw]) => Math.hypot(u - fu, w - fw) < 0.05);

function allFerns(era: '1789' | 'today') {
  const b = new SetBuilder(heightAt, true, true);
  quelleSet.build(b, { era, gateOpen: 0 });
  return b.models
    .filter((m) => m.id === 'nature.fern.02' || m.id === 'nature2.ferns#fern')
    .map((m) => {
      const [u, w] = toLocal(m.matrix.elements[12]!, m.matrix.elements[14]!);
      return { id: m.id, u, w, d: Math.hypot(u - T.u, w - T.w), height: Math.hypot(m.matrix.elements[4]!, m.matrix.elements[5]!, m.matrix.elements[6]!) * 2.69 };
    });
}

/** The fern clumps of the LOD (without the hollow's big ferns). */
const ferns = (era: '1789' | 'today') => allFerns(era).filter((f) => !isBig(f.u, f.w));

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

describe('the hollow\'s big ferns (TASK-087)', () => {
  it('today: ten stylised ferns, half a metre and more tall, off the steps, the forecourt and the trail', () => {
    const big = allFerns('today').filter((f) => isBig(f.u, f.w));
    expect(big).toHaveLength(HOLLOW_FERNS.length);
    expect(HOLLOW_FERNS.length).toBe(10);
    const trail = TRAIL.flatMap((s) => trailLine(s, 0.5)).map((p) => ({ uw: toLocal(p.x, p.z), half: p.half }));
    const S = PIECES.steps;
    for (const f of big) {
      expect(f.id).toBe('nature2.ferns#fern');
      expect(f.height).toBeGreaterThan(0.45);
      expect(f.height).toBeLessThan(0.8);
      // never where people walk or stand
      for (const t of trail) expect(Math.hypot(f.u - t.uw[0], f.w - t.uw[1]), `${f.u}/${f.w}`).toBeGreaterThan(t.half + 0.5);
      expect(Math.abs(f.u - S.u) > S.width / 2 + 0.6 || f.w > S.w0 + 0.6 || f.w < S.w0 - S.n * S.run - 0.6, `${f.u}/${f.w}`).toBe(true);
      expect(f.w < PIECES.wall.w || Math.abs(f.u) > PIECES.wall.u1 + 0.8, `${f.u}/${f.w}`).toBe(true);
    }
    // 288 triangles each: under 3k for the hollow
    expect(big.length * 288).toBeLessThan(3000);
    // the baroque spring is kept: none in 1789
    expect(allFerns('1789').filter((f) => isBig(f.u, f.w))).toHaveLength(0);
  });
});
