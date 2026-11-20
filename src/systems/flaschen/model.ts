/**
 * The Fläschchen in 3D: a procedural lathe bottle in generic brown glass with the shared paper label
 * (label.ts) wrapped round its body, a small additive glint sprite, and the few cover props a
 * bottle hides behind (a fallen trunk, a sandstone block, a rain barrel, a toolbox, a woodpile, a
 * hollow stump, an orange tub), built with the scenery kit so they take the world's light like
 * every other prop. Generic shapes only: no real bottle shape is copied. A 3D pass may replace the
 * look later; the API (buildBottle / buildCover) stays.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  type ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
} from 'three';
import { Kit, rng, tint } from '../scenery/kit';
import { propMaterial } from '../scenery/material';
import { C } from '../scenery/props';
import { labelMaterial } from './label';
import { flaschenMaterial } from './shader';
import type { FlaschenCover } from './spots';

/** Bottle height (m). */
export const BOTTLE_H = 0.24;
const BODY_R = 0.032;

let shared: {
  glass: LatheGeometry;
  label: CylinderGeometry;
  cap: CylinderGeometry;
  glassMat: ShaderMaterial;
  capMat: ShaderMaterial;
  glintMat: SpriteMaterial;
  propMat: ShaderMaterial;
} | null = null;

function glintTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,250,230,1)');
  grd.addColorStop(0.25, 'rgba(255,230,180,0.6)');
  grd.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  // a four-point star
  g.strokeStyle = 'rgba(255,250,235,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(32, 4);
  g.lineTo(32, 60);
  g.moveTo(4, 32);
  g.lineTo(60, 32);
  g.stroke();
  return new CanvasTexture(c);
}

