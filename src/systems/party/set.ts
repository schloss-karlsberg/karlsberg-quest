/**
 * The party's set pieces behind a small interface (`PartySet`), so a 3D pass can swap the
 * placeholder primitives for authored meshes without touching the party logic.
 *
 * Placeholder (`PlaceholderPartySet`): primitives on the scenery Kit, cheap:
 *  - ONE merged mesh for every static prop on the shared prop material (`propMaterial`, vertex
 *    colours, `aGlow` for the coals, the lantern glass and the fairy-light bulbs): the trestle table
 *    and its bench, two more benches (Hanne's, the keep ending's), Herzog's camping chair, the cake,
 *    the cake cash box, a gas stove with the mulled-wine pot and the children's punch, the fire
 *    bowl on its stand with logs and coals, two placeholder posts for the fairy lights with the
 *    wire and small emissive bulbs on a sagging curve, three lanterns, the archive box (A only)
 *  - ONE instanced glow-sprite mesh (`glowMaterial`, additive): the bulbs' halos, the lantern and
 *    fire halos, the flame tongues and the sparks (animated on the CPU, ~100 quads)
 *  = 2 draw calls. Terrain y from `heightAt`. No fireworks (bible 06 §8.5).
 */
import { type BufferGeometry, IcosahedronGeometry, InstancedBufferAttribute, Mesh, type Object3D, Group, type ShaderMaterial } from 'three';
import { quadInstanced } from '../fx/gl';
import { Kit, rng } from '../scenery/kit';
import { glowMaterial, propMaterial } from '../scenery/material';
import { type PartyLayout, type PropId, propsFor } from './placements';
import type { PartyVariant } from './types';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface PartySetHandle {
  readonly root: Object3D;
  /** World points of the props (base, on the ground or on the table). */
  readonly anchors: Readonly<Partial<Record<PropId, P3>>>;
  /** The fire bowl's flame height (1 = normal, 1.6 = the burn ending's high fire). */
  setFire(k: number): void;
  /** A burst of sparks rising from the fire bowl (burn ending). */
  burst(): void;
  /** Animate (drawn frames; seconds). */
  update(dt: number): void;
  setVisible(v: boolean): void;
  /** Draw calls the set adds when fully in view. */
  drawCalls(): number;
  dispose(): void;
}

export interface PartySet {
  build(scene: Object3D, layout: PartyLayout, variant: PartyVariant): PartySetHandle;
}

// colours (sRGB); wood / iron / ember hexes match the Kit's surface table
const C = {
  wood: 0x7a5636,
  woodDark: 0x4e3622,
  iron: 0x2b2a2a,
  steel: 0x8f9296,
  ember: 0xff7a2a,
  ash: 0x3a3532,
  cream: 0xe8dcc0,
  choc: 0x5a3a22,
  fabric: 0x3e6a4a,
  cashBox: 0x3c5a7a,
  punch: 0xa8322a,
  card: 0x9a948a,
  wire: 0x222222,
  bulb: 0xffe2a8,
  glass: 0xffc27a,
};

const FLAMES = 18;
const SPARKS = 44;
const BULBS = 34;
/** Sag of the fairy-light wire at its middle (m). */
const SAG = 0.75;

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  age: number;
}

export class PlaceholderPartySet implements PartySet {
  constructor(private readonly heightAt: (x: number, z: number) => number) {}

