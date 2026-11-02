/**
 * Data prep: reads the sister projects' published data READ-ONLY and writes compact game assets
 * into public/data/. Never writes, builds or runs anything inside the sister repos.
 *
 *   pnpm prepare-data            (expects ../saar-lidar-explorer next to this repo)
 *   KQ_SISTER=/path/to/saar-lidar-explorer pnpm prepare-data
 *
 * Output (all coordinates in the local frame x = E − 381000, y = h, z = −(N − 5465000)):
 *   terrain/meta.json                grid description + file list
 *   terrain/h2025.u16.deflate        2 m heights today, uint16 cm above hMin, left-delta coded, zlib
 *   terrain/h1789.u16.deflate        2 m heights 1789 hypothesis, int16 cm difference to 2025, zlib
 *   terrain/ground.u8.deflate        2 m land-cover classes (catalogue classes 0..7)
 *   terrain/canopy.u8.deflate        2 m canopy height today (DOM − DGM, max-pooled), 0.25 m units
 *   maps/hist1840.jpg                Bavarian survey 1836–41, 2 m/px, crop-aligned
 *   maps/hist1935.jpg                TK25 1935–40 ("Messtischblatt"), 2 m/px, crop-aligned (karlsberg AOI, overall fallback)
 *   pointcloud/ground.kqp.deflate    ALS 2025 ground points around the palace (Röntgenblick), see the section below
 *   palace/buildings.glb             1789 light model (copied verbatim, meshopt)
 *   palace/footprints.json           91 footprints (local x/z) + heights/confidence
 *   palace/rooms.json                114 named rooms, polygons converted to local x/z
 *   pois.json                        44 POIs with sources, local coords
 *   paths.json                       OSM path graph (nodes with heights, edges) + water/barrier lines
 *   attribution.json                 licence strings for the attribution screen
 *   manifest.json                    index of everything above, sizes, generation date
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import proj4 from 'proj4';
import { type P2, centroid, nearestOnLine, openRing, planFrame, stToEN } from './lib/frame.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SISTER = resolve(process.env.KQ_SISTER ?? join(ROOT, '..', 'saar-lidar-explorer'));
const OUT = join(ROOT, 'public', 'data');

const SRC = {
  terrain: join(SISTER, 'schloss-karlsberg/viewer/public/terrain'),
  recon: join(SISTER, 'app/public/data/shared/karlsberg1789'),
  catalogue: join(SISTER, 'schloss-karlsberg/model/catalogue.json'),
  pois: join(SISTER, 'app/public/data/pois.geojson'),
  overall: join(SISTER, 'app/public/data/overall'),
  karlsberg: join(SISTER, 'app/public/data/karlsberg'),
};

const E0 = 381000;
const N0 = 5465000;
const CELL = 2; // output metres per sample

proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

function log(...a: unknown[]) {
  console.log('[prepare-data]', ...a);
}
function readJson<T = any>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}
function write(rel: string, data: Buffer | string) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  return p;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

for (const p of Object.values(SRC)) {
  if (!existsSync(p)) throw new Error(`missing sister input: ${p} (set KQ_SISTER)`);
}

// ---------------------------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------------------------
const tmeta = readJson(join(SRC.terrain, 'meta.json'));
const g = tmeta.grid;
if (g.cell !== 1 || tmeta.local_frame.E0 !== E0 || tmeta.local_frame.N0 !== N0) throw new Error('unexpected terrain grid');
const cols1 = g.cols as number;
const rows1 = g.rows as number;
const cols = Math.floor(cols1 / CELL);
const rows = Math.floor(rows1 / CELL);
const west = g.west as number;
const north = g.north as number;

function readF32(name: string): Float32Array {
  const b = readFileSync(join(SRC.terrain, name));
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
function down2(src: Float32Array): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * CELL * cols1 + c * CELL;
      out[r * cols + c] = (src[i]! + src[i + 1]! + src[i + cols1]! + src[i + cols1 + 1]!) / 4;
    }
  }
  return out;
}
const h2025 = down2(readF32(tmeta.files.dtm2025));
const h1789 = down2(readF32(tmeta.files.dtm1789));
let hMin = Infinity;
let hMax = -Infinity;
for (const a of [h2025, h1789]) for (const v of a) {
  if (!Number.isFinite(v)) throw new Error('NaN in terrain');
  hMin = Math.min(hMin, v);
  hMax = Math.max(hMax, v);
}
hMin = Math.floor(hMin) - 1;
const q2025 = new Uint16Array(cols * rows);
const q1789 = new Uint16Array(cols * rows);
for (let i = 0; i < q2025.length; i++) {
  q2025[i] = Math.round((h2025[i]! - hMin) * 100);
  q1789[i] = Math.round((h1789[i]! - hMin) * 100);
}
// 2025: left-delta coding (first column against the row above) -> int16 residuals, then zlib.
const d2025 = new Int16Array(cols * rows);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    const pred = c > 0 ? q2025[i - 1]! : r > 0 ? q2025[i - cols]! : 0;
    d2025[i] = q2025[i]! - pred;
  }
}
// 1789: difference to 2025 in cm (mostly zero).
const d1789 = new Int16Array(cols * rows);
for (let i = 0; i < d1789.length; i++) d1789[i] = q1789[i]! - q2025[i]!;

const z = (a: ArrayBufferView) => deflateSync(Buffer.from(a.buffer, a.byteOffset, a.byteLength), { level: 9 });
write('terrain/h2025.u16.deflate', z(d2025));
write('terrain/h1789.u16.deflate', z(d1789));

// Ground classes are already 2 m on the same extent.
const gm = tmeta.ground;
if (gm.cols !== cols || gm.rows !== rows) throw new Error(`ground grid ${gm.cols}x${gm.rows} != ${cols}x${rows}`);
const ground = readFileSync(join(SRC.terrain, tmeta.files.ground));
write('terrain/ground.u8.deflate', deflateSync(ground, { level: 9 }));

// ---------------------------------------------------------------------------------------------
// Overall-AOI raster layers (canopy height, 1840 map) -> crop-aligned 2 m rasters
// ---------------------------------------------------------------------------------------------
const om = readJson(join(SRC.overall, 'manifest.json'));
const oE0 = om.origin.E0 as number;
const oNorth = (om.origin.N0 as number) + om.size.height * om.cellSize;
const ocs = om.chunkSize as number;
const chunkCache = new Map<string, { w: number; h: number; ch: number; data: Uint8Array } | null>();
function overallChunk(template: string, i: number, j: number) {
  const key = `${template}|${i}_${j}`;
  if (chunkCache.has(key)) return chunkCache.get(key)!;
  const p = join(SRC.overall, template.replace('{i}', String(i)).replace('{j}', String(j)));
  let v: { w: number; h: number; ch: number; data: Uint8Array } | null = null;
  if (existsSync(p)) {
    const buf = readFileSync(p);
    if (p.endsWith('.png')) {
      const png = PNG.sync.read(buf);
      v = { w: png.width, h: png.height, ch: 4, data: png.data };
    } else {
      const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
      v = { w: img.width, h: img.height, ch: 4, data: img.data };
    }
  }
  chunkCache.set(key, v);
  return v;
}
/** Sample an overall layer at EPSG:25832 (E, N); returns RGBA or null when outside. */
function sampleOverall(template: string, E: number, N: number, pxPerChunk: number): Uint8Array | null {
  const cx = E - oE0;
  const cy = oNorth - N;
  const i = Math.floor(cx / ocs);
  const j = Math.floor(cy / ocs);
  const ch = overallChunk(template, i, j);
  if (!ch) return null;
  const s = pxPerChunk / ocs;
  const px = Math.min(ch.w - 1, Math.floor((cx - i * ocs) * s));
  const py = Math.min(ch.h - 1, Math.floor((cy - j * ocs) * s));
  const o = (py * ch.w + px) * 4;
  return ch.data.subarray(o, o + 4);
}

