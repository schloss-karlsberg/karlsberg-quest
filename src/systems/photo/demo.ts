/**
 * PLACEHOLDER photo subjects (WP-14), clearly apart from the real content so kq-story can drop
 * them: the plain trail board at the car park (target `photo.parkplatz`, always on) and the
 * test roe deer pair (`reh.ricke` / `reh.kitz`, only with `?debug`, `kq.photo.deer`). All
 * geometry is built here in code (no assets); the board carries no brand, no place-name sign.
 */
import { BoxGeometry, CanvasTexture, Color, DoubleSide, Group, LinearFilter, Mesh, PlaneGeometry, SRGBColorSpace, ShaderMaterial, type Scene, type Texture } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { Vec3 } from './core';

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform sampler2D uMap;
uniform float uUseMap;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vec3 alb = uUseMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 col = kqLight(alb, n, vWp, 1.0, 1.0) + alb * 0.1;
  gl_FragColor = vec4(kqFog(col, vWp), 1.0);
}
`;

function mat(color: number, map?: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...atmosphere, uMap: { value: map ?? null }, uUseMap: { value: map ? 1 : 0 }, uColor: { value: new Color(color) } },
    side: DoubleSide,
  });
}

/** The board's face: a generic trail board (P sign, a loop on a map, a few lines). */
function boardTexture(): Texture | undefined {
  if (typeof document === 'undefined') return undefined;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 300;
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.fillStyle = '#efe8d6';
  g.fillRect(0, 0, 512, 300);
  g.fillStyle = '#2f5d8a';
  g.fillRect(24, 24, 96, 96);
  g.fillStyle = '#ffffff';
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('P', 72, 76);
  g.fillStyle = '#2b2620';
  g.textAlign = 'left';
  g.font = 'bold 40px serif';
  g.fillText('Wanderparkplatz', 140, 56);
  g.font = '24px serif';
  g.fillText('Rundwege im Wald', 142, 100);
  // a small map with a loop
  g.fillStyle = '#c9d6b0';
  g.fillRect(24, 140, 464, 136);
  g.strokeStyle = '#a2391e';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(250, 208, 170, 46, -0.12, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#2f5d8a';
  g.beginPath();
  g.arc(96, 230, 10, 0, Math.PI * 2);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter;
  return t;
}

/** The car park board (placeholder for `photo.parkplatz`), its face looking towards `yaw` (0 = +z). */
export function buildBoard(scene: Scene, x: number, groundY: number, z: number, yaw = 0): Group {
  const g = new Group();
  g.name = 'photo-demo-board';
  const wood = mat(0x5a4330);
  for (const sx of [-1.0, 1.0]) {
    const post = new Mesh(new BoxGeometry(0.11, 2.15, 0.11), wood);
    post.position.set(sx, 1.07, -0.07);
    g.add(post);
  }
  const back = new Mesh(new BoxGeometry(2.1, 1.3, 0.06), wood);
  back.position.set(0, 1.4, -0.05);
  g.add(back);
  const roof = new Mesh(new BoxGeometry(2.3, 0.07, 0.36), mat(0x3f2f22));
  roof.position.set(0, 2.1, 0);
  roof.rotation.x = -0.12;
  g.add(roof);
  const face = new Mesh(new PlaneGeometry(1.96, 1.16), mat(0xefe8d6, boardTexture()));
  face.position.set(0, 1.4, -0.015);
  g.add(face);
  g.position.set(x, groundY - 0.05, z);
  g.rotation.y = yaw;
  scene.add(g);
  return g;
}

/** A blocky roe deer stand-in (debug only): body, neck, head, ears, legs. `s` scales it. */
function deerMesh(s: number, coat: number): Group {
  const g = new Group();
  const m = mat(coat);
  const dark = mat(0x3a2f26);
  const light = mat(0xd9cdb8);
  const add = (geo: BoxGeometry, mm: ShaderMaterial, x: number, y: number, z: number, rx = 0) => {
    const o = new Mesh(geo, mm);
    o.position.set(x * s, y * s, z * s);
    o.rotation.x = rx;
    g.add(o);
    return o;
  };
  add(new BoxGeometry(0.34 * s, 0.36 * s, 0.95 * s), m, 0, 0.82, 0);
  for (const [lx, lz] of [[-0.11, -0.36], [0.11, -0.36], [-0.11, 0.36], [0.11, 0.36]] as const) add(new BoxGeometry(0.07 * s, 0.66 * s, 0.07 * s), m, lx, 0.33, lz);
  add(new BoxGeometry(0.2 * s, 0.14 * s, 0.1 * s), light, 0, 0.86, 0.5);
  const neck = new Group();
  neck.position.set(0, 0.95 * s, -0.42 * s);
  g.add(neck);
  const n = new Mesh(new BoxGeometry(0.14 * s, 0.42 * s, 0.14 * s), m);
  n.position.set(0, 0.18 * s, -0.04 * s);
  n.rotation.x = 0.35;
  neck.add(n);
  const head = new Mesh(new BoxGeometry(0.16 * s, 0.16 * s, 0.3 * s), m);
  head.position.set(0, 0.42 * s, -0.16 * s);
  neck.add(head);
  const nose = new Mesh(new BoxGeometry(0.1 * s, 0.08 * s, 0.06 * s), dark);
  nose.position.set(0, 0.4 * s, -0.33 * s);
  neck.add(nose);
  for (const ex of [-0.07, 0.07]) {
    const ear = new Mesh(new BoxGeometry(0.05 * s, 0.14 * s, 0.03 * s), m);
    ear.position.set(ex * s, 0.55 * s, -0.08 * s);
    ear.rotation.z = ex * 4;
    neck.add(ear);
  }
  neck.name = 'neck';
  return g;
}

/**
 * The debug deer pair: a doe and a fawn wandering slowly in a small loop, the fawn a step behind.
 * `calm` false: both lift their heads („sichern“). Positions are read by the photo targets.
 */
export class DebugDeer {
  readonly group = new Group();
  private readonly doe = deerMesh(1, 0x7b7266);
  private readonly fawn = deerMesh(0.82, 0x857a6c);
  calm = true;
  private t = 0;
  private readonly posDoe: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly posFawn: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly scene: Scene,
    private x: number,
    private z: number,
    private readonly ground: (x: number, z: number) => number,
  ) {
    this.group.name = 'photo-debug-deer';
    this.group.add(this.doe, this.fawn);
    scene.add(this.group);
    this.frame(0);
  }

  moveTo(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.frame(0);
  }

  /** Doe / fawn centres (body height) for the photo targets. */
  doeAt(): Vec3 {
    return this.posDoe;
  }

  fawnAt(): Vec3 {
    return this.posFawn;
  }

  frame(dt: number): void {
    this.t += dt;
    const a = this.t * 0.12;
    const place = (o: Group, p: Vec3, ang: number, s: number) => {
      const px = this.x + Math.cos(ang) * 1.2;
      const pz = this.z + Math.sin(ang) * 1.2;
      const gy = this.ground(px, pz);
      o.position.set(px, Number.isFinite(gy) ? gy : 0, pz);
      // walk along the loop (tangent)
      o.rotation.y = -ang;
      p.x = px;
      p.y = o.position.y + 0.82 * s;
      p.z = pz;
      const neck = o.getObjectByName('neck');
      if (neck) neck.rotation.x = this.calm ? 0.9 + 0.15 * Math.sin(this.t * 1.3 + s * 5) : -0.15;
    };
    place(this.doe, this.posDoe, a, 1);
    place(this.fawn, this.posFawn, a - 1.5, 0.82);
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}
