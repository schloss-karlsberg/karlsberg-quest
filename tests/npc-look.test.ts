/**
 * How placed NPCs are drawn (TASK-092): people are solid, a ghost is a look a placement asks for.
 * The fade maths and the look rule are pure; the bodies are built from the real CC0 models in node
 * (no GPU) and their materials inspected.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Color, type Material, type Mesh, MeshStandardMaterial, type Object3D, type Points } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { describe, expect, it } from 'vitest';
import type { LoadedModel } from '../src/assets/loader';
import { type CharacterModel, costumeFor, modelFor } from '../src/systems/characters/catalog';
import { GhostFigure } from '../src/systems/npc/figure';
import { SOLID_FADE_S, drawnAt, fadeToward, figureLook, kneels, loadedPlacement } from '../src/systems/npc/look';
import { RiggedNpc } from '../src/systems/npc/rigged';
import { ROSTER, lookFor } from '../src/systems/npc/roster';
import { SolidFigure } from '../src/systems/npc/solid';
import { MARLENE_STANDIN } from '../src/systems/party/placements';
import { resolveSpec } from '../src/systems/people/specs';
import { PEOPLE_LOD } from '../src/systems/people/types';
import { validateStories } from '../src/systems/story/validate';

const DT = 1 / 60;
const FILES: Record<CharacterModel, string> = {
  'characters.human.adventurer': 'human_adventurer.glb',
  'characters.human.farmer': 'human_farmer.glb',
  'characters.human.woman': 'human_woman.glb',
  'characters.creature.wolf': 'wolf.glb',
  'characters.creature.horse': 'horse.glb',
};
const models = new Map<string, Promise<LoadedModel>>();
function loadModel(id: CharacterModel): Promise<LoadedModel> {
  let p = models.get(id);
  if (!p) {
    p = (async () => {
      await MeshoptDecoder.ready;
      const buf = readFileSync(resolve(import.meta.dirname, '../public/assets/models/characters', FILES[id]));
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const g = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
      return { scene: g.scene, animations: g.animations };
    })();
    models.set(id, p);
  }
  return p;
}

/** Every mesh / point cloud that would be drawn under `root` (itself and all its parents visible). */
function drawn(root: Object3D): (Mesh | Points)[] {
  const out: (Mesh | Points)[] = [];
  const walk = (o: Object3D) => {
    if (!o.visible) return;
    if ((o as Mesh).isMesh || (o as Points).isPoints) out.push(o as Mesh);
    for (const c of o.children) walk(c);
  };
  walk(root);
  return out;
}
const mat = (m: Mesh | Points) => (Array.isArray(m.material) ? m.material[0]! : m.material) as Material;
const frame = { reducedMotion: false, px: 600, face: 0, lookAt: null, dist: 4 };

describe('npc look: the rule', () => {
  it('a placement is solid unless it asks for a ghost', () => {
    expect(figureLook({})).toBe('solid');
    expect(figureLook({ look: 'solid' })).toBe('solid');
    expect(figureLook({ look: 'ghost' })).toBe('ghost');
  });

  it('only a ghost kneels', () => {
    expect(kneels({ pose: 'kneel', look: 'ghost' })).toBe(true);
    expect(kneels({ pose: 'kneel' })).toBe(false);
    expect(kneels({ look: 'ghost' })).toBe(false);
  });

  it('a kneeling placement from an older save stays the ghost it was', () => {
    const old: { npc: string; pose?: string; look?: 'ghost' | 'solid' } = { npc: 'pikeur', pose: 'kneel' };
    expect(kneels(loadedPlacement(old))).toBe(true);
    expect(old.look).toBe('ghost');
    expect(loadedPlacement({ npc: 'hanne' } as { npc: string; look?: 'ghost' | 'solid' }).look).toBeUndefined();
    expect(loadedPlacement({ npc: 'x', pose: 'kneel', look: 'solid' as const }).look).toBe('solid');
  });

  it('the fade is linear, ends at exactly its target and holds without game time', () => {
    let a = 0;
    const n = Math.ceil(SOLID_FADE_S / DT);
    for (let i = 0; i < n - 1; i++) a = fadeToward(a, 1, DT);
    expect(a).toBeGreaterThan(0.9);
    expect(a).toBeLessThan(1);
    a = fadeToward(a, 1, DT);
    expect(a).toBe(1);
    for (let i = 0; i < 600; i++) a = fadeToward(a, 1, DT);
    expect(a).toBe(1);
    // paused / bullet time and a bad dt: no step
    expect(fadeToward(0.4, 1, 0)).toBe(0.4);
    expect(fadeToward(0.4, 1, Number.NaN)).toBe(0.4);
    expect(fadeToward(Number.NaN, 1, DT)).toBe(1);
    // one long frame does not overshoot; out again ends at exactly 0
    expect(fadeToward(0, 1, 5)).toBe(1);
    for (let i = 0; i < n; i++) a = fadeToward(a, 0, DT);
    expect(a).toBe(0);
  });

  it('a solid body is drawn within the people draw limit, with a return margin', () => {
    expect(drawnAt(10, true)).toBe(true);
    expect(drawnAt(PEOPLE_LOD.drawLimit + 1, true)).toBe(false);
    expect(drawnAt(PEOPLE_LOD.drawLimit - 1, false)).toBe(false);
    expect(drawnAt(PEOPLE_LOD.drawLimit - PEOPLE_LOD.drawReturnMargin - 1, false)).toBe(true);
    expect(drawnAt(Number.NaN, false)).toBe(true);
  });
});

