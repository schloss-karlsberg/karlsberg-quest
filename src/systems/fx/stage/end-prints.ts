/**
 * Paw prints in the hoarfrost (cue 'end-prints'): after W8 at dawn, a frosted patch round the
 * place you lay with the hounds' prints circling it ("Die Hunde sind fort, nur ihre Abdrücke
 * liegen im Raureif, im Kreis um die Stelle, an der du gelegen hast"); in the keep ending five
 * prints that come up to the step and do not lead away (`ring: false`).
 * Decals laid on the terrain: one quad for the frost, instanced quads for the prints.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { GameContext } from '../../../core/context';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';
import { type Piece, rng, smooth } from './common';

const FROST_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform float uAlpha;
uniform float uR;
varying vec3 vWp;
varying vec2 vLocal;
void main() {
  float d = length(vLocal) / uR;
  // a ragged rim; needles of rime glinting
  float n = kqFbm(vWp.xz * 1.3) * 0.35 + kqFbm(vWp.xz * 3.1) * 0.2;
  float a = (1.0 - smoothstep(0.6, 1.0, d + n * 0.4)) * (0.65 + 0.35 * kqFbm(vWp.xz * 2.3));
  vec3 rime = vec3(0.86, 0.9, 0.96);
  vec3 col = kqLight(rime, vec3(0.0, 1.0, 0.0), vWp, 1.0, 1.0);
  // a soft sparkle of rime (smooth noise: no blocks up close)
  col += vec3(0.6, 0.7, 0.9) * smoothstep(0.62, 0.8, kqFbm(vWp.xz * 7.0)) * 0.35;
  gl_FragColor = vec4(kqFog(col, vWp), a * uAlpha);
}
`;
const DECAL_VERT = /* glsl */ `
attribute vec4 iAt;   // x, y, z, heading
attribute float iSize;
varying vec3 vWp;
varying vec2 vLocal;
varying vec2 vUv;
void main() {
  float c = cos(iAt.w), s = sin(iAt.w);
  vec2 p = position.xz * iSize;
  vec2 r = vec2(p.x * c + p.y * s, -p.x * s + p.y * c);
  vec3 wp = vec3(iAt.x + r.x, iAt.y + 0.04, iAt.z + r.y);
  vWp = wp;
  vLocal = p;
  vUv = position.xz + 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const PAW_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform float uAlpha;
varying vec3 vWp;
varying vec2 vUv;
float blob(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return 1.0 - smoothstep(0.7, 1.0, length(q)); }
void main() {
  vec2 p = vUv - 0.5;
  // the main pad and four toes (front up = −y)
  float pad = blob(p, vec2(0.0, 0.12), vec2(0.2, 0.17));
  float toes = blob(p, vec2(-0.2, -0.1), vec2(0.08, 0.1)) + blob(p, vec2(-0.07, -0.22), vec2(0.08, 0.1))
    + blob(p, vec2(0.07, -0.22), vec2(0.08, 0.1)) + blob(p, vec2(0.2, -0.1), vec2(0.08, 0.1));
  float m = clamp(pad + toes, 0.0, 1.0);
  if (m < 0.02) discard;
  // pressed through the rime: dark wet ground with a blue shadow
  vec3 ground = vec3(0.16, 0.15, 0.15);
  vec3 col = kqLight(ground, vec3(0.0, 1.0, 0.0), vWp, 1.0, 1.0);
  gl_FragColor = vec4(kqFog(col, vWp), m * 0.85 * uAlpha);
}
`;

export class PrintsPiece implements Piece {
  readonly id = 'end-prints';
  done = false;
  private t = 0;
  private readonly frost: Mesh;
  private readonly paws: Mesh;
  private readonly center: Vector3;

  constructor(
    private readonly ctx: GameContext,
    x: number,
    z: number,
    n: number,
    r: number,
    ring: boolean,
  ) {
    const H = (a: number, b: number) => ctx.world.heightAt(a, b);
    this.center = new Vector3(x, H(x, z), z);
    const R = rng(Math.round(x * 13 + z * 7));
    // frost: one disc, draped (a 2 m grid follows the ground)
    const fr = r + 2.2;
    const seg = 24;
    const pos: number[] = [];
    const loc: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= seg; j++)
      for (let i = 0; i <= seg; i++) {
        const lx = (i / seg - 0.5) * 2 * fr;
        const lz = (j / seg - 0.5) * 2 * fr;
        pos.push(x + lx, H(x + lx, z + lz) + 0.03, z + lz);
        loc.push(lx, lz);
      }
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i;
        idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
      }
    const fg = new BufferGeometry();
    fg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    fg.setAttribute('aLocal', new BufferAttribute(new Float32Array(loc), 2));
    fg.setIndex(idx);
    this.frost = new Mesh(
      fg,
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec2 aLocal;
          varying vec3 vWp;
          varying vec2 vLocal;
          void main() { vWp = position; vLocal = aLocal; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
        fragmentShader: FROST_FRAG,
        uniforms: { ...atmosphere, uAlpha: { value: 0 }, uR: { value: fr } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.frost.frustumCulled = false;
    this.frost.renderOrder = 3;
    // prints: n hounds circling the spot (ring), or n prints coming up to it and stopping
    const at: number[] = [];
    const size: number[] = [];
    if (ring) {
      for (let h = 0; h < n; h++) {
        const a0 = (h / n) * Math.PI * 2 + R() * 0.4;
        const rr = r * (0.85 + R() * 0.3);
        for (let k = 0; k < 7; k++) {
          const a = a0 + k * 0.17;
          const side = k % 2 ? 0.07 : -0.07;
          const px = x + Math.cos(a) * (rr + side);
          const pz = z + Math.sin(a) * (rr + side);
          // walking round: the print points along the circle
          at.push(px, H(px, pz), pz, Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2);
          size.push(0.11 + R() * 0.02);
        }
      }
    } else {
      const yaw = ctx.player.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      for (let k = 0; k < n; k++) {
        const d = r + (n - 1 - k) * 0.42;
        const side = k % 2 ? 0.08 : -0.08;
        const px = x + fx * d + fz * side;
        const pz = z + fz * d - fx * side;
        at.push(px, H(px, pz), pz, yaw + Math.PI);
        size.push(0.12);
      }
    }
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 4));
    g.setAttribute('iSize', new InstancedBufferAttribute(new Float32Array(size), 1));
    g.instanceCount = size.length;
    this.paws = new Mesh(g, new ShaderMaterial({ vertexShader: DECAL_VERT, fragmentShader: PAW_FRAG, uniforms: { ...atmosphere, uAlpha: { value: 0 } }, transparent: true, depthWrite: false, side: DoubleSide }));
    this.paws.frustumCulled = false;
    this.paws.renderOrder = 4;
    ctx.scene.add(this.frost, this.paws);
  }

  get time(): number {
    return this.t;
  }

  frame(dt: number): void {
    this.t += dt;
    const a = smooth(this.t / 1.5);
    (this.frost.material as ShaderMaterial).uniforms.uAlpha!.value = a * 0.9;
    (this.paws.material as ShaderMaterial).uniforms.uAlpha!.value = smooth((this.t - 0.6) / 1.2);
    // gone once you are far away (the station after the dawn card)
    const p = this.ctx.player.position;
    if (Math.hypot(p.x - this.center.x, p.z - this.center.z) > 120) this.done = true;
  }

  dispose(): void {
    for (const m of [this.frost, this.paws]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as ShaderMaterial).dispose();
    }
  }
}
