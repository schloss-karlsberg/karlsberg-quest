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
import { type DataTexture, Mesh, type ShaderMaterial, Vector3 } from 'three';
import { ERA_INFO, type Era } from '../../core/era';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { atmosphere } from '../../world/atmosphere';
import { type Built, buildDebris, buildInterior, lookOf } from './builder';
import { PlanQuery } from './collide';
import { FlameLayer } from './flames';
import { type FullPlan, buildPlan } from './layout';
import { bakeLight, lightTexture } from './lightmap';
import { MAX_LIGHTS, MAX_ROOMS, makeInteriorMaterial } from './material';
import { type CutBox, MAX_CLIPS, MAX_CUTS, MAX_OPEN, ShellCut, extractOpenings, palaceMesh } from './shell';
import type { BuildingPlan, InteriorMode, ShellOpening } from './types';
import { t } from '../../i18n';
import './strings';

export type FireState = 'smoke' | 'burning' | 'collapsed';

declare module '../../core/events' {
  interface GameEvents {
    /** (interiors) Debug / tests: a room's fire state was set directly. */
    'interiors:fire': { roomId: string; state: FireState | 'none' };
  }
}

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
}

declare module '../../debug/hooks' {
  interface KqHooks {
    interiors?: InteriorHooks;
  }
}

const BUILD_DIST = 60;
const DROP_DIST = 85;

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
  debris: Map<number, Mesh>;
  fade: number;
  fire: number[];
  smoke: number[];
  char: number[];
  gone: number[];
  ceil: number[];
  glassY: [number, number];
}

interface Runtime {
  ctx: GameContext;
  ready: boolean;
  openings: ShellOpening[];
  cut: ShellCut | null;
  plans: Map<InteriorMode, { plan: FullPlan; query: PlanQuery }>;
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

function modeOf(era: Era): InteriorMode {
  const p = ERA_INFO[era].palace;
  return p === 'hidden' ? 'today' : p === 'ruin' ? 'ruin' : 'intact';
}

function current(): { plan: FullPlan; query: PlanQuery } | null {
  if (!rt?.ready) return null;
  let p = rt.plans.get(rt.mode);
  if (!p) {
    const ctx = rt.ctx;
    const hf = ctx.world.heightfields[rt.mode === 'today' ? '2025' : '1789'];
    const plan = buildPlan({ rooms: ctx.data.rooms, footprints: ctx.data.footprints.buildings, mode: rt.mode, terrain: (x, z) => hf.heightAt(x, z), openings: rt.openings });
    p = { plan, query: new PlanQuery(plan) };
    rt.plans.set(rt.mode, p);
  }
  return p;
}

function playerY(ctx: GameContext): number {
  return ctx.player.position.y;
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
      debris: new Map(),
      fade: 0,
      fire: new Array<number>(MAX_ROOMS).fill(0),
      smoke: new Array<number>(MAX_ROOMS).fill(0),
      char: new Array<number>(MAX_ROOMS).fill(0),
      gone: new Array<number>(MAX_ROOMS).fill(0),
      ceil: Array.from({ length: MAX_ROOMS }, (_, i) => (bp.rooms[i] !== undefined ? cur.plan.rooms[bp.rooms[i]!]!.ceiling : 1000)),
      glassY: [bp.floor + 0.2, y1],
    });
  }
  // collision overlay: detailed footprints become passable, the plan's walls take over
  const passable = new Set<number>();
  if (rt.mode !== 'today') for (const bp of cur.plan.buildings) {
    const i = rt.fpIndex.get(bp.id);
    if (i !== undefined) passable.add(i);
  }
  ctx.world.collider.overlay = {
    passable,
    resolve: (x, z, r) => {
      const c = current();
      if (!c || rt!.mode === 'today') return { x, z, hit: false };
      return c.query.resolve(x, z, r, playerY(ctx));
    },
  };
  updateRoom(ctx, true);
}

function distTo(bp: BuildingPlan, x: number, z: number): number {
  const dx = Math.max(bp.x0 + 6 - x, 0, x - (bp.x1 - 6));
  const dz = Math.max(bp.z0 + 6 - z, 0, z - (bp.z1 - 6));
  return Math.hypot(dx, dz);
}

