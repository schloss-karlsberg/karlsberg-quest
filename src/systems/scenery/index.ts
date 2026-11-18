/**
 * Scenery feature: set dressing, the distant Hohenburg, the fireworks echo, lit windows and the
 * Tempelzimmer passage. Purely visual plus a few colliders; it owns no gameplay.
 *
 *  - Sets (sets.ts): procedural props per era and place (the 1796 quarry at the Baumagazin, the
 *    road and the Ehrenhof; the 1789 building site at the gallery; the kennels; the park fence and
 *    barrier at the Carlsluster Torhaus; the Ehrenhof railing and gate; the Orangerie court in
 *    1793-02), ghostly workers that hammer on a loop (with a clink), smoke and glows. Built when
 *    the player comes near in the right era; their solids go to `world.collider.setSolids`.
 *  - The Hohenburg silhouette (hohenburg.ts), clearest at dawn / dusk and from the west edge in 1796.
 *  - Fireworks (fireworks.ts) while the Chronik plays `echo.k1.feuerwerk`.
 *  - Lit windows (windows.ts) by story cue: `{do:'cue', id:'scenery:windows', data:{building,
 *    era?, on?, share?}}`; the Ehrenhof gate by `{id:'scenery:gate', data:{open:true|false}}`.
 *  - The passage through KB-B07 from the Tempelzimmer's glass doors (passage.ts), intact eras.
 *
 * State `systems.scenery {windows: [{building, era, share}], gate}`; hooks `kq.scenery.*`.
 */
import { Color, Group, type Mesh, type ShaderMaterial } from 'three';
import type { GameContext } from '../../core/context';
import { type Era, ERA_INFO, isEra } from '../../core/era';
import { defineSystem } from '../../core/systems';
import type { PassZone, Solid } from '../../world/collision';
import { clink } from './audio';
import { type BuiltSet, SetBuilder } from './builder';
import { FIREWORKS_ECHO, Fireworks, type FireworksPhase } from './fireworks';
import { atmosphere } from '../../world/atmosphere';
import { Lehnstuhl } from './chair';
import { CONVOY_ROAD, Convoy } from './convoy';
import { type Extent, HILL_REACH, HOHENBURG, Hohenburg, MAG_ACROSS, MAG_HEIGHT, pullFactor } from './hohenburg';
import { Kit } from './kit';
import { propMaterial } from './material';
import { buildPassage, passageCollision, patchPalace, setPassageCut } from './passage';
import { GATE_CENTER, SETS, type SetDef } from './sets';
import { type LitWindows, buildLitWindows } from './windows';
import { RUND, RundTally } from './rund';

export interface SceneryWindow {
  building: string;
  era: Era;
  share: number;
}

export interface ScenerySlice {
  windows: SceneryWindow[];
  /** Ehrenhof gate: 0 closed … 1 open. */
  gate: number;
}

declare module '../../core/state' {
  interface SystemStates {
    scenery: ScenerySlice;
  }
}

export interface SceneryHooks {
  /** Ids of the sets built right now. */
  built(): string[];
  /** All set ids with their eras and centres. */
  sets(): { id: string; eras: readonly string[]; x: number; z: number; range: number }[];
  /** Solids registered with the collider. */
  solids(): number;
  windows(building: string, on?: boolean, era?: string, share?: number): number;
  gate(open: boolean): void;
  fireworks: {
    start(): void;
    phase(p?: FireworksPhase): FireworksPhase;
    stop(): void;
    state(): { phase: FireworksPhase; lamps: number; sparks: number };
  };
  hohenburg(): { vis: number; x: number; z: number; /** Westblick magnification of the height (1 = real) */ mag: number };
  passage(): { open: boolean; zones: number };
  /** Doors of the Rund counted so far (lit). */
  rundCounted(): number;
  /** The rolling stone carts of 1796 (positions; empty when not built). */
  convoy(): [number, number][];
  /** Seconds the carts echo still turns the view to the nearest cart. */
  cartsLook(): number;
  /** Peter's armchair (x/z) while it stands beside him. */
  chair(): [number, number] | null;
  /** Current Westblick haze lift 0..1. */
  fogLift(): number;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    scenery?: SceneryHooks;
  }
}

