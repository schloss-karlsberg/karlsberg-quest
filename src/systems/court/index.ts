/**
 * Feature "court" — "Unauffällig" (docs/IDEAS-ROUND11.md §2.6–2.10): in 1789 the court lets no
 * strangers in. Watchers (placed NPCs with a `watch` block) see tells inside court zones, their
 * suspicion rises (./logic.ts), at 1.0 the player is escorted out — losing nothing. A Gardist
 * flagged `inspector` checks the letter at the gate (Musterung); a pass opens the gate.
 *
 * ── API for content ────────────────────────────────────────────────────────────────────────────
 * Watchers: story `{do:'npc', op:'spawn', npc, x, z, era:'1789', yaw, watch:{fov, range,
 *   sweep?:[yawA,yawB], period?, set?, inspector?, zone?, who?}}` (NpcWatch, contracts.ts).
 *   Degrees (0 = north, 90 = east), metres, seconds. A watcher counts only in its era and while its
 *   `set` is on (no set: always on).
 * Cues: `{do:'cue', id:'court:on', data:{set:'k1'}}`, `{do:'cue', id:'court:off', data:{set:'k1'}}`
 *   (no data: all sets off), `court:take` (an `unseen` pickup was just taken: instant 1.0 if any
 *   watcher sees it; data.what optional), `court:reset` (every watcher back to 0).
 * Events (emit): 'court:take' {what?} — the same as the cue, for systems (a pickup flagged unseen).
 * Flags: `disguise.coat`, `disguise.letter` (content sets them), `court.admitted`,
 *   `court.ejected` (count; the system sets them). All persist with the save.
 * Events (listen): 'court:suspicion' {watcher, level, stage, tell}, 'court:admitted' {watcher},
 *   'court:ejected' {zone, n, tell}, 'court:refused' {reason:'letter'|'coat', watcher}.
 * Inspector: `watch.inspector: true` → within 4 m, while not admitted, E "Brief vorzeigen" (hold
 *   1 s) replaces talking to that NPC (flag npc.hush). Ring 2.5 s, every tell ×3.
 * Pike: roster look `pike: true` (npc/roster.ts).
 * Strings: ./strings.ts (ids listed there; content may override them).
 * Debug: kq.court.state() / watchers() / inspect() / set(level) / zones() / signal() / on() / off().
 */
import { Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { hasString, t } from '../../i18n';
import { EYE_SVG, h, svg } from '../../ui/dom';
import type { Ring } from '../../world/collision';
import { pointInRing } from '../../world/collision';
import type { NpcPlacement, NpcWatch } from '../contracts';
import { SightCones, type ConeSpec } from '../hunt/cones';
import { TARGET_HEIGHT, lineOfSight } from '../hunt/perception';
import type { NpcSlice } from '../npc';
import { sweepYaw } from '../npc/logic';
import { speakerMeta } from '../story/dialogue/speakers';
import './court.css';
import {
  EJECT_FADE,
  INSPECT_HOLD,
  INSPECT_R,
  RING_S,
  RUN_SPEED,
  STAGE_NAMES,
  type Stage,
  type StageName,
  type TellId,
  activeTells,
  costumeFor,
  fanColour,
  inFan,
  inspectOutcome,
  stageOf,
  stepSuspicion,
  yawDegToward,
  yawGap,
  zoneMul,
} from './logic';
import './strings';
import { type CourtZone, EHRENHOF_OUTSIDE, ZONES, watcherZone, zoneAt, zoneById } from './zones';

export interface CourtSlice {
  /** Watcher sets switched on by the story (cue court:on {set}). */
  sets: string[];
  /** The first-ejection hint card was shown. */
  hinted: boolean;
}

declare module '../../core/state' {
  interface SystemStates {
    court: CourtSlice;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** A watcher's suspicion changed stage (ruhig / blick / misstrauen / aufgefallen). */
    'court:suspicion': { watcher: string; level: number; stage: StageName; tell: TellId | null };
    /** The gate inspection was passed (flag court.admitted). */
    'court:admitted': { watcher: string };
    /** Escorted out (lossless): `n` = court.ejected after this one. */
    'court:ejected': { zone: string; n: number; tell: TellId | null };
    /** The inspection refused you: no letter (stay), or no coat (escorted out next). */
    'court:refused': { reason: 'letter' | 'coat'; watcher: string };
    /** A pickup flagged `unseen` was taken: an instant tell for every watcher that sees it. */
    'court:take': { what?: string };
  }
}

export interface CourtWatcherInfo {
  npc: string;
  x: number;
  z: number;
  yaw: number;
  fov: number;
  range: number;
  level: number;
  stage: StageName;
  tell: TellId | null;
  sees: boolean;
  inspector: boolean;
  zone: string | null;
  set: string | null;
}

export interface CourtHooks {
  state(): {
    sets: string[];
    on: boolean;
    admitted: boolean;
    ejected: number;
    coat: boolean;
    letter: boolean;
    max: number;
    stage: StageName;
    zone: string | null;
    ejecting: boolean;
    ring: number | null;
    hold: number;
    inspector: string | null;
    hinted: boolean;
    costume: 'court' | 'default';
    meter: boolean;
  };
  watchers(): CourtWatcherInfo[];
  /** Show the letter to the nearest inspector in reach now (skips the hold). Returns the outcome. */
  inspect(npc?: string): 'eject' | 'refuse' | 'ring' | 'none';
  /** Set every active watcher's (or one's) suspicion. */
  set(level: number, npc?: string): void;
  zones(): readonly CourtZone[];
  /** Fake a tell signal this tick (tests): 'attack' (a blow), 'staff' (lock-on / charge), 'take'. */
  signal(kind: 'attack' | 'staff' | 'take'): void;
  on(set?: string): void;
  off(set?: string): void;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    court?: CourtHooks;
  }
}

