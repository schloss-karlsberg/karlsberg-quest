/**
 * Walkable palace interiors (Corps de logis, wings, gallery, orangery: the footprints marked
 * `interior: 'detailed'`), built from the catalogue room polygons (public/data/palace/rooms.json).
 *
 * - layout.ts: the plan (rooms, doors, windows, stairs, entrances, collision walls) per palace
 *   state: intact (1789–1793), ruin (1796), today (foundations only).
 * - builder.ts + props.ts: one mesh per building and era, built lazily within ~60 m of the
 *   player and disposed beyond ~85 m (one build per frame).
 * - shell.ts: the palace model's glass is cut away for built buildings (real windows), door boxes
 *   are cut through the facade, and in the ruin era the shell gives way to the interior's stubs.
 * - collide.ts: walls / floors / stairs via two small hooks in the world (collider overlay,
 *   ground + surface override).
 * - Fire (1793-07): listens to `fire:room` {roomId, state}: smoke under the ceiling, flames and
 *   embers, flames through the doors; collapsed rooms lose their ceiling, fill with debris and
 *   block their doors (after the player has left them).
 *
 * Emits `room:enter` / `room:leave` {roomId, building, id, name}; mirrors the current room in the
 * flags `interior.room` (catalogue id like `B06.1.bildergalerie`) and `interior.building`.
 * Story condition: `{ "room": "B01.2.og-festsaal" }` (also a full id or a building id).
 *
 * Debug: window.kq.interiors (see InteriorHooks).
 */
import { DataTexture, Group, Mesh, type ShaderMaterial, Vector3, Vector4 } from 'three';
import { registerEraMaterials } from '../fx/shift/prewarm';
import { GeoBuf } from './geobuf';
import { disposeModels, instanceModels } from '../scenery/models';
import { ERA_INFO, type Era } from '../../core/era';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { atmosphere } from '../../world/atmosphere';
import { type Built, buildDebris, buildInterior, lookOf } from './builder';
import { PlanQuery } from './collide';
import { FallingBeams } from './beams';
import { FestsaalObjects, type FestsaalKey, festsaalSpots } from './festsaal';
import { FESTSAAL_ROOM, festsaalSpots as dressedFestsaalSpots } from '../scenery/worldsets';
import { passageFloor } from '../scenery/passage';
import { FlameLayer } from './flames';
import { FireLightSelection } from './fireLights';
import { type FullPlan, buildPlan } from './layout';
import { bakeLight, lightTexture } from './lightmap';
import { MAX_LIGHTS, MAX_ROOMS, makeInteriorMaterial } from './material';
import { type CutBox, MAX_OPEN, ShellCut, extractOpenings, palaceMesh } from './shell';
import type { BuildingPlan, InteriorMode, IRoom, ShellOpening } from './types';
import { pointInPoly } from './geom';
import { t } from '../../i18n';
import './strings';

export type FireState = 'smoke' | 'burning' | 'collapsed';

export interface InteriorHooks {
  /** Walkable rooms of the current era's plan. */
  list(): { id: string; roomId: string; building: string; name: string; kind: string; storey: number; floor: number }[];
  /** Teleport into a room (catalogue id, full id or a unique suffix). Optional spot and view. */
  enter(roomId: string, opts?: { x?: number; z?: number; yaw?: number; pitch?: number; u?: number; v?: number; toU?: number; toV?: number }): boolean;
  /** Doors of the current plan (outer ones carry their outdoor steps). */
  doors(): { building: string; from: string; to: string | null; kind: string; x: number; z: number; nx: number; nz: number; depth: number; width: number; floor: number; stoop: { length: number; ground: number } | null }[];
  /** The room the player is in, or null. */
  room(): { roomId: string; building: string; id: string } | null;
  /** Build every building near the player now (synchronously). */
  build(): string[];
  /** Set a room's fire state directly (debug; does not emit `fire:room`). */
  fire(roomId: string, state: FireState | 'none'): void;
  state(): { mode: InteriorMode; ready: boolean; built: string[]; rooms: number; doors: number; windows: number; lights: number; openings: number; shellCut: boolean };
  /** Floor height the interiors report at x/z for a body at height y. */
  floorAt(x: number, z: number, y?: number): number | null;
  /** The Festsaal choice objects (K3): where they are and what was taken. */
  festsaal(): { active: boolean; taken: string | null; spots: { key: string; x: number; y: number; z: number }[] };
  /** Take one (as if E was pressed in front of it). */
  festsaalTake(key: string): boolean;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    interiors?: InteriorHooks;
  }
}

const BUILD_DIST = 60;
const DROP_DIST = 85;
/** Interior model groups (furniture, chandeliers) shown only inside the building or within this (m, `distTo`); hidden again beyond +3 m. */
export const MODELS_DIST = 25;

/**
 * The interior models of a built building (pure, tested): drawn when the player is inside it or
 * within `MODELS_DIST` (hysteresis: hidden beyond +3 m, no flicker at the edge); they cast sun
 * shadows only while the player is inside (from outside they are seen through the windows at most).
 */
export function interiorModelsView(inside: boolean, d: number, wasVisible: boolean): { visible: boolean; shadows: boolean } {
  const visible = inside || d < MODELS_DIST || (wasVisible && d < MODELS_DIST + 3);
  return { visible, shadows: inside };
}

interface BRT {
  id: string;
  /** Palace model index (aBld). */
  index: number;
  bp: BuildingPlan;
  built: Built | null;
  mesh: Mesh | null;
  mat: ShaderMaterial | null;
  lightTex: DataTexture | null;
  flames: FlameLayer | null;
  /** CC0 prop models of the building (detailed tiers). */
  models: Group | null;
  debris: Map<number, Mesh>;
  fade: number;
  fire: number[];
  smoke: number[];
  char: number[];
  gone: number[];
  ceil: number[];
  /** Heat before the flames (0..1): the storey below or a neighbour burns. */
  heat: number[];
  floor: number[];
  glassY: [number, number];
}

interface Runtime {
  ctx: GameContext;
  ready: boolean;
  openings: ShellOpening[];
  cut: ShellCut | null;
  plans: Map<InteriorMode, { plan: FullPlan; query: PlanQuery }>;
  /** Plans from the room catalogue alone (no shell openings): floors and walls while the shell streams. */
  catalogue: Map<InteriorMode, { plan: FullPlan; query: PlanQuery }>;
  /** A player loaded indoors before the shell arrived: the catalogue plan holds them on their storey. */
  provisional: boolean;
  mode: InteriorMode;
  era: Era;
  brt: Map<string, BRT>;
  fires: Map<string, FireState>;
  pendingBlock: Set<number>;
  room: number;
  fpIndex: Map<string, number>;
  time: number;
}

