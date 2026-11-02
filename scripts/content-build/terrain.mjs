// Terrain probe helpers (plain JS, mirrors src/data/decode.ts).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function loadTerrain(root) {
  const dir = `${root}/public/data`;
  const meta = JSON.parse(readFileSync(`${dir}/terrain/meta.json`, 'utf8'));
  const { cols, rows } = meta;
  const i16 = (b) => new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const d = i16(inflateSync(readFileSync(`${dir}/terrain/h2025.u16.deflate`)));
  const q = new Uint16Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    q[row] = ((r > 0 ? q[row - cols] : 0) + d[row]) & 0xffff;
    for (let c = 1; c < cols; c++) q[row + c] = (q[row + c - 1] + d[row + c]) & 0xffff;
  }
  const d89 = i16(inflateSync(readFileSync(`${dir}/terrain/h1789.u16.deflate`)));
  const q89 = new Uint16Array(q.length);
  for (let i = 0; i < q.length; i++) q89[i] = (q[i] + d89[i]) & 0xffff;
  const ground = new Uint8Array(inflateSync(readFileSync(`${dir}/terrain/ground.u8.deflate`)));
  const canopy = new Uint8Array(inflateSync(readFileSync(`${dir}/terrain/canopy.u8.deflate`)));
  const rooms = JSON.parse(readFileSync(`${dir}/palace/rooms.json`, 'utf8')).rooms;
  const fps = JSON.parse(readFileSync(`${dir}/palace/footprints.json`, 'utf8')).buildings;
  const idx = (x, z) => {
    const c = Math.round((x - meta.origin.x) / meta.cell);
    const r = Math.round((z - meta.origin.z) / meta.cell);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  };
  const h = (qq, x, z) => {
    const i = idx(x, z);
    return i < 0 ? NaN : meta.hMin + qq[i] * meta.heightScale;
  };
  const GN = ['meadow', 'lawn', 'gravel', 'cobbles', 'sand', 'water', 'forest', 'building'];
  return {
    meta,
    rooms,
    fps,
    probe(x, z) {
      const i = idx(x, z);
      return {
        h2025: +h(q, x, z).toFixed(1),
        h1789: +h(q89, x, z).toFixed(1),
        ground: i < 0 ? 'oob' : GN[ground[i]],
        canopy: i < 0 ? NaN : canopy[i] * 0.25,
      };
    },
  };
}

export function centroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x0, z0] = poly[j];
    const [x1, z1] = poly[i];
    const f = x0 * z1 - x1 * z0;
    a += f;
    cx += (x0 + x1) * f;
    cz += (z0 + z1) * f;
  }
  a *= 0.5;
  return [cx / (6 * a), cz / (6 * a)];
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
