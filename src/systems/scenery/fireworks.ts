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
import { ERA_INFO } from '../../core/era';
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

const MAX_SPARKS = 9000;
const MAX_SMOKE = 90;
/** Spark flags: leaves a falling trail · pops into a crackle at the end · twinkles (strobe). */
const F_TRAIL = 1;
const F_CRACKLE = 2;
const F_STROBE = 4;
const PALETTE = [new Color(3.2, 2.2, 0.9), new Color(3.0, 0.9, 0.5), new Color(1.6, 2.4, 3.2), new Color(3.2, 3.0, 2.6), new Color(2.2, 3.0, 1.2), new Color(3.2, 1.6, 2.6)];

const SPARK_VERT = /* glsl */ `
attribute vec4 aCol;   // rgb, brightness
uniform float uScale;
varying vec4 vCol;
void main() {
  vCol = aCol;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  // sparks must read at 160 m (playtest round 2: clamped to 1–7 px they vanished): world size
  // ~1–3 m, at least 2 px, up to 26 px close by
  gl_PointSize = aCol.a < 0.002 ? 0.0 : clamp(uScale * (0.9 + aCol.a * 2.2) / max(-mv.z, 1.0), 2.0, 26.0);
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
  gl_PointSize = vA < 0.01 ? 0.0 : clamp(uScale * 0.55 / max(-mv.z, 1.0), 1.6, 7.0);
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

const SMOKE_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute vec4 aSmoke; // size, alpha, seed, -
uniform float uScale;
varying float vA;
varying float vSeed;
varying vec3 vPos;
void main() {
  vA = aSmoke.y;
  vSeed = aSmoke.z;
  vPos = position;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_PointSize = vA < 0.002 ? 0.0 : clamp(uScale * aSmoke.x / max(-mv.z, 1.0), 2.0, 380.0);
  gl_Position = projectionMatrix * mv;
}
`;
const SMOKE_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying float vA;
varying float vSeed;
varying vec3 vPos;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float n = 0.65 + 0.35 * sin(c.x * 9.0 + vSeed * 30.0) * sin(c.y * 7.0 - vSeed * 17.0);
  // powder smoke hanging in the sky, lit by the last bursts
  float d = length(vPos - uGlowPos);
  vec3 lit = uGlowColor * 0.55 / (1.0 + d * d * 0.0004);
  vec3 col = vec3(0.16, 0.17, 0.2) * (uSkyAmbient * 0.8 + 0.25) + lit;
  gl_FragColor = vec4(col, vA * n * (1.0 - r * r));
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
  /** Shell type at the burst (null: chosen at random). */
  kind?: BurstKind | null;
}

