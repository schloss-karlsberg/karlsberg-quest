/**
 * Procedural texture tiles for the board (cork, paper grain, stamp wear), rendered once into PNG
 * data URLs. SVG `feTurbulence` backgrounds look the same but are re-rasterised on every repaint,
 * which made the full-screen board crawl on software renderers.
 */

/** Tileable fractal value noise in 0..1, `size` × `size`. */
function noiseTile(size: number, cells: number, octaves: number, seed: number, turbulence = false): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lattice = new Float32Array(n * n);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
    const at = (x: number, y: number) => lattice[((y + n) % n) * n + ((x + n) % n)]!;
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        let v = a + (b - a) * sy;
        if (turbulence) v = Math.abs(v * 2 - 1);
        out[y * size + x]! += v * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= norm;
  return out;
}

function toUrl(size: number, px: (v: number, i: number) => [number, number, number, number], n: Float32Array): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(size, size);
  for (let i = 0; i < n.length; i++) {
    const [r, gr, b, a] = px(n[i]!, i);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gr;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.max(0, Math.min(255, a));
  }
  g.putImageData(img, 0, 0);
  return `url("${c.toDataURL('image/png')}")`;
}

let cache: Record<string, string> | null = null;

/** CSS custom properties (`--ck-tex-cork` …) holding `url(...)` values. Generated once per page. */
export function boardTextures(): Record<string, string> {
  if (cache) return cache;
  const contrast = (v: number, k: number) => Math.max(0, Math.min(1, (v - 0.5) * k + 0.5));
  const cork = noiseTile(256, 128, 2, 7);
  const mottle = noiseTile(128, 8, 2, 3, true);
  const grain = noiseTile(220, 110, 2, 11);
  const wear = noiseTile(128, 24, 2, 4);
  cache = {
    '--ck-tex-cork': toUrl(256, (v) => [158, 115, 69, contrast(v, 1.4) * 140], cork),
    '--ck-tex-mottle': toUrl(128, (v) => [26, 15, 8, v * 80], mottle),
    '--ck-tex-grain': toUrl(220, (v) => [89, 69, 41, v * 40], grain),
    '--ck-tex-wear': toUrl(128, (v) => [255, 255, 255, (2.5 - 2.4 * v) * 255], wear),
  };
  return cache;
}
