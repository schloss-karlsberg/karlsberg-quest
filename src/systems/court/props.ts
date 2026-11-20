/**
 * Props of the court (docs/IDEAS-ROUND11.md §2): the Gardisten's halberd-headed pike. 3D only — the
 * court logic (zones, watchers, the inspection) lives beside this file and is not built here.
 *
 * The pike is 2.42 m: an ash shaft with an iron ferrule, an iron socket with langets, a red tassel
 * under the head, and an iron head (a leaf-shaped spear point, a crescent axe blade, a back spike).
 * It is built in metres with the butt at the origin and the shaft along +y; the axe blade points to
 * +x, the spike to −x, the blade plane is x/y (thin in z).
 *
 *  - `pikeGeometry()`: the merged geometry (kit attributes: position, normal, colour, …), for a
 *    material of the caller's choice — e.g. the ghost material of a rigged NPC (`ghostMaterials` in
 *    characters/shaders.ts uses position and normal only).
 *  - `pikeMesh()`: the same with the world-lit prop material of the scenery (solid wood and iron),
 *    to stand upright beside a guard, lean on a wall or be held.
 *  - `attachPike(rig, obj)`: puts such an object into a rigged figure's right hand (a bone child):
 *    plumb in the figure's standing pose, the butt on the ground beside the right foot, the shaft
 *    through the fist, the blade's edge forward.
 *  - `PIKE_BESIDE`: where it stands beside a procedural (low-tier) ghost figure, in its own frame.
 */
import { ConeGeometry, ExtrudeGeometry, type BufferGeometry, Mesh, type Object3D, Shape, Vector2, Vector3 } from 'three';
import { SURF } from '../../world/surfaces';
import type { Rig } from '../characters/rig';
import { Kit } from '../scenery/kit';
import { propMaterial } from '../scenery/material';

/** Overall length (m), butt to the spear point. */
export const PIKE_LENGTH = 2.42;

// kit colours, a step lighter than the look (the kit linearises twice, docs/ART-DIRECTION.md §19)
const ASH = 0xc0a47e;
const ASH_DARK = 0xa88e6a;
const STEEL = 0x9ba1a8;
const STEEL_DARK = 0x7d838a;
const TASSEL = 0xc0503e;

