import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHAPES, shapeGeometry } from '../src/systems/combat/visuals-shapes';

afterEach(() => vi.restoreAllMocks());

describe('combat shape geometry', () => {
  it('builds every shape without a three.js warning (TASK-093: toNonIndexed on a non-indexed rock)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const s of SHAPES) {
      const g = shapeGeometry(s);
      expect(g.getAttribute('position').count, s).toBeGreaterThan(0);
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
