import type { AssetEntry } from '../types';

/**
 * Characters track: rigged, animated CC0 models (Quaternius, via poly.pizza) for the ghost NPCs and
 * the spectral enemies (docs/ART-DIRECTION.md §6, §8.1). All are drawn with our own shaders
 * (src/systems/characters), so `worldLight: false`. Clip names are short ('Idle', 'Walk' …: the
 * pack step `--anims` keeps only what the game plays). Pivots at the feet, facing +z.
 */
const HUMAN = 'Clips: Idle, Idle_Neutral, Walk, Run, Wave, Interact, HitRecieve, Death, Punch_Right, Sword_Slash. ~1.86 m, 62-joint CharacterArmature.';

const entries: AssetEntry[] = [
  {
    id: 'characters.human.adventurer',
    kind: 'model',
    url: 'models/characters/human_adventurer.glb',
    area: 'characters',
    eras: ['1789', '1793-02', '1793-07', '1796'],
    bytes: 606572,
    licence: 'quaternius.adventurer',
    worldLight: false,
    note: `Male base for officials, liveries, masons and the Raffschatten. ${HUMAN}`,
  },
  {
    id: 'characters.human.farmer',
    kind: 'model',
    url: 'models/characters/human_farmer.glb',
    area: 'characters',
    eras: ['1789', '1793-02', '1793-07', '1796'],
    bytes: 507476,
    licence: 'quaternius.farmer',
    worldLight: false,
    note: `Male with a slouch hat: carters, gardeners, villagers. ${HUMAN}`,
  },
  {
    id: 'characters.human.woman',
    kind: 'model',
    url: 'models/characters/human_woman.glb',
    area: 'characters',
    eras: ['1789', '1793-02', '1793-07', '1796'],
    bytes: 522880,
    licence: 'quaternius.animated_woman',
    worldLight: false,
    note: `Woman in a long dress: Hanne and the maids. ${HUMAN}`,
  },
  {
    id: 'characters.creature.wolf',
    kind: 'model',
    url: 'models/characters/wolf.glb',
    area: 'characters',
    eras: ['1789', '1793-02', '1793-07', '1796'],
    bytes: 514484,
    licence: 'quaternius.wolf',
    worldLight: false,
    note: 'Spectral hounds (Streuner, the Pikeur\'s pack). Clips: Idle, Walk, Gallop, Attack, Death, Idle_HitReact_Left, Gallop_Jump.',
  },
  {
    id: 'characters.creature.horse',
    kind: 'model',
    url: 'models/characters/horse.glb',
    area: 'characters',
    eras: ['1793-02'],
    bytes: 584980,
    licence: 'quaternius.horse',
    worldLight: false,
    note: "The Pikeur's horse (boss, Feb 1793). Clips: Idle, Walk, Gallop, Attack_Kick, Attack_Headbutt, Death, Idle_HitReact_Left, Jump_toIdle.",
  },
];
export default entries;
