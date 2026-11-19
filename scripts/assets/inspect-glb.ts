/**
 * Asset pipeline helper: print what a packed GLB contains (materials and their alpha mode,
 * textures with format and alpha channel, meshes, triangles).
 *
 *   npx tsx scripts/assets/inspect-glb.ts public/assets/models/nature/fern_02.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]!);
for (const m of doc.getRoot().listMaterials()) console.log('material', m.getName(), m.getAlphaMode(), m.getAlphaCutoff(), m.getDoubleSided() ? 'double-sided' : '');
for (const t of doc.getRoot().listTextures()) {
  const im = Buffer.from(t.getImage() ?? new Uint8Array());
  // WebP with alpha carries an ALPH chunk (lossy) or the VP8L alpha bit (lossless)
  console.log('texture', t.getName(), t.getMimeType(), im.length, 'bytes', im.includes(Buffer.from('ALPH')) ? 'alpha' : 'no ALPH chunk', im.subarray(12, 16).toString());
}
let tris = 0;
for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
console.log('meshes', doc.getRoot().listMeshes().length, 'triangles', tris);