// Canopy: 1 m CHM, max-pooled to 2 m, stored in 0.25 m units (0..160).
const chm = om.layers.chm;
const bldg = om.layers.bldg;
const canopy = new Uint8Array(cols * rows);
let canopyMissing = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    let m = 0;
    let any = false;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const E = west + c * CELL + dx + 0.5;
      const N = north - r * CELL - dy - 0.5;
      const px = sampleOverall(chm.path, E, N, ocs);
      const bm = sampleOverall(bldg.path, E, N, ocs);
      if (bm && bm[0]! > 0) continue; // LoD2 building, not a tree crown
      if (px) {
        any = true;
        m = Math.max(m, (px[0]! / 255) * (chm.max - chm.min) + chm.min);
      }
    }
    if (!any) canopyMissing++;
    canopy[r * cols + c] = Math.min(255, Math.round(m * 4));
  }
}
write('terrain/canopy.u8.deflate', deflateSync(Buffer.from(canopy), { level: 9 }));
log(`canopy: ${canopyMissing} cells without CHM`);

// 1840 map at 2 m/px.
const hist = om.layers.hist_1840;
const histRGBA = Buffer.alloc(cols * rows * 4);
let histCovered = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const E = west + (c + 0.5) * CELL;
    const N = north - (r + 0.5) * CELL;
    const px = sampleOverall(hist.path, E, N, hist.pixelsPerChunk);
    const o = (r * cols + c) * 4;
    if (px) {
      histRGBA[o] = px[0]!;
      histRGBA[o + 1] = px[1]!;
      histRGBA[o + 2] = px[2]!;
      histCovered++;
    } else {
      histRGBA[o] = 226;
      histRGBA[o + 1] = 216;
      histRGBA[o + 2] = 190;
    }
    histRGBA[o + 3] = 255;
  }
}
write('maps/hist1840.jpg', Buffer.from(jpeg.encode({ data: histRGBA, width: cols, height: rows }, 82).data));
log(`hist1840: ${((100 * histCovered) / (cols * rows)).toFixed(1)} % covered`);

