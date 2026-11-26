import { deflateSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { loadGameData } from '../src/data/loader';
import { GROUND, GROUND_NAMES } from '../src/data/types';

afterEach(() => { vi.unstubAllGlobals(); });

/** A two-cell world with different height deltas, surfaces and canopy heights in each cell. */
function serveTerrain(layers: { ground?: number[]; canopy?: number[] } = {}): void {
  const rasters: Record<string, number[]> = {
    'present.bin': [0, 0, 4, 0], 'past.bin': [1, 0, 255, 255],
    'ground.bin': layers.ground ?? [GROUND.vineyard, GROUND.parterre_sand],
    'canopy.bin': layers.canopy ?? [0, 255],
  };
  const files = {
    h2025: { path: 'present.bin' }, h1789: { path: 'past.bin' },
    ground: { path: 'ground.bin' }, canopy: { path: 'canopy.bin' },
  };
  const catalogue: Record<string, unknown> = {
    'terrain/meta.json': { cols: 2, rows: 1, hMin: 100, heightScale: 0.25, files },
    'palace/footprints.json': { buildings: [] }, 'palace/rooms.json': { rooms: [] },
    'pois.json': { pois: [] }, 'paths.json': { nodes: [], edges: [] }, 'attribution.json': { items: [] },
  };
  vi.stubGlobal('fetch', async (url: string) => {
    const base = '/tour/data/';
    if (!url.startsWith(base)) throw new Error(`Unexpected URL ${url}`);
    const path = url.slice(base.length);
    if (path in catalogue) return Response.json(catalogue[path]);
    const raster = rasters[path];
    if (!raster) throw new Error(`Unexpected raster ${path}`);
    return new Response(Uint8Array.from(deflateSync(Uint8Array.from(raster))));
  });
}

it('assembles both eras on the same grid with the correct ground surfaces and canopy units', async () => {
  serveTerrain();
  const data = await loadGameData('/tour/data/');
  expect([...data.heights['2025']]).toEqual([100, 101]);
  expect([...data.heights['1789']]).toEqual([100.25, 100.75]);
  expect(Array.from(data.ground, (code) => GROUND_NAMES[code])).toEqual(['meadow', 'sand']);
  expect([...data.canopy]).toEqual([0, 63.75]);
  expect(data.baseUrl).toBe('/tour/data/');
});

it.each(['ground', 'canopy'] as const)('rejects a %s layer with too few or too many cells', async (layer) => {
  for (const bytes of [[0], [0, 1, 2]]) {
    serveTerrain({ [layer]: bytes });
    await expect(loadGameData('/tour/data/')).rejects.toThrow(layer);
  }
});
