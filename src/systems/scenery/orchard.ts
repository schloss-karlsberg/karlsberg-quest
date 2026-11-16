/**
 * Apple trees for the Apfelallee (bible 2.1: the runner's trail goes "die Apfelallee hinauf"):
 * low-poly, vertex coloured, per era — summer leaves with red fruit (1789, July 1793), bare
 * branches carrying snow (February 1793; the prop material lays the snow on what faces up), and
 * in 1796 thinned crowns, many trees felled for firewood (stumps, a cut trunk).
 */
import { type Kit, rng, tint } from './kit';
import { C } from './props';

export type OrchardLook = 'summer' | 'winter' | 'ruin';

const LEAF = [0x4f6b2a, 0x5a7a30, 0x46622a, 0x617f34];
const FRUIT = [0xb8322a, 0xc4472c, 0xa8a03a];

/** One apple tree in prop space (origin on the ground). */
export function appleTree(k: Kit, seed: number, look: OrchardLook): void {
  const r = rng(seed);
  const h = 1.5 + r() * 0.5;
  const bark = tint(0x4a3a2c, r, 0.12);
  const lean = (r() - 0.5) * 0.12;
  k.push(0, 0, 0, lean, r() * 6.28, 0);
  k.cyl(0.11, 0.17, h, 0, -0.1, 0, bark, undefined, 7);
  // limbs: four to five, spreading up and out (a pruned orchard crown)
  const limbs = 4 + Math.floor(r() * 2);
  const tips: [number, number, number][] = [];
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r() * 0.6;
    const out = 1.0 + r() * 0.7;
    const up = 1.0 + r() * 0.8;
    const tx = Math.cos(a) * out;
    const tz = Math.sin(a) * out;
    const ty = h + up;
    k.beam(0, h - 0.1, 0, tx, ty, tz, 0.09, bark, 0.09);
    tips.push([tx, ty, tz]);
    // twigs
    for (let j = 0; j < (look === 'winter' ? 3 : 1); j++) {
      const b = a + (r() - 0.5) * 1.4;
      k.beam(tx * 0.7, h + up * 0.7, tz * 0.7, tx + Math.cos(b) * 0.6, ty + 0.3 + r() * 0.4, tz + Math.sin(b) * 0.6, 0.035, bark, 0.035);
    }
  }
  if (look !== 'winter') {
    const thin = look === 'ruin';
    const leaf = (i: number) => tint(thin ? 0x7a6a3a : LEAF[i % LEAF.length]!, r, 0.12);
    // the crown: a few lumpy clusters round the limb tips and one in the middle
    const blobs: [number, number, number, number][] = [[0, h + 1.2, 0, 1.25]];
    for (const [x, y, z] of tips) blobs.push([x * 0.9, y, z * 0.9, 0.8 + r() * 0.35]);
    blobs.forEach(([x, y, z, s], i) => {
      if (thin && r() < 0.55) return;
      k.rock(s * (thin ? 0.7 : 1), x, y - s * 0.55, z, leaf(i), seed * 31 + i, 0.78);
    });
    if (!thin) {
      for (let i = 0; i < 9; i++) {
        const [x, y, z] = tips[i % tips.length]!;
        k.box(0.09, 0.09, 0.09, x * (0.7 + r() * 0.5) + (r() - 0.5) * 0.6, y - 0.4 - r() * 0.6, z * (0.7 + r() * 0.5) + (r() - 0.5) * 0.6, FRUIT[i % FRUIT.length]!);
      }
      // windfall apples under the tree
      for (let i = 0; i < 4; i++) k.box(0.08, 0.07, 0.08, (r() - 0.5) * 2.4, 0.0, (r() - 0.5) * 2.4, FRUIT[i % 2]!);
    }
  }
  k.pop();
}

/** A felled apple tree: the stump and the trunk sawn into lengths beside it. */
export function stump(k: Kit, seed: number): void {
  const r = rng(seed);
  const bark = tint(0x4a3a2c, r, 0.12);
  k.cyl(0.16, 0.2, 0.42, 0, -0.05, 0, bark, undefined, 7);
  k.cyl(0.155, 0.155, 0.02, 0, 0.37, 0, 0xc8a878, undefined, 7);
  if (r() < 0.6) {
    const a = r() * 6.28;
    for (let i = 0; i < 2; i++) k.cyl(0.13, 0.13, 0.9, Math.cos(a) * 1.2 + i * 0.3, 0.13, Math.sin(a) * 1.2, bark, [Math.PI / 2, a, 0], 7);
  }
  for (let i = 0; i < 4; i++) k.box(0.05, 0.02, 0.07, (r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2, C.strawDark);
}
