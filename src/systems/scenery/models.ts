/**
 * CC0 prop models (src/assets/manifests/architecture.ts) placed as instanced meshes: one
 * InstancedMesh per mesh of the model and per set, so twenty barrels cost one draw call each part.
 * The model's materials are the asset loader's world-lit standard materials (sun, shadows, era
 * ambient, lantern, fog). Used by the scenery sets, the interiors and the field station on the
 * medium / high tiers; the low tier keeps the procedural kit props (docs/ART-DIRECTION.md §8).
 */
import { type BufferGeometry, Group, InstancedMesh, type Material, Matrix4, type Mesh, type Object3D } from 'three';
import type { AssetLoader } from '../../assets/loader';

export interface ModelPlacement {
  /** Manifest id, e.g. 'architecture.barrel'; 'nature2.ferns#fern' takes one top-level node of a variant set. */
  id: string;
  /** World matrix of the model's root. */
  matrix: Matrix4;
}

/** Local transform helper: position, yaw (radians), uniform scale, optional tilt about local x / z. */
export function placeMatrix(x: number, y: number, z: number, yaw = 0, scale = 1, tiltX = 0, tiltZ = 0): Matrix4 {
  const m = new Matrix4().makeRotationY(yaw);
  if (tiltX || tiltZ) m.multiply(new Matrix4().makeRotationX(tiltX)).multiply(new Matrix4().makeRotationZ(tiltZ));
  m.scale({ x: scale, y: scale, z: scale } as never);
  m.setPosition(x, y, z);
  return m;
}

/**
 * Build the instanced meshes for `placements` into `parent` (async; resolves with the number of
 * instances added). Meshes are tagged `userData.sharedGeometry` (the geometry belongs to the
 * asset cache: callers must not dispose it). Nothing is added when `parent` was detached while
 * loading (the set was dropped).
 */
export async function instanceModels(assets: AssetLoader, placements: readonly ModelPlacement[], parent: Group, opts: { shadows?: boolean } = {}): Promise<number> {
  const byId = new Map<string, Matrix4[]>();
  for (const p of placements) {
    let l = byId.get(p.id);
    if (!l) byId.set(p.id, (l = []));
    l.push(p.matrix);
  }
  let added = 0;
  await Promise.all(
    [...byId].map(async ([id, mats]) => {
      let model: { scene: Object3D };
      // 'set#node': one top-level node of a variant set (nature2 kits of `pnpm assets:set`)
      const [assetId, nodeName] = id.split('#') as [string, string | undefined];
      try {
        model = await assets.model(assetId);
      } catch (e) {
        console.warn(`[models] ${id} failed`, e);
        return;
      }
      if (parent.userData.detached) return;
      lightenGlass(model.scene);
      model.scene.updateMatrixWorld(true);
      const rootInv = new Matrix4().copy(model.scene.matrixWorld).invert();
      const source = nodeName === undefined ? model.scene : model.scene.children.find((c) => c.name === nodeName);
      if (!source) {
        console.warn(`[models] ${id}: no node ${nodeName}`);
        return;
      }
      const group = new Group();
      group.name = `models:${id}`;
      source.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const local = new Matrix4().multiplyMatrices(rootInv, m.matrixWorld);
        const im = new InstancedMesh(m.geometry as BufferGeometry, m.material as Material | Material[], mats.length);
        mats.forEach((w, i) => im.setMatrixAt(i, new Matrix4().multiplyMatrices(w, local)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.name = `${id}:${m.name}`;
        im.userData.sharedGeometry = true;
        if (opts.shadows === false) im.userData.noShadow = true;
        group.add(im);
      });
      parent.add(group);
      added += mats.length;
    }),
  );
  return added;
}

/**
 * Glass parts of the models (chandelier cups, lantern panes) come out of the glTF as opaque dark
 * surfaces (no transmission in our world-lit material): make them thin, bright, see-through glass.
 */
function lightenGlass(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const sm = mat as Material & { roughness?: number; metalness?: number; color?: { setRGB(r: number, g: number, b: number): void }; userData: Record<string, unknown> };
      if (!/glass|crystal/i.test(sm.name) || sm.userData.kqGlass) continue;
      sm.userData.kqGlass = true;
      sm.transparent = true;
      sm.opacity = 0.32;
      sm.depthWrite = false;
      sm.color?.setRGB(0.92, 0.95, 1.0);
      if (sm.roughness !== undefined) sm.roughness = 0.08;
      if (sm.metalness !== undefined) sm.metalness = 0;
      sm.needsUpdate = true;
    }
  });
}

/** Remove instanced model groups made by `instanceModels` (keeps the cached geometry). */
export function disposeModels(parent: Object3D): void {
  parent.traverse((o) => {
    const im = o as InstancedMesh;
    if (im.isInstancedMesh && im.userData.sharedGeometry) im.dispose();
  });
}
