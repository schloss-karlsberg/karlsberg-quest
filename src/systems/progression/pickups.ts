/**
 * Glowing world pickups (docs/ACTION-RPG.md §7): a warm core with a four-point glint, a slow bob,
 * a small spinning token, rising motes and a pool of light on the ground — era-tinted, drawn
 * without fog so they pierce it out to ~40 m (with a minimum on-screen size), fading beyond.
 * Quest items, lore, weapons and charms also raise a faint light column (seen from ~80 m).
 *
 * Procedural only (D-007). Visual state only: what exists and who took it lives in the slice
 * (logic.ts); `sync()` mirrors it. A new pickup pops out and bounces once; a taken one flies to
 * the bottom of the view and bursts (reduced motion: it only fades).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  type PerspectiveCamera,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Era } from '../../core/era';
import type { ItemKind, PlacedPickup } from '../../rpg/types';

/** sRGB hex → linear colour × k (the world renders linear HDR before tone mapping). */
function lin(hex: number, k = 1): Color {
  return new Color(hex).convertSRGBToLinear().multiplyScalar(k);
}

export const ERA_TINT: Record<Era, number> = {
  today: 0xffd58a,
  '1789': 0xffc66e,
  '1793-02': 0xcfe4ff,
  '1793-07': 0xff9548,
  '1796': 0xeadcae,
};

/** Shared per-frame values. */
const shared = {
  uPix: { value: 600 },
  uTime: { value: 0 },
  uMotion: { value: 1 },
};

const GLOW_VERT = /* glsl */ `
uniform float uSize;
uniform float uMinPx;
uniform float uPix;
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float dist = max(0.3, -mv.z);
  float s = max(uSize, uMinPx * dist / uPix);
  mv.xy += position.xy * s;
  vDist = dist;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uFar;
uniform float uSeed;
uniform float uMotion;
varying vec2 vUv;
varying float vDist;
void main() {
  float d = length(vUv);
  float core = exp(-d * d * 30.0);
  float halo = exp(-d * d * 3.0) * 1.1 + exp(-d * 2.6) * 0.4;
  float ang = atan(vUv.y, vUv.x) + uTime * 0.35 * uMotion + uSeed;
  float rays = pow(max(0.0, cos(ang * 2.0)), 40.0) * exp(-d * 2.2) * 0.55;
  float fade = 1.0 - smoothstep(uFar, uFar * 1.6, vDist);
  float pulse = 0.82 + 0.18 * sin(uTime * 2.1 * uMotion + uSeed * 7.0);
  float a = (core * 1.7 + halo + rays) * uAlpha * fade * pulse * (1.0 - smoothstep(0.62, 1.0, d));
  if (a < 0.003) discard;
  vec3 c = mix(uColor, vec3(1.0, 0.97, 0.9) * max(uColor.r, max(uColor.g, uColor.b)), core * 0.65);
  gl_FragColor = vec4(c * a, a);
}
`;

