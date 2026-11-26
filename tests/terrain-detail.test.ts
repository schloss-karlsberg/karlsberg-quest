import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { ClampToEdgeWrapping, DataTexture, LinearMipmapLinearFilter, PerspectiveCamera, type InstancedBufferGeometry, type Mesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tour from '../content/routes/p-fuehrung.json';
import approach from '../content/routes/p-aufstieg.json';
import attribution from '../public/data/attribution.json';
import manifest from '../public/data/manifest.json';
import meta from '../public/data/terrain/meta.json';
import { decodeCanopy, decodeSurface } from '../src/data/decode';
import { loadTerrainRelief, loadTerrainSurface } from '../src/data/loader';
import { GROUND, RELIEF_TILE_M } from '../src/data/types';
import { BROOK_HALF, QUELLE, TRAIL, brookLine, clearings, trailLine } from '../src/systems/quelle/layout';
import { BAUWAGEN_SITE } from '../src/systems/scenery/bauwagen';
import { placeUnderstory } from '../src/systems/scenery/castle-understory';
import { placePlateauProps } from '../src/systems/scenery/palace-plateau';
import { TOUR_STOP_SETS } from '../src/systems/scenery/tour';
import { Polyline } from '../src/systems/walk/route';
import { buildSurface } from '../src/world/rasters';
import { Terrain } from '../src/world/terrain';
import { loadWorldData } from './world-data';

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

describe('DGM1 terrain geometry', () => {
  const relief = meta.relief2025;
  const file = readFileSync(new URL(`../public/data/${relief.path}`, import.meta.url));
  const data = new Uint8Array(inflateSync(file));
  const offset = (x: number, z: number) => data[(z - relief.z0) * relief.cols + x - relief.x0]! - 128;

  it('covers both routes and keeps the bounded, attributed offsets off base vertices and tile seams', () => {
    expect(data.length).toBe(relief.cols * relief.rows);
    expect(file.byteLength).toBe(manifest.files[relief.path as keyof typeof manifest.files]);
    expect(file.byteLength).toBeLessThanOrEqual(384 * 1024);
    expect(attribution.items.find(({ id }) => id === 'dgm')).toMatchObject({
      licence: 'dl-de/by-2-0', files: expect.arrayContaining([`data/${relief.path}`]),
    });
    let max = 0;
    let baseVerticesMoved = 0;
    for (let r = 0; r < relief.rows; r++) {
      for (let c = 0; c < relief.cols; c++) {
        const delta = data[r * relief.cols + c]! - 128;
        max = Math.max(max, Math.abs(delta));
        if (delta && (((r | c) & 1) === 0 || r % RELIEF_TILE_M === 0 || c % RELIEF_TILE_M === 0)) baseVerticesMoved++;
      }
    }
    expect(baseVerticesMoved).toBe(0);
    expect(max).toBe(32);
    for (const [x, z] of [...tour.points, ...approach.points]) {
      expect(Math.min(x! - relief.x0, z! - relief.z0, relief.x0 + relief.cols - 1 - x!, relief.z0 + relief.rows - 1 - z!)).toBeGreaterThan(24);
    }
    for (const [x, z] of [[524, -770], [683, -596], [897, -845], [1059, -833], [1199, -1115]] as const) {
      let nearby = 0;
      for (let dz = -23; dz <= 23; dz++) {
        for (let dx = -23; dx <= 23; dx++) {
          if (Math.hypot(dx, dz) < 24 && Math.abs(offset(x + dx, z + dz)) >= 5) nearby++;
        }
      }
      expect(nearby, `${x}/${z}`).toBeGreaterThan(10);
    }
  });

  it('keeps both treads, the brook and hollow, water, wagon and all fittings on the base mesh', () => {
    const { h2025: terrain, ground, paths, graph, footprints } = loadWorldData();
    const canopy = decodeCanopy(inflateSync(readFileSync(new URL('../public/data/terrain/canopy.u8.deflate', import.meta.url))));
    const source = { terrain, ground, paths, graph, canopy, footprintAt: (x: number, z: number) => footprints.footprintAt(x, z) };
    const props = placePlateauProps(source);
    expect(props).toHaveLength(10);
    const plants = (['weiher', 'quelle', 'plateau'] as const).flatMap((site) => placeUnderstory(source, site));
    expect(plants.length).toBeGreaterThan(30);
    const protectedCircles = [
      ...clearings(),
      [QUELLE.x, QUELLE.z, 12],
      [BAUWAGEN_SITE.x, BAUWAGEN_SITE.z, BAUWAGEN_SITE.clearing],
      ...TOUR_STOP_SETS.map(({ x, z }) => [x, z, 8]),
      ...TRAIL.flatMap((strand) => trailLine(strand)).map(({ x, z, half }) => [x, z, half]),
      ...[...props, ...plants].map(({ x, z, radius }) => [x, z, radius]),
    ] as [number, number, number][];
    for (const [x, z, radius] of protectedCircles) {
      const pad = radius + Math.SQRT2;
      for (let r = Math.ceil(z - pad); r <= z + pad; r++) {
        for (let c = Math.ceil(x - pad); c <= x + pad; c++) {
          if (Math.hypot(c - x, r - z) <= pad) expect(offset(c, r), `${c}/${r}`).toBe(0);
        }
      }
    }
    const lines = [
      [tour.points, 2],
      [approach.points, 2],
      [brookLine((x, z) => terrain.heightAt(x, z), 'today'), BROOK_HALF],
    ] as const;
    for (const [points, width] of lines) {
      const line = new Polyline(points as [number, number][]);
      for (let s = 0; s <= line.length; s += 0.5) {
        const { x, z } = line.pointAt(s);
        const pad = width + Math.SQRT2;
        for (let r = Math.ceil(z - pad); r <= z + pad; r++) {
          for (let c = Math.ceil(x - pad); c <= x + pad; c++) {
            if (Math.hypot(c - x, r - z) <= pad) expect(offset(c, r), `${c}/${r}`).toBe(0);
          }
        }
      }
    }
    // Nonzero vertices must also be clear of the nearby 2 m water and OSM cells.
    let unsafe = 0;
    for (let r = 0; r < relief.rows; r++) {
      for (let c = 0; c < relief.cols; c++) {
        if (data[r * relief.cols + c] === 128) continue;
        const bc = Math.round((relief.x0 + c - terrain.x0) / terrain.cell);
        const br = Math.round((relief.z0 + r - terrain.z0) / terrain.cell);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const i = (br + dr) * terrain.cols + bc + dc;
            if (ground[i] === GROUND.water || paths[i]! >= 0.2) unsafe++;
          }
        }
      }
    }
    expect(unsafe).toBe(0);
  });

  it('loads the optional offsets from the game base and rejects invalid buffers', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(file)));
    vi.stubGlobal('fetch', fetch);
    await expect(loadTerrainRelief('/kq/data/', relief)).resolves.toEqual(data);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/kq/data/${relief.path}`);
    await expect(loadTerrainRelief('/kq/data/', { ...relief, cols: relief.cols - 1 })).rejects.toThrow('size mismatch');
  });

  it('replaces nearby chunks with bounded instance batches and falls back by era, preset and view', () => {
    const { h2025, h1789 } = loadWorldData();
    const terrain = new Terrain(meta.cols, meta.rows, meta.cell, meta.origin.x, meta.origin.z);
    const texture = new DataTexture();
    const dataset = (hf = h2025) => ({
      key: hf === h2025 ? '2025' : '1789', hf, heightTex: texture, surfTex: texture, coverTex: texture,
      bounds: terrain.computeBounds(hf),
    });
    terrain.setDataset(dataset());
    const camera = new PerspectiveCamera(100, 1.5, 0.15, 800);
    const aim = (x: number, z: number, y = h2025.heightAt(x, z) + 3) => {
      camera.position.set(x, y, z);
      camera.lookAt(x + 10, y - 3, z + 8);
    };
    const measure = () => {
      terrain.update(camera);
      const meshes = terrain.object.children.filter(({ visible }) => visible) as Mesh<InstancedBufferGeometry>[];
      return { draws: meshes.length, tris: meshes.reduce((sum, { geometry }) => sum + geometry.instanceCount * geometry.index!.count / 3, 0) };
    };
    aim(1199, -1115.2);
    const base = measure();
    expect(terrain.object.children).toHaveLength(4);
    terrain.setReliefDetail(data, relief);
    expect(measure()).toEqual(base);
    const fine = terrain.object.getObjectByName('terrain-dgm1') as Mesh<InstancedBufferGeometry>;
    const coarse = terrain.object.getObjectByName('terrain-2m-tiles') as Mesh<InstancedBufferGeometry>;

    terrain.reliefEnabled = true;
    const refined = measure();
    expect(fine.visible).toBe(true);
    expect(refined.draws - base.draws).toBeLessThanOrEqual(2);
    expect(refined.tris - base.tris).toBeGreaterThan(0);
    expect(refined.tris - base.tris).toBeLessThanOrEqual(28_416);
    expect(fine.geometry.instanceCount).toBeLessThanOrEqual(9);
    expect((fine.geometry.attributes.position!.count - 4 * 32)).toBe(33 * 33);
    expect(coarse.geometry.instanceCount + fine.geometry.instanceCount).toBeGreaterThanOrEqual(16);
    expect((coarse.geometry.instanceCount + fine.geometry.instanceCount) % 16).toBe(0);
    const tiles = [...[coarse, fine].flatMap(({ geometry }) => {
      const attr = geometry.getAttribute('aChunk');
      return Array.from({ length: geometry.instanceCount }, (_, i) => `${attr.getX(i)}/${attr.getY(i)}`);
    })];
    expect(new Set(tiles).size).toBe(tiles.length);

    terrain.uniforms.uScanMix!.value = 1;
    expect(measure()).toEqual(base);
    terrain.uniforms.uScanMix!.value = 0;
    terrain.uniforms.uMapMix!.value = 1;
    expect(measure()).toEqual(base);
    terrain.uniforms.uMapMix!.value = 0;
    terrain.setDataset(dataset(h1789));
    measure();
    expect(fine.visible).toBe(false);
    terrain.setDataset(dataset());
    aim(1199, -1115.2, h2025.heightAt(1199, -1115.2) + 300);
    measure();
    expect(fine.visible).toBe(false);
    aim(350, -1115);
    measure();
    expect(fine.visible).toBe(false);
    aim(1199, -1115.2);
    expect(measure()).toEqual(refined);
    terrain.reliefEnabled = false;
    expect(measure()).toEqual(base);
  });
});
