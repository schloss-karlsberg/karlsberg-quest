/**
 * The player character's costumes and lantern tint as pure data (no three.js), so the tables are
 * unit-testable without WebGL (tests/avatar-costume.test.ts). The avatar (avatar.ts) lays them over
 * the model's material slots.
 *
 * Slot keys: a material name of the Quaternius adventurer (`Green`, `LightGreen`, `Skin`, `Hair`,
 * `Brown`, `Brown2`, `Black`, `Grey`, `Gold`, `Eyebrows`, `Eye`), optionally prefixed with the model
 * part it sits on (`Backpack.LightGreen`), which wins over the bare slot. Parts: `Body`, `Head`,
 * `Legs`, `Feet`, `Backpack`.
 */

export type Costume = 'default' | 'court';

export const COSTUME_IDS: readonly Costume[] = ['default', 'court'];

/** Slot (or `Part.Slot`) → sRGB colour. */
export type CostumeColours = Readonly<Record<string, number>>;

/** Surveyor's costume over the model's material slots (sRGB). */
export const SURVEYOR_COSTUME: Record<string, number> = {
  // field jacket (olive), hi-vis vest panels (orange), skin, hair
  Green: 0x4b5534,
  LightGreen: 0xe0661c,
  Skin: 0xd6ad8c,
  Hair: 0x4a3324,
  Eyebrows: 0x3a2a1e,
  // cargo trousers, belt / straps
  Brown: 0x3a3631,
  Brown2: 0x2b2824,
  // boots and soles
  Black: 0x1f1b17,
  Grey: 0x5b5148,
  // backpack buckles
  Gold: 0xa98b45,
};

/**
 * The court disguise (story): a plain 1780s secretary. Dark-blue coat, cream waistcoat, black
 * breeches, black shoes; no hi-vis, no emissive, no backpack, no staff on the back.
 */
export const COURT_COSTUME: Record<string, number> = {
  Green: 0x1f2b48,
  LightGreen: 0xe6dcc3,
  Skin: 0xd6ad8c,
  Hair: 0x4a3324,
  Eyebrows: 0x3a2a1e,
  Brown: 0x1d1b1c,
  Brown2: 0x262325,
  Black: 0x141212,
  Grey: 0x1b1919,
  Gold: 0x9a8148,
};

/** Emissive per slot (sRGB, small): the hi-vis panels catch the lantern and read at dusk. */
const EMISSIVE: Record<Costume, CostumeColours> = {
  default: { LightGreen: 0x2a0e02 },
  court: {},
};

/** Model parts a costume hides (matched against the mesh name). */
const HIDDEN: Record<Costume, RegExp | null> = {
  default: null,
  court: /^Backpack/,
};

/** Is the Messstab carried across the back while it is not in hand? */
const STAFF_ON_BACK: Record<Costume, boolean> = { default: true, court: false };

/** A costume id from untrusted input (an event payload, a save): anything unknown is 'default'. */
export function resolveCostume(c: unknown): Costume {
  return typeof c === 'string' && (COSTUME_IDS as readonly string[]).includes(c) ? (c as Costume) : 'default';
}

export function costumeColours(c: Costume): CostumeColours {
  return resolveCostume(c) === 'court' ? COURT_COSTUME : SURVEYOR_COSTUME;
}

export function costumeEmissive(c: Costume): CostumeColours {
  return EMISSIVE[resolveCostume(c)];
}

export function costumeHides(c: Costume, meshName: string): boolean {
  return HIDDEN[resolveCostume(c)]?.test(meshName) ?? false;
}

export function staffOnBack(c: Costume): boolean {
  return STAFF_ON_BACK[resolveCostume(c)];
}

/** The model part a mesh belongs to (`Adventurer_Body_1` → `Body`, `Backpack_2` → `Backpack`). */
export function partOf(meshName: string): string {
  const m = /^(?:Adventurer_)?(Body|Head|Legs|Feet|Backpack)/.exec(meshName);
  return m ? m[1]! : '';
}

/** Colour of a slot on a part (`Part.Slot` beats `Slot`), or null to keep the model's own. */
export function slotHex(t: CostumeColours, part: string, slot: string): number | null {
  return t[`${part}.${slot}`] ?? t[slot] ?? null;
}

/** The lantern's glass glow when no tint is set. */
export const LANTERN_DEFAULT = 0xffa64a;
/** Its flame core when no tint is set. */
export const FLAME_DEFAULT = 0xffd28a;

/** Mix two sRGB hex colours per channel (k = 0 → a, 1 → b). */
export function mixHex(a: number, b: number, k: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * k) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A tint from untrusted input: a 24-bit colour, or null (the default flame). */
export function resolveTint(hex: unknown): number | null {
  return typeof hex === 'number' && Number.isFinite(hex) && hex >= 0 && hex <= 0xffffff ? Math.round(hex) : null;
}

/** Glass glow and flame core colours (sRGB) for a lantern tint (null = the warm default). */
export function lanternColours(tint: number | null): { glow: number; flame: number } {
  const t = resolveTint(tint);
  if (t === null) return { glow: LANTERN_DEFAULT, flame: FLAME_DEFAULT };
  // the core is the tint lifted towards white, so it still reads as a hot flame
  return { glow: t, flame: mixHex(t, 0xffffff, 0.45) };
}