type BurstKind = 'peony' | 'willow' | 'ring' | 'chrys' | 'palm' | 'crossette' | 'crackle';

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
  private readonly flags = new Uint8Array(MAX_SPARKS);
  private readonly trailT = new Float32Array(MAX_SPARKS);
  private readonly smokePos = new Float32Array(MAX_SMOKE * 3);
  private readonly smokeAttr = new Float32Array(MAX_SMOKE * 4);
  private readonly smokeLife = new Float32Array(MAX_SMOKE * 2);
  private smokeNext = 0;
  private readonly smoke: Points;
  /** Pending crackles (time left, position) — the glitter pops after the stars burn out. */
  private crackles: { t: number; p: Vector3 }[] = [];
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
  /** Seconds left of the gentle turn of the view towards the scaffold. */
  private lookT = 0;

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
    // powder smoke left in the sky by the shells (lit by the next ones)
    const smg = new BufferGeometry();
    smg.setAttribute('position', new BufferAttribute(this.smokePos, 3));
    smg.setAttribute('aSmoke', new BufferAttribute(this.smokeAttr, 4));
    this.smoke = new Points(smg, new ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: { ...atmosphere, uScale: { value: 600 } }, transparent: true, depthWrite: false }));
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 57;
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
    this.group.add(this.lamps, this.scaffold, this.smoke, this.sparks, this.snow);
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
    this.smokeLife.fill(0);
    this.crackles = [];
    this.crowd = crowdMurmur(this.ctx);
    // the show is east of the Rondell: turn the view there and up to where the shells open (the
    // quest brings the player facing north); the frame holds a while, the player may look away
    this.lookT = 4.5;
    this.ctx.ui.hud.setEraLabel(this.ctx.t('ui.hud.era.1785'));
  }

  /** Jump to a phase (the echo's lines drive it). */
  setPhase(p: FireworksPhase): void {
    if (p === this.phase || this.phase === 'off') return;
    this.phase = p;
    this.phaseT = 0;
    if (p === 'climax') {
      this.climax();
      this.lookT = Math.max(this.lookT, 1.4);
    }
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
    this.ctx.ui.hud.setEraLabel(this.ctx.t(ERA_INFO[this.ctx.era.current].labelKey));
  }

  /** Ease the view towards the sky above the scaffold (a look-at cue, not a lock). */
  private turnView(dt: number): void {
    if (this.lookT <= 0) return;
    this.lookT -= dt;
    const pl = this.ctx.player;
    const dx = LAUNCH.x - pl.position.x;
    const dz = LAUNCH.z - pl.position.z;
    const want = Math.atan2(-dx, -dz);
    let d = want - pl.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = Math.min(1, dt * (this.ctx.settings.state.reducedMotion ? 6 : 2.6));
    pl.yaw += d * k;
    const burstY = this.launchY + 105 - pl.position.y - 1.6;
    const pitch = Math.max(0.05, Math.min(0.75, Math.atan2(burstY * 0.82, Math.hypot(dx, dz))));
    pl.pitch += (pitch - pl.pitch) * k;
  }

  private spawn(p: Vector3, v: Vector3, color: Color, life: number, bright = 1, flags = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_SPARKS;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r * bright, color.g * bright, color.b * bright], i * 3);
    this.life[i * 2] = life;
    this.life[i * 2 + 1] = 0;
    this.flags[i] = flags;
    this.trailT[i] = 0;
  }

  private puff(p: Vector3, size: number, alpha: number): void {
    const i = this.smokeNext;
    this.smokeNext = (this.smokeNext + 1) % MAX_SMOKE;
    this.smokePos.set([p.x + (this.r() - 0.5) * size * 0.4, p.y + (this.r() - 0.5) * size * 0.3, p.z + (this.r() - 0.5) * size * 0.4], i * 3);
    this.smokeAttr.set([size, alpha, this.r(), 0], i * 4);
    this.smokeLife[i * 2] = 14 + this.r() * 8;
    this.smokeLife[i * 2 + 1] = 0;
  }

  /** Burst sound arrives late: light first, the thump after (sound runs 340 m/s). */
  private soundLater(kind: 'burst' | 'crackle', p: Vector3, level: number, extra = 0): void {
    const c = this.ctx.camera.position;
    const ms = (Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) / 340) * 1000 + extra;
    const q = p.clone();
    setTimeout(() => this.phase !== 'off' && fireworkSound(this.ctx.audio, kind, q.x, q.y, q.z, level), ms);
  }

  private burst(p: Vector3, color: Color, n: number, speed: number, kind: BurstKind = 'peony'): void {
    const r = this.r;
    const axis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    n = Math.round(n * this.sparkScale());
    const reduced = this.reduced();
    // an even sphere of stars (golden-angle spiral) reads as a real shell, random dirs as a blob
    const even = kind === 'chrys' || kind === 'peony' || kind === 'crackle';
    for (let i = 0; i < n; i++) {
      let d: Vector3;
      if (even) {
        const y = 1 - (2 * (i + 0.5)) / n;
        const rr = Math.sqrt(1 - y * y);
        const th = i * 2.39996 + r() * 0.15;
        d = new Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
      } else d = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      if (kind === 'ring') d.sub(axis.clone().multiplyScalar(d.dot(axis)));
      if (kind === 'palm') d.set(d.x * 0.7, Math.abs(d.y) * 0.6 + 0.5, d.z * 0.7);
      const sp = speed * (even ? 0.92 + r() * 0.1 : kind === 'palm' ? 0.8 + r() * 0.2 : 0.55 + r() * 0.45);
      d.normalize().multiplyScalar(sp);
      const life = kind === 'willow' ? 3.4 + r() * 1.4 : kind === 'chrys' || kind === 'palm' ? 2.4 + r() * 0.8 : kind === 'crackle' ? 1.3 + r() * 0.4 : 1.7 + r() * 1.0;
      let flags = 0;
      if (kind === 'chrys' || kind === 'palm' || kind === 'willow') flags |= F_TRAIL;
      if (kind === 'crackle' || (kind === 'chrys' && r() < 0.3)) flags |= F_CRACKLE;
      if (kind === 'crackle' && !reduced) flags |= F_STROBE;
      const col = kind === 'crackle' ? PALETTE[3]! : r() < 0.12 ? PALETTE[3]! : color;
      this.spawn(p, d, col, life, kind === 'willow' ? 0.75 : kind === 'chrys' ? 1.15 : 1, flags);
    }
    if (kind === 'chrys' || kind === 'peony') {
      // the pistil: a tight inner sphere of another colour
      const inner = PALETTE[(PALETTE.indexOf(color) + 3) % PALETTE.length]!;
      const m = Math.round(n * 0.25);
      for (let i = 0; i < m; i++) {
        const d = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(speed * 0.38);
        this.spawn(p, d, inner, 1.2 + r() * 0.5, 1.3);
      }
    }
    if (kind === 'crossette') {
      // four stars that fly out and split into crosses
      for (let i = 0; i < 6; i++) {
        const d = new Vector3(r() * 2 - 1, r() * 0.8, r() * 2 - 1).normalize();
        const q = p.clone().addScaledVector(d, speed * 0.5);
        setTimeout(() => {
          if (this.phase === 'off') return;
          for (const ax of [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)])
            this.spawn(q, ax.multiplyScalar(speed * 0.45).add(d.clone().multiplyScalar(4)), color, 1.1 + r() * 0.4, 1.2, F_TRAIL);
          this.soundLater('crackle', q, 0.35);
        }, 520);
      }
    }
    for (let i = 0; i < 3; i++) this.puff(p, 26 + r() * 22, 0.32 + r() * 0.12);
    // coloured light on the snow, the slope and the pavilions; during the climax many flat
    // rockets burst at once and the night grade (exposure 1.6) would wash the slope out to white
    const big = kind === 'chrys' || kind === 'palm' || kind === 'willow';
    const k = (reduced ? 0.35 : 1) * (this.phase === 'climax' ? 0.3 : big ? 1.05 : 0.7);
    this.light.copy(color).multiplyScalar(0.9 * k);
    this.lightPos.copy(p);
    this.lastLight = p.clone();
    if (!reduced) this.flash = Math.max(this.flash, big ? 0.09 : 0.06);
    this.soundLater('burst', p, big ? 1 : 0.8);
    if (kind !== 'willow') this.soundLater('crackle', p, 0.6, 500);
  }

  private launch(flat = false, big = false): void {
    const r = this.r;
    const p = new Vector3(LAUNCH.x + (r() - 0.5) * 4, this.launchY + 14, LAUNCH.z + (r() - 0.5) * 4);
    const v = flat
      ? new Vector3((r() - 0.5) * 2, 0.15 + r() * 0.35, (r() - 0.5) * 2).normalize().multiplyScalar(26 + r() * 20)
      : new Vector3((r() - 0.5) * 7 - 8, 44 + r() * 14, (r() - 0.5) * 7);
    // shells climb high above the slope (100–150 m) so they fill the sky over the Rondell
    if (!flat) v.multiplyScalar(1.12);
    this.rockets.push({ p, v, t: 0, fuse: flat ? 0.6 + r() * 1.2 : 2.0 + r() * 0.8, color: PALETTE[Math.floor(r() * PALETTE.length)]!, big, flat, kind: null });
    fireworkSound(this.ctx.audio, 'launch', p.x, p.y, p.z, flat ? 0.6 : 1);
  }

  private climax(): void {
    // cannon flashes first, then everything on the one scaffold at once
    const c = new Vector3(LAUNCH.x, this.launchY + 4, LAUNCH.z);
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (this.phase !== 'climax') return;
        fireworkSound(this.ctx.audio, 'cannon', c.x + (i - 2) * 6, c.y, c.z, 1);
        this.light.setRGB(3, 1.6, 0.6).multiplyScalar(this.reduced() ? 0.5 : 1.1);
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
    // warm and strong, but the snowy slope must not burn out to white (it reads as a flash otherwise)
    this.light.setRGB(3.4, 2.2, 1.1).multiplyScalar(reduced ? 0.6 : 1.3);
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
    this.turnView(dt);
    // ---- schedule
    if (this.phase === 'festive') {
      this.winter = Math.min(1, this.winter + dt / 2.5);
      this.launchIn -= dt;
      if (this.launchIn <= 0) {
        this.launch(false, this.r() < 0.45);
        // salvos: two or three shells close together, now and then a fan of five
        const extra = this.r() < 0.18 ? 4 : this.r() < 0.5 ? 1 + Math.floor(this.r() * 2) : 0;
        for (let i = 1; i <= extra; i++) setTimeout(() => this.phase === 'festive' && this.launch(false, extra >= 4 && i === extra), 260 * i);
        this.launchIn = 1.1 + this.r() * 1.7;
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
      // a bright head and a long, slow trail
      this.spawn(k.p, new Vector3((this.r() - 0.5) * 1.5, -1 - this.r(), (this.r() - 0.5) * 1.5), PALETTE[0]!, 0.9 + this.r() * 0.6, 0.8);
      if (this.r() < 0.5) this.spawn(k.p, new Vector3(0, 0.5, 0), PALETTE[3]!, 0.25, 1.6);
    }
    for (const k of this.rockets.filter((q) => q.t >= q.fuse)) {
      if (k.flat) {
        this.burst(k.p, k.color, 80, 14, 'peony');
        continue;
      }
      const u = this.r();
      const kind: BurstKind = k.kind ?? (k.big ? (u < 0.4 ? 'chrys' : u < 0.7 ? 'willow' : 'palm') : u < 0.3 ? 'peony' : u < 0.5 ? 'chrys' : u < 0.65 ? 'ring' : u < 0.82 ? 'crossette' : 'crackle');
      const n = kind === 'chrys' ? (k.big ? 520 : 340) : kind === 'willow' ? 420 : kind === 'palm' ? 90 : kind === 'crossette' ? 40 : kind === 'crackle' ? 260 : k.big ? 380 : 240;
      this.burst(k.p, k.color, n, k.big ? 38 : 29, kind);
    }
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
      const fl = this.flags[i]!;
      if (fl & F_TRAIL && u < 0.85) {
        // a falling tail of dim embers behind each star
        this.trailT[i] = this.trailT[i]! + dt;
        if (this.trailT[i]! > 0.06) {
          this.trailT[i] = 0;
          const j = this.next;
          this.next = (this.next + 1) % MAX_SPARKS;
          if (j !== i) {
            this.pos.set([this.pos[o]!, this.pos[o + 1]!, this.pos[o + 2]!], j * 3);
            this.vel.set([this.vel[o]! * 0.1, -0.6, this.vel[o + 2]! * 0.1], j * 3);
            this.base.set([this.base[o]! * 0.55, this.base[o + 1]! * 0.4, this.base[o + 2]! * 0.25], j * 3);
            this.life[j * 2] = 0.7 + (i % 5) * 0.08;
            this.life[j * 2 + 1] = 0;
            this.flags[j] = 0;
          }
        }
      }
      if (fl & F_CRACKLE && a + dt >= L && this.crackles.length < 60) this.crackles.push({ t: 0.05 + (i % 7) * 0.03, p: new Vector3(this.pos[o], this.pos[o + 1], this.pos[o + 2]) });
      const strobe = fl & F_STROBE ? (Math.sin(a * 55 + i * 1.7) > 0.2 ? 1.5 : 0.15) : 1;
      const tw = (reduced ? 1 : 0.75 + 0.25 * Math.sin(a * 40 + i)) * strobe;
      const b = (1 - u) * (1 - u) * tw;
      this.col[i * 4] = this.base[o]!;
      this.col[i * 4 + 1] = this.base[o + 1]! * (1 - u * 0.4);
      this.col[i * 4 + 2] = this.base[o + 2]! * (1 - u * 0.7);
      // after the explosion everything goes out at once, except the one slow star
      const k = this.phase === 'dark' || this.phase === 'return' ? (L > 8 ? 1 : Math.max(0, 1 - this.phaseT / 1.2)) : 1;
      this.col[i * 4 + 3] = b * k;
    }
    // crackles: the glitter pops into tiny white flashes after the stars go out
    if (this.crackles.length) {
      let popped = 0;
      for (const c of this.crackles) {
        c.t -= dt;
        if (c.t > 0) continue;
        popped++;
        for (let k = 0; k < 3; k++) this.spawn(c.p, new Vector3((this.r() - 0.5) * 6, (this.r() - 0.5) * 6, (this.r() - 0.5) * 6), PALETTE[3]!, 0.12 + this.r() * 0.1, 2.2);
      }
      if (popped) {
        this.soundLater('crackle', this.crackles[0]!.p, Math.min(0.5, 0.15 + popped * 0.01));
        this.crackles = this.crackles.filter((c) => c.t > 0);
      }
    }
    // powder smoke drifts and thins
    for (let i = 0; i < MAX_SMOKE; i++) {
      const L = this.smokeLife[i * 2]!;
      const a = this.smokeLife[i * 2 + 1]!;
      if (L <= 0 || a >= L) {
        this.smokeAttr[i * 4 + 1] = 0;
        continue;
      }
      this.smokeLife[i * 2 + 1] = a + dt;
      this.smokePos[i * 3] = this.smokePos[i * 3]! + 0.9 * dt;
      this.smokePos[i * 3 + 1] = this.smokePos[i * 3 + 1]! + 0.25 * dt;
      const u = a / L;
      this.smokeAttr[i * 4 + 1] = Math.min(1, a / 0.8) * (1 - u) * 0.38 * (this.phase === 'return' ? Math.max(0, 1 - this.phaseT / 2) : 1);
      this.smokeAttr[i * 4] = this.smokeAttr[i * 4]! * (1 + dt * 0.04);
    }
    this.smoke.geometry.attributes.position!.needsUpdate = true;
    this.smoke.geometry.attributes.aSmoke!.needsUpdate = true;
    this.sparkGeo.attributes.position!.needsUpdate = true;
    this.sparkGeo.attributes.aCol!.needsUpdate = true;
    const scale = ctx.renderer.domElement.height / (2 * Math.tan(((ctx.camera.fov * Math.PI) / 180) / 2));
    (this.sparks.material as ShaderMaterial).uniforms.uScale!.value = scale;
    (this.lamps.material as ShaderMaterial).uniforms.uScale!.value = scale;
    (this.smoke.material as ShaderMaterial).uniforms.uScale!.value = scale;
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
    this.light.multiplyScalar(Math.exp(-dt * (this.phase === 'climax' ? 2.0 : 2.6)));
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
    this.smoke.geometry.dispose();
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
