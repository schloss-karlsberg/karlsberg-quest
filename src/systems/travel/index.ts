/**
 * Travel: Vermessungspunkte and fast travel, route POIs, the Wegweiser and the Laufschritt
 * (playtest round 2: "long empty walks", "markers point through buildings").
 *
 *  - Survey points (points.ts): Laub's tripods. Walking up to one "misst es ein" (beam shoots up,
 *    rings run out, a brass chime); from then on the map (M, or Pause → Karte) takes you
 *    there in a breath: in the present day always, in the past while nothing holds you there (no
 *    fight, no pack, no fire or story meter, no `flags['travel.locked']`). A point next to a far
 *    goal is announced by Laub, so a chapter never starts with a march across the land.
 *  - Route POIs (pois.ts): every ~120 m beside the chapters' walks a cache guarded by two to four
 *    spectral things (`enemy:spawn` group `poi.<id>`; cleared → the lid flies open, `loot:place`,
 *    `xp:grant`), a Fundstück (lore.ts: a card, EP, Pause → Sammlungen → Funde) or a Wegstein
 *    that heals once in a while.
 *  - Wegweiser (trail.ts + world/route.ts): chalk-blue motes along the walkable route to the goal
 *    (round wings, through the open gate) when a goal is new, the straight line is blocked, or the
 *    player seems lost.
 *  - Laufschritt (laufschritt.ts): holding sprint outside fights and chases speeds up to ×1.45,
 *    starting after one second.
 *  - After being caught / knocked down: if a known point lies much closer to the goal than where
 *    you woke, a toast says so (M).
 *
 * The map key M belongs to this system; the survey system's map overlays (1836–41 / 1935–40) are
 * buttons on the map page (event `survey:show-map`). State `systems.travel`; hooks `kq.travel.*`.
 */
import { skipRealTimeWaits } from '../../core/bullet';
import { type Group, Group as ThreeGroup } from 'three';
import type { GameContext } from '../../core/context';
import type { Era } from '../../core/era';
import { defineSystem } from '../../core/systems';
import { PLAYER_RADIUS, WADE_LIMIT_M } from '../../player/player';
import type { QuestDef, QuestObjective, QuestSlice } from '../../rpg/types';
import { h } from '../../ui/dom';
import { addPageSection, addPausePage, openPausePage, pausePageHandle } from '../../ui/pause-pages';
import { loadBundledQuests, questsInPlay } from '../quests/data';
import { PATH_COST, findRoute, pathGroundCost } from '../../world/route';
import { type MapLayer, gateFrom, nextMap } from '../skills/logic';
import { cacheOpen, chimeActivate, paper, shrineHum, travelSwell } from './audio';
import { LORE, LORE_KIND_DE, loreById } from './lore';
import { type MapModel, injectTravelCss, renderMap } from './map';
import { SURVEY_POINTS, TRIPOD_SEED_BASE, type SurveyPoint, announceFor, cardMayTakeE, knownPoints, mayActivate, nearestPoint, isOpenWater, pointById, travelBlock, wayLineBlocked, wayStartBlocked } from './points';
import { type QuietGate, hideWhileQuiet } from '../../core/quiet';
import { LAUF_DELAY, LAUF_RISE, laufschrittTarget } from './laufschritt';
import { CHAPTER_TIER, type Poi, cacheLoot, generatePois, poiXp } from './pois';
import { TRAVEL_DE } from './strings';
import { Trail } from './trail';
import { registerEraMaterials } from '../fx/shift/prewarm';
import { type PoiVisual, type TripodVisual, animatePoi, animateTripod, buildCache, buildLetter, buildShrine, buildTripod, cacheLidStep, disposeGroup, setCacheOpen } from './visuals';

export interface TravelSlice {
  /** Points walked up to. */
  activated: string[];
  /** Points Laub announced (known without the walk). */
  announced: string[];
  /** POIs seen (map marks). */
  seen: string[];
  /** Caches opened, Fundstücke taken. */
  done: string[];
  /** Wegstein id → play second of the last heal. */
  shrineT: Record<string, number>;
  /** One-time tips shown. */
  tips: string[];
}

declare module '../../core/state' {
  interface SystemStates {
    travel: TravelSlice;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** A survey point was eingemessen (walked up to). */
    'travel:activated': { id: string };
    /** A journey ended at a survey point. */
    'travel:arrived': { id: string; from: { x: number; z: number } };
    /** Ask the survey system to lay a historic map on the terrain (0 off). */
    'survey:show-map': { layer: 0 | 1840 | 1935 };
    /** M while a map comparison is asked for (or a layer lies on the terrain): next layer. */
    'survey:cycle-map': Record<string, never>;
    /** A route POI was used: a cache opened, a Fundstück taken, a Wegstein touched. */
    'travel:poi': { id: string; kind: 'cache' | 'lore' | 'shrine' };
  }
}

export interface TravelHooks {
  state(): TravelSlice & { inCombat: boolean; hunt: string; block: string | null; sprint: number; goal: { x: number; z: number } | null; quiet: boolean };
  points(): { id: string; name: string; x: number; z: number; known: boolean; activated: boolean }[];
  activate(id: string): void;
  /** Travel now (ignores the map; respects the rules unless `force`). Returns false if blocked. */
  go(id: string, force?: boolean): boolean;
  map(open?: boolean): boolean;
  pois(): (Poi & { state: string; built: boolean })[];
  /** Nearest POI of a kind in the current era. */
  nearest(kind?: string): (Poi & { d: number }) | null;
  /** The Wegweiser: route points and whether it shows. */
  trail(show?: boolean): { points: [number, number][]; visible: boolean };
  /** Route from the player to x/z (debug). */
  route(x: number, z: number): [number, number][];
  /** The compass "Weg" marker: bearing (deg) while the straight line is blocked, else null. */
  way(): { blocked: boolean; bearing: number | null };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    travel?: TravelHooks;
  }
}

