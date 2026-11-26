import { BoxGeometry, Color, Group, InstancedBufferGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, ShaderMaterial, Vector3, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GROUND } from '../src/data/types';
import { clearings } from '../src/systems/quelle/layout';
import { Heightfield } from '../src/world/heightfield';
import { findWaterBodies, shoreDistance } from '../src/world/water';
import { GroundCover, type GroundCoverSource } from '../src/world/vegetation/groundcover';
import { COVER_LOOKS, flowerChance, grassChance, hash2, reedChance, valueNoise } from '../src/world/vegetation/scatter';
import { GROUND_LAYERS, GROUND_TILE_M, BARK_LAYERS } from '../src/world/vegetation/strips';
import { PROP_KINDS } from '../src/world/vegetation/props';
import NATURE1 from '../src/assets/manifests/nature';
import NATURE2 from '../src/assets/manifests/nature2';
import { FAMILY_CROWN, ModelTrees, TREE_BAND, TREE_N0, TREE_N1, TREE_SHADOW_CULL_GLSL, TREE_VARIANTS, castCount, pickVariant, shadowLevel, treeLevels, treeScaleY, treeShadowFootprintDistance } from '../src/world/vegetation/trees';
import { atmosphere } from '../src/world/atmosphere';

const NATURE_ASSETS = [...NATURE1, ...NATURE2];

/** 12 × 8 grid, 2 m cells: a 4 × 3 pond at 10 m and a 2 × 2 puddle at 12 m on 15 m land. */
function pondWorld() {
  const cols = 12;
  const rows = 8;
  const h = new Float32Array(cols * rows).fill(15);
  const g = new Uint8Array(cols * rows).fill(GROUND.meadow);
  const set = (c: number, r: number, height: number) => {
    h[r * cols + c] = height;
    g[r * cols + c] = GROUND.water;
  };
  for (let r = 2; r < 5; r++) for (let c = 1; c < 5; c++) set(c, r, 10 + 0.05 * c);
  for (let r = 5; r < 7; r++) for (let c = 8; c < 10; c++) set(c, r, 12);
  return { hf: new Heightfield({ cols, rows, cell: 2, x0: 0, z0: 0 }, h), g, cols, rows };
}

describe('water bodies', () => {
  it('finds the flat pond, drops the tiny puddle and labels the cells', () => {
    const { hf, g, cols } = pondWorld();
    const { bodies, label } = findWaterBodies(g, hf, { minCells: 6 });
    expect(bodies).toHaveLength(1);
    const b = bodies[0]!;
    expect(b.cells).toBe(12);
    expect(b.level).toBeGreaterThanOrEqual(10);
    expect(b.level).toBeLessThan(10.3);
    expect([b.x0, b.z0, b.x1, b.z1]).toEqual([2, 4, 8, 8]);
    expect(label[3 * cols + 2]).toBe(0);
    expect(label[5 * cols + 8]).toBe(-1); // puddle below minCells
    expect(label[0]).toBe(-1);
  });

  it('splits a cascade into one body per level', () => {
    const cols = 10;
    const rows = 4;
    const h = new Float32Array(cols * rows).fill(20);
    const g = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        g[r * cols + c] = GROUND.water;
        h[r * cols + c] = c < 5 ? 10 : 11; // two terraces 1 m apart
      }
    const { bodies } = findWaterBodies(g, new Heightfield({ cols, rows, cell: 1, x0: 0, z0: 0 }, h), { minCells: 4 });
    expect(bodies.map((b) => b.level)).toEqual([10, 11]);
  });

  it('signed shore distance: positive inside, negative outside, zero-crossing at the edge', () => {
    const { hf, g, cols, rows } = pondWorld();
    const { label } = findWaterBodies(g, hf, { minCells: 6 });
    const box = { c0: 0, r0: 0, c1: cols - 1, r1: rows - 1 };
    const d = shoreDistance(label, cols, rows, 2, 0, box, 12);
    const at = (c: number, r: number) => d[r * cols + c]!;
    expect(at(2, 3)).toBeGreaterThan(0);
    expect(at(0, 0)).toBeLessThan(0);
    expect(at(2, 3)).toBeGreaterThanOrEqual(at(1, 3)); // deeper inside than at the edge
    expect(at(11, 7)).toBeLessThan(at(6, 3)); // further out is more negative
    for (const v of d) expect(Math.abs(v)).toBeLessThanOrEqual(12);
  });
});