let rt: Runtime | null = null;
let festsaal: FestsaalObjects | null = null;
let beams: FallingBeams | null = null;
/**
 * A Festsaal choice waiting to be shown: its `festsaal:objects` cue came before the plans were
 * ready, or the player shifted away before choosing (it comes back in its era).
 */
let festsaalPending: { room: string; era: Era } | null = null;
/** The choice on show (what a shift away suspends). */
let festsaalShown: { room: string; era: Era } | null = null;

function placeFestsaal(ctx: GameContext, roomId: string): boolean {
  const cur = current();
  const ri = findRoom(roomId);
  if (!cur || ri < 0) return false;
  festsaalShown = { room: roomId, era: ctx.era.current };
  festsaal ??= new FestsaalObjects(ctx);
  const room = cur.plan.rooms[ri]!;
  // the Festsaal is dressed by the world sets: its clock and ducat stand on that console / ledge
  const anchors = room.roomId === FESTSAAL_ROOM ? dressedFestsaalSpots() : undefined;
  festsaal.show(festsaalSpots(room, cur.plan.doors, cur.plan.windows, anchors));
  return true;
}

function modeOf(era: Era): InteriorMode {
  const p = ERA_INFO[era].palace;
  return p === 'hidden' ? 'today' : p === 'ruin' ? 'ruin' : 'intact';
}

function makePlan(ctx: GameContext, mode: InteriorMode, openings: readonly ShellOpening[]): { plan: FullPlan; query: PlanQuery } {
  const hf = ctx.world.heightfields[mode === 'today' ? '2025' : '1789'];
  // while the palace stands, the ground before the Tempelzimmer's glass doors is the rotunda's
  // colonnade (scenery/passage.ts): flush with the door, so no steps down are built there
  const intact = mode === 'intact';
  const terrain = (x: number, z: number) => {
    const h = hf.heightAt(x, z);
    return (intact ? passageFloor(x, z, h) : null) ?? h;
  };
  const plan = buildPlan({ rooms: ctx.data.rooms, footprints: ctx.data.footprints.buildings, mode, terrain, openings });
  return { plan, query: new PlanQuery(plan) };
}

function current(): { plan: FullPlan; query: PlanQuery } | null {
  if (!rt?.ready) return null;
  let p = rt.plans.get(rt.mode);
  if (!p) {
    p = makePlan(rt.ctx, rt.mode, rt.openings);
    rt.plans.set(rt.mode, p);
  }
  return p;
}

function cataloguePlan(mode: InteriorMode): { plan: FullPlan; query: PlanQuery } {
  let p = rt!.catalogue.get(mode);
  if (!p) {
    p = makePlan(rt!.ctx, mode, []);
    rt!.catalogue.set(mode, p);
  }
  return p;
}

/**
 * The plan that answers floors and walls for walking: the streamed palace's; before it arrives
 * the room catalogue's, for a player who loaded indoors (the shell's openings only move windows
 * and add model doors; the floors and walls are the catalogue's either way). Null outside both.
 */
function walkPlan(): { plan: FullPlan; query: PlanQuery } | null {
  if (!rt) return null;
  if (rt.ready) return rt.mode === 'today' ? null : current();
  const mode = modeOf(rt.ctx.era.current);
  return rt.provisional && mode !== 'today' ? cataloguePlan(mode) : null;
}

function playerY(ctx: GameContext): number {
  return ctx.player.position.y;
}

/** The plan's walls take over from the detailed footprints (the shell's plan, else the catalogue's). */
function walkOverlay(ctx: GameContext, plan: FullPlan): void {
  const passable = new Set<number>();
  for (const bp of plan.buildings) {
    const i = ctx.data.footprints.buildings.findIndex((f) => f.id === bp.id);
    if (i >= 0) passable.add(i);
  }
  ctx.world.collider.overlay = {
    passable,
    resolve: (x, z, r) => {
      const c = walkPlan();
      return c ? c.query.resolve(x, z, r, playerY(ctx)) : { x, z, hit: false };
    },
    // the third-person camera's probes: walls from the knee up to over the lens (a lintel over a
    // door stops a raised camera too)
    hits: (x, z, r) => {
      const c = walkPlan();
      if (!c) return false;
      const y = playerY(ctx);
      return c.query.hits(x, z, r, y + 0.45, y + 3.4);
    },
  };
}

/**
 * A slot loaded with the player indoors (a cold start or a load): put them back on the saved
 * storey. The ground probe alone finds the lowest floor (or the terrain while the shell streams),
 * so the saved height picks it: a room's floor or a doorway's. Before the shell is there the
 * catalogue plan holds them on that floor and inside its walls, and the pose (what an autosave
 * writes) keeps the storey until the shell's plan takes over.
 */
function restoreStorey(ctx: GameContext): void {
  if (!rt) return;
  const { player, era } = ctx.state.state;
  const p = ctx.player.position;
  const indoors = !player.flying && era === ctx.era.current && modeOf(era) !== 'today' && player.x === p.x && player.z === p.z
    && ctx.data.footprints.buildings[ctx.world.collider.footprintAt(p.x, p.z)]?.interior === 'detailed';
  if (!rt.ready) {
    rt.provisional = indoors;
    if (indoors) walkOverlay(ctx, walkPlan()!.plan);
    else ctx.world.collider.overlay = null;
  }
  const cur = walkPlan();
  if (!indoors || !cur) return;
  const floor = cur.query.floorAt(p.x, p.z, player.y, ctx.world.heightfield.heightAt(p.x, p.z));
  if (floor === null || Math.abs(floor - player.y) > 0.05 || Math.abs(p.y - floor) < 1e-4) return;
  p.y = floor;
  ctx.player.teleport(p.x, p.z);
}

function setup(ctx: GameContext): boolean {
  if (!rt) return false;
  const mesh = palaceMesh(ctx.world.palace.object as unknown as { children: unknown[] });
  if (!mesh || !ctx.world.palace.buildings.length) return false;
  const detailed = new Set(ctx.data.footprints.buildings.filter((f) => f.interior === 'detailed').map((f) => f.id));
  const byIndex = new Map<number, string>();
  for (const b of ctx.world.palace.buildings) if (detailed.has(b.id)) byIndex.set(b.index, b.id);
  rt.openings = extractOpenings(mesh.geometry, byIndex);
  rt.cut = new ShellCut(mesh.material as ShaderMaterial);
  ctx.data.footprints.buildings.forEach((f, i) => rt!.fpIndex.set(f.id, i));
  rt.ready = true;
  rt.provisional = false;
  rt.catalogue.clear();
  installHooks(ctx);
  switchMode(ctx);
  return true;
}

