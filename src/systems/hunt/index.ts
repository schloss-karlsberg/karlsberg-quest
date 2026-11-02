/**
 * Feature system "hunt": Die Meute (spectral hound pack), Der Pikeur (huntsman) and the lantern.
 *
 * - Activation ONLY via 'threat:configure' {kind:'pack'} from the story (or kq.hunt.start()).
 * - The AI is a deterministic simulation (sim.ts) stepped in the fixed update; visuals, sound,
 *   captions and HUD follow it. Caught → ≈2 s sequence → 'player:caught' {by:'pack'} → pack ends.
 * - The lantern (L) lights the world through atmosphere.uLantern*, drains oil while lit, raises
 *   the pack's sight range; oil persists in the 'hunt' state slice and refills on 'hub:enter'.
 *
 * Contract events emitted: hunt:alert, hunt:horn, lantern:toggle, lantern:oil, lantern:empty,
 * player:caught. Feature-private: hunt:start, hunt:end (declared below).
 */
import './strings';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { Stance } from '../../player/stance';
import { pointInRing } from '../../world/collision';
import type { ThreatConfig } from '../contracts';
import { HuntAudio } from './audio';
import { PathGraph } from './graph';
import { LanternView } from './lantern';
import { type LanternState, drain, newLantern, refill, toggle } from './lanternLogic';
import { type ArrowKind, HuntOverlay } from './overlay';
import type { PlayerSense } from './perception';
import { hashSeed } from './rng';
import { type Agent, type HornSignal, type PackOptions, PackSim, type PackState, type SimEvent, type SimWorld, headingTo } from './sim';
import { PackVisuals } from './visuals';

export interface HuntSlice {
  /** Current pack alert 0..1 (mirror of the last 'hunt:alert'; 0 when no pack is out). */
  alert?: number;
  /** Lantern oil and lit state (persists; refilled on 'hub:enter'). Filled in on first use. */
  lantern?: LanternState;
  /** How often the pack has caught the player (stats, story may read it). */
  caught?: number;
}

declare module '../../core/state' {
  interface SystemStates {
    hunt: HuntSlice;
  }
}

declare module '../contracts' {
  interface ThreatConfig {
    /** pack only: number of hounds 3–6 (default 3 + 2·intensity, +1 in Rauhnacht). */
    hounds?: number;
    /** pack only: the Pikeur rides along (default: intensity ≥ 0.6 or Rauhnacht). */
    pikeur?: boolean;
    /** pack only: base sight (m) for a standing unlit player (default by era: night 30, frost fog 15). */
    sight?: number;
    /** pack only: RNG seed (default derived from the area → reproducible beats). */
    seed?: number;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** The pack appeared (threat:configure or kq.hunt.start). */
    'hunt:start': { x: number; z: number; radius: number; hounds: number; pikeur: boolean };
    /** The pack is gone (configured off, caught the player, hub, debug). */
    'hunt:end': { reason: 'configure' | 'caught' | 'hub' | 'debug' };
  }
}

declare module '../../core/save' {
  interface Settings {
    /** Rauhnacht hard mode: faster pack, 30 % less oil, the Pikeur rides from the start. */
    rauhnacht?: boolean;
    /** Hunt captions as subtitles (default on). */
    subtitles?: boolean;
    /** Direction arrows at the screen edge for threat sounds (default on). */
    soundIndicators?: boolean;
  }
}

export interface HuntStartOptions {
  x?: number;
  z?: number;
  radius?: number;
  intensity?: number;
  hounds?: number;
  pikeur?: boolean;
  seed?: number;
  sight?: number;
}

export interface HuntHooks {
  /** Activate the pack (defaults: around the player, radius 160, intensity 0.5). */
  start(o?: HuntStartOptions): ReturnType<PackSim['snapshot']>;
  stop(): void;
  state(): (ReturnType<PackSim['snapshot']> & { active: boolean; caughtT: number }) | null;
  /** Force a pack state (emits the matching horn); `x/z` = last known position. */
  setState(s: PackState, x?: number, z?: number): void;
  /** Place agent i (0 = Pikeur if present) at x/z, yaw in degrees (0 north, 90 east). */
  place(i: number, x: number, z: number, yawDeg?: number): void;
  /** Place agent i `dist` m in front of the view, `angleDeg` to the right, facing the player. */
  placeInView(i: number, dist: number, angleDeg?: number, facePlayer?: boolean): void;
  /** Freeze/unfreeze the AI movement (perception keeps running). */
  freeze(on?: boolean): void;
  horn(signal: HornSignal): void;
  /** Trigger the caught sequence with the nearest hound. */
  catch(): void;
  /** Hunt/lantern/caught events seen so far (name, payload, tick). */
  events(): { name: string; payload: unknown; tick: number }[];
  /** Raw simulation (tests). */
  sim(): PackSim | null;
}

