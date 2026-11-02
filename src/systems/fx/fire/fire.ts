/**
 * Fire threat controller (era 1793-07): schedule + sim (gameplay, fixed step) + visuals + 3D
 * audio + captions + smoke screen. Driven by 'threat:configure' {kind:'fire'}.
 */
import { Color, type Mesh, type ShaderMaterial, Vector3 } from 'three';
import type { Loop } from '../../../audio/synth';
import type { Source3D } from '../../../audio/audio';
import type { GameContext } from '../../../core/context';
import { atmosphere } from '../../../world/atmosphere';
import { cough, crackle, fireRoar, rumble } from '../audio';
import { makeScreenPass, pointScale } from '../gl';
import type { Quality } from '../quality';
import type { FxUI } from '../ui';
import { ATMOS_GLSL } from '../../../world/atmosphere';
import { SRC_STRIDE, buildEmitters } from './emitters';
import { FireMap, rasterizeUnits } from './firemap';
import { PalaceFireGlow } from './palaceGlow';
import { FIRE_BASE_SECONDS, FIRE_CENTER, type FireUnit, createFireSchedule, sootAt } from './schedule';
import { type Exposure, FireSim } from './sim';
import { FireVisuals } from './visuals';

const SMOKE_SCREEN = /* glsl */ `
${ATMOS_GLSL}
uniform float uAmount;
varying vec2 vUv;
void main() {
  if (uAmount < 0.001) discard;
  vec2 q = vUv - 0.5;
  float r = length(q * vec2(1.5, 1.0));
  float n = kqFbm(vUv * vec2(3.0, 2.2) + vec2(uTime * 0.04, -uTime * 0.11));
  float n2 = kqFbm(vUv * 7.0 + vec2(-uTime * 0.07, -uTime * 0.2));
  float edge = smoothstep(0.75 - uAmount * 0.75, 1.05 - uAmount * 0.45, r + (n - 0.5) * 0.5);
  float a = clamp(edge * (0.4 + 0.6 * uAmount) + uAmount * uAmount * 0.55 * (0.7 + 0.3 * n2), 0.0, 0.97);
  vec3 col = mix(vec3(0.03, 0.026, 0.022), vec3(0.2, 0.09, 0.035), smoothstep(0.3, 0.8, n) * (1.0 - q.y));
  gl_FragColor = vec4(col, a);
}
`;

export interface FireConfig {
  seconds: number;
  center: { x: number; z: number };
  radius: number;
}

export interface FireSlice {
  active: boolean;
  clock: number;
  seconds: number;
  cx: number;
  cz: number;
  radius: number;
}

export class FireController {
  sim: FireSim | null = null;
  visuals: FireVisuals | null = null;
  private glow: PalaceFireGlow | null = null;
  units: FireUnit[] = [];
  exposure: Exposure = { inside: -1, state: 'none', density: 0, heat: 0, nearest: Infinity };
  /** Camera heat 0..1 (shimmer). */
  heat = 0;
  /** 0..1 how much of the palace is ablaze (glow, audio). */
  blaze = 0;
  /** 0..1 orange flash of a collapse (decays; composed into post.uFlash by the system). */
  flash = 0;
  private cfg: FireConfig | null = null;
  private lastProgress = -1;
  private caughtCooldown = 0;
  private coughTimer = 2;
  private crackleTimer = 0;
  private audioTimer = 0;
  private roars: { src: Source3D; loop: Loop }[] = [];
  private shake = 0;
  private readonly screen: Mesh;
  private readonly glowBase = new Color('#ff5a14').multiplyScalar(1.5);
  private readonly tmp = new Vector3();
  private pendingCollapses: number[] = [];

  constructor(
    private readonly ctx: GameContext,
    private readonly ui: FxUI,
    private readonly quality: Quality,
  ) {
    this.screen = makeScreenPass(SMOKE_SCREEN, { ...atmosphere, uAmount: { value: 0 } }, 950);
    ctx.scene.add(this.screen);
  }

  get active(): boolean {
    return this.sim !== null;
  }

  get progress(): number {
    return this.sim?.progress ?? 0;
  }