/** (Re)create the runtime records for the current plan; drops all built meshes. */
function switchMode(ctx: GameContext): void {
  if (!rt) return;
  for (const b of rt.brt.values()) drop(ctx, b);
  rt.brt.clear();
  rt.pendingBlock.clear();
  const previousRoom = rt.room >= 0 ? current()?.plan.rooms[rt.room] : undefined;
  rt.mode = modeOf(ctx.era.current);
  rt.era = ctx.era.current;
  const cur = current();
  if (!cur) return;
  cur.query.clearBlocks();
  cur.query.clearSolids();
  const idx = new Map(ctx.world.palace.buildings.map((b) => [b.id, b.index]));
  for (const bp of cur.plan.buildings) {
    const rooms = bp.rooms.map((i) => cur.plan.rooms[i]!);
    const flat = rooms.filter((r) => !r.stair);
    const y1 = flat.length ? Math.max(...flat.map((r) => r.ceiling)) : bp.floor + 4;
    rt.brt.set(bp.id, {
      id: bp.id,
      index: idx.get(bp.id) ?? -1,
      bp,
      built: null,
      mesh: null,
      mat: null,
      lightTex: null,
      flames: null,
      models: null,
      debris: new Map(),
      fade: 0,
      fire: new Array<number>(MAX_ROOMS).fill(0),
      smoke: new Array<number>(MAX_ROOMS).fill(0),
      char: new Array<number>(MAX_ROOMS).fill(0),
      gone: new Array<number>(MAX_ROOMS).fill(0),
      ceil: Array.from({ length: MAX_ROOMS }, (_, i) => (bp.rooms[i] !== undefined ? cur.plan.rooms[bp.rooms[i]!]!.ceiling : 1000)),
      heat: new Array<number>(MAX_ROOMS).fill(0),
      floor: Array.from({ length: MAX_ROOMS }, (_, i) => (bp.rooms[i] !== undefined ? cur.plan.rooms[bp.rooms[i]!]!.floor : -1000)),
      glassY: [bp.floor + 0.2, y1],
    });
  }
  // collision overlay: detailed footprints become passable, the plan's walls take over
  if (rt.mode === 'today') ctx.world.collider.overlay = { passable: new Set(), resolve: (x, z) => ({ x, z, hit: false }), hits: () => false };
  else walkOverlay(ctx, cur.plan);
  updateRoom(ctx, true, previousRoom);
}

function distTo(bp: BuildingPlan, x: number, z: number): number {
  const dx = Math.max(bp.x0 + 6 - x, 0, x - (bp.x1 - 6));
  const dz = Math.max(bp.z0 + 6 - z, 0, z - (bp.z1 - 6));
  return Math.hypot(dx, dz);
}

function build(ctx: GameContext, b: BRT): void {
  const cur = current();
  if (!cur || !rt) return;
  const look = lookOf(rt.era, rt.mode, ctx.quality.level !== 'low');
  const hf = ctx.world.heightfields[rt.mode === 'today' ? '2025' : '1789'];
  const built = buildInterior(cur.plan, b.id, look, (x, z) => hf.heightAt(x, z));
  const geo = built.geo.toGeometry();
  const sun = atmosphere.uSunDir.value as Vector3;
  const grid = bakeLight(cur.plan, b.id, { x: sun.x, y: sun.y, z: sun.z });
  const lt = lightTexture(grid);
  const mat = makeInteriorMaterial(lt.tex, lt.box, grid.split);
  const u = mat.uniforms;
  u.uRoomFire!.value = b.fire;
  u.uRoomSmoke!.value = b.smoke;
  u.uRoomChar!.value = b.char;
  u.uRoomGone!.value = b.gone;
  u.uRoomCeil!.value = b.ceil;
  u.uRoomHeat!.value = b.heat;
  u.uRoomFloor!.value = b.floor;
  u.uOpenSky!.value = rt.mode === 'intact' ? 0 : 1;
  u.uDust!.value = look.sheets ? 0.5 : look.looted ? 0.3 : rt.mode === 'ruin' ? 0.5 : 0;
  u.uFade!.value = 0;
  const mesh = new Mesh(geo, mat);
  mesh.name = `interior-${b.id}`;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  ctx.scene.add(mesh);
  const flames = new FlameLayer(built.flames, b.fire, b.smoke, b.heat);
  flames.additive.name = `interior-${b.id}-flames`;
  flames.smoke.name = `interior-${b.id}-smoke`;
  ctx.scene.add(flames.additive, flames.smoke);
  if (built.models.length) {
    const group = new Group();
    group.name = `interior-${b.id}-models`;
    // drawn and casting from the first frame on only when the player is near / inside (frame())
    const view = interiorModelsView(false, dist.get(b) ?? Infinity, false);
    group.visible = view.visible;
    group.userData.noShadow = true;
    ctx.scene.add(group);
    void instanceModels(ctx.assets, built.models, group);
    b.models = group;
  }
  b.built = built;
  b.mesh = mesh;
  b.mat = mat;
  b.lightTex = lt.tex;
  b.flames = flames;
  b.fade = 0;
  cur.query.setSolids(b.id, built.solids);
  // rooms that already collapsed
  for (const [ri] of built.local.entries()) if (rt.fires.get(cur.plan.rooms[ri]!.id) === 'collapsed') addDebris(ctx, b, ri);
}

function addDebris(ctx: GameContext, b: BRT, ri: number): void {
  const cur = current();
  if (!cur || !b.built || !b.mat || b.debris.has(ri)) return;
  const li = b.built.local.get(ri);
  if (li === undefined) return;
  const m = new Mesh(buildDebris(cur.plan, ri, li).toGeometry(), b.mat);
  m.matrixAutoUpdate = false;
  ctx.scene.add(m);
  b.debris.set(ri, m);
}

function drop(ctx: GameContext, b: BRT): void {
  if (b.models) {
    b.models.userData.detached = true;
    ctx.scene.remove(b.models);
    disposeModels(b.models);
    b.models = null;
  }
  if (b.mesh) {
    ctx.scene.remove(b.mesh);
    b.mesh.geometry.dispose();
  }
  for (const m of b.debris.values()) {
    ctx.scene.remove(m);
    m.geometry.dispose();
  }
  b.debris.clear();
  b.mat?.dispose();
  b.lightTex?.dispose();
  if (b.flames) {
    ctx.scene.remove(b.flames.additive, b.flames.smoke);
    b.flames.dispose();
  }
  current()?.query.setSolids(b.id, []);
  b.built = null;
  b.mesh = null;
  b.mat = null;
  b.lightTex = null;
  b.flames = null;
  b.fade = 0;
}