const OWNER = 'scenery';
const STRIKE_RANGE = 45;

interface Live {
  def: SetDef;
  built: BuiltSet;
  era: Era;
  gate: number;
  lastStrike: number[];
}

let slice: ScenerySlice;
let root: Group;
const live = new Map<string, Live>();
let hohenburg: Hohenburg;
let fogLift = 0;
let convoy: Convoy | null = null;
let convoyT = 0;
let chair: Lehnstuhl | null = null;
let fogLiftWritten = false;
let hohVis = 0.5;
let fireworks: Fireworks | null = null;
let fwMaxLine = -1;
let fwOwnClock = 0;
const lit = new Map<string, LitWindows>();
let passage: { group: Group; zones: PassZone[]; solids: Solid[]; patched: boolean; b07: number } | null = null;
let solidsDirty = true;
let lastEra: Era | null = null;
let tally: RundTally | null = null;
/** The carts echo (`clue.k4.karren`): seconds the view still eases to the nearest cart. */
let cartsLook = 0;
let cartsCut = false;
/** The memory that is the carts on the road (round 6: it did not turn the view to them). */
const CARTS_ECHO = 'clue.k4.karren';
let tallyQuiet = true;

/** The Rund's counted doors (1789, near the ring): pulse as the story counts each side. */
function updateTally(ctx: GameContext, dt: number): void {
  const p = ctx.player.position;
  const here = ctx.era.current === '1789' && Math.hypot(p.x - RUND.x, p.z - RUND.z) < 300;
  if (!here) {
    if (tally) tally.mesh.visible = false;
    return;
  }
  if (!tally) {
    tally = new RundTally((x, z) => ctx.world.heightfields['1789'].heightAt(x, z));
    root.add(tally.mesh);
  }
  tally.mesh.visible = true;
  const f = ctx.state.state.flags;
  tally.update(dt, { w: f['k1.zaehl.w'] === true, n: f['k1.zaehl.n'] === true, o: f['k1.zaehl.o'] === true, s: f['k1.zaehl.s'] === true }, tallyQuiet);
  tallyQuiet = false;
}

function windowKey(w: { building: string; era: string }): string {
  return `${w.building}@${w.era}`;
}

function dropSet(id: string): void {
  const l = live.get(id);
  if (!l) return;
  l.built.group.removeFromParent();
  l.built.group.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh || (o as { isPoints?: boolean }).isPoints) m.geometry.dispose();
  });
  for (const m of l.built.materials) {
    (m.userData.atlas as { dispose(): void } | undefined)?.dispose();
    m.dispose();
  }
  live.delete(id);
  solidsDirty = true;
}

function buildSet(ctx: GameContext, def: SetDef, era: Era): void {
  const b = new SetBuilder((x, z) => ctx.world.heightfield.heightAt(x, z));
  def.build(b, { era, gateOpen: slice.gate });
  const built = b.build(def.id);
  root.add(built.group);
  live.set(def.id, { def, built, era, gate: slice.gate, lastStrike: built.strikes.map(() => Number.NaN) });
  solidsDirty = true;
}

function syncSolids(ctx: GameContext): void {
  if (!solidsDirty) return;
  solidsDirty = false;
  const all: Solid[] = [];
  for (const l of live.values()) all.push(...l.built.solids);
  const intact = ERA_INFO[ctx.era.current].palace === 'intact';
  if (passage && intact) all.push(...passage.solids);
  ctx.world.collider.setSolids(OWNER, all);
  const zones: PassZone[] = [];
  if (passage && intact) zones.push(...passage.zones);
  if (slice.gate > 0.5 && intact) {
    const gi = ctx.data.footprints.buildings.findIndex((f) => f.id === 'KB-B39');
    if (gi >= 0) zones.push({ poly: gi, x: GATE_CENTER[0], z: GATE_CENTER[1], r: 1.75 });
  }
  ctx.world.collider.setPassZones(OWNER, zones);
}

