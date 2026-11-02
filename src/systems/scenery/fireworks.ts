/**
 * The fireworks echo of 19 December 1785 (bible 1.11, W2), staged in the sky while the Chronik
 * plays `echo.k1.feuerwerk` at the Rondell:
 *  A  winter falls over the summer night: snow on the ground and in the air, thousands of little
 *     lamps along the terraces of the slope, a crowd you hear but never see, the dark scaffold
 *     below; now and then a rocket climbs and bursts — sparks, coloured light on the snow;
 *  B  (the line "Kanonenschüsse, ein Licht …") cannon flashes at the scaffold, then everything on
 *     the one scaffold goes up at once: the sky flares, rockets fly flat in every direction;
 *     then black and still, one light high up that slowly goes out;
 *  C  (the last line) the snow falls upwards and the summer comes back.
 * No people are shown hurt and nobody is heard; the picture is only light. Flashes respect
 * `settings.reducedFlash` (and reduced motion): no white-out, no strobing, slower and dimmer
 * light; the graphics preset Niedrig halves the sparks.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { GameContext } from '../../core/context';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { EraLook } from '../../world/eraPresets';
import { fireworkSound } from './audio';
import { Kit, rng } from './kit';
import { propMaterial } from './material';
import { C, scaffold } from './props';

export const FIREWORKS_ECHO = 'clue.k1.feuerwerk';
/** The Rondell (echo) and the scaffold down the slope towards the cascade. */
export const RONDELL = { x: 1815, z: 348 };
export const LAUNCH = { x: 1978, z: 352 };

const MAX_SPARKS = 4200;
const PALETTE = [new Color(3.2, 2.2, 0.9), new Color(3.0, 0.9, 0.5), new Color(1.6, 2.4, 3.2), new Color(3.2, 3.0, 2.6), new Color(2.2, 3.0, 1.2), new Color(3.2, 1.6, 2.6)];

const SPARK_VERT = /* glsl */ `
attribute vec4 aCol;   // rgb, brightness
uniform float uScale;
varying vec4 vCol;
void main() {
  vCol = aCol;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_PointSize = aCol.a < 0.002 ? 0.0 : clamp(uScale * (0.35 + aCol.a * 0.9) / max(-mv.z, 1.0), 1.0, 7.0);
  gl_Position = projectionMatrix * mv;
}
`;
const SPARK_FRAG = /* glsl */ `
varying vec4 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = (1.0 - r) * (1.0 - r) * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
}
`;

const LAMP_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute float aSeed;
uniform float uScale;
uniform float uOn;
varying float vA;
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float fl = 0.7 + 0.3 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 40.0);
  vA = uOn * fl * smoothstep(1400.0, 300.0, -mv.z);
  gl_PointSize = vA < 0.01 ? 0.0 : clamp(uScale * 0.22 / max(-mv.z, 1.0), 1.0, 4.0);
  gl_Position = projectionMatrix * mv;
}
`;
const LAMP_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = (1.0 - r) * vA;
  gl_FragColor = vec4(vec3(3.0, 1.8, 0.7) * a, a);
}
`;

const SNOW_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute vec4 aSeed;
uniform float uUp;      // -1 falling … 1 rising
uniform float uAlpha;
uniform float uScale;
uniform float uFall;    // accumulated fall distance (m), driven from the CPU so it can reverse
varying float vA;
void main() {
  vec3 box = vec3(60.0, 30.0, 60.0);
  vec3 p = aSeed.xyz * box;
  p.y -= uFall * (0.8 + aSeed.w * 0.4);
  p.x += sin(uTime * 0.6 + aSeed.w * 30.0) * 0.8 + uFall * 0.15;
  p.z += cos(uTime * 0.5 + aSeed.w * 21.0) * 0.8;
  vec3 c = uCamPos;
  p = mod(p - c + box * 0.5, box) - box * 0.5 + c;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vA = uAlpha * (1.0 - smoothstep(0.3, 0.5, length(p.xz - c.xz) / box.x));
  gl_PointSize = vA < 0.01 ? 0.0 : clamp(uScale * 0.05 * (0.6 + aSeed.w) / max(-mv.z, 0.3), 0.8, 8.0);
  gl_Position = projectionMatrix * mv;
}
`;
const SNOW_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  vec3 col = vec3(0.85, 0.9, 1.0) * (uSkyAmbient * 1.4 + uGlowColor * 0.08 + vec3(0.08));
  gl_FragColor = vec4(col, vA * (1.0 - r * r));
}
`;