interface WatchRt {
  level: number;
  stage: Stage;
  tell: TellId | null;
  /** Head turn (degrees) sent to the npc system, or null (sweep / placement yaw). */
  turned: number | null;
  sees: boolean;
}

interface Active {
  id: string;
  p: NpcPlacement & { era: string };
  w: NpcWatch;
  x: number;
  z: number;
  yaw: number;
  zone: CourtZone | null;
}

/** Seconds of a held attack (before the swing) that read as a Wuchthieb charge. */
const CHARGE_S = 0.25;
/** Head turns: re-aim when the player has moved this far off the turned heading (degrees). */
const TURN_GAP = 12;
/** Leaving the inspector by more than INSPECT_R + this (m) during the ring ends the Musterung: escorted out. */
const RING_LEAVE = 2.5;
/** Footprints that do not block sight (railings). */
const SEE_THROUGH = new Set(['KB-B39']);
/** The meter shows while a watcher is this close (m) or any suspicion is up. */
const METER_NEAR = 40;

function variants(prefix: string): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 8; i++) if (hasString(`${prefix}.${i}`)) out.push(t(`${prefix}.${i}`));
  return out;
}

class CourtRuntime {
  private readonly rt = new Map<string, WatchRt>();
  private readonly cones = new SightCones();
  private coneList: ConeSpec[] = [];
  private readonly ringMesh: Mesh;
  private readonly meter: HTMLElement;
  private readonly meterFill: HTMLElement;
  private readonly meterIris: SVGCircleElement | null;
  private readonly fade: HTMLElement;
  private hooks = false;
  // signals of this tick (events between ticks)
  private attacked = false;
  private took = false;
  private staffAgo = Infinity;
  private attackHeld = 0;
  // ejection (game time; deterministic with kq.step)
  private eject: { t: number; zone: CourtZone; tell: TellId | null; by: string; moved: boolean; froze: boolean } | null = null;
  // inspection
  private hold = 0;
  private ring: { t: number; watcher: string } | null = null;
  private nearInspector: string | null = null;
  private hushed: string | null = null;
  private prompted = false;
  private lastCoat: boolean | null = null;
  private lastCostume: 'court' | 'default' | null = null;
  private ejectN = 0;
  private obstacles = new Map<string, Ring[]>();
  private meterShown = false;