/** Palace merged mesh (null until loaded). */
function palaceMesh(ctx: GameContext): Mesh | null {
  for (const c of ctx.world.palace.object.children) if ((c as Mesh).isMesh) return c as Mesh;
  return null;
}

function ensurePassage(ctx: GameContext): void {
  if (passage) return;
  const mesh = palaceMesh(ctx);
  if (!mesh) return;
  const b07 = ctx.world.palace.buildings.find((b) => b.id === 'KB-B07')?.index ?? -1;
  const poly = ctx.data.footprints.buildings.findIndex((f) => f.id === 'KB-B07');
  if (b07 < 0 || poly < 0) return;
  const k = new Kit();
  buildPassage(k, (x, z) => ctx.world.heightfields['1789'].heightAt(x, z));
  const group = new Group();
  group.name = 'scenery-passage';
  const m = new (Object.getPrototypeOf(mesh).constructor as typeof import('three').Mesh)(k.build(), propMaterial());
  m.name = 'scenery-passage-walls';
  group.add(m);
  root.add(group);
  const { zones, solids } = passageCollision(poly);
  const patched = patchPalace(mesh, b07);
  passage = { group, zones, solids, patched, b07 };
  const intact = ERA_INFO[ctx.era.current].palace === 'intact';
  group.visible = intact;
  setPassageCut(mesh, intact ? b07 : -10);
  solidsDirty = true;
}

function applyEra(ctx: GameContext): void {
  const era = ctx.era.current;
  for (const id of [...live.keys()]) {
    const l = live.get(id)!;
    if (l.era !== era) dropSet(id);
  }
  const intact = ERA_INFO[era].palace === 'intact';
  if (passage) {
    passage.group.visible = intact;
    const mesh = palaceMesh(ctx);
    if (mesh) setPassageCut(mesh, intact ? passage.b07 : -10);
  }
  for (const [key, w] of lit) w.setOn(key.endsWith(`@${era}`) ? 1 : 0);
  solidsDirty = true;
}

function applyWindows(ctx: GameContext): void {
  const mesh = palaceMesh(ctx);
  if (!mesh) return;
  const want = new Set(slice.windows.map(windowKey));
  for (const [key, w] of lit) {
    if (!want.has(key)) {
      w.dispose();
      lit.delete(key);
    }
  }
  for (const w of slice.windows) {
    const key = windowKey(w);
    if (lit.has(key)) continue;
    const fp = ctx.data.footprints.buildings.find((f) => f.id === w.building);
    const idx = ctx.world.palace.buildings.find((b) => b.id === w.building)?.index;
    if (!fp || idx === undefined) continue;
    const built = buildLitWindows(mesh.geometry, idx, fp, (x, z) => ctx.world.heightfields['1789'].heightAt(x, z), w.share);
    if (!built) continue;
    root.add(built.group);
    lit.set(key, built);
  }
  for (const [key, w] of lit) w.setOn(key.endsWith(`@${ctx.era.current}`) ? 1 : 0);
}

function setWindows(ctx: GameContext, building: string, on: boolean, era: Era, share: number): number {
  slice.windows = slice.windows.filter((w) => !(w.building === building && w.era === era));
  if (on) slice.windows.push({ building, era, share });
  applyWindows(ctx);
  return lit.get(`${building}@${era}`)?.count ?? 0;
}

function setGate(ctx: GameContext, open: boolean): void {
  slice.gate = open ? 1 : 0;
  // rebuild the railing with the wings in their new place
  for (const [id, l] of live) if (l.def.id === 'ehrenhof-gitter') dropSet(id);
  solidsDirty = true;
  syncSolids(ctx);
}

