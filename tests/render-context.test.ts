import {
  BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator,
  Scene, type Texture, Vector2, Vector3, WebGLCubeRenderTarget, type WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetLoader } from '../src/assets/loader';
import { GROUND } from '../src/data/types';
import { PerfMonitor } from '../src/render/perf';
import { bindRenderContext, renderWorldMaps } from '../src/render/context';
import { ShadowReuse, SunShadows } from '../src/render/shadows';
import { EnvLight, kqStandard } from '../src/render/standard';
import type { Forest } from '../src/world/forest';
import { Heightfield } from '../src/world/heightfield';
import { Sky } from '../src/world/sky';
import type { Terrain } from '../src/world/terrain';
import { Nature } from '../src/world/vegetation/nature';
import { TREE_VARIANTS } from '../src/world/vegetation/trees';
import { ReflectionSchedule, Water } from '../src/world/water';

class TimerGL {
  getExtension = vi.fn(() => ({ TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }));
  createQuery = () => ({});
  beginQuery = vi.fn();
  endQuery = vi.fn();
  getQueryParameter = vi.fn(() => false);
}

function context(
  shadows = new ShadowReuse(), reflections = new ReflectionSchedule(),
  nature: { invalidateTrees(): void } = { invalidateTrees: vi.fn() },
) {
  vi.stubGlobal('WebGL2RenderingContext', TimerGL);
  const gl = new TimerGL();
  const canvas = new EventTarget();
  let target: WebGLRenderTarget | null = null;
  let clearColor = new Color(0x123456);
  let clearAlpha = 1;
  const renderer = {
    domElement: canvas,
    info: { reset: vi.fn(), render: { calls: 0, triangles: 0 } },
    getContext: () => gl,
    getRenderTarget: () => target,
    setRenderTarget: (next: WebGLRenderTarget | null) => { target = next; },
    getClearColor: (out: Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (color: Color | number, alpha: number) => { clearColor = new Color(color); clearAlpha = alpha; },
    getDrawingBufferSize: (out: Vector2) => out.set(200, 150),
    clear: vi.fn(), render: vi.fn(),
  } as unknown as WebGLRenderer;
  const perf = new PerfMonitor(renderer);
  const env = new EnvLight(new Mesh());
  const redraw = vi.fn();
  bindRenderContext(canvas, { env, shadows, reflections, nature, perf, redraw });
  const lose = () => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  const restore = () => canvas.dispatchEvent(new Event('webglcontextrestored'));
  return { renderer, env, shadows, reflections, perf, gl, redraw, lose, restore };
}

afterEach(() => {
  EnvLight.texture = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mapFixture() {
  const scene = new Scene();
  const grid = { cols: 9, rows: 9, x0: -8, z0: -8, cell: 2 };
  const ground = new Uint8Array(81).fill(GROUND.meadow);
  for (let z = 2; z <= 6; z++) ground.fill(GROUND.water, z * 9 + 2, z * 9 + 7);
  const hf = new Heightfield(grid, new Float32Array(81));
  const sky = new Sky();
  const water = new Water(ground, grid, { '2025': hf, '1789': hf }, sky);
  water.setLevel('high');
  const shadows = new SunShadows();
  shadows.configure(256, 75, 9);
  shadows.every = 2;
  let nature: Nature | null = null;
  const ctx = context(shadows.reuse, water.schedule, { invalidateTrees: () => nature?.invalidateTrees() });
  const root = new Group();
  const trunk = new BoxGeometry(0.25, 2, 0.25).translate(0, 1, 0);
  const bark = new MeshStandardMaterial();
  for (const { name } of TREE_VARIANTS) {
    for (const nodeName of [name, `${name}_lod1`]) {
      const node = new Mesh(trunk, bark);
      node.name = nodeName;
      root.add(node);
    }
  }
  const setModels = vi.fn();
  const terrain = { setGroundSet: vi.fn() } as unknown as Terrain;
  const forest = { sharedUniforms: {}, setModels, setBark: vi.fn() } as unknown as Forest;
  nature = new Nature(terrain, forest, scene, { height: () => 0, cover: () => {}, inside: () => true });
  const assets = {
    model: (id: string) => Promise.resolve({ scene: id === 'nature2.trees' ? root : new Group() }),
    texture: () => new Promise<Texture>(() => {}), // Keep the unrelated texture streams pending.
  } as unknown as AssetLoader;
  nature.attach(assets, ctx.renderer);
  nature.setLevel('high');
  await Promise.resolve();
  const trees = nature.modelTrees!;
  expect(trees).toBeDefined();
  scene.add(trees.object, water.object);
  const material = kqStandard(new MeshStandardMaterial());
  const object = new Mesh(trunk, material);
  object.position.set(0, 0, -2);
  scene.add(object);
  const camera = new PerspectiveCamera(50, 4 / 3, 0.1, 100);
  camera.position.set(0, 7, 16);
  camera.lookAt(0, 0, 0);
  const world = { nature, shadows, water, lookVersion: 7 };
  const focus = new Vector3();
  const frame = () => renderWorldMaps(ctx.renderer, scene, camera, world, ctx.env, focus, 1 / 60);
  const dispose = () => {
    trees.dispose();
    shadows.configure(0, 0, 0);
    water.dispose();
    sky.mesh.geometry.dispose();
    sky.material.dispose();
    trunk.dispose();
    bark.dispose();
    material.dispose();
  };
  return { ...ctx, nature, trees, water, sunShadows: shadows, material, setModels, frame, dispose };
}

describe('WebGL context restoration', () => {
  it('regenerates the same era’s sky for patched materials and redraws even a held view', () => {
    const { env, renderer, redraw, lose, restore } = context();
    const capture = vi.spyOn(PMREMGenerator.prototype, 'fromScene').mockImplementation(() => new WebGLCubeRenderTarget(1));
    const material = kqStandard(new MeshStandardMaterial());
    try {
      env.update(renderer, 7);
      const old = material.envMap;
      expect(old).not.toBeNull();
      env.update(renderer, 7);
      expect(capture).toHaveBeenCalledTimes(1);
      lose();
      restore();
      env.update(renderer, 7);
      expect(capture).toHaveBeenCalledTimes(2);
      expect(material.envMap).not.toBe(old);
      expect(material.envMap).toBe(EnvLight.texture);
      expect(redraw).toHaveBeenCalledTimes(1);
      env.update(renderer, 7);
      expect(capture).toHaveBeenCalledTimes(2);
      env.update(renderer, 8);
      expect(capture).toHaveBeenCalledTimes(3);
    } finally {
      material.dispose();
    }
  });

  it('draws fresh shadow and reflection maps for a stationary camera after restoration', () => {
    const { shadows, reflections, lose, restore } = context();
    const focus = new Vector3();
    const dir = new Vector3(0, 1, 0);
    shadows.every = 2;
    expect(shadows.reuse(focus, dir, 0.016, 0.1)).toBe(false);
    expect(reflections.due(true, focus, dir, 3)).toBe(true);
    lose();
    restore();
    expect.soft(shadows.reuse(focus, dir, 0.016, 0.1)).toBe(false);
    expect.soft(reflections.due(true, focus, dir, 3)).toBe(true);
    expect(shadows.every).toBe(2);
  });

  it.each(['high', 'low'] as const)('restores cached textures before the passes that use them (restore on %s)', async (level) => {
    const { renderer, nature, trees, water, sunShadows, material, setModels, frame, dispose, redraw, lose, restore } = await mapFixture();
    const atlas = trees.atlasTexture;
    const draws: string[] = [];
    const reflectedLighting: (Texture | null)[] = [];
    vi.spyOn(PMREMGenerator.prototype, 'fromScene').mockImplementation(() => {
      draws.push('sky');
      return new WebGLCubeRenderTarget(1);
    });
    vi.mocked(renderer.render).mockImplementation((_scene, camera) => {
      if (renderer.getRenderTarget()?.texture === atlas) draws.push('atlas');
      else if (camera === sunShadows.camera) draws.push('shadows');
      else {
        draws.push('reflection');
        reflectedLighting.push(material.envMap);
      }
    });
    try {
      frame();
      expect(draws).toContain('reflection');
      const oldSky = material.envMap;
      const passes = () => draws.splice(0);
      passes();
      if (level === 'low') {
        nature.setLevel('low');
        water.setLevel('low');
        sunShadows.configure(0, 0, 0);
      }
      lose();
      redraw.mockImplementationOnce(frame); // The one requested frame of a held view.
      restore();
      if (level === 'low') {
        expect(passes()).toEqual(['sky']);
        nature.setLevel('medium');
        water.setLevel('medium');
        sunShadows.configure(128, 55, 4);
        frame();
        expect(passes()).toEqual(['atlas', 'shadows']);
        expect(setModels).toHaveBeenLastCalledWith(trees);
      } else {
        expect(passes()).toEqual(['atlas', 'sky', 'shadows', 'reflection']);
        expect(reflectedLighting.at(-1)).toBe(material.envMap);
        expect(material.envMap).not.toBe(oldSky);
      }
      expect(trees.impMaterial.uniforms.uAtlasTex!.value).toBe(atlas);
      frame();
      expect(draws).not.toContain('atlas');
      expect(draws).not.toContain('sky');
    } finally {
      dispose();
    }
  });

  it('drops outstanding GPU timer queries and reacquires the extension only when enabled', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10);
    const { perf, gl, lose, restore } = context();
    perf.enableGpuTimer(true);
    perf.begin();
    perf.end();
    lose();
    perf.begin();
    perf.end();
    expect.soft(gl.beginQuery).toHaveBeenCalledTimes(1);
    restore();
    perf.begin();
    perf.end();
    expect.soft(gl.getExtension).toHaveBeenCalledTimes(2);
    expect.soft(gl.getQueryParameter).not.toHaveBeenCalled();
    perf.enableGpuTimer(false);
    lose();
    restore();
    expect(gl.getExtension).toHaveBeenCalledTimes(2);
  });

  it.todo('Decide whether to freeze gameplay and threat clocks while the WebGL context is lost.');
});
