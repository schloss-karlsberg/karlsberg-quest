/**
 * Which rigged CC0 model (src/assets/manifests/characters.ts) stands in for which ghost NPC and
 * which spectral enemy, and the period costume colours laid over the model's material slots.
 * Pure data (no three.js), unit-tested in tests/characters.test.ts.
 *
 * The models are Quaternius' stylized low-poly humans and animals (CC0). Their own colours are
 * modern (a green adventurer's tunic, a farmer's blue overalls); the ghost shader replaces them by
 * slot with 18th-century cloth: Prussian-blue justaucorps over a cream waistcoat, hunting green
 * with a yellow waistcoat, buff breeches, linen, a russet maid's dress (docs/ART-DIRECTION.md §6).
 */
import type { NpcLook, Outfit } from '../npc/roster';

export type CharacterModel = 'characters.human.adventurer' | 'characters.human.farmer' | 'characters.human.woman' | 'characters.creature.wolf' | 'characters.creature.horse';

/** Material (slot) name → sRGB colour; `mesh:<name>` keys win over the material name. */
export type Costume = Record<string, number>;

/** Model meshes that never show on a ghost NPC (the adventurer's modern backpack). */
export const HIDDEN_MESHES: Partial<Record<CharacterModel, RegExp>> = {
  'characters.human.adventurer': /^Backpack/,
};

const SKIN = 0xd9b89a;
const LINEN = 0xe9e2d0;

/**
 * Costume per outfit (slots of the model the outfit uses, see `modelFor`). The models are modern
 * cuts: the adventurer's arms are bare (`mesh:Adventurer_Body_3`: arms and hands), the woman wears a
 * sleeveless knee-length dress (`mesh:Formal_Body_1`: shoulders, arms and hands; `mesh:Formal_Legs_1`
 * and `mesh:Formal_Feet_1`: bare legs). A coat's sleeves, a fichu with linen sleeves and stockings
 * are laid over those meshes by colour, which a solid figure shows plainly (TASK-092).
 */
export const COSTUMES: Record<Outfit, Costume> = {
  // Kanzlist: Prussian-blue justaucorps, cream waistcoat, black breeches, white stockings, wig
  official: { Green: 0x33477a, LightGreen: 0x3d5488, 'mesh:Adventurer_Body_3': 0x33477a, Brown2: 0x27211d, Brown: 0x2e2722, Black: 0x17130f, Grey: 0x9a8a5c, Hair: 0xece6da, Gold: 0xc9a240, Skin: SKIN, Eyebrows: 0x8a8070 },
  // hunting livery: forest green coat, yellow waistcoat, buff breeches, riding boots
  livery: { Green: 0x2a4428, LightGreen: 0x34532f, 'mesh:Adventurer_Body_3': 0x2a4428, Brown2: 0xd6c7a4, Brown: 0x2a1d14, Black: 0x1a1410, Grey: 0x3a2c20, Hair: 0x5a4632, Gold: 0xc9a240, Skin: SKIN },
  // mason: linen shirt, leather apron-brown, grey breeches
  mason: { Green: 0xb3a88f, LightGreen: 0x9d927c, Brown2: 0x4e4438, Brown: 0x5a4636, Black: 0x241b14, Grey: 0x3a3028, Hair: 0x3a2a1e, Gold: 0x8a7650, Skin: SKIN },
  // carter / gardener / villager on the farmer model: linen shirt, brown waistcoat and breeches,
  // a dark felt slouch hat with a red band
  carter: { Brown2: 0x2a1d14, Brown: 0x5b4330, LightBlue: 0x6b5a42, Beige: 0xd6c9a8, 'mesh:Farmer_Head_2': 0x3a3028, Red: 0x7a2a1e, Skin: SKIN, Eyebrows: 0x5a4030 },
  // maid on the woman model: russet dress, linen fichu and sleeves, white stockings, brown hair, dark shoes
  maid: { LimeGreen: 0x8a4b32, Gold: 0xefe6d2, 'mesh:Formal_Body_1': LINEN, 'mesh:Formal_Legs_1': LINEN, 'mesh:Formal_Feet_1': LINEN, 'mesh:Formad_Head_2': 0x6b4a2e, 'mesh:Formal_Feet_2': 0x3a2a20, Red: 0x6b4a2e, Brown: 0x3a2a20, Skin: SKIN },
};

/** Per-NPC accents over the outfit (a gardener in green, a servant with a powdered wig). */
const ACCENTS: Record<string, Costume> = {
  // Marlene today: the palette of her party stand-in (people spec extra.7; tests/npc-look.test.ts keeps them equal)
  marlene: { Brown: 0x5a6a3a, LightBlue: 0x6a6a6a, Beige: 0xd0c8b4, 'mesh:Farmer_Head_2': 0x23304a, Red: 0x26241f, Brown2: 0x2a2420, Eyebrows: 0x4a3a2c },
  gaertner: { LightBlue: 0x4f5e3a, Brown: 0x5e4a2e },
  diener: { Hair: 0xece6da, Green: 0x5e1c1f, LightGreen: 0x6a1f22, 'mesh:Adventurer_Body_3': 0x5e1c1f },
  pikeur: { Hair: 0x4a3a2a },
  peter: { LightBlue: 0x4a4e5a },
  mann: { LightBlue: 0x5e5240, Beige: 0xc9bea2 },
};

/** The model a ghost NPC wears. */
export function modelFor(look: Pick<NpcLook, 'outfit'>): CharacterModel {
  if (look.outfit === 'maid') return 'characters.human.woman';
  if (look.outfit === 'carter') return 'characters.human.farmer';
  return 'characters.human.adventurer';
}

