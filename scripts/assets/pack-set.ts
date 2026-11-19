/**
 * Asset pipeline step: several downloaded CC0 GLBs → one browser-ready GLB "set" (nature2 trees,
 * rocks, plants). Every input becomes one named top-level node (its transforms baked into the
 * vertices), materials and textures shared between the inputs are merged.
 *
 *   pnpm assets:set <out.glb> name=in.glb [name2=in2.glb …] [--lod1] [--tex 1024] [--q 82]
 *
 * - `--lod1`: adds a second node `<name>_lod1` per input: opaque parts (bark) simplified with
 *   meshoptimizer to ≈ 25 %, alpha-tested cards (leaf clumps) thinned to every second card and
 *   grown ×1.35 around their centre (same crown volume, half the cards),
 * - leaf / blended materials become alpha-tested (MASK 0.5, double-sided): the game draws them
 *   opaque with alpha-to-coverage, never sorted,
 * - textures → WebP (cwebp, longest side ≤ --tex), meshopt compression.
 * The inputs are untrusted data: this script only parses them.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Accessor, Document, type Node, NodeIO, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { clearNodeTransform, dedup, flatten, mergeDocuments, prune, quantize, reorder, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}
const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.match(/^--(tex|q)$/));
const [output, ...inputs] = positional;
if (!output || !inputs.length) {
  console.error('usage: pnpm assets:set <out.glb> name=in.glb [name2=in2.glb …] [--lod1] [--tex 1024] [--q 82]');
  process.exit(2);
}
const maxTex = Number(arg('tex', '1024'));
const quality = Number(arg('q', '82'));
const lod1 = process.argv.includes('--lod1');

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = new Document();
doc.createBuffer();
const scene = doc.createScene('set');
const named: Node[] = [];

for (const spec of inputs) {
  const [name, file] = spec.split('=');
  if (!name || !file) throw new Error(`bad input '${spec}' (want name=file.glb)`);
  const src = await io.read(file);
  await src.transform(flatten());
  // bake every mesh node's transform into its vertices
  for (const n of src.getRoot().listNodes()) if (n.getMesh()) clearNodeTransform(n);
  for (const a of src.getRoot().listAnimations()) a.dispose();
  const map = mergeDocuments(doc, src);
  const group = doc.createNode(name);
  for (const s of src.getRoot().listScenes())
    for (const n of s.listChildren()) {
      const t = map.get(n) as Node | undefined;
      if (!t) continue;
      for (const sc of doc.getRoot().listScenes()) if (sc !== scene) sc.removeChild(t);
      group.addChild(t);
    }
  scene.addChild(group);
  named.push(group);
}
for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
doc.getRoot().setDefaultScene(scene);
{
  const [buf0, ...rest] = doc.getRoot().listBuffers();
  for (const a of doc.getRoot().listAccessors()) a.setBuffer(buf0!);
  for (const b of rest) b.dispose();
}

await doc.transform(dedup(), weld());

/** Material of a primitive is a card material (blended / masked texture). */
const isCard = (p: Primitive) => (p.getMaterial()?.getAlphaMode() ?? 'OPAQUE') !== 'OPAQUE';

