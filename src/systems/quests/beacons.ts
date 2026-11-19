/**
 * Objective beacons (restyled 2026-11-19, docs/ART-DIRECTION.md §9 "always know what to do"): a
 * soft volumetric beam of light over each open objective, a glowing ground ring with a pulse that
 * runs outward, and sparks rising in the beam. The tracked goal ("lead") burns gold and tall; other
 * open goals are fainter and take the era's tint. The beam reads as light, not as a sheet: its
 * core is bright, its edges fade with the view angle, it thins out with height and fades away
 * while you stand inside the zone. Procedural, additive, no textures (cheap on every tier).
 * Reduced motion: no pulse, no rising sparks.
 */
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import type { Era } from '../../core/era';

/** sRGB tints per era for the side goals (the lead is always gold). */
const TINT: Record<Era, number> = {
  today: 0xa9d4f0,
  '1789': 0xf2d39b,
  '1793-02': 0xc4dcff,
  '1793-07': 0xffb27a,
  '1796': 0xd7e2b0,
};
const LEAD = 0xffc65a;

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uMotion;
uniform float uCore;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec3 v = normalize(vView);
  // facing ratio of the open cylinder: 1 at the beam's middle, 0 at its silhouette
  float face = abs(dot(normalize(vN), v));
  float core = pow(face, uCore);
  float y = vUv.y;
  float fall = exp(-y * 3.2) * smoothstep(0.0, 0.03, y);
  // sparks rising in the beam: thin streaks per column of the uv
  float col = floor(vUv.x * 18.0);
  float sp = fract(y * 5.0 - uTime * (0.18 + hash(col) * 0.2) * uMotion + hash(col * 7.0));
  float spark = smoothstep(0.0, 0.02, sp) * smoothstep(0.08, 0.02, sp) * step(0.55, hash(col * 3.1)) * face;
  float a = (core * fall * (0.85 + 0.15 * sin(uTime * 1.3)) + spark * 0.55 * (1.0 - y)) * uAlpha;
  gl_FragColor = vec4(uColor * (1.0 + core * 0.6), a);
}`;

const GROUND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0; // 0 centre … 1 edge of the quad
  // the zone's edge at r = 0.8: a crisp ring with a soft glow, a faint disc inside
  float ring = exp(-pow((r - 0.8) / 0.018, 2.0)) + 0.35 * exp(-pow((r - 0.8) / 0.07, 2.0));
  float disc = smoothstep(0.8, 0.0, r) * 0.12;
  // a pulse running out from the centre every 2.4 s
  float ph = fract(uTime / 2.4) * uMotion;
  float pulse = exp(-pow((r - ph * 0.8) / 0.03, 2.0)) * (1.0 - ph) * 0.8 * step(0.001, uMotion);
  float a = (ring + disc + pulse) * uAlpha * smoothstep(1.0, 0.9, r);
  gl_FragColor = vec4(uColor, a);
}`;

interface Beacon {
  group: Group;
  beam: ShaderMaterial;
  halo: ShaderMaterial;
  ground: ShaderMaterial;
  x: number;
  z: number;
  r: number;
  lead: boolean;
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
  /** The tracked goal: gold, taller, brighter. */
  lead?: boolean;
}

