/**
 * Scenery (set dressing): collider extensions (solids, pass zones, ruin keep), the sets leaving
 * the story's places free, the Tempelzimmer passage through the rotunda KB-B07 (and its 1789
 * building site), the Karlslust's Rund and terraces in the research-wave model, the roof mask that
 * keeps snow out of the rooms, and the dawn look.
 */
import { readFileSync } from 'node:fs';
import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import tour from '../content/routes/p-fuehrung.json';
import type { Footprint } from '../src/data/types';
import { roofQuads, underRoof } from '../src/systems/fx/ambient/ambient';
import { SetBuilder } from '../src/systems/scenery/builder';
import { Kit } from '../src/systems/scenery/kit';
import { PASSAGE, ROTUNDA, TEMPEL_DOOR, passageAt, passageCollision, passageCoords, passageFloor, rotundaFooting } from '../src/systems/scenery/passage';
import { RUND, rundHouses } from '../src/systems/scenery/rund';
import { GATE_CENTER, SETS } from '../src/systems/scenery/sets';
import { TOUR_STOP_SETS } from '../src/systems/scenery/tour';
import { TERRACE_ROWS, terraceSolids } from '../src/systems/scenery/worldsets';
import { COURT_LIFE, CourtLife, EHRENHOF_1789, ROSETTE } from '../src/systems/scenery/court';
import { court } from '../src/systems/fx/k3-crowd';
import { lookFor } from '../src/systems/story/index';
import { validateStories } from '../src/systems/story/validate';
import type { StoryFile } from '../src/systems/story/types';
import { FootprintCollider, type Ring, pointInRing } from '../src/world/collision';
import { OPEN_GROUND, OPEN_SOLIDS, RUIN_KEEP } from '../src/world/palace';
import { loadWorldData } from './world-data';

const footprints = (JSON.parse(readFileSync(new URL('../public/data/palace/footprints.json', import.meta.url), 'utf8')) as { buildings: Footprint[] }).buildings;
const rings = footprints.map((f) => f.ring as Ring);
const idx = (id: string) => footprints.findIndex((f) => f.id === id);
const story = (name: string) => JSON.parse(readFileSync(new URL(`../content/story/${name}`, import.meta.url), 'utf8')) as StoryFile;

describe('present-day tour dressing', () => {
  it('streams on every tier and stays within two meshes and 150 triangles per stop', () => {
    const { h2025 } = loadWorldData();
    expect(TOUR_STOP_SETS.map((def) => def.id)).toEqual(['tour-karlsberger-hof', 'tour-felsenpfad', 'tour-weiher']);
    for (const def of TOUR_STOP_SETS) {
      expect(SETS).toContain(def);
      expect(def.eras).toEqual(['today']);
      expect(def.range).toBeLessThanOrEqual(45);
      for (const { x, z, range } of TOUR_STOP_SETS.filter((other) => other !== def)) {
        // Existing scenery keeps an active set for another 80 m beyond its build range.
        expect(Math.hypot(def.x - x, def.z - z)).toBeGreaterThan(def.range + 80 + range);
      }
      expect(Math.hypot(def.x - 1059, def.z - (-833))).toBeGreaterThan(def.range + 80 + 10);
      for (const [detailed, high] of [[false, false], [true, false], [true, true]] as const) {
        const b = new SetBuilder((x, z) => h2025.heightAt(x, z), detailed, high);
        def.build(b, { era: 'today', gateOpen: 0 });
        const { group, models } = b.build(def.id);
        expect(models).toHaveLength(0);
        expect(group.children).toHaveLength(1);
        expect(b.signs).toHaveLength(1);
        const mesh = group.children[0]! as Mesh;
        expect(mesh).toBeInstanceOf(Mesh);
        const triangles = mesh.geometry.getAttribute('position').count / 3 + b.signs.length * 2;
        expect(triangles).toBeLessThanOrEqual(150);
      }
    }
  });

  it('keeps the entire group route clear and places solids on dry verges', () => {
    const { h2025, pathAt, water } = loadWorldData();
    const collider = new FootprintCollider([]);
    for (const def of TOUR_STOP_SETS) {
      const b = new SetBuilder((x, z) => h2025.heightAt(x, z));
      def.build(b, { era: 'today', gateOpen: 0 });
      collider.setSolids(def.id, b.solids);
      for (const solid of b.solids) {
        const { x, z } = solid;
        const radius = solid.kind === 'circle' ? solid.r : Math.hypot(solid.hu, solid.hv);
        for (const [dx, dz] of [[0, 0], [-radius, 0], [radius, 0], [0, -radius], [0, radius]] as const) {
          expect(water(x + dx, z + dz), `${def.id} at ${x}/${z}`).toBe(false);
          expect(pathAt(x + dx, z + dz), `${def.id} at ${x}/${z}`).toBeLessThan(0.2);
        }
      }
    }
    for (let i = 1; i < tour.points.length; i++) {
      const [x, z] = tour.points[i - 1]!;
      const [nx, nz] = tour.points[i]!;
      const dx = nx! - x!;
      const dz = nz! - z!;
      const steps = Math.ceil(Math.hypot(dx, dz) / 0.25);
      for (let j = 0; j <= steps; j++) {
        const px = x! + dx * (j / steps);
        const pz = z! + dz * (j / steps);
        expect(collider.solidAt(px, pz, 1.25), `group corridor at ${px}/${pz}`).toBe(false);
      }
    }
  });
});

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

