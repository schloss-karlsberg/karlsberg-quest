import { Bone, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, PerspectiveCamera, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type NanFinding, NanWatch, installNanWatch, nanWatchDefaultOn } from '../src/debug/nanWatch';

/** Exploded-geometry watchdog (src/debug/nanWatch.ts, playtest round 10 F-15). */

function world() {
  const scene = new Scene();
  scene.name = 'scene';
  const camera = new PerspectiveCamera(70, 1, 0.2, 7000);
  camera.position.set(0, 2, 5);
  const avatar = new Group();
  avatar.name = 'player-avatar';
  scene.add(avatar);
  const hand = new Group();
  hand.name = 'hand';
  avatar.add(hand);
  const staff = new Mesh(new BoxGeometry(0.05, 1.6, 0.05));
  staff.name = 'staff';
  hand.add(staff);
  const prop = new Mesh(new BoxGeometry(1, 1, 1));
  prop.name = 'rock';
  prop.position.set(3, 0, 0);
  scene.add(prop);
  return { scene, camera, avatar, hand, staff, prop };
}

function skinned() {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
  g.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const root = new Bone();
  root.name = 'hips';
  const arm = new Bone();
  arm.name = 'arm.R';
  root.add(arm);
  const mesh = new SkinnedMesh(g);
  mesh.name = 'body';
  mesh.add(root);
  mesh.bind(new Skeleton([root, arm]));
  return { mesh, arm };
}

function watch(scene: Scene, camera: PerspectiveCamera, roots: () => (Group | null)[] = () => []) {
  const warn = vi.fn<(msg: string, f: NanFinding) => void>();
  const w = new NanWatch({ scene, camera, roots, warn, era: () => 'today', player: () => ({ x: 1, y: 0, z: 2 }) });
  const run = () => {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    return w.scan();
  };
  return { w, warn, run };
}