function updateHohenburg(ctx: GameContext, dt: number): void {
  const L = ctx.world.look;
  const era = ctx.era.current;
  const p = ctx.player.position;
  let vis = 0.55;
  if (L.disc === 'sun' && L.sun.elevation < 9) vis = 1; // dawn, dusk
  else if (L.disc === 'moon' || ERA_INFO[era].night) vis = 0.3;
  // chapter 4's view west from the edge of the land (bible 4.2)
  const west = Math.hypot(p.x - 200, p.z + 905);
  if (era === '1796' && west < 260) vis = Math.max(vis, 0.95 - (west / 260) * 0.3);
  hohVis += (vis - hohVis) * Math.min(1, dt * 1.5);
  // playtest round 2: from the Westblick the Hohenburg must stand clear — the haze lifts there
  // (thins to a quarter within 120 m of the edge, eased in over 260 m), and comes back as you leave
  const lift = era === '1796' ? Math.max(0, Math.min(1, (260 - west) / 140)) : 0;
  fogLift += (lift - fogLift) * Math.min(1, dt * 1.2);
  if (fogLift > 0.002 || fogLiftWritten) {
    const k = 1 - 0.75 * fogLift;
    atmosphere.uFogDensity.value = L.fog.density * k;
    atmosphere.uFogHeightDensity.value = L.fog.heightDensity * k;
    fogLiftWritten = fogLift > 0.002;
  }
  const cam = ctx.camera.position;
  // the magnified castle hill reaches nearer: pull so that its near foot still stays beyond the edge
  const reach = 330 + (HILL_REACH - 330) * fogLift;
  hohenburg.set(hohVis, ctx.world.sky.uniforms.uHorizon!.value as Color, pullFactor(cam.x, cam.z, terrainExtent(ctx), 25, reach * (1 + (MAG_ACROSS - 1) * fogLift)), fogLift);
}

type NpcList = () => { npc: string; x: number; z: number; era: string; visible: boolean }[];

/** Peter's gilded armchair stands beside him in July 1793 (chair.ts). */
function updateChair(ctx: GameContext, dt: number): void {
  const list = (window.kq as unknown as { npc?: { list?: NpcList } } | undefined)?.npc?.list;
  const peter = ctx.era.current === '1793-07' && typeof list === 'function' ? list().find((n) => n.npc === 'peter' && n.visible) : undefined;
  const p = ctx.player.position;
  const want = peter && Math.hypot(peter.x - p.x, peter.z - p.z) < 160;
  if (want && !chair) {
    chair = new Lehnstuhl();
    root.add(chair.group);
  } else if (!want && chair) {
    chair.dispose();
    chair = null;
  }
  if (chair && peter) chair.follow(peter.x, peter.z, (x, z) => ctx.world.heightfield.heightAt(x, z), dt);
}

/**
 * The carts echo turns the view to the nearest cart for a few seconds (a look-at cue, not a lock:
 * the mouse still wins; reduced motion: one cut). Like the fireworks and the K3 torch.
 */
function turnToCarts(ctx: GameContext, dt: number): void {
  if (cartsLook <= 0) return;
  cartsLook -= dt;
  if (!convoy) return;
  const pl = ctx.player;
  let tx = 0;
  let tz = 0;
  let bd = Infinity;
  for (const [x, z] of convoy.positions()) {
    const d = Math.hypot(x - pl.position.x, z - pl.position.z);
    if (d < bd) {
      bd = d;
      tx = x;
      tz = z;
    }
  }
  if (bd > 120 || bd < 2) return;
  const dx = tx - pl.position.x;
  const dz = tz - pl.position.z;
  const want = Math.atan2(-dx, -dz);
  let d = want - pl.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const reduced = ctx.settings.state.reducedMotion;
  if (reduced && cartsCut) return;
  cartsCut = true;
  const k = reduced ? 1 : Math.min(1, dt * 2.4);
  pl.yaw += d * k;
  const ty = ctx.world.heightAt(tx, tz) + 1.2;
  const pitch = Math.max(-0.35, Math.min(0.3, Math.atan2(ty - (pl.position.y + 1.6), bd)));
  pl.pitch += (pitch - pl.pitch) * k;
}

/** The 1796 carts roll while the player is within 450 m of the valley road. */
function updateConvoy(ctx: GameContext, dt: number): void {
  const p = ctx.player.position;
  let near = Infinity;
  for (const [x, z] of CONVOY_ROAD) near = Math.min(near, Math.hypot(p.x - x, p.z - z));
  const want = ctx.era.current === '1796' && near < 450;
  if (want && !convoy) {
    convoy = new Convoy((x, z) => ctx.world.heightfield.heightAt(x, z));
    root.add(convoy.group);
  } else if (!want && convoy) {
    convoy.dispose();
    convoy = null;
  }
  convoyT += dt;
  convoy?.update(dt, convoyT);
}