  /** Start (or update) the fire. A running fire keeps its clock. */
  start(cfg: FireConfig, clock = 0): void {
    const sameArea = this.cfg && this.cfg.center.x === cfg.center.x && this.cfg.center.z === cfg.center.z && this.cfg.radius === cfg.radius;
    if (this.sim && sameArea) {
      this.sim.seconds = cfg.seconds;
      this.cfg = cfg;
      return;
    }
    this.stop(true);
    this.cfg = cfg;
    const d = this.ctx.data;
    this.units = createFireSchedule(d.rooms, d.footprints.buildings, { center: cfg.center, radius: cfg.radius });
    this.sim = new FireSim(this.units, cfg.seconds);
    this.glow = new PalaceFireGlow(this.ctx.world.palace.material, new FireMap(rasterizeUnits(this.units)));
    this.buildVisuals();
    const changes = this.sim.setClock(clock);
    for (const c of changes) this.ctx.events.emit('fire:room', { roomId: c.unit.id, state: c.state });
    this.lastProgress = -1;
    this.startAudio();
    this.ui.setGauge('smoke', 0);
    this.ui.caption('fx.cap.fire', 2, 3500);
  }

  private buildVisuals(): void {
    if (this.visuals) {
      this.ctx.scene.remove(this.visuals.object);
      this.visuals.dispose();
    }
    const em = buildEmitters(this.units, this.ctx.data.footprints.buildings);
    this.visuals = new FireVisuals(em, this.units.length, this.quality.high, !this.glow?.ok);
    this.ctx.scene.add(this.visuals.object);
  }

  /** Quality changed: rebuild the particle buffers. */
  rebuild(): void {
    if (this.sim) this.buildVisuals();
  }

  stop(silent = false): void {
    if (!this.sim) return;
    this.sim = null;
    if (this.visuals) {
      this.ctx.scene.remove(this.visuals.object);
      this.visuals.dispose();
      this.visuals = null;
    }
    for (const r of this.roars) {
      r.loop.stop(1.5);
      setTimeout(() => r.src.dispose(), 2000);
    }
    this.roars = [];
    this.glow?.dispose();
    this.glow = null;
    this.ctx.world.palace.uniforms.uChar!.value = 0;
    this.screen.visible = false;
    this.ui.setGauge('smoke', null);
    this.heat = 0;
    this.blaze = 0;
    // give the era its own glow back
    const L = this.ctx.world.look.glow;
    atmosphere.uGlowColor.value.set(L.color).multiplyScalar(L.intensity);
    atmosphere.uGlowPos.value.set(1262, 360, -1126);
    if (!silent) this.cfg = null;
  }

  setClock(t: number): void {
    if (!this.sim) return;
    const changes = this.sim.setClock(t);
    this.handleChanges(changes);
  }

  /**
   * Re-announce every room that is not 'none' (`fire:room`): systems that were not listening when
   * a saved fire resumed during init (interiors) catch up at game:start.
   */
  replay(): void {
    if (!this.sim) return;
    this.sim.states.forEach((s, i) => {
      if (s !== 'none') this.ctx.events.emit('fire:room', { roomId: this.units[i]!.id, state: s });
    });
  }

  setHold(hold: boolean): void {
    if (this.sim) this.sim.hold = hold;
  }

  slice(): FireSlice | null {
    if (!this.sim || !this.cfg) return null;
    return { active: true, clock: this.sim.clock, seconds: this.sim.seconds, cx: this.cfg.center.x, cz: this.cfg.center.z, radius: this.cfg.radius };
  }

  private handleChanges(changes: ReturnType<FireSim['advance']>): void {
    const ctx = this.ctx;
    for (const c of changes) {
      ctx.events.emit('fire:room', { roomId: c.unit.id, state: c.state });
      if (c.state === 'collapsed') {
        this.pendingCollapses.push(c.index);
        // a roof coming down on the player: a lungful of smoke and dust
        if (this.sim && this.exposure.inside === c.index) this.sim.hit();
      }
    }
  }