export interface LanternHooks {
  toggle(on?: boolean): boolean;
  setOil(v: number): void;
  refill(): void;
  setSeconds(s: number): void;
  state(): LanternState & { light: number };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    hunt?: HuntHooks;
    lantern?: LanternHooks;
  }
}

/** Seconds from caught to 'player:caught' (the sequence itself). */
const CAUGHT_EMIT = 2.0;
const CAUGHT_END = 4.6;

class Hunt {
  readonly audio: HuntAudio;
  readonly visuals = new PackVisuals();
  readonly lanternView: LanternView;
  readonly overlay: HuntOverlay;
  sim: PackSim | null = null;
  private graph: PathGraph | null = null;
  /** Agents of a pack that is fading out. */
  private fading: { agents: Agent[]; state: PackState; t: number } | null = null;
  private needPrewarm = false;
  private hudAlert = 0;
  private threatOwned = false;
  private lastAlert = { level: -1, state: '' as PackState | '', at: -1 };
  private hornGlowT = 0;
  private hornGlowDur = 1;
  private hbT = 0;
  private caughtT = -1;
  private caughtBy: Agent | null = null;
  private caughtEmitted = false;
  private prevDesat = 0;
  private readonly captionAt = new Map<string, number>();
  private readonly agentAudio = new Map<Agent, { paw: number; pant: number; hoof: number }>();
  private readonly log: { name: string; payload: unknown; tick: number }[] = [];
  private lowWarned = false;
  private lastLit = false;
  private hooksInstalled = false;

  constructor(readonly ctx: GameContext) {
    this.audio = new HuntAudio(ctx.audio);
    this.lanternView = new LanternView(ctx.scene);
    ctx.scene.add(this.visuals.object);
    this.visuals.object.visible = false;
    this.overlay = new HuntOverlay(ctx.ui.layer('hunt'), { caught: ctx.t('hunt.caught.title'), caughtSub: ctx.t('hunt.caught.sub') });
    const ev = ctx.events;
    ev.onAny((name, payload) => {
      if (/^(hunt:|lantern:|player:caught|threat:configure)/.test(name)) {
        this.log.push({ name, payload, tick: ctx.loop.tick });
        if (this.log.length > 300) this.log.shift();
      }
    });
    ev.on('threat:configure', (c) => this.configure(c));
    ev.on('hub:enter', () => {
      this.stop('hub');
      this.refill();
    });
    ev.on('save:loaded', () => this.syncLantern(true));
    ev.on('settings:change', ({ key }) => {
      if (this.sim && (key === 'gentleMode' || key === 'rauhnacht')) this.sim.retune(this.mode());
    });
    this.syncLantern(true);
  }

  // ---- state --------------------------------------------------------------------------------

  slice(): Required<HuntSlice> {
    const s = this.ctx.state.slice('hunt', () => ({ alert: 0, lantern: newLantern(), caught: 0 }));
    if (!s.lantern || typeof s.lantern.oil !== 'number') s.lantern = newLantern();
    if (typeof s.caught !== 'number') s.caught = 0;
    if (typeof s.alert !== 'number') s.alert = 0;
    return s as Required<HuntSlice>;
  }

  mode(): { gentle: boolean; rauhnacht: boolean } {
    const st = this.ctx.settings.state;
    return { gentle: st.gentleMode, rauhnacht: st.rauhnacht === true || this.ctx.state.state.flags['rauhnacht'] === true };
  }

  // ---- lantern ------------------------------------------------------------------------------

  private syncLantern(force = false): void {
    const L = this.slice().lantern;
    this.ctx.player.stats.lanternLit = L.lit;
    if (force || L.lit !== this.lastLit) {
      this.lastLit = L.lit;
      this.ctx.state.mutable.flags['lanternLit'] = L.lit;
    }
  }