describe('the Ehrenhof in 1789 (court.ts)', () => {
  it('is paved, its rosette marks the era anchor, and it is built in 1789 only', () => {
    expect(EHRENHOF_1789.eras).toEqual(['1789']);
    const r = court(ROSETTE[0], ROSETTE[1]);
    expect(Math.hypot(r.x - 1218, r.z + 1118)).toBeLessThan(1.5);
    const b = new SetBuilder(() => 300);
    EHRENHOF_1789.build(b, { era: '1789', gateOpen: 0 });
    const built = b.build(EHRENHOF_1789.id);
    expect(built.group.children.length).toBeGreaterThan(0);
    // the paving carries no solids: only lanterns, tubs, flags, coach, stalls and barrels
    expect(built.solids.length).toBeLessThan(40);
  });

  it('its people stand clear of the anchor, the gate and the Streuner', () => {
    for (const st of COURT_LIFE.standers) {
      const p = court(st.at[0], st.at[1]);
      for (const [x, z, r] of [[1218, -1118, 4], [1206, -1113, 3], [1201, -1115, 2.5]] as const) expect(Math.hypot(p.x - x, p.z - z), `${st.kind} ${st.at}`).toBeGreaterThan(r);
    }
    const life = new CourtLife(() => 300);
    life.update(30, false);
    expect(life.count).toBeGreaterThan(COURT_LIFE.standers.length);
    life.dispose();
  });
});