/** Every second card (connected component of the index graph), grown around its centre. */
function thinCards(prim: Primitive, keep: number, grow: number): void {
  const idx = prim.getIndices()!.getArray()!;
  const pos = prim.getAttribute('POSITION')!;
  const nv = pos.getCount();
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]!);
    for (let k = 1; k < 3; k++) {
      const b = find(idx[t + k]!);
      if (a !== b) parent[b] = a;
    }
  }
  const comps = new Map<number, number>();
  for (let i = 0; i < nv; i++) {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, comps.size);
  }
  // deterministic pick: every 1/keep-th component in index order
  const step = Math.max(1, Math.round(1 / keep));
  const keepComp = (c: number) => c % step === 0;
  const remap = new Int32Array(nv).fill(-1);
  let next = 0;
  for (let i = 0; i < nv; i++) if (keepComp(comps.get(find(i))!)) remap[i] = next++;
  // centroids of the kept components
  const cen = new Map<number, [number, number, number, number]>();
  const v = [0, 0, 0];
  for (let i = 0; i < nv; i++) {
    if (remap[i]! < 0) continue;
    const c = comps.get(find(i))!;
    pos.getElement(i, v);
    const e = cen.get(c) ?? [0, 0, 0, 0];
    e[0] += v[0]!;
    e[1] += v[1]!;
    e[2] += v[2]!;
    e[3]++;
    cen.set(c, e);
  }
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem)!;
    const size = acc.getElementSize();
    const ArrayType = acc.getArray()!.constructor as Float32ArrayConstructor;
    const out = new ArrayType(next * size);
    const el: number[] = [];
    for (let i = 0; i < nv; i++) {
      const j = remap[i]!;
      if (j < 0) continue;
      acc.getElement(i, el);
      if (sem === 'POSITION') {
        const e = cen.get(comps.get(find(i))!)!;
        for (let k = 0; k < 3; k++) {
          const c = e[k]! / e[3]!;
          el[k] = c + (el[k]! - c) * grow;
        }
      }
      out.set(el, j * size);
    }
    const na = doc.createAccessor().setType(acc.getType()).setArray(out).setNormalized(acc.getNormalized()).setBuffer(doc.getRoot().listBuffers()[0]!);
    prim.setAttribute(sem, na);
  }
  const ni: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = remap[idx[t]!]!;
    if (a < 0) continue;
    ni.push(a, remap[idx[t + 1]!]!, remap[idx[t + 2]!]!);
  }
  const ia = doc.createAccessor().setType('SCALAR').setArray(next > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)).setBuffer(doc.getRoot().listBuffers()[0]!);
  prim.setIndices(ia as Accessor);
}

if (lod1) {
  for (const g of named) {
    const lg = doc.createNode(`${g.getName()}_lod1`);
    for (const n of g.listChildren()) {
      const me = n.getMesh();
      if (!me) continue;
      const m2 = me.clone().setName(`${me.getName()}_lod1`);
      for (const p of m2.listPrimitives()) {
        const p2 = p.clone();
        m2.removePrimitive(p);
        m2.addPrimitive(p2);
        if (isCard(p2)) thinCards(p2, 0.5, 1.35);
        else simplifyPrimitive(p2, { simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.012 });
      }
      lg.addChild(doc.createNode(`${n.getName()}_lod1`).setMesh(m2));
    }
    scene.addChild(lg);
  }
}

for (const m of doc.getRoot().listMaterials()) {
  if (m.getAlphaMode() === 'BLEND') m.setAlphaMode('MASK').setAlphaCutoff(0.5);
  if (m.getAlphaMode() === 'MASK') m.setDoubleSided(true);
}
await doc.transform(prune());

// textures → WebP through cwebp
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-set-'));
let converted = 0;
for (const t of doc.getRoot().listTextures()) {
  const img = t.getImage();
  if (!img) continue;
  const size = t.getSize() ?? [0, 0];
  const ext = t.getMimeType() === 'image/png' ? 'png' : t.getMimeType() === 'image/webp' ? 'webp' : 'jpg';
  const src = path.join(tmp, `t${converted}.${ext}`);
  const dst = path.join(tmp, `t${converted}.webp`);
  fs.writeFileSync(src, img);
  const normal = /nor|normal/i.test(t.getName() + t.getURI());
  const args = ['-quiet', '-q', String(normal ? Math.max(quality, 90) : quality), '-m', '6', '-mt', '-exact', '-alpha_q', '100'];
  const long = Math.max(size[0], size[1]);
  const lim = normal ? Math.min(maxTex, 512) : maxTex;
  if (long > lim) args.push('-resize', size[0] >= size[1] ? String(lim) : '0', size[0] >= size[1] ? '0' : String(lim));
  execFileSync('cwebp', [...args, src, '-o', dst]);
  t.setImage(new Uint8Array(fs.readFileSync(dst)));
  t.setMimeType('image/webp');
  t.setURI(`${t.getName() || `t${converted}`}.webp`);
  converted++;
}
if (converted) doc.createExtension(EXTTextureWebP).setRequired(true);
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
fs.mkdirSync(path.dirname(output), { recursive: true });
await io.write(output, doc);
fs.rmSync(tmp, { recursive: true, force: true });
let tris = 0;
for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
console.log(JSON.stringify({ output, bytes: fs.statSync(output).size, textures: converted, nodes: scene.listChildren().map((n) => n.getName()), tris }));