describe('nature scatter', () => {
  const today = COVER_LOOKS.today!;
  it('is deterministic and in range', () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(4, 3, 5));
    for (let i = 0; i < 200; i++) {
      const v = hash2(i, -i * 7, 11);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = valueNoise(i * 0.37, i * 0.11, 3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('grass grows on open meadow, not in water, on bare paths or on cliffs', () => {
    const meadow = { forest: 0, water: 0, bare: 0, lawn: 0 };
    expect(grassChance(meadow, 5, 0.6, today)).toBeGreaterThan(0.5);
    expect(grassChance({ ...meadow, water: 0.5 }, 5, 0.6, today)).toBe(0);
    expect(grassChance({ ...meadow, bare: 0.8 }, 5, 0.6, today)).toBe(0);
    expect(grassChance(meadow, 50, 0.6, today)).toBe(0);
    expect(grassChance({ ...meadow, forest: 1 }, 5, 0.6, today)).toBeLessThan(grassChance(meadow, 5, 0.6, today));
    // February 1793: a few dry stalks out of the snow
    expect(grassChance(meadow, 5, 0.6, COVER_LOOKS['1793-02']!)).toBeLessThan(0.3);
  });

  it('reeds stand in the shore band only; flowers only on meadows (none in the snow)', () => {
    expect(reedChance({ forest: 0, water: 0, bare: 0, lawn: 0 }, today)).toBe(0);
    expect(reedChance({ forest: 0, water: 0.3, bare: 0, lawn: 0 }, today)).toBeGreaterThan(0.5);
    expect(reedChance({ forest: 0, water: 1, bare: 0, lawn: 0 }, today)).toBe(0);
    expect(flowerChance({ forest: 0, water: 0, bare: 0, lawn: 0 }, COVER_LOOKS['1789']!)).toBeGreaterThan(0);
    expect(flowerChance({ forest: 0.8, water: 0, bare: 0, lawn: 0 }, COVER_LOOKS['1789']!)).toBe(0);
    expect(flowerChance({ forest: 0, water: 0, bare: 0, lawn: 0 }, COVER_LOOKS['1793-02']!)).toBe(0);
  });

  it('props keep off water and paths', () => {
    const look = today;
    for (const k of PROP_KINDS) {
      expect(k.chance({ forest: 1, water: 0.5, bare: 0, lawn: 0 }, 5, 1, look, 1)).toBe(0);
      expect(k.chance({ forest: 1, water: 0, bare: 0.9, lawn: 0 }, 5, 1, look, 1)).toBe(0);
    }
    const fern = PROP_KINDS.find((k) => k.id === 'fern')!;
    expect(fern.chance({ forest: 1, water: 0, bare: 0, lawn: 0 }, 5, 1, look, 1)).toBeGreaterThan(0);
    expect(fern.chance({ forest: 0, water: 0, bare: 0, lawn: 0 }, 5, 1, look, 1)).toBe(0);
  });
});

function coverCamera(x = 0, z = 0): PerspectiveCamera {
  const camera = new PerspectiveCamera(80, 667 / 375, 0.2, 200);
  camera.position.set(x, 19, z);
  camera.lookAt(x, 15, z);
  return camera;
}

function coverMeshes(cover: GroundCover) {
  return cover.object.children.filter((child): child is Mesh<InstancedBufferGeometry> =>
    child instanceof Mesh && child.geometry instanceof InstancedBufferGeometry);
}

function coverInstances(cover: GroundCover) {
  return coverMeshes(cover).flatMap(({ geometry, name }) => {
    const transform = geometry.getAttribute('aInst');
    return Array.from({ length: geometry.instanceCount }, (_, i) => ({
      name, x: transform.getX(i), y: transform.getY(i), z: transform.getZ(i), scale: transform.getW(i),
    }));
  });
}

const meadowCover: GroundCoverSource = {
  height: () => 15,
  inside: () => true,
  cover: (_x, _z, out) => out.fill(0),
};

describe('Niedrig ground cover', () => {
  it('places seeded plants on the verge and shore and leaves the tread and open water clear', () => {
    const cover = new GroundCover({
      ...meadowCover,
      cover: (x, z, out) => {
        out.fill(0);
        out[1] = x < -8 ? 1 : x < -5 ? 0.3 : 0;
        out[2] = Math.abs(z) < 1.5 ? 0.35 : 0;
      },
    });
    const camera = coverCamera();
    cover.update(camera);
    const first = coverInstances(cover);
    expect(cover.stats.grassFar).toBeGreaterThan(0);
    expect(cover.stats.flowers).toBeGreaterThan(0);
    expect(cover.stats.reeds).toBeGreaterThan(0);
    for (const { name, x, z } of first) {
      expect(Math.abs(z)).toBeGreaterThanOrEqual(1.5);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(14);
      if (name === 'nature-reeds') {
        expect(x).toBeGreaterThanOrEqual(-8);
        expect(x).toBeLessThan(-5);
      } else expect(x).toBeGreaterThanOrEqual(-5);
    }
    camera.position.x += 80;
    cover.update(camera);
    expect(cover.stats.reeds).toBe(0);
    expect(coverInstances(cover).every(({ x }) => x >= 66)).toBe(true);
    camera.position.x -= 80;
    cover.update(camera);
    expect(coverInstances(cover)).toEqual(first);
  });

  it('honours the spring clearings in today, including a clearing added after tile generation', () => {
    const circles = clearings();
    const inside = (x: number, z: number) => circles.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);
    const [x, z] = circles[0]!;
    const cover = new GroundCover(meadowCover);
    const camera = coverCamera(x, z);
    cover.update(camera);
    expect(coverInstances(cover).some((p) => inside(p.x, p.z))).toBe(true);
    for (const [cx, cz, r] of circles) cover.addClearing(cx, cz, r, 0, ['today']);
    cover.update(camera);
    expect(cover.stats.grass).toBeGreaterThan(0);
    expect(coverInstances(cover).some((p) => inside(p.x, p.z))).toBe(false);
    cover.setLevel('high');
    cover.setEra('1789');
    cover.update(camera);
    expect(coverInstances(cover).some((p) => inside(p.x, p.z))).toBe(true);
  });

  it('caps the three meshes and clears instances on tier and era changes', () => {
    const cover = new GroundCover({
      ...meadowCover,
      cover: (x, _z, out) => {
        out.fill(0);
        out[1] = x < -11 ? 0.3 : 0;
      },
    });
    const camera = coverCamera();
    expect(coverInstances(cover)).toEqual([]);
    cover.update(camera);
    const first = coverInstances(cover);
    expect(cover.stats).toMatchObject({ grass: 128, grassFar: 128, reeds: 16, flowers: 8 });
    const drawn = coverMeshes(cover).filter((mesh) => mesh.visible);
    expect(drawn).toHaveLength(3);
    expect(drawn.reduce((sum, { geometry }) => sum + geometry.instanceCount * geometry.index!.count / 3, 0)).toBeLessThanOrEqual(12_000);
    expect(cover.material.alphaToCoverage).toBe(false);

    cover.setLevel('high');
    cover.update(camera);
    expect(cover.stats.grass - cover.stats.grassFar).toBeGreaterThan(0);
    expect(cover.material.alphaToCoverage).toBe(true);
    cover.setLevel('low');
    cover.update(camera);
    expect(coverInstances(cover)).toEqual(first);

    cover.setEra('1789');
    expect(coverInstances(cover)).toEqual([]);
    cover.update(camera);
    expect(cover.object.visible).toBe(false);
    expect(cover.stats).toEqual({ grass: 0, grassFar: 0, flowers: 0, reeds: 0, tiles: 0 });
    cover.setEra('today');
    cover.update(camera);
    expect(cover.object.visible).toBe(true);
    expect(coverInstances(cover)).toEqual(first);
  });
});

describe('nature assets', () => {
  it('texture strips match their layer tables', () => {
    expect(GROUND_LAYERS).toHaveLength(8);
    expect(GROUND_TILE_M).toHaveLength(GROUND_LAYERS.length);
    expect(BARK_LAYERS).toHaveLength(3);
  });

  it('every prop names a manifest model with a licence, none loads on the low tier by era prefetch', () => {
    for (const k of PROP_KINDS) {
      const e = NATURE_ASSETS.find((a) => a.id === k.asset);
      expect(e, k.asset).toBeTruthy();
      expect(e!.kind).toBe('model');
      expect(e!.licence).toMatch(/^(polyhaven|quaternius)\./);
      // the stump from the art foundation is also a scenery prop of 'today' / '1796'
      if (k.asset !== 'nature.stump.01') expect(e!.eras ?? []).toEqual([]);
    }
  });
});

describe('model trees (nature round 2)', () => {
  it('every variant exists in the set and families pick sensibly', () => {
    expect(TREE_VARIANTS.length).toBe(16);
    // spruce stands get pines, winter broadleaf goes bare, snags are dead in every season
    const fam = (k: number, v: number, snag: number, winter: boolean) => TREE_VARIANTS[pickVariant(k, v, snag, winter, 0.05)]!.family;
    expect(fam(1, 0.3, 0.9, false)).toBe(1);
    expect(fam(0, 0.3, 0.9, true)).toBe(3);
    expect(fam(0, 0.3, 0.01, false)).toBe(3);
  });

  it('LOD levels cross-fade in a band and stay complementary', () => {
    const out: number[] = [];
    treeLevels(10, 1, out);
    expect(out[0]).toBe(0);
    out.length = 0;
    treeLevels(400, 1, out);
    expect(out[0]).toBe(2);
    // inside the lod0/lod1 band both levels are drawn with complementary dither ranges
    out.length = 0;
    treeLevels(30, 1, out);
    expect(out.length).toBe(6);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(1);
    // the nearer level keeps [t, 2), the farther [0, t): every pixel is drawn by exactly one
    expect(out[1]).toBeCloseTo(out[5]!, 6);
  });

  it('switches lod1 → impostor at 72·k (tri budget phase B, was 78·k)', () => {
    expect([TREE_N0, TREE_N1, TREE_BAND]).toEqual([30, 72, 5]);
    const out: number[] = [];
    // k = 1: lod1 alone up to 67 m, the band 67–77 m, impostors beyond
    treeLevels(66, 1, out);
    expect(out).toEqual([1, 0, 2]);
    treeLevels(72, 1, out);
    expect(out.length).toBe(6);
    expect(out[0]).toBe(1);
    expect(out[3]).toBe(2);
    expect(out[1]).toBeCloseTo(0.5, 6);
    treeLevels(78, 1, out);
    expect(out).toEqual([2, 0, 2]);
    // tall trees (k up to 1.4 on high) keep lod1 further out; the old ring stays reachable
    treeLevels(95, 1.4, out);
    expect(out[0]).toBe(1);
    treeLevels(78, 1, out, 78);
    expect(out[0]).toBe(1);
  });

  it('shadow casters: lod0 casts as lod1 and sorted footprint distances can be clipped', () => {
    expect(shadowLevel(0)).toBe(1);
    expect(shadowLevel(1)).toBe(1);
    expect(shadowLevel(2)).toBe(2);
    const d = new Float32Array([1, 5, 5, 9, 40, 120, 0]);
    expect(castCount(d, 6, 0.5)).toBe(0);
    expect(castCount(d, 6, 5)).toBe(3);
    expect(castCount(d, 6, 105)).toBe(5);
    expect(castCount(d, 6, 1e9)).toBe(6);
    expect(castCount(d, 0, 1e9)).toBe(0);
  });

  it('keeps a 26 m tree at low sun while culling footprints laterally outside the map', () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 2, 1).translate(0, 1, 0);
    const bark = new MeshBasicMaterial();
    for (const { name } of TREE_VARIANTS) {
      for (const id of [name, `${name}_lod1`]) {
        const mesh = new Mesh(geometry, bark);
        mesh.name = id;
        root.add(mesh);
      }
    }
    const renderer = {
      getRenderTarget: () => null, setRenderTarget: vi.fn(),
      getClearAlpha: () => 1, getClearColor: () => new Color(),
      setClearColor: vi.fn(), clear: vi.fn(), render: vi.fn(),
    } as unknown as WebGLRenderer;
    const trees = new ModelTrees(root, renderer, 8, atmosphere);
    const sun = atmosphere.uSunDir.value;
    const savedSun = sun.clone();
    try {
      const elevation = 13 * Math.PI / 180;
      sun.set(Math.cos(elevation), Math.sin(elevation), 0);
      const focus = new Vector3(21, 2, 0);
      const tree = new Vector3(115, 0, 0);
      const right = new Vector3(0, 0, -1);
      const up = new Vector3(-sun.y, sun.x, 0);
      const offset = tree.clone().sub(focus);
      expect(offset.x).toBeGreaterThan(60 * 0.98 + 30); // old per-instance cutoff
      expect(tree.x - 26 / Math.tan(elevation)).toBeCloseTo(2.4, 0);
      const footprint = treeShadowFootprintDistance(offset, 26, right, up, 0);
      expect(footprint).toBe(0); // the segment crosses the focus in light space
      expect(treeShadowFootprintDistance(offset.clone().setZ(100), 26, right, up, 0)).toBe(100);

      trees.begin(focus, 60);
      trees.push(tree.x, tree.y, 0, 26, 0, 0, 0, 115, 1.8); // LOD1
      trees.push(tree.x, tree.y, 2, 26, 0, 0, 0, 115, 1); // impostor
      trees.push(tree.x, tree.y, 100, 26, 0, 0, 0, 152, 1); // outside
      trees.end();
      trees.shadowPass(true, focus, 60);
      expect(trees.stats).toMatchObject({ shadowLod: 1, shadowImp: 1 });
      const casters = trees.object.children.filter((o) => o.visible) as Mesh<InstancedBufferGeometry, ShaderMaterial>[];
      expect(casters.map((o) => o.name)).toEqual(['trees-common1-shadow', 'trees-impostor-shadow']);
      for (const { material } of casters) {
        expect(material.vertexShader).toContain(TREE_SHADOW_CULL_GLSL);
        expect(material.vertexShader).toContain('kqTreeOutsideShadow(aInst,');
      }
      const turnedFocus = new Vector3(0, 2, -8);
      expect(trees.shadowListsStale(turnedFocus)).toBe(false);
      trees.shadowPass(false, focus, 60);
      trees.shadowPass(true, turnedFocus, 60);
      expect(trees.stats).toMatchObject({ shadowLod: 1, shadowImp: 1 });
      expect(trees.shadowListsStale(new Vector3(-10, 2, 0))).toBe(true);
      sun.copy(savedSun);
      expect(trees.shadowListsStale(focus)).toBe(true);
    } finally {
      sun.copy(savedSun);
      trees.dispose();
      geometry.dispose();
      bark.dispose();
    }
  });

  it('the stand height maps the crown base and keeps the crown size', () => {
    const [k, max] = FAMILY_CROWN[0]!;
    const h = 28;
    const C = Math.min(h * k, max);
    expect(treeScaleY(0, 0.35, h, k, max)).toBeCloseTo(0, 6);
    expect(treeScaleY(1, 0.35, h, k, max)).toBeCloseTo(h, 4);
    // the crown above the base keeps its proportion (C per unit)
    expect(treeScaleY(0.9, 0.35, h, k, max) - treeScaleY(0.5, 0.35, h, k, max)).toBeCloseTo(0.4 * C, 4);
  });
});