/** A flat iron piece in the x/y plane, `t` thick in z, from a polygon (x, y). */
function plate(pts: readonly (readonly [number, number])[], t: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(new Shape(pts.map(([x, y]) => new Vector2(x, y))), { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -t / 2);
  return g;
}

/** The pike as one merged geometry (metres; butt at the origin, +y up, blade towards +x). */
export function pikeGeometry(): BufferGeometry {
  const k = new Kit();
  k.place(0, 0, 0, 0);
  // the ash shaft, a little thicker at the foot, and the iron ferrule
  k.surface = SURF.FINEWOOD;
  k.cyl(0.0165, 0.02, 2.02, 0, 0.04, 0, ASH, undefined, 8);
  k.surface = SURF.IRON;
  k.cyl(0.022, 0.02, 0.07, 0, 0, 0, STEEL_DARK, undefined, 8);
  // the socket and its langets (iron straps nailed down the shaft), a collar below the head
  k.cyl(0.021, 0.024, 0.12, 0, 2.0, 0, STEEL_DARK, undefined, 8);
  for (const s of [-1, 1]) k.box(0.012, 0.3, 0.006, 0, 1.76, s * 0.0185, STEEL_DARK);
  k.cyl(0.028, 0.028, 0.025, 0, 2.11, 0, STEEL, undefined, 10);
  // the tassel under the head (livery red)
  k.surface = SURF.FABRIC;
  k.push(0, 2.0, 0);
  k.cone(0.05, 0.14, 0, -0.14, 0, TASSEL, 8);
  k.cyl(0.026, 0.026, 0.03, 0, -0.01, 0, ASH_DARK, undefined, 8);
  k.pop();
  // the head: axe blade (a crescent edge towards +x), back spike, leaf-shaped point
  k.surface = SURF.IRON;
  k.add(
    plate(
      [
        [0.012, 2.11],
        [0.09, 2.085],
        [0.168, 2.02],
        [0.152, 2.1],
        [0.148, 2.17],
        [0.158, 2.27],
        [0.095, 2.225],
        [0.012, 2.235],
      ],
      0.009,
    ),
    STEEL,
  );
  k.add(
    plate(
      [
        [-0.012, 2.135],
        [-0.1, 2.16],
        [-0.135, 2.19],
        [-0.095, 2.185],
        [-0.012, 2.21],
      ],
      0.012,
    ),
    STEEL_DARK,
  );
  k.cyl(0.013, 0.018, 0.04, 0, 2.2, 0, STEEL, undefined, 8);
  const point = new ConeGeometry(0.036, 0.2, 4, 1);
  point.rotateY(Math.PI / 4);
  point.scale(1, 1, 0.28);
  point.translate(0, PIKE_LENGTH - 0.1, 0);
  k.add(point, STEEL);
  const g = k.build();
  g.computeBoundingBox();
  return g;
}

/** The pike with the scenery's world-lit prop material (origin at the butt, upright). */
export function pikeMesh(): Mesh {
  const mesh = new Mesh(pikeGeometry(), propMaterial());
  mesh.name = 'court-pike';
  return mesh;
}

/**
 * Where the pike stands beside a procedural ghost figure (npc/figure.ts), in the figure's frame
 * (metres, +z forward, its right hand on +x): butt on the ground by the right hand. Scale x and z by
 * `look.height / 1.7`, x also by `look.build`.
 */
export const PIKE_BESIDE = { x: 0.27, z: 0.13 } as const;

export interface AttachPikeOptions {
  /** Hand bone (Quaternius rigs: 'WristR'). */
  bone?: string;
  /** The forearm bone above it, for the grip direction ('LowerArmR'). */
  elbow?: string;
  /** Standing clip whose first frame sets the pose the pike is plumb in ('Idle_Neutral'). */
  clip?: string;
  /** Turn about the shaft (degrees): −90 = the blade's edge forward (default), 0 = to the figure's left, 180 = right. */
  bladeDeg?: number;
}

const _v = new Vector3();

/**
 * Put a pike (`pikeMesh()`, or a Mesh of `pikeGeometry()` with any material; metres, butt at its
 * origin, +y along the shaft) into a rigged figure's right hand. The object becomes a child of the
 * hand bone and follows it from then on. It is placed in the figure's standing pose (the first frame
 * of `clip`; evaluated here when no clip plays yet): plumb, its butt at the feet beside the right
 * foot, the shaft through the fist. Call it once, before the rig's first update — e.g. in
 * RiggedGhost's constructor next to its other hand props. Returns false when the bone is missing.
 */
export function attachPike(rig: Rig, obj: Object3D, o: AttachPikeOptions = {}): boolean {
  const boneName = o.bone ?? 'WristR';
  const wrist = rig.bones.get(boneName);
  if (!wrist) return false;
  const elbow = rig.bones.get(o.elbow ?? 'LowerArmR');
  // evaluate the standing pose once (the clone is still in its bind pose before the first update)
  const clip = o.clip ?? 'Idle_Neutral';
  const started = !rig.current && rig.has(clip) ? rig.action(clip) : null;
  if (started) {
    started.reset().play();
    rig.mixer.update(0);
  }
  rig.model.updateMatrixWorld(true);
  const inv = rig.model.matrixWorld.clone().invert();
  const wp = new Vector3().setFromMatrixPosition(wrist.matrixWorld).applyMatrix4(inv);
  const toModel = 1 / rig.scale; // metres → model units
  // the grip sits in the fist, a hand's breadth on from the wrist along the forearm
  if (elbow) {
    _v.setFromMatrixPosition(elbow.matrixWorld).applyMatrix4(inv);
    const dir = wp.clone().sub(_v).normalize();
    wp.addScaledVector(dir, 0.07 * toModel);
  }
  obj.position.set(wp.x, rig.info.minY, wp.z);
  obj.rotation.set(0, ((o.bladeDeg ?? -90) * Math.PI) / 180, 0);
  obj.scale.setScalar(toModel);
  obj.updateMatrix();
  const ok = rig.attach(boneName, obj);
  started?.stop();
  return ok;
}
