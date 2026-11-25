import { Texture } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import architecture from '../src/assets/manifests/architecture';
import { ArchitectureSurfaces, SURF, SURFACE_SETS, planarUv, surfAssetId, surfaces } from '../src/world/surfaces';
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
    // research-wave model: blue-grey shutters (#5F6F7A, linear ≈ 0.11/0.16/0.20) are paint, not plaster
    expect(palaceSurface(0.114, 0.161, 0.196, 0)).toBe(SURF.PAINTED);
    expect(palaceSurface(0.094, 0.133, 0.161, 0)).toBe(SURF.PAINTED);
    // slate seen side-on stays stone, red-brown door leaves are planks
    expect(palaceSurface(0.075, 0.075, 0.1, 0)).not.toBe(SURF.PAINTED);
    expect(palaceSurface(0.129, 0.059, 0.027, 0)).toBe(SURF.PLANKS);
  });

  it('kit palette: gilt is metal, unknown paint stays untextured', () => {
    expect(surfFor(0xc9a24a)).toBe(SURF.IRON);
    expect(surfFor(0xe2d6bc)).toBe(SURF.NONE);
    expect(surfFor(0x111111)).toBe(SURF.IRON);
    expect(surfFor(0xffb35c, 2)).toBe(SURF.NONE);
  });
});

describe('architecture surface streaming', () => {
  const surfaceIds = (historic: boolean) => SURFACE_SETS.filter((s) => !!s.historic === historic)
    .flatMap((s) => [surfAssetId(s, 'col'), surfAssetId(s, 'nrm')]);

  function stubCanvas() {
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() {
        return {
          clearRect() {},
          drawImage() {},
          getImageData: () => ({ data: Uint8ClampedArray.of(128, 128, 128, 255) }),
        };
      }
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps low flat and adds the historic layers to the same arrays after the opening', async () => {
    stubCanvas();
    const texture = vi.fn<(id: string) => Promise<Texture>>().mockResolvedValue(new Texture({}));
    const loaded = vi.fn();
    const loader = new ArchitectureSurfaces({ texture }, loaded);
    await loader.applyQuality('low', true);
    expect(texture).not.toHaveBeenCalled();

    const opening = loader.applyQuality('medium', false);
    expect(loader.applyQuality('medium', false)).toBe(opening);
    await opening;
    const { uSurfOn, uSurfCol, uSurfNrm, uSurfReady } = surfaces;
    const col = uSurfCol.value;
    expect(col.image.width).toBe(512);
    expect(uSurfNrm.value.image.width).toBe(256);
    expect(uSurfOn.value).toBe(1);
    expect(texture.mock.calls.flat()).toEqual(surfaceIds(false));
    expect([...uSurfReady.value]).toEqual(SURFACE_SETS.map((s) => s.historic ? 0 : 1));
    const woodOffset = SURF.PLANKS * col.image.width ** 2 * 4;
    expect(col.image.data?.[woodOffset]).toBe(128);
    expect(loaded).toHaveBeenCalledTimes(1);

    const historic = loader.applyQuality('medium', true);
    expect(loader.applyQuality('medium', true)).toBe(historic);
    loader.applyQuality('low', false);
    await historic;
    expect(uSurfCol.value).toBe(col);
    expect(col.image.data?.[woodOffset]).toBe(128);
    expect(texture.mock.calls.flat()).toEqual([...surfaceIds(false), ...surfaceIds(true)]);
    expect([...uSurfReady.value]).toEqual(SURFACE_SETS.map(() => 1));
    expect(uSurfOn.value).toBe(0);
    await loader.applyQuality('medium', true);
    expect(uSurfOn.value).toBe(1);
    expect(loaded).toHaveBeenCalledTimes(2);
  });

  it('keeps the current preset when an earlier load completes out of order', async () => {
    stubCanvas();
    const asset = new Texture({});
    let finishMedium!: (value: Texture) => void;
    const slow = new Promise<Texture>((resolve) => { finishMedium = resolve; });
    const texture = vi.fn<(id: string) => Promise<Texture>>().mockReturnValueOnce(slow).mockResolvedValue(asset);
    const loader = new ArchitectureSurfaces({ texture }, vi.fn());
    const medium = loader.applyQuality('medium', true);
    await loader.applyQuality('high', true);
    finishMedium(asset);
    await medium;
    expect(surfaces.uSurfCol.value.image.width).toBe(1024);
    expect(surfaces.uSurfNrm.value.image.width).toBe(512);
    expect([...surfaces.uSurfReady.value]).toEqual(SURFACE_SETS.map(() => 1));
  });

  it('retains opening layers if a historical texture fails and allows the batch to retry', async () => {
    stubCanvas();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const texture = vi.fn<(id: string) => Promise<Texture>>().mockResolvedValue(new Texture({}));
    const loader = new ArchitectureSurfaces({ texture }, vi.fn());
    await loader.applyQuality('medium', false);
    const col = surfaces.uSurfCol.value;
    texture.mockRejectedValueOnce(new Error('historical surface unavailable'));
    await loader.applyQuality('medium', true);
    expect(surfaces.uSurfCol.value).toBe(col);
    expect(surfaces.uSurfReady.value[SURF.STONE]).toBe(1);
    expect(surfaces.uSurfReady.value[SURF.TILES]).toBe(0);
    await loader.applyQuality('medium', true);
    expect(surfaces.uSurfCol.value).toBe(col);
    expect(surfaces.uSurfReady.value[SURF.TILES]).toBe(1);
  });
});
