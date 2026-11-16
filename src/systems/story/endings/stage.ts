/**
 * The endings staged in the engine (playtest round 2: "ending vignettes are DOM over the live
 * frame"): before the text card, the camera leaves the player's eyes and the world itself plays
 * the picture, then the card opens.
 *
 *  museum  dawn at the field station: the camera rises over the clearing, the horn sounds
 *          "Sammeln", five hounds lie down one after another and their eyes go out, the fog lifts
 *          and the sun comes up.
 *  burn    the pages burn in the air before you: they curl, glow at the edges and fall apart into
 *          embers; the embers rise and become points of light (memories) that climb into the sky
 *          while the eras flash through the world (1785 … today), the camera follows them up.
 *  keep    the dark closes in (dusk to night in seconds, the fog goes black), the camera turns
 *          slowly round — and behind you, one pair after another, the eyes open.
 *
 * ~11 s, real time (it plays behind no modal; a slow software renderer does not stretch it). Any
 * key / click / the button skips. Reduced motion: no camera flight — two calm still shots with a
 * cross-fade; reduced flashing: the eras cross-fade instead of flashing. The look and the camera
 * are restored before the card opens.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { GameContext } from '../../../core/context';
import type { Era } from '../../../core/era';
import { t } from '../../../i18n';
import { h } from '../../../ui/dom';
import { ERA_LOOKS, type EraLook } from '../../../world/eraPresets';
import type { EndingId } from '../types';

/** Seconds of each staged ending (normal / reduced motion). */
export const STAGE_SECONDS: Record<EndingId, number> = { museum: 11.5, burn: 11, keep: 11 };
export const STAGE_SECONDS_REDUCED = 7;

const smooth = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mixHex = (a: string, b: string, k: number) => '#' + new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, k))).getHexString();

/** Pure timeline of an ending (tests): camera offsets and the world's look at time t. */
export function stageAt(id: EndingId, t: number, reduced: boolean): { rise: number; back: number; turn: number; pitch: number; fade: number; fog: number; sun: number; dark: number } {
  const T = reduced ? STAGE_SECONDS_REDUCED : STAGE_SECONDS[id];
  const fade = smooth((t - (T - 1.2)) / 1.0) + (1 - smooth(t / 0.6)) * 0.85;
  if (id === 'museum') {
    const k = reduced ? (t < T / 2 ? 0 : 1) : smooth(t / 6);
    return { rise: 7 * k, back: 9 * k, turn: 0, pitch: -0.18 * k, fade, fog: 1 - 0.75 * smooth((t - 2) / 6), sun: smooth((t - 2.5) / 7), dark: 0 };
  }
  if (id === 'burn') {
    const k = reduced ? 0 : smooth((t - 3.5) / 5);
    return { rise: 0, back: 0, turn: 0, pitch: lerp(-0.05, 0.85, k), fade, fog: 1, sun: 0, dark: 0 };
  }
  const k = reduced ? (t < T / 2 ? 0 : 1) : smooth((t - 3.2) / 3.6);
  return { rise: 0, back: 0, turn: Math.PI * k, pitch: -0.04 * k, fade, fog: 1 + 2.2 * smooth(t / 3.5), sun: 0, dark: smooth(t / 3.5) };
}

