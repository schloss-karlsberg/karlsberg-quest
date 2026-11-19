/**
 * Asset pipeline step: glTF / GLB (downloaded CC0 source) → one browser-ready GLB.
 *
 *   pnpm assets:pack <in.gltf|in.glb> <out.glb> [--tex 1024] [--q 82] [--simplify 0.5] [--no-meshopt]
 *                    [--anims Idle,Walk,Run]
 *
 * - dedup + prune + weld, optional meshoptimizer simplify (ratio of triangles to keep; --error
 *   is the allowed deviation relative to the mesh size, default 0.002: raise it for scans),
 * - every texture → WebP (EXT_texture_webp) via the `cwebp` CLI, longest side ≤ --tex
 *   (default 1024; use 2048 only for hero / terrain sets, docs/ART-DIRECTION.md §8),
 * - `--anims`: keep only these animation clips (matched on the name after the last '|', so
 *   'CharacterArmature|Walk' is 'Walk'), renamed to that short name; duplicates are dropped,
 * - meshopt compression (EXT_meshopt_compression) with quantised attributes.
 * The input is untrusted data: this script only parses it (no code from the download runs).
 * Prints the output size; record it as `bytes` in the manifest entry.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

const [input, output] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
if (!input || !output) {
  console.error('usage: pnpm assets:pack <in.gltf|in.glb> <out.glb> [--tex 1024] [--q 82] [--simplify 0.5] [--error 0.002] [--no-meshopt] [--anims Idle,Walk]');
  process.exit(2);
}
const maxTex = Number(arg('tex', '1024'));
const quality = Number(arg('q', '82'));
const simplifyRatio = arg('simplify') ? Number(arg('simplify')) : null;

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);

// animation clips: keep a list (short names), drop duplicates ('Walk' and 'Armature|Walk')
const keepAnims = arg('anims')?.split(',').map((a) => a.trim()).filter(Boolean) ?? null;
if (keepAnims) {
  const seen = new Set<string>();
  for (const a of doc.getRoot().listAnimations()) {
    const short = a.getName().split('|').pop() ?? a.getName();
    if (!keepAnims.includes(short) || seen.has(short)) a.dispose();
    else {
      seen.add(short);
      a.setName(short);
    }
  }
  const missing = keepAnims.filter((n) => !seen.has(n));
  if (missing.length) console.warn(`animations not found: ${missing.join(', ')}`);
}

await doc.transform(dedup(), weld());
if (simplifyRatio !== null) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: Number(arg('error', '0.002')) }));
await doc.transform(prune());

// textures → WebP through cwebp (resize keeps the aspect: 0 for the other side)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-pack-'));
let converted = 0;
for (const t of doc.getRoot().listTextures()) {
  const img = t.getImage();
  if (!img) continue;
  const size = t.getSize() ?? [0, 0];
  const ext = t.getMimeType() === 'image/png' ? 'png' : t.getMimeType() === 'image/webp' ? 'webp' : 'jpg';
  const src = path.join(tmp, `t${converted}.${ext}`);
  const dst = path.join(tmp, `t${converted}.webp`);
  fs.writeFileSync(src, img);
  const args = ['-quiet', '-q', String(quality), '-m', '6', '-mt'];
  const long = Math.max(size[0], size[1]);
  if (long > maxTex) args.push('-resize', size[0] >= size[1] ? String(maxTex) : '0', size[0] >= size[1] ? '0' : String(maxTex));
  // normal maps keep more precision
  if (/nor|normal/i.test(t.getName() + t.getURI())) args.splice(2, 1, String(Math.max(quality, 90)));
  execFileSync('cwebp', [...args, src, '-o', dst]);
  t.setImage(new Uint8Array(fs.readFileSync(dst)));
  t.setMimeType('image/webp');
  t.setURI(t.getURI().replace(/\.(png|jpe?g)$/i, '.webp'));
  converted++;
}
if (converted) doc.createExtension(EXTTextureWebP).setRequired(true);

if (!process.argv.includes('--no-meshopt')) {
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}
fs.mkdirSync(path.dirname(output), { recursive: true });
await io.write(output, doc);
fs.rmSync(tmp, { recursive: true, force: true });
const bytes = fs.statSync(output).size;
console.log(JSON.stringify({ output, bytes, textures: converted }));