function build(ctx: GameContext, b: BRT): void {
  const cur = current();
  if (!cur || !rt) return;
  const look = lookOf(rt.era, rt.mode);
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
  u.uOpenSky!.value = rt.mode === 'intact' ? 0 : 1;
  u.uDust!.value = look.sheets ? 0.5 : look.looted ? 0.3 : rt.mode === 'ruin' ? 0.5 : 0;
  u.uFade!.value = 0;
  const mesh = new Mesh(geo, mat);
  mesh.name = `interior-${b.id}`;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  ctx.scene.add(mesh);
  const flames = new FlameLayer(built.flames, b.fire, b.smoke);
  ctx.scene.add(flames.additive, flames.smoke);
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
  for (const id of [...rt.fires.keys()]) setFire(ctx, id, 'none');
  rt.fires.clear();
  rt.pendingBlock.clear();
  for (const b of rt.brt.values()) {
    b.fire.fill(0);
    b.smoke.fill(0);
    b.char.fill(0);
    b.gone.fill(0);
  }
}

/** Ease the per-room fire uniforms towards their state. */
function animateFire(ctx: GameContext, dt: number): void {
  if (!rt) return;
  const cur = current();
  if (!cur) return;
  const gentle = ctx.settings.state.gentleMode;
  for (const b of rt.brt.values()) {
    b.bp.rooms.forEach((ri, li) => {
      if (li >= MAX_ROOMS) return;
      const st = rt!.fires.get(cur.plan.rooms[ri]!.id);
      const tf = st === 'burning' ? 1 : st === 'collapsed' ? 0.45 : 0;
      const ts = (st === 'smoke' ? 0.55 : st === 'burning' ? 1 : st === 'collapsed' ? 0.7 : 0) * (gentle ? 0.6 : 1);
      const tc = st === 'burning' ? 0.7 : st === 'collapsed' ? 1 : b.char[li]!;
      const tg = st === 'collapsed' ? 1 : 0;
      const k = Math.min(1, dt * 0.6);
      b.fire[li]! += (tf - b.fire[li]!) * k;
      b.smoke[li]! += (ts - b.smoke[li]!) * k;
      b.char[li]! += (tc - b.char[li]!) * Math.min(1, dt * 0.08);
      b.gone[li] = tg;
    });
  }
}

// ---- room tracking ----------------------------------------------------------------------------------