const POI_BUILD = 190;
const POI_DROP = 230;
const GUARD_SPAWN = 48;
const GUARD_DROP = 130;
const LORE_TAKE = 1.9;
const SHRINE_R = 2.6;
const SHRINE_COOL = 120;
/** Cache guards keep clear of survey points (arrivals) and of a quest's own fight (m). */
const GUARD_CLEAR_POINT = 40;
const GUARD_CLEAR_QUEST = 40;
/** Seconds after a fast travel or a wake before any cache guards rise. */
const ARRIVAL_GRACE = 3;
const CHAPTER_ORDER = ['prolog', 'k1', 'k2', 'k3', 'k4', 'enden'];

type PoiState = 'hidden' | 'seen' | 'done';

/** Distance from x/z to a polyline, and the index of the nearest segment. */
function offPath(pts: readonly [number, number][], x: number, z: number): { d: number; seg: number } {
  let best = Infinity;
  let seg = 0;
  if (pts.length === 1) return { d: Math.hypot(x - pts[0]![0], z - pts[0]![1]), seg: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d;
      seg = i;
    }
  }
  return { d: best, seg };
}

class Travel {
  slice: TravelSlice;
  readonly root: Group = new ThreeGroup();
  private readonly tripods = new Map<string, TripodVisual>();
  private readonly poiVis = new Map<string, PoiVisual>();
  private readonly guards = new Set<string>();
  private readonly pois: Poi[];
  private inCombat = false;
  private hunt = 'calm';
  private caughtPending = false;
  private wakeAt = -1;
  /** Live quest / story spawns (not route caches): cache guards keep clear of them. */
  private readonly questSpawns = new Map<string, { x: number; z: number; era: string }>();
  private graceT = 0;
  /** A pack is out (hunt:start … hunt:end): no sprint boost. */
  private packOut = false;
  private sprintT = 0;
  private sprint = 0;
  private lastWritten = Number.NaN;
  private lastBase = 1;
  private curtain: HTMLElement | null = null;
  private journeyTimer?: ReturnType<typeof setTimeout>;
  private fadingCurtain?: { element: HTMLElement; timer: ReturnType<typeof setTimeout> };
  private goalStory: { x: number; z: number } | null = null;
  readonly trail = new Trail();
  private deepToastAt = -1e9;
  private trailFor = '';
  private bestD = Infinity;
  private stuckT = 0;
  private trailCheckT = 0;
  /** The straight line to the goal runs into a wall within 30 m (checked once a second). */
  private wayBlocked = false;
  /** Bearing of the compass "Weg" marker, null when hidden. */
  private wayMarker: number | null = null;
  private card: HTMLElement | null = null;
  private cardT = 0;
  /** The card up is the activation banner (it shares the centre-card slot: ui/cards.ts). */
  private cardBanner = false;
  private readonly pendingActivations: { name: string; first: boolean }[] = [];
  private time = 0;
  /** 'world:quiet' (the party): tripods, POIs and the trail hidden, no activation, no announcement. */
  private readonly quiet: QuietGate;

  constructor(private readonly ctx: GameContext) {
    this.slice = this.loadSlice();
    this.root.name = 'travel';
    ctx.scene.add(this.root);
    this.quiet = hideWhileQuiet(ctx.events, this.root);
    this.root.add(this.trail.mesh);
    const hf = ctx.world.heightfields['1789'];
    this.pois = generatePois(undefined, {
      blocked: (x, z) => ctx.world.collider.footprintAt(x, z) >= 0 || hf.slopeDeg(x, z) > 26 || ctx.world.surfaceAt(x, z) === 'water',
    });
  }

  loadSlice(): TravelSlice {
    const s = this.ctx.state.slice('travel', () => ({ activated: [], announced: [], seen: [], done: [], shrineT: {}, tips: [] }));
    s.seen ??= [];
    s.done ??= [];
    s.shrineT ??= {};
    s.tips ??= [];
    return s;
  }

  // ---- state and rules ----------------------------------------------------------------------

  known(): SurveyPoint[] {
    return knownPoints(this.slice.activated, this.slice.announced);
  }

  chapter(): string {
    const st = this.ctx.state.state.systems.story as { chapter?: string | null } | undefined;
    return st?.chapter ?? 'prolog';
  }

  tier(): number {
    const c = this.chapter();
    return (CHAPTER_TIER as Record<string, number>)[c] ?? 1;
  }

  private storyThreat(): boolean {
    const st = this.ctx.state.state.systems.story as { threats?: Record<string, { active?: boolean }>; meters?: Record<string, { done?: boolean }> } | undefined;
    if (st?.threats && Object.values(st.threats).some((t) => t?.active)) return true;
    if (st?.meters && Object.entries(st.meters).some(([id, m]) => id !== 'oil' && m && !m.done)) return true;
    return false;
  }

  blockReason(): string | null {
    const ctx = this.ctx;
    const b = travelBlock({
      era: ctx.era.current,
      inCombat: this.inCombat,
      hunt: this.hunt,
      threat: this.storyThreat(),
      locked: ctx.state.state.flags['travel.locked'] === true,
      busy: this.caughtPending || this.curtain !== null || ctx.post.uniforms.uShift!.value > 0.02 || ctx.player.frozen,
      flying: ctx.player.flying,
    });
    return b ? (TRAVEL_DE.block[b] ?? TRAVEL_DE.block.busy!) : null;
  }

  // ---- the goal (story objective, else the tracked quest's) ---------------------------------

  private questDefs: Map<string, QuestDef> | null = null;

  /** The tracked quest's first open objective with a place in this era (as the quests' compass). */
  private questGoal(): { x: number; z: number } | null {
    const ctx = this.ctx;
    const qs = ctx.state.state.systems.quests as QuestSlice | undefined;
    if (!qs?.tracked?.length) return null;
    this.questDefs ??= questsInPlay(loadBundledQuests(), ctx.params.has('storytest')).quests;
    const era = ctx.era.current;
    for (const id of qs.tracked) {
      const q = this.questDefs.get(id);
      const prog = qs.quests[id];
      if (!q || prog?.state !== 'active') continue;
      const done = (o: QuestObjective) => (prog.counts[o.id] ?? 0) >= Math.max(1, Math.round((o.type === 'survive' ? (o.seconds ?? o.count) : o.count) ?? 1));
      for (const o of q.objectives) {
        if (o.noMarker || done(o)) continue;
        if (!(o.after ?? []).every((a) => {
          const pre = q.objectives.find((x) => x.id === a);
          return !pre || done(pre);
        })) continue;
        const at = o.type === 'escort' && o.to ? o.to : (o.where ?? o.place?.[0] ?? o.to);
        if (at && (!at.era || at.era === era) && !at.room) return { x: at.x, z: at.z };
      }
    }
    return null;
  }