// 1935 map (TK25 1935–40, "Messtischblatt") at 2 m/px, same crop as the 1840 map. Primary source
// is the karlsberg AOI (1 px/m chunks, 500 m), cells outside it fall back to the overall AOI.
const kbm = readJson(join(SRC.karlsberg, 'manifest.json'));
const hist35 = kbm.layers.hist_1935;
const hist35o = om.layers.hist_1935;
if (!hist35 || hist35.encoding !== 'rgb') throw new Error('karlsberg manifest: hist_1935 layer missing');
const kbE0 = kbm.origin.E0 as number;
const kbNorth = (kbm.origin.N0 as number) + kbm.size.height * kbm.cellSize;
const kbcs = kbm.chunkSize as number;
const kbCache = new Map<string, { w: number; h: number; data: Uint8Array } | null>();
function sampleKarlsberg(template: string, E: number, N: number, pxPerChunk: number): Uint8Array | null {
  const cx = E - kbE0;
  const cy = kbNorth - N;
  if (cx < 0 || cy < 0 || cx >= kbm.size.width * kbm.cellSize || cy >= kbm.size.height * kbm.cellSize) return null;
  const i = Math.floor(cx / kbcs);
  const j = Math.floor(cy / kbcs);
  const key = `${template}|${i}_${j}`;
  let ch = kbCache.get(key);
  if (ch === undefined) {
    const p = join(SRC.karlsberg, template.replace('{i}', String(i)).replace('{j}', String(j)));
    ch = null;
    if (existsSync(p)) {
      const img = jpeg.decode(readFileSync(p), { useTArray: true, formatAsRGBA: true });
      ch = { w: img.width, h: img.height, data: img.data };
    }
    kbCache.set(key, ch);
  }
  if (!ch) return null;
  const s = pxPerChunk / kbcs;
  const px = Math.min(ch.w - 1, Math.floor((cx - i * kbcs) * s));
  const py = Math.min(ch.h - 1, Math.floor((cy - j * kbcs) * s));
  const o = (py * ch.w + px) * 4;
  return ch.data.subarray(o, o + 4);
}
const h35RGBA = Buffer.alloc(cols * rows * 4);
let h35Covered = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const E = west + (c + 0.5) * CELL;
    const N = north - (r + 0.5) * CELL;
    const px = sampleKarlsberg(hist35.path, E, N, hist35.pixelsPerChunk) ?? (hist35o ? sampleOverall(hist35o.path, E, N, hist35o.pixelsPerChunk) : null);
    const o = (r * cols + c) * 4;
    if (px) {
      h35RGBA[o] = px[0]!;
      h35RGBA[o + 1] = px[1]!;
      h35RGBA[o + 2] = px[2]!;
      h35Covered++;
    } else {
      h35RGBA[o] = 236;
      h35RGBA[o + 1] = 232;
      h35RGBA[o + 2] = 220;
    }
    h35RGBA[o + 3] = 255;
  }
}
write('maps/hist1935.jpg', Buffer.from(jpeg.encode({ data: h35RGBA, width: cols, height: rows }, 82).data));
log(`hist1935: ${((100 * h35Covered) / (cols * rows)).toFixed(1)} % covered`);

