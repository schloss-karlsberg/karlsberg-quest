/**
 * Steinfraß (era 1796, W7 "Die Steine lösen sich auf"): the ruin's stones dissolve — they do not
 * fall, they rise as grey grains like ash falling back into the sky — the 2025 LiDAR relief shows
 * through, and a grey ash fog closes in from the edge of the world. Full meter = caught.
 */
import {
  BackSide,
  Color,
  type Mesh,
  Mesh as ThreeMesh,
  NormalBlending,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Loop } from '../../../audio/synth';
import type { GameContext } from '../../../core/context';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';
import { grainLoop } from '../audio';
import { makeScreenPass, pointScale } from '../gl';
import { patchPalace } from '../palacePatch';
import { lerp, smoothstep } from '../geom';
import type { Quality } from '../quality';
import { buildTerrainCloud, palaceCloudGeometry, palaceSamples } from '../shift/pointcloud';
import { ruinForCut } from '../shift/timeline';
import type { FxUI } from '../ui';
import { EdgeDust } from './dust';
import { OblivionSim, oblivionRadius } from './sim';

const ASH = new Color('#9c9a94');
/** Spatial dissolve: walls between NEAR·R and FAR·R from the player sink by up to DROP m. */
const DROP = 6;
const NEAR = '0.3';
const FAR = '0.8';

const PALACE_PATCH = {
  id: 'uOblR',
  decl: /* glsl */ `
uniform vec3 uOblC;
uniform float uOblR;
uniform float uOblOn;
`,
  before: [
    [
      'if (vWorld.y > stub) discard;',
      /* glsl */ `if (uOblOn > 0.0) stub -= uOblOn * ${DROP.toFixed(1)} * smoothstep(uOblR * ${NEAR}, uOblR * ${FAR}, length(vWorld.xz - uOblC.xz));`,
    ] as [string, string],
  ],
};

const SHELL_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHELL_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uAsh;
uniform float uAlpha;
uniform float uLayer;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  float az = atan(vDir.z, vDir.x);
  // rising curtains of grey grain
  float n = kqFbm(vec2(az * 6.0 + uLayer * 3.1, vDir.y * 5.0 - uTime * 0.18));
  float g = kqNoise(vec2(az * 140.0, vDir.y * 90.0 - uTime * 2.5 - uLayer * 7.0));
  float a = uAlpha * mix(0.55, 1.0, n) * (uLayer > 0.5 ? smoothstep(0.25, 0.65, n) : 1.0);
  vec3 col = uAsh * (0.82 + 0.3 * n) + vec3(0.12) * smoothstep(0.88, 1.0, g);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

const GRAIN_VERT = /* glsl */ `
uniform float uTime;
uniform float uCut;
uniform vec3 uCenter;
uniform float uR;
uniform float uAlpha;
uniform float uScale;
attribute float aBase;
attribute float aRand;
varying float vAlpha;
void main() {
  float rel = position.y - aBase;
  // the same cut as the palace shader: lower towards the grey edge
  float cut = uCut - ${DROP.toFixed(1)} * smoothstep(uR * ${NEAR}, uR * ${FAR}, length(position.xz - uCenter.xz));
  // the top layer of what is left comes loose; what is already gone stops streaming
  float loose = smoothstep(cut - 2.4, cut - 0.2, rel) * smoothstep(-1.2, 0.0, cut);
  float life = 3.5 + 4.0 * aRand;
  float age = fract(uTime / life + aRand * 7.31);
  vec3 p = position;
  p.y = aBase + min(rel, cut) + age * age * (8.0 + 16.0 * aRand) + age * 2.0;
  p.x += sin(uTime * 0.7 + aRand * 40.0) * age * 1.6;
  p.z += cos(uTime * 0.6 + aRand * 33.0) * age * 1.6;
  vAlpha = uAlpha * loose * smoothstep(0.0, 0.12, age) * (1.0 - age);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = vAlpha < 0.01 ? 0.0 : clamp((0.2 + 0.2 * aRand) * uScale / max(-mv.z, 0.5), 1.5, 7.0);
  gl_Position = projectionMatrix * mv;
}
`;

