/**
 * Procedural props (low poly, vertex coloured), built into a Kit in prop space after
 * `kit.place(x, y, z, yaw)`: y = 0 is the ground, +z is the prop's "front" (a cart's shafts).
 * Colours are sRGB. Everything is original, generic period carpentry and masonry.
 */
import { IcosahedronGeometry, Matrix4 } from 'three';
import { type Hex, type Kit, rng, tint } from './kit';

export const C = {
  wood: 0x7a5636,
  woodDark: 0x4e3622,
  woodGrey: 0x8a8278,
  iron: 0x2b2a2a,
  sandstone: 0xc49a7c,
  sandstoneRed: 0xa86f58,
  sandstonePale: 0xd8c3a2,
  rubble: 0x9a8f84,
  lime: 0xe6e1d6,
  straw: 0xc9ad62,
  strawDark: 0x9c8446,
  ember: 0xff7a2a,
  ash: 0x3a3532,
  rope: 0x9a8a68,
  cloth: 0x8d8475,
  ledger: 0xe8dcc0,
  roof: 0x6a4a3a,
  slate: 0x4a4c52,
  water: 0x2a3a3c,
  plaster: 0xd9d2c4,
} as const;

/** A spoked wheel in the x = const plane (axle along x), centre at (x, y, z). */
export function wheel(k: Kit, x: number, y: number, z: number, radius: number, color: Hex): void {
  k.push(x, y, z, 0, 0, Math.PI / 2);
  // rim as 12 short beams
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    k.beam(Math.cos(a0) * radius, 0, Math.sin(a0) * radius, Math.cos(a1) * radius, 0, Math.sin(a1) * radius, 0.07, color, 0.09);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.beam(0, 0, 0, Math.cos(a) * radius * 0.95, 0, Math.sin(a) * radius * 0.95, 0.035, color);
  }
  k.cyl(0.09, 0.09, 0.22, 0, -0.11, 0, C.woodDark, undefined, 8);
  k.pop();
}

export type CartLoad = 'stones' | 'blocks' | 'crates' | 'straw' | 'logs' | 'empty' | 'marked';

/** Two-wheeled tipping cart (Karren) with shafts resting on the ground. */
export function cart(k: Kit, seed: number, load: CartLoad = 'stones', wheels = true): void {
  const r = rng(seed);
  const wood = tint(C.wood, r);
  // the bed tilts forward: shafts on the ground
  const tilt = -0.11;
  k.push(0, 0.72, 0, tilt, 0, 0);
  k.box(1.5, 0.08, 2.5, 0, 0, 0, wood);
  for (const sx of [-1, 1]) k.box(0.06, 0.42, 2.5, sx * 0.72, 0.08, 0, tint(wood, r, 0.06));
  k.box(1.5, 0.42, 0.06, 0, 0.08, -1.22, wood);
  k.box(1.5, 0.3, 0.06, 0, 0.08, 1.22, wood);
  for (const sx of [-1, 1]) k.beam(sx * 0.55, -0.02, 1.0, sx * 0.4, -0.26, 3.2, 0.09, C.woodDark);
  // load
  if (load === 'stones') {
    for (let i = 0; i < 9; i++) k.rock(0.22 + r() * 0.18, (r() - 0.5) * 1.0, 0.06 + r() * 0.12, (r() - 0.5) * 1.9, tint(C.sandstone, r, 0.18), seed * 7 + i);
  } else if (load === 'blocks' || load === 'marked') {
    k.box(0.62, 0.42, 0.95, -0.32, 0.08, -0.45, tint(C.sandstone, r, 0.08), [0, 0.05, 0]);
    k.box(0.6, 0.4, 0.9, 0.34, 0.08, -0.5, tint(C.sandstoneRed, r, 0.08), [0, -0.04, 0]);
    k.box(0.64, 0.44, 1.0, 0.0, 0.08, 0.6, tint(C.sandstone, r, 0.08), [0, 0.03, 0]);
    if (load === 'marked') {
      // the mason's mark: an open angle and three points (bible 4.3), cut into the front face
      const mk = 0x5a3a2c;
      k.box(0.03, 0.18, 0.015, -0.05, 0.22, 1.105, mk, [0, 0, 0.6]);
      k.box(0.03, 0.18, 0.015, 0.05, 0.22, 1.105, mk, [0, 0, -0.6]);
      for (const dx of [-0.07, 0, 0.07]) k.box(0.025, 0.025, 0.015, dx, 0.16, 1.105, mk);
    }
  } else if (load === 'crates') {
    for (let i = 0; i < 4; i++) k.box(0.6, 0.45, 0.55, (i % 2 ? 0.33 : -0.33), 0.08, i < 2 ? -0.6 : 0.3, tint(C.woodGrey, r));
    k.box(0.6, 0.4, 0.5, 0, 0.53, -0.2, tint(C.woodGrey, r));
  } else if (load === 'straw') {
    k.rock(0.95, 0, 0.1, 0, C.straw, seed + 3, 0.55);
    k.rock(0.7, 0.1, 0.35, 0.5, tint(C.straw, r), seed + 4, 0.5);
  } else if (load === 'logs') {
    for (let i = 0; i < 5; i++) k.cyl(0.13, 0.13, 2.4, -0.5 + i * 0.25, 0.22 + (i % 2) * 0.18, -1.2, tint(C.wood, r), [Math.PI / 2, 0, 0], 7);
  }
  k.pop();
  if (wheels) {
    wheel(k, -0.86, 0.62, -0.1, 0.62, C.woodDark);
    wheel(k, 0.86, 0.62, -0.1, 0.62, C.woodDark);
  }
  k.cyl(0.05, 0.05, 1.86, -0.93, 0.62, -0.1, C.iron, [0, 0, Math.PI / 2], 6);
}