// ---------------------------------------------------------------------------------------------
// Height sampling helper for vectors (bilinear on the 2 m 2025 grid)
// ---------------------------------------------------------------------------------------------
const X0 = west - E0 + CELL / 2; // local x of sample column 0
const Z0 = -(north - N0) + CELL / 2; // local z of sample row 0
function heightAt(a: Float32Array, x: number, zz: number): number {
  const fc = Math.max(0, Math.min(cols - 1.001, (x - X0) / CELL));
  const fr = Math.max(0, Math.min(rows - 1.001, (zz - Z0) / CELL));
  const c = Math.floor(fc);
  const r = Math.floor(fr);
  const tx = fc - c;
  const ty = fr - r;
  const i = r * cols + c;
  const h00 = a[i]!;
  const h10 = a[i + 1]!;
  const h01 = a[i + cols]!;
  const h11 = a[i + cols + 1]!;
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
}
const toLocal = (E: number, N: number): P2 => [E - E0, -(N - N0)];

// ---------------------------------------------------------------------------------------------
// Röntgenblick: ground points of the 2025 ALS cloud around the palace (sle-pts-v1 → kq-pts-v1)
// ---------------------------------------------------------------------------------------------
// Source tiles: 100 m, header 16 B ('SLEP', u16 version, u16 0, u32 count, f32 hBase), records of
// 10 B (u16 dE cm, u16 dN cm from the tile's lower-left corner, u16 h cm above hBase, i16 agl cm,
// u8 class, u8 intensity), points shuffled (any prefix is a uniform subsample).
// Output (all little endian, one zlib stream), points sorted by 20 m cell (row-major, north row
// first) then by z, x:
//   u32 offsets[cells + 1]         first point of each cell
//   u16 dx[n]                      x in 2 cm units from x0, delta-coded mod 2^16 against the previous point
//   u16 dz[n]                      z in 2 cm units from z0, likewise
//   i8  res[n]                     height above the quantised 2 m 2025 DTM (bilinear) in 2 cm units
//   u8  cls[n]                     LAS class (2 ground, 6 building, 9 water, 24 cellar)
// The game rebuilds y = heightAt(x, z) + res of the current era's heightfield.
const pcm = kbm.pointclouds;
const pcArea = pcm?.areas?.[0];
let pointMeta: Record<string, unknown> | null = null;
if (pcm?.format === 'sle-pts-v1' && pcArea) {
  const KEEP = 0.82; // fraction of ground points kept (budget ≤ 3 MB)
  const PCELL = 20;
  const ts = pcm.tileSize as number;
  const [bw, bs, be, bn] = pcArea.bbox as number[];
  const px0 = bw! - E0;
  const pz0 = -(bn! - N0);
  const pnc = Math.round((be! - bw!) / PCELL);
  const pnr = Math.round((bn! - bs!) / PCELL);
  const hq = new Float32Array(cols * rows);
  for (let i = 0; i < hq.length; i++) hq[i] = hMin + q2025[i]! * 0.01;
  const keepClasses = new Set([2, 6, 9, 24]);
  const pts: { cell: number; X: number; Z: number; res: number; cls: number }[] = [];
  let seen = 0;
  for (const [tx, ty] of pcArea.tiles as [number, number, number][]) {
    const p = join(SRC.karlsberg, (pcArea.path as string).replace('{tx}', String(tx)).replace('{ty}', String(ty)));
    if (!existsSync(p)) continue;
    const b = readFileSync(p);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== 'SLEP') throw new Error(`pointcloud: bad magic in ${p}`);
    const n = dv.getUint32(8, true);
    const hb = dv.getFloat32(12, true);
    for (let k = 0; k < n; k++) {
      const o = 16 + k * 10;
      const cls = dv.getUint8(o + 8);
      if (!keepClasses.has(cls)) continue;
      // deterministic thinning (Knuth hash of a running index)
      if ((Math.imul(seen++, 2654435761) >>> 0) % 1000 >= KEEP * 1000) continue;
      const E = bw! + tx * ts + dv.getUint16(o, true) / 100;
      const N = bs! + ty * ts + dv.getUint16(o + 2, true) / 100;
      const h = hb + dv.getUint16(o + 4, true) / 100;
      const [x, zz] = toLocal(E, N);
      const X = Math.round((x - px0) * 50);
      const Z = Math.round((zz - pz0) * 50);
      if (X < 0 || Z < 0 || X >= pnc * PCELL * 50 || Z >= pnr * PCELL * 50) continue;
      const cell = Math.floor(Z / (PCELL * 50)) * pnc + Math.floor(X / (PCELL * 50));
      const res = Math.max(-127, Math.min(127, Math.round((h - heightAt(hq, x, zz)) / 0.02)));
      pts.push({ cell, X, Z, res, cls });
    }
  }
  pts.sort((a, b) => a.cell - b.cell || a.Z - b.Z || a.X - b.X);
  const n = pts.length;
  const cells = pnc * pnr;
  const offs = new Uint32Array(cells + 1);
  for (const p of pts) offs[p.cell + 1]!++;
  for (let i = 0; i < cells; i++) offs[i + 1]! += offs[i]!;
  const dX = new Uint16Array(n);
  const dZ = new Uint16Array(n);
  const res = new Int8Array(n);
  const cl = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const prev = i > 0 ? pts[i - 1]! : { X: 0, Z: 0 };
    dX[i] = (p.X - prev.X) & 0xffff;
    dZ[i] = (p.Z - prev.Z) & 0xffff;
    res[i] = p.res;
    cl[i] = p.cls;
  }
  const buf = Buffer.concat([offs, dX, dZ, res, cl].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
  write('pointcloud/ground.kqp.deflate', deflateSync(buf, { level: 9 }));
  pointMeta = {
    format: 'kq-pts-v1',
    path: 'pointcloud/ground.kqp.deflate',
    count: n,
    x0: px0,
    z0: pz0,
    cell: PCELL,
    cols: pnc,
    rows: pnr,
    xyScale: 0.02,
    resScale: 0.02,
    classes: { 2: 'Boden', 6: 'Gebäude', 9: 'Wasser', 24: 'Keller' },
    keep: KEEP,
    source: `${pcArea.name_de}: ${(pcArea.source as string[]).join(', ')}`,
    attribution: pcm.attribution,
    encoding: 'zlib(u32 offsets[cols*rows+1] | u16 dx[n] | u16 dz[n] (2 cm, delta mod 2^16) | i8 res[n] (2 cm above 2025 DTM) | u8 class[n])',
  };
  log(`pointcloud: ${n} ground points (${((100 * n) / Math.max(1, seen)).toFixed(0)} % of ${seen})`);
} else {
  log('pointcloud: karlsberg manifest has no sle-pts-v1 area, skipped');
}
const extent = { x0: west - E0, x1: g.east - E0, z0: -(north - N0), z1: -(g.south - N0) };
const inside = (x: number, zz: number, m = 0) => x >= extent.x0 + m && x <= extent.x1 - m && zz >= extent.z0 + m && zz <= extent.z1 - m;