const PAGE_VERT = /* glsl */ `
attribute float aSeed;
attribute float aBurn;
varying vec2 vUv;
varying float vSeed;
varying float vBurn;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vBurn = aBurn;
  vec3 p = position;
  // the page curls as it burns
  p.z += sin(uv.x * 3.14159) * 0.08 * (0.3 + aBurn) + (uv.y - 0.5) * (uv.y - 0.5) * 0.25 * aBurn;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}
`;
const PAGE_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
varying float vBurn;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  // the fire eats in from the lower edge, ragged
  float n = noise(vUv * 7.0 + vSeed * 13.0) * 0.55 + noise(vUv * 19.0 - vSeed * 7.0) * 0.25;
  float front = vBurn * 1.5 - (1.0 - vUv.y) * 0.35 - n * 0.5;
  float edge = smoothstep(0.0, 0.08, front) - smoothstep(0.08, 0.2, front);
  if (front > 0.2) discard;
  // paper with lines of writing, darkening towards the fire
  vec3 paper = vec3(0.86, 0.8, 0.66);
  float ink = step(0.6, fract(vUv.y * 14.0)) * step(0.1, vUv.x) * step(vUv.x, 0.9) * step(0.35, noise(vec2(vUv.x * 30.0, floor(vUv.y * 14.0) + vSeed * 9.0)));
  paper = mix(paper, vec3(0.25, 0.2, 0.16), ink * 0.6);
  float char = smoothstep(-0.35, 0.0, front);
  vec3 col = mix(paper, vec3(0.08, 0.05, 0.03), char);
  col += vec3(3.2, 1.3, 0.35) * edge * 2.2;
  gl_FragColor = vec4(col, 1.0);
}
`;
const EMBER_VERT = /* glsl */ `
attribute vec4 aCol;
uniform float uScale;
varying vec4 vCol;
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aCol.a < 0.002 ? 0.0 : clamp(uScale * (0.05 + 0.1 * aCol.a) / max(-mv.z, 0.5), 1.5, 22.0);
  gl_Position = projectionMatrix * mv;
}
`;
const EMBER_FRAG = /* glsl */ `
varying vec4 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = (1.0 - r) * (1.0 - r) * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
}
`;

const PAGES = 26;
const EMBERS = 900;

/** The burning pages of the Chronik, their embers and the memories they become. */
class Pages {
  readonly group = new Group();
  private readonly mesh: InstancedMesh;
  private readonly burn: InstancedBufferAttribute;
  private readonly pts: Points;
  private readonly pos = new Float32Array(EMBERS * 3);
  private readonly vel = new Float32Array(EMBERS * 3);
  private readonly col = new Float32Array(EMBERS * 4);
  private readonly life = new Float32Array(EMBERS * 2);
  private next = 0;
  private readonly page: { p: Vector3; v: Vector3; rot: number; spin: number; start: number; burnAt: number; done: boolean }[] = [];
  private seed = 7;
  private rnd = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);

  constructor(origin: Vector3, fwd: Vector3) {
    this.group.name = 'ending-pages';
    const g = new PlaneGeometry(0.21, 0.3, 6, 8);
    const seeds = new Float32Array(PAGES);
    for (let i = 0; i < PAGES; i++) seeds[i] = this.rnd();
    g.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    this.burn = new InstancedBufferAttribute(new Float32Array(PAGES), 1);
    g.setAttribute('aBurn', this.burn);
    this.mesh = new InstancedMesh(g, new ShaderMaterial({ vertexShader: PAGE_VERT, fragmentShader: PAGE_FRAG, side: DoubleSide }), PAGES);
    this.mesh.frustumCulled = false;
    const right = new Vector3(-fwd.z, 0, fwd.x);
    for (let i = 0; i < PAGES; i++) {
      // the pages leave the book one after another and flutter up before you
      const p = origin.clone().addScaledVector(fwd, 2.2 + this.rnd() * 1.2).addScaledVector(right, (this.rnd() - 0.5) * 1.6);
      p.y += -0.4 + this.rnd() * 0.3;
      const v = new Vector3((this.rnd() - 0.5) * 0.25, 0.35 + this.rnd() * 0.35, (this.rnd() - 0.5) * 0.25);
      this.page.push({ p, v, rot: this.rnd() * 6, spin: (this.rnd() - 0.5) * 2, start: i * 0.13, burnAt: 1.2 + i * 0.12 + this.rnd() * 0.8, done: false });
    }
    const eg = new BufferGeometry();
    eg.setAttribute('position', new BufferAttribute(this.pos, 3));
    eg.setAttribute('aCol', new BufferAttribute(this.col, 4));
    this.pts = new Points(eg, new ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 70;
    this.group.add(this.mesh, this.pts);
  }

  private spawn(p: Vector3, memory: boolean): void {
    const i = this.next;
    this.next = (this.next + 1) % EMBERS;
    this.pos.set([p.x + (this.rnd() - 0.5) * 0.2, p.y + (this.rnd() - 0.5) * 0.25, p.z + (this.rnd() - 0.5) * 0.2], i * 3);
    // embers flicker up; the memories rise slow and far, into the sky
    this.vel.set(memory ? [(this.rnd() - 0.5) * 0.6, 1.4 + this.rnd() * 1.4, (this.rnd() - 0.5) * 0.6] : [(this.rnd() - 0.5) * 0.9, 0.6 + this.rnd() * 1.2, (this.rnd() - 0.5) * 0.9], i * 3);
    this.life[i * 2] = memory ? 7 + this.rnd() * 3 : 0.8 + this.rnd() * 1.2;
    this.life[i * 2 + 1] = memory ? -1 : 0; // memories: negative age marks the kind
  }

  frame(t: number, dt: number, scale: number): void {
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3(1, 1, 1);
    this.page.forEach((g, i) => {
      const lt = t - g.start;
      if (lt < 0 || g.done) {
        m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, m);
        return;
      }
      g.p.addScaledVector(g.v, dt);
      g.v.y += dt * 0.12;
      g.rot += g.spin * dt;
      const b = Math.max(0, Math.min(1, (lt - g.burnAt) / 1.6));
      this.burn.setX(i, b);
      q.setFromAxisAngle(new Vector3(Math.sin(g.rot), 0.4, Math.cos(g.rot)).normalize(), g.rot * 0.6 + Math.sin(lt * 2.3 + i) * 0.3);
      m.compose(g.p, q, s);
      this.mesh.setMatrixAt(i, m);
      // burning: embers from the edge; burnt through: a handful of memories rise
      if (b > 0 && b < 1 && this.rnd() < dt * 40) this.spawn(g.p, false);
      if (b >= 1 && !g.done) {
        g.done = true;
        for (let k = 0; k < 9; k++) this.spawn(g.p, true);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.burn.needsUpdate = true;
    for (let i = 0; i < EMBERS; i++) {
      const L = this.life[i * 2]!;
      let a = this.life[i * 2 + 1]!;
      const memory = a < 0;
      const age = memory ? -a - 1 : a;
      if (L <= 0 || age >= L) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      const na = age + dt;
      a = memory ? -(na + 1) : na;
      this.life[i * 2 + 1] = a;
      const o = i * 3;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt;
      this.pos[o + 1] = this.pos[o + 1]! + this.vel[o + 1]! * dt;
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt;
      const u = na / L;
      if (memory) {
        // ember orange → a cool, steady white-gold point
        const k = Math.min(1, na / 1.5);
        this.col[i * 4] = lerp(3.0, 2.2, k);
        this.col[i * 4 + 1] = lerp(1.2, 2.0, k);
        this.col[i * 4 + 2] = lerp(0.3, 1.5, k);
        this.col[i * 4 + 3] = Math.min(1, na * 2) * (1 - u * u) * 1.2;
      } else {
        this.col[i * 4] = 3.2;
        this.col[i * 4 + 1] = 1.3 * (1 - u);
        this.col[i * 4 + 2] = 0.3 * (1 - u);
        this.col[i * 4 + 3] = (1 - u) * (0.6 + 0.4 * Math.sin(na * 30 + i));
      }
    }
    const geo = this.pts.geometry;
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.aCol!.needsUpdate = true;
    (this.pts.material as ShaderMaterial).uniforms.uScale!.value = scale;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.pts.geometry.dispose();
    (this.pts.material as ShaderMaterial).dispose();
  }
}

/** Era looks the burn ending flashes through (oldest first). */
const BURN_ERAS: Era[] = ['1789', '1793-02', '1793-07', '1796', 'today'];

export class EndingStage {
  private id: EndingId | null = null;
  private t = 0;
  private last = 0;
  private done: (() => void) | null = null;
  private look0: EraLook | null = null;
  private eye = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private ui: HTMLElement | null = null;
  private fadeEl: HTMLElement | null = null;
  private eraEl: HTMLElement | null = null;
  private pages: Pages | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (this.id && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      this.finish();
    }
  };
  private eraIdx = -1;

  constructor(private readonly ctx: GameContext) {}

  get active(): boolean {
    return this.id !== null;
  }

  get time(): number {
    return this.t;
  }

  private reduced(): boolean {
    return this.ctx.settings.state.reducedMotion;
  }

  /** Play ending `id`; `done` opens the text card. */
  start(id: EndingId, done: () => void): void {
    if (this.id) this.finish();
    const ctx = this.ctx;
    this.id = id;
    this.done = done;
    this.t = 0;
    this.last = performance.now();
    this.eraIdx = -1;
    const pl = ctx.player;
    this.eye = { x: pl.position.x, y: pl.position.y, z: pl.position.z, yaw: pl.yaw, pitch: pl.pitch };
    pl.frozen = true;
    pl.lookLocked = true;
    this.look0 = structuredClone(ctx.world.look);
    ctx.ui.hud.show(false);
    // letterbox, the skip button and the fade (DOM); the picture itself is the world
    this.fadeEl = h('div.kqs-stage-fade');
    this.eraEl = h('div.kqs-stage-era', { 'aria-live': 'polite' });
    this.ui = h('div.kqs-stage', { 'data-testid': 'ending-stage', 'data-ending': id, onclick: () => this.finish() }, [
      h('div.kqs-stage-bar.top'),
      h('div.kqs-stage-bar.bottom'),
      this.fadeEl,
      this.eraEl,
      h('button.kqs-stage-skip', { 'data-testid': 'ending-stage-skip', onclick: (e: Event) => (e.stopPropagation(), this.finish()) }, t('story.end.skip')),
    ]);
    document.body.appendChild(this.ui);
    document.addEventListener('keydown', this.onKey, true);
    const fwd = new Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    if (id === 'museum') {
      // the pack lies down on the clearing ahead, facing you
      const c = { x: this.eye.x + fwd.x * 17, z: this.eye.z + fwd.z * 17 };
      ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'lie', n: 5, x: c.x, z: c.z, r: 6, face: (pl.yaw * -180) / Math.PI } });
    } else if (id === 'keep') {
      // behind you, in the dark
      ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'eyes', n: 5, x: this.eye.x, z: this.eye.z, r: 13, face: (pl.yaw * -180) / Math.PI + 180 } });
    } else {
      this.pages = new Pages(new Vector3(this.eye.x, this.eye.y + 1.55, this.eye.z), fwd);
      ctx.scene.add(this.pages.group);
    }
  }

  /** Skip / end: restore the look and the view, open the card. */
  finish(): void {
    if (!this.id) return;
    const ctx = this.ctx;
    const id = this.id;
    this.id = null;
    document.removeEventListener('keydown', this.onKey, true);
    this.ui?.remove();
    this.ui = null;
    this.pages?.dispose();
    this.pages = null;
    if (this.look0) {
      ctx.world.look = this.look0;
      ctx.world.applyLook();
    }
    this.look0 = null;
    // the museum's hounds stay down behind the card; the keep ending's eyes too (the card is the
    // same night) — the burn leaves nothing
    if (id === 'burn') ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'off' } });
    const pl = ctx.player;
    pl.frozen = false;
    pl.lookLocked = false;
    pl.yaw = this.eye.yaw;
    pl.pitch = this.eye.pitch;
    ctx.ui.hud.show(true);
    const d = this.done;
    this.done = null;
    d?.();
  }

  /** Per rendered frame (after the camera followed the player). */
  frame(): void {
    if (!this.id) return;
    const ctx = this.ctx;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    const id = this.id;
    const reduced = this.reduced();
    const T = reduced ? STAGE_SECONDS_REDUCED : STAGE_SECONDS[id];
    const s = stageAt(id, this.t, reduced);
    // ---- camera
    const cam = ctx.camera;
    const e = this.eye;
    const yaw = e.yaw + s.turn;
    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    const eyeH = 1.62;
    const x = e.x - fx * s.back;
    const z = e.z - fz * s.back;
    const ground = ctx.world.heightAt(x, z);
    const y = Math.max(ground + 1.2, e.y + eyeH + s.rise);
    cam.position.set(x, y, z);
    cam.rotation.set(0, 0, 0, 'YXZ');
    cam.rotation.y = yaw;
    cam.rotation.x = e.pitch * (1 - Math.min(1, Math.abs(s.pitch) * 3)) + s.pitch;
    cam.updateMatrixWorld();
    // ---- the world's look
    const L0 = this.look0!;
    const L = structuredClone(L0);
    if (id === 'museum') {
      L.fog.density = L0.fog.density * s.fog;
      L.fog.ground = L0.fog.ground * s.fog;
      L.fog.heightDensity = L0.fog.heightDensity * s.fog;
      L.sun.elevation = lerp(L0.sun.elevation, 14, s.sun);
      L.sun.color = mixHex(L0.sun.color, '#ffd9a8', s.sun);
      L.sky.horizon = mixHex(L0.sky.horizon, '#f0c7a0', s.sun * 0.6);
      L.grade.exposure = L0.grade.exposure * (1 + 0.12 * s.sun);
    } else if (id === 'keep') {
      L.fog.color = mixHex(L0.fog.color, '#030407', s.dark);
      L.fog.sunColor = mixHex(L0.fog.sunColor, '#05060a', s.dark);
      L.fog.density = L0.fog.density * s.fog;
      L.fog.ground = L0.fog.ground * s.fog;
      L.sky.zenith = mixHex(L0.sky.zenith, '#010204', s.dark);
      L.sky.horizon = mixHex(L0.sky.horizon, '#06070b', s.dark);
      L.sun.intensity = L0.sun.intensity * (1 - 0.85 * s.dark);
      L.ambient.intensity = L0.ambient.intensity * (1 - 0.7 * s.dark);
      L.grade.exposure = L0.grade.exposure * (1 - 0.35 * s.dark);
      L.grade.vignette = Math.min(0.9, L0.grade.vignette + 0.35 * s.dark);
    } else {
      // the eras flash through the world while the pages burn (reduced flashing: cross-fades)
      const k = (this.t - 3.2) / 0.62;
      const i = Math.floor(k);
      if (i >= 0 && i < BURN_ERAS.length) {
        const E = ERA_LOOKS[BURN_ERAS[i]!];
        const f = ctx.settings.state.reducedFlash ? 0.35 * Math.sin(Math.PI * (k - i)) : 1 - Math.pow(k - i, 3) * 0.6;
        L.sky.zenith = mixHex(L0.sky.zenith, E.sky.zenith, f);
        L.sky.horizon = mixHex(L0.sky.horizon, E.sky.horizon, f);
        L.fog.color = mixHex(L0.fog.color, E.fog.color, f);
        L.sun.color = mixHex(L0.sun.color, E.sun.color, f);
        L.sun.elevation = lerp(L0.sun.elevation, E.sun.elevation, f);
        L.ambient.sky = mixHex(L0.ambient.sky, E.ambient.sky, f);
        L.grade.exposure = lerp(L0.grade.exposure, E.grade.exposure, f) * (ctx.settings.state.reducedFlash ? 1 : 1 + 0.25 * (1 - (k - i)));
        L.snow = lerp(L0.snow, E.snow, f);
        if (i !== this.eraIdx) {
          this.eraIdx = i;
          const el = this.eraEl;
          if (el) {
            el.textContent = BURN_ERAS[i] === 'today' ? t('story.end.today') : BURN_ERAS[i]!.slice(0, 4);
            el.classList.remove('on');
            void el.offsetWidth;
            el.classList.add('on');
          }
        }
      }
      // fire light from the pages
      L.glow = { color: '#ff8a3a', intensity: Math.max(0, Math.min(1, (this.t - 1) / 1.5)) * 0.7 * (1 - smooth((this.t - 8) / 2)) };
      const scale = ctx.renderer.domElement.height / (2 * Math.tan(((cam.fov * Math.PI) / 180) / 2));
      this.pages?.frame(this.t, dt, scale);
    }
    ctx.world.look = L;
    ctx.world.applyLook();
    if (this.fadeEl) this.fadeEl.style.opacity = String(Math.min(1, s.fade));
    if (this.t >= T) this.finish();
  }

  dispose(): void {
    if (this.id) this.finish();
  }
}