/** Four-wheeled covered-less wagon (Leiterwagen) loaded with crates and chests. */
export function wagon(k: Kit, seed: number): void {
  const r = rng(seed);
  k.box(1.7, 0.1, 3.8, 0, 0.95, 0, C.wood);
  for (const sx of [-1, 1]) {
    // ladder sides
    k.beam(sx * 0.85, 1.05, -1.9, sx * 0.85, 1.05, 1.9, 0.07, C.woodDark);
    k.beam(sx * 0.95, 1.65, -1.9, sx * 0.95, 1.65, 1.9, 0.07, C.woodDark);
    for (let i = 0; i < 7; i++) k.beam(sx * 0.85, 1.05, -1.8 + i * 0.6, sx * 0.95, 1.65, -1.8 + i * 0.6, 0.04, C.woodDark);
  }
  for (let i = 0; i < 6; i++) k.box(0.62, 0.5, 0.6, (i % 2 ? 0.36 : -0.36), 1.05, -1.4 + Math.floor(i / 2) * 1.0, tint(C.woodGrey, r));
  k.box(0.9, 0.42, 0.55, 0, 1.55, -0.6, 0x5b3d2a);
  k.box(0.7, 0.3, 0.5, 0.1, 1.55, 0.5, tint(C.cloth, r));
  wheel(k, -0.95, 0.55, -1.3, 0.55, C.woodDark);
  wheel(k, 0.95, 0.55, -1.3, 0.55, C.woodDark);
  wheel(k, -0.92, 0.42, 1.35, 0.42, C.woodDark);
  wheel(k, 0.92, 0.42, 1.35, 0.42, C.woodDark);
  k.beam(0, 0.6, 1.9, 0, 0.12, 4.2, 0.1, C.woodDark);
}

/** A heap of broken masonry: rough rocks with a few dressed blocks on top. */
export function rubblePile(k: Kit, seed: number, w = 3, d = 2.4, h = 1.2): void {
  const r = rng(seed);
  const n = Math.round(10 + w * d * 1.6);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r());
    const x = Math.cos(a) * rr * w * 0.5;
    const z = Math.sin(a) * rr * d * 0.5;
    const up = (1 - rr) * h * 0.7;
    k.rock(0.25 + r() * 0.35 * (1 - rr * 0.5), x, up * 0.8, z, tint(r() < 0.3 ? C.sandstoneRed : r() < 0.6 ? C.rubble : C.sandstone, r, 0.15), seed * 31 + i, 0.65);
  }
  for (let i = 0; i < 3; i++) k.box(0.5, 0.35, 0.8, (r() - 0.5) * w * 0.5, h * 0.45, (r() - 0.5) * d * 0.4, tint(C.sandstone, r), [r() * 0.3, r() * 3, r() * 0.25]);
  // lime dust at the foot
  k.rock(Math.max(w, d) * 0.55, 0, -0.12, 0, 0xb8ad9d, seed + 99, 0.12);
}