  constructor(private readonly ctx: GameContext) {
    const ev = ctx.events;
    ctx.scene.add(this.cones.object);
    const rg = new RingGeometry(0.92, 1, 64);
    rg.rotateX(-Math.PI / 2);
    this.ringMesh = new Mesh(rg, new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ringMesh.renderOrder = 54;
    this.ringMesh.visible = false;
    this.ringMesh.frustumCulled = false;
    ctx.scene.add(this.ringMesh);
    // the meter: an eye that fills (pale → orange → red), under the top-centre threat eye
    const eye = svg(EYE_SVG);
    this.meterIris = eye.querySelector('.pupil');
    this.meterFill = h('div.kq-court-fill');
    this.meter = h('div.kq-court-meter.kq-court-off', { 'data-testid': 'court-meter', title: t('court.meter') }, [
      h('div.kq-court-eye', eye),
      h('div.kq-court-bar', this.meterFill),
      h('div.kq-court-label', t('court.meter')),
    ]);
    ctx.ui.hud.dock('boss', this.meter, 5);
    this.fade = h('div.kq-court-fade', { 'data-testid': 'court-fade' });
    ctx.ui.layer('court').append(this.fade);

    ev.on('combat:swing', () => (this.attacked = true));
    ev.on('combat:bann', () => (this.attacked = true));
    ev.on('combat:state', ({ inCombat }) => {
      if (inCombat) this.staffAgo = 0;
    });
    ev.on('court:take', () => (this.took = true));
    ev.on('story:cue', ({ id, data }) => {
      if (id === 'court:on') this.setOn(typeof data?.set === 'string' ? data.set : '*', true);
      else if (id === 'court:off') this.setOn(typeof data?.set === 'string' ? data.set : '*', false);
      else if (id === 'court:take') this.took = true;
      else if (id === 'court:reset') this.resetAll();
    });
    ev.on('era:change', () => {
      this.resetAll();
      this.emitCostume();
    });
    ev.on('save:loaded', () => {
      this.resetAll();
      this.lastCoat = null;
      this.lastCostume = null;
      this.emitCostume(true);
    });
    ev.on('game:start', () => this.emitCostume(true));
    ev.on('travel:arrived', ({ id }) => this.travelRule(id));
    this.emitCostume(true);
  }

  // ---- state --------------------------------------------------------------------------------

  get slice(): CourtSlice {
    const s = this.ctx.state.slice('court', () => ({ sets: [], hinted: false }));
    if (!Array.isArray(s.sets)) s.sets = [];
    return s;
  }

  /** A watcher's name for a spoken line: the speakers pack, else "Wache" (never a raw id). */
  private speaker(id: string): string {
    const m = speakerMeta(id, this.ctx.content);
    return m.name && m.name !== id ? m.name : t('court.speaker');
  }

  private flag(k: string): boolean {
    return this.ctx.state.state.flags[k] === true;
  }

  private get admitted(): boolean {
    return this.flag('court.admitted');
  }

  private setOn(set: string, on: boolean): void {
    const s = this.slice;
    if (set === '*') {
      if (!on) s.sets = [];
      else if (!s.sets.includes('*')) s.sets.push('*');
    } else if (on) {
      if (!s.sets.includes(set)) s.sets.push(set);
    } else s.sets = s.sets.filter((x) => x !== set);
    if (!on) this.resetAll();
  }

  private setActive(w: NpcWatch): boolean {
    if (!w.set) return true;
    const s = this.slice.sets;
    return s.includes(w.set) || s.includes('*');
  }

  /** Watchers standing in the current era whose set is on. */
  private active(): Active[] {
    const placed = (this.ctx.state.state.systems.npc as NpcSlice | undefined)?.placed ?? {};
    const era = this.ctx.era.current;
    const out: Active[] = [];
    for (const [id, p] of Object.entries(placed)) {
      const w = p.watch;
      if (!w || p.era !== era || !this.setActive(w)) continue;
      const r = this.rtOf(id);
      const yaw = r.turned ?? sweepYaw(w, p.yaw, this.ctx.loop.time);
      out.push({ id, p, w, x: p.x, z: p.z, yaw, zone: watcherZone(p.x, p.z, era, w.zone) });
    }
    return out;
  }

  private rtOf(id: string): WatchRt {
    let r = this.rt.get(id);
    if (!r) this.rt.set(id, (r = { level: 0, stage: 0, tell: null, turned: null, sees: false }));
    return r;
  }

  private resetAll(): void {
    for (const [id, r] of this.rt) {
      if (r.turned !== null) this.ctx.events.emit('npc:yaw', { npc: id, yaw: null });
      r.level = 0;
      r.stage = 0;
      r.tell = null;
      r.turned = null;
      r.sees = false;
    }
    this.ring = null;
    this.hold = 0;
  }

  // ---- costume (player:costume, the avatar is owned by kq-characters) -----------------------

  private emitCostume(force = false): void {
    const c = costumeFor(this.flag('disguise.coat'), this.ctx.era.current);
    if (!force && c === this.lastCostume) return;
    this.lastCostume = c;
    this.ctx.events.emit('player:costume', { costume: c });
  }

  // ---- fast travel --------------------------------------------------------------------------

  private travelRule(id: string): void {
    const ctx = this.ctx;
    if (id !== 'ehrenhof' || ctx.era.current !== '1789' || this.admitted) return;
    if (!this.active().length) return;
    ctx.player.teleport(EHRENHOF_OUTSIDE.x, EHRENHOF_OUTSIDE.z, -(EHRENHOF_OUTSIDE.yaw * Math.PI) / 180);
    ctx.ui.hud.toast(t('court.travel.outside'), 4200);
  }

  // ---- sight --------------------------------------------------------------------------------

  /**
   * Building rings near a watcher (sight blockers), cached per placement. Left out: the ring the
   * watcher stands in (a Gardist in a doorway) and see-through railings (the Ehrenhof gitter).
   */
  private blockers(a: Active): Ring[] {
    const key = `${a.id}@${a.x.toFixed(1)},${a.z.toFixed(1)}`;
    let rings = this.obstacles.get(key);
    if (!rings) {
      rings = [];
      const r = a.w.range + 30;
      for (const b of this.ctx.data.footprints.buildings) {
        if (SEE_THROUGH.has(b.id)) continue;
        const ring = b.ring as Ring;
        if (!ring.some(([x, z]) => Math.abs(x - a.x) < r && Math.abs(z - a.z) < r)) continue;
        if (pointInRing(a.x, a.z, ring)) continue;
        rings.push(ring);
      }
      this.obstacles.set(key, rings);
    }
    return rings;
  }

  private sees(a: Active, inZone: boolean, ringed: boolean): { sees: boolean; dist: number } {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const fan = inFan(a.x, a.z, a.yaw, a.w.fov, a.w.range, p.x, p.z);
    // the inspector looks at you during the ring, whatever its sweep
    const inspecting = ringed && this.ring?.watcher === a.id;
    if (!inspecting && (!fan.inside || (!inZone && !ringed))) return { sees: false, dist: fan.dist };
    if (inspecting && fan.dist > INSPECT_R + 3) return { sees: false, dist: fan.dist };
    const w = ctx.world;
    // the building the player stands in is not a wall between them (doorways, arcades)
    const rings = this.blockers(a).filter((r) => !pointInRing(p.x, p.z, r));
    const indoorsSame = (ctx.state.state.flags['interior.building'] ?? '') !== '';
    const eyeY = w.heightAt(a.x, a.z, a.p.y) + 1.6;
    const ty = p.y + TARGET_HEIGHT[ctx.player.stance];
    const sense = {
      heightAt: (x: number, z: number) => w.heightAt(x, z),
      surfaceAt: (x: number, z: number) => w.surfaceAt(x, z),
      coverAt: (x: number, z: number) => w.coverAt(x, z),
      // walls block sight outdoors (inside a building the rooms are the zone; no wall test there)
      obstacleAt: (x: number, z: number) => (indoorsSame ? 0 : rings.some((r) => pointInRing(x, z, r)) ? 25 : 0),
    };
    const tr = lineOfSight(sense, a.x, eyeY, a.z, p.x, ty, p.z, 1.5);
    return { sees: tr > 0.05, dist: fan.dist };
  }

  // ---- tick ---------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    if (!this.hooks && window.kq) this.installHooks();
    // costume: the coat flag may change any time (content sets it)
    const coat = this.flag('disguise.coat');
    if (coat !== this.lastCoat) {
      this.lastCoat = coat;
      this.emitCostume();
    }
    // signals of this tick
    const inp = ctx.input;
    if (inp.wasPressed('lockOn')) this.staffAgo = 0;
    this.attackHeld = inp.isDown('attack') ? this.attackHeld + dt : 0;
    if (this.attackHeld >= CHARGE_S) this.staffAgo = 0;
    if (this.attacked) this.staffAgo = 0;
    const signals = { coat, speed: ctx.player.stats.speed, staffAgo: this.staffAgo, attacked: this.attacked, took: this.took };
    this.attacked = false;
    this.took = false;
    this.staffAgo += dt;

    if (this.eject) {
      this.stepEject(dt);
      return;
    }
    const watchers = this.active();
    const p = ctx.player.position;
    const era = ctx.era.current;
    const flags = ctx.state.state.flags;
    const zone = zoneAt(p.x, p.z, era, String(flags['interior.room'] ?? ''), String(flags['interior.building'] ?? ''));
    const admitted = this.admitted;
    const ringed = this.ring !== null;
    const hits = activeTells(signals);
    // tells inside a zone, or anywhere during the ring
    const mul = zoneMul(zone, admitted, ringed);
    let worst: { a: Active; r: WatchRt } | null = null;
    for (const a of watchers) {
      const r = this.rtOf(a.id);
      const s = this.sees(a, zone !== null, ringed);
      r.sees = s.sees;
      const step = stepSuspicion(r.level, hits, s.sees, s.dist, mul, dt);
      r.level = step.level;
      if (step.tell) r.tell = step.tell;
      const stage = stageOf(r.level, r.stage);
      if (stage !== r.stage) this.stageChanged(a, r, stage);
      // the head follows a player it is suspicious of
      if (r.stage >= 1 && s.sees) {
        const want = yawDegToward(a.x, a.z, p.x, p.z);
        if (r.turned === null || yawGap(r.turned, want) > TURN_GAP) {
          r.turned = want;
          ctx.events.emit('npc:yaw', { npc: a.id, yaw: want });
        }
      }
      if (!worst || r.level > worst.r.level) worst = { a, r };
      if (this.eject) return;
    }
    // watchers that left (despawned / set off): forget them
    for (const id of this.rt.keys()) if (!watchers.some((a) => a.id === id)) this.rt.delete(id);
    this.stepInspection(dt, watchers);
  }