interface Rocket {
  p: Vector3;
  v: Vector3;
  t: number;
  fuse: number;
  color: Color;
  big: boolean;
  flat: boolean;
}

export type FireworksPhase = 'off' | 'festive' | 'climax' | 'dark' | 'return';

export class Fireworks {
  readonly group = new Group();
  phase: FireworksPhase = 'off';
  private time = 0;
  private phaseT = 0;
  private readonly pos = new Float32Array(MAX_SPARKS * 3);
  private readonly vel = new Float32Array(MAX_SPARKS * 3);
  private readonly col = new Float32Array(MAX_SPARKS * 4);
  private readonly life = new Float32Array(MAX_SPARKS * 2);
  private readonly base = new Float32Array(MAX_SPARKS * 3);
  private next = 0;
  private readonly sparks: Points;
  private readonly sparkGeo: BufferGeometry;
  private readonly lamps: Points;
  private readonly snow: Points;
  private readonly scaffold: Mesh;
  private rockets: Rocket[] = [];
  private launchIn = 1.5;
  private readonly r = rng(1785);
  /** Light of the last bursts (decays): colour · intensity, position. */
  private readonly light = new Color();
  private readonly lightPos = new Vector3();
  private lookBefore: EraLook | null = null;
  private winter = 0;
  private fall = 0;
  private snowUp = -1;
  private flash = 0;
  private lastLight: Vector3 | null = null;
  private launchY = 0;
  private exposure0 = 1;
  private crowd: { stop(): void; set(v: number): void } | null = null;

