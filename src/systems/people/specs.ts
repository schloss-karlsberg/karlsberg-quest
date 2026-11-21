/**
 * People contract v0: the provisional spec table (pure data, tests/people.test.ts). Each spec says
 * who a person is (tier, height, capsule radius, default look) and, for the stand-in build, which
 * rigged CC0 Quaternius human wears it in which colours. The authored meshes will keep the ids,
 * tiers, heights and radii and replace `model` / `palette` / `hide` with their own assets.
 *
 * Palettes are sRGB hex per material slot of the stand-in model (`mesh:<name>` keys win, like the
 * NPC costumes in characters/catalog.ts; `pack` colours the adventurer's backpack). Modern-ish
 * clothes: the guide in a dark jacket, the doubles and extras in everyday colours. The historical
 * twins wear the roster's period costume (catalog `costumeFor`).
 *
 * Authored bodies: a spec with `authored` draws its MPFB build (scripts/chars/mpfb/specs/<id>.json,
 * packed into public/assets/models/chars/) with the shared palette material (./authored.ts); its
 * stand-in fields stay for the capsule fallback colour. Today: the guide. `PEOPLE_AUTHORED_DEFAULT` and
 * `?people=authored|standin` switch the authored bodies on or off for the whole session.
 */
import { type CharacterModel, type Costume, costumeFor } from '../characters/catalog';
import { lookFor } from '../npc/roster';
import type { BudgetTier, PersonLook } from './types';

/** Asset ids of the authored people GLBs (src/assets/manifests/chars-mpfb.ts). */
export type AuthoredModel = 'chars.people.guide';

/** Any body a person can load: a stand-in Quaternius human or an authored MPFB build. */
export type PersonModel = CharacterModel | AuthoredModel;

/** The authored body of a spec (scripts/chars/mpfb): the packed GLB and its ghost-look colour. */
export interface AuthoredBody {
  model: AuthoredModel;
  /** Ghost look: the cloth colour (sRGB) the ghost shader lays over the body (its `top` palette slot). */
  cloth: number;
}

/**
 * Authored bodies on or off, the one line to flip: on, a spec with `authored` draws its MPFB build;
 * off, every person keeps its stand-in (the authored guide is then opt-in by URL). The URL wins over it
 * (`authoredBodiesOn`). Off for now: the authored guide is opt-in (`?people=authored`) until his look
 * passes review.
 */
export const PEOPLE_AUTHORED_DEFAULT = false;

/**
 * Are authored bodies drawn? `?people=authored` forces them, `?people=standin` forces the stand-ins;
 * without the parameter `fallback` (PEOPLE_AUTHORED_DEFAULT) decides. Read once at people init.
 */
export function authoredBodiesOn(params: URLSearchParams, fallback: boolean = PEOPLE_AUTHORED_DEFAULT): boolean {
  const v = params.get('people');
  if (v === 'authored') return true;
  if (v === 'standin') return false;
  return fallback;
}

export interface PersonSpec {
  id: string;
  /** Who this is (debug, docs; provisional). */
  label: string;
  tier: BudgetTier;
  /** m, standing. */
  height: number;
  /** m, collision capsule radius. */
  radius: number;
  /** Look when spawned without one. */
  look: PersonLook;
  /** The authored MPFB body (replaces the stand-in model; see ./authored.ts). */
  authored?: AuthoredBody;
  // ---- stand-in only
  model: CharacterModel;
  /** Width factor (x / z scale of the body; 1 = the model's own build). */
  build: number;
  palette: Costume;
  /** Backpack colours (adventurer); without it the backpack is not drawn. */
  pack?: Costume;
  /** Material slots not drawn (the guide's hair). */
  hideSlots?: readonly string[];
  /** Ghost look: the light inside the figure (sRGB). */
  tint: number;
  /** Idle phase / gesture timing (a spawn's own seed adds to it). */
  seed: number;
}

const SKIN = 0xd9b89a;
const SKIN_PALE = 0xe6c8b0;
const SKIN_DARK = 0x9a6a4a;
const GHOST_TINT = 0xd8d2c4;

const ADV: CharacterModel = 'characters.human.adventurer';
const FARMER: CharacterModel = 'characters.human.farmer';
const WOMAN: CharacterModel = 'characters.human.woman';

/** Adventurer slots: Green / LightGreen jacket, Brown trousers, Brown2 belt, Grey shoe upper, Black sole, Hair, Eyebrows, Gold buckles. */
function adv(jacket: number, trim: number, trousers: number, shoes: number, hair: number, skin = SKIN, sole = 0x1c1a18): Costume {
  return { Green: jacket, LightGreen: trim, Brown: trousers, Brown2: 0x1e1c1a, Grey: shoes, Black: sole, Hair: hair, Eyebrows: hair, Skin: skin, Gold: 0xb8b8b8 };
}

