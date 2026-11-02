/**
 * fx — the WOW effects and the fire / oblivion threats.
 *
 *  1. Era SHIFT on 'shift:request' {to, instant?}: ~3.5 s LiDAR scan-wave transition (reduced
 *     motion: 1.4 s crossfade; instant: none). Emits shift:begin → shift:midpoint (era already
 *     switched with ctx.era.set) → shift:done. Counts state.meta.shifts.
 *     Q key (only when no story system is registered; otherwise the story owns Q):
 *     fx emits 'shift:request' only if the STORY allows it, via state flags:
 *        flags['shift.allowed'] === true  and  flags['shift.target'] = an Era ('1789', …)
 *     If flags['shift.allowed'] === false, Q shows "Die Bussole schweigt hier." (undefined: Q is
 *     silent, free for the story's own use, e.g. "hold Q to return").
 *  2. SCAN PULSE when 'scan:mode' turns 1–3.
 *  3. FIRE on 'threat:configure' {kind:'fire', active, center?, radius?, seconds?}: spreads over
 *     the catalogue rooms (bible timeline, 300 s base scaled to `seconds`, ×1.5 in gentle mode),
 *     emits fire:room / fire:progress; smoke meter → 'player:caught' {by:'fire'}.
 *     Story hold (bible W5, the Festsaal choice): flags['fire.hold'] = true stops the fire clock.
 *  4. OBLIVION on 'threat:configure' {kind:'oblivion', active, seconds?}: Steinfraß; emits
 *     oblivion:progress; full → 'player:caught' {by:'oblivion'}. Remembering pushes it back:
 *     'clue:found' (−0.15), 'echo:start' (−0.10), 'oblivion:remember' {amount?} (story, e.g. a
 *     marked stone).
 *  5. Era ambience particles (snow, fireflies/pollen, ash/embers, mist + motes).
 *
 * The fire stops by itself when the era leaves 1793-07, oblivion when it leaves 1796.
 * Debug: window.kq.fx (see FxHooks). URL: ?fxq=low|high (quality).
 */
import { Color } from 'three';
import type { GameContext } from '../../core/context';
import { type Era, isEra } from '../../core/era';
import { defineSystem } from '../../core/systems';
import type { ThreatConfig } from '../contracts';
import { AmbientParticles } from './ambient/ambient';
import { scanPing } from './audio';
import { type FireSlice, FireController, fireConfig } from './fire/fire';
import { smoothstep } from './geom';
import { pointScale } from './gl';
import { type OblivionSlice, OblivionController } from './oblivion/oblivion';
import { Quality, type QualityLevel } from './quality';
import { ScanPulse } from './scan/pulse';
import { ShiftEffect } from './shift/shift';
import './strings';
import { FxUI } from './ui';

export interface FxSlice {
  fire: FireSlice | null;
  oblivion: OblivionSlice | null;
}

declare module '../../core/state' {
  interface SystemStates {
    fx: FxSlice;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** Story → fx: the player remembered something (marked stone …); pushes the Steinfraß back. */
    'oblivion:remember': { amount?: number };
  }
}

export interface FxHooks {
  /** Era shift with the full effect; resolves when done. */
  shift(era: Era, opts?: { instant?: boolean; reduced?: boolean }): Promise<void>;
  /** Freeze the shift at effect time t (s) for screenshots (crossing 1.75 s switches the era). */
  shiftAt(t: number): void;
  /** Freeze / unfreeze all fx clocks driven by real time (shift, pulse). */
  freeze(on: boolean): void;
  fire(on: boolean, opts?: { seconds?: number; clock?: number; center?: { x: number; z: number }; radius?: number }): void;
  /** Jump the fire clock to t seconds. */
  fireTime(t: number): void;
  oblivion(on: boolean, opts?: { seconds?: number; t?: number }): void;
  /** Set the oblivion meter 0..1. */
  oblivionT(t: number): void;
  /** Scan pulse (mode 1–3); optional `t` holds it at that time. */
  pulse(mode?: number, t?: number): void;
  quality(q: QualityLevel | 'auto'): void;
  state(): {
    shift: { active: boolean; t: number; from: Era; to: Era };
    fire: { active: boolean; progress: number; clock: number; smoke: number; burning: number; collapsed: number; units: number };
    oblivion: { active: boolean; t: number };
    quality: QualityLevel;
  };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    fx?: FxHooks;
  }
}

const FLASH_FIRE = new Color(0.1, 0.038, 0.01);

let ui: FxUI | null = null;
let quality: Quality;
let shift: ShiftEffect;
let pulse: ScanPulse;
let fire: FireController;
let obl: OblivionController;
let ambient: AmbientParticles;
let pulseHold = false;
let frozen = false;
let postOwned = false;
let deniedAt = -1e9;
let sliceTimer = 0;
let hooksInstalled = false;