describe('npc look: a solid person on the real models', () => {
  async function solid(id: string) {
    const look = lookFor(id);
    const fig = new SolidFigure(look);
    fig.setRigged(new RiggedNpc(look, await loadModel(modelFor(look)), fig.tint, 'solid'));
    return fig;
  }

  it('nothing is drawn before the body is in, and the fade waits', () => {
    const fig = new SolidFigure(lookFor('hofgaertner'));
    for (let i = 0; i < 60; i++) fig.frame(DT, frame);
    expect(fig.alpha).toBe(0);
    expect(fig.object.visible).toBe(false);
    expect(drawn(fig.object)).toEqual([]);
    fig.dispose();
  });

  it('the Hofgärtner dithers in and is then fully opaque: no blending, depth written, no mist or motes', async () => {
    const fig = await solid('hofgaertner');
    fig.frame(DT, frame);
    expect(fig.alpha).toBeGreaterThan(0);
    expect(fig.alpha).toBeLessThan(1);
    for (let i = 0; i < 60; i++) fig.frame(DT, frame);
    expect(fig.alpha).toBe(1);
    expect(fig.opacity).toBe(1);
    const parts = drawn(fig.object);
    expect(parts.length).toBeGreaterThan(3);
    for (const p of parts) {
      const m = mat(p);
      expect((p as Points).isPoints, p.name).not.toBe(true);
      expect(m, p.name).toBeInstanceOf(MeshStandardMaterial);
      expect(m.transparent, p.name).toBe(false);
      expect(m.depthWrite, p.name).toBe(true);
      expect(m.opacity, p.name).toBe(1);
      expect(p.castShadow, p.name).toBe(true);
    }
    // it stays that way: ten more seconds, and frames without game time
    for (let i = 0; i < 600; i++) fig.frame(DT, frame);
    for (let i = 0; i < 60; i++) fig.frame(0, frame);
    expect(fig.opacity).toBe(1);
    fig.dispose();
  });

  it('leaving (another era, despawn) dithers out to nothing', async () => {
    const fig = await solid('hofgaertner');
    for (let i = 0; i < 60; i++) fig.frame(DT, frame);
    fig.target = 0;
    fig.frame(DT, frame);
    expect(fig.opacity).toBeLessThan(1);
    for (let i = 0; i < 60; i++) fig.frame(DT, frame);
    expect(fig.alpha).toBe(0);
    expect(fig.object.visible).toBe(false);
    fig.dispose();
  });

  it('far from the camera the body is not drawn; it is opaque again when the player comes back', async () => {
    const fig = await solid('liese');
    for (let i = 0; i < 60; i++) fig.frame(DT, frame);
    fig.frame(DT, { ...frame, dist: PEOPLE_LOD.drawLimit + 5 });
    expect(fig.object.visible).toBe(false);
    fig.frame(DT, { ...frame, dist: 20 });
    expect(fig.object.visible).toBe(true);
    expect(fig.opacity).toBe(1);
    fig.dispose();
  });

  it('every roster figure builds a solid body: hats, props and the pike included', async () => {
    for (const id of Object.keys(ROSTER)) {
      const fig = await solid(id);
      for (let i = 0; i < 30; i++) fig.frame(DT, frame);
      const parts = drawn(fig.object);
      expect(parts.length, id).toBeGreaterThan(3);
      for (const p of parts) {
        expect(mat(p), `${id} ${p.name}`).toBeInstanceOf(MeshStandardMaterial);
        expect(mat(p).transparent, `${id} ${p.name}`).toBe(false);
        expect(mat(p).opacity, `${id} ${p.name}`).toBe(1);
      }
      fig.dispose();
    }
  });

  it('a model that fails to load leaves a capsule that fades in like a body', () => {
    const fig = new SolidFigure(lookFor('soll'));
    fig.fail();
    for (let i = 0; i < 30; i++) fig.frame(DT, frame);
    expect(fig.object.visible).toBe(true);
    expect(fig.opacity).toBe(1);
    expect(drawn(fig.object).map((m) => m.name)).toEqual(['npc-fallback']);
    fig.dispose();
  });
});

