/**
 * Asset pipeline step for the architecture surface sets (src/world/surfaces.ts): one CC0 PBR
 * texture set (Poly Haven 1k JPGs: diffuse, OpenGL normal, ARM = AO / roughness / metal) → two
 * WebP files without alpha (alpha would be premultiplied by the browser's image decode):
 *
 *   <out>_col.webp   RGB = diffuse × mix(1, AO, --ao)     (AO baked in: contact shade in the grooves)
 *   <out>_nrm.webp   RG  = normal x / y (OpenGL, +y up), B = roughness
 *
 *   pnpm assets:surface <diff.jpg> <nor_gl.jpg> <arm.jpg> public/assets/textures/architecture/<name> [--size 1024] [--ao 0.6]
 *
 * Prints both outputs with their byte sizes for the manifest. Inputs are untrusted data: only
 * decoded as images (jpeg-js), nothing else is read from the download.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : def;
}
const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const [diffF, norF, armF, out] = pos;
if (!diffF || !norF || !armF || !out) {
  console.error('usage: pnpm assets:surface <diff.jpg> <nor_gl.jpg> <arm.jpg> <out-base> [--size 1024] [--ao 0.6]');
  process.exit(2);
}
const size = Number(arg('size', '1024'));
const aoK = Number(arg('ao', '0.6'));

const read = (f: string) => jpeg.decode(fs.readFileSync(f), { useTArray: true, maxMemoryUsageInMB: 512 });
const diff = read(diffF);
const nor = read(norF);
const arm = read(armF);
if (diff.width !== nor.width || diff.width !== arm.width || diff.height !== nor.height || diff.height !== arm.height) throw new Error('surface set: inputs differ in size');
const { width: w, height: h } = diff;
const col = new PNG({ width: w, height: h });
const nrm = new PNG({ width: w, height: h });
for (let i = 0; i < w * h; i++) {
  const o = i * 4;
  const ao = arm.data[o]! / 255;
  const k = 1 - aoK + aoK * ao;
  col.data[o] = Math.round(diff.data[o]! * k);
  col.data[o + 1] = Math.round(diff.data[o + 1]! * k);
  col.data[o + 2] = Math.round(diff.data[o + 2]! * k);
  col.data[o + 3] = 255;
  nrm.data[o] = nor.data[o]!;
  nrm.data[o + 1] = nor.data[o + 1]!;
  nrm.data[o + 2] = arm.data[o + 1]!; // roughness
  nrm.data[o + 3] = 255;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-surface-'));
fs.mkdirSync(path.dirname(out), { recursive: true });
const res: { output: string; bytes: number }[] = [];
for (const [png, suffix, q] of [[col, 'col', 84], [nrm, 'nrm', 92]] as const) {
  const p = path.join(tmp, `${suffix}.png`);
  fs.writeFileSync(p, PNG.sync.write(png));
  const o = `${out}_${suffix}.webp`;
  // -exact keeps RGB as given (no alpha cleanup), normal maps get a higher quality
  execFileSync('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-mt', '-exact', '-resize', String(size), '0', p, '-o', o]);
  res.push({ output: o, bytes: fs.statSync(o).size });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify(res));
