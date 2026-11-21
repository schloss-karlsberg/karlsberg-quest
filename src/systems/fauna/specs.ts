/**
 * Fauna contract v0: the provisional spec table (pure data, tests/fauna.test.ts). Each spec says
 * what an animal is (size, collision circle, eye height, gait speeds) and, for the stand-in build,
 * which rigged CC0 Quaternius animal wears it in which colours. The authored meshes keep the ids
 * and the numbers and replace `model` / `palette` / `paint` / `hideSlots` / `shape` with their own.
 *
 * Stand-ins: the dogs wear the wolf (`characters.creature.wolf`), the roe deer the horse
 * (`characters.creature.horse`), scaled to the spec's SHOULDER height and nose-to-rump length,
 * slimmed by `build`. Palettes are sRGB hex per material slot of the model; `paint` adds per-vertex
 * colour regions the slots cannot give (the roe's white rump patch, Diane's liver patches).
 */
import type { CharacterModel } from '../characters/catalog';
import type { AnimalInfo } from './types';

export type Species = 'deer' | 'dog';

/** A body region coloured per vertex (stand-in only): the vertex's dominant bone and its bind-pose place (fractions, see `PaintRule`). */
export interface PaintRule {
  /** sRGB colour of the region. */
  colour: number;
  /** Dominant bone names (exact) the vertex must have; omitted = any. */
  bones?: readonly string[];
  /** Material slots the rule applies to; omitted = any. */
  slots?: readonly string[];
  /**
   * Bind-pose box in body fractions: y as a fraction of the shoulder height (0 ground, 1 withers),
   * z from the rump (0) to the nose (1), |x| from the midline (0) to the widest flank (1).
   */
  y?: [number, number];
  z?: [number, number];
  ax?: [number, number];
  /** Procedural patches: the rule only where a smooth noise of the bind position is above this (0..1). */
  patches?: number;
  /** Noise scale of the patches (per metre of shoulder height). */
  patchScale?: number;
}

export interface FaunaSpec {
  id: string;
  /** Who this is (debug, docs; provisional). */
  label: string;
  species: Species;
  /** m, shoulder height (withers). */
  height: number;
  /** m, nose to rump. */
  length: number;
  /** m, collision circle. */
  radius: number;
  /** m, eye height when standing. */
  headHeight: number;
  /** m/s: the walk / run speeds the gaits are tuned to. */
  speeds: { walk: number; run: number };
  // ---- stand-in only
  model: CharacterModel;
  /** Width factor (x scale of the body; 1 = the model's own build). */
  build: number;
  /** sRGB per material slot of the model. */
  palette: Record<string, number>;
  /** Per-vertex colour regions over the palette (later rules win). */
  paint?: readonly PaintRule[];
  /** Material slots not drawn (the horse's mane and tail on a roe). */
  hideSlots?: readonly string[];
  /** Uniform bone scales (the mixer never writes scale): a smaller head, a shorter tail. */
  shape?: Readonly<Record<string, number>>;
  /** Eye glint colour (sRGB). */
  shine: number;
  /** Idle phase / timing (a spawn's own seed adds to it). */
  seed: number;
}

const WOLF: CharacterModel = 'characters.creature.wolf';
const HORSE: CharacterModel = 'characters.creature.horse';

