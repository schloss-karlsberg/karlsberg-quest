/**
 * The avatar's crouch on the real player models (TASK-091), parsed in node (no GPU): the head stays
 * above the hips and the feet on the ground, standing still, walking and through the transitions.
 * The real GLBs matter: the fold came from the packed MPFB clips, whose spine_01 track holds still.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedModel } from '../src/assets/loader';
import { AVATAR_HEIGHT, Avatar } from '../src/player/avatar';
import { actionPose } from '../src/player/pose';
import { PLAYER_DT, playerFixture } from './player-fixture';

const restPose = { ...actionPose };
afterEach(() => {
  Object.assign(actionPose, restPose);
  vi.unstubAllGlobals();
});

const models = new Map<string, Promise<LoadedModel>>();
function loadModel(path: string): Promise<LoadedModel> {
  let p = models.get(path);
  if (!p) {
    p = (async () => {
      await MeshoptDecoder.ready;
      const buf = readFileSync(resolve(import.meta.dirname, '../public/assets/models', path));
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const g = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
      return { scene: g.scene, animations: g.animations };
    })();
    models.set(path, p);
  }
  return p;
}

const MODELS = {
  mpfb: { path: 'chars/player-head-mpfb.glb', height: null, head: 'head', hips: 'pelvis', feet: ['foot_l', 'foot_r'], knees: ['calf_l', 'calf_r'] },
  surveyor: { path: 'characters/human_adventurer.glb', height: AVATAR_HEIGHT, head: 'Head', hips: 'Hips', feet: ['FootL', 'FootR'], knees: ['LowerLegL', 'LowerLegR'] },
} as const;

async function fixture(which: keyof typeof MODELS) {
  const M = MODELS[which];
  const src = await loadModel(M.path);
  const { player, input, events, step } = playerFixture();
  const avatar = new Avatar(new Scene(), player, async () => src, events, M.height);
  expect(await avatar.whenReady()).toBe(true);
  const camera = new PerspectiveCamera();
  let time = 0;
  /** `dt` 0: a frame without game time (pause, bullet time between steps). */
  function frame(frames = 1, dt = PLAYER_DT) {
    for (let i = 0; i < frames; i++) {
      player.applyCamera(camera, 1, PLAYER_DT);
      time += dt;
      avatar.frame({ dt, time, camera, hidden: false, reducedMotion: false, reducedFlash: false });
    }
  }
  /** Simulate and draw: the player moves, the avatar follows. */
  function play(frames: number) {
    for (let i = 0; i < frames; i++) {
      step();
      frame();
    }
  }
  const bone = (n: string): Object3D => {
    const b = avatar.root.getObjectByName(n);
    if (!b) throw new Error(`no bone ${n}`);
    return b;
  };
  const v = new Vector3();
  /** Heights above the ground under the player (m). */
  const y = (n: string) => bone(n).getWorldPosition(v).y - player.position.y;
  /** How far a bone is ahead of the hips along the facing (the fixture faces −z). */
  const ahead = (n: string) => -(bone(n).getWorldPosition(v).z - bone(M.hips).getWorldPosition(new Vector3()).z);
  const pose = () => ({ head: y(M.head), hips: y(M.hips), feet: M.feet.map((f) => y(f)), knees: M.knees.map((k) => ahead(k)) });
  return { avatar, player, input, frame, play, pose };
}

describe.each(['mpfb', 'surveyor'] as const)('avatar crouch on the %s model', (which) => {
  it('crouched idle keeps one pose: head over the hips, however long it stands', async () => {
    const { avatar, player, play, frame, pose } = await fixture(which);
    try {
      play(60);
      const stand = pose();
      player.setStance('crouch');
      play(90);
      const a = pose();
      play(600);
      const b = pose();
      // paused / bullet time: frames without game time
      frame(300, 0);
      const c = pose();
      expect(avatar.debug.clip).toBe('Idle');
      for (const p of [a, b, c]) {
        // lower than standing, and still a person: the head well above the hips
        expect(p.head).toBeLessThan(stand.head - 0.15);
        expect(p.head - p.hips).toBeGreaterThan((stand.head - stand.hips) * 0.75);
        expect(p.hips).toBeLessThan(stand.hips - 0.08);
      }
      // the idle clip breathes by millimetres; the pose does not drift
      expect(Math.abs(b.head - a.head)).toBeLessThan(0.03);
      expect(Math.abs(c.head - b.head)).toBeLessThan(0.03);
    } finally {
      avatar.dispose();
    }
  });

  it('standing up again returns to the standing pose', async () => {
    const { avatar, player, play, pose } = await fixture(which);
    try {
      play(60);
      const stand = pose();
      player.setStance('crouch');
      play(200);
      player.setStance('stand');
      play(120);
      const up = pose();
      expect(Math.abs(up.head - stand.head)).toBeLessThan(0.02);
      expect(Math.abs(up.hips - stand.hips)).toBeLessThan(0.02);
    } finally {
      avatar.dispose();
    }
  });
});

// The knees bend only on a leg chain that carries its foot: the MPFB player (the default avatar).
// The CC0 surveyor's feet are baked IK targets under the root; it leans and sinks (CROUCH.sink).
describe('avatar crouch on the mpfb model: the legs', () => {
  it('the knees bend forward and the feet stay on the ground (standing still and walking)', async () => {
    const { avatar, player, input, play, pose } = await fixture('mpfb');
    try {
      play(60);
      const stand = pose();
      const ankle = Math.min(...stand.feet);
      player.setStance('crouch');
      play(120);
      const idle = pose();
      for (const f of idle.feet) expect(Math.abs(f - ankle)).toBeLessThan(0.05);
      idle.knees.forEach((k, i) => expect(k).toBeGreaterThan(stand.knees[i]! + 0.15));
      input.press('forward', true);
      let low = Infinity;
      let headLow = Infinity;
      let gap = Infinity;
      for (let i = 0; i < 180; i++) {
        play(1);
        const p = pose();
        low = Math.min(low, ...p.feet);
        headLow = Math.min(headLow, p.head);
        gap = Math.min(gap, p.head - p.hips);
      }
      expect(avatar.debug.clip).toBe('Walk');
      // no foot sinks into the ground, the body stays upright over the hips
      expect(low).toBeGreaterThan(ankle - 0.06);
      expect(gap).toBeGreaterThan((stand.head - stand.hips) * 0.7);
      expect(headLow).toBeGreaterThan(stand.head * 0.55);
    } finally {
      avatar.dispose();
    }
  });
});