describe('Tempelzimmer passage through the rotunda', () => {
  const b07 = footprints.find((f) => f.id === 'KB-B07')!.ring as Ring;
  const gallery = { passable: new Set([idx('KB-B06')]), resolve: (x: number, z: number) => ({ x, z, hit: false }) };
  /** From the Tempelzimmer (inside the gallery wing, which the interiors make passable) along the axis. */
  const walk = (c: FootprintCollider, q = 0.05, steps = 340) => {
    c.overlay = gallery;
    let [x, z] = passageAt(-1.5, q);
    for (let i = 0; i < steps; i++) {
      const r = c.resolve(x + TEMPEL_DOOR.nx * 0.08, z + TEMPEL_DOOR.nz * 0.08, 0.35);
      x = r.x;
      z = r.z;
    }
    return passageCoords(x, z)[0];
  };
  const opened = () => {
    const c = new FootprintCollider(rings);
    const { zones, solids } = passageCollision(idx('KB-B07'));
    c.setPassZones('p', zones);
    c.setSolids('p', solids);
    return c;
  };

  it('runs from the glass doors through the open colonnade, the round room KB-B07 and its portico into the garden', () => {
    const c = new FootprintCollider(rings);
    expect(b07.length).toBe(32); // the drum of the research-wave model
    const cx = b07.reduce((a, p) => a + p[0], 0) / b07.length;
    const cz = b07.reduce((a, p) => a + p[1], 0) / b07.length;
    // the rotunda stands on the door's axis
    expect(Math.hypot(passageAt(ROTUNDA.s)[0] - cx, passageAt(ROTUNDA.s)[1] - cz)).toBeLessThan(0.15);
    expect(c.footprintAt(...passageAt(ROTUNDA.s))).toBe(idx('KB-B07'));
    expect(c.footprintAt(...passageAt(2))).toBe(-1); // the colonnade
    expect(c.footprintAt(...passageAt(16))).toBe(-1); // the portico
    expect(c.footprintAt(...passageAt(PASSAGE.to + 1))).toBe(-1);
    expect(Math.hypot(TEMPEL_DOOR.nx, TEMPEL_DOOR.nz)).toBeCloseTo(1, 3);
  });

  it('gives the colonnade, the room and the portico their floors, with walkable steps between', () => {
    const f = (s: number, q = 0, t = 347.6) => passageFloor(...passageAt(s, q), t);
    expect(f(1)).toBeCloseTo(TEMPEL_DOOR.floor, 3);
    expect(f(3.5)!).toBeGreaterThan(TEMPEL_DOOR.floor);
    expect(f(3.5)!).toBeLessThan(ROTUNDA.floor);
    for (const [s, q] of [[ROTUNDA.s, 0], [ROTUNDA.s, 4.2], [PASSAGE.doorE, 0], [16, 3], [16, -3]] as const) expect(f(s, q)).toBeCloseTo(ROTUNDA.floor, 3);
    expect(f(PASSAGE.to, 0, 349.2)).toBeCloseTo(349.2, 3);
    expect(f(PASSAGE.to + 0.8)).toBeNull();
    expect(f(ROTUNDA.s, 6)).toBeNull();
    expect(f(-1)).toBeNull();
    expect(passageFloor(1294, -1234, 349)).toBeNull(); // the Bauplatz lawn
    // the player's slope limit is 42° over a 0.6 m probe
    for (let s = 2; s < 5; s += 0.1) expect((Math.atan2(f(s + 0.6)! - f(s)!, 0.6) * 180) / Math.PI).toBeLessThan(42);
  });

  it('can be walked through with the pass zones; without them the room is shut', () => {
    // without: the colonnade is open ground, the drum's west wall stops you
    expect(walk(new FootprintCollider(rings))).toBeLessThan(ROTUNDA.s - ROTUNDA.r);
    // with: through both doors, between the portico's middle columns and down into the garden
    expect(walk(opened())).toBeGreaterThan(PASSAGE.to + 1);
    expect(walk(opened(), -0.15)).toBeGreaterThan(PASSAGE.to + 1);
    // inside the room the wall holds: walking from the centre towards the south side stops short of it
    const c = opened();
    let [x, z] = passageAt(ROTUNDA.s, 0);
    for (let i = 0; i < 120; i++) {
      const r = c.resolve(...passageAt(passageCoords(x, z)[0], passageCoords(x, z)[1] + 0.08), 0.35);
      x = r.x;
      z = r.z;
    }
    expect(passageCoords(x, z)[1]).toBeLessThan(ROTUNDA.inner - 0.4);
    expect(c.footprintAt(x, z)).toBe(idx('KB-B07'));
    // the doorways are as wide as the doors: the middle is free, the jambs hold
    expect(c.resolve(...passageAt(PASSAGE.doorE, 0.4), 0.35).hit).toBe(false);
    expect(c.resolve(...passageAt(PASSAGE.doorE - 0.1, 1.05), 0.35).hit).toBe(true);
    expect(c.resolve(...passageAt(PASSAGE.doorW + 0.2, -0.6), 0.35).hit).toBe(false);
    expect(c.resolve(...passageAt(PASSAGE.doorW + 0.2, -1.35), 0.35).hit).toBe(true);
  });

  it('carries the rotunda’s plinths down to our 1789 terrain (footings under the model)', () => {
    const k = new Kit();
    rotundaFooting(k, () => 347.6);
    const g = k.build();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(347.25, 2);
    expect(bb.max.y).toBeCloseTo(348.22, 2); // the colonnade's and portico's plinth bottoms
    // within the rotunda's outline, nothing on the way or beyond the steps
    for (const [x, z] of [[bb.min.x, bb.min.z], [bb.max.x, bb.max.z]] as const) {
      const [s, q] = passageCoords(x, z);
      expect(s).toBeGreaterThan(-4);
      expect(s).toBeLessThan(PASSAGE.to + 1);
      expect(Math.abs(q)).toBeLessThan(ROTUNDA.r + 3);
    }
    // on terrain that already reaches the plinths there is nothing to fill
    const high = new Kit();
    rotundaFooting(high, () => 349.1);
    const h = high.build();
    h.computeBoundingBox();
    expect(h.boundingBox!.max.y).toBeLessThan(348.0);
  });

  it('chapter 3 offers it as a way out (bible 3.10 c), and its exit trigger lies on the way', () => {
    const k3 = story('03-kapitel-3.story.json');
    const beat = k3.beats.find((b) => b.id === 'k3_5')!;
    expect(JSON.stringify(beat.on)).toContain('Tempelzimmer');
    expect(JSON.stringify(beat.complete)).toContain('"x":1284');
    // enter 1284/−1229 r 5: by the room's east door, on the axis
    const [s, q] = passageCoords(1284, -1229);
    expect(Math.abs(q)).toBeLessThan(1);
    expect(s).toBeGreaterThan(PASSAGE.doorE - 4);
    expect(s).toBeLessThan(PASSAGE.to);
  });

  it('1789: the building site keeps the way, Hanne, the Bauplatz lawn and the boss arena free', () => {
    const def = SETS.find((s) => s.id === 'k1-bauplatz')!;
    const b = new SetBuilder(() => 347.6);
    def.build(b, { era: '1789', gateOpen: 0 });
    const site = new FootprintCollider([]);
    site.setSolids('site', b.build(def.id).solids);
    for (let s = PASSAGE.from; s <= PASSAGE.to + 3; s += 0.5) expect(site.solidAt(...passageAt(s), 0.35), `s ${s}`).toBe(false);
    // Hanne (on the portico), where the e2e stands to talk to her, the bible's and the quest's arena
    for (const [x, z, r] of [[1287, -1228, 1.8], [1284, -1224, 0.5], [1284.5, -1223.6, 0.5], [1294, -1234, 3], [1300, -1254, 3]] as const) expect(site.solidAt(x, z, r), `${x}/${z}`).toBe(false);
    // and the rotunda's own solids stay off the arena too
    const c = opened();
    expect(c.solidAt(1294, -1234, 3)).toBe(false);
    expect(c.footprintAt(1294, -1234)).toBe(-1);
    expect(passageFloor(1300, -1254, 349)).toBeNull();
  });
});