describe('npc look: the ghost is still there when asked for', () => {
  it('the ghost figure and its rigged body blend (the deliberate effect)', async () => {
    const look = lookFor('pikeur', 'warm');
    const fig = new GhostFigure(look, 'today');
    fig.setRigged(new RiggedNpc(look, await loadModel(modelFor(look)), new Color(1, 1, 1), 'ghost'));
    for (let i = 0; i < 240; i++) fig.frame(DT, frame);
    const parts = drawn(fig.object);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.every((p) => mat(p).transparent)).toBe(true);
    fig.dispose();
  });
});

describe('npc look: Marlene today', () => {
  it('has a roster figure with the body and colours of her party stand-in', () => {
    expect(ROSTER.marlene).toBeDefined();
    const spec = resolveSpec(MARLENE_STANDIN.spec).spec;
    expect(modelFor(ROSTER.marlene!)).toBe(spec.model);
    const costume = costumeFor(ROSTER.marlene!);
    for (const [slot, hex] of Object.entries(spec.palette)) expect(costume[slot], slot).toBe(hex);
  });
});

describe('npc look: the story', () => {
  const dir = resolve(import.meta.dirname, '../content/story');
  interface Spawn {
    do?: string;
    op?: string;
    npc?: string;
    look?: string;
    pose?: string;
  }
  function spawns(o: unknown, out: Spawn[] = []): Spawn[] {
    if (Array.isArray(o)) for (const x of o) spawns(x, out);
    else if (o && typeof o === 'object') {
      const a = o as Spawn;
      if (a.do === 'npc' && a.op === 'spawn') out.push(a);
      for (const v of Object.values(o)) spawns(v, out);
    }
    return out;
  }

  it('places every person solid; the one ghost is the old Pikeur at the kennel today', () => {
    const ghosts: string[] = [];
    let n = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.story.json') && !x.startsWith('99-'))) {
      for (const s of spawns(JSON.parse(readFileSync(resolve(dir, f), 'utf8')))) {
        n++;
        if (figureLook(s as { look?: 'ghost' | 'solid' }) === 'ghost') ghosts.push(`${f}:${s.npc}`);
        if (s.pose === 'kneel') expect(s.look, `${f}:${s.npc}`).toBe('ghost');
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(ghosts).toEqual(['04-kapitel-4.story.json:pikeur']);
  });

  it('the validator rejects an unknown look and a kneeling solid person', () => {
    const file = (extra: Record<string, unknown>) => ({
      file: 'l.story.json',
      story: { chapter: 'kl', order: 1, title_de: 'L', start: 'b', beats: [{ id: 'b', enter: [{ do: 'npc', op: 'spawn', npc: 'jost', x: 1, z: 2, era: '1789', ...extra }] }] },
    });
    const errs = (extra: Record<string, unknown>) => validateStories([file(extra)] as never).errors.filter((i) => /look/.test(i.message));
    expect(errs({})).toEqual([]);
    expect(errs({ look: 'ghost', pose: 'kneel' })).toEqual([]);
    expect(errs({ look: 'solid' })).toEqual([]);
    expect(errs({ look: 'mist' }).length).toBe(1);
    expect(errs({ pose: 'kneel' }).length).toBe(1);
    expect(errs({ pose: 'kneel', look: 'solid' }).length).toBe(1);
  });
});