function slice(ctx: GameContext): FxSlice {
  return ctx.state.slice('fx', () => ({ fire: null, oblivion: null }));
}

function doShift(ctx: GameContext, to: Era, instant: boolean, reduced: boolean, reason?: string): Promise<void> {
  if (instant) {
    if (shift.active) shift.finish();
    const from = ctx.era.current;
    ctx.events.emit('shift:begin', { from, to });
    ctx.era.set(to);
    ctx.events.emit('shift:midpoint', { from, to });
    // being carried home after a capture is not a shift the player made (round 2)
    if (reason !== 'caught') ctx.state.mutable.meta.shifts++;
    ctx.events.emit('shift:done', { from, to });
    return Promise.resolve();
  }
  return shift.start(to, { reduced });
}

function configureThreat(ctx: GameContext, c: ThreatConfig): void {
  const gentle = ctx.settings.state.gentleMode;
  if (c.kind === 'fire') {
    if (c.active) fire.start(fireConfig(c, gentle));
    else fire.stop();
  } else if (c.kind === 'oblivion') {
    const base = c.seconds ?? 150;
    if (c.active) obl.start(gentle ? base * 1.5 : base);
    else obl.stop();
  }
}

function installHooks(ctx: GameContext): void {
  const kq = window.kq;
  if (!kq || hooksInstalled) return;
  hooksInstalled = true;
  const hooks: FxHooks = {
    shift(era, opts = {}) {
      if (!isEra(era)) throw new Error(`unknown era '${era}'`);
      return doShift(ctx, era, !!opts.instant, opts.reduced ?? ctx.settings.state.reducedMotion);
    },
    shiftAt(t) {
      shift.frozen = true;
      shift.setTime(t);
    },
    freeze(on) {
      frozen = on;
      shift.frozen = on;
      pulseHold = on;
    },
    fire(on, opts = {}) {
      if (!on) {
        fire.stop();
        return;
      }
      fire.start(fireConfig({ seconds: opts.seconds, center: opts.center, radius: opts.radius }, ctx.settings.state.gentleMode), opts.clock ?? 0);
    },
    fireTime(t) {
      fire.setClock(t);
    },
    oblivion(on, opts = {}) {
      if (!on) {
        obl.stop();
        return;
      }
      obl.start(opts.seconds ?? 150, opts.t ?? 0);
    },
    oblivionT(t) {
      obl.setProgress(t);
    },
    pulse(mode = 2, t) {
      const p = ctx.player.position;
      pulse.trigger(ctx.world.heightfield, p.x, p.z, mode, ctx.settings.state.reducedMotion, quality.high);
      if (t !== undefined) {
        pulseHold = true;
        pulse.setTime(t);
      }
    },
    quality(q) {
      quality.set(q);
    },
    state() {
      const sim = fire.sim;
      return {
        shift: { active: shift.active, t: shift.t, from: shift.from, to: shift.to },
        fire: {
          active: fire.active,
          progress: fire.progress,
          clock: sim?.clock ?? 0,
          smoke: sim?.smoke ?? 0,
          burning: sim ? sim.states.filter((s) => s === 'burning').length : 0,
          collapsed: sim ? sim.states.filter((s) => s === 'collapsed').length : 0,
          units: sim?.units.length ?? 0,
        },
        oblivion: { active: obl.active, t: obl.progress },
        quality: quality.level,
      };
    },
  };
  kq.fx = hooks;
}

