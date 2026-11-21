/**
 * Sight cones on the ground (K2 "Augen im Nebel", playtest round 4: the sneak needed visible
 * danger). Each hound casts a faint amber fan on the ground in front of it, as long as the range at
 * which it would notice you right now (crouched, lantern out it shrinks: you see the rule work),
 * as wide as its field of view. Calm: pale amber; a hound that is getting suspicious deepens to
 * orange, one that sees you to red. Only while flags['hunt.cones'] is set (the story turns it on).
 *
 * Round 6 ("pale under the frost fog from 25 m on"): the fan is drawn after the ambient ground mist
 * and snow (render order 53, no fog of its own), and its edge is drawn in the fragment shader at a
 * fixed width in pixels — a dark ink border with a bright marching amber line inside it — so the
 * shape reads on pale frost however far and flat it lies.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, NormalBlending, ShaderMaterial } from 'three';
import type { PackSim } from './sim';

/**
 * One fan on the ground. `yaw` is a heading in radians whose forward is (−sin yaw, −cos yaw) —
 * the pack's `agent.heading` (for a placement yaw θ in degrees, 0 = north / 90 = east: yaw = −θ·π/180).
 * `fov` in radians, `range` in metres. `level` 0..1 deepens the colour (pack: awareness); `seen`
 * 0..1 pushes it to red (pack: sees). `rgb` (linear 0..1) overrides the pack's colour formula
 * (the court's pale → orange → red, src/systems/court).
 */
export interface ConeSpec {
  x: number;
  z: number;
  yaw: number;
  range: number;
  fov: number;
  level: number;
  seen?: number;
  rgb?: readonly [number, number, number];
}

/** The pack's fans (one per standing hound), exactly as K2 drew them before the cones took a list. */
export function packCones(sim: PackSim): ConeSpec[] {
  const st = sim.state;
  const alertMul = st === 'chasing' ? 1.35 : st === 'searching' ? 1.15 : 1;
  const fov = ((st === 'chasing' ? 230 : st === 'searching' ? 180 : 140) * Math.PI) / 180;
  const range = Math.max(4, sim.lastSight * alertMul);
  const out: ConeSpec[] = [];
  for (const a of sim.agents) {
    if (out.length >= MAXC) break;
    if (a.kind !== 'hound' || a.lie > 0.5) continue;
    out.push({ x: a.x, z: a.z, yaw: a.heading, range, fov, level: Math.min(1, a.awareness), seen: Math.min(1, a.sees * 2) });
  }
  return out;
}

const MAXC = 8;
const SEG = 22;
const RINGS = 6;
/** Points round a fan's outline: up one side, over the far arc, down the other. */
const OUTLINE = RINGS + 1 + SEG + 1 + RINGS + 1;
/** Height of the light fence along the outline (m): stands up off the ground at a grazing view. */
const FENCE_H = 0.7;

export class SightCones {
  readonly object: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  /** Per vertex: u across the fan 0..1, f along it 0..1. */
  private readonly uf: Float32Array;
  private k = 0;
  /** The fence: a low glowing curtain standing on the fan's outline (reads at 25–40 m, flat on). */
  private readonly fence: Mesh;
  private readonly fGeo = new BufferGeometry();
  private readonly fPos: Float32Array;
  private readonly fCol: Float32Array;