/** Farmer slots: Brown shirt / jacket, LightBlue trousers, Beige collar, `mesh:Farmer_Head_2` the hat, Red its band, Brown2 shoes. */
function farmer(top: number, trousers: number, hat: number, collar: number, skin = SKIN): Costume {
  return { Brown: top, LightBlue: trousers, Beige: collar, 'mesh:Farmer_Head_2': hat, Red: 0x26241f, Brown2: 0x2a2420, Skin: skin, Eyebrows: 0x4a3a2c };
}

/** Woman slots: LimeGreen dress, Gold trim, Red + `mesh:Formad_Head_2` hair, `mesh:Formal_Feet_2` shoes. */
function woman(dress: number, trim: number, hair: number, shoes: number, skin = SKIN): Costume {
  return { LimeGreen: dress, Gold: trim, Red: hair, 'mesh:Formad_Head_2': hair, 'mesh:Formal_Feet_2': shoes, Brown: 0x3a2a20, Skin: skin };
}

const herzog = lookFor('herzog');
const mannlich = lookFor('mannlich');

/** The v0 specs, in `specs()` order. */
export const PERSON_SPECS: readonly PersonSpec[] = [
  {
    id: 'guide',
    label: 'Gerold Imhoff (placeholder guide): big, skinny, bald, forest-green softshell, mustard lanyard',
    tier: 'featured',
    height: 1.95,
    radius: 0.3,
    look: 'solid',
    authored: { model: 'chars.people.guide', cloth: 0x3e6a4c },
    model: ADV,
    build: 0.86,
    palette: adv(0x22262d, 0x2c3139, 0x3b3d40, 0x2a2622, 0x6b5a48, SKIN_PALE),
    hideSlots: ['Hair'],
    tint: GHOST_TINT,
    seed: 101,
  },
  // modern doubles of the story's people (heights from the roster where it has them)
  { id: 'double.herzog', label: "the Duke's double: navy blazer, chinos", tier: 'featured', height: herzog.height, radius: 0.3, look: 'solid', model: ADV, build: 1.08, palette: adv(0x1f2a44, 0x2a3757, 0xb9a888, 0x3a2a1e, 0x8a8a86), tint: GHOST_TINT, seed: 111 },
  { id: 'double.mannlich', label: "Mannlich's double: rust corduroy jacket, jeans, white sneakers", tier: 'featured', height: mannlich.height, radius: 0.3, look: 'solid', model: ADV, build: 0.94, palette: adv(0x8a4a2e, 0x9a5636, 0x3c4e6e, 0xe8e6e0, 0xd8d4cc, SKIN, 0xcfcfcf), tint: GHOST_TINT, seed: 113 },
  { id: 'double.hanne', label: "Hanne's double: denim-blue dress", tier: 'featured', height: lookFor('hanne').height, radius: 0.3, look: 'solid', model: WOMAN, build: 1, palette: woman(0x4f6385, 0xefe9dc, 0x6b4a2e, 0x2b2b2b), tint: GHOST_TINT, seed: 117 },
  { id: 'double.peter', label: "Peter's double: red flannel shirt, jeans, olive bucket hat", tier: 'featured', height: lookFor('peter').height, radius: 0.3, look: 'solid', model: FARMER, build: 1, palette: farmer(0x8c2f2a, 0x34465e, 0x4a5a3a, 0xd8cfb8), tint: GHOST_TINT, seed: 119 },
  { id: 'double.jost', label: "Jost's double: a teenager in a maroon hoodie", tier: 'featured', height: lookFor('jost').height, radius: 0.3, look: 'solid', model: ADV, build: 0.92, palette: adv(0x7a2f3a, 0x8a3a46, 0x2f3b52, 0xe8e8e8, 0x5a4632, SKIN, 0x2a2a2a), tint: GHOST_TINT, seed: 123 },
  { id: 'double.soll', label: "Soll's double: grey suit", tier: 'featured', height: lookFor('soll').height, radius: 0.3, look: 'solid', model: ADV, build: 0.96, palette: adv(0x5a5e66, 0x666a72, 0x50545c, 0x1a1a1a, 0x3a3a3a), tint: GHOST_TINT, seed: 127 },
  { id: 'double.liese', label: "Liese's double: teal dress, blonde", tier: 'featured', height: 1.66, radius: 0.3, look: 'solid', model: WOMAN, build: 1, palette: woman(0x2f6e5e, 0xf2ead8, 0xc9a46a, 0x6a3a2a), tint: GHOST_TINT, seed: 131 },
  {
    id: 'child.compass',
    label: 'the child with the compass: yellow raincoat, blue backpack',
    tier: 'featured',
    height: 1.25,
    radius: 0.22,
    look: 'solid',
    model: ADV,
    build: 1.05,
    palette: adv(0xd9a23a, 0xe0ad48, 0x3c4e6e, 0xc03a2a, 0x8a5a32),
    pack: { Brown: 0x23406a, Green: 0x2a4a7a, LightGreen: 0x3a6aa0, Gold: 0xd8d8d8 },
    tint: GHOST_TINT,
    seed: 137,
  },
  // tour members (extras)
  { id: 'extra.1', label: 'tour member: red windbreaker, jeans', tier: 'extra', height: 1.8, radius: 0.28, look: 'solid', model: ADV, build: 1, palette: adv(0xa8322a, 0xb53a30, 0x34465e, 0x3a3a3a, 0x3a2a1e), tint: GHOST_TINT, seed: 141 },
  { id: 'extra.2', label: 'tour member: plum dress', tier: 'extra', height: 1.64, radius: 0.28, look: 'solid', model: WOMAN, build: 1, palette: woman(0x6a3a5e, 0xe8e2d6, 0x2a201a, 0x1e1e1e, SKIN_DARK), tint: GHOST_TINT, seed: 143 },
  { id: 'extra.3', label: 'tour member: beige shirt, jeans, khaki hat', tier: 'extra', height: 1.74, radius: 0.28, look: 'solid', model: FARMER, build: 1, palette: farmer(0xcdbf9e, 0x3a4a62, 0x8a7a56, 0xe8e0cc), tint: GHOST_TINT, seed: 147 },
  { id: 'extra.4', label: 'tour member: light grey hoodie, black trousers', tier: 'extra', height: 1.72, radius: 0.28, look: 'solid', model: ADV, build: 0.95, palette: adv(0xb8bcc2, 0xc4c8ce, 0x222428, 0xdedede, 0x1e1a16, SKIN_DARK, 0x2a2a2a), tint: GHOST_TINT, seed: 151 },
  { id: 'extra.5', label: 'tour member: navy dress, blonde', tier: 'extra', height: 1.7, radius: 0.28, look: 'solid', model: WOMAN, build: 1, palette: woman(0x2a3a5e, 0xe6e0d2, 0xd2b27a, 0x5a3a2a, SKIN_PALE), tint: GHOST_TINT, seed: 153 },
  {
    id: 'extra.6',
    label: 'tour member: hiker, orange jacket, green backpack',
    tier: 'extra',
    height: 1.84,
    radius: 0.28,
    look: 'solid',
    model: ADV,
    build: 1.04,
    palette: adv(0xd2662a, 0xdc7436, 0x4a4a42, 0x5a4a3a, 0x8a6a4a),
    pack: { Brown: 0x2a3424, Green: 0x3a4a2e, LightGreen: 0x4a5e3a, Gold: 0xa8a8a8 },
    tint: GHOST_TINT,
    seed: 157,
  },
  { id: 'extra.7', label: 'tour member: olive jacket, grey trousers, navy cap', tier: 'extra', height: 1.68, radius: 0.28, look: 'solid', model: FARMER, build: 1, palette: farmer(0x5a6a3a, 0x6a6a6a, 0x23304a, 0xd0c8b4), tint: GHOST_TINT, seed: 161 },
  // the historical twins (real people, docs/ART-DIRECTION.md §21): the roster's period costume, a ghost by default
  { id: 'twin.herzog', label: 'Herzog Karl II. August (historical twin)', tier: 'featured', height: herzog.height, radius: 0.3, look: 'ghost', model: ADV, build: 1.08, palette: costumeFor(herzog), tint: herzog.tint, seed: herzog.seed },
  { id: 'twin.mannlich', label: 'Johann Christian von Mannlich (historical twin)', tier: 'featured', height: mannlich.height, radius: 0.3, look: 'ghost', model: ADV, build: 0.94, palette: costumeFor(mannlich), tint: mannlich.tint, seed: mannlich.seed },
];