  currentGoal(): { x: number; z: number } | null {
    const st = this.ctx.state.state.systems.story as { objective?: { x?: number; z?: number; text?: string | null } | null } | undefined;
    const o = st?.objective;
    if (o && typeof o.x === 'number' && typeof o.z === 'number' && o.text) return { x: o.x, z: o.z };
    return this.goalStory ?? this.questGoal();
  }

  // ---- survey points -----------------------------------------------------------------------

  activate(id: string, quiet = false): void {
    const p = pointById(id);
    if (!p || this.slice.activated.includes(id)) return;
    this.slice.activated.push(id);
    const t = this.tripods.get(id);
    if (t) {
      t.lit = 1;
      if (!quiet) t.burst = 0;
    }
    if (quiet) return;
    const ctx = this.ctx;
    chimeActivate(ctx.audio);
    // the first one says what the map is for, on the banner itself (a toast would sit under it)
    const first = !this.slice.tips.includes('map');
    if (first) this.slice.tips.push('map');
    if (this.quiet.photoOpen || this.pendingActivations.length) this.pendingActivations.push({ name: p.name, first });
    else this.showActivation(p.name, first);
    ctx.events.emit('travel:activated', { id });
    ctx.save.autosave('travel');
  }

  private syncTripods(): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const known = new Set(this.known().map((k) => k.id));
    for (const sp of SURVEY_POINTS) {
      const d = Math.hypot(p.x - sp.x, p.z - sp.z);
      let t = this.tripods.get(sp.id);
      // a found point's beam is a landmark: keep it within 1.4 km
      const range = known.has(sp.id) ? 1400 : 260;
      if (!t && d < range) {
        const y = ctx.world.heightfields[ctx.era.current === 'today' ? '2025' : '1789'].heightAt(sp.x, sp.z);
        t = buildTripod(sp.x, y - 0.03, sp.z, SURVEY_POINTS.indexOf(sp) + TRIPOD_SEED_BASE);
        t.lit = known.has(sp.id) ? 1 : 0;
        this.tripods.set(sp.id, t);
        this.root.add(t.group);
      } else if (t && d > range + 120) {
        disposeGroup(t.group);
        this.tripods.delete(sp.id);
        continue;
      }
      if (t) t.lit = known.has(sp.id) ? 1 : t.lit;
      if (mayActivate(sp, d, this.slice.activated, { flying: ctx.player.flying, quiet: this.quiet.quiet })) this.activate(sp.id);
    }
  }

  private dropAllVisuals(): void {
    for (const t of this.tripods.values()) disposeGroup(t.group);
    this.tripods.clear();
    for (const v of this.poiVis.values()) disposeGroup(v.group);
    this.poiVis.clear();
  }

  // ---- journeys ------------------------------------------------------------------------------

  private removeFadingCurtain(): void {
    if (!this.fadingCurtain) return;
    clearTimeout(this.fadingCurtain.timer);
    this.fadingCurtain.element.remove();
    this.fadingCurtain = undefined;
  }

  private endJourney(fade = false): void {
    this.removeFadingCurtain();
    const curtain = this.curtain;
    if (!curtain) return;
    clearTimeout(this.journeyTimer);
    this.journeyTimer = undefined;
    this.curtain = null;
    if (fade) {
      curtain.classList.remove('on');
      this.fadingCurtain = { element: curtain, timer: setTimeout(() => this.removeFadingCurtain(), 500) };
    } else curtain.remove();
    this.ctx.pause.pop('travel');
  }

  go(id: string, { force = false, fromMap = false } = {}): boolean {
    const ctx = this.ctx;
    const p = pointById(id);
    if (!p) return false;
    if (!force && (this.blockReason() || !this.known().some((k) => k.id === id))) return false;
    this.endJourney();
    if (fromMap) ctx.ui.modals.closeAll();
    else this.closeMap();
    const from = { x: ctx.player.position.x, z: ctx.player.position.z };
    const curtain = document.createElement('div');
    this.curtain = curtain;
    curtain.className = 'kqt-travel-curtain';
    curtain.dataset.testid = 'travel-curtain';
    const cross = document.createElement('div');
    cross.className = 'kqt-cross';
    const to = document.createElement('div');
    to.className = 'kqt-to';
    to.textContent = TRAVEL_DE.travelTo(p.name);
    const sub = document.createElement('div');
    sub.className = 'kqt-sub';
    sub.textContent = TRAVEL_DE.travelSub;
    curtain.append(cross, to, sub);
    document.body.append(curtain);
    travelSwell(ctx.audio);
    ctx.pause.push('travel');
    const reduced = ctx.settings.state.reducedMotion;
    requestAnimationFrame(() => curtain.classList.add('on'));
    const arrive = (): void => {
      // stand beside the tripod, facing the goal (or away from the tripod)
      const goal = this.currentGoal();
      const ox = p.x + 2.2;
      const oz = p.z + 2.2;
      const tx = goal ? goal.x - ox : ox - p.x;
      const tz = goal ? goal.z - oz : oz - p.z;
      const heading = Math.atan2(tx, -tz);
      ctx.player.setStance('stand');
      ctx.player.teleport(ox, oz, -heading);
      ctx.player.pitch = 0;
      ctx.world.forest.invalidate();
      ctx.quality.hold(2);
      ctx.events.emit('travel:arrived', { id, from });
      if (this.curtain !== curtain) return;
      this.trail.clear();
      this.trailFor = '';
      this.bestD = Infinity;
      // The paused game loop has not copied the arrival pose into the store yet.
      ctx.player.writeState(ctx.state.mutable.player);
      ctx.save.autosave('travel', true);
    };
    if (skipRealTimeWaits(ctx.loop.manual, ctx.params)) {
      // deterministic tests and bullet time (also switched on at runtime, playtest round 10): no
      // real-time wait while the game stands still
      arrive();
      if (this.curtain === curtain) this.endJourney();
      return true;
    }
    this.journeyTimer = setTimeout(() => {
      arrive();
      if (this.curtain === curtain) this.journeyTimer = setTimeout(() => this.endJourney(true), reduced ? 250 : 650);
    }, reduced ? 450 : 1100);
    return true;
  }

  // ---- the map -------------------------------------------------------------------------------

  model(): MapModel {
    const ctx = this.ctx;
    const known = this.known();
    const knownIds = new Set(known.map((k) => k.id));
    const gate = gateFrom(ctx.state.state, ctx.params);
    const layers: MapModel['layers'] = [];
    const cur = (window.kq?.survey?.state().map ?? 0) as MapLayer;
    if (nextMap(0, gate) !== null) {
      layers.push({ id: 0, label: TRAVEL_DE.layerOff, on: cur === 0 });
      layers.push({ id: 1840, label: TRAVEL_DE.layer1840, on: cur === 1840 });
      if (nextMap(1840, gate) === 1935) layers.push({ id: 1935, label: TRAVEL_DE.layer1935, on: cur === 1935 });
    }
    const seen = new Set(this.slice.seen);
    const done = new Set(this.slice.done);
    return {
      known,
      unknown: SURVEY_POINTS.filter((p) => !knownIds.has(p.id)),
      pois: this.pois.filter((p) => seen.has(p.id) || done.has(p.id)).map((p) => ({ ...p, state: done.has(p.id) ? ('done' as const) : ('seen' as const) })),
      player: { x: ctx.player.position.x, z: ctx.player.position.z, yaw: -ctx.player.yaw },
      goal: this.currentGoal(),
      block: this.blockReason(),
      layers,
    };
  }

  openMap(): void {
    if (this.ctx.ui.modals.count === 0) openPausePage(this.ctx.ui.modals, 'karte');
  }

  closeMap(): void {
    pausePageHandle('karte')?.close();
  }

  registerPages(): void {
    const ctx = this.ctx;
    let cleanup: (() => void) | undefined;
    addPausePage({
      id: 'karte', label: TRAVEL_DE.mapLabel, title: TRAVEL_DE.mapTitle, className: 'kqt-map-modal', order: 60,
      render: (el) => {
        el.dataset.testid = 'travel-map';
        cleanup = renderMap(ctx, el, () => this.model(), {
          travel: (id) => this.go(id, { fromMap: true }),
          layer: (id) => ctx.events.emit('survey:show-map', { layer: id }),
        });
      },
      hide: () => {
        cleanup?.();
        cleanup = undefined;
      },
    });
    addPageSection({ id: 'funde', page: 'sets', order: 20, render: () => this.renderFunde() });
  }

  // ---- POIs ----------------------------------------------------------------------------------

  poiState(p: Poi): PoiState {
    if (this.slice.done.includes(p.id)) return 'done';
    if (this.slice.seen.includes(p.id)) return 'seen';
    return 'hidden';
  }

  private hasWeapon(): boolean {
    const pr = this.ctx.state.state.systems.progression as { equipped?: { weapon?: string | null } } | undefined;
    return !!pr?.equipped?.weapon;
  }

  private syncPois(dt: number): void {
    const ctx = this.ctx;
    const era = ctx.era.current;
    const p = ctx.player.position;
    const armed = this.hasWeapon();
    const chapter = this.chapter();
    this.graceT = Math.max(0, this.graceT - dt);
    for (const poi of this.pois) {
      // a route belongs to its chapter: an unopened cache of another chapter is not there (a K2
      // Irrlicht cache ambushed K1's walk in today); found things and Wegsteine stay once passed
      const ci = CHAPTER_ORDER.indexOf(chapter);
      const pi = CHAPTER_ORDER.indexOf(poi.chapter);
      const ofChapter = poi.kind === 'cache' ? pi === ci : pi <= ci;
      const here = poi.era === era && ofChapter;
      const d = Math.hypot(p.x - poi.x, p.z - poi.z);
      let v = this.poiVis.get(poi.id);
      const done = this.slice.done.includes(poi.id);
      // a cache is only there for someone who can fight for it
      const present = here && (poi.kind !== 'cache' || armed || done) && !(poi.kind === 'lore' && done);
      if (v && (!present || d > POI_DROP)) {
        disposeGroup(v.group);
        this.poiVis.delete(poi.id);
        v = undefined;
      }
      if (!v && present && d < POI_BUILD) {
        const y = ctx.world.heightAt(poi.x, poi.z);
        const yaw = Math.atan2(p.x - poi.x, p.z - poi.z);
        const seed = Math.abs(Math.round(poi.x * 7 + poi.z * 13));
        if (poi.kind === 'cache') v = buildCache(poi.x, y, poi.z, yaw, era, seed, done);
        else if (poi.kind === 'shrine') v = buildShrine(poi.x, y, poi.z, yaw, seed);
        else v = buildLetter(poi.x, y, poi.z, loreById(poi.lore ?? '')?.kind ?? 'brief', era, seed);
        this.root.add(v.group);
        this.poiVis.set(poi.id, v);
      }
      if (!v) {
        if (this.guards.has(poi.id) && d > GUARD_DROP) this.despawnGuards(poi);
        continue;
      }
      if (d < 45 && !this.slice.seen.includes(poi.id)) this.slice.seen.push(poi.id);
      if (poi.kind === 'cache' && !done) {
        // a set piece (a pack out: the par force hunt, the stand, a patrol) owns the night: no
        // cache guards rise into it, and those already up go back into the fog
        if (!this.guards.has(poi.id) && d < GUARD_SPAWN && armed && !this.packOut && this.guardsMayRise(poi)) this.spawnGuards(poi);
        if (this.guards.has(poi.id) && (d > GUARD_DROP || this.packOut)) this.despawnGuards(poi);
      } else if (poi.kind === 'lore' && !done && d < LORE_TAKE && !ctx.player.flying) {
        this.takeLore(poi, v);
      } else if (poi.kind === 'shrine' && d < SHRINE_R && !this.inCombat) {
        this.touchShrine(poi, v);
      }
      if (poi.kind === 'cache' && done && v.open < 1) setCacheOpen(v, cacheLidStep(v.open, dt, ctx.settings.state.reducedMotion));
    }
  }

  /** No ambush at an arrival point, on a fresh arrival, or stacked onto a quest's own fight. */
  private guardsMayRise(poi: Poi): boolean {
    if (this.graceT > 0) return false;
    if (SURVEY_POINTS.some((sp) => Math.hypot(sp.x - poi.x, sp.z - poi.z) < GUARD_CLEAR_POINT)) return false;
    for (const q of this.questSpawns.values()) {
      if (q.era === poi.era && Math.hypot(q.x - poi.x, q.z - poi.z) < GUARD_CLEAR_QUEST) return false;
    }
    return true;
  }

  private spawnGuards(poi: Poi): void {
    this.guards.add(poi.id);
    this.ctx.events.emit('enemy:spawn', {
      group: poi.id,
      kind: poi.enemy ?? 'nebelling',
      x: poi.x,
      z: poi.z,
      era: poi.era as Era,
      count: poi.count ?? 2,
      radius: 4.5,
      tier: this.tier(),
      leash: 30,
    });
  }

  private despawnGuards(poi: Poi): void {
    this.guards.delete(poi.id);
    this.ctx.events.emit('enemy:despawn', { group: poi.id });
  }

  private openCache(poi: Poi): void {
    if (this.slice.done.includes(poi.id)) return;
    const ctx = this.ctx;
    // Loot placement and XP handlers can autosave. Hold through the combat sync on travel:poi.
    const hold = `travel:cache:${poi.id}`;
    ctx.save.hold(hold, true);
    try {
      this.slice.done.push(poi.id);
      this.guards.delete(poi.id);
      const items = cacheLoot(poi.id);
      items.forEach((item, i) => {
        const a = (i / items.length) * Math.PI * 2 + 0.6;
        ctx.events.emit('loot:place', { id: `${poi.id}.${i}`, item, x: poi.x + Math.cos(a) * 1.3, z: poi.z + Math.sin(a) * 1.3, era: poi.era as Era });
      });
      ctx.events.emit('xp:grant', { amount: poiXp('cache', this.tier()), reason: 'poi', x: poi.x, z: poi.z });
      ctx.events.emit('travel:poi', { id: poi.id, kind: 'cache' });
      ctx.save.autosave('poi', true);
    } finally {
      ctx.save.hold(hold, false);
    }
    cacheOpen(ctx.audio);
    ctx.ui.toast(TRAVEL_DE.cacheOpen, 2400);
  }

  private takeLore(poi: Poi, v: PoiVisual): void {
    const ctx = this.ctx;
    const l = loreById(poi.lore ?? '');
    this.slice.done.push(poi.id);
    paper(ctx.audio);
    if (l) this.showCard(l.title, l.text, `${LORE_KIND_DE[l.kind]} · ${l.from}`, 12, 'travel-card-lore');
    ctx.events.emit('xp:grant', { amount: poiXp('lore', this.tier()), reason: 'lore', x: poi.x, z: poi.z });
    ctx.events.emit('travel:poi', { id: poi.id, kind: 'lore' });
    disposeGroup(v.group);
    this.poiVis.delete(poi.id);
    ctx.save.autosave('lore');
  }

  private touchShrine(poi: Poi, v: PoiVisual): void {
    const ctx = this.ctx;
    const now = ctx.state.state.meta.playSeconds;
    const last = this.slice.shrineT[poi.id];
    if (last !== undefined && now - last < SHRINE_COOL) return;
    const combat = window.kq?.combat;
    const st = combat?.state() as { hp?: number; max?: number } | undefined;
    if (st && typeof st.hp === 'number' && typeof st.max === 'number' && st.hp >= st.max) return;
    this.slice.shrineT[poi.id] = now;
    combat?.heal();
    ctx.events.emit('lantern:request', { lit: ctx.player.stats.lanternLit, refill: true });
    shrineHum(ctx.audio);
    v.pulse = 1;
    ctx.ui.toast(TRAVEL_DE.shrine, 2600);
    ctx.events.emit('travel:poi', { id: poi.id, kind: 'shrine' });
  }

  // ---- the found-card (activation, Fundstück) ---------------------------------------------------

  private showActivation(name: string, first: boolean): void {
    this.showCard(TRAVEL_DE.activated(name), first ? TRAVEL_DE.firstMap : TRAVEL_DE.activatedSub, null, first ? 6 : 4.5, 'travel-card-activated');
  }

  showCard(title: string, text: string, from: string | null, seconds: number, testid: string): void {
    this.hideCard();
    const c = document.createElement('div');
    c.className = testid === 'travel-card-lore' ? 'kqt-card' : 'kqt-card kqt-banner';
    c.dataset.testid = testid;
    const h = document.createElement('h3');
    h.textContent = title;
    c.append(h);
    if (from) {
      const f = document.createElement('p');
      f.className = 'kqt-from';
      f.textContent = from;
      c.append(f);
    }
    const p = document.createElement('p');
    p.textContent = text;
    c.append(p);
    if (testid === 'travel-card-lore') {
      const tag = document.createElement('span');
      tag.className = 'kqt-tag';
      tag.textContent = TRAVEL_DE.fundTag;
      c.append(tag);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'kqt-card-dismiss';
    close.setAttribute('aria-label', this.ctx.t('modal.close'));
    close.onclick = () => this.hideCard();
    c.append(close);
    this.ctx.ui.add(c);
    this.card = c;
    this.cardT = seconds;
    this.cardBanner = testid !== 'travel-card-lore';
    if (this.cardBanner) c.classList.toggle('kqt-aside', this.bannerAside());
  }

  hideCard(): void {
    this.card?.remove();
    this.card = null;
    if (this.cardBanner) this.ctx.ui.cards.release(BANNER_TOKEN);
    this.cardBanner = false;
  }

  /**
   * M-18 (docs/MOBILE-UI-PASS.md): the activation banner never stacks on another centre card (the
   * skill card, a level or reward card, a field-book page). It takes the slot when it is free, so a
   * card that comes later waits for it; while another card holds the slot, the banner waits (or
   * steps aside) and its clock stops. A spoken line or a fight does not keep it back: it is short.
   * On a landscape phone it shares the top band with the dialogue card, so there it waits while a
   * line is up (touch.css places it).
   */
  private bannerAside(): boolean {
    const cards = this.ctx.ui.cards;
    if (phoneBand() && document.querySelector('.kqs-dlg.kqs-show')) return true;
    if (cards.claim(BANNER_TOKEN)) return false;
    return cards.showing !== null;
  }

  // ---- Laufschritt -------------------------------------------------------------------------------

  private sprintBoost(dt: number): void {
    const ctx = this.ctx;
    const pl = ctx.player;
    // combat writes moveScale every step; without it we must not compound our own factor
    const base = pl.moveScale === this.lastWritten ? this.lastBase : pl.moveScale;
    const inp = ctx.input;
    const moving = inp.isDown('forward') || inp.isDown('left') || inp.isDown('right') || inp.isDown('back');
    // the long-walk boost is for empty walks outdoors: never while a pack is out (the par force
    // hunt, the stand and the patrols are tuned to the plain sprint), never in the palace rooms
    const indoors = !!ctx.state.state.flags['interior.room'];
    const free = !this.inCombat && !this.packOut && !indoors && this.hunt !== 'chasing' && this.hunt !== 'searching' && !pl.flying && pl.stance === 'stand' && pl.canSprint;
    if (free) {
      if (moving && inp.isDown('sprint')) this.sprintT = Math.min(LAUF_DELAY + LAUF_RISE, this.sprintT + dt);
      else this.sprintT = Math.max(0, this.sprintT - dt * 4);
      const target = laufschrittTarget(this.sprintT);
      this.sprint += (target - this.sprint) * Math.min(1, dt * 3);
    } else {
      this.sprintT = 0;
      this.sprint = 0;
    }
    if (this.sprint < 0.002) this.sprint = 0;
    if (this.sprint > 0.3 && !this.slice.tips.includes('sprint')) {
      this.slice.tips.push('sprint');
      ctx.ui.toast(inp.touchMode ? TRAVEL_DE.sprintTouch : TRAVEL_DE.sprint, 4200);
    }
    this.lastBase = base;
    this.lastWritten = base * (1 + this.sprint);
    pl.moveScale = this.lastWritten;
  }

  // ---- the Wegweiser -------------------------------------------------------------------------

  private wallAt = (x: number, z: number, radius: number): boolean => {
    const ctx = this.ctx;
    const c = ctx.world.collider;
    // the interiors' walls are height-aware (tested at the player's feet): probe each point at
    // the ground-floor height there, so a door with a step up (the Durchfahrten) reads open
    // wherever the player stands.
    const pl = ctx.player.position;
    const feet = pl.y;
    if (c.overlay) pl.y = ctx.world.heightAt(x, z, ctx.world.heightfield.heightAt(x, z) + 0.6);
    const hit = c.resolve(x, z, radius).hit;
    pl.y = feet;
    return hit;
  };

  private waterAt = (x: number, z: number): boolean => isOpenWater(this.ctx.world.surfaceAt(x, z), this.ctx.world.water.isFrozen);
  private blockedAt = (x: number, z: number): boolean => this.wallAt(x, z, 0.38) || this.waterAt(x, z);
  // the player's own spot and first step: walls at the walking radius, water past wading depth
  // (the same depth rule as the player's movement, boot.ts)
  private startBlockedAt = wayStartBlocked(
    this.wallAt,
    (x, z) => (this.ctx.world.surfaceOverride?.(x, z) ? -Infinity : this.ctx.world.water.depthInside(x, z)),
    PLAYER_RADIUS,
    WADE_LIMIT_M,
  );
  private pathCost = pathGroundCost((x, z) => this.ctx.world.pathAt(x, z));

  routeTo(x: number, z: number): [number, number][] {
    const p = this.ctx.player.position;
    // near goals (palace courts, doors) on a 1 m grid — a 2 m grid misses a door's free gap
    const near = Math.hypot(x - p.x, z - p.z) < 170;
    // in the present day the route prefers the OSM paths (the Waldweg round the Weiher); the
    // search only runs when the straight line is blocked, ~10 ms there (tests/travel.test.ts)
    const ground = this.ctx.era.info.palace === 'hidden' ? { cost: this.pathCost, minCost: PATH_COST } : {};
    const grid = near ? { cell: 1, margin: 45, maxExpand: 90000 } : { maxExpand: 40000 };
    return findRoute(p.x, p.z, x, z, this.blockedAt, { ...grid, ...ground, startBlocked: this.startBlockedAt }).points;
  }

  private updateTrail(dt: number): void {
    const ctx = this.ctx;
    const goal = this.currentGoal();
    const p = ctx.player.position;
    if (!goal || ctx.player.flying) {
      this.trail.visibleFor = 0;
      this.wayBlocked = false;
      this.setWayMarker(null);
      return;
    }
    const key = `${Math.round(goal.x)},${Math.round(goal.z)},${ctx.era.current}`;
    const d = Math.hypot(goal.x - p.x, goal.z - p.z);
    if (d < 12) {
      this.trail.visibleFor = Math.min(this.trail.visibleFor, 0.5);
      this.wayBlocked = false;
      this.setWayMarker(null);
      return;
    }
    let want = false;
    if (key !== this.trailFor) {
      // a new goal: show the way for a while
      this.trailFor = key;
      this.bestD = d;
      this.stuckT = 0;
      want = true;
      this.trail.visibleFor = 14;
    }
    if (d < this.bestD - 4) {
      this.bestD = d;
      this.stuckT = 0;
    } else this.stuckT += dt;
    // lost: no progress for 12 s (not while fighting or talking)
    if (this.stuckT > 12 && !this.inCombat && ctx.ui.modals.count === 0) {
      this.stuckT = 0;
      want = true;
      this.trail.visibleFor = 12;
    }
    // the straight line runs into a wall close ahead: show the way round
    this.trailCheckT -= dt;
    if (this.trailCheckT <= 0) {
      this.trailCheckT = 1;
      const ax = p.x + ((goal.x - p.x) / d) * Math.min(d, 30);
      const az = p.z + ((goal.z - p.z) / d) * Math.min(d, 30);
      this.wayBlocked = wayLineBlocked(ctx.era.info.palace === 'hidden', p, { x: ax, z: az }, this.blockedAt, this.waterAt);
      if (this.wayBlocked) {
        want = true;
        this.trail.visibleFor = Math.max(this.trail.visibleFor, 6);
      }
    }
    // re-plan when asked, while the motes show (they flow from the path's start, so keep it near
    // the player), or when the compass marker's way has been left (off it by > 5 m)
    const pts = this.trail.points;
    const moved = pts.length > 0 && Math.hypot(pts[0]![0] - p.x, pts[0]![1] - p.z) > 6;
    if (want || (pts.length && ((this.trail.visibleFor > 0 && moved) || (this.wayBlocked && offPath(pts, p.x, p.z).d > 5)))) {
      this.trail.setPath(this.routeTo(goal.x, goal.z));
    }
    this.setWayMarker(this.wayBlocked ? this.nextTurn() : null);
  }

  /** The first bend of the Wegweiser's route that lies more than 4 m ahead (null: none). */
  private nextTurn(): [number, number] | null {
    const p = this.ctx.player.position;
    const pts = this.trail.points;
    // from the segment the player is on, the next bend more than 4 m away (never one behind)
    const from = pts.length > 1 ? offPath(pts, p.x, p.z).seg + 1 : 1;
    for (let i = from; i < pts.length; i++) if (Math.hypot(pts[i]![0] - p.x, pts[i]![1] - p.z) > 4) return pts[i]!;
    return null;
  }

  /**
   * The compass's "Weg" marker (chalk blue, beside the gold objective marker): while the straight
   * line to the goal runs into a wall it points at the route's next bend — round the wing, to the
   * door or the gate — so the compass never sends you into a corner (playtest round 2).
   */
  private setWayMarker(at: [number, number] | null): void {
    const hud = this.ctx.ui.hud;
    if (!at) {
      if (this.wayMarker) hud.setMarker('wegweiser', null);
      this.wayMarker = null;
      return;
    }
    const p = this.ctx.player.position;
    const b = ((Math.atan2(at[0] - p.x, -(at[1] - p.z)) * 180) / Math.PI + 360) % 360;
    if (this.wayMarker !== null && Math.abs(((b - this.wayMarker + 540) % 360) - 180) < 0.5) return;
    this.wayMarker = b;
    hud.setMarker('wegweiser', b, '#8fd0ff');
  }

  // ---- after being caught ---------------------------------------------------------------------

  private wakeHint(): void {
    const ctx = this.ctx;
    const goal = this.currentGoal();
    if (!goal) return;
    const p = ctx.player.position;
    const dWake = Math.hypot(goal.x - p.x, goal.z - p.z);
    const near = nearestPoint(goal.x, goal.z, this.known());
    if (!near || dWake < 220 || near.d > dWake - 150) return;
    ctx.ui.toast(TRAVEL_DE.wakeHint(near.point.name), 6500);
  }

  // ---- per step ------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    this.time += dt;
    // deep water holds the player back at the wading line: say why, now and then
    const ps = ctx.player.stats;
    if (ps.deepWater) {
      ps.deepWater = false;
      if (this.time - this.deepToastAt > 10) {
        this.deepToastAt = this.time;
        ctx.ui.toast(TRAVEL_DE.deepWater, 3200);
      }
    }
    if (ctx.input.wasPressed('map') && ctx.ui.modals.count === 0) {
      // the prologue's map comparison (story flag `map.compare`) and a layer already on the
      // terrain keep M as the overlay key (off → 1840 → 1935 → off); otherwise M opens the map page
      if (ctx.state.state.flags['map.compare'] === true || ctx.world.mapMix > 0) ctx.events.emit('survey:cycle-map', {});
      else this.openMap();
    }
    this.syncTripods();
    this.syncPois(dt);
    this.sprintBoost(dt);
    this.updateTrail(dt);
    // Laub announces the point beside a far goal
    const ann = announceFor(this.currentGoal(), ctx.player.position, [...this.slice.activated, ...this.slice.announced]);
    if (ann && !this.caughtPending && !this.quiet.quiet) {
      this.slice.announced.push(ann.id);
      ctx.events.emit('dialogue:say', { speaker: 'laub', text: TRAVEL_DE.announced(ann.name), priority: 'low' });
    }
    if (this.wakeAt >= 0) {
      this.wakeAt -= dt;
      if (this.wakeAt < 0) this.wakeHint();
    }
    if (this.quiet.photoOpen) return;
    if (this.card) {
      const aside = this.cardBanner && this.bannerAside();
      this.card.classList.toggle('kqt-aside', aside);
      if (aside) return;
      this.cardT -= dt;
      if (this.cardT <= 0 || (ctx.input.wasPressed('listen') && this.cardT < 11 && cardMayTakeE(ctx.state.state.flags))) this.hideCard();
    }
    if (!this.card) {
      const next = this.pendingActivations.shift();
      if (next) this.showActivation(next.name, next.first);
    }
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    const rf = ctx.settings.state.reducedFlash;
    const rm = ctx.settings.state.reducedMotion;
    const t = performance.now() / 1000;
    const cam = ctx.camera.position;
    for (const tp of this.tripods.values()) animateTripod(tp, dt, t, rf, Math.hypot(cam.x - tp.group.position.x, cam.z - tp.group.position.z), rm);
    for (const v of this.poiVis.values()) animatePoi(v, dt, t, rm, Math.hypot(cam.x - v.group.position.x, cam.z - v.group.position.z), rf);
    this.trail.frame(dt, (x, z) => ctx.world.heightAt(x, z), rm);
  }

  // ---- events -------------------------------------------------------------------------------

  wire(): void {
    const ctx = this.ctx;
    const ev = ctx.events;
    ev.on('combat:state', ({ inCombat }) => {
      this.inCombat = inCombat;
    });
    ev.on('hunt:alert', ({ state }) => {
      this.hunt = state;
    });
    ev.on('hunt:start', () => {
      this.packOut = true;
    });
    ev.on('hunt:end', () => {
      this.packOut = false;
    });
    ev.on('player:caught', () => {
      this.caughtPending = true;
      this.closeMap();
      for (const id of [...this.guards]) {
        const poi = this.pois.find((p) => p.id === id);
        if (poi) this.despawnGuards(poi);
      }
    });
    ev.on('enemy:spawn', ({ group, x, z, era }) => {
      if (group.startsWith('poi.')) return;
      this.questSpawns.set(group, { x, z, era: era ?? this.ctx.era.current });
    });
    ev.on('enemy:despawn', ({ group }) => {
      if (group === '*') this.questSpawns.clear();
      else this.questSpawns.delete(group);
    });
    ev.on('enemy:cleared', ({ group }) => {
      this.questSpawns.delete(group);
    });
    ev.on('player:teleport', () => {
      this.graceT = ARRIVAL_GRACE;
      if (!this.caughtPending) return;
      this.caughtPending = false;
      this.wakeAt = 1.5;
    });
    ev.on('enemy:cleared', ({ group }) => {
      const poi = this.pois.find((p) => p.id === group);
      if (poi && poi.kind === 'cache') this.openCache(poi);
    });
    ev.on('objective:set', ({ x, z }) => {
      this.goalStory = typeof x === 'number' && typeof z === 'number' ? { x, z } : null;
    });
    ev.on('era:change', () => {
      this.wayBlocked = false;
      this.setWayMarker(null);
      this.dropAllVisuals();
      this.guards.clear();
      this.trailFor = '';
      this.trail.clear();
    });
    const reload = (): void => {
      this.endJourney();
      this.slice = this.loadSlice();
      this.pendingActivations.length = 0;
      this.hideCard();
      this.dropAllVisuals();
      this.guards.clear();
      this.trail.clear();
      this.trailFor = '';
    };
    ev.on('game:title', () => this.endJourney());
    ev.on('game:start', reload);
    ev.on('save:loaded', reload);
    ctx.state.subscribe((_s, reason) => {
      if (reason === 'new' || reason === 'replace') reload();
    });
  }

  hooks(): TravelHooks {
    const ctx = this.ctx;
    return {
      state: () => ({ ...structuredClone(this.slice), inCombat: this.inCombat, hunt: this.hunt, block: this.blockReason(), sprint: this.sprint, goal: this.currentGoal(), quiet: this.quiet.quiet }),
      points: () => {
        const known = new Set(this.known().map((k) => k.id));
        return SURVEY_POINTS.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, known: known.has(p.id), activated: this.slice.activated.includes(p.id) }));
      },
      activate: (id) => this.activate(id),
      go: (id, force) => this.go(id, { force }),
      map: (open = true) => {
        if (open) this.openMap();
        else this.closeMap();
        return !!pausePageHandle('karte');
      },
      pois: () => this.pois.map((p) => ({ ...p, state: this.poiState(p), built: this.poiVis.has(p.id) })),
      nearest: (kind) => {
        const p = ctx.player.position;
        let best: (Poi & { d: number }) | null = null;
        for (const poi of this.pois) {
          if (poi.era !== ctx.era.current || (kind && poi.kind !== kind)) continue;
          const d = Math.hypot(poi.x - p.x, poi.z - p.z);
          if (!best || d < best.d) best = { ...poi, d };
        }
        return best;
      },
      trail: (show) => {
        if (show) {
          const g = this.currentGoal();
          if (g) {
            this.trail.setPath(this.routeTo(g.x, g.z));
            this.trail.visibleFor = 20;
          }
        }
        return { points: [...this.trail.points], visible: this.trail.mesh.visible || this.trail.visibleFor > 0 };
      },
      route: (x, z) => this.routeTo(x, z),
      way: () => ({ blocked: this.wayBlocked, bearing: this.wayMarker }),
    };
  }

  private renderFunde(): HTMLElement {
    const done = new Set(this.slice.done);
    const placed = new Set<string>();
    const read = new Set<string>();
    for (const poi of this.pois) {
      if (!poi.lore) continue;
      placed.add(poi.lore);
      if (done.has(poi.id)) read.add(poi.lore);
    }
    const found = LORE.filter((lore) => read.has(lore.id));
    return h('section', { 'aria-labelledby': 'funde-heading', 'data-testid': 'collection-finds' }, [
      h('h4#funde-heading', TRAVEL_DE.fundLabel),
      h('p', found.length ? TRAVEL_DE.fundCount(found.length, placed.size) : TRAVEL_DE.fundEmpty),
      found.length ? h('ul.kqt-fund-list', found.map((lore) => h('li', [
        h('b', lore.title),
        h('i', `${LORE_KIND_DE[lore.kind]} · ${lore.from} · ${TRAVEL_DE.fundTag}`),
        h('p', lore.text),
      ]))) : null,
    ]);
  }

  dispose(): void {
    this.endJourney();
    this.quiet.dispose();
    this.closeMap();
    this.hideCard();
    this.dropAllVisuals();
    this.trail.dispose();
    this.root.removeFromParent();
  }
}