/** Dressed blocks stacked in courses (ashlar), ready to load. */
export function blockStack(k: Kit, seed: number, cols = 3, rows = 2, courses = 2): void {
  const r = rng(seed);
  const bw = 0.62;
  const bd = 0.95;
  const bh = 0.42;
  for (let c = 0; c < courses; c++) {
    for (let i = 0; i < cols - c; i++) {
      for (let j = 0; j < rows; j++) {
        const x = (i - (cols - c - 1) / 2) * (bw + 0.04) + (r() - 0.5) * 0.05;
        const z = (j - (rows - 1) / 2) * (bd + 0.05) + (r() - 0.5) * 0.06;
        k.box(bw, bh, bd, x, c * (bh + 0.01), z, tint(r() < 0.35 ? C.sandstoneRed : C.sandstone, r, 0.1), [0, (r() - 0.5) * 0.08, 0]);
      }
    }
  }
  // spacer laths
  k.box(cols * 0.7, 0.05, 0.08, 0, -0.02, -0.4, C.woodDark);
  k.box(cols * 0.7, 0.05, 0.08, 0, -0.02, 0.4, C.woodDark);
}

/** Stonebreakers' tools: sledge, pick, crowbar and wedges, leaning on / lying by a block. */
export function tools(k: Kit, seed: number): void {
  const r = rng(seed);
  k.box(0.7, 0.5, 0.9, 0, 0, 0, tint(C.sandstone, r));
  // sledgehammer leaning on the block
  k.pole(0.45, 0.0, 0.2, 0.4, 0.95, 0.15, 0.025, C.wood);
  k.box(0.12, 0.12, 0.26, 0.45, 0.0, 0.2, C.iron);
  // pickaxe
  k.pole(-0.5, 0.0, -0.1, -0.42, 0.85, -0.05, 0.022, C.wood);
  k.beam(-0.42, 0.85, -0.35, -0.42, 0.85, 0.25, 0.05, C.iron);
  // crowbar on the ground
  k.pole(-0.2, 0.03, 0.7, 0.9, 0.03, 0.55, 0.02, C.iron);
  // wedges and a mallet on top
  for (let i = 0; i < 3; i++) k.box(0.05, 0.05, 0.16, -0.15 + i * 0.1, 0.5, 0.1, C.iron, [0, r(), 0]);
  k.box(0.14, 0.12, 0.2, 0.12, 0.5, -0.2, C.woodDark);
}

/** A beam scale (Waage): two posts, a balance beam, two pans on chains, weights. */
export function scale(k: Kit, seed: number): void {
  const r = rng(seed);
  const w = tint(C.wood, r);
  k.box(0.18, 2.6, 0.18, -1.0, 0, 0, w);
  k.box(0.18, 2.6, 0.18, 1.0, 0, 0, w);
  k.box(2.4, 0.18, 0.2, 0, 2.55, 0, w);
  for (const sx of [-1, 1]) k.beam(sx * 1.0, 0.0, -0.6, sx * 1.0, 1.4, 0, 0.08, C.woodDark);
  // the balance beam, slightly tipped
  k.push(0, 2.2, 0, 0, 0, 0.05);
  k.box(1.7, 0.08, 0.08, 0, 0, 0, C.iron);
  k.box(0.08, 0.35, 0.05, 0, 0, 0, C.iron);
  for (const sx of [-1, 1]) {
    for (const [dx, dz] of [[0.25, 0], [-0.12, 0.22], [-0.12, -0.22]] as const) k.pole(sx * 0.82, 0, 0, sx * 0.82 + dx, -1.15, dz, 0.008, C.iron, 4);
    k.cyl(0.36, 0.3, 0.06, sx * 0.82, -1.2, 0, C.iron, undefined, 12);
  }
  k.pop();
  k.box(0.6, 0.4, 0.5, 0.82, 0.96, 0, tint(C.sandstone, r));
  for (let i = 0; i < 4; i++) k.cyl(0.07 + i * 0.015, 0.08 + i * 0.015, 0.1 + i * 0.03, -0.3 + i * 0.22, 0, 0.55, C.iron, undefined, 8);
}