describe('the Karlslust in the research-wave model', () => {
  it('the Rund: the model’s nineteen houses (no second ring), counted 5 + 5 + 5 + 4 round the loge', () => {
    const ring = footprints.find((f) => f.id === 'KL-B40')!.ring as Ring;
    const hs = rundHouses();
    expect(hs.length).toBe(19);
    for (const h of hs) {
      expect(pointInRing(h.x, h.z, ring)).toBe(true);
      expect(Math.hypot(h.x - RUND.x, h.z - RUND.z)).toBeCloseTo(RUND.ring, 3);
    }
    const n = { w: 0, n: 0, o: 0, s: 0 };
    for (const h of hs) n[h.side]++;
    expect(n).toEqual({ w: 5, n: 4, o: 5, s: 5 });
    // the set adds only the yards' grilles: no solids, nothing on the counting spots
    const def = SETS.find((s) => s.id === 'k1-rund')!;
    const b = new SetBuilder(() => 300);
    def.build(b, { era: '1789', gateOpen: 0 });
    expect(b.build(def.id).solids.length).toBe(0);
  });

  it('the terraces KL-B43 are open ground: the rows of houses hold, the runs and the bear boxes’ clue are free', () => {
    expect(OPEN_GROUND).toContain('KL-B43');
    const c = new FootprintCollider(footprints.map((f) => (OPEN_GROUND.includes(f.id) ? [] : f.ring) as Ring));
    c.setSolids('rows', terraceSolids());
    const plot = footprints.find((f) => f.id === 'KL-B43')!.ring as Ring;
    expect(TERRACE_ROWS.length).toBe(6);
    for (const { p0, p1 } of TERRACE_ROWS) {
      expect(pointInRing((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, plot)).toBe(true);
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const [ux, uz] = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
      const at = (u: number, v: number): [number, number] => [p0[0] + ux * u - uz * v, p0[1] + uz * u + ux * v];
      expect(c.solidAt(...at(25, 1.7))).toBe(true); // a house
      expect(c.resolve(...at(25, 8), 0.35).hit).toBe(false); // its run
    }
    // k1_10: the clue at the bear boxes and the e2e's walk to it
    expect(c.solidAt(1958, 146, 4)).toBe(false);
    let [x, z] = [1950, 128];
    for (let i = 0; i < 60; i++) {
      const r = c.resolve(x + (7.5 / 60) * 1, z + (17.5 / 60) * 1, 0.35);
      expect(r.hit).toBe(false);
      x = r.x;
      z = r.z;
    }
    // inside the plot, away from the rows, nothing pushes you out any more
    expect(c.resolve(1975, 120, 0.35).hit).toBe(false);
  });
});

describe('the Altan KB-B02a (open ground in front of the Durchfahrt)', () => {
  // the outdoor collider as the intact palace has it: detailed footprints handed to the interiors
  const altanCollider = (): FootprintCollider => {
    const c = new FootprintCollider(footprints.map((f) => (OPEN_GROUND.includes(f.id) ? [] : f.ring) as Ring));
    const passable = new Set(footprints.flatMap((f, i) => (f.interior === 'detailed' ? [i] : [])));
    c.overlay = { passable, resolve: (x, z) => ({ x, z, hit: false }) };
    c.setSolids('palace-open', [...OPEN_SOLIDS]);
    return c;
  };

  it('its pillars stand inside its outline and hold; the way under it is 4 m wide', () => {
    expect(OPEN_GROUND).toContain('KB-B02a');
    const ring = footprints.find((f) => f.id === 'KB-B02a')!.ring as Ring;
    const c = altanCollider();
    expect(OPEN_SOLIDS.length).toBe(4);
    for (const s of OPEN_SOLIDS) {
      expect(pointInRing(s.x, s.z, ring)).toBe(true);
      expect(c.solidAt(s.x, s.z)).toBe(true);
    }
    // across the carriage way between the free pillars: over 4 m from pedestal to pedestal, i.e. a
    // band of more than 3.3 m for the centre of a 0.35 m body
    const [sw, se] = [OPEN_SOLIDS[2]!, OPEN_SOLIDS[3]!];
    const span = Math.hypot(se.x - sw.x, se.z - sw.z);
    const free = Array.from({ length: 101 }, (_, i) => {
      const t = i / 100;
      return !c.solidAt(sw.x + (se.x - sw.x) * t, sw.z + (se.z - sw.z) * t, 0.35);
    }).filter(Boolean).length;
    expect((free / 100) * span).toBeGreaterThan(3.3);
  });

  it('the walk from the garden under the Altan into the Durchfahrt is free (k2 "Die Warnung")', () => {
    const c = altanCollider();
    let [x, z] = [1235, -1076];
    for (let i = 0; i < 80; i++) {
      const r = c.resolve(x, z - 0.1, 0.35);
      expect(r.hit).toBe(false);
      [x, z] = [r.x, r.z];
    }
    expect(z).toBeLessThan(-1083.9);
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