  private stageChanged(a: Active, r: WatchRt, stage: Stage): void {
    const ctx = this.ctx;
    const up = stage > r.stage;
    r.stage = stage;
    const name = STAGE_NAMES[stage];
    ctx.events.emit('court:suspicion', { watcher: a.id, level: Math.round(r.level * 1000) / 1000, stage: name, tell: r.tell });
    if (stage === 0) {
      if (r.turned !== null) ctx.events.emit('npc:yaw', { npc: a.id, yaw: null });
      r.turned = null;
      r.tell = null;
      return;
    }
    if (!up) return;
    const who = a.w.who ?? t('court.who');
    const tell = r.tell ? t(`court.tell.${r.tell}`) : '';
    ctx.ui.hud.subtitle(null, t(`court.cap.${name}`, { who, tell }), 3800);
    if (stage === 2) {
      const lines = variants('court.bark');
      if (lines.length) ctx.ui.hud.subtitle(this.speaker(a.id), lines[(this.ejectN + a.id.length) % lines.length]!, 3200);
    }
    if (stage === 3) this.startEject(a.zone ?? watcherZone(a.x, a.z, ctx.era.current) ?? ZONES[1]!, r.tell, a.id);
  }

  // ---- Hinausbegleitet ----------------------------------------------------------------------

