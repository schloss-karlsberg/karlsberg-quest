import { AnimationClip, Bone, BoxGeometry, Float32BufferAttribute, Group, Mesh, type Object3D, PropertyBinding, Quaternion, QuaternionKeyframeTrack, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import type { AssetLoader, LoadedModel } from '../src/assets/loader';
import { PIKEUR_RIG } from '../src/systems/characters/catalog';
import { cloneRigged, findBone, Rig } from '../src/systems/characters/rig';

describe('rig clone: shared skeletons', () => {
  /** Outfit pieces on one rig: `shared` meshes on one skeleton, plus one mesh on a skeleton of its own. */
  function pieces(shared: number): LoadedModel {
    const scene = new Group();
    const hips = new Bone();
    hips.name = 'pelvis';
    const spine = new Bone();
    spine.name = 'spine_01';
    spine.position.y = 0.2;
    hips.add(spine);
    scene.add(hips);
    const mesh = (name: string, sk: Skeleton): SkinnedMesh => {
      const g = new BoxGeometry(0.4, 1.7, 0.3);
      const n = g.getAttribute('position').count;
      g.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
      g.setAttribute('skinWeight', new Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
      const m = new SkinnedMesh(g);
      m.name = name;
      m.bind(sk);
      scene.add(m);
      return m;
    };
    const one = new Skeleton([hips, spine]);
    for (let i = 0; i < shared; i++) mesh(`avatar-piece-${i}`, one);
    mesh('other', new Skeleton([hips, spine]));
    return { scene, animations: [] };
  }

  it('meshes sharing a skeleton in the source share one in the clone, bound to the cloned bones', () => {
    const src = pieces(4);
    const copy = cloneRigged(src.scene);
    const skinned: SkinnedMesh[] = [];
    copy.traverse((o) => (o as SkinnedMesh).isSkinnedMesh && skinned.push(o as SkinnedMesh));
    expect(skinned.length).toBe(5);
    const shared = new Set(skinned.slice(0, 4).map((m) => m.skeleton));
    expect(shared.size).toBe(1);
    expect(skinned[4]!.skeleton).not.toBe(skinned[0]!.skeleton);
    const sk = skinned[0]!.skeleton;
    expect(sk.bones[0]).toBe(copy.getObjectByName('pelvis'));
    expect(sk.bones[0]).not.toBe(src.scene.getObjectByName('pelvis'));
    expect(skinned[4]!.skeleton.bones[0]).toBe(copy.getObjectByName('pelvis'));
  });

  it('Rig uses it: one skeleton for the pieces', () => {
    const rig = new Rig(pieces(3), 1.8);
    const sk = new Set(rig.meshes.filter((m) => m.name.startsWith('avatar-piece-')).map((m) => (m as SkinnedMesh).skeleton));
    expect(sk.size).toBe(1);
    rig.dispose();
  });
});
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

describe('rig: bone turns after the mixer (TASK-091)', () => {
  /**
   * pelvis → spine_01 → neck_01 → head, 0.3 m apart, with an idle clip like the packed MPFB
   * player's: the pelvis bobs, the head nods, spine_01 holds still (two equal STEP keys) and
   * neck_01 has no track at all. three's mixer writes a bone only when its blended value changed.
   */
  function player(): LoadedModel {
    const m = skeleton([
      ['pelvis', null],
      ['spine_01', 'pelvis'],
      ['neck_01', 'spine_01'],
      ['head', 'neck_01'],
    ]);
    m.scene.getObjectByName('pelvis')!.position.y = 0.9;
    for (const n of ['spine_01', 'neck_01', 'head']) m.scene.getObjectByName(n)!.position.y = 0.3;
    const still = new QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
    const bob = new VectorKeyframeTrack('pelvis.position', [0, 0.5, 1], [0, 0.9, 0, 0, 0.91, 0, 0, 0.9, 0]);
    const nod = new QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0, 0, 0, 1, 0.01, 0, 0, 0.99995, 0, 0, 0, 1]);
    return { scene: m.scene, animations: [new AnimationClip('Idle', 1, [still, bob, nod])] };
  }

  const rest = new Quaternion();
  const up = new Vector3();

  function bend(rig: Rig, frames: number, pitch: number, dt = 1 / 60): void {
    for (let i = 0; i < frames; i++) {
      rig.update(dt);
      rig.turnBone('spine_01', 0, pitch);
      rig.turnBone('neck_01', 0.2, 0);
      rig.root.updateMatrixWorld(true);
    }
  }

  it('a turn on a bone that holds still in the clip is one turn, however many frames pass', () => {
    const rig = new Rig(player(), 1.8);
    rig.play('Idle', { fade: 0 });
    bend(rig, 1, 0.42);
    expect(rig.bone('spine_01')!.quaternion.angleTo(rest)).toBeCloseTo(0.42, 5);
    bend(rig, 240, 0.42);
    expect(rig.bone('spine_01')!.quaternion.angleTo(rest)).toBeCloseTo(0.42, 5);
    // a bone without a track (never written by the mixer) keeps to one turn too
    expect(rig.bone('neck_01')!.quaternion.angleTo(rest)).toBeCloseTo(0.2, 5);
    // the head stays above the hips: 0.42 rad of lean, not a body folded in half
    const head = rig.bone('head')!.getWorldPosition(up).y;
    expect(head).toBeGreaterThan(rig.bone('pelvis')!.getWorldPosition(new Vector3()).y + 0.3);
    rig.dispose();
  });

  it('frames without game time (pause, bullet time: dt 0) do not pile the turn up either', () => {
    const rig = new Rig(player(), 1.8);
    rig.play('Idle', { fade: 0 });
    bend(rig, 3, 0.42);
    bend(rig, 120, 0.42, 0);
    expect(rig.bone('spine_01')!.quaternion.angleTo(rest)).toBeCloseTo(0.42, 5);
    rig.dispose();
  });

  it('a turn ends with the frame it was asked for: the next update starts from the clip pose', () => {
    const rig = new Rig(player(), 1.8);
    rig.play('Idle', { fade: 0 });
    bend(rig, 30, 0.42);
    rig.update(1 / 60);
    expect(rig.bone('spine_01')!.quaternion.angleTo(rest)).toBeCloseTo(0, 6);
    expect(rig.bone('neck_01')!.quaternion.angleTo(rest)).toBeCloseTo(0, 6);
    rig.dispose();
  });
});