let extent: Extent | null = null;
function terrainExtent(ctx: GameContext): Extent {
  if (extent) return extent;
  const b = ctx.world.heightfield.bounds;
  extent = [b.x0, b.z0, b.x1, b.z1];
  return extent;
}

type EchoProbe = () => { id: string | null; t: number; total: number; line: number };

function echoProbe(): EchoProbe | null {
  const c = (window.kq as unknown as { chronik?: { echo?: EchoProbe } } | undefined)?.chronik;
  return typeof c?.echo === 'function' ? c.echo : null;
}

function updateFireworks(ctx: GameContext, dt: number): void {
  if (!fireworks || fireworks.phase === 'off') return;
  const probe = echoProbe();
  const e = probe?.();
  if (e && e.id === FIREWORKS_ECHO) {
    if (e.line > fwMaxLine) fwMaxLine = e.line;
  } else {
    // no Chronik timeline: our own (A 22 s, then the climax, the return 9 s later)
    fwOwnClock += dt;
    fwMaxLine = fwOwnClock > 31 ? 5 : fwOwnClock > 22 ? 4 : 0;
  }
  if (fwMaxLine >= 5 && fireworks.phase !== 'return') fireworks.setPhase('return');
  else if (fwMaxLine >= 4 && fireworks.phase === 'festive') fireworks.setPhase('climax');
  fireworks.frame(dt);
  void ctx;
}

function startFireworks(ctx: GameContext): void {
  if (!fireworks) {
    fireworks = new Fireworks(ctx);
    root.add(fireworks.group);
  }
  fwMaxLine = -1;
  fwOwnClock = 0;
  fireworks.start();
}

function playStrikes(ctx: GameContext): void {
  const t = (ctx.world.sky.uniforms.uTime!.value as number) * (ctx.settings.state.reducedMotion ? 0.6 : 1);
  const p = ctx.player.position;
  for (const l of live.values()) {
    l.built.strikes.forEach((s, i) => {
      const k = Math.floor((t + s.phase) / s.period - 0.78);
      const prev = l.lastStrike[i]!;
      l.lastStrike[i] = k;
      if (Number.isNaN(prev) || k === prev) return;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < STRIKE_RANGE) clink(ctx.audio, s.x, s.y, s.z, 0.6);
    });
  }
}

function installHooks(ctx: GameContext): void {
  const kq = window.kq;
  if (!kq || kq.scenery) return;
  kq.scenery = {
    built: () => [...live.keys()],
    sets: () => SETS.map((s) => ({ id: s.id, eras: s.eras, x: s.x, z: s.z, range: s.range })),
    solids: () => [...live.values()].reduce((n, l) => n + l.built.solids.length, 0),
    windows: (building, on = true, era, share = 0.7) => setWindows(ctx, building, on, isEra(era) ? era : ctx.era.current, share),
    gate: (open) => setGate(ctx, open),
    fireworks: {
      start: () => startFireworks(ctx),
      phase: (p) => {
        if (p && fireworks) {
          // jump the timeline (tests): the line counter follows
          fwMaxLine = p === 'climax' || p === 'dark' ? 4 : p === 'return' ? 5 : fwMaxLine;
          fwOwnClock = p === 'climax' || p === 'dark' ? 22 : p === 'return' ? 31 : fwOwnClock;
          fireworks.setPhase(p);
        }
        return fireworks?.phase ?? 'off';
      },
      stop: () => fireworks?.stop(),
      state: () => ({ phase: fireworks?.phase ?? 'off', lamps: fireworks?.lampCount ?? 0, sparks: fireworks?.liveSparks ?? 0 }),
    },
    hohenburg: () => ({ vis: hohVis, x: HOHENBURG.x, z: HOHENBURG.z, mag: 1 + (MAG_HEIGHT - 1) * fogLift }),
    passage: () => ({ open: !!passage && ERA_INFO[ctx.era.current].palace === 'intact', zones: passage?.zones.length ?? 0 }),
    convoy: () => convoy?.positions() ?? [],
    cartsLook: () => cartsLook,
    chair: () => chair?.position() ?? null,
    fogLift: () => fogLift,
    rundCounted: () => tally?.counted ?? 0,
  };
}