describe('nan-watch', () => {
  it('a healthy scene yields nothing', () => {
    const { scene, camera, avatar } = world();
    const { mesh } = skinned();
    avatar.add(mesh);
    const { w, warn, run } = watch(scene, camera);
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    expect(run()).toEqual([]);
    expect(run()).toEqual([]);
    expect(w.findings()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a NaN vertex: found once, with the parent chain', () => {
    const { scene, camera, staff } = world();
    const pos = staff.geometry.getAttribute('position');
    // the geometry's sphere was computed while it was healthy: the watchdog sees the new version
    staff.geometry.computeBoundingSphere();
    pos.setXYZ(3, Number.NaN, 0, 0);
    pos.needsUpdate = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { w, warn, run } = watch(scene, camera);
    const now = run();
    run();
    err.mockRestore();
    expect(now).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const [f] = w.findings();
    expect(f!.reason).toBe('sphere');
    expect(f!.name).toBe('staff');
    expect(f!.type).toBe('Mesh');
    expect(f!.uuid).toBe(staff.uuid);
    expect(f!.path).toEqual(['staff', 'hand', 'player-avatar', 'scene']);
    expect(f!.era).toBe('today');
    expect(f!.player).toEqual([1, 0, 2]);
    expect(f!.camera).toEqual([0, 2, 5]);
    expect(f!.stack).toContain('nan-watch');
    expect(warn.mock.calls[0]![0]).toMatch(/^\[nan-watch\] sphere staff/);
  });

  it('a NaN matrix: the root cause once, its children not again', () => {
    const { scene, camera, hand } = world();
    hand.position.x = Number.NaN;
    const { w, run } = watch(scene, camera);
    run();
    run();
    expect(w.findings()).toHaveLength(1);
    const [f] = w.findings();
    expect(f!.reason).toBe('matrix');
    expect(f!.name).toBe('hand');
    expect(f!.path).toEqual(['hand', 'player-avatar', 'scene']);
  });

  it('an exploded scale: radius over 5000 m', () => {
    const { scene, camera, staff } = world();
    staff.scale.setScalar(1e5);
    const { w, run } = watch(scene, camera);
    run();
    run();
    expect(w.findings()).toHaveLength(1);
    const [f] = w.findings();
    expect(f!.reason).toBe('radius');
    expect(f!.path).toEqual(['staff', 'hand', 'player-avatar', 'scene']);
    expect(f!.values.radius as number).toBeGreaterThan(5000);
  });

  it('a centre more than 10 km away', () => {
    const { scene, camera, prop } = world();
    prop.position.set(0, 0, -20_000);
    const { w, run } = watch(scene, camera);
    run();
    expect(w.findings().map((f) => [f.reason, f.name])).toEqual([['centre', 'rock']]);
  });

  it('a NaN bone: reported once by its skinned mesh, naming the bone', () => {
    const { scene, camera, avatar } = world();
    const { mesh, arm } = skinned();
    avatar.add(mesh);
    arm.position.y = Number.NaN;
    const { w, run } = watch(scene, camera);
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    run();
    run();
    expect(w.findings()).toHaveLength(1);
    const [f] = w.findings();
    expect(f!.reason).toBe('bones');
    expect(f!.name).toBe('body');
    expect(f!.type).toBe('SkinnedMesh');
    expect(f!.path).toEqual(['body', 'player-avatar', 'scene']);
    expect(f!.values.boneName).toBe('arm.R');
  });

  it('a hidden avatar is still checked as a root; a hidden prop is not', () => {
    const { scene, camera, avatar, hand, prop } = world();
    avatar.visible = false;
    hand.position.x = Number.NaN;
    prop.visible = false;
    prop.position.y = Number.NaN;
    const a = watch(scene, camera, () => [avatar]);
    a.run();
    expect(a.w.findings().map((f) => f.name)).toEqual(['hand']);
  });

  it('far props are not sphere-tested; under the camera always is', () => {
    const { scene, camera, prop } = world();
    prop.position.set(500, 0, 0);
    prop.geometry.computeBoundingSphere();
    prop.geometry.getAttribute('position').setXYZ(0, 1e9, 0, 0);
    prop.geometry.getAttribute('position').needsUpdate = true;
    const lantern = new Mesh(new BoxGeometry(0.1, 0.1, 0.1));
    lantern.name = 'lantern';
    lantern.scale.setScalar(1e6);
    camera.add(lantern);
    const { w, run } = watch(scene, camera);
    run();
    expect(w.findings().map((f) => [f.reason, f.path.join('<')])).toEqual([['radius', 'lantern<PerspectiveCamera']]);
  });

  it('a broken camera is flagged; clear() forgets and the ring keeps 20', () => {
    const { scene, camera } = world();
    camera.position.z = Number.NaN;
    const { w, run } = watch(scene, camera);
    run();
    expect(w.findings().map((f) => f.reason)).toEqual(['camera']);
    w.clear();
    expect(w.findings()).toEqual([]);
    camera.position.z = 5;
    for (let i = 0; i < 25; i++) {
      const m = new Mesh(new BoxGeometry(1, 1, 1));
      m.name = `m${i}`;
      m.position.x = Number.NaN;
      scene.add(m);
    }
    run();
    expect(w.findings()).toHaveLength(20);
    expect(w.findings().at(-1)!.name).toBe('m24');
  });

  it('activation: ?debug or WebDriver; the render hook only while enabled, every n frames', () => {
    expect(nanWatchDefaultOn(false, {})).toBe(false);
    expect(nanWatchDefaultOn(false, { webdriver: false })).toBe(false);
    expect(nanWatchDefaultOn(true, {})).toBe(true);
    expect(nanWatchDefaultOn(false, { webdriver: true })).toBe(true);
    const { scene, camera, hand } = world();
    const before = scene.onAfterRender;
    let frame = 0;
    const warn = vi.fn();
    const api = installNanWatch({ scene, camera, warn, frame: () => frame, on: false });
    expect(scene.onAfterRender).toBe(before);
    expect(api.enabled()).toBe(false);
    hand.position.x = Number.NaN;
    scene.updateMatrixWorld(true);
    const render = () => scene.onAfterRender(null as never, scene, camera, null as never, null as never, null as never);
    render();
    expect(warn).not.toHaveBeenCalled();
    expect(api.enabled(true)).toBe(true);
    expect(scene.onAfterRender).not.toBe(before);
    api.every(30);
    render();
    expect(api.findings()).toHaveLength(1);
    api.clear();
    frame = 10;
    render();
    expect(api.findings()).toHaveLength(0);
    frame = 30;
    render();
    render();
    expect(api.findings()).toHaveLength(1);
    expect(api.enabled(false)).toBe(false);
    expect(scene.onAfterRender).toBe(before);
  });
});