  constructor(private readonly ctx: GameContext) {
    this.group.name = 'scenery-fireworks';
    this.group.visible = false;
    // sparks
    this.sparkGeo = new BufferGeometry();
    this.sparkGeo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.sparkGeo.setAttribute('aCol', new BufferAttribute(this.col, 4));
    this.sparks = new Points(
      this.sparkGeo,
      new ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 60;
    // lamps along the terraces of the slope
    this.lamps = this.makeLamps();
    // snow
    const n = 3000;
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seed[i] = this.r();
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    sg.setAttribute('aSeed', new BufferAttribute(seed, 4));
    this.snow = new Points(
      sg,
      new ShaderMaterial({
        vertexShader: SNOW_VERT,
        fragmentShader: SNOW_FRAG,
        uniforms: { ...atmosphere, uUp: { value: -1 }, uAlpha: { value: 0 }, uScale: { value: 600 }, uFall: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
      }),
    );
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 55;
    // the one scaffold, dark against the lamps
    const k = new Kit();
    const h = (x: number, z: number) => ctx.world.heightAt(x, z);
    this.launchY = h(LAUNCH.x, LAUNCH.z);
    k.place(LAUNCH.x, this.launchY - 0.2, LAUNCH.z, Math.atan2(RONDELL.x - LAUNCH.x, RONDELL.z - LAUNCH.z));
    scaffold(k, 1785, 7, 13, 4);
    // frames and wheels for set pieces on top
    for (let i = 0; i < 3; i++) k.cyl(1.4, 1.4, 0.1, -2.2 + i * 2.2, 14.2, 2, C.woodDark, [Math.PI / 2, 0, 0], 12);
    k.box(7.4, 0.15, 0.15, 0, 13.4, 2.1, C.woodDark);
    this.scaffold = new Mesh(k.build(), propMaterial());
    this.scaffold.name = 'scenery-fireworks-scaffold';
    this.group.add(this.lamps, this.scaffold, this.sparks, this.snow);
  }

  private makeLamps(): Points {
    const h = (x: number, z: number) => this.ctx.world.heightfields['1789'].heightAt(x, z);
    const pts: number[] = [];
    const seeds: number[] = [];
    const r = rng(19121785);
    // contour lines of lamps on the slope east of the Rondell (terraces, the cascade's edges)
    for (let x = RONDELL.x + 25; x < RONDELL.x + 330; x += 1.6) {
      for (let z = RONDELL.z - 180; z < RONDELL.z + 180; z += 1.6) {
        const y = h(x, z);
        const lvl = (y - 262) / 3.5;
        const f = lvl - Math.round(lvl);
        if (Math.abs(f) > 0.06 || lvl < -0.5 || lvl > 9) continue;
        if (r() < 0.45) continue;
        pts.push(x + (r() - 0.5) * 0.6, y + 0.35, z + (r() - 0.5) * 0.6);
        seeds.push(r());
      }
    }
    // the steps by the scaffold: two straight rows
    for (let i = 0; i < 80; i++) {
      for (const dz of [-14, 14]) {
        const x = LAUNCH.x - 60 + i * 1.5;
        const z = LAUNCH.z + dz;
        pts.push(x, h(x, z) + 0.4, z);
        seeds.push(r());
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    g.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 1));
    const p = new Points(g, new ShaderMaterial({ vertexShader: LAMP_VERT, fragmentShader: LAMP_FRAG, uniforms: { ...atmosphere, uScale: { value: 600 }, uOn: { value: 0 } }, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    p.frustumCulled = false;
    p.renderOrder = 58;
    return p;
  }

  get lampCount(): number {
    return this.lamps.geometry.getAttribute('position').count;
  }

  get liveSparks(): number {
    let n = 0;
    for (let i = 0; i < MAX_SPARKS; i++) if (this.life[i * 2 + 1]! < this.life[i * 2]!) n++;
    return n;
  }

  /** Reduced flashing (settings → Barrierefreiheit; reduced motion implies it here). */
  private reduced(): boolean {
    const s = this.ctx.settings.state;
    return s.reducedFlash === true || s.reducedMotion;
  }

  /** Spark budget of the graphics preset: Niedrig halves every burst. */
  private sparkScale(): number {
    return this.ctx.settings.state.graphics === 'low' ? 0.5 : 1;
  }

  start(): void {
    if (this.phase !== 'off') return;
    this.phase = 'festive';
    this.phaseT = 0;
    this.time = 0;
    this.launchIn = 2.5;
    this.group.visible = true;
    this.scaffold.visible = true;
    this.lookBefore = structuredClone(this.ctx.world.look);
    this.exposure0 = this.lookBefore.grade.exposure;
    this.winter = 0;
    this.fall = 0;
    this.snowUp = -1;
    this.rockets = [];
    this.life.fill(0);
    this.crowd = crowdMurmur(this.ctx);
  }

  /** Jump to a phase (the echo's lines drive it). */
  setPhase(p: FireworksPhase): void {
    if (p === this.phase || this.phase === 'off') return;
    this.phase = p;
    this.phaseT = 0;
    if (p === 'climax') this.climax();
    if (p === 'dark') {
      this.crowd?.stop();
      this.crowd = null;
    }
  }

  stop(): void {
    if (this.phase === 'off') return;
    this.phase = 'off';
    this.group.visible = false;
    this.crowd?.stop();
    this.crowd = null;
    const L = this.lookBefore;
    if (L) {
      this.ctx.world.look = L;
      this.ctx.world.applyLook();
    }
    this.lookBefore = null;
    (this.ctx.post.uniforms.uFlash!.value as Color).setRGB(0, 0, 0);
  }

  private spawn(p: Vector3, v: Vector3, color: Color, life: number, bright = 1): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_SPARKS;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r * bright, color.g * bright, color.b * bright], i * 3);
    this.life[i * 2] = life;
    this.life[i * 2 + 1] = 0;
  }

  private burst(p: Vector3, color: Color, n: number, speed: number, kind: 'peony' | 'willow' | 'ring' = 'peony'): void {
    const r = this.r;
    const axis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    n = Math.round(n * this.sparkScale());
    for (let i = 0; i < n; i++) {
      const d = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      if (kind === 'ring') d.sub(axis.clone().multiplyScalar(d.dot(axis)));
      d.normalize().multiplyScalar(speed * (kind === 'peony' ? 0.75 + r() * 0.25 : 0.55 + r() * 0.45));
      this.spawn(p, d, r() < 0.15 ? PALETTE[3]! : color, kind === 'willow' ? 3.2 + r() * 1.4 : 1.6 + r() * 1.0, kind === 'willow' ? 0.7 : 1);
    }
    const reduced = this.reduced();
    const k = reduced ? 0.35 : 1;
    this.light.copy(color).multiplyScalar(0.9 * k);
    this.lightPos.copy(p);
    this.lastLight = p.clone();
    if (!reduced) this.flash = Math.max(this.flash, 0.06);
    fireworkSound(this.ctx.audio, 'burst', p.x, p.y, p.z, 0.8);
    if (kind !== 'willow') setTimeout(() => this.phase !== 'off' && fireworkSound(this.ctx.audio, 'crackle', p.x, p.y, p.z, 0.6), 500);
  }

  private launch(flat = false, big = false): void {
    const r = this.r;
    const p = new Vector3(LAUNCH.x + (r() - 0.5) * 4, this.launchY + 14, LAUNCH.z + (r() - 0.5) * 4);
    const v = flat
      ? new Vector3((r() - 0.5) * 2, 0.15 + r() * 0.35, (r() - 0.5) * 2).normalize().multiplyScalar(26 + r() * 20)
      : new Vector3((r() - 0.5) * 7, 44 + r() * 14, (r() - 0.5) * 7);
    this.rockets.push({ p, v, t: 0, fuse: flat ? 0.6 + r() * 1.2 : 1.6 + r() * 0.7, color: PALETTE[Math.floor(r() * PALETTE.length)]!, big, flat });
    fireworkSound(this.ctx.audio, 'launch', p.x, p.y, p.z, flat ? 0.6 : 1);
  }

  private climax(): void {
    // cannon flashes first, then everything on the one scaffold at once
    const c = new Vector3(LAUNCH.x, this.launchY + 4, LAUNCH.z);
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (this.phase !== 'climax') return;
        fireworkSound(this.ctx.audio, 'cannon', c.x + (i - 2) * 6, c.y, c.z, 1);
        this.light.setRGB(3, 1.6, 0.6).multiplyScalar(this.reduced() ? 0.5 : 1.5);
        this.lightPos.copy(c);
        if (!this.reduced()) this.flash = Math.max(this.flash, 0.12);
      }, i * 380);
    }
  }

  private explode(): void {
    const reduced = this.reduced();
    const c = new Vector3(LAUNCH.x, this.launchY + 12, LAUNCH.z);
    const white = new Color(3.4, 2.8, 2.0);
    this.burst(c, white, 900, 34, 'peony');
    this.burst(c.clone().add(new Vector3(0, 8, 0)), PALETTE[1]!, 500, 22, 'willow');
    for (let i = 0; i < 26; i++) this.launch(true, false);
    this.light.setRGB(3.4, 2.4, 1.4).multiplyScalar(reduced ? 1.2 : 4.5);
    this.lightPos.copy(c);
    this.flash = reduced ? 0 : 0.9;
    this.scaffold.visible = false;
  }

  /** Per frame (dt real seconds). */
  frame(dt: number): void {
    if (this.phase === 'off') return;
    const ctx = this.ctx;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.phaseT += dt;
    const reduced = this.reduced();
    // ---- schedule
    if (this.phase === 'festive') {
      this.winter = Math.min(1, this.winter + dt / 2.5);
      this.launchIn -= dt;
      if (this.launchIn <= 0) {
        this.launch(false, this.r() < 0.3);
        if (this.r() < 0.35) setTimeout(() => this.phase === 'festive' && this.launch(), 300);
        this.launchIn = 1.6 + this.r() * 2.2;
      }
    } else if (this.phase === 'climax') {
      if (this.phaseT > 1.7 && this.scaffold.visible) this.explode();
      if (this.phaseT > 1.9 && this.phaseT < 4.5 && this.r() < dt * 9) this.launch(true);
      if (this.phaseT > 6.5) this.setPhase('dark');
    } else if (this.phase === 'dark') {
      // one star left high up, slowly going out
      if (this.phaseT < dt * 1.5 && this.lastLight) this.spawn(new Vector3(LAUNCH.x - 20, this.launchY + 120, LAUNCH.z), new Vector3(0, -0.25, 0), new Color(3.2, 2.4, 1.4), 9, 1.6);
    } else if (this.phase === 'return') {
      this.winter = Math.max(0, this.winter - dt / 3.5);
      this.snowUp = Math.min(1, this.snowUp + dt / 1.5);
    }
    // ---- rockets
    const g = 9.81;
    for (const k of this.rockets) {
      k.t += dt;
      k.v.y -= (k.flat ? g * 0.6 : g * 0.25) * dt;
      k.p.addScaledVector(k.v, dt);
      if (this.r() < 0.9) this.spawn(k.p, new Vector3((this.r() - 0.5) * 1.5, -1 - this.r(), (this.r() - 0.5) * 1.5), PALETTE[0]!, 0.5 + this.r() * 0.4, 0.5);
    }
    for (const k of this.rockets.filter((q) => q.t >= q.fuse)) this.burst(k.p, k.color, k.flat ? 60 : k.big ? 260 : 150, k.flat ? 12 : k.big ? 21 : 16, k.big && this.r() < 0.5 ? 'willow' : this.r() < 0.2 ? 'ring' : 'peony');
    this.rockets = this.rockets.filter((q) => q.t < q.fuse);
    // ---- sparks
    for (let i = 0; i < MAX_SPARKS; i++) {
      const L = this.life[i * 2]!;
      let a = this.life[i * 2 + 1]!;
      if (a >= L) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      a += dt;
      this.life[i * 2 + 1] = a;
      const o = i * 3;
      this.vel[o + 1] = this.vel[o + 1]! - g * 0.35 * dt;
      const drag = Math.exp(-1.6 * dt);
      this.vel[o] = this.vel[o]! * drag;
      this.vel[o + 1] = this.vel[o + 1]! * drag;
      this.vel[o + 2] = this.vel[o + 2]! * drag;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt;
      this.pos[o + 1] = this.pos[o + 1]! + this.vel[o + 1]! * dt;
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt;
      const u = a / L;
      const tw = reduced ? 1 : 0.75 + 0.25 * Math.sin(a * 40 + i);
      const b = (1 - u) * (1 - u) * tw;
      this.col[i * 4] = this.base[o]!;
      this.col[i * 4 + 1] = this.base[o + 1]! * (1 - u * 0.4);
      this.col[i * 4 + 2] = this.base[o + 2]! * (1 - u * 0.7);
      // after the explosion everything goes out at once, except the one slow star
      const k = this.phase === 'dark' || this.phase === 'return' ? (L > 8 ? 1 : Math.max(0, 1 - this.phaseT / 1.2)) : 1;
      this.col[i * 4 + 3] = b * k;
    }
    this.sparkGeo.attributes.position!.needsUpdate = true;
    this.sparkGeo.attributes.aCol!.needsUpdate = true;
    const scale = ctx.renderer.domElement.height / (2 * Math.tan(((ctx.camera.fov * Math.PI) / 180) / 2));
    (this.sparks.material as ShaderMaterial).uniforms.uScale!.value = scale;
    (this.lamps.material as ShaderMaterial).uniforms.uScale!.value = scale;
    // ---- lamps, snow, crowd
    const lampsOn = this.phase === 'festive' ? Math.min(1, this.phaseT / 2) : this.phase === 'climax' ? Math.max(0, 1 - this.phaseT / 2.5) : 0;
    (this.lamps.material as ShaderMaterial).uniforms.uOn!.value = lampsOn;
    this.crowd?.set(this.phase === 'festive' ? Math.min(1, this.phaseT / 3) : 0);
    this.fall += dt * (this.snowUp < 0 ? 1.1 * -this.snowUp : -2.4 * this.snowUp);
    const su = (this.snow.material as ShaderMaterial).uniforms;
    su.uFall!.value = this.fall;
    su.uScale!.value = scale;
    su.uAlpha!.value = 0.85 * Math.min(1, this.winter * 1.5) * (this.phase === 'dark' ? 0.35 : 1);
    // ---- light on the land: the last bursts tint terrain, trees, snow and fog (shared glow)
    this.light.multiplyScalar(Math.exp(-dt * (this.phase === 'climax' ? 1.2 : 2.6)));
    atmosphere.uGlowColor.value.copy(this.light);
    atmosphere.uGlowPos.value.copy(this.lightPos);
    // white flash (post), off in reduced flash
    this.flash *= Math.exp(-dt * 3.5);
    const f = reduced ? 0 : Math.min(0.85, this.flash);
    (ctx.post.uniforms.uFlash!.value as Color).setRGB(f, f * 0.85, f * 0.6);
    // ---- winter over the summer night
    this.applyWinter();
  }

  private applyWinter(): void {
    const L0 = this.lookBefore;
    if (!L0) return;
    const w = this.winter;
    const L = structuredClone(L0);
    L.snow = Math.max(L0.snow, 0.95 * w);
    L.season = L0.season + (2 - L0.season) * w;
    L.sky.stars = L0.sky.stars + (1 - L0.sky.stars) * w;
    const cold = (a: string, b: string) => '#' + new Color(a).lerp(new Color(b), w).getHexString();
    L.fog.color = cold(L0.fog.color, '#2a3242');
    L.ambient.sky = cold(L0.ambient.sky, '#4a5a80');
    // black and still after the explosion
    const dark = this.phase === 'dark' ? Math.min(1, this.phaseT / 1.2) : this.phase === 'return' ? Math.max(0, 1 - this.phaseT / 2.5) : 0;
    L.grade.exposure = this.exposure0 * (1 - 0.82 * dark);
    L.glow = { color: '#000000', intensity: 0 };
    this.ctx.world.look = L;
    this.ctx.world.applyLook();
    // applyLook resets the glow from the look; ours wins this frame
    atmosphere.uGlowColor.value.copy(this.light);
    atmosphere.uGlowPos.value.copy(this.lightPos);
  }

  dispose(): void {
    this.stop();
    this.group.removeFromParent();
    this.sparkGeo.dispose();
    this.lamps.geometry.dispose();
    this.snow.geometry.dispose();
    this.scaffold.geometry.dispose();
  }
}