/** The activation banner's token on the centre-card slot (ui/cards.ts). */
const BANNER_TOKEN = 'travel:banner';
/** A landscape phone in touch mode: the banner lives in the top band (touch.css, max-height 500px). */
const phoneBand = (): boolean =>
  typeof matchMedia === 'function' && document.documentElement.hasAttribute('data-kq-touch') && matchMedia('(max-height: 500px)').matches;

let travel: Travel | null = null;
let hooks: TravelHooks | null = null;

export default defineSystem({
  id: 'travel',
  after: ['combat', 'quests', 'story', 'scenery'],
  init(ctx) {
    injectTravelCss();
    travel = new Travel(ctx);
    registerEraMaterials('travel.poi', '*', () => [buildTripod(0, 0, 0, TRIPOD_SEED_BASE).group, buildShrine(0, 0, 0, 0, 1).group]);
    travel.wire();
    hooks = travel.hooks();
    travel.registerPages();
  },
  update(dt, ctx) {
    if (hooks && window.kq && window.kq.travel !== hooks) window.kq.travel = hooks;
    travel?.update(dt);
    void ctx;
  },
  frame(dt) {
    if (hooks && window.kq && window.kq.travel !== hooks) window.kq.travel = hooks;
    travel?.frame(dt);
  },
  dispose() {
    travel?.dispose();
    travel = null;
  },
});
