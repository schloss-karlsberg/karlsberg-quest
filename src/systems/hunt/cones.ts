/**
 * Sight cones on the ground (K2 "Augen im Nebel", playtest round 4: the sneak needed visible
 * danger). Each hound casts a faint amber fan on the ground in front of it, as long as the range at
 * which it would notice you right now (crouched, lantern out it shrinks: you see the rule work),
 * as wide as its field of view. Calm: pale amber; a hound that is getting suspicious deepens to
 * orange, one that sees you to red. Only while flags['hunt.cones'] is set (the story turns it on).
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, NormalBlending, ShaderMaterial } from 'three';
import type { PackSim } from './sim';

const MAXC = 8;
const SEG = 18;
const RINGS = 4;

export class SightCones {
  readonly object: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private k = 0;

  constructor() {
    const vPer = (SEG + 1) * (RINGS + 1);
    this.pos = new Float32Array(MAXC * vPer * 3);
    this.col = new Float32Array(MAXC * vPer * 4);
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
    const mat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 color;
        varying vec4 vC;
        void main() { vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        void main() { gl_FragColor = vec4(vC.rgb, vC.a); }`,
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
    this.object.renderOrder = 6;
    this.object.visible = false;
  }

  /** `sim` null fades the cones out. */
  update(sim: PackSim | null, time: number, dt: number, heightAt: (x: number, z: number) => number): void {
    // on at once (the danger is there the moment the hounds are), a short fade when they go
    this.k = sim ? 1 : Math.max(0, this.k - dt * 2);
    this.object.visible = this.k > 0.001 && !!(sim ?? this.last);
    if (sim) this.last = sim;
    if (!this.object.visible) {
      if (this.k <= 0.001) this.last = null;
      return;
    }
    this.col.fill(0);
    this.fill((sim ?? this.last)!, time, heightAt);
    (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  private last: PackSim | null = null;

  private fill(sim: PackSim, time: number, heightAt: (x: number, z: number) => number): void {
    const vPer = (SEG + 1) * (RINGS + 1);
    const st = sim.state;
    const alertMul = st === 'chasing' ? 1.35 : st === 'searching' ? 1.15 : 1;
    const fov = ((st === 'chasing' ? 230 : st === 'searching' ? 180 : 140) * Math.PI) / 180;
    const range = Math.max(4, sim.lastSight * alertMul);
    let c = 0;
    for (const a of sim.agents) {
      if (c >= MAXC) break;
      if (a.kind !== 'hound' || a.lie > 0.5) continue;
      const aw = Math.min(1, a.awareness);
      const seen = Math.min(1, a.sees * 2);
      const hot = Math.max(aw, seen);
      // deep amber → orange → red: a dark warm stain reads on bright frost where a pale one vanished
      // (playtest round 5: "I could not see any fan on the snow")
      const r = 0.78 + 0.14 * hot;
      const g = 0.3 - 0.12 * aw - 0.22 * seen;
      const bl = 0.02;
      const pulse = 0.85 + 0.15 * Math.sin(time * 3 + c);
      const base = c * vPer;
      for (let ri = 0; ri <= RINGS; ri++) {
        const f = ri / RINGS;
        const d = 0.6 + f * (range - 0.6);
        for (let si = 0; si <= SEG; si++) {
          const u = si / SEG;
          const ang = a.heading + (u - 0.5) * fov;
          const x = a.x - Math.sin(ang) * d;
          const z = a.z - Math.cos(ang) * d;
          const v = base + ri * (SEG + 1) + si;
          this.pos[v * 3] = x;
          this.pos[v * 3 + 1] = heightAt(x, z) + 0.12;
          this.pos[v * 3 + 2] = z;
          // bright near the hound, fading out to the range; soft side edges, a marked rim
          const edge = Math.min(1, Math.min(u, 1 - u) * 6);
          // the far rim marches (dashes running round the edge): the eye finds a moving line
          const dash = 0.55 + 0.45 * Math.sin(u * 22 - time * 4 + c);
          const rim = ri === RINGS ? 0.3 * dash : ri === RINGS - 1 ? 0.06 : 0;
          const alpha = Math.min(0.88, (0.5 * (1 - f) + 0.26 + rim * 1.8) * edge * pulse * (0.9 + 0.3 * hot)) * this.k;
          this.col[v * 4] = r;
          this.col[v * 4 + 1] = g;
          this.col[v * 4 + 2] = bl;
          this.col[v * 4 + 3] = alpha;
        }
      }
      c++;
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.object.material as ShaderMaterial).dispose();
  }
}