  /** Fixed step: clock, rooms, the player's smoke meter. Returns true if the player was caught. */
  update(dt: number): boolean {
    const sim = this.sim;
    if (!sim) return false;
    const ctx = this.ctx;
    const pl = ctx.player.position;
    this.exposure = sim.exposure(pl.x, pl.y, pl.z);
    this.handleChanges(sim.advance(dt));
    const p = Math.floor(sim.progress * 100);
    if (p !== this.lastProgress) {
      this.lastProgress = p;
      ctx.events.emit('fire:progress', { t: sim.progress });
    }
    this.exposure = sim.exposure(pl.x, pl.y, pl.z);
    if (this.caughtCooldown > 0) {
      this.caughtCooldown -= dt;
      sim.smoke = Math.max(0, sim.smoke - dt / 3);
      return false;
    }
    const low = ctx.player.stance !== 'stand';
    const full = sim.breathe(dt, this.exposure, low, ctx.settings.state.gentleMode);
    if (full) {
      this.caughtCooldown = 6;
      ctx.events.emit('player:caught', { by: 'fire' });
      // the story shows its own caught curtain; the card is only for a game without one
      if (!ctx.systems.get('story')) this.ui.showCard(ctx.t('fx.caught.fire'));
      return true;
    }
    return false;
  }

  private startAudio(): void {
    const am = this.ctx.audio;
    this.ctx.audio.onUnlock(() => {
      if (!this.sim || this.roars.length) return;
      for (let i = 0; i < 3; i++) {
        const src = am.createSource3D('sfx', { refDistance: 14, rolloff: 0.9 });
        if (!src) return;
        this.roars.push({ src, loop: fireRoar(am, src.input) });
      }
    });
  }

  /** Per frame: visuals, glow, audio, overlay. */
  frame(dt: number): void {
    const sim = this.sim;
    const vis = this.visuals;
    if (!sim || !vis) return;
    const ctx = this.ctx;
    const now = atmosphere.uTime.value;
    // collapses queued by the fixed step: sparks, rumble, caption, shake
    for (const i of this.pendingCollapses) {
      const u = this.units[i]!;
      vis.collapse(i, u.cx, u.eaves + 1, u.cz, now);
      const d = this.tmp.set(u.cx, u.eaves, u.cz).distanceTo(ctx.camera.position);
      const src = ctx.audio.createSource3D('sfx', { refDistance: 25, rolloff: 0.7 });
      if (src) {
        src.setPosition(u.cx, u.eaves, u.cz);
        rumble(ctx.audio, src.input, 1);
        setTimeout(() => src.dispose(), 5000);
      }
      if (d < 260) {
        this.ui.caption('fx.cap.collapse', 4, 2800);
        this.shake = Math.max(this.shake, Math.max(0, 1 - d / 160));
        this.flash = Math.max(this.flash, Math.max(0.2, 1 - d / 200));
      }
    }
    this.pendingCollapses.length = 0;
    // per-room look + glow centroid
    let sum = 0;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    let hottest = Infinity;
    const cam = ctx.camera.position;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      const I = sim.intensity(i);
      vis.setUnit(i, I, sim.smokeOf(i));
      if (I > 0) {
        const w = I * (u.top ? 1.5 : 1);
        sum += w;
        gx += u.cx * w;
        gy += u.eaves * w;
        gz += u.cz * w;
        hottest = Math.min(hottest, Math.hypot(u.cx - cam.x, u.cz - cam.z) / Math.max(0.3, I));
      }
    }
    vis.frame(dt, pointScale(ctx.camera, ctx.renderer));
    if (this.glow) {
      const k = sim.clock;
      this.glow.update((i) => sim.intensity(i), (i) => sootAt(this.units[i]!, k, sim.seconds), 1);
    }
    this.blaze = Math.min(1, sum / 30);
    const flick = 0.82 + 0.1 * Math.sin(now * 7.3) + 0.08 * Math.sin(now * 13.1 + 1.3) + 0.06 * Math.sin(now * 2.1);
    if (sum > 0) {
      atmosphere.uGlowPos.value.set(gx / sum, gy / sum + 6, gz / sum);
      atmosphere.uGlowColor.value.copy(this.glowBase).multiplyScalar((0.2 + 0.7 * this.blaze) * flick);
    } else {
      atmosphere.uGlowColor.value.copy(this.glowBase).multiplyScalar(0.12);
    }
    // heat shimmer near the flames (also from the camera, e.g. spirit view)
    this.heat = sum > 0 ? Math.max(0, Math.min(1, 1 - (hottest - 15) / 90)) : 0;
    // smoke screen
    const amount = Math.max(0, sim.smoke * 1.05 - 0.05);
    this.screen.visible = amount > 0.001;
    (this.screen.material as ShaderMaterial).uniforms.uAmount!.value = amount;
    this.ui.setGauge('smoke', this.exposure.state !== 'none' || sim.smoke > 0.01 ? sim.smoke : 0);
    // camera shake (not with reduced motion)
    if (this.shake > 0.001 && !ctx.settings.state.reducedMotion) {
      const s = this.shake * 0.12;
      ctx.camera.position.x += (Math.random() - 0.5) * s;
      ctx.camera.position.y += (Math.random() - 0.5) * s;
      ctx.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.shake = Math.max(0, this.shake - dt * 1.2);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.frameAudio(dt);
  }