// ---------------------------------------------------------------------------------------------
// Palace: glb copy, footprints, rooms
// ---------------------------------------------------------------------------------------------
mkdirSync(join(OUT, 'palace'), { recursive: true });
copyFileSync(join(SRC.recon, 'buildings.glb'), join(OUT, 'palace/buildings.glb'));
const reconIndex = readJson(join(SRC.recon, 'index.json'));
const catalogue = readJson(SRC.catalogue);
const catById = new Map<string, any>(catalogue.buildings.map((b: any) => [b.id, b]));
const reconById = new Map<string, any>(reconIndex.buildings.map((b: any) => [b.id, b]));
const fpGeo = readJson(join(SRC.recon, 'footprints.geojson'));
const footprints = fpGeo.features.map((f: any) => {
  const id = f.properties.id as string;
  const cat = catById.get(id);
  const rec = reconById.get(id);
  const ring = openRing(f.geometry.coordinates[0]).map(([E, N]: P2) => toLocal(E, N).map(r2));
  return {
    id,
    name_de: f.properties.name_de,
    confidence: f.properties.confidence,
    base_h: cat?.base_h ?? null,
    eaves_h: rec?.eaves_h ?? null,
    ridge_h: rec?.ridge_h ?? null,
    cls: cat?.cls ?? rec?.cls ?? null,
    interior: cat?.interior ?? null,
    ring,
  };
});