// Roe deer, winter coat: grey-brown, a white rump patch („Spiegel“), a white throat patch, a black
// muzzle with a white chin. Horse slots: Main body, Hair mane + tail, Main_Dark the face front,
// Muzzle, Hooves, Main_Light round the eyes and inside the ears, Eye_Black, Eye_White.
const ROE_GREY = 0x6f665b;
function roe(coat: number, shade: number): Pick<FaunaSpec, 'palette' | 'paint' | 'hideSlots' | 'shape' | 'build' | 'shine'> {
  return {
    palette: { Main: coat, Main_Dark: shade, Main_Light: 0x9a9286, Muzzle: 0x16130f, Hooves: 0x2a2620, Eye_Black: 0x0c0a08, Eye_White: 0x2a2018, Hair: coat },
    paint: [
      // the white rump patch round the tail stump
      { colour: 0xece6da, slots: ['Main'], z: [0, 0.05], y: [0.55, 1.05] },
      { colour: 0xe4ddd0, slots: ['Main'], bones: ['Tail1'] },
      // a pale belly line and the white throat patch
      { colour: 0x8e867a, slots: ['Main'], y: [0, 0.6], z: [0.25, 0.7], ax: [0, 0.55] },
      { colour: 0xdcd6ca, slots: ['Main'], bones: ['Neck3'], y: [0, 1.04], ax: [0, 0.4] },
    ],
    // no mane, no horse tail: a roe has a stump (Tail1 stays, in the rump colour)
    hideSlots: ['Hair'],
    // a longer neck (the horse's is short for a grazing roe: the scale passes down the neck, so the
    // head and the ears, children of the neck, are scaled back), a smaller head, a shorter stump
    shape: { Neck1: 1.25, Head: 0.82 / 1.25, Ear1L: 1 / 1.25, Ear1R: 1 / 1.25, Tail1: 0.55 },
    build: 0.82,
    shine: 0xfff2d8,
  };
}

/** The v0 specs, in `specs()` order. */
export const FAUNA_SPECS: readonly FaunaSpec[] = [
  {
    id: 'reh.ricke',
    label: 'roe doe (Ricke), grey winter coat, white rump patch',
    species: 'deer',
    height: 0.75,
    length: 1.15,
    radius: 0.35,
    headHeight: 0.95,
    speeds: { walk: 1.2, run: 8 },
    model: HORSE,
    ...roe(ROE_GREY, 0x5a5248),
    seed: 211,
  },
  {
    id: 'reh.kitz',
    label: 'roe fawn (Kitz), grey winter coat, NO spots, nearly the doe’s size',
    species: 'deer',
    height: 0.68,
    length: 1.05,
    radius: 0.32,
    headHeight: 0.86,
    speeds: { walk: 1.2, run: 8 },
    model: HORSE,
    ...roe(0x766c60, 0x60574c),
    seed: 223,
  },
  {
    id: 'dog.diane',
    label: 'Diane, the leader: a lean medium-large hunting dog, liver brown and white',
    species: 'dog',
    height: 0.58,
    length: 0.95,
    radius: 0.3,
    headHeight: 0.62,
    speeds: { walk: 1.4, run: 7 },
    model: WOLF,
    build: 0.84,
    // wolf slots: Main the upper body, Main_Light the belly / chest / throat / muzzle / under the tail
    palette: { Main: 0xe9e3d8, Main_Light: 0xefe9de, Eyes_Black: 0x1c120c, Nose: 0x3e241a },
    paint: [
      // white with liver patches and a liver head and ears (a pointer's coat)
      { colour: 0x5b3322, slots: ['Main'], patches: 0.56, patchScale: 2.6 },
      { colour: 0x5b3322, slots: ['Main'], bones: ['Head', 'Neck3', 'Ear1L', 'Ear2L', 'Ear3L', 'Ear4L', 'Ear1R', 'Ear2R', 'Ear3R', 'Ear4R'] },
      { colour: 0x5b3322, slots: ['Main_Light'], bones: ['Head'], y: [0.98, 2] },
      // a liver saddle over the back
      { colour: 0x5b3322, slots: ['Main'], y: [0.9, 2], z: [0.25, 0.62] },
    ],
    // a thin pointer's tail, a slimmer head
    shape: { Tail1: 0.62, Head: 0.92 },
    shine: 0xffe6b8,
    seed: 233,
  },
  {
    id: 'dog.bijou',
    label: 'Bijou: small, tan / wheaten, thinks he is a stag',
    species: 'dog',
    height: 0.32,
    length: 0.55,
    radius: 0.2,
    headHeight: 0.36,
    speeds: { walk: 1.2, run: 5 },
    model: WOLF,
    build: 0.95,
    palette: { Main: 0xc39a62, Main_Light: 0xe6d3ae, Eyes_Black: 0x140e0a, Nose: 0x141010 },
    paint: [{ colour: 0xa9814e, slots: ['Main'], y: [0.85, 2], z: [0.15, 0.7] }],
    shape: { Tail1: 0.8, Head: 1.04 },
    shine: 0xffeccc,
    seed: 241,
  },
];

