import { describe, expect, it } from 'vitest';
import { HOLD_MIN_R, REVEAL_MARGIN, type VeilState, holdRadius, shouldHold, shouldRelease, veilHides } from '../src/systems/fx/shift/reveal';
import { shiftCurves } from '../src/systems/fx/shift/timeline';

const base: VeilState = { active: true, reduced: false, switched: true, veil: 'full', veilR: 0, veilAlpha: 1 };

describe('era-shift reveal window (M-17)', () => {
  it('holds everything while the veil is full after the switch', () => {
    expect(holdRadius(base)).toBe(Infinity);
    expect(veilHides(Infinity, Number.NaN, Number.NaN)).toBe(true);
  });

  it('holds nothing before the switch, without a shift, in the reduced crossfade or once the veil fades', () => {
    expect(holdRadius({ ...base, switched: false })).toBe(0);
    expect(holdRadius({ ...base, active: false })).toBe(0);
    expect(holdRadius({ ...base, reduced: true })).toBe(0);
    expect(holdRadius({ ...base, veil: 'in', veilR: 50, veilAlpha: 0.8 })).toBe(0);
    expect(holdRadius({ ...base, veil: 'none' })).toBe(0);
  });

  it('during the reassembly only what lies beyond the wave stays hidden', () => {
    const r = holdRadius({ ...base, veil: 'in', veilR: 20 });
    expect(r).toBe(20);
    // a 2 m object whose nearest point is beyond 20 m + margin: hidden
    expect(veilHides(r, 20 + REVEAL_MARGIN + 2 + 0.1, 2)).toBe(true);
    // reached by the wave (incl. the margin): visible
    expect(veilHides(r, 20 + REVEAL_MARGIN + 2 - 0.1, 2)).toBe(false);
    // no bounding sphere: treated as visible
    expect(veilHides(r, Number.NaN, Number.NaN)).toBe(false);
  });

  it('a held object comes back when warm, or when the wave reaches it, whichever is first', () => {
    expect(shouldRelease(true, Infinity, 100, 1)).toBe(true);
    expect(shouldRelease(false, Infinity, 100, 1)).toBe(false);
    expect(shouldRelease(false, 20, 100, 1)).toBe(false);
    expect(shouldRelease(false, 20, 22, 1)).toBe(true);
    expect(shouldRelease(false, 0, 100, 1)).toBe(true);
  });

  it('holds only objects the wave reaches late enough to compile meanwhile, and only with a sphere', () => {
    expect(shouldHold(Infinity, 50, 2)).toBe(true);
    // near the camera: the wave reaches it right after the void opens, so it compiles in the void
    expect(shouldHold(Infinity, HOLD_MIN_R + REVEAL_MARGIN + 2 - 0.1, 2)).toBe(false);
    expect(shouldHold(Infinity, Number.NaN, Number.NaN)).toBe(false);
    // during the reassembly, only beyond the wave
    expect(shouldHold(40, 30, 1)).toBe(false);
    expect(shouldHold(40, 60, 1)).toBe(true);
    expect(shouldHold(0, 60, 1)).toBe(false);
  });

  it('over the real shift timeline, releases spread out after the void opens (no single release frame)', () => {
    // objects spread from 5 m to 300 m: count the frames at which unwarmed ones are forced back
    const dists = Array.from({ length: 60 }, (_, i) => 5 + i * 5);
    const releasedAt = new Map<number, number>();
    for (let t = 1.75; t <= 3.5; t += 1 / 60) {
      const c = shiftCurves(t, 'intact', 'hidden');
      const r = holdRadius({ ...base, veil: c.veil, veilR: c.veilR, veilAlpha: c.veilAlpha });
      for (const d of dists) if (!releasedAt.has(d) && shouldRelease(false, r, d, 1)) releasedAt.set(d, t);
    }
    expect(releasedAt.size).toBe(dists.length);
    const frames = new Set([...releasedAt.values()].map((t) => t.toFixed(4)));
    expect(frames.size).toBeGreaterThan(5);
    // nothing comes back while the veil is full
    expect(Math.min(...releasedAt.values())).toBeGreaterThanOrEqual(2.0 - 1e-9);
  });
});