/** Stacked logs and squared beams (wood from the palace, bible 4.3). */
export function woodStack(k: Kit, seed: number, len = 3.2, rows = 4): void {
  const r = rng(seed);
  for (let row = 0; row < rows; row++) {
    const n = rows - row + 1;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.34;
      k.cyl(0.16, 0.16, len, x, 0.17 + row * 0.29, -len / 2 + (r() - 0.5) * 0.2, tint(C.wood, r, 0.15), [Math.PI / 2, 0, 0], 7);
    }
  }
  // two stakes hold the stack
  for (const sx of [-1, 1]) k.box(0.1, 1.5, 0.1, sx * (rows * 0.2 + 0.25), 0, 0, C.woodDark, [0, 0, -sx * 0.12]);
  // squared beams beside it, charred at the ends
  for (let i = 0; i < 3; i++) k.box(0.26, 0.26, len * 1.3, rows * 0.2 + 0.7 + i * 0.3, i === 2 ? 0.27 : 0, 0.1, i === 1 ? 0x3d2c22 : tint(C.woodGrey, r));
}

/** Fire pit: a ring of stones, crossed logs, glowing embers (aGlow). */
export function firePit(k: Kit, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    k.rock(0.2 + r() * 0.06, Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75, tint(C.rubble, r), seed + i, 0.7);
  }
  k.rock(0.62, 0, -0.08, 0, C.ash, seed + 20, 0.18);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    k.pole(Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55, Math.cos(a) * 0.05, 0.42, Math.sin(a) * 0.05, 0.06, 0x2a201a, 6);
  }
  for (let i = 0; i < 7; i++) k.add(emberRock(r), C.ember, 1.0 + r(), translate((r() - 0.5) * 0.6, 0.02, (r() - 0.5) * 0.6));
}

function emberRock(r: () => number): IcosahedronGeometry {
  const g = new IcosahedronGeometry(0.08 + r() * 0.06, 0);
  g.scale(1, 0.6, 1);
  return g;
}
function translate(x: number, y: number, z: number): Matrix4 {
  return new Matrix4().makeTranslation(x, y, z);
}

/** Writing table with a stool, a ledger and an inkwell (Soll keeps the books, bible 4.3). */
export function table(k: Kit, seed: number): void {
  const r = rng(seed);
  const w = tint(C.wood, r);
  k.box(1.3, 0.06, 0.75, 0, 0.74, 0, w);
  for (const [x, z] of [[-0.58, -0.3], [0.58, -0.3], [-0.58, 0.3], [0.58, 0.3]] as const) k.box(0.06, 0.74, 0.06, x, 0, z, C.woodDark);
  k.box(0.42, 0.04, 0.3, -0.15, 0.8, 0, C.ledger, [0, 0.15, 0]);
  k.box(0.42, 0.05, 0.3, -0.15, 0.78, 0.0, 0x5a3424, [0, 0.15, 0]);
  k.box(0.3, 0.06, 0.22, 0.35, 0.8, 0.1, C.ledger, [0, -0.2, 0]);
  k.cyl(0.035, 0.04, 0.06, 0.4, 0.8, -0.2, C.iron);
  // stool
  k.cyl(0.2, 0.2, 0.05, 0, 0.45, -0.75, w, undefined, 10);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.pole(Math.cos(a) * 0.22, 0, -0.75 + Math.sin(a) * 0.22, Math.cos(a) * 0.12, 0.45, -0.75 + Math.sin(a) * 0.12, 0.025, C.woodDark, 5);
  }
}

