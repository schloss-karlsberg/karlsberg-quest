/**
 * The burning palace, drawn with a handful of instanced draw calls: glowing windows, flame
 * tongues (windows + roofs), smoke columns lit from below, embers, collapse sparks and halos.
 * All per-room animation comes from a 1-row state texture written once per frame.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  Group,
  InstancedBufferAttribute,
  Mesh,
  NearestFilter,
  NormalBlending,
  Points,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector4,
} from 'three';
import { atmosphere } from '../../../world/atmosphere';
import { quadInstanced } from '../gl';
import { rng } from '../geom';
import { FLAME_STRIDE, type FireEmitters, SRC_STRIDE, WIN_STRIDE } from './emitters';
import {
  EMBER_FRAG,
  EMBER_VERT,
  FLAME_FRAG,
  FLAME_VERT,
  HALO_FRAG,
  HALO_VERT,
  SMOKE_FRAG,
  SMOKE_VERT,
  SPARK_VERT,
  WINDOW_FRAG,
  WINDOW_VERT,
} from './shaders';

const SMOKE_PER_SOURCE = { high: 34, low: 14 };
const EMBERS_PER_SOURCE = { high: 220, low: 80 };
const SPARKS_PER_BURST = 520;

export class FireVisuals {
  readonly object = new Group();
  readonly stateTex: DataTexture;
  private readonly state: Float32Array;
  private readonly flash: Float32Array;
  readonly wind = new Vector2(0.42, -0.12);
  private readonly mats: ShaderMaterial[] = [];
  private readonly smoke: Mesh;
  private readonly embers: Points;
  private readonly halos: Mesh;
  private readonly sparks: Points;
  private readonly bursts: Vector4[] = [0, 1, 2, 3].map(() => new Vector4(0, -1e4, 0, -1e4));
  private nextBurst = 0;
  private readonly sources: number;

  constructor(
    readonly emitters: FireEmitters,
    readonly unitCount: number,
    high: boolean,
    /** Draw window glow quads (only when the palace shader can't light its own windows). */
    windowQuads = true,
  ) {
    this.object.name = 'fx-fire';
    const n = Math.max(1, unitCount);
    this.state = new Float32Array(n * 4);
    this.flash = new Float32Array(n);
    this.stateTex = new DataTexture(this.state, n, 1, RGBAFormat, FloatType);
    this.stateTex.magFilter = this.stateTex.minFilter = NearestFilter;
    this.stateTex.generateMipmaps = false;
    this.stateTex.needsUpdate = true;
    const shared = { ...atmosphere, uState: { value: this.stateTex }, uWind: { value: this.wind } };

    // windows
    if (windowQuads) {
      const c = emitters.counts.windows;
      const W = emitters.windows;
      const g = quadInstanced();
      const pos = new Float32Array(c * 3);
      const dir = new Float32Array(c * 4);
      const unit = new Float32Array(c * 2);
      const r = rng(23);
      for (let i = 0; i < c; i++) {
        const o = i * WIN_STRIDE;
        pos.set([W[o]!, W[o + 1]!, W[o + 2]!], i * 3);
        dir.set([W[o + 3]!, W[o + 4]!, W[o + 5]!, W[o + 6]!], i * 4);
        unit.set([W[o + 7]!, r()], i * 2);
      }
      g.setAttribute('aPos', new InstancedBufferAttribute(pos, 3));
      g.setAttribute('aDir', new InstancedBufferAttribute(dir, 4));
      g.setAttribute('aUnit', new InstancedBufferAttribute(unit, 2));
      g.instanceCount = c;
      this.add(new Mesh(g, this.mat(WINDOW_VERT, WINDOW_FRAG, shared, AdditiveBlending)), 30);
    }
    // flames
    {
      const c = emitters.counts.flames;
      const F = emitters.flames;
      const g = quadInstanced();
      const pos = new Float32Array(c * 3);
      const dim = new Float32Array(c * 4);
      const kind = new Float32Array(c);
      for (let i = 0; i < c; i++) {
        const o = i * FLAME_STRIDE;
        pos.set([F[o]!, F[o + 1]!, F[o + 2]!], i * 3);
        dim.set([F[o + 3]!, F[o + 4]!, F[o + 5]!, F[o + 6]!], i * 4);
        kind[i] = F[o + 7]!;
      }
      g.setAttribute('aPos', new InstancedBufferAttribute(pos, 3));
      g.setAttribute('aDim', new InstancedBufferAttribute(dim, 4));
      g.setAttribute('aKind', new InstancedBufferAttribute(kind, 1));
      g.instanceCount = c;
      this.add(new Mesh(g, this.mat(FLAME_VERT, FLAME_FRAG, shared, AdditiveBlending)), 32);
    }
    // smoke, embers, halos share the per-source attributes
    const S = emitters.sources;
    this.sources = emitters.counts.sources;
    const perSource = (k: number, seed: number, lifeMin: number, lifeVar: number) => {
      const r = rng(seed);
      const src = new Float32Array(this.sources * k * 4);
      const sd = new Float32Array(this.sources * k * 4);
      for (let s = 0; s < this.sources; s++) {
        for (let j = 0; j < k; j++) {
          const i = s * k + j;
          const o = s * SRC_STRIDE;
          src.set([S[o]!, S[o + 1]!, S[o + 2]!, S[o + 3]!], i * 4);
          sd.set([S[o + 4]!, (j + r()) / k, r(), lifeMin + r() * lifeVar], i * 4);
        }
      }
      return { src, sd };
    };
    {
      const k = high ? SMOKE_PER_SOURCE.high : SMOKE_PER_SOURCE.low;
      const { src, sd } = perSource(k, 31, 11, 7);
      const g = quadInstanced();
      g.setAttribute('aSrc', new InstancedBufferAttribute(src, 4));
      g.setAttribute('aSeed', new InstancedBufferAttribute(sd, 4));
      g.instanceCount = this.sources * k;
      const m = this.mat(SMOKE_VERT, SMOKE_FRAG, { ...shared, uDensity: { value: high ? 0.85 : 1.1 } }, NormalBlending);
      this.smoke = new Mesh(g, m);
      this.add(this.smoke, 40);
    }
    {
      const k = high ? EMBERS_PER_SOURCE.high : EMBERS_PER_SOURCE.low;
      const { src, sd } = perSource(k, 37, 0, 1);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(this.sources * k * 3), 3));
      g.setAttribute('aSrc', new BufferAttribute(src, 4));
      g.setAttribute('aSeed', new BufferAttribute(sd, 4));
      this.embers = new Points(g, this.mat(EMBER_VERT, EMBER_FRAG, { ...shared, uScale: { value: 500 } }, AdditiveBlending));
      this.add(this.embers, 41);
    }
    {
      const { src, sd } = perSource(1, 41, 0, 1);
      const g = quadInstanced();
      g.setAttribute('aSrc', new InstancedBufferAttribute(src, 4));
      g.setAttribute('aSeed', new InstancedBufferAttribute(sd, 4));
      g.instanceCount = this.sources;
      this.halos = new Mesh(g, this.mat(HALO_VERT, HALO_FRAG, shared, AdditiveBlending));
      this.halos.visible = high;
      this.add(this.halos, 29);
    }
    {
      const r = rng(43);
      const n = SPARKS_PER_BURST * 4;
      const vel = new Float32Array(n * 4);
      const rand = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const up = 0.35 + r() * 0.65;
        const sp = 5 + Math.pow(r(), 0.6) * 17;
        vel.set([Math.cos(a) * Math.sqrt(1 - up * up) * sp, up * sp * 1.2, Math.sin(a) * Math.sqrt(1 - up * up) * sp, Math.floor(i / SPARKS_PER_BURST)], i * 4);
        rand[i] = r();
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aVel', new BufferAttribute(vel, 4));
      g.setAttribute('aRand', new BufferAttribute(rand, 1));
      const m = new ShaderMaterial({
        vertexShader: SPARK_VERT,
        fragmentShader: EMBER_FRAG,
        uniforms: { uBursts: { value: this.bursts }, uNow: atmosphere.uTime, uScale: { value: 500 }, uWind: { value: this.wind } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      this.mats.push(m);
      this.sparks = new Points(g, m);
      this.add(this.sparks, 42);
    }
  }

  private mat(vertexShader: string, fragmentShader: string, uniforms: Record<string, { value: unknown }>, blending: typeof AdditiveBlending | typeof NormalBlending): ShaderMaterial {
    const m = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, blending });
    this.mats.push(m);
    return m;
  }

  private add(o: Mesh | Points, order: number): void {
    o.frustumCulled = false;
    o.renderOrder = order;
    this.object.add(o);
  }

  /** Halos are the expensive part that can go at runtime (particle counts are fixed at build). */
  setQuality(high: boolean): void {
    this.halos.visible = high;
  }

  /** Write one unit's look for this frame. */
  setUnit(i: number, burn: number, smoke: number): void {
    this.state[i * 4] = burn;
    this.state[i * 4 + 1] = smoke;
    this.state[i * 4 + 2] = this.flash[i]!;
  }

  /** A roof / stair falls in: sparks, a dust-and-smoke surge. */
  collapse(i: number, x: number, y: number, z: number, now: number, strength = 1): void {
    this.flash[i] = strength;
    const b = this.bursts[this.nextBurst]!;
    b.set(x, y, z, now);
    this.nextBurst = (this.nextBurst + 1) % this.bursts.length;
  }

  /** Per frame: decay collapse flashes, upload the state texture, keep point sizes right. */
  frame(dt: number, pointScale: number): void {
    for (let i = 0; i < this.unitCount; i++) {
      this.flash[i] = Math.max(0, this.flash[i]! - dt / 4);
    }
    this.stateTex.needsUpdate = true;
    (this.embers.material as ShaderMaterial).uniforms.uScale!.value = pointScale;
    (this.sparks.material as ShaderMaterial).uniforms.uScale!.value = pointScale;
  }

  dispose(): void {
    this.object.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.mats) m.dispose();
    this.stateTex.dispose();
  }
}