/** The generic extra an unknown spec id gets. */
export const GENERIC_EXTRA: PersonSpec = {
  id: 'extra',
  label: 'generic extra (unknown spec id)',
  tier: 'extra',
  height: 1.75,
  radius: 0.28,
  look: 'solid',
  model: ADV,
  build: 1,
  palette: adv(0x5e6670, 0x68707a, 0x3a3e46, 0x3a3a3a, 0x4a3a2a),
  tint: GHOST_TINT,
  seed: 171,
};

const BY_ID = new Map(PERSON_SPECS.map((s) => [s.id, s]));

/** Known spec ids, in table order. */
export const SPEC_IDS: readonly string[] = PERSON_SPECS.map((s) => s.id);

/** The spec of an id; unknown ids get the generic extra (`known: false`, the caller warns). */
export function resolveSpec(id: string): { spec: PersonSpec; known: boolean } {
  const s = BY_ID.get(id);
  return s ? { spec: s, known: true } : { spec: GENERIC_EXTRA, known: false };
}

/** Stand-in colour of a model slot: backpack meshes take `pack`, `mesh:<name>` beats the material name; null keeps the model's own. */
export function standinColour(spec: PersonSpec, meshName: string, materialName: string): number | null {
  if (/^Backpack/.test(meshName)) return spec.pack?.[materialName] ?? null;
  return spec.palette[`mesh:${meshName}`] ?? spec.palette[materialName] ?? null;
}

/** Is this model part drawn for the spec? (the backpack only with `pack`, hidden slots never) */
export function standinShows(spec: PersonSpec, meshName: string, materialName: string): boolean {
  if (/^Backpack/.test(meshName)) return !!spec.pack;
  return !spec.hideSlots?.includes(materialName);
}
