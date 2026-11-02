/**
 * Scenery (set dressing): collider extensions (solids, pass zones, ruin keep), the sets leaving
 * the story's places free, the Tempelzimmer passage through KB-B07, the roof mask that keeps snow
 * out of the rooms, and the dawn look.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Footprint } from '../src/data/types';
import { roofQuads, underRoof } from '../src/systems/fx/ambient/ambient';
import { SetBuilder } from '../src/systems/scenery/builder';
import { PASSAGE, TEMPEL_DOOR, passageAt, passageCollision } from '../src/systems/scenery/passage';
import { GATE_CENTER, SETS } from '../src/systems/scenery/sets';
import { lookFor } from '../src/systems/story/index';
import { validateStories } from '../src/systems/story/validate';
import type { StoryFile } from '../src/systems/story/types';
import { FootprintCollider, type Ring } from '../src/world/collision';
import { RUIN_KEEP } from '../src/world/palace';

const footprints = (JSON.parse(readFileSync(new URL('../public/data/palace/footprints.json', import.meta.url), 'utf8')) as { buildings: Footprint[] }).buildings;
const rings = footprints.map((f) => f.ring as Ring);
const idx = (id: string) => footprints.findIndex((f) => f.id === id);
const story = (name: string) => JSON.parse(readFileSync(new URL(`../content/story/${name}`, import.meta.url), 'utf8')) as StoryFile;

describe('collider extensions', () => {
  const square: Ring = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('pushes out of circle and box solids, per owner', () => {
    const c = new FootprintCollider([]);
    c.setSolids('a', [{ kind: 'circle', x: 0, z: 0, r: 1 }]);
    const r = c.resolve(0.5, 0, 0.4);
    expect(r.hit).toBe(true);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1.4, 3);
    c.setSolids('b', [{ kind: 'box', x: 10, z: 0, ux: 1, uz: 0, hu: 2, hv: 0.2 }]);
    const b = c.resolve(10.5, 0.3, 0.4);
    expect(b.hit).toBe(true);
    expect(b.z).toBeCloseTo(0.6, 3);
    expect(c.solidAt(10, 0)).toBe(true);
    c.setSolids('a', []);
    expect(c.resolve(0.5, 0, 0.4).hit).toBe(false);
    // solids also hold while the footprints are off (the ruin)
    c.enabled = false;
    expect(c.resolve(10.5, 0.3, 0.4).hit).toBe(true);
  });

  it('a pass zone opens its footprint, keep holds one while the rest is off', () => {
    const c = new FootprintCollider([square]);
    expect(c.resolve(5, 0.2, 0.4).hit).toBe(true);
    c.setPassZones('gate', [{ poly: 0, x: 5, z: 0, r: 1.5 }]);
    expect(c.resolve(5, 0.2, 0.4).hit).toBe(false);
    expect(c.resolve(8, 0.2, 0.4).hit).toBe(true);
    c.setPassZones('gate', []);
    c.enabled = false;
    expect(c.resolve(5, 0.2, 0.4).hit).toBe(false);
    c.keep = new Set([0]);
    expect(c.resolve(5, 0.2, 0.4).hit).toBe(true);
  });

  it('the Baumagazin is among the footprints that stand in 1796', () => {
    expect(RUIN_KEEP).toContain('KB-B29');
    const c = new FootprintCollider(rings);
    c.enabled = false;
    c.keep = new Set(RUIN_KEEP.map(idx));
    // the middle of the Baumagazin: pushed out
    expect(c.resolve(511.5, -827, 0.4).hit).toBe(true);
    // the yard in front of it (Soll's place) stays free
    expect(c.resolve(496, -842, 0.4).hit).toBe(false);
  });
});

describe('sets', () => {
  const flat = () => 300;

  it('every set builds, has unique ids and stays clear of the places it must leave free', () => {
    const ids = new Set<string>();
    for (const def of SETS) {
      expect(ids.has(def.id)).toBe(false);
      ids.add(def.id);
      for (const era of def.eras) {
        const b = new SetBuilder(flat);
        def.build(b, { era, gateOpen: 0 });
        const built = b.build(def.id);
        expect(built.group.children.length).toBeGreaterThan(0);
        const c = new FootprintCollider([]);
        c.setSolids('set', built.solids);
        for (const [x, z, r] of def.keepFree ?? []) expect(c.solidAt(x, z, r), `${def.id} ${era} blocks ${x}/${z}`).toBe(false);
      }
    }
  });

  it('props stay out of the story spots of chapters 1, 2 and 4', () => {
    // NPCs, clues and the e2e walk at the fence
    const spots: [number, number, number][] = [
      [496, -842, 0.8], // Soll
      [494, -826, 0.8], // Peter
      [1287, -1228, 0.8], // Hanne k1
      [1262, -1218.5, 1], // clue.k1.zeichen
      [1177, -1571, 0.8], // Jost k1
      [1250, -1568, 0.8], // Jost k3
      [1674, -405.5, 0.6], // where one stands at the scrap of wool on the fence
      [1613, -402.2, 0.6], // the trail crossing the western fence
      [1560, -440, 0.6],
      [1532, -484, 0.6],
    ];
    const c = new FootprintCollider([]);
    const all = [];
    for (const def of SETS) {
      const b = new SetBuilder(flat);
      def.build(b, { era: def.eras[0]!, gateOpen: 0 });
      all.push(...b.build(def.id).solids);
    }
    c.setSolids('all', all);
    for (const [x, z, r] of spots) expect(c.solidAt(x, z, r), `${x}/${z}`).toBe(false);
  });

  it('the Ehrenhof gate is closed by default and opens with the option', () => {
    const def = SETS.find((s) => s.id === 'ehrenhof-gitter')!;
    const solidsAt = (open: number) => {
      const b = new SetBuilder(flat);
      def.build(b, { era: '1789', gateOpen: open });
      const c = new FootprintCollider([]);
      c.setSolids('g', b.build(def.id).solids);
      return c.solidAt(GATE_CENTER[0], GATE_CENTER[1], 0.3);
    };
    expect(solidsAt(0)).toBe(true);
    expect(solidsAt(1)).toBe(false);
  });
});

describe('Tempelzimmer passage', () => {
  it('starts at the glass doors and leads out of KB-B07 into the garden', () => {
    const b07 = footprints.find((f) => f.id === 'KB-B07')!.ring as Ring;
    const c = new FootprintCollider(rings);
    expect(c.footprintAt(...passageAt(3))).toBe(idx('KB-B07'));
    expect(c.footprintAt(...passageAt(PASSAGE.to + 1))).toBe(-1);
    expect(b07.length).toBe(4);
    expect(Math.hypot(TEMPEL_DOOR.nx, TEMPEL_DOOR.nz)).toBeCloseTo(1, 3);
  });

  it('can be walked through with the pass zones; without them KB-B07 is solid', () => {
    // from the Tempelzimmer (inside the gallery wing, which the interiors make passable) outwards
    // in small steps, slightly off the axis
    const gallery = { passable: new Set([idx('KB-B06')]), resolve: (x: number, z: number) => ({ x, z, hit: false }) };
    const walk = (c: FootprintCollider) => {
      c.overlay = gallery;
      let [x, z] = passageAt(-1.5, 0.3);
      for (let i = 0; i < 200; i++) {
        const r = c.resolve(x + TEMPEL_DOOR.nx * 0.08, z + TEMPEL_DOOR.nz * 0.08, 0.35);
        x = r.x;
        z = r.z;
      }
      return (x - TEMPEL_DOOR.x) * TEMPEL_DOOR.nx + (z - TEMPEL_DOOR.z) * TEMPEL_DOOR.nz;
    };
    const closed = new FootprintCollider(rings);
    expect(walk(closed)).toBeLessThan(1);
    const open = new FootprintCollider(rings);
    const { zones, solids } = passageCollision(idx('KB-B07'));
    open.setPassZones('p', zones);
    open.setSolids('p', solids);
    expect(walk(open)).toBeGreaterThan(PASSAGE.to + 1);
    // the side walls hold: stepping sideways inside the passage is stopped
    const [sx, sz] = passageAt(6, PASSAGE.half + 0.8);
    const r = open.resolve(sx, sz, 0.35);
    expect(r.hit).toBe(true);
  });

  it('chapter 3 offers it as a way out (bible 3.10 c)', () => {
    const k3 = story('03-kapitel-3.story.json');
    const beat = k3.beats.find((b) => b.id === 'k3_5')!;
    expect(JSON.stringify(beat.on)).toContain('Tempelzimmer');
    expect(JSON.stringify(beat.complete)).toContain('"x":1284');
  });
});

describe('roof mask (no snow in the rooms)', () => {
  const roofs = roofQuads(footprints, ['KB-B07']);

  it('covers the gallery, the corps de logis and the passage pavilion, not the courtyards', () => {
    expect(roofs.length).toBeGreaterThan(5);
    expect(underRoof(roofs, 1215, 350, -1215)).toBe(true); // Bildergalerie
    expect(underRoof(roofs, 1262, 352, -1125)).toBe(true); // Corps de logis
    expect(underRoof(roofs, ...([passageAt(5)[0], 349, passageAt(5)[1]] as const))).toBe(true);
    expect(underRoof(roofs, 1215, 350, -1250)).toBe(false); // garden south of the gallery
    expect(underRoof(roofs, 1225, 346, -1120)).toBe(false); // Ehrenhof
    expect(underRoof(roofs, 1215, 380, -1215)).toBe(false); // above the roof
  });
});

describe('dawn look', () => {
  it('is a low eastern sun and passes validation in a story', () => {
    const L = lookFor('dawn', 'today');
    expect(L.sun.elevation).toBeLessThan(8);
    expect(L.sun.azimuth).toBeGreaterThan(60);
    expect(L.sun.azimuth).toBeLessThan(130);
    const d = lookFor('dusk', 'today');
    expect(d.sun.azimuth).toBeGreaterThan(180);
    const s: StoryFile = {
      chapter: 'tx',
      order: 99,
      title_de: 'T',
      start: 'a',
      beats: [{ id: 'a', title_de: 'A', enter: [{ do: 'look', time: 'dawn' }], complete: { flag: 'x' } }],
    } as unknown as StoryFile;
    expect(validateStories([{ file: 't.story.json', story: s }]).errors).toEqual([]);
    const bad = structuredClone(s) as unknown as { beats: { enter: { time: string }[] }[] };
    bad.beats[0]!.enter[0]!.time = 'noon';
    expect(validateStories([{ file: 'b.story.json', story: bad as unknown as StoryFile }]).errors.length).toBeGreaterThan(0);
  });

  it('is used at chapter 4 end (Morgengrauen) and the endings', () => {
    const k4 = story('04-kapitel-4.story.json');
    expect(JSON.stringify(k4.beats.find((b) => b.id === 'k4_14')!.enter)).toContain('"time":"dawn"');
    const e = story('05-enden.story.json');
    expect(JSON.stringify(e.beats.find((b) => b.id === 'e1')!.enter)).toContain('"time":"dawn"');
  });

  it('chapter 2 lights Mannlich’s windows in the Orangerie', () => {
    const k2 = story('02-kapitel-2.story.json');
    expect(JSON.stringify(k2.on)).toContain('"id":"scenery:windows"');
    expect(JSON.stringify(k2.on)).toContain('KB-B10');
  });
});
