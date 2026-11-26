import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import route from '../content/routes/p-fuehrung.json';
import tour from '../content/story/00-tour.story.json';
import { EventBus } from '../src/core/events';
import { Player, type PlayerWorld } from '../src/player/player';
import { applyDogRequest, createDog, dogSlot, stepDog, type DogTarget } from '../src/systems/animals/dogs';
import { toRequest, type AnimalAction } from '../src/systems/animals/types';
import { normalize, poseAt } from '../src/systems/cinematic/keys';
import type { StoryFile } from '../src/systems/story/types';
import { WalkRuntime, type WalkBus } from '../src/systems/walk/runtime';
import type { Route, WalkSlice } from '../src/systems/walk/types';
import { DOG_RADIUS, PLAYER_RADIUS, separateFromCrowd, VISITOR_RADIUS } from '../src/world/crowd';
import { loadWorldData } from './world-data';

const story = tour as StoryFile;

describe('tour playtest regressions', () => {
  it('keeps both running dogs in the Wind shot using the live path and terrain', () => {
    const { h2025 } = loadWorldData();
    const ground = (x: number, z: number) => h2025.heightAt(x, z);
    const wind = story.beats.find((b) => b.id === 't8')!.enter!;
    const plan = normalize(wind.find((a) => a.do === 'cinematic'));
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.error);

    const group = story.beats[0]!.enter!.find((a) => a.do === 'npc' && a.op === 'group');
    if (group?.do !== 'npc') throw new Error('Missing tour group');
    const slice: WalkSlice = { walkers: [], groups: [] };
    const walk = new WalkRuntime({
      bus: new EventBus() as unknown as WalkBus,
      bodies: () => null,
      routes: new Map([[route.id, route as Route]]),
      slice: () => slice,
      world: { heightAt: ground, player: () => ({ x: 674, z: -629 }), era: () => 'today' },
    });
    walk.request({ op: 'group', group: 'fuehrung', leader: 'imhoff', members: group.members! });
    walk.request({ op: 'follow', group: 'fuehrung', leader: 'imhoff' });
    walk.request({ op: 'walk', npc: 'imhoff', route: route.id, to: 'wind' });
    expect(walk.snap('fuehrung', 'wind')).toBe(true);
    const jost = walk.npcs.get('double.jost')!;
    const leader: DogTarget = { x: jost.x, z: jost.z, yaw: jost.yaw, speed: 0 };
    const dogs = (['diane', 'bijou'] as const).map((id) => {
      const dog = createDog({ id, op: 'spawn', look: id, kind: 'hund', follow: 'npc:double.jost' }, undefined, leader);
      Object.assign(dog, dogSlot(leader, dog.slot, dog.spacing));
      return dog;
    });
    // The story runs the cue delays cumulatively. Diane leaves 0.4 s before Bijou and the camera.
    for (const dog of dogs) {
      const cue = toRequest(wind.find((a) => a.do === 'animal' && a.op === 'run' && a.id === dog.id) as AnimalAction);
      if (!cue) throw new Error(`Missing run cue for ${dog.id}`);
      applyDogRequest(dog, cue);
    }
    const dt = 1 / 60;
    for (let i = 0; i < 24; i++) stepDog(dogs[0]!, dt, () => leader);
    const snap = { x: 674, y: ground(674, -629), z: -629, yaw: -1, pitch: -0.1, eye: 1.65, cam: { x: 674, y: 275, z: -627, fov: 70 } };
    const centre = (x: number, z: number) => new Vector3(x, ground(x, z) + 0.45, z);
    const env = {
      ground,
      target: (id: string) => {
        const dog = dogs.find((d) => id === `animal:${d.id}`);
        return dog ? centre(dog.x, dog.z) : null;
      },
    };
    const matrix = new Matrix4();
    const frustum = new Frustum();
    for (let frame = 0; frame <= 360; frame++) {
      const t = frame * dt;
      const pose = poseAt(plan.plan, t, snap, env, snap);
      for (const aspect of [16 / 9, 9 / 16]) {
        const camera = new PerspectiveCamera(pose.fov, aspect, 0.2, 1000);
        camera.position.set(pose.x, pose.y, pose.z);
        camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        for (const dog of dogs) {
          const point = centre(dog.x, dog.z);
          expect(frustum.containsPoint(point), `${dog.id} at ${t.toFixed(2)} s, aspect ${aspect}`).toBe(true);
          // Check the ray over the LiDAR surface as well as its position in the image.
          for (let i = 1; i < 20; i++) {
            const ray = camera.position.clone().lerp(point, i / 20);
            expect(ray.y, `terrain occludes ${dog.id} at ${t.toFixed(2)} s`).toBeGreaterThan(ground(ray.x, ray.z));
          }
        }
      }
      for (const dog of dogs) stepDog(dog, dt, () => leader);
    }
  });

  it.each([VISITOR_RADIUS, DOG_RADIUS])('keeps a walking player outside a tour circle of radius %s', (radius) => {
    const obstacle = { x: 0, y: 0, z: -2, radius };
    const world: PlayerWorld = {
      heightAt: () => 0,
      collide: (x, z) => ({ x, z, hit: false }),
      separate: (x, z, r, from) => {
        const body = { x, y: from.y, z, radius: r };
        separateFromCrowd(body, [obstacle], from);
        return body;
      },
      bounds: () => ({ x0: -10, z0: -10, x1: 10, z1: 10 }),
      surfaceAt: () => 'meadow',
      coverAt: () => 0,
      canFly: () => false,
    };
    const keys = new Set(['forward']);
    const input = { isDown: (key: string) => keys.has(key), wasPressed: () => false } as unknown as ConstructorParameters<typeof Player>[1];
    const player = new Player(world, input, new EventBus());
    for (let i = 0; i < 90; i++) player.update(1 / 60);
    expect(player.position.z - obstacle.z).toBeCloseTo(radius + PLAYER_RADIUS, 2);
    keys.add('right');
    for (let i = 0; i < 45; i++) player.update(1 / 60);
    expect(player.position.z).toBeLessThan(obstacle.z - 0.5);
  });

  it('runs the first departure after the resumable line wait', () => {
    const actions = story.beats.find((b) => b.id === 't3')!.enter!;
    const line = actions.findIndex((a) => a.do === 'say' && a.id === 'imhoff.t.los');
    expect(actions[line]).toMatchObject({ do: 'say', wait: true, onResume: true });
    expect(actions.findIndex((a) => a.do === 'npc' && a.op === 'follow')).toBeGreaterThan(line);
    expect(actions.findIndex((a) => a.do === 'npc' && a.op === 'walk')).toBeGreaterThan(line);
  });
});