export class Beacons {
  readonly group = new Group();
  private readonly list = new Map<string, Beacon>();
  private time = 0;
  private readonly cyl = new CylinderGeometry(1, 1, 1, 32, 1, true);
  private readonly quad = new PlaneGeometry(2, 2);

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'quest-beacons';
    this.group.userData.noShadow = true;
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
      b.lead = !!s.lead;
      // HDR: the post pass tone-maps; the lead beam is bright enough to bloom softly at its core
      const c = new Color(s.lead ? LEAD : (TINT[s.era] ?? LEAD)).convertSRGBToLinear().multiplyScalar(s.lead ? 1.6 : 1.1);
      for (const m of [b.beam, b.halo, b.ground]) (m.uniforms.uColor!.value as Color).copy(c);
    }
  }

  private make(s: BeaconSpec): Beacon {
    const uniforms = (core = 2) => ({ uColor: { value: new Color() }, uAlpha: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 }, uCore: { value: core } });
    const common = { vertexShader: VERT, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide };
    const beam = new ShaderMaterial({ ...common, fragmentShader: BEAM_FRAG, uniforms: uniforms(2.6) });
    const halo = new ShaderMaterial({ ...common, fragmentShader: BEAM_FRAG, uniforms: uniforms(1.4) });
    const ground = new ShaderMaterial({ ...common, fragmentShader: GROUND_FRAG, uniforms: uniforms() });
    const g = new Group();
    const mk = (geo: CylinderGeometry | PlaneGeometry, m: ShaderMaterial) => {
      const x = new Mesh(geo, m);
      x.renderOrder = 5;
      x.frustumCulled = false;
      x.userData.noShadow = true;
      return x;
    };
    const core = mk(this.cyl, beam);
    core.position.y = 0.5;
    const glow = mk(this.cyl, halo);
    glow.position.y = 0.5;
    const disc = mk(this.quad, ground);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.2;
    g.add(core, glow, disc);
    this.group.add(g);
    return { group: g, beam, halo, ground, x: s.x, z: s.z, r: s.r, lead: !!s.lead, alpha: 0, want: 0, seen: true };
  }

  frame(dt: number, px: number, pz: number, reducedMotion: boolean, eyeY?: number): void {
    this.time += dt;
    for (const [id, b] of this.list) {
      const d = Math.hypot(px - b.x, pz - b.z);
      // far: faint; 30–260 m: strongest; inside the zone: gone (the lead reaches further)
      const inside = Math.min(1, Math.max(0, (d - b.r * 0.6) / Math.max(4, b.r)));
      const reach = b.lead ? 420 : 200;
      const far = 1 - Math.min(1, Math.max(0, (d - reach) / 40));
      b.want = b.seen ? inside * far * (b.lead ? 1 : 0.6) : 0;
      b.alpha += (b.want - b.alpha) * Math.min(1, dt * 2.5);
      if (!b.seen && b.alpha < 0.01) {
        this.group.remove(b.group);
        for (const m of [b.beam, b.halo, b.ground]) m.dispose();
        this.list.delete(id);
        continue;
      }
      const y = this.heightAt(b.x, b.z);
      // the beam widens a little with distance so it never shrinks to a hair line far away
      const cr = Math.max(0.9, Math.min(2.6, b.r * 0.12)) * (1 + Math.min(1.6, d / 160));
      const tall = b.lead ? 90 : 55;
      const [core, glow, disc] = b.group.children as Mesh[];
      core!.scale.set(cr, tall, cr);
      glow!.scale.set(cr * 2.8, tall * 0.8, cr * 2.8);
      const gr = Math.max(1.3, b.r) / 0.8;
      disc!.scale.set(gr, gr, 1);
      b.group.position.set(b.x, y, b.z);
      b.group.visible = b.alpha > 0.005;
      for (const m of [b.beam, b.halo, b.ground]) {
        m.uniforms.uTime!.value = this.time;
        m.uniforms.uMotion!.value = reducedMotion ? 0 : 1;
      }
      b.beam.uniforms.uAlpha!.value = 0.55 * b.alpha;
      b.halo.uniforms.uAlpha!.value = 0.16 * b.alpha;
      // the ground ring stays a little visible close by, so you see where the zone ends
      // seen almost edge-on (from far below the ring's plane or across a slope) a flat ring is a long
      // floating streak through the forest (playtest): it fades at grazing angles
      const graze = eyeY === undefined ? 1 : Math.atan2(eyeY - (y + 0.2), Math.max(1, d - gr * 0.8));
      const flat = Math.min(1, Math.max(0, (graze - 0.04) / 0.1));
      b.ground.uniforms.uAlpha!.value = 0.7 * Math.max(b.alpha, b.seen && d < b.r * 3 ? 0.3 : 0) * flat;
    }
  }

  ids(): string[] {
    return [...this.list.keys()];
  }

  /** Current opacity per beacon (tests). */
  state(): { id: string; alpha: number; lead?: boolean }[] {
    return [...this.list.entries()].map(([id, b]) => ({ id, alpha: b.alpha, lead: b.lead }));
  }

  dispose(): void {
    for (const b of this.list.values()) for (const m of [b.beam, b.halo, b.ground]) m.dispose();
    this.list.clear();
    this.cyl.dispose();
    this.quad.dispose();
    this.group.removeFromParent();
  }
}
