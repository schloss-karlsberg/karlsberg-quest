/**
 * What the player's body is doing in a fight, for the third-person avatar (src/player/avatar.ts).
 * Combat writes it every frame through the viewmodel (src/systems/combat/viewmodel.ts, the same
 * data that drives the first-person staff); the avatar reads it one frame later. Plain data, no
 * three.js.
 */
import type { WeaponStage } from '../systems/combat/viewmodel';

export interface ActionPose {
  /** A staff swing: kind, combo step, seconds in, length, and the yaw it swings along. */
  swing: { kind: 'light' | 'heavy'; combo: number; t: number; dur: number; yaw: number } | null;
  skill: { id: 'ausfall' | 'erdstoss' | 'wirbel'; t: number; dur: number } | null;
  /** Wuchthieb charge 0..1, null when not charging. */
  charge: number | null;
  /** Dodge roll progress 0..1, null when not rolling. */
  dodge: number | null;
  /** Drinking / using an item 0..1. */
  drink: number;
  /** Bannlicht flare 0..1. */
  flare: number;
  /** Hit-stop: hold the pose. */
  frozen: boolean;
  /** Staff in hand (a Messstab is equipped) and the fight is on. */
  armed: boolean;
  inCombat: boolean;
  /** Down (undone) — the death clip plays until revived. */
  dead: boolean;
  /** Combat says no staff now (flying, a modal, the title, the staff lowered). */
  hidden: boolean;
  lowered: boolean;
  stage: WeaponStage;
  /** Locked / soft target (world x/z) the body faces, or null. */
  target: { x: number; z: number } | null;
  /** Seconds of game time this pose was written at (stale poses decay). */
  time: number;
}

export const actionPose: ActionPose = {
  swing: null,
  skill: null,
  charge: null,
  dodge: null,
  drink: 0,
  flare: 0,
  frozen: false,
  armed: false,
  inCombat: false,
  dead: false,
  hidden: true,
  lowered: false,
  stage: 'esche',
  target: null,
  time: 0,
};

/**
 * The phone coming out of the pocket (TASK-005), written by the photo system every frame and read
 * by the avatar: `raise` 0..1 (the hand at the pocket → the phone at the face), `inHand` (the
 * phone mesh shows). Both 0 / false whenever the phone is away or a cut (no arm) brings it up.
 */
export interface PhonePose {
  raise: number;
  inHand: boolean;
}

export const phonePose: PhonePose = { raise: 0, inHand: false };