const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform float uHeight;
uniform float uSpread;
uniform float uSize;
uniform float uPix;
uniform float uFar;
uniform float uMotion;
uniform float uBurst;
attribute vec4 aSeed;
varying float vA;
void main() {
  float t = uTime * uMotion;
  float life = fract(t * (0.12 + aSeed.x * 0.14) + aSeed.y);
  float ang = aSeed.z * 6.2831853 + t * (0.4 + aSeed.w * 0.5) * (aSeed.x > 0.5 ? 1.0 : -1.0);
  float r = uSpread * (0.25 + 0.75 * sqrt(aSeed.w)) * (1.0 - 0.5 * life) + uBurst * (1.5 + 2.5 * aSeed.w);
  vec3 p = vec3(cos(ang) * r, life * uHeight * (0.5 + 0.5 * aSeed.y) + uBurst * aSeed.y * 1.5, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.6, 1.0, life));
  float dist = -mv.z;
  vA = fade * uAlpha * (1.0 - smoothstep(uFar * 0.6, uFar, dist)) * (0.6 + 0.4 * sin(uTime * 5.0 + aSeed.z * 40.0));
  gl_PointSize = clamp(uSize * uPix * (0.6 + 0.8 * aSeed.y) / max(dist, 0.5), 1.0, 40.0);
}
`;

const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(q, q) * 6.0) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const POOL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const POOL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  float ring = exp(-pow((d - 0.55 - 0.08 * sin(uTime * 1.6 * uMotion)) * 9.0, 2.0)) * 0.5;
  float a = (exp(-d * d * 5.0) * 0.6 + ring) * (1.0 - smoothstep(0.85, 1.0, d)) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const BEAM_VERT = /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  vH = uv.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  float edge = pow(abs(dot(vN, vV)), 1.6);
  float a = edge * (1.0 - vH) * (1.0 - vH) * uAlpha * (0.8 + 0.2 * sin(vH * 14.0 - uTime * 2.0));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const QUAD = new PlaneGeometry(1, 1);
const POOL = new PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);
const BEAM = new CylinderGeometry(0.05, 0.22, 7, 14, 1, true).translate(0, 3.5, 0);
const TOKEN = new OctahedronGeometry(0.075, 0);
const MOTES = (() => {
  const n = 14;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  const seed = new Float32Array(n * 4);
  let s = 12345;
  for (let i = 0; i < seed.length; i++) seed[i] = (s = (s * 16807) % 2147483647) / 2147483647;
  g.setAttribute('aSeed', new BufferAttribute(seed, 4));
  return g;
})();

/** Precious things raise a light column. */
const BEAM_KINDS: ReadonlySet<ItemKind | 'opaque'> = new Set(['quest', 'lore', 'weapon', 'charm', 'key', 'opaque']);

interface Vis {
  p: PlacedPickup;
  root: Group;
  glow: Mesh<PlaneGeometry, ShaderMaterial>;
  motes: Points<BufferGeometry, ShaderMaterial>;
  pool: Mesh<PlaneGeometry, ShaderMaterial>;
  beam: Mesh<CylinderGeometry, ShaderMaterial> | null;
  token: Mesh<OctahedronGeometry, MeshBasicMaterial>;
  vis: number;
  /** Seconds since it appeared (pop-in), −1 = no pop. */
  born: number;
  /** Seconds since it was taken, −1 = lying there. */
  taken: number;
  seed: number;
  ground: number;
  /** Visual drift towards the player (drops only). */
  pull: Vector3;
}

export class PickupWorld {
  readonly group = new Group();
  private readonly items = new Map<string, Vis>();
  private warmSamples: Vis[] = [];
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  constructor(
    private readonly heightAt: (x: number, z: number, yHint?: number) => number,
    private readonly kindOf: (item: string) => ItemKind | 'opaque',
  ) {
    this.group.name = 'progression-pickups';
  }

  ids(): string[] {
    return [...this.items.keys()].filter((id) => this.items.get(id)!.taken < 0);
  }

  /** 0..1 how visible a pickup is now. */
  visibility(id: string): number {
    return this.items.get(id)?.vis ?? 0;
  }

  /** Mirror the slice's pickups (new ones pop in when `animate`). */
  sync(list: PlacedPickup[], animate: boolean): void {
    const want = new Set(list.map((p) => p.id));
    for (const [id, v] of this.items) if (!want.has(id) && v.taken < 0) this.remove(id);
    for (const p of list) {
      const have = this.items.get(p.id);
      if (have) {
        have.p = p;
        continue;
      }
      this.items.set(p.id, this.create(p, animate));
    }
  }

  /** Play the take animation (then the visual removes itself). */
  collect(id: string): void {
    const v = this.items.get(id);
    if (v && v.taken < 0) v.taken = 0;
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  dispose(): void {
    this.clear();
    for (const v of this.warmSamples) this.disposeMaterials(v);
    this.warmSamples = [];
  }

  /**
   * Stand-ins for the shader warm-up (src/systems/fx/shift/prewarm.ts): a plain pickup and a precious
   * one (with its light column), not added to the world. Each pickup builds its materials anew and
   * frees them when it goes, so without this the first pickup of a session compiles its three
   * programs in the frame it appears (the tour's chestnuts in t3; docs/PERFORMANCE.md §3.6).
   */
  samples(): Group[] {
    if (!this.warmSamples.length) {
      const make = (item: string) => this.create({ id: `prewarm.${item}`, item, x: 0, z: 0, era: 'today' }, false, false);
      this.warmSamples = [make('item.kastanie'), make('prewarm.opaque')];
    }
    return this.warmSamples.map((v) => v.root);
  }

  private create(p: PlacedPickup, animate: boolean, attach = true): Vis {
    const kind = this.kindOf(p.item);
    const precious = BEAM_KINDS.has(kind);
    // (round 9: at ×5–6 HDR the glints bloomed into huge white orbs that washed out the frame)
    const tint = lin(ERA_TINT[p.era] ?? 0xffd58a, precious ? 2.4 : 2);
    const seed = (p.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 97) / 9.7;
    const glow = new Mesh(
      QUAD,
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uPix: shared.uPix, uTime: shared.uTime, uMotion: shared.uMotion, uSize: { value: precious ? 1.05 : 0.85 }, uMinPx: { value: precious ? 30 : 24 }, uColor: { value: tint }, uAlpha: { value: 0 }, uFar: { value: 40 }, uSeed: { value: seed } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    glow.frustumCulled = false;
    glow.renderOrder = 6;
    const motes = new Points(
      MOTES,
      new ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        uniforms: { uTime: shared.uTime, uPix: shared.uPix, uMotion: shared.uMotion, uAlpha: { value: 0 }, uHeight: { value: precious ? 1.8 : 1.2 }, uSpread: { value: 0.45 }, uSize: { value: 0.075 }, uFar: { value: 45 }, uBurst: { value: 0 }, uColor: { value: tint.clone().multiplyScalar(0.8) } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    motes.frustumCulled = false;
    motes.renderOrder = 6;
    const pool = new Mesh(
      POOL,
      new ShaderMaterial({
        vertexShader: POOL_VERT,
        fragmentShader: POOL_FRAG,
        uniforms: { uTime: shared.uTime, uMotion: shared.uMotion, uColor: { value: tint.clone().multiplyScalar(0.18) }, uAlpha: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    pool.renderOrder = 5;
    let beam: Vis['beam'] = null;
    if (precious) {
      beam = new Mesh(
        BEAM,
        new ShaderMaterial({
          vertexShader: BEAM_VERT,
          fragmentShader: BEAM_FRAG,
          uniforms: { uTime: shared.uTime, uColor: { value: tint.clone().multiplyScalar(0.22) }, uAlpha: { value: 0 } },
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      beam.frustumCulled = false;
      beam.renderOrder = 5;
    }
    const token = new Mesh(TOKEN, new MeshBasicMaterial({ color: tint.clone().multiplyScalar(0.4), transparent: true, opacity: 0, depthWrite: false }));
    token.renderOrder = 6;
    const root = new Group();
    root.name = `pickup:${p.id}`;
    root.add(pool, glow, motes, token);
    if (beam) root.add(beam);
    if (attach) this.group.add(root);
    const ground = attach ? this.heightAt(p.x, p.z, p.y) : 0;
    return { p, root, glow, motes, pool, beam, token, vis: 0, born: animate ? 0 : -1, taken: -1, seed, ground, pull: new Vector3() };
  }

  private remove(id: string): void {
    const v = this.items.get(id);
    if (!v) return;
    this.group.remove(v.root);
    this.disposeMaterials(v);
    this.items.delete(id);
  }

  private disposeMaterials(v: Vis): void {
    v.glow.material.dispose();
    v.motes.material.dispose();
    v.pool.material.dispose();
    v.beam?.material.dispose();
    v.token.material.dispose();
  }

  /**
   * Per frame: visibility (era, storey, distance), bob, pop-in, drift, take animation.
   * `shown(p)` decides whether a pickup belongs to what the player sees now (era, storey).
   */
  frame(dt: number, time: number, camera: PerspectiveCamera, viewportHeight: number, player: Vector3, shown: (p: PlacedPickup) => boolean, reducedMotion: boolean): void {
    shared.uTime.value = time;
    shared.uMotion.value = reducedMotion ? 0 : 1;
    const vh = Math.max(200, viewportHeight);
    shared.uPix.value = vh / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const [id, v] of this.items) {
      const p = v.p;
      const dx = player.x - p.x;
      const dz = player.z - p.z;
      const dist = Math.hypot(dx, dz);
      const want = v.taken >= 0 ? 0 : shown(p) && dist < 95 ? 1 : 0;
      v.vis += (want - v.vis) * Math.min(1, dt * (want > v.vis ? 2.5 : 4));
      if (v.taken < 0 && v.vis < 0.002 && want === 0) {
        v.root.visible = false;
        continue;
      }
      v.root.visible = true;
      // drift: drops lean towards a player close by (a little "vacuum"), never through them
      if (p.drop && v.taken < 0 && dist < 3.4 && dist > 0.2) {
        const k = (1 - dist / 3.4) * 0.6;
        v.pull.set(dx * k, 0, dz * k);
      } else v.pull.multiplyScalar(Math.max(0, 1 - dt * 3));
      const bob = reducedMotion ? 0 : Math.sin(time * 1.7 + v.seed) * 0.09;
      let y = v.ground + 0.62 + bob;
      let scale = 1;
      if (v.born >= 0) {
        v.born += dt;
        const t = Math.min(1, v.born / 0.7);
        if (!reducedMotion) {
          // pop up and fall back with one bounce
          const hop = t < 0.6 ? Math.sin((t / 0.6) * Math.PI) * 1.1 : Math.sin(((t - 0.6) / 0.4) * Math.PI) * 0.22;
          y += hop;
        }
        scale = 0.3 + 0.7 * Math.min(1, t * 1.6);
        if (t >= 1) v.born = -1;
      }
      v.root.position.set(p.x + v.pull.x, v.ground, p.z + v.pull.z);
      let alpha = v.vis;
      if (v.taken >= 0) {
        v.taken += dt;
        const t = Math.min(1, v.taken / 0.42);
        if (!reducedMotion) {
          // fly to the bottom of the view, shrink, then burst
          camera.getWorldDirection(this.tmp);
          this.tmp2.copy(camera.position).addScaledVector(this.tmp, 0.9);
          this.tmp2.y -= 0.35;
          const e = t * t;
          const from = this.tmp.set(p.x + v.pull.x, v.ground + 0.62, p.z + v.pull.z);
          v.root.position.set(from.x + (this.tmp2.x - from.x) * e, v.ground, from.z + (this.tmp2.z - from.z) * e);
          y = from.y + (this.tmp2.y - from.y) * e;
          scale = 1 - 0.75 * e;
          v.motes.material.uniforms['uBurst']!.value = t;
        }
        alpha = (1 - t) * 1.4;
        if (t >= 1) {
          this.remove(id);
          continue;
        }
      }
      const ly = y - v.ground;
      v.glow.position.y = ly;
      v.glow.scale.setScalar(scale);
      v.token.position.y = ly;
      v.token.rotation.y = time * 1.9 + v.seed;
      v.token.rotation.x = 0.4;
      v.token.scale.setScalar(scale);
      v.motes.position.y = 0.1;
      v.pool.position.y = 0.1;
      v.glow.material.uniforms['uAlpha']!.value = alpha;
      v.motes.material.uniforms['uAlpha']!.value = alpha;
      v.pool.material.uniforms['uAlpha']!.value = v.taken >= 0 ? 0 : alpha;
      v.token.material.opacity = Math.min(1, alpha);
      if (v.beam) {
        // the column fades out when you stand next to it (it is for finding, not for looking at)
        v.beam.material.uniforms['uAlpha']!.value = (v.taken >= 0 ? 0 : alpha) * Math.min(1, Math.max(0, (dist - 4) / 10)) * (1 - Math.min(1, Math.max(0, (dist - 80) / 20)));
      }
    }
  }
}
