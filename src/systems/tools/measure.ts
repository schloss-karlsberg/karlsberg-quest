import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { GameContext } from '../../core/context';
import { actionLabel } from '../../ui/actionLabel';
import { h } from '../../ui/dom';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { type Measurement, type ProfileSample, type V3, fmtDe, fmtDistance, heightProfile, measure, niceStep, profileStats } from './geom';
import type { PickHit, Picker } from './picker';
import { footprintAt, roomAt } from './plans';

/**
 * Kartograf 3: measuring tape (3). Set the start and end: distance, horizontal length,
 * height difference, grade and a terrain height profile on a field-book sheet. Picks the terrain,
 * the 1789 palace (walls and roofs) and any mesh flagged `userData.measurable` (interiors), so
 * the gallery of the model measures as the model is (≈ 83 m wing, bible 04 §2 "Modelllänge").
 * Emits `measure:done {a, b, distance, horizontal, rise, building?, room?}` and sets
 * `flags['measured.<building>'] = metres` when both ends lie on the same palace building.
 */
export type MeasureMode = 'off' | 'a' | 'b' | 'done';

const POLE_VERT = /* glsl */ `
varying float vY;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vY = position.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const POLE_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
varying float vY;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  // Fluchtstab: 0.5 m bands red / white, brass shoe at the bottom
  float band = mod(floor(vY / 0.5), 2.0);
  vec3 alb = band < 0.5 ? vec3(0.62, 0.05, 0.03) : vec3(0.86, 0.84, 0.8);
  if (vY < 0.12) alb = vec3(0.55, 0.4, 0.15);
  vec3 col = kqLight(alb, normalize(vNormal), vWorld, 1.0, 1.0);
  col += alb * 0.35; // readable at night
  gl_FragColor = vec4(kqFog(col, vWorld), 1.0);
}
`;

