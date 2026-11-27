import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Camera, Group, Mesh, type Object3D, OrthographicCamera, PerspectiveCamera, Scene } from 'three';
import { sampleRenderWork } from '../e2e/helpers/render-work';

afterEach(() => vi.unstubAllGlobals());

function renderFixture(secondReady = Promise.resolve(true)) {
  const scene = new Scene();
  const post = new Scene();
  const camera = new PerspectiveCamera();
  const shadow = new OrthographicCamera();
  shadow.layers.enable(1);
  const terrain = new Mesh();
  scene.add(terrain);
  const blit = new Mesh();
  blit.userData.triangles = 7;
  post.add(blit);
  const group = ['guide', 'visitor'].map((id, i) => {
    const root = new Group();
    const body = new Mesh();
    body.userData.triangles = 20 + i * 10;
    root.add(body);
    scene.add(root);
    return { id, root, body, ready: i === 0 ? Promise.resolve(true) : secondReady };
  });
  const perf = { frames: 42 };
  let tick = 0;
  const passes: { tick: number; camera: Camera; x: number; bodies: boolean[] }[] = [];
  const renderer = {
    info: { render: { calls: 0, triangles: 0 } },
    render: vi.fn((passScene: Scene, passCamera: Camera) => {
      if (passScene === scene) passes.push({ tick, camera: passCamera, x: passCamera.position.x, bodies: group.map((person) => person.root.visible) });
      passScene.traverseVisible((object) => {
        if (object instanceof Mesh && object.layers.test(passCamera.layers)) renderer.renderBufferDirect(passCamera, passScene, null, null, object);
      });
    }),
    renderBufferDirect: vi.fn((_camera: Camera, _scene: Scene, _geometry: unknown, _material: unknown, object: Object3D) => {
      renderer.info.render.calls++;
      renderer.info.render.triangles += object.userData.triangles;
    }),
  };
  const step = vi.fn((ticks: number) => {
    tick += ticks;
    camera.position.x = tick;
    // A heavier world frame arrives after the group has been drawn once.
    terrain.userData.triangles = tick === 15 ? 100 : 1000;
    group[0]!.body.userData.triangles = tick === 15 ? 20 : 10;
    renderer.info.render = { calls: 0, triangles: 0 };
    renderer.render(scene, shadow);
    renderer.render(scene, camera);
    renderer.render(post, camera);
    perf.frames++;
  });
  const screenshotReady = vi.fn(async () => {});
  const people = { get: (id: string) => group.find((person) => person.id === id) };
  vi.stubGlobal('window', { kq: { ctx: { perf, renderer, scene, camera, people }, step, screenshotReady } });
  return { renderer, group, camera, shadow, passes, step, screenshotReady };
}

describe('e2e tour-group render work', () => {
  it('waits for the group and compares each pass at the same tick and pose as the scenery changes', async () => {
    let finishLoad!: (ready: boolean) => void;
    const secondReady = new Promise<boolean>((resolve) => { finishLoad = resolve; });
    const { renderer, group, camera, shadow, passes, step, screenshotReady } = renderFixture(secondReady);
    const { render, renderBufferDirect } = renderer;
    const sample = sampleRenderWork({ groupIds: ['guide', 'visitor'], frames: 2, ticksPerFrame: 15 });
    await Promise.resolve();
    expect(step).not.toHaveBeenCalled();
    expect(screenshotReady).not.toHaveBeenCalled();
    finishLoad(true);

    await expect(sample).resolves.toEqual({
      frames: 2,
      loaded: 2,
      missing: [],
      empty: { calls: 3, triangles: 2007 },
      populated: { calls: 7, triangles: 2087 },
      added: { calls: 4, triangles: 100 },
    });
    expect(screenshotReady).toHaveBeenCalledOnce();
    expect(step.mock.calls).toEqual([[15, { draw: true }], [15, { draw: true }]]);
    expect(passes).toEqual([15, 30].flatMap((tick) => [shadow, camera].flatMap((passCamera) => [false, true].map((visible) => ({
      tick, camera: passCamera, x: passCamera === camera ? tick : 0, bodies: [visible, visible],
    })))));
    expect(renderer.render).toBe(render);
    expect(renderer.renderBufferDirect).toBe(renderBufferDirect);
    expect(group.every((person) => person.root.visible)).toBe(true);
  });

  it('reports loaded bodies that contribute only to shadows or are entirely hidden', async () => {
    const { group } = renderFixture();
    const visitor = group[1]!;
    visitor.body.layers.set(1);
    const options = { groupIds: ['guide', 'visitor'], frames: 1, ticksPerFrame: 15 };
    await expect(sampleRenderWork(options)).resolves.toMatchObject({ loaded: 2, missing: ['visitor'], added: { calls: 3, triangles: 70 } });

    visitor.root.visible = false;
    await expect(sampleRenderWork(options)).resolves.toMatchObject({ loaded: 2, missing: ['visitor'], added: { calls: 2, triangles: 20 } });
    expect(visitor.root.visible).toBe(false);
  });
});
