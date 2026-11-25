import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { ClampToEdgeWrapping, LinearMipmapLinearFilter } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tour from '../content/routes/p-fuehrung.json';
import attribution from '../public/data/attribution.json';
import manifest from '../public/data/manifest.json';
import meta from '../public/data/terrain/meta.json';
import { decodeSurface } from '../src/data/decode';
import { loadTerrainSurface } from '../src/data/loader';
import { buildSurface } from '../src/world/rasters';
import { Terrain } from '../src/world/terrain';

const crop = meta.surface2025;
const encoded = [1, 250, 40, 6, 255, 9, 240, 0, 8, 2, 43, 96, 5, 254, 45, 172];
const decoded = [1, 250, 40, 6, 0, 3, 24, 6, 8, 2, 43, 96, 13, 0, 88, 12];

afterEach(() => vi.unstubAllGlobals());

describe('DGM1 terrain shading', () => {
  it('retains a bank that disappears when pairs of metre samples are averaged', () => {
    const slope = [0, 1, 1, 0];
    const dense = new Float32Array(32 * 32).map((_, i) => 300 + slope[i % 4]!);
    const coarse = new Float32Array(16 * 16).fill(300.5);
    const surface1m = buildSurface(dense, { cols: 32, rows: 32, cell: 1, x0: 0.5, z0: 0.5 });
    const surface2m = buildSurface(coarse, { cols: 16, rows: 16, cell: 2, x0: 1, z0: 1 });
    const bank = (16 * 32 + 11) * 4;
    const flat = (8 * 16 + 5) * 4;
    expect(surface2m.slice(flat, flat + 4)).toEqual(new Uint8Array([128, 128, 128, 128]));
    expect(surface1m[bank]).toBeGreaterThan(160); // normal points toward the descending slope
    expect(surface1m[bank + 1]).toBe(128);
    expect(surface1m[bank + 3]).toBeLessThan(128);
  });

  it('covers the shipped tour and palace within the byte ceiling and carries the DGM credit', () => {
    const file = readFileSync(new URL(`../public/data/${crop.path}`, import.meta.url));
    expect(file.byteLength).toBe(manifest.files['terrain/surface2025.rgba.deflate']);
    expect(file.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(attribution.items.find(({ id }) => id === 'dgm')).toMatchObject({
      licence: 'dl-de/by-2-0', files: expect.arrayContaining([`data/${crop.path}`]),
    });
    const raster = decodeSurface(new Uint8Array(inflateSync(file)), crop);
    for (const [x, z] of [...tour.points, [1216, -1114]]) {
      // Include the shader's edge fade and space for looking out from the route.
      expect(Math.min(x! - crop.x0, z! - crop.z0, crop.x0 + crop.cols - x!, crop.z0 + crop.rows - z!)).toBeGreaterThan(45);
      const index = (Math.floor(z! - crop.z0) * crop.cols + Math.floor(x! - crop.x0)) * 4;
      const nx = raster[index]! / 255 * 2 - 1;
      const nz = raster[index + 1]! / 255 * 2 - 1;
      expect(Math.hypot(nx, nz)).toBeLessThan(1.01);
    }
  });

  it('undoes negative and wrapped deltas per channel and resets at each row', () => {
    expect([...decodeSurface(new Uint8Array(encoded), { cols: 2, rows: 2 })]).toEqual(decoded);
    expect(() => decodeSurface(new Uint8Array(encoded), { cols: 2, rows: 3 })).toThrow('size mismatch');
  });

  it('loads the optional compressed raster under the game base URL and rejects HTTP failures', async () => {
    const data = Uint8Array.from(deflateSync(new Uint8Array(encoded)));
    const fetch = vi.fn(async () => new Response(data));
    vi.stubGlobal('fetch', fetch);
    const detail = { ...crop, cols: 2, rows: 2 };
    await expect(loadTerrainSurface('/kq/data/', detail)).resolves.toEqual(new Uint8Array(decoded));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/kq/data/${crop.path}`);
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(loadTerrainSurface('/kq/data/', detail)).rejects.toThrow('HTTP 404');
  });

  it('binds a clamped, mipmapped texture without adding terrain meshes or replacing base inputs', () => {
    const terrain = new Terrain(meta.cols, meta.rows, meta.cell, meta.origin.x, meta.origin.z);
    const meshes = [...terrain.object.children];
    const base = terrain.uniforms.uSurf!.value;
    terrain.setSurfaceDetail(new Uint8Array(decoded), { ...crop, cols: 2, rows: 2 });
    expect(terrain.uniforms.uSurf!.value).toBe(base);
    expect(terrain.object.children).toEqual(meshes);
    expect(terrain.uniforms.uSurfDetailGrid!.value).toEqual([crop.x0, crop.z0, 2, 2]);
    expect(terrain.uniforms.uSurfDetail!.value).toMatchObject({
      image: { width: 2, height: 2 }, wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping,
      minFilter: LinearMipmapLinearFilter, generateMipmaps: true,
    });
  });
});
