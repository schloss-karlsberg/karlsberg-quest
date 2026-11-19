/**
 * Asset pipeline step: several square tiling textures → one vertical strip WebP (layer k at rows
 * k·size … (k+1)·size), loaded by the game as one texture array (src/world/vegetation/strips.ts).
 *
 *   pnpm assets:strip <out.webp> [--size 1024] [--q 84] in1.jpg in2.jpg …          (colour)
 *   pnpm assets:strip <out.webp> --nh [--size 512] nor1.jpg+disp1.jpg nor2.jpg+disp2.jpg …
 *
 * `--nh` packs a normal map (OpenGL, +Y up) and its height (displacement) map per layer:
 * R,G = normal x,y · 0.5 + 0.5, B = height (0..1), so one fetch gives both (height-blended
 * splatting). Inputs are JPG or PNG (CC0 sources, e.g. Poly Haven 1k maps); every layer is
 * resampled (box filter) to --size. Prints the output size for the manifest.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

interface Img {
  w: number;
  h: number;
  d: Uint8Array;
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : def;
}

function read(file: string): Img {
  const buf = fs.readFileSync(file);
  if (/\.png$/i.test(file)) {
    const p = PNG.sync.read(buf);
    return { w: p.width, h: p.height, d: new Uint8Array(p.data) };
  }
  const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 2048 });
  return { w: j.width, h: j.height, d: j.data };
}

/** Box-filter resample to size×size (RGBA). */
function resample(img: Img, size: number): Img {
  if (img.w === size && img.h === size) return img;
  const out = new Uint8Array(size * size * 4);
  const sx = img.w / size;
  const sy = img.h / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * img.w + xx) * 4;
          for (let c = 0; c < 4; c++) acc[c]! += img.d[o + c]!;
          n++;
        }
      const o = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = Math.round(acc[c]! / n);
    }
  }
  return { w: size, h: size, d: out };
}

const args = process.argv.slice(2);
const flags = new Set(['--size', '--q']);
const pos = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1] ?? ''));
const [output, ...inputs] = pos;
if (!output || inputs.length === 0) {
  console.error('usage: pnpm assets:strip <out.webp> [--nh] [--size 1024] [--q 84] in1 in2 …');
  process.exit(2);
}
const nh = args.includes('--nh');
const size = Number(arg('size', nh ? '512' : '1024'));
const q = Number(arg('q', nh ? '90' : '84'));
const strip = new PNG({ width: size, height: size * inputs.length });
inputs.forEach((inp, k) => {
  const off = k * size * size * 4;
  if (nh) {
    const [nf, hf] = inp.split('+');
    const n = resample(read(nf!), size);
    const h = hf ? resample(read(hf), size) : null;
    for (let i = 0; i < size * size; i++) {
      strip.data[off + i * 4] = n.d[i * 4]!;
      strip.data[off + i * 4 + 1] = n.d[i * 4 + 1]!;
      strip.data[off + i * 4 + 2] = h ? h.d[i * 4]! : 128;
      strip.data[off + i * 4 + 3] = 255;
    }
  } else {
    const c = resample(read(inp), size);
    for (let i = 0; i < size * size; i++) {
      strip.data[off + i * 4] = c.d[i * 4]!;
      strip.data[off + i * 4 + 1] = c.d[i * 4 + 1]!;
      strip.data[off + i * 4 + 2] = c.d[i * 4 + 2]!;
      strip.data[off + i * 4 + 3] = 255;
    }
  }
});
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kq-strip-')), 'strip.png');
fs.writeFileSync(tmp, PNG.sync.write(strip));
fs.mkdirSync(path.dirname(output), { recursive: true });
// -exact keeps RGB under alpha; -sharp_yuv keeps colour edges crisp
execFileSync('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-mt', '-sharp_yuv', '-exact', tmp, '-o', output]);
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
console.log(JSON.stringify({ output, layers: inputs.length, size, bytes: fs.statSync(output).size }));