function courtTowardEN(b: any, from: P2): P2 {
  const v = b.court_toward;
  if (Array.isArray(v)) return v as P2;
  if (typeof v === 'string') {
    const f = catalogue.terrain_features.find((x: any) => x.id === v);
    if (f) {
      const gg = f.geometry;
      if (gg.type === 'LineString') return nearestOnLine(gg.coordinates, from);
      if (gg.type === 'Polygon') return centroid(gg.coordinates[0]);
      if (gg.type === 'Point') return [gg.coordinates[0], gg.coordinates[1]];
      if (gg.type === 'MultiPoint') {
        const n = gg.coordinates.length;
        return [gg.coordinates.reduce((s: number, p: P2) => s + p[0], 0) / n, gg.coordinates.reduce((s: number, p: P2) => s + p[1], 0) / n];
      }
    }
    const ob = catById.get(v);
    if (ob?.footprint) return centroid(ob.footprint);
  }
  return catalogue.palace_grid.origin_EN as P2;
}
const evidenceOf = (tag: string | undefined): string => {
  const m = /^\s*(HMS|D->|D|I|N|U)\b/.exec(tag ?? '');
  return m ? m[1]! : 'U';
};
const rooms: any[] = [];
for (const b of catalogue.buildings) {
  if (!b.rooms?.length || !b.footprint) continue;
  const ring = b.footprint as P2[];
  const frame = planFrame(ring, courtTowardEN(b, centroid(ring)));
  for (const room of b.rooms) {
    const poly = (room.polygon as P2[]).map((p) => {
      const [E, N] = stToEN(frame, p);
      return toLocal(E, N).map(r2);
    });
    const storey = b.storeys[room.storey];
    rooms.push({
      id: `${b.id}/${room.id}`,
      roomId: room.id,
      building: b.id,
      name_de: room.name_de,
      function: room.function,
      storey: room.storey,
      storey_de: storey?.name ?? null,
      floor_h: room.floor_h,
      ceiling_h: room.ceiling_h,
      evidence: evidenceOf(room.tag),
      tag: room.tag,
      polygon: poly,
    });
  }
}
// Self-check: every room vertex must lie inside (or within 1 m of) its building footprint.
{
  const fpById = new Map<string, P2[]>(footprints.map((f: any) => [f.id, f.ring]));
  let bad = 0;
  let worst = 0;
  for (const r of rooms) {
    const ring = fpById.get(r.building);
    if (!ring) continue;
    for (const v of r.polygon as P2[]) {
      if (pointInRing(v, ring)) continue;
      const d = distToRing(v, ring);
      worst = Math.max(worst, d);
      if (d > 1) bad++;
    }
  }
  log(`rooms: ${rooms.length}; vertices outside footprint by > 1 m: ${bad} (worst ${worst.toFixed(2)} m)`);
  if (bad > 0) throw new Error('room frame mismatch - did the catalogue frame rules change?');
}
function pointInRing(pt: P2, ring: readonly P2[]): boolean {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function distToRing(pt: P2, ring: readonly P2[]): number {
  const q = nearestOnLine([...ring, ring[0]!], pt);
  return Math.hypot(q[0] - pt[0], q[1] - pt[1]);
}

// ---------------------------------------------------------------------------------------------
// POIs
// ---------------------------------------------------------------------------------------------
const poiGeo = readJson(SRC.pois);
const pois = poiGeo.features.map((f: any) => {
  const [lon, lat] = f.geometry.coordinates;
  const [E, N] = proj4('EPSG:4326', 'EPSG:25832', [lon, lat]);
  const [x, zz] = toLocal(E, N);
  const p = f.properties;
  const ins = inside(x, zz);
  return {
    id: p.id,
    name_de: p.name,
    type: p.type,
    confidence: p.confidence,
    x: r2(x),
    z: r2(zz),
    y: ins ? r2(heightAt(h2025, x, zz)) : null,
    inArea: ins,
    source: p.source,
    sources: p.sources ?? [p.source],
    note: p.note ?? '',
  };
});
log(`pois: ${pois.length} (${pois.filter((p: any) => p.inArea).length} inside the game area)`);

// ---------------------------------------------------------------------------------------------
// OSM path graph
// ---------------------------------------------------------------------------------------------
const osm = readJson(join(SRC.overall, om.vectors.osm.path));
const WALK_KINDS = ['path', 'track', 'road'];
const nodeIndex = new Map<string, number>();
const nodes: number[] = []; // x, y, z flattened
const edges: number[] = []; // a, b, kind, length*10 flattened
const lines: { kind: string; name?: string; pts: number[] }[] = [];

function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a]!;
    const B = pts[b]!;
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const L = Math.hypot(dx, dy) || 1e-9;
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i]!;
      const d = Math.abs((P[0] - A[0]) * dy - (P[1] - A[1]) * dx) / L;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  // also keep a vertex at least every 25 m so heights along edges stay faithful
  const out: P2[] = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) acc += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    if (keep[i] || acc >= 25) {
      out.push(pts[i]!);
      acc = 0;
    }
  }
  return out;
}
function nodeId(p: P2): number {
  const key = `${Math.round(p[0] * 2)}_${Math.round(p[1] * 2)}`; // 0.5 m snap
  let id = nodeIndex.get(key);
  if (id === undefined) {
    id = nodes.length / 3;
    nodes.push(r2(p[0]), r2(heightAt(h2025, p[0], p[1])), r2(p[1]));
    nodeIndex.set(key, id);
  }
  return id;
}
/** Clip a polyline to the extent (keeps runs of inside vertices). */
function clipRuns(pts: P2[]): P2[][] {
  const runs: P2[][] = [];
  let cur: P2[] = [];
  for (const p of pts) {
    if (inside(p[0], p[1], 2)) cur.push(p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length >= 2);
}
for (const f of osm.features) {
  const kind = f.properties.kind as string;
  const parts: number[][][] = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    const local = part.map(([E, N]) => toLocal(E!, N!));
    for (const run of clipRuns(local)) {
      const s = simplify(run, 1.0);
      const k = WALK_KINDS.indexOf(kind);
      if (k >= 0) {
        for (let i = 1; i < s.length; i++) {
          const a = nodeId(s[i - 1]!);
          const b = nodeId(s[i]!);
          if (a === b) continue;
          const len = Math.hypot(s[i]![0] - s[i - 1]![0], s[i]![1] - s[i - 1]![1]);
          edges.push(a, b, k, Math.round(len * 10) / 10);
        }
      } else {
        lines.push({ kind, name: f.properties.name, pts: s.flatMap((p) => [r2(p[0]), r2(p[1])]) });
      }
    }
  }
}
const paths = {
  format: 'kq-paths-v1',
  note: 'nodes: [x, y, z] triples (local frame, y = 2025 terrain height); edges: [a, b, kind, length_m] quads; kinds index into `kinds`. lines: non-walkable OSM features (water, barrier, rail) as [x, z] pairs.',
  kinds: WALK_KINDS,
  nodes,
  edges,
  lines,
};
log(`paths: ${nodes.length / 3} nodes, ${edges.length / 4} edges, ${lines.length} other lines`);

