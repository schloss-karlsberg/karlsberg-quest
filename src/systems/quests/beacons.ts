/**
 * Objective beacons: a faint, era-tinted column of light over each open objective zone within
 * 200 m, with a slowly breathing ring on the ground (procedural, additive, no textures). The
 * column thins out with height, fades in with distance and fades away while you stand inside the
 * zone. Reduced motion: no breathing, no drifting motes in the column.
 */
import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, RingGeometry, ShaderMaterial, Color } from 'three';
import type { Era } from '../../core/era';

/** sRGB tints per era (warm 1789, cold winter 1793-02, ember July 1793, grey-green 1796, pale today). */
const TINT: Record<Era, number> = {
  today: 0x9fc6e8,
  '1789': 0xf2c46b,
  '1793-02': 0xbfd9ff,
  '1793-07': 0xff9a4d,
  '1796': 0xc9d6a4,
};

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const COLUMN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float v = vUv.y;
  // soft vertical falloff, a brighter foot, slow rising bands
  float fall = pow(1.0 - v, 1.6);
  float foot = smoothstep(0.08, 0.0, v) * 0.8;
  float bands = 0.75 + 0.25 * sin((v * 26.0 - uTime * 0.9 * uMotion) + vUv.x * 6.2831 * 2.0);
  float a = (fall * bands + foot) * uAlpha;
  gl_FragColor = vec4(uColor, a); // additive: src × alpha
}`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
void main() {
  // RingGeometry uv: x runs around the ring; we only need the radial soft edge via vUv.y
  float breathe = 0.75 + 0.25 * sin(uTime * 1.7) * uMotion;
  float a = uAlpha * breathe;
  gl_FragColor = vec4(uColor, a); // additive: src × alpha
}`;

interface Beacon {
  group: Group;
  col: ShaderMaterial;
  ring: ShaderMaterial;
  x: number;
  z: number;
  r: number;
  alpha: number;
  want: number;
  seen: boolean;
}

export interface BeaconSpec {
  id: string;
  x: number;
  z: number;
  r: number;
  era: Era;
}

export class Beacons {
  readonly group = new Group();
  private readonly list = new Map<string, Beacon>();
  private time = 0;

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'quest-beacons';
  }

  /** Show exactly these zones (others fade out). */
  sync(specs: BeaconSpec[]): void {
    for (const b of this.list.values()) b.seen = false;
    for (const s of specs) {
      let b = this.list.get(s.id);
      if (!b) {
        b = this.make(s);
        this.list.set(s.id, b);
      }
      b.seen = true;
      b.x = s.x;
      b.z = s.z;
      b.r = s.r;
      // HDR: the post pass tone-maps, so the column reads against a bright day sky too
      const c = new Color(TINT[s.era] ?? 0xf2c46b).convertSRGBToLinear().multiplyScalar(1.8);
      (b.col.uniforms.uColor!.value as Color).copy(c);
      (b.ring.uniforms.uColor!.value as Color).copy(c);
    }
  }

  private make(s: BeaconSpec): Beacon {
    const uniforms = () => ({ uColor: { value: new Color() }, uAlpha: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 } });
    const common = { vertexShader: VERT, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide };
    const col = new ShaderMaterial({ ...common, fragmentShader: COLUMN_FRAG, uniforms: uniforms() });
    const ring = new ShaderMaterial({ ...common, fragmentShader: RING_FRAG, uniforms: uniforms() });
    const g = new Group();
    const cyl = new Mesh(new CylinderGeometry(1, 1, 1, 28, 1, true), col);
    cyl.position.y = 0.5;
    cyl.renderOrder = 5;
    cyl.frustumCulled = false;
    const rg = new Mesh(new RingGeometry(0.93, 1, 48, 1), ring);
    rg.rotation.x = -Math.PI / 2;
    rg.position.y = 0.15;
    rg.renderOrder = 5;
    g.add(cyl, rg);
    this.group.add(g);
    return { group: g, col, ring, x: s.x, z: s.z, r: s.r, alpha: 0, want: 0, seen: true };
  }

  frame(dt: number, px: number, pz: number, reducedMotion: boolean): void {
    this.time += dt;
    for (const [id, b] of this.list) {
      const d = Math.hypot(px - b.x, pz - b.z);
      // far: faint; 30–200 m: strongest; inside the zone: gone
      const inside = Math.min(1, Math.max(0, (d - b.r * 0.6) / Math.max(4, b.r)));
      const far = 1 - Math.min(1, Math.max(0, (d - 170) / 30));
      b.want = b.seen ? inside * far : 0;
      b.alpha += (b.want - b.alpha) * Math.min(1, dt * 2.5);
      if (!b.seen && b.alpha < 0.01) {
        this.group.remove(b.group);
        for (const m of b.group.children as Mesh[]) m.geometry.dispose();
        b.col.dispose();
        b.ring.dispose();
        this.list.delete(id);
        continue;
      }
      const y = this.heightAt(b.x, b.z);
      const cr = Math.max(1.6, Math.min(4.5, b.r * 0.22));
      const cyl = b.group.children[0] as Mesh;
      cyl.scale.set(cr, 70, cr);
      const rg = b.group.children[1] as Mesh;
      rg.scale.setScalar(Math.max(2.5, b.r));
      b.group.position.set(b.x, y, b.z);
      b.group.visible = b.alpha > 0.005;
      for (const m of [b.col, b.ring]) {
        m.uniforms.uTime!.value = this.time;
        m.uniforms.uMotion!.value = reducedMotion ? 0 : 1;
      }
      b.col.uniforms.uAlpha!.value = 0.42 * b.alpha;
      // the ground ring stays a little visible close by, so you see where the zone ends
      b.ring.uniforms.uAlpha!.value = 0.5 * Math.max(b.alpha, b.seen && d < b.r * 3 ? 0.35 : 0);
    }
  }

  ids(): string[] {
    return [...this.list.keys()];
  }

  /** Current opacity per beacon (tests). */
  state(): { id: string; alpha: number }[] {
    return [...this.list.entries()].map(([id, b]) => ({ id, alpha: b.alpha }));
  }

  dispose(): void {
    for (const id of [...this.list.keys()]) {
      const b = this.list.get(id)!;
      for (const m of b.group.children as Mesh[]) m.geometry.dispose();
      b.col.dispose();
      b.ring.dispose();
    }
    this.list.clear();
    this.group.removeFromParent();
  }
}