export default defineSystem({
  id: 'scenery',
  after: ['interiors'],
  init(ctx) {
    slice = ctx.state.slice('scenery', () => ({ windows: [], gate: 0 }));
    slice.windows ??= [];
    slice.gate ??= 0;
    root = new Group();
    root.name = 'scenery';
    ctx.scene.add(root);
    hohenburg = new Hohenburg();
    root.add(hohenburg.mesh);
    ctx.events.on('era:change', () => applyEra(ctx));
    ctx.events.on('echo:start', ({ id }) => {
      if (id === FIREWORKS_ECHO) startFireworks(ctx);
      if (id === CARTS_ECHO) {
        // the carts come up the road beside the memory, and the view turns to them
        updateConvoy(ctx, 0);
        if (convoy) convoy.bringNear(ctx.player.position.x, ctx.player.position.z);
        cartsLook = 4.5;
        cartsCut = false;
      }
    });
    ctx.events.on('echo:end', ({ id }) => {
      if (id === FIREWORKS_ECHO) fireworks?.stop();
    });
    ctx.events.on('story:cue', ({ id, data }) => {
      if (id === 'scenery:windows' && data && typeof data.building === 'string') {
        const era = isEra(data.era) ? data.era : ctx.era.current;
        const share = typeof data.share === 'number' ? data.share : 0.7;
        setWindows(ctx, data.building, data.on !== false, era, share);
      } else if (id === 'scenery:gate' && data) setGate(ctx, data.open === true);
    });
    ctx.events.on('game:start', () => {
      // a loaded save brings its own windows / gate
      slice = ctx.state.slice('scenery', () => ({ windows: [], gate: 0 }));
      for (const id of [...live.keys()]) dropSet(id);
      tally?.reset();
      tallyQuiet = true;
      applyWindows(ctx);
      applyEra(ctx);
    });
  },
  // fixed steps (deterministic with `kq.step`): sets, collision, strikes, Hohenburg, fireworks
  update(dt, ctx) {
    installHooks(ctx);
    const era = ctx.era.current;
    if (era !== lastEra) {
      lastEra = era;
      applyEra(ctx);
    }
    ensurePassage(ctx);
    if (slice.windows.length && lit.size < slice.windows.length) applyWindows(ctx);
    const p = ctx.player.position;
    for (const def of SETS) {
      const l = live.get(def.id);
      const here = def.eras.includes(era);
      const d = Math.hypot(p.x - def.x, p.z - def.z);
      if (l && (!here || d > def.range + 80 || l.gate !== slice.gate)) dropSet(def.id);
      if (!live.has(def.id) && here && d < def.range) buildSet(ctx, def, era);
    }
    syncSolids(ctx);
    playStrikes(ctx);
    updateHohenburg(ctx, dt);
    updateConvoy(ctx, dt);
    turnToCarts(ctx, dt);
    updateChair(ctx, dt);
    updateFireworks(ctx, dt);
    updateTally(ctx, dt);
  },
  // per rendered frame: hooks (also while `?manual` holds the fixed steps) and motion settings
  frame(_dt, ctx) {
    installHooks(ctx);
    const reduced = ctx.settings.state.reducedMotion;
    for (const l of live.values()) for (const m of l.built.materials) if (m.uniforms.uMotion) m.uniforms.uMotion.value = reduced ? 0.6 : 1;
  },
  dispose() {
    for (const id of [...live.keys()]) dropSet(id);
    fireworks?.dispose();
    convoy?.dispose();
    convoy = null;
    chair?.dispose();
    chair = null;
    tally?.dispose();
    tally = null;
    for (const w of lit.values()) w.dispose();
    lit.clear();
    root?.removeFromParent();
  },
});

export type { ShaderMaterial };