  build(scene: Object3D, layout: PartyLayout, variant: PartyVariant): PartySetHandle {
    const ground = (x: number, z: number) => {
      const g = this.heightAt(x, z);
      return Number.isFinite(g) ? g : 0;
    };
    const P = layout.props;
    const anchors: Partial<Record<PropId, P3>> = {};
    const tableY = ground(P.table.x, P.table.z);
    for (const id of propsFor(variant)) {
      const s = P[id];
      // things on the table stand on its top (one height for the whole top: the table is level)
      const base = s.up !== undefined && id !== 'lightsA' && id !== 'lightsB' ? tableY : ground(s.x, s.z);
      anchors[id] = { x: s.x, y: base + (s.up ?? 0), z: s.z };
    }
    const k = new Kit();
    const at = (id: PropId, yaw = P[id].yaw ?? 0) => {
      const a = anchors[id]!;
      k.place(a.x, a.y, a.z, yaw);
    };
    // the trestle table (2.2 × 0.6 m, top at 0.76) and its bench
    at('table');
    k.box(2.2, 0.035, 0.6, 0, 0.725, 0, C.wood);
    for (const sx of [-0.85, 0.85]) {
      k.beam(sx, 0, -0.26, sx, 0.72, 0.18, 0.035, C.steel);
      k.beam(sx, 0, 0.26, sx, 0.72, -0.18, 0.035, C.steel);
    }
    const bench = (id: PropId) => {
      at(id);
      k.box(2.2, 0.035, 0.26, 0, 0.43, 0, C.wood);
      for (const sx of [-0.85, 0.85]) {
        k.beam(sx, 0, -0.12, sx, 0.43, 0.08, 0.03, C.steel);
        k.beam(sx, 0, 0.12, sx, 0.43, -0.08, 0.03, C.steel);
      }
    };
    bench('benchTable');
    bench('benchHanne');
    bench('benchKeep');
    // Herzog's camping chair (the only one, §8.1)
    at('chair');
    k.box(0.5, 0.03, 0.46, 0, 0.42, 0, C.fabric);
    k.box(0.5, 0.5, 0.03, 0, 0.44, 0.23, C.fabric, [-0.18, 0, 0]);
    for (const sx of [-0.24, 0.24]) {
      k.beam(sx, 0, -0.22, sx, 0.42, 0.22, 0.02, C.iron);
      k.beam(sx, 0, 0.22, sx, 0.42, -0.22, 0.02, C.iron);
      k.beam(sx, 0.62, -0.18, sx, 0.62, 0.14, 0.02, C.iron);
    }
    // on the table: cake, cash box, the gas stove with two pots (mulled wine, children's punch; no brands)
    at('cake');
    k.cyl(0.15, 0.15, 0.07, 0, 0, 0, C.cream, undefined, 12);
    k.cyl(0.15, 0.15, 0.02, 0, 0.07, 0, C.choc, undefined, 12);
    at('cashBox');
    k.box(0.22, 0.08, 0.15, 0, 0, 0, C.cashBox);
    at('stove');
    k.box(0.62, 0.07, 0.3, 0, 0, 0, C.iron);
    at('pot');
    k.cyl(0.14, 0.13, 0.2, 0, 0.07, 0, C.steel, undefined, 12);
    at('punch');
    k.cyl(0.1, 0.1, 0.14, 0, 0.07, 0, C.punch, undefined, 10);
    // the fire bowl: a stand, the iron bowl, logs, glowing coals
    at('fireBowl');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.beam(Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42, Math.sin(a) * 0.22, 0.34, Math.cos(a) * 0.22, 0.04, C.iron);
    }
    k.cyl(0.52, 0.22, 0.24, 0, 0.32, 0, C.iron, undefined, 14);
    k.cyl(0.46, 0.46, 0.03, 0, 0.5, 0, C.ash, undefined, 14);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.4;
      k.beam(Math.sin(a) * -0.32, 0.53, Math.cos(a) * -0.32, Math.sin(a) * 0.32, 0.6, Math.cos(a) * 0.32, 0.07, C.woodDark);
    }
    k.cyl(0.36, 0.4, 0.05, 0, 0.53, 0, C.ember, undefined, 12, 1.1);
    // the fairy lights: two placeholder posts (until they hang on two real beeches), the wire, bulbs
    const A = anchors.lightsA!;
    const B = anchors.lightsB!;
    for (const e of [A, B]) {
      const g0 = ground(e.x, e.z);
      k.place(e.x, g0, e.z);
      k.cyl(0.07, 0.09, e.y - g0 + 0.25, 0, 0, 0, C.woodDark, undefined, 6);
    }
    k.place(0, 0, 0);
    const curve = (t: number): P3 => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t - SAG * 4 * t * (1 - t), z: A.z + (B.z - A.z) * t });
    for (let i = 0; i < 12; i++) {
      const p = curve(i / 12);
      const q = curve((i + 1) / 12);
      k.beam(p.x, p.y, p.z, q.x, q.y, q.z, 0.012, C.wire);
    }
    const bulbs: P3[] = [];
    for (let i = 0; i < BULBS; i++) {
      const p = curve((i + 0.5) / BULBS);
      p.y -= 0.05;
      bulbs.push(p);
      const g = new IcosahedronGeometry(0.035, 0);
      g.translate(p.x, p.y, p.z);
      k.add(g, C.bulb, 0.9);
    }
    // three lanterns (Gerold handed them out in t1)
    const lanterns: P3[] = [];
    for (const id of ['lantern1', 'lantern2', 'lantern3'] as const) {
      at(id);
      k.box(0.16, 0.03, 0.16, 0, 0, 0, C.iron);
      k.box(0.12, 0.18, 0.12, 0, 0.03, 0, C.glass, undefined, 1.0);
      k.cone(0.11, 0.08, 0, 0.21, 0, C.iron, 4);
      k.pole(0, 0.29, 0, 0, 0.36, 0, 0.008, C.iron);
      const a = anchors[id]!;
      lanterns.push({ x: a.x, y: a.y + 0.12, z: a.z });
    }
    if (anchors.archiveBox) {
      at('archiveBox', 0.2);
      k.box(0.42, 0.24, 0.32, 0, 0, 0, C.card);
      k.box(0.44, 0.04, 0.34, 0, 0.24, 0, C.card);
    }
    const geo = k.build();
    const mat = propMaterial();
    const props = new Mesh(geo, mat);
    props.name = 'party-props';

    // glow sprites: [static halos …, flames …, sparks …]
    const fire = anchors.fireBowl!;
    const statics: number[] = [];
    const tints: number[] = [];
    const r = rng(0x9a27);
    for (const b of bulbs) {
      statics.push(b.x, b.y, b.z, 0.26);
      tints.push(1.0 * 0.55, 0.82 * 0.55, 0.52 * 0.55, r());
    }
    for (const l of lanterns) {
      statics.push(l.x, l.y, l.z, 0.9);
      tints.push(0.95 * 0.5, 0.6 * 0.5, 0.25 * 0.5, r());
    }
    statics.push(fire.x, fire.y + 0.9, fire.z, 3.2);
    tints.push(0.9 * 0.38, 0.42 * 0.38, 0.12 * 0.38, r());
    const nStatic = statics.length / 4;
    const total = nStatic + FLAMES + SPARKS;
    const spriteArr = new Float32Array(total * 4);
    const tintArr = new Float32Array(total * 4);
    spriteArr.set(statics);
    tintArr.set(tints);
    const sg = quadInstanced();
    const aSprite = new InstancedBufferAttribute(spriteArr, 4);
    const aTint = new InstancedBufferAttribute(tintArr, 4);
    sg.setAttribute('aSprite', aSprite);
    sg.setAttribute('aTint', aTint);
    sg.instanceCount = total;
    const gm = glowMaterial(0.6);
    const glows = new Mesh(sg, gm);
    glows.name = 'party-glows';
    glows.frustumCulled = false;
    glows.renderOrder = 9;

    const root = new Group();
    root.name = 'party-set';
    root.add(props, glows);
    scene.add(root);

    // flames and sparks
    const seeds = Array.from({ length: FLAMES }, () => ({ ph: r(), rate: 0.9 + r() * 0.7, ox: (r() - 0.5) * 0.5, oz: (r() - 0.5) * 0.5 }));
    const sparks: Spark[] = Array.from({ length: SPARKS }, () => ({ x: 0, y: -1e4, z: 0, vx: 0, vy: 0, vz: 0, life: 1, age: 1 }));
    let fireK = variant === 'burn' ? 1.6 : 1;
    let time = 0;
    let idleSpark = 0;
    const launch = (s: Spark, strong: boolean) => {
      s.x = fire.x + (r() - 0.5) * 0.5;
      s.y = fire.y + 0.65;
      s.z = fire.z + (r() - 0.5) * 0.5;
      const sp = strong ? 1.2 + r() * 1.6 : 0.4 + r() * 0.5;
      s.vx = (r() - 0.5) * sp;
      s.vz = (r() - 0.5) * sp;
      s.vy = (strong ? 3.2 : 1.6) + r() * (strong ? 3.2 : 1.2);
      s.life = strong ? 2.2 + r() * 1.6 : 1.2 + r();
      s.age = 0;
    };
    const write = () => {
      let o = nStatic * 4;
      for (const f of seeds) {
        const p = (time * f.rate + f.ph) % 1;
        const h = 0.95 * fireK;
        spriteArr[o] = fire.x + f.ox * (1 - p);
        spriteArr[o + 1] = fire.y + 0.6 + p * h;
        spriteArr[o + 2] = fire.z + f.oz * (1 - p);
        spriteArr[o + 3] = (0.62 - 0.45 * p) * (0.8 + 0.25 * fireK);
        const a = (1 - p) * (1 - p) * 0.9;
        tintArr[o] = 1.0 * a;
        tintArr[o + 1] = (0.55 - 0.3 * p) * a;
        tintArr[o + 2] = 0.12 * a;
        tintArr[o + 3] = f.ph;
        o += 4;
      }
      for (const s of sparks) {
        const live = s.age < s.life;
        const k2 = live ? 1 - s.age / s.life : 0;
        spriteArr[o] = s.x;
        spriteArr[o + 1] = live ? s.y : -1e4;
        spriteArr[o + 2] = s.z;
        spriteArr[o + 3] = 0.07 + 0.05 * k2;
        tintArr[o] = 1.0 * k2;
        tintArr[o + 1] = 0.6 * k2;
        tintArr[o + 2] = 0.22 * k2;
        tintArr[o + 3] = 0.5;
        o += 4;
      }
      aSprite.needsUpdate = true;
      aTint.needsUpdate = true;
    };
    write();
    let disposed = false;
    return {
      root,
      anchors,
      setFire(v) {
        fireK = Math.max(0, Math.min(3, v));
      },
      burst() {
        let n = 0;
        for (const s of sparks) if (s.age >= s.life && n++ < SPARKS) launch(s, true);
      },
      update(dt) {
        if (disposed || !root.visible) return;
        const d = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
        time += d;
        idleSpark += d * (2 + 3 * fireK);
        for (const s of sparks) {
          if (s.age >= s.life) {
            if (idleSpark >= 1) {
              idleSpark -= 1;
              launch(s, false);
            }
            continue;
          }
          s.age += d;
          s.vy -= 0.6 * d;
          s.vx *= 1 - 0.4 * d;
          s.vz *= 1 - 0.4 * d;
          s.x += s.vx * d + Math.sin(time * 3 + s.life * 7) * 0.15 * d;
          s.y += s.vy * d;
          s.z += s.vz * d;
        }
        idleSpark = Math.min(idleSpark, 1);
        write();
      },
      setVisible(v) {
        root.visible = v;
      },
      drawCalls: () => (root.visible ? 2 : 0),
      dispose() {
        if (disposed) return;
        disposed = true;
        root.removeFromParent();
        (props.geometry as BufferGeometry).dispose();
        (props.material as ShaderMaterial).dispose();
        sg.dispose();
        gm.dispose();
      },
    };
  }
}
