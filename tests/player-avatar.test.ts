import { AnimationClip, Bone, BoxGeometry, Group, Mesh, MeshStandardMaterial, NumberKeyframeTrack, PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from '../src/player/avatar';
import { FLASCHENGRUEN } from '../src/player/cosmetics';
import { actionPose } from '../src/player/pose';
import { PLAYER_DT, playerFixture } from './player-fixture';

const restPose = { ...actionPose };
afterEach(() => {
  Object.assign(actionPose, restPose);
  vi.unstubAllGlobals();
});

async function avatarFixture() {
  const { player, input, events, step } = playerFixture();
  const model = new Group();
  const body = new Mesh(new BoxGeometry(0.5, 1.7, 0.3), new MeshStandardMaterial());
  body.position.y = 0.85;
  const chest = new Bone();
  chest.name = 'Chest';
  model.add(body, chest);
  const clips = ['Idle', 'Idle_Sword', 'Walk', 'Run', 'Run_Back', 'Run_Left', 'Run_Right', 'Roll', 'Death', 'Sword_Slash', 'HitReceive', 'Wave', 'Punch_Right'];
  const animations = clips.map((name, i) => new AnimationClip(name, 1, [
    new NumberKeyframeTrack('Chest.position[y]', [0, 1], [i, i + 1]),
  ]));
  const avatar = new Avatar(new Scene(), player, async () => ({ scene: model, animations }), events, null);
  avatar.setLanternTint(FLASCHENGRUEN);
  await avatar.useModel(async () => ({ scene: model, animations }), null);
  const camera = new PerspectiveCamera();
  let time = 0;
  function frame(frames = 1, hidden = false, dt = PLAYER_DT) {
    for (let i = 0; i < frames; i++) {
      player.applyCamera(camera, 1, PLAYER_DT);
      time += dt;
      avatar.frame({ dt, time, camera, hidden, reducedMotion: false, reducedFlash: false });
    }
  }
  const poseChest = avatar.root.getObjectByName('Chest')!;
  return { avatar, input, player, poseChest, step, frame };
}

describe('avatar animation', () => {
  it('blends idle into walking and sprinting, then settles back to idle', async () => {
    const { avatar, input, step, frame } = await avatarFixture();
    try {
      frame();
      expect(avatar.ready).toBe(true);
      expect(avatar.lanternTint).toBe(FLASCHENGRUEN);
      expect(avatar.debug.visible).toBe(true);
      expect(avatar.debug.clip).toBe('Idle');
      input.press('forward', true);
      for (let i = 0; i < 40; i++) {
        step();
        frame();
      }
      expect(avatar.debug.clip).toBe('Walk');
      expect(avatar.debug.weights.Walk).toBeGreaterThan(0.6);
      input.press('sprint', true);
      for (let i = 0; i < 40; i++) {
        step();
        frame();
      }
      expect(avatar.debug.clip).toBe('Run');
      expect(avatar.debug.weights.Run).toBeGreaterThan(0.95);
      input.press('forward', false);
      frame(55);
      expect(avatar.debug.clip).toBe('Idle');
      expect(avatar.debug.weights.Run).toBe(0);
    } finally {
      avatar.dispose();
    }
  });

  it.each(['teleport', 'return from first person'] as const)('faces the new view after a %s while moving', async (transition) => {
    const { avatar, player, input, step, frame } = await avatarFixture();
    try {
      input.press('forward', true);
      input.press('sprint', true);
      for (let i = 0; i < 40; i++) {
        step();
        frame();
      }
      expect(avatar.debug.clip).toBe('Run');
      input.press('forward', false);
      player.yaw = Math.PI / 2;
      if (transition === 'teleport') {
        player.teleport(30, 30);
      } else {
        player.cameraMode = 'first';
        frame();
        player.cameraMode = 'third';
      }
      frame();
      expect(avatar.root.children[0]!.rotation.y).toBeCloseTo(1.5 * Math.PI);
      frame(15);
      expect(avatar.root.children[0]!.rotation.y).toBeCloseTo(1.5 * Math.PI);
      expect(avatar.debug.clip).toBe('Idle');
    } finally {
      avatar.dispose();
    }
  });

  it('faces the arrival direction during a zero-time travel frame and resumes at rest', async () => {
    const { avatar, player, input, step, frame } = await avatarFixture();
    try {
      input.press('forward', true);
      input.press('sprint', true);
      for (let i = 0; i < 40; i++) {
        step();
        frame();
      }
      expect(avatar.debug.clip).toBe('Run');
      expect(avatar.facing).toBeCloseTo(0);
      input.press('forward', false);
      input.press('sprint', false);

      player.teleport(30, 30, Math.PI / 2);
      frame(1, false, 0);
      expect.soft(avatar.root.children[0]!.rotation.y).toBeCloseTo(1.5 * Math.PI);
      frame();
      expect.soft(avatar.facing).toBeCloseTo(Math.PI / 2);
      frame(15);
      expect.soft(avatar.facing).toBeCloseTo(Math.PI / 2);
      expect(avatar.debug.clip).toBe('Idle');
    } finally {
      avatar.dispose();
    }
  });

  it('takes the armed idle and backward strafe while facing a locked target', async () => {
    const { avatar, player, input, step, frame } = await avatarFixture();
    try {
      Object.assign(actionPose, { armed: true, inCombat: true, hidden: false, target: { x: 0, z: -10 } });
      frame(45);
      expect(avatar.debug.clip).toBe('Idle_Sword');
      expect(avatar.debug.armed).toBe(true);
      input.press('back', true);
      for (let i = 0; i < 45; i++) {
        step();
        frame();
      }
      expect(player.position.z).toBeGreaterThan(0);
      expect(avatar.debug.clip).toBe('Run_Back');
      expect(avatar.root.children[0]!.rotation.y).toBeCloseTo(Math.PI);
    } finally {
      avatar.dispose();
    }
  });

  it('plays death ahead of roll and swing and returns to the live animation on revival', async () => {
    const { avatar, poseChest, frame } = await avatarFixture();
    try {
      actionPose.swing = { kind: 'light', combo: 0, t: 0.2, dur: 0.4, yaw: 0 };
      frame();
      expect(avatar.debug.upper).toBe('Sword_Slash');
      actionPose.dodge = 0;
      frame();
      expect(avatar.debug.full).toBe('Roll');
      expect(avatar.debug.upper).toBe('');
      expect(poseChest.position.y).toBeCloseTo(7.06, 2);
      actionPose.dead = true;
      frame(80);
      expect(avatar.debug.full).toBe('Death');
      expect(poseChest.position.y).toBeCloseTo(8.999, 3);

      Object.assign(actionPose, restPose);
      frame();
      expect(avatar.debug.full).toBe('');
      expect(avatar.debug.clip).toBe('Idle');
      actionPose.dead = true;
      frame();
      expect(poseChest.position.y).toBeCloseTo(8 + PLAYER_DT / 1.04, 3);
    } finally {
      avatar.dispose();
    }
  });

  it('throws with the right arm over the legs, turns to the view and is done in under half a second', async () => {
    const { avatar, player, frame } = await avatarFixture();
    try {
      frame();
      expect(avatar.debug.upper).toBe('');
      player.yaw = 1.2;
      avatar.react('throw');
      frame(6);
      expect(avatar.debug.upper).toBe('throw:Punch_Right');
      expect(avatar.debug.full).toBe('');
      frame(40);
      expect(avatar.debug.upper).toBe('');
      // the body turned to where the chestnut went
      expect(Math.abs(avatar.facing - 1.2)).toBeLessThan(0.2);
    } finally {
      avatar.dispose();
    }
  });

  it('expires a throw made in first person before showing the avatar again', async () => {
    const { avatar, player, frame } = await avatarFixture();
    try {
      player.cameraMode = 'first';
      avatar.react('throw');
      frame(30);
      player.cameraMode = 'third';
      frame();
      expect(avatar.debug.visible).toBe(true);
      expect(avatar.debug.upper).toBe('');
    } finally {
      avatar.dispose();
    }
  });

  it('clears a throw reaction on teleport', async () => {
    const { avatar, player, frame } = await avatarFixture();
    try {
      frame();
      avatar.react('throw');
      frame(6);
      expect(avatar.debug.upper).toBe('throw:Punch_Right');
      player.teleport(30, 30);
      frame();
      expect(avatar.debug.upper).toBe('');
    } finally {
      avatar.dispose();
    }
  });

  it('holds a hit reaction during hit-stop and hides the body during first person or a camera override', async () => {
    const { avatar, player, poseChest, frame } = await avatarFixture();
    try {
      frame();
      const idlePose = poseChest.position.y;
      avatar.react('hit');
      frame(8);
      expect(poseChest.position.y - idlePose).toBeGreaterThan(1);
      expect(avatar.debug.upper).toBe('HitRecieve');
      actionPose.frozen = true;
      frame();
      const heldPose = poseChest.position.y;
      for (let i = 0; i < 3; i++) {
        frame();
        expect(poseChest.position.y).toBeCloseTo(heldPose);
        expect(avatar.debug.upper).toBe('HitRecieve');
      }
      actionPose.frozen = false;
      frame(2);
      expect(poseChest.position.y).toBeGreaterThan(heldPose);
      frame(30);
      expect(avatar.debug.upper).toBe('');

      frame(1, true);
      expect(avatar.root.visible).toBe(false);
      player.cameraMode = 'first';
      frame();
      expect(avatar.debug.visible).toBe(false);
      player.cameraMode = 'third';
      frame();
      expect(avatar.debug.visible).toBe(true);
    } finally {
      avatar.dispose();
    }
  });
});
