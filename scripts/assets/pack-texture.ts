/**
 * Asset pipeline step: one texture (JPG / PNG from a CC0 source) → WebP for the browser.
 *
 *   pnpm assets:tex <in.jpg|png> <out.webp> [--size 1024] [--q 82]
 *
 * Longest side ≤ --size (1024 default, 2048 only for hero / terrain sets). Normal maps
 * (file name contains "nor"/"normal") get quality ≥ 90. Prints the output size for the manifest.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : def;
}
const [input, output] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
if (!input || !output) {
  console.error('usage: pnpm assets:tex <in> <out.webp> [--size 1024] [--q 82]');
  process.exit(2);
}
const size = Number(arg('size', '1024'));
let q = Number(arg('q', '82'));
if (/nor|normal/i.test(path.basename(input))) q = Math.max(q, 90);
// square tiling sets (Poly Haven, ambientCG): width → size, height follows the aspect
fs.mkdirSync(path.dirname(output), { recursive: true });
execFileSync('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-mt', '-resize', String(size), '0', input, '-o', output]);
console.log(JSON.stringify({ output, bytes: fs.statSync(output).size }));