  setLit(on: boolean, user: boolean): boolean {
    const L = this.slice().lantern;
    const r = toggle(L, on);
    if (r === null) {
      if (on && L.oil <= 0 && user) this.ctx.ui.toast(this.ctx.t('lantern.noOil'));
      return L.lit;
    }
    this.syncLantern();
    this.ctx.events.emit('lantern:toggle', { lit: r });
    return r;
  }

  refill(): void {
    const L = this.slice().lantern;
    refill(L);
    this.lowWarned = false;
    this.ctx.events.emit('lantern:oil', { oil: L.oil });
  }

  private updateLantern(dt: number): void {
    const ctx = this.ctx;
    const L = this.slice().lantern;
    if (ctx.input.wasPressed('lantern') && this.caughtT < 0) {
      const lit = this.setLit(!L.lit, true);
      ctx.ui.toast(ctx.t(lit ? 'lantern.on' : 'lantern.off'), 1400);
    }
    const r = drain(L, dt, this.mode());
    if (r.percentChanged) ctx.events.emit('lantern:oil', { oil: L.oil });
    if (r.emptied) {
      ctx.events.emit('lantern:toggle', { lit: false });
      ctx.events.emit('lantern:empty', {});
      ctx.ui.toast(ctx.t('lantern.empty'));
    } else if (L.lit && L.oil < 0.15 && !this.lowWarned) {
      this.lowWarned = true;
      ctx.ui.toast(ctx.t('lantern.low'));
    }
    if (L.oil >= 0.15) this.lowWarned = false;
    this.syncLantern();
  }

  // ---- pack lifecycle -----------------------------------------------------------------------

  private configure(c: ThreatConfig): void {
    if (c.kind !== 'pack') return;
    if (typeof c.seconds === 'number' && c.seconds > 0) this.slice().lantern.seconds = c.seconds;
    if (!c.active) {
      this.stop('configure');
      return;
    }
    const o: HuntStartOptions = { intensity: c.intensity, radius: c.radius, hounds: c.hounds, pikeur: c.pikeur, sight: c.sight, seed: c.seed, x: c.center?.x, z: c.center?.z };
    const s = this.sim;
    if (s && this.caughtT < 0 && (c.center === undefined || Math.hypot(c.center.x - s.opt.x, c.center.z - s.opt.z) < 5) && (c.radius === undefined || c.radius === s.opt.radius) && c.hounds === undefined && c.pikeur === undefined) {
      // same beat, new difficulty
      s.retune({ intensity: c.intensity ?? s.opt.intensity, ...this.mode() });
      return;
    }
    this.start(o);
  }

  private senseDefaults(rauhnacht: boolean): { sight: number; beacon: number } {
    const era = this.ctx.era.current;
    if (era === '1793-02') return { sight: rauhnacht ? 20 : 15, beacon: 65 }; // frost fog
    if (era === '1793-07') return { sight: 24, beacon: 5 }; // fire light: they hunt by ear
    if (this.ctx.era.info.night) return { sight: 30, beacon: 40 };
    return { sight: 40, beacon: 20 }; // a dusk / day memory
  }

  start(o: HuntStartOptions = {}): PackSim {
    const ctx = this.ctx;
    if (this.sim) this.stop('debug', true);
    this.endCaught();
    const p = ctx.player.position;
    const mode = this.mode();
    const intensity = Math.max(0, Math.min(1, o.intensity ?? 0.5));
    const x = o.x ?? p.x;
    const z = o.z ?? p.z;
    const radius = Math.max(30, o.radius ?? 160);
    const hounds = Math.max(3, Math.min(6, Math.round(o.hounds ?? 3 + intensity * 2 + (mode.rauhnacht ? 1 : 0))));
    const pikeur = o.pikeur ?? (intensity >= 0.6 || mode.rauhnacht);
    const sense = this.senseDefaults(mode.rauhnacht);
    const opts: PackOptions = {
      x,
      z,
      radius,
      intensity,
      hounds,
      pikeur,
      seed: o.seed ?? hashSeed(x, z, radius, hounds),
      sight: o.sight ?? sense.sight,
      beacon: sense.beacon,
      gentle: mode.gentle,
      rauhnacht: mode.rauhnacht,
    };
    this.graph ??= new PathGraph(ctx.data.paths);
    this.sim = new PackSim(this.simWorld(x, z, radius), this.graph, opts, { x: p.x, z: p.z });
    this.fading = null;
    this.visuals.clear();
    this.agentAudio.clear();
    this.overlay.clearArrows();
    this.needPrewarm = true;
    this.lastAlert = { level: -1, state: '', at: -1 };
    ctx.events.emit('hunt:start', { x, z, radius, hounds, pikeur });
    return this.sim;
  }