  private frameAudio(dt: number): void {
    const ctx = this.ctx;
    const sim = this.sim!;
    const em = this.visuals!.emitters;
    if (!ctx.audio.unlocked || !this.roars.length) return;
    this.audioTimer -= dt;
    const cam = ctx.camera.position;
    if (this.audioTimer <= 0) {
      this.audioTimer = 0.5;
      // the three loudest sources near the listener
      const cands: { i: number; x: number; y: number; z: number; v: number }[] = [];
      for (let s = 0; s < em.counts.sources; s++) {
        const o = s * SRC_STRIDE;
        const I = sim.intensity(em.sources[o + 4]!);
        if (I <= 0) continue;
        const x = em.sources[o]!;
        const y = em.sources[o + 1]!;
        const z = em.sources[o + 2]!;
        const d = Math.hypot(x - cam.x, z - cam.z);
        cands.push({ i: s, x, y, z, v: I / (1 + d / 40) });
      }
      cands.sort((a, b) => b.v - a.v);
      this.roars.forEach((r, k) => {
        const c = cands[k];
        if (!c) {
          r.loop.setIntensity(0);
          return;
        }
        r.src.setPosition(c.x, c.y, c.z);
        r.loop.setIntensity(Math.min(1, sim.intensity(em.sources[c.i * SRC_STRIDE + 4]!) * 1.1));
      });
      if (cands.length && this.heat > 0.55) this.ui.caption('fx.cap.fireNear', 12, 2600);
      else if (cands.length) this.ui.caption('fx.cap.fire', 20, 2600);
    }
    this.crackleTimer -= dt;
    if (this.crackleTimer <= 0) {
      this.crackleTimer = 0.12 + Math.random() * 0.3;
      const r = this.roars[Math.floor(Math.random() * this.roars.length)]!;
      crackle(ctx.audio, r.src.input, 0.4 + this.blaze * 0.6);
    }
    // coughing when the smoke gets thick
    this.coughTimer -= dt;
    if (sim.smoke > 0.35 && this.coughTimer <= 0) {
      this.coughTimer = 2.2 + Math.random() * 2.5 - sim.smoke;
      cough(ctx.audio, ctx.audio.bus('sfx'));
      this.ui.caption('fx.cap.cough', 6, 1800);
    }
  }

  dispose(): void {
    this.stop();
    this.ctx.scene.remove(this.screen);
  }
}

/** Default fire config for a 'threat:configure' payload. */
export function fireConfig(p: { center?: { x: number; z: number }; radius?: number; seconds?: number }, gentle: boolean): FireConfig {
  const base = p.seconds ?? FIRE_BASE_SECONDS;
  return { seconds: gentle ? base * 1.5 : base, center: p.center ?? { ...FIRE_CENTER }, radius: p.radius ?? 110 };
}
