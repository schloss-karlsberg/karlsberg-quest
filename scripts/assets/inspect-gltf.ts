/**
 * Print what a glTF / GLB holds: meshes (tris), skins (joint names), animations (name, length),
 * materials (base colour, texture) and the bounding box. Used to review a downloaded CC0 model
 * before packing it (`pnpm assets:inspect <file.glb> [--joints]`). Reads only; never writes.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('usage: inspect-gltf <file.glb> [--joints]');
  const joints = process.argv.includes('--joints');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  for (const m of root.listMeshes()) {
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      tris += idx ? idx.getCount() / 3 : (pos?.getCount() ?? 0) / 3;
    }
  }
  const scene = root.listScenes()[0];
  const b = scene ? getBounds(scene) : null;
  console.log(`meshes ${root.listMeshes().length}, tris ${tris}, nodes ${root.listNodes().length}`);
  if (b) console.log(`bounds min ${b.min.map((v) => v.toFixed(2))} max ${b.max.map((v) => v.toFixed(2))}`);
  for (const s of root.listSkins()) {
    console.log(`skin ${s.getName()} joints ${s.listJoints().length}`);
    if (joints) console.log('  ' + s.listJoints().map((j) => j.getName()).join(', '));
  }
  for (const a of root.listAnimations()) {
    let t = 0;
    for (const s of a.listSamplers()) {
      const inp = s.getInput();
      if (inp) t = Math.max(t, inp.getMax([0])[0] ?? 0);
    }
    console.log(`anim ${a.getName()} ${t.toFixed(2)} s, channels ${a.listChannels().length}`);
  }
  for (const m of root.listMaterials()) {
    const c = m.getBaseColorFactor().map((v) => v.toFixed(2)).join(',');
    console.log(`mat ${m.getName()} base [${c}] tex ${m.getBaseColorTexture() ? 'yes' : 'no'} metal ${m.getMetallicFactor()} rough ${m.getRoughnessFactor()}`);
  }
  for (const t of root.listTextures()) console.log(`tex ${t.getName()} ${t.getMimeType()} ${t.getSize()?.join('x')} ${t.getImage()?.byteLength} B`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