// ---------------------------------------------------------------------------------------------
// Meta, attribution, manifest
// ---------------------------------------------------------------------------------------------
const terrainMeta = {
  format: 'kq-terrain-v1',
  crs: 'EPSG:25832',
  heightDatum: 'DHHN2016',
  frame: { E0, N0, rule: 'x = E - E0, y = h, z = -(N - N0)' },
  extentEN: { west, north, east: g.east, south: g.south },
  extentLocal: extent,
  cell: CELL,
  cols,
  rows,
  /** local x/z of sample (col 0, row 0); sample (c, r) is at (x0 + c·cell, z0 + r·cell). */
  origin: { x: X0, z: Z0 },
  hMin,
  hMax: Math.ceil(hMax),
  heightScale: 0.01,
  files: {
    h2025: { path: 'terrain/h2025.u16.deflate', encoding: 'zlib(int16 left-delta of uint16 cm above hMin)' },
    h1789: { path: 'terrain/h1789.u16.deflate', encoding: 'zlib(int16 cm difference to h2025)' },
    ground: { path: 'terrain/ground.u8.deflate', encoding: 'zlib(uint8 class)', classes: gm.classes },
    canopy: { path: 'terrain/canopy.u8.deflate', encoding: 'zlib(uint8 canopy height in 0.25 m)', note: 'today (ALS 2025 DOM - DGM), max of 1 m cells, LoD2 building cells removed' },
  },
  hist1840: { path: 'maps/hist1840.jpg', covered: histCovered / (cols * rows), note: 'georeferencing off by tens of metres in places' },
  hist1935: { path: 'maps/hist1935.jpg', covered: h35Covered / (cols * rows), note: 'TK25 1935–40, ≈ 10–15 m off near the palace' },
  ...(pointMeta ? { pointcloud: pointMeta } : {}),
};
write('terrain/meta.json', JSON.stringify(terrainMeta, null, 1));
write('palace/footprints.json', JSON.stringify({ format: 'kq-footprints-v1', disclaimer_de: reconIndex.disclaimer_de, anchor: { x: r2(reconIndex.anchor.E - E0), z: r2(-(reconIndex.anchor.N - N0)) }, buildings: footprints }));
write('palace/rooms.json', JSON.stringify({ format: 'kq-rooms-v1', catalogueVersion: catalogue.version, note: 'polygon = room outline in local x/z (open ring); floor_h/ceiling_h absolute heights; evidence = leading tag D/D->/I/N/U/HMS', rooms }));
write('pois.json', JSON.stringify({ format: 'kq-pois-v1', attribution: poiGeo.attribution, pois }));
write('paths.json', JSON.stringify(paths));