/** A crowd heard, never seen: band-limited noise with a slow murmur envelope. */
function crowdMurmur(ctx: GameContext): { stop(): void; set(v: number): void } | null {
  const am = ctx.audio;
  const ac = am.ctx;
  const noise = am.noise();
  const src = am.createSource3D('ambience', { refDistance: 40, rolloff: 0.5 });
  if (!ac || !noise || !src) return null;
  src.setPosition(LAUNCH.x, 280, LAUNCH.z);
  const n = ac.createBufferSource();
  n.buffer = noise;
  n.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 520;
  bp.Q.value = 0.7;
  const g = ac.createGain();
  g.gain.value = 0;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.31;
  const lg = ac.createGain();
  lg.gain.value = 0.04;
  lfo.connect(lg).connect(g.gain);
  n.connect(bp).connect(g).connect(src.input);
  n.start();
  lfo.start();
  return {
    set(v) {
      g.gain.setTargetAtTime(0.09 * v, ac.currentTime, 0.4);
    },
    stop() {
      // cut, not faded: the silence after
      g.gain.cancelScheduledValues(ac.currentTime);
      g.gain.setValueAtTime(0, ac.currentTime);
      lg.gain.value = 0;
      setTimeout(() => {
        n.stop();
        lfo.stop();
        src.dispose();
      }, 200);
    },
  };
}
