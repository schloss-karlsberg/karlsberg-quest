import { describe, expect, it } from 'vitest';
import architecture from '../src/assets/manifests/architecture';
import { SURF, SURFACE_SETS, planarUv, surfAssetId } from '../src/world/surfaces';
import { SURF_GLASS, palaceSurface } from '../src/world/palace';
import { surfFor } from '../src/systems/scenery/kit';

describe('surfaces (architecture track)', () => {
  it('every surface layer has its two packed textures in the manifest', () => {
    const ids = new Set(architecture.map((e) => e.id));
    for (const s of SURFACE_SETS) {
      expect(ids.has(surfAssetId(s, 'col')), surfAssetId(s, 'col')).toBe(true);
      expect(ids.has(surfAssetId(s, 'nrm')), surfAssetId(s, 'nrm')).toBe(true);
    }
  });

  it('every prop model the sets use is in the manifest', () => {
    const ids = new Set(architecture.map((e) => e.id));
    for (const id of ['architecture.barrel', 'architecture.chandelier', 'architecture.armchair', 'architecture.lantern', 'architecture.fieldtable', 'architecture.campstool'])
      expect(ids.has(id), id).toBe(true);
  });

  it('planar UVs run in metres: walls along the wall and up, floors in x / z', () => {
    const o: [number, number] = [0, 0];
    planarUv(3, 2, 5, 0, 1, 0, o);
    expect(o).toEqual([3, 5]);
    planarUv(3, 2, 5, 0, 0, 1, o); // wall facing +z: u along x (sign free), v = height
    expect(Math.abs(o[0])).toBeCloseTo(3);
    expect(o[1]).toBeCloseTo(2);
    // two points 1 m apart along a wall are 1 m apart in u
    const a = planarUv(0, 0, 0, 1, 0, 0, [0, 0])[0];
    const b = planarUv(0, 0, 1, 1, 0, 0, [0, 0])[0];
    expect(Math.abs(b - a)).toBeCloseTo(1);
  });

  it('palace colours map to sensible layers', () => {
    expect(palaceSurface(0.02, 0.02, 0.03, 0)).toBe(SURF_GLASS);
    expect(palaceSurface(0.7, 0.66, 0.58, 0)).toBe(SURF.PLASTER);
    expect(palaceSurface(0.5, 0.12, 0.08, 0.6)).toBe(SURF.TILES);
    expect(palaceSurface(0.1, 0.1, 0.11, 0.6)).toBe(SURF.SLATE);
    expect(palaceSurface(0.5, 0.12, 0.08, 0)).toBe(SURF.ASHLAR);
  });

  it('kit palette: gilt is metal, unknown paint stays untextured', () => {
    expect(surfFor(0xc9a24a)).toBe(SURF.IRON);
    expect(surfFor(0xe2d6bc)).toBe(SURF.NONE);
    expect(surfFor(0x111111)).toBe(SURF.IRON);
    expect(surfFor(0xffb35c, 2)).toBe(SURF.NONE);
  });
});