// ---- fire -----------------------------------------------------------------------------------------

function roomsMatching(plan: FullPlan, id: string): number[] {
  const out: number[] = [];
  for (const r of plan.rooms) if (r.id === id || r.roomId === id || r.building === id) out.push(r.index);
  return out;
}

function setFire(ctx: GameContext, id: string, state: FireState | 'none'): void {
  if (!rt) return;
  const cur = current();
  if (!cur) return;
  for (const ri of roomsMatching(cur.plan, id)) {
    const r = cur.plan.rooms[ri]!;
    const prev = rt.fires.get(r.id);
    if (state === 'none') rt.fires.delete(r.id);
    else if (prev === 'collapsed' && state !== 'collapsed') continue;
    else rt.fires.set(r.id, state);
    const b = rt.brt.get(r.building);
    // charred joists come down where the fire takes hold (near the player, built rooms only)
    if (b?.built && ((state === 'burning' && prev !== 'burning') || (state === 'collapsed' && prev !== 'collapsed'))) {
      beams ??= new FallingBeams(ctx);
      beams.drop(r, state === 'collapsed');
    }
    if (state === 'collapsed' && prev !== 'collapsed') {
      if (rt.room === ri) rt.pendingBlock.add(ri);
      else cur.query.setRoomBlocked(ri, true);
      if (b) addDebris(ctx, b, ri);
      // caption for the sound of the collapse (accessibility: every threat sound is captioned)
      if (b?.built && distTo(b.bp, ctx.player.position.x, ctx.player.position.z) < 25) ctx.ui.hud.subtitle(null, t('interiors.collapse'), 3000);
    }
    if (state === 'none' && prev === 'collapsed') {
      cur.query.setRoomBlocked(ri, false);
      if (b) {
        const m = b.debris.get(ri);
        if (m) {
          ctx.scene.remove(m);
          m.geometry.dispose();
          b.debris.delete(ri);
        }
      }
    }
  }
}

function clearFires(ctx: GameContext): void {
  if (!rt) return;
  clearFestsaal(ctx);
  for (const id of [...rt.fires.keys()]) setFire(ctx, id, 'none');
  rt.fires.clear();
  beams?.clear();
  rt.pendingBlock.clear();
  for (const b of rt.brt.values()) {
    b.fire.fill(0);
    b.smoke.fill(0);
    b.char.fill(0);
    b.gone.fill(0);
    b.heat.fill(0);
  }
}

/** Ease the per-room fire uniforms towards their state. */
function animateFire(ctx: GameContext, dt: number): void {
  if (!rt) return;
  const cur = current();
  if (!cur) return;
  const gentle = ctx.settings.state.gentleMode;
  for (const b of rt.brt.values()) {
    // what burns in this building: the heat reaches the rooms that don't burn yet (more from below)
    let burnStorey = Infinity;
    let anyBurn = false;
    for (const ri of b.bp.rooms) {
      const st = rt.fires.get(cur.plan.rooms[ri]!.id);
      if (st === 'burning' || st === 'collapsed') {
        anyBurn = true;
        burnStorey = Math.min(burnStorey, cur.plan.rooms[ri]!.storey);
      }
    }
    b.bp.rooms.forEach((ri, li) => {
      if (li >= MAX_ROOMS) return;
      const room = cur.plan.rooms[ri]!;
      const st = rt!.fires.get(room.id);
      const ambient = anyBurn && !st ? (burnStorey < room.storey ? 0.55 : 0.32) : 0;
      const tf = st === 'burning' ? 1 : st === 'collapsed' ? 0.45 : 0;
      const ts = (st === 'smoke' ? 0.55 : st === 'burning' ? 1 : st === 'collapsed' ? 0.7 : ambient * 0.75) * (gentle ? 0.6 : 1);
      const th = st === 'smoke' ? 0.6 : st ? 0 : ambient;
      const tc = st === 'burning' ? 0.7 : st === 'collapsed' ? 1 : b.char[li]!;
      const tg = st === 'collapsed' ? 1 : 0;
      const k = Math.min(1, dt * 0.6);
      b.fire[li]! += (tf - b.fire[li]!) * k;
      // the smoke bank creeps down more slowly than the flames take hold
      b.smoke[li]! += (ts - b.smoke[li]!) * Math.min(1, dt * (ts > b.smoke[li]! ? 0.22 : 0.6));
      b.heat[li]! += (th - b.heat[li]!) * Math.min(1, dt * 0.5);
      b.char[li]! += (tc - b.char[li]!) * Math.min(1, dt * 0.08);
      b.gone[li] = tg;
    });
  }
}

/** Take the Festsaal choice (and its E prompt and card hold) off the scene. */
function clearFestsaal(ctx: GameContext): void {
  festsaalPending = null;
  festsaalShown = null;
  if (!festsaal?.active) return;
  festsaal.clear();
  ctx.ui.cards.hold('festsaal', false);
}

/** A choice still open (shown or waiting, nothing taken): it comes back when the player returns. */
function openFestsaal(ctx: GameContext): { room: string; era: Era } | null {
  if (typeof ctx.state.state.flags['festsaal.took'] === 'string') return null;
  if (festsaalPending) return festsaalPending;
  return festsaal?.active && !festsaal.taken ? festsaalShown : null;
}

// ---- room tracking ----------------------------------------------------------------------------------

function updateRoom(ctx: GameContext, force = false, previousRoom?: IRoom): void {
  if (!rt) return;
  const cur = current();
  const p = ctx.player.position;
  const ri = cur && rt.mode !== 'today' ? cur.query.roomAt(p.x, p.z, p.y) : -1;
  if (ri === rt.room && !force) return;
  const prev = rt.room;
  rt.room = ri;
  // Room indices are local to a plan. A vanished upper floor can leave its index to another wing.
  const r = previousRoom ?? cur?.plan.rooms[prev];
  if (r && cur && r.id !== cur.plan.rooms[ri]?.id) {
    ctx.events.emit('room:leave', { roomId: r.roomId, building: r.building, id: r.id });
    if (rt.pendingBlock.has(prev)) {
      rt.pendingBlock.delete(prev);
      cur.query.setRoomBlocked(prev, true);
    }
  }
  if (ri >= 0 && cur && (ri !== prev || force)) {
    const r = cur.plan.rooms[ri]!;
    ctx.events.emit('room:enter', { roomId: r.roomId, building: r.building, id: r.id, name: r.name });
    ctx.state.update((s) => {
      s.flags['interior.room'] = r.roomId;
      s.flags['interior.building'] = r.building;
    }, 'interiors');
    const skilled = (ctx.state.state.skills.baumeister ?? 0) >= 1 || ctx.debug || ctx.params.has('rooms');
    if (skilled && ri !== prev) ctx.ui.toast(t('interiors.room', { name: r.name }), 2200);
  } else if (ri < 0 && (prev >= 0 || force)) {
    ctx.state.update((s) => {
      s.flags['interior.room'] = '';
      s.flags['interior.building'] = '';
    }, 'interiors');
  }
}