const GRAIN_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  float k = 1.0 - dot(c, c) * 2.5;
  gl_FragColor = vec4(vec3(0.93, 0.91, 0.86) * k, vAlpha);
}
`;

/** Today's relief (2025 DTM) as an ink-grey point cloud inside the grey zone. */
const RELIEF_VERT = /* glsl */ `
uniform vec3 uCenter;
uniform float uR;
uniform float uAlpha;
uniform float uScale;
attribute float aShade;
attribute float aRand;
varying float vAlpha;
varying float vShade;
void main() {
  vec3 p = position;
  p.y += 0.4;
  float d = length(p.xz - uCenter.xz);
  vAlpha = uAlpha * smoothstep(uR * 0.25, uR * 0.55, d) * (1.0 - smoothstep(uR * 0.9, uR * 1.0, d));
  vShade = aShade;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = vAlpha < 0.01 ? 0.0 : clamp(0.3 * uScale / max(-mv.z, 0.5), 1.0, 4.0);
  gl_Position = projectionMatrix * mv;
}
`;

const RELIEF_FRAG = /* glsl */ `
varying float vAlpha;
varying float vShade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(mix(vec3(0.05, 0.055, 0.07), vec3(0.5, 0.51, 0.5), vShade), vAlpha);
}
`;

const VIGNETTE = /* glsl */ `
${ATMOS_GLSL}
uniform float uAmount;
uniform vec3 uAsh;
varying vec2 vUv;
void main() {
  if (uAmount < 0.001) discard;
  vec2 q = vUv - 0.5;
  float r = length(q * vec2(1.6, 1.0));
  float n = kqFbm(vUv * vec2(4.0, 3.0) + vec2(0.0, -uTime * 0.08));
  float grains = smoothstep(0.86, 1.0, kqNoise(vUv * vec2(240.0, 140.0) + vec2(0.0, -uTime * 9.0)));
  float edge = smoothstep(0.95 - uAmount * 0.8, 1.15 - uAmount * 0.55, r + (n - 0.5) * 0.4);
  float a = clamp(edge * 0.95 + grains * edge * 0.3, 0.0, 0.98);
  gl_FragColor = vec4(uAsh * (0.85 + 0.25 * n), a);
}
`;

export interface OblivionSlice {
  active: boolean;
  t: number;
  seconds: number;
}

export class OblivionController {
  sim: OblivionSim | null = null;
  private lastProgress = -1;
  private caughtCooldown = 0;
  private readonly shells: Mesh[] = [];
  private grains: Points | null = null;
  private dust: EdgeDust | null = null;
  private readonly offQuality: () => void;
  private relief: Points | null = null;
  private readonly reliefCenter = new Vector3(1e9, 0, 1e9);
  private readonly vignette: Mesh;
  private loop: Loop | null = null;
  /** Smoothed visual amount (0..1) so remembering eases the grey back instead of snapping. */
  vis = 0;
  private stillTime = 0;
  private patched = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly ui: FxUI,
    private readonly quality: Quality,
  ) {
    for (let k = 0; k < 2; k++) {
      const m = new ShaderMaterial({
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        uniforms: { ...atmosphere, uAsh: { value: ASH.clone() }, uAlpha: { value: 0 }, uLayer: { value: k } },
        side: BackSide,
        transparent: true,
        depthWrite: false,
      });
      const s = new ThreeMesh(new SphereGeometry(1, 48, 24), m);
      s.frustumCulled = false;
      s.renderOrder = 60 + k;
      s.visible = false;
      this.shells.push(s);
      ctx.scene.add(s);
    }
    this.vignette = makeScreenPass(VIGNETTE, { ...atmosphere, uAmount: { value: 0 }, uAsh: { value: ASH.clone() } }, 940);
    ctx.scene.add(this.vignette);
    this.offQuality = quality.onChange(() => {
      if (this.active) this.applyQuality();
    });
  }

  get active(): boolean {
    return this.sim !== null;
  }

  get progress(): number {
    return this.sim?.t ?? 0;
  }

  start(seconds: number, t = 0): void {
    if (this.sim) {
      this.sim.seconds = seconds;
      return;
    }
    const pal = this.ctx.world.palace;
    pal.uniforms.uOblC ??= { value: new Vector3() };
    pal.uniforms.uOblR ??= { value: 700 };
    pal.uniforms.uOblOn ??= { value: 0 };
    this.patched = patchPalace(pal.material, PALACE_PATCH);
    this.sim = new OblivionSim(seconds);
    this.sim.t = t;
    this.vis = t;
    this.lastProgress = -1;
    this.caughtCooldown = 0;
    this.buildGrains();
    this.applyQuality();
    this.ui.setGauge('oblivion', t);
    this.ui.caption('fx.cap.oblivion', 2, 3500);
    this.ctx.audio.onUnlock(() => {
      if (!this.sim || this.loop) return;
      this.loop = grainLoop(this.ctx.audio, this.ctx.audio.bus('ambience'));
    });
  }

  private applyQuality(): void {
    this.dust?.dispose();
    this.dust = new EdgeDust(this.ctx, this.quality.high);
    this.ctx.scene.add(this.dust.points);
    if (this.grains) {
      const g = this.grains.geometry;
      const count = g.getAttribute('position').count;
      g.setDrawRange(0, this.quality.high ? count : Math.floor(count * 0.45));
    }
    // Rebuild the terrain cloud at the next frame's camera position with the new ring density.
    this.reliefCenter.set(1e9, 0, 1e9);
  }

  private buildGrains(): void {
    const s = palaceSamples(this.ctx.world.palace.object);
    if (!s || this.grains) return;
    const g = palaceCloudGeometry(s, (rel) => rel < 5.5);
    this.grains = new Points(
      g,
      new ShaderMaterial({
        vertexShader: GRAIN_VERT,
        fragmentShader: GRAIN_FRAG,
        uniforms: { uTime: atmosphere.uTime, uCut: { value: 3 }, uCenter: { value: new Vector3() }, uR: { value: 700 }, uAlpha: { value: 0 }, uScale: { value: 500 } },
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
      }),
    );
    this.grains.frustumCulled = false;
    this.grains.renderOrder = 45;
    this.ctx.scene.add(this.grains);
  }

  private buildRelief(x: number, z: number): void {
    const w = this.ctx.world;
    if (this.relief) {
      this.ctx.scene.remove(this.relief);
      this.relief.geometry.dispose();
    }
    const hf = w.heightfields['2025'];
    const g = buildTerrainCloud(hf, hf, x, z, 380, this.quality.high ? 600 : 320, this.quality.high ? 1.03 : 1.05, 21);
    const mat = this.relief?.material as ShaderMaterial | undefined;
    this.relief = new Points(
      g,
      mat ??
        new ShaderMaterial({
          vertexShader: RELIEF_VERT,
          fragmentShader: RELIEF_FRAG,
          uniforms: { uCenter: { value: new Vector3() }, uR: { value: 700 }, uAlpha: { value: 0 }, uScale: { value: 500 } },
          transparent: true,
          depthWrite: false,
          blending: NormalBlending,
        }),
    );
    this.relief.frustumCulled = false;
    this.relief.renderOrder = 46;
    this.reliefCenter.set(x, 0, z);
    this.ctx.scene.add(this.relief);
  }

  stop(): void {
    if (!this.sim) return;
    this.sim = null;
    for (const s of this.shells) s.visible = false;
    this.vignette.visible = false;
    for (const p of [this.grains, this.relief]) {
      if (!p) continue;
      this.ctx.scene.remove(p);
      p.geometry.dispose();
      (p.material as ShaderMaterial).dispose();
    }
    this.grains = this.relief = null;
    this.dust?.dispose();
    this.dust = null;
    this.reliefCenter.set(1e9, 0, 1e9);
    this.loop?.stop(2);
    this.loop = null;
    this.ui.setGauge('oblivion', null);
    // restore the era look (fog) and the ruin
    this.ctx.world.applyLook();
    this.ctx.world.palace.setMode(this.ctx.era.info.palace);
    if (this.ctx.world.palace.uniforms.uOblOn) this.ctx.world.palace.uniforms.uOblOn.value = 0;
    this.vis = 0;
  }

  setProgress(t: number): void {
    if (!this.sim) return;
    this.sim.t = Math.max(0, Math.min(1, t));
    this.vis = this.sim.t;
  }

  remember(amount: number): void {
    this.sim?.remember(amount);
  }

  slice(): OblivionSlice | null {
    return this.sim ? { active: true, t: this.sim.t, seconds: this.sim.seconds } : null;
  }

  /** Fixed step. Returns true if the player was caught. */
  update(dt: number): boolean {
    const sim = this.sim;
    if (!sim) return false;
    const ctx = this.ctx;
    const still = ctx.player.stats.speed < 0.3;
    this.stillTime = still ? this.stillTime + dt : 0;
    if (this.caughtCooldown > 0) {
      this.caughtCooldown -= dt;
      return false;
    }
    const done = sim.advance(dt, this.stillTime > 1.5, ctx.settings.state.gentleMode);
    const p = Math.floor(sim.t * 100);
    if (p !== this.lastProgress) {
      this.lastProgress = p;
      ctx.events.emit('oblivion:progress', { t: sim.t });
    }
    if (done) {
      this.caughtCooldown = 6;
      ctx.events.emit('player:caught', { by: 'oblivion' });
      // the story shows its own caught curtain; the card is only for a game without one
      if (!ctx.systems.get('story')) this.ui.showCard(ctx.t('fx.caught.oblivion'));
      return true;
    }
    return false;
  }

  frame(dt: number): void {
    const sim = this.sim;
    if (!sim) return;
    const ctx = this.ctx;
    this.vis += (sim.t - this.vis) * Math.min(1, dt * 1.5);
    const t = this.vis;
    const cam = ctx.camera.position;
    const R = oblivionRadius(t, 760, 16);
    // ash fog closes in: density so that the fog is ~90 % at R; colour drains to ash
    const L = ctx.world.look;
    const a = atmosphere;
    const k = smoothstep(0.02, 0.6, t);
    a.uFogDensity.value = Math.max(L.fog.density, lerp(L.fog.density, 1.5 / R, k));
    a.uFogColor.value.set(L.fog.color).lerp(ASH, k);
    a.uFogSunColor.value.set(L.fog.sunColor).lerp(ASH, k);
    a.uFogHeightDensity.value = L.fog.heightDensity * (1 + 1.5 * t);
    // the shells: an inner veil of curtains and the opaque edge of the world
    this.shells.forEach((s, i) => {
      s.visible = t > 0.01;
      s.position.copy(cam);
      s.scale.setScalar(i === 0 ? R : R * 0.78);
      (s.material as ShaderMaterial).uniforms.uAlpha!.value = (i === 0 ? 0.97 : 0.4) * smoothstep(0.0, 0.08, t);
    });
    // the ruin dissolves: walls cut lower and lower (they rise as grains from the cut)
    const cut = lerp(2.6, 0.6, smoothstep(0.08, 0.95, t));
    const pal = ctx.world.palace;
    if (ctx.era.info.palace !== 'hidden') {
      pal.uniforms.uRuin!.value = Math.max(1, ruinForCut(cut));
      if (this.patched) {
        (pal.uniforms.uOblC!.value as Vector3).copy(cam);
        pal.uniforms.uOblR!.value = R;
        pal.uniforms.uOblOn!.value = smoothstep(0.02, 0.12, t);
      }
    }
    const scale = pointScale(ctx.camera, ctx.renderer);
    if (this.grains) {
      const u = (this.grains.material as ShaderMaterial).uniforms;
      u.uCut!.value = Math.min(4.2, cut + 0.6);
      (u.uCenter!.value as Vector3).copy(cam);
      u.uR!.value = this.patched ? R : 1e6;
      u.uAlpha!.value = smoothstep(0.02, 0.15, t) * 0.9;
      u.uScale!.value = scale;
      this.grains.visible = ctx.era.info.palace !== 'hidden';
    }
    // the ground comes apart at the rim of the grey (it moves in with the meter)
    this.dust?.frame(dt, t, R, cam.x, cam.z, scale, ctx.settings.state.reducedMotion);
    // the 2025 relief shows through inside the grey zone
    if (Math.hypot(cam.x - this.reliefCenter.x, cam.z - this.reliefCenter.z) > 140) this.buildRelief(cam.x, cam.z);
    if (this.relief) {
      const u = (this.relief.material as ShaderMaterial).uniforms;
      (u.uCenter!.value as Vector3).copy(cam);
      u.uR!.value = R;
      u.uAlpha!.value = 0.75 * smoothstep(0.05, 0.3, t);
      u.uScale!.value = scale;
    }
    const vu = (this.vignette.material as ShaderMaterial).uniforms;
    vu.uAmount!.value = 0.85 * Math.pow(t, 1.6);
    this.vignette.visible = t > 0.01;
    this.ui.setGauge('oblivion', sim.t);
    this.loop?.setIntensity(0.25 + 0.75 * t);
  }

  dispose(): void {
    this.offQuality();
    this.stop();
    for (const s of this.shells) {
      this.ctx.scene.remove(s);
      s.geometry.dispose();
      (s.material as ShaderMaterial).dispose();
    }
    this.ctx.scene.remove(this.vignette);
  }
}