function parts(): NonNullable<typeof shared> {
  if (shared) return shared;
  // profile (r, y): base, body, shoulder, neck, lip
  const R = BODY_R;
  const pts = [
    [0, 0],
    [R * 0.9, 0.0],
    [R, 0.006],
    [R, 0.13],
    [R * 0.92, 0.15],
    [R * 0.55, 0.178],
    [R * 0.38, 0.19],
    [R * 0.36, 0.225],
    [R * 0.42, 0.228],
    [R * 0.42, BOTTLE_H - 0.004],
    [0, BOTTLE_H - 0.004],
  ].map(([r, y]) => new Vector2(r!, y!));
  shared = {
    glass: new LatheGeometry(pts, 14),
    // the paper label: a band round the body, its middle facing the bottle's local +x (which faces
    // up when it lies on its side), slightly proud of the glass
    label: new CylinderGeometry(R * 1.04, R * 1.04, 0.075, 18, 1, true, Math.PI / 2 - Math.PI * 0.6, Math.PI * 1.2),
    cap: new CylinderGeometry(R * 0.44, R * 0.44, 0.008, 10),
    glassMat: flaschenMaterial({ color: 0x8a4a1c, spec: 1.6, self: 0.05 }),
    capMat: flaschenMaterial({ color: 0xb8b2a2, spec: 0.8 }),
    glintMat: new SpriteMaterial({ map: glintTexture(), color: 0xffffff, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
    propMat: propMaterial(),
  };
  return shared;
}

export interface BottleVisual {
  group: Group;
  /** The bottle itself (lying / standing inside the group). */
  bottle: Group;
  glint: Sprite;
}

/** One bottle at the origin of its group (standing, +y up); `lie` tips it onto its side. */
export function buildBottle(lie: boolean, yawDeg: number): BottleVisual {
  const p = parts();
  const group = new Group();
  group.name = 'flaschen-bottle';
  const bottle = new Group();
  const glass = new Mesh(p.glass, p.glassMat);
  glass.castShadow = true;
  const label = new Mesh(p.label, labelMaterial());
  label.position.y = 0.075;
  const cap = new Mesh(p.cap, p.capMat);
  cap.position.y = BOTTLE_H - 0.002;
  bottle.add(glass, label, cap);
  if (lie) {
    // on its side, resting on the body (local +x faces up)
    bottle.rotation.z = Math.PI / 2;
    bottle.position.set(BOTTLE_H * 0.45, BODY_R * 0.95, 0);
  }
  const pivot = new Group();
  pivot.add(bottle);
  pivot.rotation.y = (yawDeg * Math.PI) / 180;
  group.add(pivot);
  const glint = new Sprite(p.glintMat.clone());
  glint.scale.setScalar(0.22);
  glint.position.set(0, lie ? BODY_R * 1.8 : 0.16, 0);
  glint.renderOrder = 5;
  group.add(glint);
  return { group, bottle, glint };
}

const BARK = 0x4a3b2c;
const WOOD = 0x7a5634;
const WOOD_DARK = 0x4a3220;
const IRON = 0x3a3836;
const LEAF = 0x3d5a2a;

/** A cover prop at the origin (ground level), and its solid radius (m) for the collider (0 = none). */
export function buildCover(kind: FlaschenCover, yawDeg: number, seed: number): { group: Group; r: number } {
  const k = new Kit();
  const r = rng(seed * 31 + 7);
  k.place(0, 0, 0, (yawDeg * Math.PI) / 180);
  let solid = 0;
  switch (kind) {
    case 'log': {
      // a fallen beech trunk resting on its root plate and a stone: a dark gap underneath
      k.cyl(0.21, 0.25, 2.6, 1.3, 0.34, 0, tint(BARK, r, 0.1), [0, 0, Math.PI / 2 + 0.06], 10);
      k.rock(0.55, 1.45, -0.25, 0, tint(BARK, r, 0.1), seed + 1, 1.1);
      k.rock(0.18, -1.0, 0, 0.05, tint(C.sandstone, r, 0.08), seed + 2, 0.7);
      break;
    }
    case 'stone': {
      // a sandstone block tipped onto a smaller one: a gap at its foot
      k.rock(0.2, 0.25, 0, 0.2, tint(C.sandstone, r, 0.08), seed + 3, 0.7);
      k.box(0.95, 0.42, 0.6, 0, 0.14, 0, tint(C.sandstone, r, 0.08), [0, 0.3, 0.12]);
      solid = 0.4;
      break;
    }
    case 'barrel': {
      // open at the top (the bottle bobs in the rain water, its neck just out)
      const staves = new CylinderGeometry(0.3, 0.27, 0.7, 14, 1, true);
      staves.translate(0, 0.35, 0);
      k.add(staves, tint(WOOD, r, 0.06));
      k.cyl(0.27, 0.27, 0.02, 0, 0.56, 0, 0x1d2a2c, undefined, 14);
      for (const y of [0.08, 0.58]) {
        const hoop = new CylinderGeometry(0.305, 0.3, 0.04, 14, 1, true);
        hoop.translate(0, y + 0.02, 0);
        k.add(hoop, IRON);
      }
      solid = 0.32;
      break;
    }
    case 'box': {
      // an open toolbox: floor, four sides, a handle
      k.box(0.6, 0.03, 0.3, 0, 0, 0, WOOD_DARK);
      for (const s of [-1, 1]) {
        k.box(0.6, 0.22, 0.02, 0, 0, s * 0.14, WOOD);
        k.box(0.02, 0.22, 0.3, s * 0.29, 0, 0, WOOD);
      }
      k.box(0.02, 0.2, 0.02, -0.29, 0.22, 0, WOOD_DARK);
      k.box(0.02, 0.2, 0.02, 0.29, 0.22, 0, WOOD_DARK);
      k.box(0.6, 0.02, 0.02, 0, 0.4, 0, WOOD_DARK);
      break;
    }
    case 'woodpile': {
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 5 - row; i++) k.cyl(0.1, 0.1, 1.1, -0.55, 0.1 + row * 0.18, (i - (4 - row) / 2) * 0.21, tint(i % 2 ? WOOD : BARK, r, 0.1), [0, 0, -Math.PI / 2], 7);
      solid = 0.55;
      break;
    }
    case 'stump': {
      // a hollow stump: outer bark ring built from staves, the rotten inside dark
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        k.box(0.2, 0.28 + r() * 0.1, 0.07, Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27, tint(BARK, r, 0.12), [0, -a + Math.PI / 2, 0]);
      }
      k.cyl(0.26, 0.26, 0.02, 0, 0, 0, 0x2a1d12, undefined, 10);
      solid = 0.34;
      break;
    }
    case 'tub': {
      k.cyl(0.36, 0.3, 0.5, 0, 0, 0, tint(WOOD, r, 0.06), undefined, 12);
      for (const y of [0.08, 0.4]) k.cyl(0.365, 0.33, 0.035, 0, y, 0, IRON, undefined, 12);
      k.cyl(0.035, 0.045, 1.0, 0, 0.45, 0, BARK, undefined, 6);
      k.rock(0.6, 0, 1.15, 0, tint(LEAF, r, 0.1), seed + 4, 0.95);
      solid = 0.38;
      break;
    }
  }
  const g = new Group();
  g.name = `flaschen-cover-${kind}`;
  const m = new Mesh(k.build(), parts().propMat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return { group: g, r: solid };
}

/** Free a cover's geometry (the shared materials stay). */
export function disposeCover(g: Group): void {
  g.traverse((o) => (o as Mesh).geometry?.dispose());
}
