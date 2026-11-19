import type { AssetEntry } from '../types';

/**
 * Camera track (playtest round 8): the player character for the third-person camera
 * (src/player/avatar.ts). Quaternius' CC0 "Adventurer" (via poly.pizza) with its full clip set
 * (locomotion, strafing, roll, sword slash, punches, hit, death, interact, wave), recoloured at
 * runtime as a modern surveyor. World-lit (kqStandard). Pivot at the feet, facing +z.
 */
const entries: AssetEntry[] = [
  {
    id: 'camera.player.surveyor',
    kind: 'model',
    url: 'models/camera/surveyor.glb',
    area: 'core',
    bytes: 627924,
    licence: 'quaternius.adventurer.player',
    note: 'Clips: Idle, Idle_Sword, Walk, Run, Run_Back, Run_Left, Run_Right, Roll, Sword_Slash, Punch_Right, Punch_Left, HitRecieve, HitRecieve_2, Death, Interact, Wave. ~1.86 m, 62-joint CharacterArmature, backpack kept.',
  },
];
export default entries;