/** Builders' scaffold along x: poles, ledgers, planks per level, braces, a ladder. */
export function scaffold(k: Kit, seed: number, len = 8, height = 7, depth = 1.4): void {
  const r = rng(seed);
  const bays = Math.max(1, Math.round(len / 2.6));
  const bl = len / bays;
  const levels = Math.max(1, Math.floor(height / 2.1));
  const pole = (x: number, z: number) => k.pole(x, 0, z, x + (r() - 0.5) * 0.08, height + 0.6, z + (r() - 0.5) * 0.08, 0.06, tint(C.woodGrey, r, 0.1), 6);
  for (let i = 0; i <= bays; i++) {
    pole(-len / 2 + i * bl, 0);
    pole(-len / 2 + i * bl, depth);
  }
  for (let l = 1; l <= levels; l++) {
    const y = l * 2.1;
    for (const z of [0, depth]) k.pole(-len / 2 - 0.2, y, z, len / 2 + 0.2, y, z, 0.045, C.woodGrey, 5);
    for (let i = 0; i <= bays; i++) k.pole(-len / 2 + i * bl, y, -0.15, -len / 2 + i * bl, y, depth + 0.15, 0.04, C.woodGrey, 5);
    for (let p = 0; p < 4; p++) k.box(len, 0.05, depth / 4 - 0.03, 0, y + 0.05, (p + 0.5) * (depth / 4), tint(C.wood, r, 0.18));
    // toe board
    k.box(len, 0.18, 0.03, 0, y + 0.1, depth + 0.02, tint(C.wood, r));
  }
  // diagonal braces on the outer face
  for (let i = 0; i < bays; i++) {
    const x0 = -len / 2 + i * bl;
    k.pole(x0, 0.1, depth + 0.07, x0 + bl, Math.min(height, 4.2), depth + 0.07, 0.035, C.woodGrey, 5);
  }
  // ladder
  const lx = -len / 2 + bl * 0.5;
  for (const dx of [-0.22, 0.22]) k.pole(lx + dx, 0, depth + 0.9, lx + dx, 2.4, depth + 0.1, 0.03, C.wood, 5);
  for (let s = 0; s < 7; s++) {
    const t = (s + 0.5) / 7;
    k.pole(lx - 0.22, 2.4 * t, depth + 0.9 - 0.8 * t, lx + 0.22, 2.4 * t, depth + 0.9 - 0.8 * t, 0.02, C.wood, 4);
  }
  // a bucket on a rope from the top
  k.pole(len / 2 - 0.6, height + 0.4, depth + 0.4, len / 2 - 0.6, height - 2.5, depth + 0.4, 0.01, C.rope, 4);
  k.cyl(0.16, 0.13, 0.28, len / 2 - 0.6, height - 2.8, depth + 0.4, C.woodDark, undefined, 8);
}

/** Shear-leg hoist lifting a block (Bauplatz). */
export function hoist(k: Kit, seed: number, height = 6): void {
  const r = rng(seed);
  k.pole(-1.4, 0, 0, 0, height, 0.4, 0.09, tint(C.woodGrey, r), 6);
  k.pole(1.4, 0, 0, 0, height, 0.4, 0.09, tint(C.woodGrey, r), 6);
  k.pole(0, 0, -3.0, 0, height, 0.4, 0.07, C.rope, 4);
  k.cyl(0.2, 0.2, 0.18, 0, height - 0.35, 0.55, C.woodDark, [Math.PI / 2, 0, 0], 8);
  k.pole(0, height - 0.4, 0.55, 0, 1.6, 0.6, 0.015, C.rope, 4);
  // the lewis-hung block, swinging a little out of plumb
  k.box(0.6, 0.45, 0.95, 0.02, 1.15, 0.6, tint(C.sandstone, r), [0, 0.3, 0.02]);
  // the winch at the foot
  k.box(0.1, 0.9, 0.1, -0.8, 0, -0.6, C.woodDark);
  k.box(0.1, 0.9, 0.1, 0.8, 0, -0.6, C.woodDark);
  k.cyl(0.14, 0.14, 1.6, -0.8, 0.8, -0.6, C.wood, [0, 0, -Math.PI / 2], 8);
}

/** Mortar trough with a lime heap and a shovel. */
export function mortar(k: Kit, seed: number): void {
  const r = rng(seed);
  k.box(1.8, 0.35, 0.9, 0, 0, 0, tint(C.woodDark, r));
  k.box(1.6, 0.04, 0.72, 0, 0.3, 0, 0xcfc8b8);
  k.rock(0.9, 1.7, -0.1, 0.2, C.lime, seed + 2, 0.45);
  k.rock(0.7, -1.6, -0.1, -0.3, 0xb39a6e, seed + 3, 0.4);
  k.pole(-1.3, 0, 0.3, -0.95, 1.0, 0.1, 0.02, C.wood, 5);
  k.box(0.22, 0.03, 0.28, -1.33, 0.02, 0.32, C.iron, [0.6, 0, 0]);
}

