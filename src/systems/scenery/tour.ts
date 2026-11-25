import { face, type SetBuilder } from './builder';
import { C } from './props';
import type { SetDef } from './sets';

function bench(b: SetBuilder, x: number, z: number, deg: number): void {
  const k = b.kit;
  b.at(x, z, deg, 0.55);
  for (const side of [-1, 1]) {
    k.box(0.23, 0.62, 0.43, side * 0.64, -0.18, 0, C.sandstonePale);
    k.box(0.075, 0.43, 0.08, side * 0.64, 0.43, -0.21, C.woodDark, [-0.12, 0, 0]);
  }
  k.box(1.78, 0.075, 0.22, 0, 0.44, 0.12, C.woodGrey);
  k.box(1.78, 0.075, 0.19, 0, 0.44, -0.11, C.woodGrey);
  k.box(1.78, 0.22, 0.06, 0, 0.65, -0.23, C.woodGrey, [-0.12, 0, 0]);
  b.box(x, z, deg, 0.89, 0.29);
}

function wayfinder(b: SetBuilder, x: number, z: number, deg: number, text: string): void {
  const y = b.at(x, z, deg, 0.35);
  const yaw = face(deg);
  const k = b.kit;
  k.box(0.14, 1.58, 0.14, 0, -0.16, -0.11, C.woodDark);
  k.box(1.42, 0.58, 0.09, 0, 0.88, 0, C.woodGrey);
  k.box(1.5, 0.055, 0.17, 0, 1.46, -0.02, C.woodDark);
  b.sign(x + Math.sin(yaw) * 0.047, y + 1.17, z + Math.cos(yaw) * 0.047, deg, 1.35, 0.51, { text, style: 'plate' });
  b.box(x, z, deg, 0.75, 0.18);
}

/** Fictional fittings on the present-day tour, paired with the shipped route's real place names. */
export const TOUR_STOP_SETS: readonly SetDef[] = [
  {
    id: 'tour-karlsberger-hof', eras: ['today'], x: 518, z: -775, range: 45,
    keepFree: [[524, -770, 7], [529, -777, 2]],
    build(b) {
      wayfinder(b, 515.3, -775.4, 66, 'Karlsberger Hof\nFelsenpfad →');
      bench(b, 519, -777.5, 55);
    },
  },
  {
    id: 'tour-felsenpfad', eras: ['today'], x: 689, z: -595, range: 45,
    keepFree: [[682.9, -596.1, 3]],
    build(b) {
      wayfinder(b, 687.8, -593.9, 242, 'Felsenpfad');
      for (const [x, z, size, color, seed] of [
        [688.7, -595.4, 0.46, C.sandstone, 61],
        [689.7, -595.5, 0.64, C.sandstoneRed, 62],
        [690.6, -595.1, 0.35, C.sandstonePale, 63],
      ] as const) {
        b.at(x, z, 0, 0);
        b.kit.rock(size, 0, size * 0.15, 0, color, seed, 0.64);
        b.circle(x, z, size * 1.18);
      }
    },
  },
  {
    id: 'tour-weiher', eras: ['today'], x: 898, z: -850, range: 45,
    keepFree: [[897.2, -845.3, 3]],
    build(b) {
      bench(b, 896.3, -850.3, 20);
      wayfinder(b, 903.1, -850.3, 235, 'Karlsbergweiher\nKarlsbergquelle →');
    },
  },
];
