/**
 * Cosmetic choices (no gameplay effect), the state behind the `player:lantern-tint` event. Feature systems set them,
 * e.g. the Fläschchen reward (all 24 found): the lantern glass „Flaschengrün“.
 */
export const cosmetics: {
  /** Tint of the lantern's glass glow (hex), null = the plain warm glass. */
  lanternGlass: number | null;
} = { lanternGlass: null };

/** „Flaschengrün“: the lantern glass the Fläschchen collection earns. */
export const FLASCHENGRUEN = 0x9fe0a0;