function updateRoom(ctx: GameContext, force = false): void {
  if (!rt) return;
  const cur = current();
  const p = ctx.player.position;
  const ri = cur && rt.mode !== 'today' ? cur.query.roomAt(p.x, p.z, p.y) : -1;
  if (ri === rt.room && !force) return;
  const prev = rt.room;
  rt.room = ri;
  if (prev >= 0 && cur && cur.plan.rooms[prev] && prev !== ri) {
    const r = cur.plan.rooms[prev]!;
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
  // lazy build (one per frame) / drop
  let builtOne = false;
  const order = [...rt.brt.values()].map((b) => ({ b, d: distTo(b.bp, px, pz) })).sort((a, c) => a.d - c.d);
  for (const { b, d } of order) {
    if (!b.mesh && d < BUILD_DIST && !builtOne) {
      build(ctx, b);
      builtOne = true;
    } else if (b.mesh && d > DROP_DIST) drop(ctx, b);
  }
  animateFire(ctx, dt);
  // shell: open the built buildings, cut the nearest doors
  const reduced = ctx.settings.state.reducedMotion;
  const open: { index: number; fade: number; y0: number; y1: number }[] = [];
  const cuts: CutBox[] = [];
  const clips: (CutBox & { d: number })[] = [];
  const cur = current();
  for (const { b } of order) {
    if (!b.mesh || !b.mat) continue;
    b.fade = Math.min(1, b.fade + dt / 0.5);
    b.mat.uniforms.uFade!.value = b.fade;
    if (open.length < MAX_OPEN && b.index >= 0) open.push({ index: b.index, fade: b.fade, y0: b.glassY[0], y1: b.glassY[1] });
    // lights: the nearest ones, flickering
    const lights = b.built!.lights;
    const sorted = lights.length > MAX_LIGHTS ? [...lights].sort((p, q) => (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 + (p.z - cam.z) ** 2 - ((q.x - cam.x) ** 2 + (q.y - cam.y) ** 2 + (q.z - cam.z) ** 2)) : lights;
    const LP = b.mat.uniforms.uLightPos!.value as { set: (a: number, b: number, c: number, d: number) => void }[];
    const LC = b.mat.uniforms.uLightCol!.value as { set: (a: number, b: number, c: number, d: number) => void }[];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = sorted[i];
      if (!l) {
        LP[i]!.set(0, 0, 0, 0);
        continue;
      }
      const fl = reduced ? 1 : 0.93 + 0.05 * Math.sin(rt.time * 9.1 + i * 1.7) + 0.03 * Math.sin(rt.time * 23.3 + i);
      LP[i]!.set(l.x, l.y, l.z, l.radius);
      LC[i]!.set(l.r * fl, l.g * fl, l.b * fl, l.room);
    }
    b.flames?.update(rt.time, reduced, 1);
    if (cur) {
      for (const ri of b.bp.rooms) {
        const r = cur.plan.rooms[ri]!;
        const f = r.frame;
        const top = rt.mode === 'ruin' ? r.floor + 40 : r.ceiling - 0.02;
        clips.push({ x: f.ox + f.ux * (f.L / 2) + f.vx * (f.W / 2), z: f.oz + f.uz * (f.L / 2) + f.vz * (f.W / 2), ux: f.ux, uz: f.uz, hu: f.L / 2 + 0.12, hv: f.W / 2 + 0.12, y0: (r.stair ? r.stair.low : r.floor) - 0.02, y1: top, d: Math.hypot(r.cx - px, r.cz - pz) });
      }
    }
    if (cur && rt.mode === 'intact') {
      for (const d of cur.plan.doors) {
        if (d.building !== b.id || d.kind === 'inner') continue;
        cuts.push({ x: d.cx + d.nx * (d.depth / 2), z: d.cz + d.nz * (d.depth / 2), ux: d.nx, uz: d.nz, hu: d.depth / 2 + 0.75, hv: d.width / 2, y0: d.floor - 0.05, y1: d.top });
      }
    }
  }
  if (rt.cut?.ok && ctx.era.info.palace !== 'hidden') {
    rt.cut.setOpen(open, rt.mode === 'ruin');
    cuts.sort((a, c) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(c.x - px, c.z - pz));
    rt.cut.setCuts(cuts.slice(0, MAX_CUTS));
    clips.sort((a, c) => a.d - c.d);
    rt.cut.setClips(clips.slice(0, MAX_CLIPS));
  }
}

// ---- world hooks --------------------------------------------------------------------------------------

function installWorldHooks(ctx: GameContext): void {
  const w = ctx.world;
  w.groundOverride = (x, z, terrain) => {
    const cur = current();
    if (!cur || !rt || rt.mode === 'today') return null;
    return cur.query.floorAt(x, z, ctx.player.position.y, terrain);
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
      ctx.player.position.y = floor + 0.05;
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
    };
    installWorldHooks(ctx);
    ctx.events.on('era:change', ({ from, to }) => {
      if (!(from === '1793-07' && to === '1793-07')) clearFires(ctx);
      if (rt?.ready) switchMode(ctx);
    });
    ctx.events.on('fire:room', ({ roomId, state }) => setFire(ctx, roomId, state));
    ctx.events.on('threat:configure', (c) => {
      if (c.kind === 'fire' && !c.active) clearFires(ctx);
    });
    setup(ctx);
  },
  update(_dt, ctx) {
    if (!rt?.ready) return;
    updateRoom(ctx);
  },
  frame(dt, ctx) {
    frame(ctx, dt);
    if (rt?.ready && !window.kq?.interiors) installHooks(ctx);
  },
  dispose() {
    if (!rt) return;
    const ctx = rt.ctx;
    for (const b of rt.brt.values()) drop(ctx, b);
    rt.cut?.dispose();
    ctx.world.collider.overlay = null;
    ctx.world.groundOverride = null;
    ctx.world.surfaceOverride = null;
    rt = null;
  },
});