export default defineSystem({
  id: 'fx',
  init(ctx) {
    ui = new FxUI(ctx);
    quality = new Quality(ctx.params.get('fxq'));
    if (ctx.params.has('manual')) quality.auto = false; // deterministic tests
    shift = new ShiftEffect(ctx, ui, quality);
    pulse = new ScanPulse();
    ctx.scene.add(pulse.mesh);
    fire = new FireController(ctx, ui, quality);
    obl = new OblivionController(ctx, ui, quality);
    ambient = new AmbientParticles(ctx.world);
    ctx.scene.add(ambient.object);
    quality.onChange(() => fire.rebuild());
    // settings → Grafikqualität (skills system's settings rows): low/high pins the level, unset = auto
    const applyGraphics = () => {
      const g = (ctx.settings.state as { graphics?: 'low' | 'high' }).graphics;
      if (g === 'low' || g === 'high') quality.set(g);
    };
    if (!ctx.params.has('fxq')) applyGraphics();
    ctx.events.on('settings:change', ({ key }) => key === 'graphics' && applyGraphics());

    ctx.events.on('shift:request', ({ to, instant, reason }) => {
      if (!isEra(to)) return;
      if (shift.active && !instant) return; // one shift at a time
      void doShift(ctx, to, !!instant, ctx.settings.state.reducedMotion, reason);
    });
    ctx.events.on('scan:mode', ({ mode }) => {
      if (mode < 1 || mode > 3) return;
      const p = ctx.player.position;
      pulseHold = false;
      pulse.trigger(ctx.world.heightfield, p.x, p.z, mode, ctx.settings.state.reducedMotion, quality.high);
      scanPing(ctx.audio, ctx.audio.bus('sfx'));
    });
    ctx.events.on('threat:configure', (c) => configureThreat(ctx, c));
    ctx.events.on('era:change', ({ to }) => {
      if (to !== '1793-07') fire.stop();
      if (to !== '1796') obl.stop();
    });
    ctx.events.on('clue:found', () => obl.remember(0.15));
    ctx.events.on('echo:start', () => obl.remember(0.1));
    ctx.events.on('oblivion:remember', ({ amount }) => obl.remember(amount ?? 0.15));
    ctx.events.on('save:loaded', () => resume(ctx));
    // a fire resumed during init ran before later systems (interiors) listened: tell them again
    ctx.events.on('game:start', () => fire.replay());
    resume(ctx);
  },

  update(dt, ctx) {
    // Q: the story decides whether the compass may shift here. With a story system present the
    // story owns the key itself (anchor radius, "hold Q to return") and sends 'shift:request'.
    if (!ctx.systems.get('story') && ctx.input.wasPressed('shift') && !shift.active) {
      const flags = ctx.state.state.flags;
      const target = flags['shift.target'];
      if (flags['shift.allowed'] === true && isEra(target)) {
        ctx.events.emit('shift:request', { to: target, reason: 'key' });
      } else if (flags['shift.allowed'] === false && ctx.loop.time - deniedAt > 4) {
        deniedAt = ctx.loop.time;
        ctx.ui.toast(ctx.t('fx.shift.denied'));
      }
    }
    if (ctx.state.state.flags['fire.hold'] !== undefined) fire.setHold(ctx.state.state.flags['fire.hold'] === true);
    fire.update(dt);
    obl.update(dt);
    sliceTimer -= dt;
    if (sliceTimer <= 0) {
      sliceTimer = 1;
      const s = slice(ctx);
      s.fire = fire.slice();
      s.oblivion = obl.slice();
    }
  },

  frame(dt, ctx) {
    installHooks(ctx);
    if (quality.sample(dt)) fire.rebuild();
    if (!frozen) shift.advance(dt);
    else if (shift.active) shift.advance(0);
    if (!pulseHold) pulse.frame(dt);
    fire.frame(dt);
    obl.frame(dt);
    // ambience: era layers, hidden in the void of a shift, ash rising in the Steinfraß
    ambient.setEra(ctx.era.current, quality.high);
    let fade = 1;
    if (shift.active) fade = 1 - smoothstep(0.5, 1.1, shift.t) + smoothstep(2.4, 3.2, shift.t);
    ambient.up = obl.active ? smoothstep(0.05, 0.3, obl.vis) : 0;
    const nearFire = fire.active ? fire.blaze : 0;
    ambient.frame(pointScale(ctx.camera, ctx.renderer), Math.max(0, Math.min(1, fade)), nearFire);
    // post-processing: only touch what fx contributes (other features may use these too)
    const pu = ctx.post.uniforms;
    const heat = fire.heat * (quality.high ? 1 : 0.6) * (ctx.settings.state.reducedMotion ? 0.3 : 1);
    pu.uHeat!.value = heat;
    if (!shift.active) {
      const contributes = fire.flash > 0.001 || obl.vis > 0.001;
      if (contributes || postOwned) {
        (pu.uFlash!.value as Color).copy(FLASH_FIRE).multiplyScalar(fire.flash);
        pu.uDesaturate!.value = obl.active ? 0.6 * obl.vis : 0;
        pu.uShift!.value = 0;
      }
      postOwned = contributes;
    } else postOwned = true;
  },

  dispose() {
    shift?.dispose();
    pulse?.dispose();
    fire?.dispose();
    obl?.dispose();
    ambient?.dispose();
    ui?.dispose();
  },
});

/** Resume threats from the saved slice (after a reload). */
function resume(ctx: GameContext): void {
  const s = slice(ctx);
  if (s.fire?.active && ctx.era.current === '1793-07') {
    fire.start({ seconds: s.fire.seconds, center: { x: s.fire.cx, z: s.fire.cz }, radius: s.fire.radius }, s.fire.clock);
  }
  if (s.oblivion?.active && ctx.era.current === '1796') obl.start(s.oblivion.seconds, s.oblivion.t);
}