  stop(reason: 'configure' | 'caught' | 'hub' | 'debug', silent = false): void {
    const s = this.sim;
    if (!s) return;
    this.sim = null;
    this.slice().alert = 0;
    if (!silent) this.fading = { agents: s.agents, state: s.state, t: 0 };
    this.ctx.events.emit('hunt:alert', { level: 0, state: 'calm' });
    this.ctx.events.emit('hunt:end', { reason });
  }

  /** Terrain, cover, water, buildings (as sight blockers and colliders) for the simulation. */
  private simWorld(cx: number, cz: number, radius: number): SimWorld {
    const w = this.ctx.world;
    const obstacle = this.buildObstacles(cx, cz, radius * 1.7);
    return {
      heightAt: (x, z) => w.heightAt(x, z),
      surfaceAt: (x, z) => w.surfaceAt(x, z),
      coverAt: (x, z) => w.coverAt(x, z),
      obstacleAt: obstacle,
      collide: (x, z, r) => w.collider.resolve(x, z, r),
      bounds: () => w.bounds(),
    };
  }

  /** 3 m raster of building heights around the area (only while the palace stands). */
  private buildObstacles(cx: number, cz: number, r: number): (x: number, z: number) => number {
    const w = this.ctx.world;
    if (!w.collider.enabled) return () => 0;
    const cell = 3;
    const n = Math.ceil((2 * r) / cell);
    const x0 = cx - r;
    const z0 = cz - r;
    const grid = new Float32Array(n * n);
    for (const b of this.ctx.data.footprints.buildings) {
      const ring = b.ring;
      let bx0 = Infinity;
      let bz0 = Infinity;
      let bx1 = -Infinity;
      let bz1 = -Infinity;
      for (const [x, z] of ring) {
        bx0 = Math.min(bx0, x);
        bz0 = Math.min(bz0, z);
        bx1 = Math.max(bx1, x);
        bz1 = Math.max(bz1, z);
      }
      if (bx1 < x0 || bz1 < z0 || bx0 > x0 + n * cell || bz0 > z0 + n * cell) continue;
      const h = b.base_h !== null && b.eaves_h !== null ? Math.max(3, Math.min(25, b.eaves_h - b.base_h)) : 8;
      const c0 = Math.max(0, Math.floor((bx0 - x0) / cell));
      const c1 = Math.min(n - 1, Math.floor((bx1 - x0) / cell));
      const r0 = Math.max(0, Math.floor((bz0 - z0) / cell));
      const r1 = Math.min(n - 1, Math.floor((bz1 - z0) / cell));
      for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++) if (pointInRing(x0 + (cc + 0.5) * cell, z0 + (rr + 0.5) * cell, ring)) grid[rr * n + cc] = Math.max(grid[rr * n + cc]!, h);
    }
    return (x, z) => {
      const c = Math.floor((x - x0) / cell);
      const rr = Math.floor((z - z0) / cell);
      if (c < 0 || rr < 0 || c >= n || rr >= n) return 0;
      return grid[rr * n + c]!;
    };
  }

  private playerSense(): PlayerSense {
    const pl = this.ctx.player;
    return {
      x: pl.position.x,
      y: pl.position.y,
      z: pl.position.z,
      stance: pl.stance as Stance,
      noise: pl.stats.noise,
      visibility: pl.stats.visibility,
      lanternLit: pl.stats.lanternLit,
      speed: pl.stats.speed,
      flying: pl.flying,
    };
  }

  // ---- fixed update -------------------------------------------------------------------------

  update(dt: number): void {
    this.installHooks();
    this.updateLantern(dt);
    const sim = this.sim;
    if (sim) {
      const evs = sim.update(dt, this.playerSense());
      for (const e of evs) this.onSimEvent(e, sim);
      this.sounds(dt, sim);
      this.emitAlert(sim);
    }
    if (this.fading) {
      this.fading.t += dt / 2.4;
      if (this.fading.t >= 1) {
        this.fading = null;
        this.visuals.clear();
      }
    }
    this.hornGlowT = Math.max(0, this.hornGlowT - dt);
    if (this.caughtT >= 0) this.updateCaught(dt);
    // heartbeat rises with the alert
    const alert = this.caughtT >= 0 ? 1 : sim ? sim.alert : 0;
    if (alert > 0.2) {
      this.hbT -= dt;
      if (this.hbT <= 0) {
        this.hbT = 60 / (58 + 92 * alert);
        this.audio.heartbeat(0.1 + 0.4 * alert);
        this.overlay.beat();
      }
    } else this.hbT = 0.3;
  }

  private emitAlert(sim: PackSim): void {
    const now = this.ctx.loop.time;
    const L = this.lastAlert;
    const level = Math.round(sim.alert * 100) / 100;
    if (sim.state !== L.state || (Math.abs(level - L.level) >= 0.05 && now - L.at >= 0.25)) {
      this.lastAlert = { level, state: sim.state, at: now };
      this.slice().alert = level;
      this.ctx.events.emit('hunt:alert', { level, state: sim.state });
    }
  }

  private pos3(x: number, z: number, up = 0.6) {
    return { x, y: this.ctx.world.heightAt(x, z) + up, z };
  }

  /** Bearing of x/z relative to the view, degrees (0 ahead, 90 right). */
  private relAngle(x: number, z: number): number {
    const p = this.ctx.player.position;
    const yaw = this.ctx.player.yaw;
    const dx = x - p.x;
    const dz = z - p.z;
    const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
    const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    return (Math.atan2(right, fwd) * 180) / Math.PI;
  }

  private caption(key: string, text: string, throttle = 6, ms = 2800): void {
    const now = this.ctx.loop.time;
    const last = this.captionAt.get(key);
    if (last !== undefined && now - last < throttle) return;
    this.captionAt.set(key, now);
    if (this.ctx.settings.state.subtitles === false) return;
    this.ctx.ui.hud.subtitle(null, text, ms);
  }

  /**
   * Direction arrow for a sound. Sources in plain view and close are skipped (you can see them);
   * arrows are grouped per kind and 30° sector so a pack doesn't spam the screen edge.
   */
  private arrow(kind: ArrowKind, x: number, z: number, label: string, ttl = 1.8, always = false): void {
    if (this.ctx.settings.state.soundIndicators === false) return;
    const ang = this.relAngle(x, z);
    const p = this.ctx.player.position;
    if (!always && Math.abs(ang) < 32 && Math.hypot(x - p.x, z - p.z) < 25) return;
    // one horn, one arrow: it follows the rider instead of leaving a trail of stale ones
    const key = kind === 'horn' ? 'horn' : `${kind}-${Math.round(ang / 30)}`;
    this.overlay.arrow(key, kind, ang, label, ttl);
  }

  private onSimEvent(e: SimEvent, sim: PackSim): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    switch (e.type) {
      case 'horn': {
        ctx.events.emit('hunt:horn', { signal: e.signal, x: e.x, z: e.z });
        const dur = this.audio.horn(e.signal, this.pos3(e.x, e.z, 2.6));
        this.hornGlowDur = Math.max(0.8, dur || (e.signal === 'search' ? 2.8 : e.signal === 'call-off' ? 3.5 : e.signal === 'lost' ? 2.6 : 0.8));
        this.hornGlowT = this.hornGlowDur;
        const meaning = (ctx.state.state.skills['spurenleser'] ?? 0) >= 1 || ctx.settings.state.gentleMode;
        this.caption(`horn-${e.signal}`, ctx.t(`hunt.horn.${e.signal}${meaning ? '.meaning' : ''}`), 1.5, 4200);
        // the glowing brass horn of a Pikeur in plain view is its own visual cue
        this.arrow('horn', e.x, e.z, ctx.t('hunt.arrow.horn'), 3.2, !sim?.pikeur);
        break;
      }
      case 'bay': {
        const a = sim.agents[e.idx];
        if (!a) break;
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        this.audio.bay(e.kind, this.pos3(a.x, a.z, 0.8), 0.88 + (a.idx % 6) * 0.05);
        if (e.kind === 'growl' && d > 25) break;
        const key = e.kind === 'howl' ? 'hunt.sound.howl' : e.kind === 'growl' ? 'hunt.sound.growl' : d < 35 ? 'hunt.sound.bark.near' : 'hunt.sound.bark.far';
        this.caption(key, ctx.t(key), e.kind === 'bark' ? 5 : 9);
        this.arrow('hound', a.x, a.z, ctx.t('hunt.arrow.hound'), 2);
        break;
      }
      case 'caught': {
        this.caughtBy = sim.agents[e.by] ?? null;
        this.beginCaught();
        break;
      }
      case 'state':
        break;
    }
  }

  /** Paws, panting and hoof beats of the nearest animals (with captions and arrows). */
  private sounds(dt: number, sim: PackSim): void {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const frost = ctx.era.current === '1793-02' || ctx.world.look.snow > 0.3;
    const hounds = sim.agents.filter((a) => a.kind === 'hound').map((a) => ({ a, d: Math.hypot(a.x - p.x, a.z - p.z) }));
    hounds.sort((u, v) => u.d - v.d);
    hounds.forEach(({ a, d }, rank) => {
      let st = this.agentAudio.get(a);
      if (!st) this.agentAudio.set(a, (st = { paw: a.dist, pant: 0.5 + a.idx * 0.17, hoof: a.dist }));
      const stride = a.speed > 4 ? 1.1 : 0.7;
      if (a.dist - st.paw >= stride) {
        st.paw = a.dist;
        if (d < 28 && rank < 3) {
          this.audio.paw(this.pos3(a.x, a.z, 0.05), frost, Math.min(0.16, 0.05 + a.speed * 0.02));
          if (d < 20) {
            this.caption('paws', ctx.t(frost ? 'hunt.sound.paws.frost' : 'hunt.sound.paws'), 10);
            this.arrow('hound', a.x, a.z, ctx.t('hunt.arrow.hound'), 1.2);
          }
        }
      }
      st.pant -= dt;
      if (st.pant <= 0) {
        st.pant = a.speed > 4 ? 0.36 : a.speed > 1 ? 0.62 : 1.05;
        if (d < 16 && rank < 2) {
          this.audio.pant(this.pos3(a.x, a.z, 0.8), 0.06 + 0.1 * (1 - d / 16), a.speed > 4);
          if (d < 12) {
            this.caption('pant', ctx.t('hunt.sound.pant'), 8);
            this.arrow('hound', a.x, a.z, ctx.t('hunt.arrow.hound'), 1.2);
          }
        }
      }
    });
    const pk = sim.pikeur;
    if (pk) {
      let st = this.agentAudio.get(pk);
      if (!st) this.agentAudio.set(pk, (st = { paw: pk.dist, pant: 1, hoof: pk.dist }));
      const step = pk.speed > 3 ? 0.75 : 1.15;
      if (pk.dist - st.hoof >= step) {
        st.hoof = pk.dist;
        const d = Math.hypot(pk.x - p.x, pk.z - p.z);
        if (d < 75) {
          this.audio.hoof(this.pos3(pk.x, pk.z, 0.1), Math.min(0.4, 0.12 + pk.speed * 0.05));
          if (d < 55) {
            this.caption('hooves', ctx.t('hunt.sound.hooves'), 10);
            this.arrow('hooves', pk.x, pk.z, ctx.t('hunt.arrow.hooves'), 1.5);
          }
        }
      }
    }
  }

  // ---- caught -------------------------------------------------------------------------------

  private beginCaught(): void {
    const ctx = this.ctx;
    this.caughtT = 0;
    this.caughtEmitted = false;
    ctx.player.frozen = true;
    ctx.player.lookLocked = true;
    this.prevDesat = ctx.post.uniforms.uDesaturate!.value as number;
    this.audio.rush();
    const s = this.sim;
    const by = this.caughtBy ?? s?.agents[0];
    if (by) {
      // the horn: found — sounds right behind the pack
      ctx.events.emit('hunt:horn', { signal: 'found', x: by.x, z: by.z });
      this.audio.horn('found', this.pos3(by.x, by.z, 2.6));
      this.hornGlowT = this.hornGlowDur = 0.8;
    }
    this.caption('rush', ctx.t('hunt.sound.rush'), 1, 2000);
    this.slice().caught++;
  }

  private updateCaught(dt: number): void {
    const ctx = this.ctx;
    this.caughtT += dt;
    if (this.caughtT >= CAUGHT_EMIT && !this.caughtEmitted) {
      this.caughtEmitted = true;
      this.stop('caught');
      ctx.events.emit('player:caught', { by: 'pack' });
    }
    if (this.caughtT >= 3.0) {
      ctx.player.frozen = false;
      ctx.player.lookLocked = false;
    }
    if (this.caughtT >= CAUGHT_END) this.endCaught();
  }

  private endCaught(): void {
    if (this.caughtT < 0) return;
    this.caughtT = -1;
    this.caughtBy = null;
    this.ctx.player.frozen = false;
    this.ctx.player.lookLocked = false;
    this.ctx.post.uniforms.uDesaturate!.value = this.prevDesat;
  }

  /** Visual part of the caught sequence: turn to the hound, shake, desaturate. */
  private caughtFrame(dt: number): void {
    const ctx = this.ctx;
    const t = this.caughtT;
    const reduced = ctx.settings.state.reducedMotion;
    const by = this.caughtBy;
    if (by && t < 0.8 && !reduced) {
      const want = headingTo(by.x - ctx.player.position.x, by.z - ctx.player.position.z);
      const d = Math.atan2(Math.sin(want - ctx.player.yaw), Math.cos(want - ctx.player.yaw));
      ctx.player.yaw += d * Math.min(1, dt * 7);
      ctx.player.pitch += (-0.12 - ctx.player.pitch) * Math.min(1, dt * 5);
    }
    if (!reduced && t < 1.8) {
      const amp = 0.012 * Math.min(1, t * 1.5);
      ctx.camera.position.x += Math.sin(t * 61) * amp;
      ctx.camera.position.y += Math.sin(t * 47 + 1) * amp;
    }
    ctx.post.uniforms.uDesaturate!.value = Math.max(this.prevDesat, Math.min(0.7, t * 0.6) * (t < 3.6 ? 1 : Math.max(0, 1 - (t - 3.6))));
  }

  // ---- frame (visuals only) -----------------------------------------------------------------

  frame(dt: number): void {
    const ctx = this.ctx;
    this.installHooks();
    const snap = ctx.loop.manual;
    const reducedMotion = ctx.settings.state.reducedMotion;
    const sim = this.sim;
    const agents = sim ? sim.agents : this.fading?.agents;
    if (agents) {
      const input = {
        agents,
        state: sim ? sim.state : this.fading!.state,
        dissolve: sim ? -1 : this.fading!.t,
        time: ctx.loop.time,
        dt,
        camera: ctx.camera,
        viewportH: window.innerHeight,
        hornGlow: this.hornGlowT > 0 ? Math.min(1, this.hornGlowT / Math.min(0.4, this.hornGlowDur)) * (0.6 + 0.4 * Math.sin(ctx.loop.time * 30)) : 0,
        caught: this.caughtT >= 0 && this.caughtT < 2.2 ? { t: this.caughtT } : null,
        mist: ctx.era.current === '1793-02' ? 1 : ctx.era.info.night ? 0.55 : 0.3,
        reducedMotion,
        heightAt: (x: number, z: number) => ctx.world.heightAt(x, z),
        snap,
      };
      if (this.needPrewarm) {
        this.needPrewarm = false;
        this.visuals.prewarm(input);
      }
      this.visuals.update(input);
    } else this.visuals.object.visible = false;
    if (this.caughtT >= 0) this.caughtFrame(dt);
    // HUD threat meter (only while we own it, so fire/oblivion can use the slot too)
    const target = this.caughtT >= 0 ? 1 : sim ? sim.alert : 0;
    this.hudAlert += (target - this.hudAlert) * (snap ? 1 : Math.min(1, dt * 4));
    if (sim || this.caughtT >= 0 || this.fading) {
      ctx.ui.hud.setThreat(this.hudAlert);
      this.threatOwned = true;
    } else if (this.threatOwned) {
      ctx.ui.hud.setThreat(this.hudAlert);
      if (this.hudAlert < 0.01) {
        ctx.ui.hud.setThreat(0);
        this.threatOwned = false;
      }
    }
    // lantern
    const L = this.slice().lantern;
    const pl = ctx.player;
    this.lanternView.frame({
      dt,
      time: ctx.loop.time + (snap ? 0 : performance.now() / 1000) * 0,
      camera: ctx.camera,
      lit: L.lit,
      oil: L.oil,
      fog: ctx.era.current === '1793-02',
      prone: pl.stance === 'prone',
      moving: Math.min(1, pl.stats.speed / 4),
      reducedMotion,
      snap,
    });
    const showGauge = L.lit || L.oil < 0.999 || !!sim || ctx.era.info.night;
    ctx.ui.hud.setLantern(showGauge ? L.oil : null, L.lit);
    this.overlay.frame({ dt, alert: this.hudAlert, reducedMotion, caught: this.caughtT, showArrows: ctx.settings.state.soundIndicators !== false });
  }

  // ---- debug hooks --------------------------------------------------------------------------

  private installHooks(): void {
    if (this.hooksInstalled || typeof window === 'undefined' || !window.kq) return;
    this.hooksInstalled = true;
    const ctx = this.ctx;
    const self = this;
    const toHeading = (yawDeg: number) => (-yawDeg * Math.PI) / 180;
    window.kq.hunt = {
      start(o = {}) {
        return self.start(o).snapshot();
      },
      stop() {
        self.stop('debug');
      },
      state() {
        const s = self.sim;
        return s ? { ...s.snapshot(), active: true, caughtT: self.caughtT } : null;
      },
      setState(s, x, z) {
        const p = ctx.player.position;
        self.sim?.force(s, { x: x ?? p.x, z: z ?? p.z });
        const sim = self.sim;
        if (sim) for (const e of sim.update(0, self.playerSense())) self.onSimEvent(e, sim);
      },
      place(i, x, z, yawDeg) {
        self.sim?.place(i, x, z, yawDeg === undefined ? undefined : toHeading(yawDeg));
      },
      placeInView(i, dist, angleDeg = 0, facePlayer = true) {
        const pl = ctx.player;
        const h = pl.yaw - (angleDeg * Math.PI) / 180;
        const x = pl.position.x - Math.sin(h) * dist;
        const z = pl.position.z - Math.cos(h) * dist;
        self.sim?.place(i, x, z, facePlayer ? headingTo(pl.position.x - x, pl.position.z - z) : undefined);
      },
      freeze(on = true) {
        if (self.sim) self.sim.frozen = on;
      },
      horn(signal) {
        const s = self.sim;
        const p = ctx.player.position;
        self.onSimEvent({ type: 'horn', signal, x: s?.leader.x ?? p.x, z: s?.leader.z ?? p.z }, s ?? (null as unknown as PackSim));
      },
      catch() {
        const s = self.sim;
        if (!s || s.caught) return;
        const p = ctx.player.position;
        let best = 0;
        s.agents.forEach((a, i) => {
          if (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(s.agents[best]!.x - p.x, s.agents[best]!.z - p.z)) best = i;
        });
        s.force('chasing');
        s.caught = { by: best, t: 0 };
        self.caughtBy = s.agents[best]!;
        self.beginCaught();
      },
      events() {
        return self.log.slice();
      },
      sim() {
        return self.sim;
      },
    };
    window.kq.lantern = {
      toggle(on) {
        const L = self.slice().lantern;
        return self.setLit(on ?? !L.lit, false);
      },
      setOil(v) {
        const L = self.slice().lantern;
        L.oil = Math.max(0, Math.min(1, v));
        ctx.events.emit('lantern:oil', { oil: L.oil });
      },
      refill() {
        self.refill();
      },
      setSeconds(s) {
        self.slice().lantern.seconds = s;
      },
      state() {
        return { ...self.slice().lantern, light: self.lanternView.light };
      },
    };
  }

  dispose(): void {
    this.visuals.object.removeFromParent();
    this.visuals.dispose();
    this.lanternView.dispose();
    this.overlay.dispose();
  }
}

let hunt: Hunt | null = null;

export default defineSystem({
  id: 'hunt',
  init(ctx) {
    hunt = new Hunt(ctx);
  },
  update(dt) {
    hunt?.update(dt);
  },
  frame(dt) {
    hunt?.frame(dt);
  },
  dispose() {
    hunt?.dispose();
    hunt = null;
  },
});