/** A dog kennel: small hut with a gable roof and a round-topped door. */
export function kennel(k: Kit, seed: number): void {
  const r = rng(seed);
  const w = tint(C.wood, r, 0.15);
  k.box(1.1, 0.85, 1.4, 0, 0, 0, w);
  k.box(0.42, 0.55, 0.03, 0, 0.0, 0.71, 0x140e0a);
  k.push(0, 0.85, 0, 0, 0, 0);
  k.box(0.7, 0.05, 1.6, -0.3, 0.17, 0, tint(C.roof, r), [0, 0, 0.5]);
  k.box(0.7, 0.05, 1.6, 0.3, 0.17, 0, tint(C.roof, r), [0, 0, -0.5]);
  k.pop();
  k.rock(0.35, 0.2, 0, 1.0, C.straw, seed + 1, 0.3);
}

/** A long wooden trough (feed or water). */
export function trough(k: Kit, seed: number, len = 2.6, water = true): void {
  const r = rng(seed);
  const w = tint(C.woodDark, r);
  k.box(len, 0.08, 0.6, 0, 0.3, 0, w);
  for (const s of [-1, 1]) k.box(len, 0.32, 0.06, 0, 0.3, s * 0.28, w);
  for (const s of [-1, 1]) k.box(0.06, 0.32, 0.6, s * len * 0.5, 0.3, 0, w);
  for (const s of [-1, 1]) k.box(0.1, 0.32, 0.5, s * (len * 0.5 - 0.2), 0, 0, C.woodDark);
  k.box(len - 0.12, 0.02, 0.48, 0, 0.52, 0, water ? C.water : 0x8a7350);
}

/** Straw: a loose heap or a few bales. */
export function straw(k: Kit, seed: number, bales = false): void {
  const r = rng(seed);
  if (bales) {
    for (let i = 0; i < 4; i++) k.box(0.9, 0.45, 0.5, (i % 2) * 0.95 - 0.45, i > 1 ? 0.45 : 0, (r() - 0.5) * 0.1, tint(C.straw, r, 0.1), [0, (r() - 0.5) * 0.2, 0]);
  } else {
    k.rock(1.1, 0, -0.1, 0, tint(C.straw, r), seed, 0.45);
    for (let i = 0; i < 5; i++) k.rock(0.3, (r() - 0.5) * 2.2, -0.05, (r() - 0.5) * 2.2, tint(C.strawDark, r), seed + i + 1, 0.25);
  }
}

export function barrel(k: Kit, seed: number): void {
  const r = rng(seed);
  k.cyl(0.3, 0.27, 0.45, 0, 0, 0, tint(C.wood, r), undefined, 10);
  k.cyl(0.27, 0.3, 0.45, 0, 0.45, 0, tint(C.wood, r), undefined, 10);
  for (const y of [0.1, 0.8]) k.cyl(0.305, 0.305, 0.05, 0, y, 0, C.iron, undefined, 10);
}

/** A tethering post with an iron ring and a chain (kennel yard). */
export function post(k: Kit, seed: number): void {
  const r = rng(seed);
  k.box(0.16, 1.2, 0.16, 0, 0, 0, tint(C.woodDark, r));
  k.cyl(0.06, 0.06, 0.02, 0.09, 0.9, 0, C.iron, [0, 0, Math.PI / 2], 8);
  k.pole(0.1, 0.9, 0, 0.6, 0.02, 0.4, 0.012, C.iron, 4);
}

/** A sentry box (Wachhäuschen) with a pitched roof. */
export function sentryBox(k: Kit, seed: number): void {
  const r = rng(seed);
  const w = tint(0x6f5a44, r);
  k.box(1.3, 2.3, 0.08, 0, 0, -0.6, w);
  for (const s of [-1, 1]) k.box(0.08, 2.3, 1.2, s * 0.62, 0, 0, w);
  k.box(1.5, 0.08, 1.5, 0, 2.3, 0, C.roof, [0.12, 0, 0]);
  k.box(1.1, 0.05, 0.9, 0, 0.9, -0.2, C.woodDark);
}
