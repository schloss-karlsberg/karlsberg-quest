/**
 * Asset pipeline helper: list a GLB's animation clips (name, length), mesh nodes and skeleton joints.
 *
 *   npx tsx scripts/assets/inspect-anims.ts public/assets/models/characters/human_adventurer.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]!);
for (const a of doc.getRoot().listAnimations()) {
  let max = 0;
  for (const s of a.listSamplers()) {
    const arr = s.getInput()?.getArray();
    if (arr && arr.length) max = Math.max(max, arr[arr.length - 1] as number);
  }
  console.log('anim', a.getName(), max.toFixed(2));
}
for (const n of doc.getRoot().listNodes()) if (n.getMesh()) console.log('mesh-node', n.getName(), n.getMesh()!.listPrimitives().map((p) => p.getMaterial()?.getName()).join(','));
console.log('joints', doc.getRoot().listSkins()[0]?.listJoints().map((j) => j.getName()).join(','));
