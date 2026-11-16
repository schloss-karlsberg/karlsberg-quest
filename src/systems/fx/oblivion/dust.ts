/**
 * Steinfraß, the edge you can see coming (playtest round 2: "Steinfraß visuals"): at the rim of
 * the grey zone the ground itself comes apart — sand and stone lift off the terrain as grains that
 * drift up and outwards into the ash, thickest where the grey stands. The band moves in with the
 * meter, so the player sees where the forgetting is and that it is coming closer.
 * CPU particles (≤ 2600), ground height from the world; reduced motion: slower, fewer.
 */
import { BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from 'three';
import type { GameContext } from '../../../core/context';

const VERT = /* glsl */ `
attribute vec4 aCol;
uniform float uScale;
varying vec4 vCol;
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aCol.a < 0.003 ? 0.0 : clamp(uScale * 0.16 / max(-mv.z, 0.5), 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
varying vec4 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vCol.rgb, vCol.a);
}
`;

/** Band of the dissolving ground, as fractions of the oblivion radius. */
export const DUST_BAND: [number, number] = [0.5, 0.95];

export class EdgeDust {
  readonly points: Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly life: Float32Array;
  private seed = 1;
  private rnd = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);

  constructor(
    private readonly ctx: GameContext,
    high: boolean,
  ) {
    this.n = high ? 2600 : 1200;
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 4);
    this.life = new Float32Array(this.n * 2);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new BufferAttribute(this.col, 4));
    this.points = new Points(g, new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 500 } }, transparent: true, depthWrite: false, blending: NormalBlending }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 44;
  }

  private spawn(i: number, cx: number, cz: number, R: number): void {
    const a = this.rnd() * Math.PI * 2;
    // more grains towards the outer edge (where the grey is thickest)
    const f = DUST_BAND[0] + (DUST_BAND[1] - DUST_BAND[0]) * Math.sqrt(this.rnd());
    const r = R * f;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = this.ctx.world.heightAt(x, z) + this.rnd() * 0.3;
    this.pos.set([x, y, z], i * 3);
    const up = 0.5 + this.rnd() * 1.3;
    const out = 0.3 + this.rnd() * 0.9;
    this.vel.set([Math.cos(a) * out + (this.rnd() - 0.5) * 0.4, up, Math.sin(a) * out + (this.rnd() - 0.5) * 0.4], i * 3);
    this.life[i * 2] = 2 + this.rnd() * 2.5;
    this.life[i * 2 + 1] = 0;
    // sandstone ochre → ash grey
    const s = this.rnd();
    this.col.set([0.62 - 0.12 * s, 0.55 - 0.08 * s, 0.46 - 0.02 * s, 0], i * 4);
  }

  /** `t` the meter (0..1), R the current radius, centred on the camera. */
  frame(dt: number, t: number, R: number, cx: number, cz: number, scale: number, reduced: boolean): void {
    const on = Math.min(1, Math.max(0, (t - 0.03) / 0.12));
    this.points.visible = on > 0;
    if (!on) return;
    const live = Math.floor(this.n * (reduced ? 0.5 : 1) * Math.min(1, 0.35 + t));
    const slow = reduced ? 0.45 : 1;
    for (let i = 0; i < this.n; i++) {
      const L = this.life[i * 2]!;
      let age = this.life[i * 2 + 1]!;
      if (i >= live) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      if (L <= 0 || age >= L) {
        this.spawn(i, cx, cz, R);
        age = 0;
      }
      age += dt * slow;
      this.life[i * 2 + 1] = age;
      const o = i * 3;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt * slow;
      this.pos[o + 1] = this.pos[o + 1]! + this.vel[o + 1]! * dt * slow;
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt * slow;
      const u = age / this.life[i * 2]!;
      // grains turn to ash as they rise
      this.col[i * 4] = this.col[i * 4]! + (0.58 - this.col[i * 4]!) * dt * 0.5;
      this.col[i * 4 + 1] = this.col[i * 4 + 1]! + (0.57 - this.col[i * 4 + 1]!) * dt * 0.5;
      this.col[i * 4 + 2] = this.col[i * 4 + 2]! + (0.55 - this.col[i * 4 + 2]!) * dt * 0.5;
      this.col[i * 4 + 3] = Math.min(1, u * 6) * (1 - u) * 0.85 * on;
    }
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aCol!.needsUpdate = true;
    (this.points.material as ShaderMaterial).uniforms.uScale!.value = scale;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}
