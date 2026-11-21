import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { ASSETS } from '../src/assets/manifest';

// Triangle caps of the props that are drawn many times (docs/PERFORMANCE.md §3.5, tri budget phase B):
// the forest-floor logs and stumps (hundreds of instances, main + shadow pass), the Ehrenhof props and
// the interior fauteuils. A re-pack that loses its --simplify would blow the high-tier budget again.
const CAPS: Record<string, number> = {
  'nature.stump.01': 2200,
  'nature.stump.02': 2200,
  'nature.log.01': 2200,
  'architecture.barrel': 5000,
  'architecture.basket': 9500,
  'architecture.crate.lid': 2200,
  'architecture.crate.long': 2200,
  'architecture.armchair': 2200,
};

const ROOT = path.resolve(__dirname, '../public/assets');

describe('packed prop triangle caps', () => {
  it.each(Object.entries(CAPS))('%s stays under %i triangles', async (id, cap) => {
    await MeshoptDecoder.ready;
    const e = ASSETS.find((a) => a.id === id);
    expect(e, id).toBeTruthy();
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.read(path.join(ROOT, e!.url));
    let tris = 0;
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
    expect(tris).toBeGreaterThan(300);
    expect(tris).toBeLessThanOrEqual(cap);
  });
});