const TAPE_VERT = /* glsl */ `
attribute float aAlong;
attribute float aSide;
varying float vAlong;
varying float vSide;
void main() {
  vAlong = aAlong;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
const TAPE_FRAG = /* glsl */ `
precision highp float;
uniform float uLen;
uniform float uLive;
uniform float uTime;
varying float vAlong;
varying float vSide;
void main() {
  // surveyor's tape: yellow, black tick every metre, red every 10 m; live = marching dashes
  vec3 col = vec3(0.98, 0.83, 0.25);
  float m = fract(vAlong);
  float tick = 1.0 - smoothstep(0.0, 0.035, min(m, 1.0 - m));
  float ten = 1.0 - smoothstep(0.0, 0.12, min(fract(vAlong / 10.0), 1.0 - fract(vAlong / 10.0)) * 10.0);
  float half5 = 1.0 - smoothstep(0.0, 0.06, abs(fract(vAlong / 5.0) - 0.0) * 5.0);
  col = mix(col, vec3(0.08, 0.06, 0.04), tick * step(abs(vSide), 0.55));
  col = mix(col, vec3(0.75, 0.08, 0.05), max(ten, half5 * 0.6));
  float a = 0.92;
  if (uLive > 0.5) a *= 0.55 + 0.45 * step(0.5, fract((vAlong - uTime * 2.0) / 1.5));
  a *= 1.0 - smoothstep(0.75, 1.0, abs(vSide));
  gl_FragColor = vec4(col, a);
}
`;

export class MeasureTool {
  mode: MeasureMode = 'off';
  a: PickHit | null = null;
  b: PickHit | null = null;
  result: (Measurement & { profile: ProfileSample[]; building?: string; room?: string }) | null = null;
  readonly group = new Group();
  private readonly poleA: Mesh;
  private readonly poleB: Mesh;
  private readonly tape: Mesh;
  private readonly tapeGeo = new BufferGeometry();
  private readonly tapeMat: ShaderMaterial;
  private readonly cursor: Mesh;
  private previewT = 0;
  private profileT = 0;
  private livePalace: PickHit | null = null;
  // DOM
  private readonly reticle: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly label: HTMLElement;
  private readonly hint: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    private readonly picker: Picker,
    layer: HTMLElement,
  ) {
    const poleMat = new ShaderMaterial({ vertexShader: POLE_VERT, fragmentShader: POLE_FRAG, uniforms: { ...atmosphere } });
    const poleGeo = new CylinderGeometry(0.03, 0.03, 2, 10, 1);
    poleGeo.translate(0, 1, 0);
    this.poleA = new Mesh(poleGeo, poleMat);
    this.poleB = new Mesh(poleGeo, poleMat);
    this.tapeMat = new ShaderMaterial({
      vertexShader: TAPE_VERT,
      fragmentShader: TAPE_FRAG,
      uniforms: { uLen: { value: 1 }, uLive: { value: 0 }, uTime: atmosphere.uTime },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });
    this.tapeGeo.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
    this.tapeGeo.setAttribute('aAlong', new BufferAttribute(new Float32Array(4), 1));
    this.tapeGeo.setAttribute('aSide', new BufferAttribute(new Float32Array([-1, 1, -1, 1]), 1));
    this.tapeGeo.setIndex([0, 1, 2, 1, 3, 2]);
    this.tape = new Mesh(this.tapeGeo, this.tapeMat);
    this.tape.frustumCulled = false;
    this.tape.renderOrder = 20;
    const ring = new RingGeometry(0.22, 0.3, 32);
    ring.rotateX(-Math.PI / 2);
    this.cursor = new Mesh(
      ring,
      new ShaderMaterial({
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'precision highp float; void main(){ gl_FragColor = vec4(1.0, 0.86, 0.3, 0.95); }',
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.cursor.renderOrder = 21;
    this.group.add(this.poleA, this.poleB, this.tape, this.cursor);
    this.group.name = 'kq-measure';
    this.group.visible = false;

    this.reticle = h('div.kqt-reticle', { 'data-testid': 'measure-reticle' });
    this.label = h('div.kqt-tape-label', { 'data-testid': 'measure-label' });
    this.hint = h('div.kqt-measure-hint');
    this.sheet = h('div.kqt-sheet.kqt-measure', { 'data-testid': 'measure-sheet' });
    layer.append(this.reticle, this.label, this.hint, this.sheet);
  }

  get active(): boolean {
    return this.mode !== 'off';
  }

  start(): void {
    this.mode = 'a';
    this.a = this.b = null;
    this.result = null;
    this.group.visible = true;
    this.renderSheet();
  }

  stop(): void {
    this.mode = 'off';
    this.a = this.b = null;
    this.result = null;
    this.group.visible = false;
    this.reticle.classList.remove('kqt-show');
    this.label.classList.remove('kqt-show');
    this.hint.classList.remove('kqt-show');
    this.sheet.classList.remove('kqt-show');
  }

  /** Crosshair pick (full: terrain + palace + flagged meshes). */
  pickCentre(full = true): PickHit | null {
    const { o, dir } = this.picker.centreRay();
    return this.picker.pick(o, dir, 600, full);
  }

  /** A click: set the start, then the end; a third click starts a new measurement. */
  click(hit: PickHit | null = this.pickCentre()): void {
    if (this.mode === 'off' || !hit) return;
    if (this.mode === 'a' || this.mode === 'done') {
      this.a = hit;
      this.b = null;
      this.result = null;
      this.mode = 'b';
    } else if (this.mode === 'b') {
      this.b = hit;
      this.finish();
    }
    this.renderSheet();
  }

  /** Set both ends directly (debug/tests): y from the terrain unless given. */
  at(a: { x: number; z: number; y?: number }, b: { x: number; z: number; y?: number }): void {
    if (this.mode === 'off') this.start();
    const hf = this.ctx.world.heightfield;
    const mk = (p: { x: number; z: number; y?: number }): PickHit => ({
      point: { x: p.x, y: p.y ?? hf.heightAt(p.x, p.z), z: p.z },
      on: p.y === undefined ? 'terrain' : 'palace',
      distance: 0,
    });
    this.a = mk(a);
    this.b = mk(b);
    this.finish();
    this.renderSheet();
  }

  private finish(): void {
    const a = this.a!.point;
    const b = this.b!.point;
    const m = measure(a, b);
    const hf = this.ctx.world.heightfield;
    const profile = heightProfile(a, b, (x, z) => hf.heightAt(x, z), 72);
    // same building / room at both ends?
    const fps = this.ctx.data.footprints.buildings;
    // a palace hit knows its building (shared walls between wings!); terrain ends use the footprints
    const ia = this.a!.building ?? footprintAt(fps, a.x, a.z, 1.8)?.id;
    const ib = this.b!.building ?? footprintAt(fps, b.x, b.z, 1.8)?.id;
    const building = ia && ia === ib ? ia : undefined;
    const rooms = this.ctx.data.rooms;
    const ra = roomAt(rooms, a.x, a.y, a.z);
    const rb = roomAt(rooms, b.x, b.y, b.z);
    const room = ra && rb && ra.id === rb.id ? ra.roomId : undefined;
    this.result = { ...m, profile, building, room };
    this.mode = 'done';
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const P = (p: V3) => ({ x: r3(p.x), y: r3(p.y), z: r3(p.z) });
    this.ctx.events.emit('measure:done', {
      a: P(a),
      b: P(b),
      distance: r3(m.distance),
      horizontal: r3(m.horizontal),
      rise: r3(m.rise),
      ...(building ? { building } : {}),
      ...(room ? { room } : {}),
    });
    if (building) this.ctx.state.update((st) => (st.flags[`measured.${building}`] = Math.round(m.distance * 10) / 10), 'measure');
  }

  frame(dt: number): void {
    if (this.mode === 'off') return;
    const ctx = this.ctx;
    this.reticle.classList.toggle('kqt-show', this.mode === 'a' || this.mode === 'b' || this.mode === 'done');
    const place = ctx.t(`tools.measure.hint.${this.mode}`);
    const input = ctx.input.touchMode ? ctx.t('tools.measure.hint.tap') : ctx.t('tools.measure.hint.click');
    const end = ctx.input.touchMode
      ? ctx.t('tools.measure.hint.end.touch')
      : actionLabel(ctx.input, 'measure');
    this.hint.textContent = [`${input} ${place}`, end ? ctx.t('tools.measure.hint.end', { key: end }) : ''].filter(Boolean).join(' · ');
    this.hint.classList.add('kqt-show');
    // live end point at the crosshair (palace triangles every few frames: no BVH)
    let live: PickHit | null = null;
    {
      this.previewT -= dt;
      const { o, dir } = this.picker.centreRay();
      const terr = this.picker.terrain(o, dir, 600);
      if (this.previewT <= 0) {
        this.previewT = 0.12;
        this.livePalace = this.picker.palace(o, dir, terr ? terr.distance : 600);
      }
      live = this.livePalace && (!terr || this.livePalace.distance < terr.distance) ? this.livePalace : terr;
    }
    const cursorAt = live?.point ?? null;
    this.cursor.visible = !!cursorAt;
    if (cursorAt) this.cursor.position.set(cursorAt.x, cursorAt.y + 0.04, cursorAt.z);

    const A = this.a?.point ?? null;
    const B = this.mode === 'b' ? (live?.point ?? null) : (this.b?.point ?? null);
    // ranging poles stand on the ground; on a wall they are held against the point (centred)
    const base = (hit: PickHit) => (hit.on === 'terrain' ? 0 : -1);
    this.poleA.visible = !!A;
    this.poleB.visible = !!(this.mode === 'done' && this.b);
    if (A) this.poleA.position.set(A.x, A.y + base(this.a!), A.z);
    if (this.b && this.mode === 'done') this.poleB.position.set(this.b.point.x, this.b.point.y + base(this.b), this.b.point.z);
    this.tape.visible = !!(A && B);
    if (A && B) {
      const onGround = this.a!.on === 'terrain' && (this.mode === 'b' ? live?.on === 'terrain' : this.b?.on === 'terrain');
      this.updateTape(A, B, onGround ? 1.2 : 0);
      this.tapeMat.uniforms.uLive!.value = this.mode === 'b' ? 1 : 0;
      const d = measure(A, B).distance;
      this.placeLabel(A, B, fmtDistance(d));
      if (this.mode === 'b') {
        this.profileT -= dt;
        if (this.profileT <= 0) {
          this.profileT = 0.25;
          this.renderSheet(B);
        }
      }
    } else {
      this.label.classList.remove('kqt-show');
    }
  }

  private updateTape(A: V3, B: V3, lift: number): void {
    // tape at hand height between two poles on the ground, straight between wall points; faces the camera
    const a = new Vector3(A.x, A.y + lift, A.z);
    const b = new Vector3(B.x, B.y + lift, B.z);
    const d = b.clone().sub(a);
    const len = d.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const toCam = this.ctx.camera.position.clone().sub(mid).normalize();
    const side = d.clone().normalize().cross(toCam).normalize();
    const w = Math.max(0.05, Math.min(0.5, this.ctx.camera.position.distanceTo(mid) * 0.006)) * 0.5;
    const pos = this.tapeGeo.getAttribute('position') as BufferAttribute;
    const al = this.tapeGeo.getAttribute('aAlong') as BufferAttribute;
    const put = (i: number, p: Vector3, s: number) => pos.setXYZ(i, p.x + side.x * w * s, p.y + side.y * w * s, p.z + side.z * w * s);
    put(0, a, -1);
    put(1, a, 1);
    put(2, b, -1);
    put(3, b, 1);
    al.setX(0, 0);
    al.setX(1, 0);
    al.setX(2, len);
    al.setX(3, len);
    pos.needsUpdate = true;
    al.needsUpdate = true;
    this.tapeMat.uniforms.uLen!.value = len;
  }

  private placeLabel(A: V3, B: V3, text: string): void {
    const v = new Vector3((A.x + B.x) / 2, (A.y + B.y) / 2 + 1.7, (A.z + B.z) / 2).project(this.ctx.camera);
    if (v.z > 1) {
      this.label.classList.remove('kqt-show');
      return;
    }
    const el = this.ctx.renderer.domElement;
    const x = Math.max(60, Math.min(el.clientWidth - 60, ((v.x + 1) / 2) * el.clientWidth));
    const y = Math.max(40, Math.min(el.clientHeight - 40, ((1 - v.y) / 2) * el.clientHeight));
    this.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    this.label.textContent = text;
    this.label.classList.add('kqt-show');
  }

  /** The field-book sheet: figures + height profile (live while the end follows the crosshair). */
  private renderSheet(liveB?: V3): void {
    const ctx = this.ctx;
    const A = this.a?.point;
    const B = liveB ?? this.b?.point;
    this.sheet.classList.toggle('kqt-show', this.mode !== 'off');
    this.sheet.classList.toggle('kqt-live', !!liveB);
    if (!A || !B) {
      this.sheet.replaceChildren(h('div.kqt-sheet-title', ctx.t('tools.measure.title')), h('p.kqt-sheet-empty', ctx.t('tools.measure.empty')));
      return;
    }
    const hf = ctx.world.heightfield;
    const m = this.result && !liveB ? this.result : { ...measure(A, B), profile: heightProfile(A, B, (x, z) => hf.heightAt(x, z), 48), building: undefined, room: undefined };
    const row = (k: string, v: string, testid?: string) => h('div.kqt-row', [h('span', ctx.t(k)), h('b', testid ? { 'data-testid': testid } : {}, v)]);
    const sign = (v: number) => (v > 0.005 ? '+' : '');
    const where = m.room ? ctx.data.rooms.find((r) => r.roomId === m.room)?.name_de : m.building ? ctx.data.footprints.buildings.find((f) => f.id === m.building)?.name_de : null;
    const kids: Node[] = [
      h('div.kqt-sheet-title', [ctx.t('tools.measure.title'), liveB ? h('span.kqt-live', ctx.t('tools.measure.live')) : null]),
      h('div.kqt-figs', [
        row('tools.measure.distance', fmtDistance(m.distance), 'measure-distance'),
        row('tools.measure.horizontal', fmtDistance(m.horizontal)),
        row('tools.measure.rise', `${sign(m.rise)}${fmtDe(m.rise, 2)} m`),
        row('tools.measure.grade', `${sign(m.grade)}${fmtDe(m.grade, 1)} %`),
      ]),
      profileSvg(m.profile, A, B, ctx.t('tools.measure.profile')),
    ];
    if (where) kids.push(h('div.kqt-where', ctx.t('tools.measure.on', { name: where })));
    this.sheet.replaceChildren(...kids);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as ShaderMaterial | undefined)?.dispose?.();
    });
  }
}

/** Height profile as a small SVG (ruled paper, ink line, hatched ground, A/B poles). */
export function profileSvg(p: ProfileSample[], A: V3, B: V3, title: string): SVGSVGElement {
  const W = 340;
  const H = 128;
  const L = 34;
  const R = 10;
  const T = 14;
  const Bm = 22;
  const st = profileStats(p);
  const lo0 = Math.min(st.min, A.y, B.y);
  const hi0 = Math.max(st.max, A.y, B.y);
  const pad = Math.max(0.5, (hi0 - lo0) * 0.15);
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const len = Math.max(1e-3, p[p.length - 1]?.s ?? 1);
  const X = (s: number) => L + (s / len) * (W - L - R);
  const Y = (y: number) => T + (1 - (y - lo) / (hi - lo)) * (H - T - Bm);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text) e.textContent = text;
    return e;
  };
  const svgEl = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kqt-profile', role: 'img', 'aria-label': title }) as SVGSVGElement;
  // grid
  const hs = niceStep(hi - lo, 4);
  for (let y = Math.ceil(lo / hs) * hs; y <= hi; y += hs) {
    svgEl.append(el('line', { x1: L, x2: W - R, y1: Y(y), y2: Y(y), class: 'g' }));
    svgEl.append(el('text', { x: L - 4, y: Y(y) + 3.5, class: 'ax', 'text-anchor': 'end' }, fmtDe(y, hs < 1 ? 1 : 0)));
  }
  const ss = niceStep(len, 5);
  for (let s = 0; s <= len + 1e-6; s += ss) {
    svgEl.append(el('line', { x1: X(s), x2: X(s), y1: T, y2: H - Bm, class: 'g' }));
    svgEl.append(el('text', { x: X(s), y: H - Bm + 13, class: 'ax', 'text-anchor': 'middle' }, `${fmtDe(s, ss < 1 ? 1 : 0)}`));
  }
  svgEl.append(el('text', { x: W - R, y: H - 2, class: 'ax', 'text-anchor': 'end' }, 'm'));
  // ground (hatched) + profile line
  let d = `M${X(0)},${H - Bm}`;
  for (const q of p) d += ` L${X(q.s).toFixed(1)},${Y(q.h).toFixed(1)}`;
  d += ` L${X(len)},${H - Bm} Z`;
  svgEl.append(el('path', { d, class: 'gr' }));
  let line = '';
  p.forEach((q, i) => (line += `${i ? 'L' : 'M'}${X(q.s).toFixed(1)},${Y(q.h).toFixed(1)} `));
  svgEl.append(el('path', { d: line, class: 'pl' }));
  // sight line between the measured points (may be on walls)
  svgEl.append(el('line', { x1: X(0), y1: Y(A.y), x2: X(len), y2: Y(B.y), class: 'sl' }));
  for (const [s, y, n] of [
    [0, A.y, 'A'],
    [len, B.y, 'B'],
  ] as const) {
    svgEl.append(el('circle', { cx: X(s), cy: Y(y), r: 3.2, class: 'pt' }));
    svgEl.append(el('text', { x: X(s) + (s === 0 ? 6 : -6), y: Y(y) - 5, class: 'lab', 'text-anchor': s === 0 ? 'start' : 'end' }, n));
  }
  return svgEl;
}