  private startEject(zone: CourtZone, tell: TellId | null, by: string): void {
    if (this.eject) return;
    const pl = this.ctx.player;
    const froze = !pl.frozen;
    pl.frozen = true;
    this.ring = null;
    this.hold = 0;
    this.eject = { t: 0, zone, tell, by, moved: false, froze };
  }

  private stepEject(dt: number): void {
    const e = this.eject!;
    const ctx = this.ctx;
    e.t += dt;
    if (!e.moved && e.t >= EJECT_FADE) {
      e.moved = true;
      ctx.player.setStance('stand');
      ctx.player.teleport(e.zone.exit.x, e.zone.exit.z, -(e.zone.exit.yaw * Math.PI) / 180);
      ctx.player.pitch = 0;
      this.resetAll();
      const n = (Number(ctx.state.state.flags['court.ejected']) || 0) + 1;
      ctx.state.update((s) => (s.flags['court.ejected'] = n), 'court');
      this.ejectN = n;
      const lines = variants(`court.eject.${e.zone.id}`);
      const pool = lines.length ? lines : variants('court.eject');
      const line = pool[(n - 1) % Math.max(1, pool.length)];
      if (line) ctx.ui.hud.subtitle(this.speaker(e.by), line, 4200);
      ctx.events.emit('court:ejected', { zone: e.zone.id, n, tell: e.tell });
      if (!this.slice.hinted) {
        this.slice.hinted = true;
        this.hintCard(e.tell);
      }
    }
    if (e.t >= EJECT_FADE + 0.5) {
      if (e.froze) ctx.player.frozen = false;
      this.eject = null;
    }
  }