// ---- per frame: builds, shell, lights ---------------------------------------------------------------

function frame(ctx: GameContext, dt: number): void {
  if (!rt) return;
  if (!rt.ready && !setup(ctx)) return;
  rt.time += dt;
  if (rt.era !== ctx.era.current) switchMode(ctx);
  const cam = ctx.camera.position;
  const px = ctx.player.position.x;
  const pz = ctx.player.position.z;
  // lazy build (one per frame) / drop; buildings sorted by distance in a reused array
  let builtOne = false;
  const order = frameOrder;
  order.length = 0;
  for (const b of rt.brt.values()) {
    order.push(b);
    dist.set(b, distTo(b.bp, px, pz));
  }
  order.sort((a, c) => dist.get(a)! - dist.get(c)!);
  for (const b of order) {
    const d = dist.get(b)!;
    if (!b.mesh && d < BUILD_DIST && !builtOne) {
      build(ctx, b);
      builtOne = true;
    } else if (b.mesh && d > DROP_DIST) drop(ctx, b);
    if (b.models) {
      const room = rt.room >= 0 ? current()?.plan.rooms[rt.room] : undefined;
      const view = interiorModelsView(d === 0 || room?.building === b.id, d, b.models.visible);
      b.models.visible = view.visible;
      b.models.userData.noShadow = !view.shadows;
      b.models.castShadow = view.shadows;
    }
  }
  animateFire(ctx, dt);
  // shell: open the built buildings, cut the nearest doors. The cut / clip boxes of a building
  // are fixed per plan: cached, and the nearest ones re-chosen only when the player moved
  // ≥ 0.5 m or the set of built buildings changed (no per-frame garbage).
  const reduced = ctx.settings.state.reducedMotion || ctx.settings.state.reducedFlash === true;
  const cur = current();
  let nOpen = 0;
  let builtKey = '';
  for (const b of order) {
    if (!b.mesh || !b.mat) continue;
    builtKey += b.id;
    b.fade = Math.min(1, b.fade + dt / 0.5);
    b.mat.uniforms.uFade!.value = b.fade;
    if (nOpen < MAX_OPEN && b.index >= 0) {
      const o = openPool[nOpen++]!;
      o.index = b.index;
      o.fade = b.fade;
      o.y0 = b.glassY[0];
      o.y1 = b.glassY[1];
    }
    // lights: the nearest ones (re-sorted when the camera moved ≥ 1 m), flickering
    const lights = b.built!.lights;
    let lc = lightCache.get(b);
    if (!lc || lc.src !== lights) {
      lc = { src: lights, sorted: [...lights], x: Infinity, y: 0, z: 0 };
      lightCache.set(b, lc);
    }
    if (lights.length > MAX_LIGHTS && (cam.x - lc.x) ** 2 + (cam.y - lc.y) ** 2 + (cam.z - lc.z) ** 2 > 1) {
      lc.x = cam.x;
      lc.y = cam.y;
      lc.z = cam.z;
      lc.sorted.sort((p, q) => (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 + (p.z - cam.z) ** 2 - ((q.x - cam.x) ** 2 + (q.y - cam.y) ** 2 + (q.z - cam.z) ** 2));
    }
    const sorted = lc.sorted;
    const LP = b.mat.uniforms.uLightPos!.value as { set: (a: number, b: number, c: number, d: number) => void }[];
    const LC = b.mat.uniforms.uLightCol!.value as { set: (a: number, b: number, c: number, d: number) => void }[];
    // the fire lights the room: the nearest burning flame spots become flickering lights
    const nFire = fireLightSelection.update(b.built!.flames, b.fire, cam);
    for (let i = 0; i < nFire; i++) {
      const f = fireLightSelection.spots[i]!;
      const fl = reduced ? 0.9 : 0.7 + 0.2 * Math.sin(rt.time * 9.7 + i * 2.1) + 0.12 * Math.sin(rt.time * 23.1 + i * 5.3) + 0.08 * Math.sin(rt.time * 3.1 + i);
      const k = b.fire[f.room]! * fl * 1.1;
      LP[i]!.set(f.x, f.y + 1.2, f.z, 9);
      LC[i]!.set(k, 0.36 * k, 0.08 * k, f.room);
    }
    const nLights = Math.min(MAX_LIGHTS, nFire + sorted.length);
    b.mat.uniforms.uLightCount!.value = nLights;
    for (let i = nFire; i < nLights; i++) {
      const l = sorted[i - nFire]!;
      const fl = reduced ? 1 : 0.93 + 0.05 * Math.sin(rt.time * 9.1 + i * 1.7) + 0.03 * Math.sin(rt.time * 23.3 + i);
      LP[i]!.set(l.x, l.y, l.z, l.radius);
      LC[i]!.set(l.r * fl, l.g * fl, l.b * fl, l.room);
    }
    b.flames?.update(rt.time, reduced, 1);
    // heat shimmer while standing in a burning room (fx owns uHeat outdoors; take the larger)
    if (rt.room >= 0 && cur) {
      const li = b.built!.local.get(rt.room);
      if (li !== undefined) {
        const pu = ctx.post.uniforms;
        const h = Math.max(b.fire[li]!, b.heat[li]! * 0.5) * (reduced ? 0.3 : 0.9);
        if (pu.uHeat && h > (pu.uHeat.value as number)) pu.uHeat.value = h;
      }
    }
  }
  if (rt.cut?.ok && ctx.era.info.palace !== 'hidden') {
    openList.length = nOpen;
    for (let i = 0; i < nOpen; i++) openList[i] = openPool[i]!;
    rt.cut.setOpen(openList, rt.mode === 'ruin');
    const key = rt.mode + builtKey;
    if (key !== shellSel.key || (px - shellSel.x) ** 2 + (pz - shellSel.z) ** 2 > 0.25) {
      shellSel.key = key;
      shellSel.x = px;
      shellSel.z = pz;
      const cuts = shellSel.cuts;
      const clips = shellSel.clips;
      cuts.length = 0;
      clips.length = 0;
      for (const b of order) {
        if (!b.mesh || !b.mat || !cur) continue;
        const boxes = shellBoxes(b, cur.plan, rt.mode);
        for (const c of boxes.clips) {
          c.d = Math.hypot(c.cx - px, c.cz - pz);
          clips.push(c);
        }
        for (const c of boxes.cuts) {
          c.d = Math.hypot(c.cx - px, c.cz - pz);
          cuts.push(c);
        }
      }
      cuts.sort(byD);
      clips.sort(byD);
      // setCuts / setClips read only the first MAX_CUTS / MAX_CLIPS entries
      rt.cut.setCuts(cuts);
      rt.cut.setClips(clips);
    }
  }
}

type ShellBox = CutBox & { d: number; cx: number; cz: number };
const byD = (a: { d: number }, c: { d: number }) => a.d - c.d;
const frameOrder: BRT[] = [];
const dist = new Map<BRT, number>();
const openPool = Array.from({ length: MAX_OPEN }, () => ({ index: 0, fade: 0, y0: 0, y1: 0 }));
const openList: { index: number; fade: number; y0: number; y1: number }[] = [];
const lightCache = new WeakMap<BRT, { src: Built['lights']; sorted: Built['lights']; x: number; y: number; z: number }>();
const fireLightSelection = new FireLightSelection();
const shellSel = { key: '', x: Infinity, z: Infinity, cuts: [] as ShellBox[], clips: [] as ShellBox[] };
const shellCache = new WeakMap<BRT, { plan: FullPlan; mode: InteriorMode; cuts: ShellBox[]; clips: ShellBox[] }>();

/** The clip boxes of a building's rooms and the cut boxes of its outer doors (cached per plan). */
function shellBoxes(b: BRT, plan: FullPlan, mode: InteriorMode): { cuts: ShellBox[]; clips: ShellBox[] } {
  const hit = shellCache.get(b);
  if (hit && hit.plan === plan && hit.mode === mode) return hit;
  const clips: ShellBox[] = [];
  for (const ri of b.bp.rooms) {
    const r = plan.rooms[ri]!;
    const f = r.frame;
    const top = mode === 'ruin' ? r.floor + 40 : r.ceiling - 0.02;
    clips.push({ x: f.ox + f.ux * (f.L / 2) + f.vx * (f.W / 2), z: f.oz + f.uz * (f.L / 2) + f.vz * (f.W / 2), ux: f.ux, uz: f.uz, hu: f.L / 2 + 0.12, hv: f.W / 2 + 0.12, y0: (r.stair ? r.stair.low : r.floor) - 0.02, y1: top, d: 0, cx: r.cx, cz: r.cz });
  }
  const cuts: ShellBox[] = [];
  if (mode === 'intact') {
    for (const d of plan.doors) {
      if (d.building !== b.id || d.kind === 'inner') continue;
      const x = d.cx + d.nx * (d.depth / 2);
      const z = d.cz + d.nz * (d.depth / 2);
      cuts.push({ x, z, ux: d.nx, uz: d.nz, hu: d.depth / 2 + 0.75, hv: d.width / 2, y0: d.floor - 0.05, y1: d.top, d: 0, cx: x, cz: z });
    }
  }
  const out = { plan, mode, cuts, clips };
  shellCache.set(b, out);
  return out;
}

// ---- world hooks --------------------------------------------------------------------------------------

/** Rooms that hold a clue in the current era (their floor wins for things placed from afar). */
function anchorRooms(ctx: GameContext, plan: FullPlan): Set<number> {
  const out = new Set<number>();
  for (const c of ctx.content.clues.values()) {
    const w = c.where;
    if (!w?.anchor) continue;
    const eras = Array.isArray(w.era) ? w.era : [w.era];
    if (!eras.includes(ctx.era.current)) continue;
    for (const r of plan.rooms) if (r.roomId === w.anchor || r.id === w.anchor) out.add(r.index);
  }
  return out;
}

let anchors: { plan: FullPlan; era: Era; set: Set<number> } | null = null;

function installWorldHooks(ctx: GameContext): void {
  const w = ctx.world;
  w.groundOverride = (x, z, terrain, yHint) => {
    const cur = walkPlan();
    if (!cur) return null;
    // a caller that knows its storey (an NPC placed in an upper room)
    if (yHint !== undefined) return cur.query.floorAt(x, z, yHint, terrain);
    const p = ctx.player.position;
    // the player (and probes around them): the storey they are on; anything placed from afar
    // (clue markers, echo figures): the clue room's floor, else the ground floor
    if (Math.hypot(x - p.x, z - p.z) < 2.5) return cur.query.floorAt(x, z, p.y, terrain);
    if (!anchors || anchors.plan !== cur.plan || anchors.era !== ctx.era.current) anchors = { plan: cur.plan, era: ctx.era.current, set: anchorRooms(ctx, cur.plan) };
    return cur.query.floorAt(x, z, -1e9, terrain, anchors.set);
  };
  w.ceilingAt = (x, z, y) => {
    const cur = current();
    if (!cur || !rt || rt.mode !== 'intact') return null;
    const ri = cur.query.roomAt(x, z, y);
    return ri < 0 ? null : cur.plan.rooms[ri]!.ceiling;
  };
  w.spaceAt = (x, z, y) => {
    const cur = current();
    if (!cur || !rt || rt.mode === 'today') return -1;
    return cur.query.spaceAt(x, z, y);
  };
  w.roomAnchor = (id) => {
    const cur = current();
    const ri = findRoom(id);
    if (!cur || ri < 0) return null;
    const r = cur.plan.rooms[ri]!;
    // the catalogue floor does not depend on the era's plan (a ghost for 1789 placed while it is today)
    const cat = ctx.data.rooms.find((c) => c.id === r.id);
    const y = r.stair ? r.stair.low : cat?.floor_h ?? r.floor;
    return { x: r.cx, z: r.cz, y, roomId: r.roomId, building: r.building };
  };
  w.entranceFor = (x, z, fx, fz) => {
    const cur = current();
    if (!cur || !rt || rt.mode === 'today') return null;
    // the goal's building: the room nearest the goal whose centre lies within 30 m
    let best = -1;
    let bd = 30;
    for (let i = 0; i < cur.plan.rooms.length; i++) {
      const r = cur.plan.rooms[i]!;
      const d = Math.hypot(r.cx - x, r.cz - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return null;
    const building = cur.plan.rooms[best]!.building;
    // the outer door that makes the shortest walk: player → door → goal
    let door: { x: number; z: number } | null = null;
    let cost = Infinity;
    for (const d of cur.plan.doors) {
      if (d.b !== -1 || (d.building !== building && d.buildingB !== building)) continue;
      const out = d.depth + (d.stoop?.length ?? 0) + 1.2;
      const px = d.cx + d.nx * out;
      const pz = d.cz + d.nz * out;
      const c = Math.hypot(px - fx, pz - fz) + Math.hypot(px - x, pz - z) * 1.5;
      if (c < cost) {
        cost = c;
        door = { x: px, z: pz };
      }
    }
    return door;
  };
  w.routeTo = (x, z, fx, fz, fy) => {
    const cur = current();
    if (!cur || !rt || rt.mode === 'today') return null;
    const plan = cur.plan;
    // the goal's room: the one whose outline holds it (lowest storey); −1 = out of doors
    let goal = -1;
    for (const r of plan.rooms) if (pointInPoly(x, z, r.poly) && (goal < 0 || r.storey < plan.rooms[goal]!.storey)) goal = r.index;
    const from = cur.query.roomAt(fx, fz, fy);
    if (from === goal) return null;
    // breadth-first over the doors (rooms + outside = −1)
    const prev = new Map<number, { door: number; room: number }>();
    const hops = new Map<number, number>([[from, 0]]);
    const queue = [from];
    while (queue.length) {
      const r = queue.shift()!;
      for (const d of plan.doors) {
        const other = d.a === r ? d.b : d.b === r ? d.a : null;
        if (other === null || hops.has(other)) continue;
        // a door between storeys is no door to walk (stairs are rooms of their own)
        if (other >= 0 && r >= 0 && plan.rooms[other]!.storey !== plan.rooms[r]!.storey) continue;
        hops.set(other, hops.get(r)! + 1);
        prev.set(other, { door: d.index, room: r });
        queue.push(other);
      }
    }
    let target = goal;
    let exit = -1;
    if (goal < 0) {
      // out of the building to a goal outside (the Küchenhof from the Registratur): the outer door
      // that makes the shortest walk, not the first one found
      let best = Infinity;
      for (const d of plan.doors) {
        if (d.b !== -1 || !hops.has(d.a)) continue;
        const c = hops.get(d.a)! * 5 + Math.hypot(d.cx - x, d.cz - z);
        if (c < best) {
          best = c;
          exit = d.index;
          target = d.a;
        }
      }
      if (exit < 0) return null;
    } else if (!hops.has(goal)) return null;
    let step = { door: exit, room: target };
    if (target !== from) {
      let at = target;
      step = prev.get(at)!;
      while (step.room !== from) {
        at = step.room;
        step = prev.get(at)!;
      }
    }
    const d = plan.doors[step.door]!;
    // the far side of the door, seen from where the player is: outside an outer door it is the
    // point in front of its steps until close, then a step inside
    const fromA = d.a === from;
    if (from < 0) {
      const out = d.depth + (d.stoop?.length ?? 0) + 1.2;
      const ox = d.cx + d.nx * out;
      const oz = d.cz + d.nz * out;
      // the mark floats in the opening itself (playtest round 9: over the foot of the steps it
      // read as "on the blank wall left of the door"); the zone stays at the foot of the steps
      const sill = cur.query.floorAt(d.cx - d.nx * 0.3, d.cz - d.nz * 0.3, 1e9, ctx.world.heightAt(d.cx, d.cz)) ?? ctx.world.heightAt(d.cx, d.cz);
      const mark = { x: d.cx, y: sill - 0.9, z: d.cz };
      if (Math.hypot(ox - fx, oz - fz) > 3 && Math.hypot(d.cx - fx, d.cz - fz) > out + 0.5) return { x: ox, z: oz, door: true, mark };
      return { x: d.cx - d.nx * 1.2, z: d.cz - d.nz * 1.2, door: true, mark };
    }
    const k = fromA ? d.depth + (d.b === -1 ? (d.stoop?.length ?? 0) + 1.2 : 1) : -1;
    return { x: d.cx + d.nx * k, z: d.cz + d.nz * k, door: true };
  };
  w.surfaceOverride = (x, z) => {
    const cur = current();
    if (!cur || !rt || rt.mode === 'today') return null;
    const p = ctx.player.position;
    const ri = cur.query.roomAt(x, z, p.y);
    if (ri < 0) return cur.query.floorAt(x, z, p.y, -1e9) !== null ? 'cobbles' : null;
    if (rt.mode === 'ruin') return 'gravel';
    const r = cur.plan.rooms[ri]!;
    return r.floorKind === 'stone' ? 'cobbles' : 'wood';
  };
}

function findRoom(id: string): number {
  const cur = current();
  if (!cur) return -1;
  const rs = cur.plan.rooms;
  let i = rs.findIndex((r) => r.roomId === id || r.id === id);
  if (i < 0) i = rs.findIndex((r) => r.roomId.endsWith(id) || r.id.endsWith(id));
  return i;
}

function installHooks(ctx: GameContext): void {
  const kq = window.kq;
  if (!kq || kq.interiors) return;
  const hooks: InteriorHooks = {
    list() {
      const cur = current();
      return cur ? cur.plan.rooms.map((r) => ({ id: r.id, roomId: r.roomId, building: r.building, name: r.name, kind: r.kind, storey: r.storey, floor: r.floor })) : [];
    },
    enter(roomId, opts = {}) {
      const cur = current();
      const ri = findRoom(roomId);
      if (!cur || ri < 0) return false;
      const r = cur.plan.rooms[ri]!;
      let x = opts.x ?? r.cx;
      let z = opts.z ?? r.cz;
      if (opts.u !== undefined || opts.v !== undefined) {
        const f = r.frame;
        const u = (opts.u ?? 0.5) * f.L;
        const v = (opts.v ?? 0.5) * f.W;
        x = f.ox + f.ux * u + f.vx * v;
        z = f.oz + f.uz * u + f.vz * v;
      }
      const floor = r.stair ? r.stair.low : r.floor;
      let yaw = opts.yaw === undefined ? undefined : (-opts.yaw * Math.PI) / 180;
      if (opts.toU !== undefined || opts.toV !== undefined) {
        const f = r.frame;
        const u = (opts.toU ?? 0.5) * f.L;
        const v = (opts.toV ?? 0.5) * f.W;
        const dx = f.ox + f.ux * u + f.vx * v - x;
        const dz = f.oz + f.uz * u + f.vz * v - z;
        yaw = Math.atan2(-dx, -dz);
      }
      // stand there first: the ground hook picks the storey from the player's own height
      ctx.player.position.set(x, floor + 0.05, z);
      ctx.player.teleport(x, z, yaw);
      if (opts.pitch !== undefined) ctx.player.pitch = (opts.pitch * Math.PI) / 180;
      ctx.world.forest.invalidate();
      hooks.build();
      updateRoom(ctx);
      return true;
    },
    doors() {
      const cur = current();
      if (!cur) return [];
      return cur.plan.doors.map((d) => ({
        building: d.building,
        from: cur.plan.rooms[d.a]!.roomId,
        to: d.b >= 0 ? cur.plan.rooms[d.b]!.roomId : null,
        kind: d.kind,
        x: d.cx,
        z: d.cz,
        nx: d.nx,
        nz: d.nz,
        depth: d.depth,
        width: d.width,
        floor: d.floor,
        stoop: d.stoop,
      }));
    },
    room() {
      const cur = current();
      if (!cur || !rt || rt.room < 0) return null;
      const r = cur.plan.rooms[rt.room]!;
      return { roomId: r.roomId, building: r.building, id: r.id };
    },
    build() {
      if (!rt) return [];
      const out: string[] = [];
      const p = ctx.player.position;
      for (const b of rt.brt.values()) {
        if (!b.mesh && distTo(b.bp, p.x, p.z) < BUILD_DIST) build(ctx, b);
        if (b.mesh) {
          b.fade = 1;
          b.mat!.uniforms.uFade!.value = 1;
          out.push(b.id);
        }
      }
      return out;
    },
    fire(roomId, state) {
      setFire(ctx, roomId, state);
      // jump the fade so screenshots show the state at once
      animateFire(ctx, 30);
    },
    state() {
      const cur = current();
      return {
        mode: rt?.mode ?? 'intact',
        ready: !!rt?.ready,
        built: rt ? [...rt.brt.values()].filter((b) => b.mesh).map((b) => b.id) : [],
        rooms: cur?.plan.rooms.length ?? 0,
        doors: cur?.plan.doors.length ?? 0,
        windows: cur?.plan.windows.length ?? 0,
        lights: rt ? [...rt.brt.values()].reduce((a, b) => a + (b.built?.lights.length ?? 0), 0) : 0,
        openings: rt?.openings.length ?? 0,
        shellCut: !!rt?.cut?.ok,
      };
    },
    floorAt(x, z, y) {
      const cur = current();
      if (!cur) return null;
      return cur.query.floorAt(x, z, y ?? ctx.player.position.y, ctx.world.heightfield.heightAt(x, z));
    },
    festsaal() {
      return { active: !!festsaal?.active, taken: festsaal?.taken ?? null, spots: festsaal?.spots().map(({ key, x, y, z }) => ({ key, x, y, z })) ?? [] };
    },
    festsaalTake(key) {
      return !!festsaal?.take(key as FestsaalKey);
    },
  };
  kq.interiors = hooks;
}

export default defineSystem({
  id: 'interiors',
  init(ctx) {
    rt = {
      ctx,
      ready: false,
      openings: [],
      cut: null,
      plans: new Map(),
      mode: modeOf(ctx.era.current),
      era: ctx.era.current,
      brt: new Map(),
      fires: new Map(),
      pendingBlock: new Set(),
      room: -1,
      fpIndex: new Map(),
      time: 0,
      catalogue: new Map(),
      provisional: false,
    };
    installWorldHooks(ctx);
    // before setup: the shell's first room check then finds the saved storey
    restoreStorey(ctx);
    registerEraMaterials('interiors.shell', '*', () => { const g = new GeoBuf(); g.tri([0, 0, 0], [0.01, 0, 0], [0, 0.01, 0], [0, 0, 1], { col: [1, 1, 1], mat: 0, room: 0 }); return new Mesh(g.toGeometry(), makeInteriorMaterial(new DataTexture(new Uint8Array(4), 1, 1), new Vector4(), 0)); });
    registerEraMaterials('interiors.fire', '1793-07', () => {
      const room = new Array<number>(MAX_ROOMS).fill(0);
      room[0] = 1;
      const spot = { x: 0, y: 0, z: 0, w: 1, h: 1, room: 0, seed: 0 };
      const layer = new FlameLayer([{ ...spot, kind: 1 }, { ...spot, kind: 3 }], room, room, room);
      return [layer.additive, layer.smoke];
    });
    ctx.events.on('save:loaded', () => {
      if (!rt) return;
      // a choice the outgoing game left open (or queued) does not come back in the loaded one
      festsaalPending = null;
      restoreStorey(ctx);
      if (rt.ready) updateRoom(ctx);
    });
    ctx.events.on('era:change', ({ from, to }) => {
      if (!(from === '1793-07' && to === '1793-07')) {
        // shifting away mid-choice (Q held in the Festsaal): the things go, the choice waits for
        // the player's return to its era (the beat runs on; its fallback may still decide)
        const open = openFestsaal(ctx);
        clearFires(ctx);
        festsaalPending = open;
      }
      if (rt?.ready) switchMode(ctx);
      else if (rt?.provisional && modeOf(to) === 'today') {
        rt.provisional = false;
        ctx.world.collider.overlay = null;
      }
    });
    ctx.events.on('fire:room', ({ roomId, state }) => setFire(ctx, roomId, state));
    ctx.events.on('story:cue', ({ id, data }) => {
      if (id === 'festsaal:objects') {
        const room = typeof data?.room === 'string' ? data.room : 'B01.2.og-festsaal';
        festsaalPending = placeFestsaal(ctx, room) ? null : { room, era: ctx.era.current };
      } else if (id === 'festsaal:clear') clearFestsaal(ctx);
    });
    ctx.events.on('threat:configure', (c) => {
      if (c.kind === 'fire' && !c.active) clearFires(ctx);
    });
    setup(ctx);
  },
  update(_dt, ctx) {
    if (!rt?.ready) return;
    updateRoom(ctx);
    const pending = festsaalPending;
    if (pending && pending.era === ctx.era.current) {
      if (typeof ctx.state.state.flags['festsaal.took'] === 'string') festsaalPending = null;
      else if (placeFestsaal(ctx, pending.room)) festsaalPending = null;
    }
    festsaal?.update();
    // the Festsaal choice with the fire clock running: no card over Hanne and the clock (round 5)
    ctx.ui.cards.hold('festsaal', !!festsaal?.active);
  },
  frame(dt, ctx) {
    frame(ctx, dt);
    festsaal?.frame(dt);
    beams?.frame(dt, rt?.time ?? 0);
    if (rt?.ready && !window.kq?.interiors) installHooks(ctx);
  },
  dispose() {
    if (!rt) return;
    const ctx = rt.ctx;
    for (const b of rt.brt.values()) drop(ctx, b);
    rt.cut?.dispose();
    ctx.world.collider.overlay = null;
    ctx.world.groundOverride = null;
    ctx.world.ceilingAt = null;
    ctx.world.spaceAt = null;
    ctx.world.surfaceOverride = null;
    ctx.world.roomAnchor = null;
    ctx.world.entranceFor = null;
    ctx.world.routeTo = null;
    festsaal?.dispose();
    festsaal = null;
    beams?.dispose();
    beams = null;
    festsaalPending = null;
    festsaalShown = null;
    rt = null;
  },
});