const attribution = {
  generated: new Date().toISOString(),
  items: [
    { id: 'dgm', label_de: 'Gelände (DGM1 2025)', text: tmeta.attribution, licence: 'dl-de/by-2-0', url: 'https://www.govdata.de/dl-de/by-2-0' },
    { id: 'terrain1789', label_de: 'Gelände 1789', text: '1789-Gelände = Hypothese des Teilprojekts schloss-karlsberg (Generator-Regeln aus dem Katalog), abgeleitet aus GeoBasis-DE/LVGL-SL (2026), dl-de/by-2-0', licence: 'dl-de/by-2-0' },
    { id: 'canopy', label_de: 'Vegetationshöhe', text: '© GeoBasis-DE/LVGL-SL (2026), dl-de/by-2-0, Daten bearbeitet (DOM1 − DGM1)', licence: 'dl-de/by-2-0' },
    { id: 'hist1840', label_de: hist.label_de, text: hist.attribution, source: hist.source, licence: 'dl-de/by-2-0' },
    { id: 'hist1935', label_de: hist35.label_de, text: hist35.attribution, source: hist35.source, licence: 'dl-de/by-2-0' },
    ...(pointMeta ? [{ id: 'pointcloud', label_de: 'Punktwolke (ALS 2025, Bodenpunkte)', text: String(pointMeta.attribution), source: String(pointMeta.source), licence: 'dl-de/by-2-0' }] : []),
    { id: 'recon', label_de: 'Rekonstruktion 1789', text: reconIndex.attribution, disclaimer_de: reconIndex.disclaimer_de, licence: 'CC BY-SA 2.0 DE (Grundrisse teils nach schloss-carlsberg.de); Modell: Teilprojekt schloss-karlsberg' },
    { id: 'osm', label_de: 'Wege & Gewässer', text: '© OpenStreetMap-Mitwirkende, ODbL', source: om.vectors.osm.source, licence: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
    { id: 'pois', label_de: 'Orte', text: poiGeo.attribution, licence: 'ODbL / siehe Quelle je Ort' },
    { id: 'project', label_de: 'Datenaufbereitung', text: 'Saar LiDAR Explorer / schloss-karlsberg (Open-Kirrberg), MIT', licence: 'MIT' },
  ],
};
write('attribution.json', JSON.stringify(attribution, null, 1));

const files = [
  'terrain/meta.json',
  'terrain/h2025.u16.deflate',
  'terrain/h1789.u16.deflate',
  'terrain/ground.u8.deflate',
  'terrain/canopy.u8.deflate',
  'maps/hist1840.jpg',
  'maps/hist1935.jpg',
  ...(pointMeta ? ['pointcloud/ground.kqp.deflate'] : []),
  'palace/buildings.glb',
  'palace/footprints.json',
  'palace/rooms.json',
  'pois.json',
  'paths.json',
  'attribution.json',
];
const sizes = Object.fromEntries(files.map((f) => [f, statSync(join(OUT, f)).size]));
const total = Object.values(sizes).reduce((s, v) => s + v, 0);
write('manifest.json', JSON.stringify({ format: 'kq-data-v1', generated: new Date().toISOString(), totalBytes: total, files: sizes }, null, 1));
for (const [f, s] of Object.entries(sizes)) log(`${(s / 1024).toFixed(0).padStart(7)} KiB  ${f}`);
log(`total ${(total / 1048576).toFixed(2)} MiB`);
