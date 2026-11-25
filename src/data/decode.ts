/** Pure decoders for the prepared terrain files (inflated bytes in, typed arrays out). */
import type { TerrainMeta, TerrainSurfaceMeta } from './types';

function asInt16(bytes: Uint8Array): Int16Array {
  const copy = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
  return new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2);
}

/** h2025: int16 left-delta residuals of uint16 cm above hMin → quantised uint16 grid. */
export function decodeH2025(bytes: Uint8Array, meta: Pick<TerrainMeta, 'cols' | 'rows'>): Uint16Array {
  const { cols, rows } = meta;
  const d = asInt16(bytes);
  if (d.length !== cols * rows) throw new Error(`h2025: expected ${cols * rows} samples, got ${d.length}`);
  const q = new Uint16Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    q[row] = ((r > 0 ? q[row - cols]! : 0) + d[row]!) & 0xffff;
    for (let c = 1; c < cols; c++) q[row + c] = (q[row + c - 1]! + d[row + c]!) & 0xffff;
  }
  return q;
}

/** h1789: int16 cm difference to the quantised 2025 grid. */
export function decodeH1789(bytes: Uint8Array, q2025: Uint16Array): Uint16Array {
  const d = asInt16(bytes);
  if (d.length !== q2025.length) throw new Error('h1789: size mismatch');
  const q = new Uint16Array(q2025.length);
  for (let i = 0; i < q.length; i++) q[i] = (q2025[i]! + d[i]!) & 0xffff;
  return q;
}

export function quantToMetres(q: Uint16Array, meta: Pick<TerrainMeta, 'hMin' | 'heightScale'>): Float32Array {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = meta.hMin + q[i]! * meta.heightScale;
  return out;
}

export function decodeCanopy(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! * 0.25;
  return out;
}

/** Surface RGBA8: undo the per-row left deltas in the inflated buffer. */
export function decodeSurface(bytes: Uint8Array, { cols, rows }: Pick<TerrainSurfaceMeta, 'cols' | 'rows'>): Uint8Array {
  if (bytes.length !== cols * rows * 4) throw new Error('terrain surface: size mismatch');
  const stride = cols * 4;
  for (let row = 0; row < bytes.length; row += stride) {
    for (let i = row + 4; i < row + stride; i++) bytes[i] = bytes[i]! + bytes[i - 4]!;
  }
  return bytes;
}

/** Inflate a zlib ('deflate') stream in the browser via DecompressionStream. */
export async function inflate(buf: ArrayBuffer): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