  /** The first ejection explains itself: what gave you away and how to avoid it. */
  private hintCard(tell: TellId | null): void {
    const ui = this.ctx.ui;
    ui.cards.modal('court:hint', () => {
      const body: HTMLElement[] = [];
      if (tell) body.push(h('p.kq-court-why', t('court.hint.why', { tell: t(`court.tell.${tell}`) })));
      if (tell && hasString(`court.hint.how.${tell}`)) body.push(h('p', h('b', t(`court.hint.how.${tell}`))));
      body.push(h('p', t('court.hint.rules')), h('p.kq-court-lossless', t('court.hint.lossless')));
      const m = ui.modals.open({ title: t('court.hint.title'), body, actions: [{ label: t('court.hint.ok'), primary: true }], backdrop: 'still', className: 'kq-court-hint' });
      m.el.dataset.testid = 'court-hint';
      return m;
    });
  }

  // ---- Musterung ----------------------------------------------------------------------------

  private stepInspection(dt: number, watchers: Active[]): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    // the ring runs: tells were counted ×3 above; at its end you are through
    if (this.ring) {
      // walking (or running) off in the middle of a Musterung: that is answer enough
      const insp = watchers.find((a) => a.id === this.ring!.watcher);
      if (!insp || Math.hypot(p.x - insp.x, p.z - insp.z) > INSPECT_R + RING_LEAVE) {
        const by = this.ring.watcher;
        const r = this.rtOf(by);
        r.level = 1;
        r.tell = ctx.player.stats.speed >= RUN_SPEED ? 'running' : 'linger';
        this.startEject(insp?.zone ?? zoneById('court.ehrenhof')!, r.tell === 'linger' ? null : r.tell, by);
        return;
      }
      this.ring.t += dt;
      if (this.ring.t >= RING_S) {
        const by = this.ring.watcher;
        this.ring = null;
        this.pass(by);
      }
      this.setPrompt(false);
      return;
    }
    let near: Active | null = null;
    let nd = INSPECT_R;
    if (!this.admitted && ctx.ui.modals.count === 0) {
      for (const a of watchers) {
        if (!a.w.inspector) continue;
        const d = Math.hypot(p.x - a.x, p.z - a.z);
        if (d <= nd) {
          nd = d;
          near = a;
        }
      }
    }
    this.nearInspector = near?.id ?? null;
    this.hush(near?.id ?? null);
    if (!near) {
      this.hold = 0;
      this.setPrompt(false);
      return;
    }
    this.setPrompt(true);
    if (ctx.input.isDown('listen')) {
      this.hold += dt;
      if (this.hold >= INSPECT_HOLD) {
        this.hold = 0;
        this.showLetter(near.id);
      }
    } else this.hold = 0;
  }

  /** E belongs to the inspection while it is offered: the npc system leaves this ghost alone. */
  private hush(id: string | null): void {
    const f = this.ctx.state.mutable.flags;
    if (id === this.hushed) return;
    if (this.hushed && f['npc.hush'] === this.hushed) delete f['npc.hush'];
    this.hushed = null;
    if (id && (f['npc.hush'] === undefined || f['npc.hush'] === '')) {
      f['npc.hush'] = id;
      this.hushed = id;
    }
  }

  private setPrompt(on: boolean): void {
    if (on === this.prompted) return;
    this.prompted = on;
    this.ctx.ui.hud.prompt(on ? 'E' : null, on ? t('court.inspect.prompt') : undefined, 'court');
  }

  showLetter(watcher: string): 'eject' | 'refuse' | 'ring' {
    const ctx = this.ctx;
    const out = inspectOutcome({ coat: this.flag('disguise.coat'), letter: this.flag('disguise.letter') });
    const name = this.speaker(watcher);
    if (out === 'refuse') {
      const lines = variants('court.refused.letter');
      ctx.ui.hud.subtitle(name, lines[(Number(ctx.state.state.flags['court.ejected']) || 0) % Math.max(1, lines.length)] ?? '', 3600);
      ctx.events.emit('court:refused', { reason: 'letter', watcher });
    } else if (out === 'eject') {
      ctx.ui.hud.subtitle(name, t('court.inspect.coat'), 3200);
      ctx.events.emit('court:refused', { reason: 'coat', watcher });
      const a = this.active().find((x) => x.id === watcher);
      const zone = a?.zone ?? zoneById('court.ehrenhof')!;
      const r = this.rtOf(watcher);
      r.level = 1;
      r.tell = 'hivis';
      this.startEject(zone, 'hivis', watcher);
    } else {
      this.ring = { t: 0, watcher };
      ctx.ui.hud.subtitle(null, t('court.inspect.ring'), 2600);
    }
    return out;
  }

  private pass(watcher: string): void {
    const ctx = this.ctx;
    ctx.state.update((s) => (s.flags['court.admitted'] = true), 'court');
    ctx.events.emit('story:cue', { id: 'scenery:gate', data: { open: true } });
    ctx.ui.hud.subtitle(this.speaker(watcher), t('court.inspect.ok'), 3200);
    ctx.ui.hud.toast(t('court.admitted'));
    this.hush(null);
    ctx.events.emit('court:admitted', { watcher });
  }

  // ---- visuals ------------------------------------------------------------------------------

  frame(dt: number): void {
    const ctx = this.ctx;
    // ?manual runs no fixed steps until kq.step: the hooks come with the first frame too
    if (!this.hooks && window.kq) this.installHooks();
    const watchers = this.eject ? [] : this.active();
    const p = ctx.player.position;
    // fans on the ground, tinted by each watcher's suspicion
    this.coneList.length = 0;
    let max = 0;
    let nearest = Infinity;
    for (const a of watchers) {
      const r = this.rtOf(a.id);
      max = Math.max(max, r.level);
      nearest = Math.min(nearest, Math.hypot(p.x - a.x, p.z - a.z));
      this.coneList.push({ x: a.x, z: a.z, yaw: -(a.yaw * Math.PI) / 180, range: a.w.range, fov: (a.w.fov * Math.PI) / 180, level: r.level, rgb: fanColour(r.level) });
    }
    this.cones.update(this.coneList.length ? this.coneList : null, ctx.loop.time, dt, (x, z) => ctx.world.heightAt(x, z));
    // the meter
    const show = !!this.eject || max > 0.01 || nearest < METER_NEAR;
    this.meterShown = show;
    this.meter.classList.toggle('kq-court-off', !show);
    if (show) {
      const [r, g, b] = fanColour(max);
      const css = `rgb(${Math.round(Math.pow(r, 1 / 2.2) * 255)}, ${Math.round(Math.pow(g, 1 / 2.2) * 255)}, ${Math.round(Math.pow(b, 1 / 2.2) * 255)})`;
      this.meterFill.style.width = `${Math.round(max * 100)}%`;
      this.meterFill.style.background = css;
      this.meter.style.setProperty('--kq-court-col', css);
      this.meterIris?.setAttribute('r', String(1.5 + 6.5 * max));
      this.meterIris?.setAttribute('fill', css);
      this.meter.dataset.level = max.toFixed(2);
      this.meter.dataset.stage = STAGE_NAMES[stageOf(max)];
    }
    // the inspection ring closes round you
    if (this.ring) {
      const k = Math.min(1, this.ring.t / RING_S);
      const rad = 3.2 - 2.2 * k;
      this.ringMesh.visible = true;
      this.ringMesh.position.set(p.x, ctx.world.heightAt(p.x, p.z, p.y) + 0.06, p.z);
      this.ringMesh.scale.setScalar(rad);
      (this.ringMesh.material as MeshBasicMaterial).opacity = 0.55 + 0.4 * Math.sin(ctx.loop.time * 8) ** 2;
    } else this.ringMesh.visible = false;
    // hold progress on the prompt
    const promptEl = ctx.ui.hud.el.querySelector<HTMLElement>('.kq-prompt');
    if (promptEl && this.prompted) promptEl.style.setProperty('--kq-court-hold', String(this.hold / INSPECT_HOLD));
    // the fade of Hinausbegleitet
    const e = this.eject;
    const fa = e ? (e.t < EJECT_FADE ? e.t / EJECT_FADE : Math.max(0, 1 - (e.t - EJECT_FADE) / 0.5)) : 0;
    this.fade.style.opacity = fa.toFixed(3);
  }

  // ---- debug / test API ---------------------------------------------------------------------

  private maxLevel(): number {
    let m = 0;
    for (const r of this.rt.values()) m = Math.max(m, r.level);
    return m;
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooks = true;
    kq.court = {
      state: () => {
        const ctx = this.ctx;
        const f = ctx.state.state.flags;
        const p = ctx.player.position;
        const z = zoneAt(p.x, p.z, ctx.era.current, String(f['interior.room'] ?? ''), String(f['interior.building'] ?? ''));
        const max = this.maxLevel();
        return {
          sets: [...this.slice.sets],
          on: this.active().length > 0,
          admitted: f['court.admitted'] === true,
          ejected: Number(f['court.ejected']) || 0,
          coat: f['disguise.coat'] === true,
          letter: f['disguise.letter'] === true,
          max,
          stage: STAGE_NAMES[stageOf(max)],
          zone: z?.id ?? null,
          ejecting: this.eject !== null,
          ring: this.ring ? this.ring.t : null,
          hold: this.hold,
          inspector: this.nearInspector,
          hinted: this.slice.hinted,
          costume: costumeFor(f['disguise.coat'] === true, ctx.era.current),
          meter: this.meterShown,
        };
      },
      watchers: () =>
        this.active().map((a) => {
          const r = this.rtOf(a.id);
          return { npc: a.id, x: a.x, z: a.z, yaw: a.yaw, fov: a.w.fov, range: a.w.range, level: r.level, stage: STAGE_NAMES[r.stage], tell: r.tell, sees: r.sees, inspector: a.w.inspector === true, zone: a.zone?.id ?? null, set: a.w.set ?? null };
        }),
      inspect: (npc) => {
        const p = this.ctx.player.position;
        const cands = this.active().filter((a) => a.w.inspector && (npc ? a.id === npc : Math.hypot(p.x - a.x, p.z - a.z) <= INSPECT_R));
        if (!cands.length || this.ring || this.eject) return 'none';
        return this.showLetter(cands[0]!.id);
      },
      set: (level, npc) => {
        for (const a of this.active()) {
          if (npc && a.id !== npc) continue;
          const r = this.rtOf(a.id);
          r.level = Math.max(0, Math.min(1, level));
        }
      },
      zones: () => ZONES,
      signal: (kind) => {
        if (kind === 'attack') this.attacked = true;
        else if (kind === 'take') this.took = true;
        else this.staffAgo = 0;
      },
      on: (set) => this.setOn(set ?? '*', true),
      off: (set) => this.setOn(set ?? '*', false),
    };
  }

  dispose(): void {
    this.cones.object.removeFromParent();
    this.cones.dispose();
    this.ringMesh.removeFromParent();
    this.ringMesh.geometry.dispose();
    (this.ringMesh.material as MeshBasicMaterial).dispose();
    this.meter.remove();
    this.fade.remove();
  }
}

let rt: CourtRuntime | null = null;

export default defineSystem({
  id: 'court',
  after: ['npc', 'scenery', 'story'],
  init(ctx) {
    rt = new CourtRuntime(ctx);
  },
  update(dt) {
    rt?.update(dt);
  },
  frame(dt) {
    rt?.frame(dt);
  },
  dispose() {
    rt?.dispose();
    rt = null;
  },
});