/** The generic dog an unknown spec id gets. */
export const GENERIC_DOG: FaunaSpec = {
  id: 'dog',
  label: 'generic dog (unknown spec id)',
  species: 'dog',
  height: 0.5,
  length: 0.85,
  radius: 0.28,
  headHeight: 0.54,
  speeds: { walk: 1.3, run: 6 },
  model: WOLF,
  build: 0.9,
  palette: { Main: 0x6e6257, Main_Light: 0xb5aa98, Eyes_Black: 0x140e0a, Nose: 0x161210 },
  shape: { Tail1: 0.8 },
  shine: 0xffe6c0,
  seed: 251,
};

const BY_ID = new Map(FAUNA_SPECS.map((s) => [s.id, s]));

/** Known spec ids, in table order. */
export const FAUNA_SPEC_IDS: readonly string[] = FAUNA_SPECS.map((s) => s.id);

/** The spec of an id; unknown ids get the generic dog (`known: false`, the caller warns). */
export function resolveFaunaSpec(id: string): { spec: FaunaSpec; known: boolean } {
  const s = BY_ID.get(id);
  return s ? { spec: s, known: true } : { spec: GENERIC_DOG, known: false };
}

/** The contract numbers of a spec (`AnimalInfo` without `specId` / `clips`). */
export function specNumbers(s: FaunaSpec): Omit<AnimalInfo, 'specId' | 'clips'> {
  return { length: s.length, height: s.height, radius: s.radius, headHeight: s.headHeight, speeds: { walk: s.speeds.walk, run: s.speeds.run } };
}

// ---- stand-in colour (pure: tests/fauna.test.ts) -----------------------------------------------

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** One octave of 3-D value noise in 0..1 (trilinear over hashed lattice values, smoothstep fade). */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const h = (i: number, j: number, k: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.19) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  const row = (dy: number, dz: number) => mix(h(xi, yi + dy, zi + dz), h(xi + 1, yi + dy, zi + dz), u);
  return mix(mix(row(0, 0), row(1, 0), v), mix(row(0, 1), row(1, 1), v), w);
}

/** Smooth 3-D value noise in 0..1 (stand-in coat patches; deterministic): a coarse and a finer octave. */
export function patchNoise(x: number, y: number, z: number, seed = 0): number {
  return 0.65 * valueNoise(x, y, z, seed) + 0.35 * valueNoise(x * 2.3 + 5.1, y * 2.3 + 1.7, z * 2.3 + 9.3, seed);
}

/** A vertex for the painter: its slot, dominant bone, and bind-pose place in body fractions (see `PaintRule`). */
export interface PaintVertex {
  slot: string;
  bone: string;
  /** Fraction of the shoulder height. */
  fy: number;
  /** 0 rump … 1 nose. */
  fz: number;
  /** |x| / the widest flank. */
  ax: number;
  /** Bind position in shoulder heights (noise input). */
  px: number;
  py: number;
  pz: number;
}

const inside = (v: number, r?: [number, number]) => !r || (v >= r[0] && v <= r[1]);

/** The sRGB colour the painter gives a vertex: the last matching rule, else the slot's palette colour (null: the model's own). */
export function paintColour(spec: FaunaSpec, v: PaintVertex): number | null {
  let c: number | null = spec.palette[v.slot] ?? null;
  for (const r of spec.paint ?? []) {
    if (r.slots && !r.slots.includes(v.slot)) continue;
    if (r.bones && !r.bones.includes(v.bone)) continue;
    if (!inside(v.fy, r.y) || !inside(v.fz, r.z) || !inside(v.ax, r.ax)) continue;
    if (r.patches !== undefined) {
      const k = r.patchScale ?? 2;
      // mirrored across the midline (patches on both flanks alike are less noisy), offset per spec
      if (patchNoise(Math.abs(v.px) * k, v.py * k, v.pz * k, spec.seed) < r.patches) continue;
    }
    c = r.colour;
  }
  return c;
}