  constructor() {
    const vPer = (SEG + 1) * (RINGS + 1);
    this.pos = new Float32Array(MAXC * vPer * 3);
    this.col = new Float32Array(MAXC * vPer * 4);
    this.uf = new Float32Array(MAXC * vPer * 2);
    const idx: number[] = [];
    for (let c = 0; c < MAXC; c++) {
      const b = c * vPer;
      for (let r = 0; r < RINGS; r++)
        for (let s = 0; s < SEG; s++) {
          const a = b + r * (SEG + 1) + s;
          const d = a + SEG + 1;
          idx.push(a, d, a + 1, a + 1, d, d + 1);
        }
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 4));
    this.geo.setAttribute('aUF', new BufferAttribute(this.uf, 2));
    const mat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 color;
        attribute vec2 aUF;
        varying vec4 vC;
        varying vec2 vUF;
        void main() { vC = color; vUF = aUF; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uK;
        varying vec4 vC;
        varying vec2 vUF;
        void main() {
          // distance to the fan's border in pixels (sides and far rim), whatever the distance / slant
          float du = max(fwidth(vUF.x), 1e-5);
          float df = max(fwidth(vUF.y), 1e-5);
          float px = min(min(vUF.x, 1.0 - vUF.x) / du, (1.0 - vUF.y) / df);
          // the far rim marches (dashes running round the edge): the eye finds a moving line
          float dash = 0.6 + 0.4 * step(0.5, fract(vUF.x * 9.0 - uTime * 0.7));
          float ink = 1.0 - smoothstep(1.6, 2.6, px);
          float line = smoothstep(1.6, 2.6, px) * (1.0 - smoothstep(4.0, 5.2, px)) * dash;
          vec3 col = mix(vC.rgb, vec3(1.0, 0.72, 0.28), line * 0.85);
          col = mix(col, vec3(0.08, 0.02, 0.0), ink);
          // unused slots carry alpha 0: nothing (not even the border) is drawn for them
          if (vC.a <= 0.0005) discard;
          float a = max(vC.a, max(ink * 0.92, line * 0.95) * uK);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      // on bright frost an added glow vanishes: a warm stain of lantern-amber reads
      blending: NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side: DoubleSide,
    });
    this.object = new Mesh(this.geo, mat);
    this.object.frustumCulled = false;
    // the fence: two vertices (ground, top) per outline point
    this.fPos = new Float32Array(MAXC * OUTLINE * 2 * 3);
    this.fCol = new Float32Array(MAXC * OUTLINE * 2 * 4);
    const fIdx: number[] = [];
    for (let c = 0; c < MAXC; c++)
      for (let i = 0; i < OUTLINE - 1; i++) {
        const a = (c * OUTLINE + i) * 2;
        fIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    this.fGeo.setIndex(fIdx);
    this.fGeo.setAttribute('position', new BufferAttribute(this.fPos, 3));
    this.fGeo.setAttribute('color', new BufferAttribute(this.fCol, 4));
    const fMat = new ShaderMaterial({
      uniforms: { uTime: mat.uniforms.uTime! },
      vertexShader: /* glsl */ `
        attribute vec4 color;
        varying vec4 vC;
        void main() { vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        void main() {
          // vC.a carries the height fraction in its sign-free fract: alpha falls off upward
          float h = vC.a;
          if (h < 0.0) discard;
          float a = pow(1.0 - clamp(h, 0.0, 1.0), 1.6) * 0.62;
          // a dark foot, a warm glow above it: the line reads on frost and against the night
          vec3 col = mix(vec3(0.12, 0.03, 0.0), vC.rgb, smoothstep(0.0, 0.18, h));
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
    });
    this.fence = new Mesh(this.fGeo, fMat);
    this.fence.frustumCulled = false;
    this.fence.renderOrder = 53;
    this.object.add(this.fence);
    // after the ambient ground mist (49) and the snow / dust layers (50): not veiled by them
    this.object.renderOrder = 53;
    this.object.visible = false;
  }

  /** `sim` null fades the cones out. A list of fans (`ConeSpec[]`) draws those instead of a pack's. */
  update(input: PackSim | readonly ConeSpec[] | null, time: number, dt: number, heightAt: (x: number, z: number) => number): void {
    const sim = input === null ? null : Array.isArray(input) ? (input as readonly ConeSpec[]) : packCones(input as PackSim);
    // on at once (the danger is there the moment the hounds are), a short fade when they go
    this.k = sim ? 1 : Math.max(0, this.k - dt * 2);
    this.object.visible = this.k > 0.001 && !!(sim ?? this.last);
    if (sim) this.last = sim;
    if (!this.object.visible) {
      if (this.k <= 0.001) this.last = null;
      return;
    }
    this.col.fill(0);
    this.fCol.fill(-1);
    const u = (this.object.material as ShaderMaterial).uniforms;
    u.uTime!.value = time;
    u.uK!.value = this.k;
    this.fill((sim ?? this.last)!, time, heightAt);
    (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aUF') as BufferAttribute).needsUpdate = true;
    (this.fGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.fGeo.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  private last: readonly ConeSpec[] | null = null;

  private fill(cones: readonly ConeSpec[], time: number, heightAt: (x: number, z: number) => number): void {
    const vPer = (SEG + 1) * (RINGS + 1);
    let c = 0;
    for (const a of cones) {
      if (c >= MAXC) break;
      const aw = Math.min(1, Math.max(0, a.level));
      const seen = Math.min(1, Math.max(0, a.seen ?? 0));
      const hot = Math.max(aw, seen);
      const range = a.range;
      const fov = a.fov;
      // deep amber → orange → red: a dark warm stain reads on bright frost where a pale one vanished
      // (playtest round 5: "I could not see any fan on the snow")
      const r = a.rgb ? a.rgb[0] : 0.78 + 0.14 * hot;
      const g = a.rgb ? a.rgb[1] : 0.3 - 0.12 * aw - 0.22 * seen;
      const bl = a.rgb ? a.rgb[2] : 0.02;
      const pulse = 0.85 + 0.15 * Math.sin(time * 3 + c);
      const base = c * vPer;
      for (let ri = 0; ri <= RINGS; ri++) {
        const f = ri / RINGS;
        // round 6: a fuller fan (the fill alone carries the shape near; the inked border far)
        const d = 0.6 + f * (range - 0.6);
        for (let si = 0; si <= SEG; si++) {
          const u = si / SEG;
          const ang = a.yaw + (u - 0.5) * fov;
          const x = a.x - Math.sin(ang) * d;
          const z = a.z - Math.cos(ang) * d;
          const v = base + ri * (SEG + 1) + si;
          this.pos[v * 3] = x;
          this.pos[v * 3 + 1] = heightAt(x, z) + 0.12;
          this.pos[v * 3 + 2] = z;
          // strong near the hound, still a clear stain at its range (the border is the shader's)
          const alpha = Math.min(0.85, (0.42 * (1 - f) + 0.3) * pulse * (0.9 + 0.3 * hot)) * this.k;
          this.uf[v * 2] = u;
          this.uf[v * 2 + 1] = f;
          this.col[v * 4] = r;
          this.col[v * 4 + 1] = g;
          this.col[v * 4 + 2] = bl;
          this.col[v * 4 + 3] = alpha;
        }
      }
      // the fence on the outline: one side out, the far arc, the other side back
      const pts: number[] = [];
      for (let ri = 0; ri <= RINGS; ri++) pts.push(base + ri * (SEG + 1));
      for (let si = 0; si <= SEG; si++) pts.push(base + RINGS * (SEG + 1) + si);
      for (let ri = RINGS; ri >= 0; ri--) pts.push(base + ri * (SEG + 1) + SEG);
      const fr = Math.min(1, r * 1.15);
      const fg = Math.min(1, g * 1.15 + 0.06);
      for (let i = 0; i < OUTLINE; i++) {
        const v = pts[i]!;
        const o = (c * OUTLINE + i) * 2;
        const x = this.pos[v * 3]!;
        const y = this.pos[v * 3 + 1]! - 0.1;
        const z = this.pos[v * 3 + 2]!;
        // it fades in from the hound's own spot (no wall at its nose) and with the cones' fade
        const along = i <= RINGS ? i / RINGS : i >= OUTLINE - RINGS - 1 ? (OUTLINE - 1 - i) / RINGS : 1;
        const hgt = FENCE_H * Math.min(1, along * 1.6) * this.k;
        this.fPos.set([x, y, z, x, y + Math.max(0.01, hgt), z], o * 3);
        const fb = a.rgb ? Math.min(1, bl * 1.15) : 0.05;
        this.fCol.set([fr, fg, fb, hgt > 0.02 ? 0 : -1, fr, fg, fb, hgt > 0.02 ? 1 : -1], o * 4);
      }
      c++;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.fGeo.dispose();
    (this.fence.material as ShaderMaterial).dispose();
    (this.object.material as ShaderMaterial).dispose();
  }
}
