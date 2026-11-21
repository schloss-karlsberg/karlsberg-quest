import { Bone, BoxGeometry, Group, Mesh, type Object3D, PropertyBinding, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import type { AssetLoader, LoadedModel } from '../src/assets/loader';
import { PIKEUR_RIG } from '../src/systems/characters/catalog';
import { findBone, Rig } from '../src/systems/characters/rig';
import { EnemyRigs, type RigPose } from '../src/systems/combat/rigged';
import type { Enemy } from '../src/systems/combat/sim';

/** A bone chain as GLTFLoader names it (sanitized: 'UpperLeg.L' → 'UpperLegL'), with a body box to measure. */
function skeleton(names: [string, string | null][]): LoadedModel {
  const scene = new Group();
  const body = new Mesh(new BoxGeometry(0.5, 1.8, 0.3));
  body.name = 'Body';
  body.position.y = 0.9;
  scene.add(body);
  const byName = new Map<string, Object3D>();
  for (const [n, parent] of names) {
    const b = new Bone();
    b.name = PropertyBinding.sanitizeNodeName(n);
    (parent ? byName.get(parent)! : scene).add(b);
    byName.set(n, b);
  }
  return { scene, animations: [] };
}

const HUMAN: [string, string | null][] = [
  ['Hips', null],
  ['Torso', 'Hips'],
  ['Head', 'Torso'],
  ['UpperLeg.L', 'Hips'],
  ['LowerLeg.L', 'UpperLeg.L'],
  ['UpperLeg.R', 'Hips'],
  ['LowerLeg.R', 'UpperLeg.R'],
];

describe('rig bones: GLTF-sanitized names', () => {
  it('findBone finds a sanitized bone by its dotted source name', () => {
    const m = skeleton(HUMAN);
    const b = findBone(m.scene, 'UpperLeg.L');
    expect(b?.name).toBe('UpperLegL');
    expect(m.scene.getObjectByName('UpperLeg.L')).toBeUndefined();
  });

  it('findBone still finds a bone by its exact name', () => {
    const m = skeleton(HUMAN);
    expect(findBone(m.scene, 'Torso')?.name).toBe('Torso');
    expect(findBone(m.scene, 'LowerLegR')?.name).toBe('LowerLegR');
  });

  it('findBone returns undefined for a missing bone', () => {
    const m = skeleton(HUMAN);
    expect(findBone(m.scene, 'Tail.L')).toBeUndefined();
    expect(findBone(m.scene, 'Wing')).toBeUndefined();
  });

  it('Rig.bone resolves dotted and exact names on the cloned skeleton', () => {
    const rig = new Rig(skeleton(HUMAN), 1.9);
    expect(rig.bone('UpperLeg.R')?.name).toBe('UpperLegR');
    expect(rig.bone('Hips')?.name).toBe('Hips');
    expect(rig.bone('Nope.L')).toBeUndefined();
  });

  it("the Pikeur rider's seated pose bends his (sanitized) leg bones", () => {
    const models: Record<string, LoadedModel> = {
      [PIKEUR_RIG.horse.model]: skeleton([
        ['Root', null],
        [PIKEUR_RIG.saddleBone, 'Root'],
      ]),
      [PIKEUR_RIG.rider.model]: skeleton(HUMAN),
    };
    if (PIKEUR_RIG.hound.model !== PIKEUR_RIG.horse.model) models[PIKEUR_RIG.hound.model] = skeleton([['Root', null]]);
    const assets = { peek: (id: string) => models[id] ?? null, model: () => Promise.resolve(null) } as unknown as AssetLoader;
    const rigs = new EnemyRigs();
    rigs.setAssets(assets);
    const e = { id: 'pk', kind: 'pikeur', seed: 0.3, size: 1, heading: 0, x: 0, y: 0, z: 0, hitX: 0, hitZ: 0, state: 'idle', boss: true, t: 0, windup: 1, aggro: false } as unknown as Enemy;
    const pose: RigPose = { lean: 0, sink: 0, tellK: 0, flash: 0, flinch: 0, stunned: false, fade: 0, dissolve: 0, reducedFlash: false, frozen: false };
    rigs.draw(e, pose, 1 / 60, () => {});
    const legs = ['UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR'].map((n) => rigs.object.getObjectByName(n));
    const rest = new Quaternion();
    for (const b of legs) {
      expect(b).toBeDefined();
      // turned well away from the rest pose (thighs ~1.35 rad, shins ~1.45 rad)
      expect(b!.quaternion.angleTo(rest)).toBeGreaterThan(1);
    }
    rigs.dispose();
  });
});