/** Costume colours for a ghost NPC (outfit + per-NPC accent). */
export function costumeFor(look: Pick<NpcLook, 'id' | 'outfit'>): Costume {
  return { ...COSTUMES[look.outfit], ...(ACCENTS[look.id] ?? {}) };
}

/** Colour of a slot (mesh name beats material name), or null to keep the model's own. */
export function slotColour(c: Costume, meshName: string, materialName: string): number | null {
  return c[`mesh:${meshName}`] ?? c[materialName] ?? null;
}

/** The farmer model brings its own slouch hat; every other headwear is built on the head bone. */
export function builtInHat(model: CharacterModel, hat: NpcLook['hat']): boolean {
  return model === 'characters.human.farmer' && hat === 'slouch';
}

/**
 * Enemies drawn as a rigged model (the rest stay procedural, bodies.ts). `height`: model height
 * (m) at size 1; `keep`: which template parts still draw on top (eyes come from the model).
 */
export interface EnemyRig {
  model: CharacterModel;
  height: number;
  /** Clips for the AI states. */
  idle: string;
  walk: string;
  run: string;
  attack: string;
  /** Fraction of the attack clip that is wind-up (held during the telegraph). */
  attackWindup: number;
  hit: string;
  death: string;
  /** Speed (m/s) at which the walk clip looks right; above ~2× it the run clip takes over. */
  walkSpeed: number;
  runSpeed: number;
  /** Smoke albedo (linear), family glow (linear), the heart's place (fraction of the height up,
   *  metres forward at size 1) and its radius (m). */
  body: [number, number, number];
  core: [number, number, number];
  coreY: number;
  coreF: number;
  coreR: number;
  /** Eye glow colour and size (m). */
  eye: [number, number, number];
  eyeSize: number;
}

const HOUND: EnemyRig = {
  model: 'characters.creature.wolf',
  height: 0.98,
  idle: 'Idle',
  walk: 'Walk',
  run: 'Gallop',
  attack: 'Attack',
  attackWindup: 0.32,
  hit: 'Idle_HitReact_Left',
  death: 'Death',
  walkSpeed: 1.5,
  runSpeed: 5,
  body: [0.03, 0.028, 0.036],
  core: [1, 0.36, 0.07],
  coreY: 0.58,
  coreF: 0.22,
  coreR: 0.085,
  eye: [1, 0.5, 0.12],
  eyeSize: 0.06,
};

export const ENEMY_RIGS: Record<string, EnemyRig> = {
  streuner: HOUND,
  raffschatten: {
    model: 'characters.human.adventurer',
    height: 1.9,
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    attack: 'Sword_Slash',
    attackWindup: 0.38,
    hit: 'HitRecieve',
    death: 'Death',
    walkSpeed: 1.4,
    runSpeed: 4,
    body: [0.028, 0.025, 0.026],
    core: [1, 0.7, 0.22],
    coreY: 0.66,
    coreF: 0.06,
    coreR: 0.16,
    eye: [1, 0.72, 0.3],
    eyeSize: 0.045,
  },
};

/** The Pikeur's horse, his two hounds and the rider seated on the horse (creature pass 2026-11). */
export const PIKEUR_RIG = {
  horse: {
    ...HOUND,
    model: 'characters.creature.horse' as CharacterModel,
    height: 3.05,
    attack: 'Attack_Kick',
    attackWindup: 0.3,
    walkSpeed: 1.6,
    runSpeed: 6,
    body: [0.03, 0.032, 0.042] as [number, number, number],
    core: [0.35, 0.6, 1] as [number, number, number],
    coreY: 0.5,
    coreF: 0.75,
    coreR: 0.32,
    eyeSize: 0.1,
  } satisfies EnemyRig,
  hound: HOUND,
  /**
   * The rider: the CC0 human rig in the saddle (legs bent over the horse's flanks after the mixer,
   * see combat/rigged.ts); the whip is the sword slash, his hat a tricorn of solids on his head.
   */
  rider: {
    model: 'characters.human.adventurer' as CharacterModel,
    height: 1.9,
    idle: 'Idle',
    walk: 'Idle',
    run: 'Idle',
    attack: 'Sword_Slash',
    attackWindup: 0.38,
    hit: 'HitRecieve',
    death: 'Death',
    walkSpeed: 1.6,
    runSpeed: 6,
    body: [0.025, 0.025, 0.032] as [number, number, number],
    core: [0.35, 0.6, 1] as [number, number, number],
    coreY: 0.66,
    coreF: 0.06,
    coreR: 0.12,
    eye: [1, 0.62, 0.18] as [number, number, number],
    eyeSize: 0.05,
  } satisfies EnemyRig,
  /** The saddle: the horse bone the rider sits on, and how far his hips sink below it (m at size 1). */
  saddleBone: 'Torso',
  saddleDrop: 0.55,
  /** Hounds at heel: right / forward offsets (m) at size 1.12 (the template's scale). */
  hounds: [
    [-1.55 * 1.12, -0.5 * 1.12],
    [1.55 * 1.12, -0.5 * 1.12],
  ] as [number, number][],
};

/** The rigged look of an enemy kind, or null (procedural body). */
export function enemyRig(kind: string): EnemyRig | null {
  if (kind === 'pikeur') return PIKEUR_RIG.horse;
  return ENEMY_RIGS[kind] ?? null;
}

/** Every model an enemy kind needs. */
export function enemyModels(kind: string): CharacterModel[] {
  if (kind === 'pikeur') return [PIKEUR_RIG.horse.model, PIKEUR_RIG.hound.model, PIKEUR_RIG.rider.model];
  const r = ENEMY_RIGS[kind];
  return r ? [r.model] : [];
}
