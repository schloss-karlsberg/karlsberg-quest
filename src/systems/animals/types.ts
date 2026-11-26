/**
 * Tour animals (design contract C5): the request shapes the story sends, the events the animal
 * system answers with, the clip hints the pure core hands to the bodies, and the save slice.
 * Pure types (plus two tiny lookup helpers); the story imports them type-only.
 *
 * Bodies come from kq-characters (fauna contract v0, `src/systems/fauna/types.ts`). This core does
 * not import it: spec ids and clip names are plain strings that match that contract.
 */

/** C5 `AnimalAction` without the story's `ActionBase` (kq-story extends it with delay / onResume). */
export interface AnimalAction {
  do?: 'animal';
  op: 'spawn' | 'despawn' | 'run' | 'lie' | 'follow' | 'shine';
  /** Instance id: 'ricke', 'kitz', 'diane', 'bijou'. */
  id: string;
  /** spawn only. */
  kind?: AnimalKind;
  /** Model variant. */
  look?: AnimalLook;
  x?: number;
  z?: number;
  /** Degrees in the content files (like the C5 example `"yaw": 250`), player convention. */
  yaw?: number;
  era?: 'today';
  /** follow: whom to follow ('npc:double.jost', 'animal:ricke', 'player'); spacing in metres. */
  follow?: string;
  spacing?: number;
  /** spawn (reh): shy behaviour radii; a crouched, slow player scales notice by 0.35. */
  shy?: ShyRadii;
  /** run: a path to run (dogs bolting) and whether to come back to the follow target. */
  path?: [number, number][];
  bark?: boolean;
  back?: boolean;
  /** shine: eye glint 0..1 (the keep ending's party: "eyes catching the fire a little too brightly"). */
  k?: number;
}

export type AnimalKind = 'reh' | 'hund';
export type AnimalLook = 'ricke' | 'kitz' | 'diane' | 'bijou';
export interface ShyRadii {
  /** Perception radius for an upright player (m). */
  notice: number;
  /** Inside this an upright, moving player fills the meter (m). */
  flee: number;
  /** How far the deer bound before they stop again (m). */
  settle: number;
}

// The same request, narrowed per op (what the system's dispatcher works with).
export interface AnimalSpawnOp {
  op: 'spawn';
  id: string;
  kind: AnimalKind;
  look?: AnimalLook;
  x?: number;
  z?: number;
  yaw?: number;
  era?: 'today';
  follow?: string;
  spacing?: number;
  shy?: ShyRadii;
}
export interface AnimalDespawnOp { op: 'despawn'; id: string }
export interface AnimalRunOp { op: 'run'; id: string; path: [number, number][]; bark?: boolean; back?: boolean }
/** lie: at x/z when given, else at the feet of `follow` (or the current follow target). */
export interface AnimalLieOp { op: 'lie'; id: string; x?: number; z?: number; follow?: string }
/** follow: `follow` omitted or '' stops following (the animal stays where it is). */
export interface AnimalFollowOp { op: 'follow'; id: string; follow?: string; spacing?: number }
/** shine: the body's eye glint (fauna `setEyeShine`), 0 = off; clamped to 0..1. Not saved: whoever set it sets it again. */
export interface AnimalShineOp { op: 'shine'; id: string; k: number }
export type AnimalRequest = AnimalSpawnOp | AnimalDespawnOp | AnimalRunOp | AnimalLieOp | AnimalFollowOp | AnimalShineOp;

/** Narrow a flat C5 action to its op shape; null when a required field is missing. */
export function toRequest(a: AnimalAction): AnimalRequest | null {
  const { op, id } = a;
  if (!id) return null;
  switch (op) {
    case 'spawn':
      if (!a.kind) return null;
      return { op, id, kind: a.kind, look: a.look, x: a.x, z: a.z, yaw: a.yaw, era: a.era, follow: a.follow, spacing: a.spacing, shy: a.shy };
    case 'despawn':
      return { op, id };
    case 'run':
      if (!a.path || a.path.length < 2) return null;
      return { op, id, path: a.path, bark: a.bark, back: a.back };
    case 'lie':
      return { op, id, x: a.x, z: a.z, follow: a.follow };
    case 'follow':
      return { op, id, follow: a.follow, spacing: a.spacing };
    case 'shine':
      if (typeof a.k !== 'number' || !Number.isFinite(a.k)) return null;
      return { op, id, k: Math.max(0, Math.min(1, a.k)) };
    default:
      return null;
  }
}

/**
 * Clip hints = the fauna contract's `AnimalClip` (idle|walk|run|graze|sniff|alert|sit|lie|sleep|
 * bark|shake). `bark` and `shake` are one-shots; the core reports them as events, never as `clip`.
 */
export type AnimalClipHint = 'idle' | 'walk' | 'run' | 'graze' | 'sniff' | 'alert' | 'sit' | 'lie' | 'sleep' | 'bark' | 'shake';

/** Fauna spec id for a kind / look (fauna v0: reh.ricke, reh.kitz, dog.diane, dog.bijou). */
export function specIdFor(kind: AnimalKind, look?: AnimalLook): string {
  if (kind === 'reh') return look === 'kitz' ? 'reh.kitz' : 'reh.ricke';
  return look === 'bijou' ? 'dog.bijou' : 'dog.diane';
}

/**
 * What the body should do this tick: walk toward (tx, tz) at `speed` (the core has already moved
 * x/z; the target tells the body where it is heading), face `yaw`, loop `clip` when standing.
 */
export interface AnimalMotion {
  tx: number;
  tz: number;
  speed: number;
  yaw: number;
  clip: AnimalClipHint;
}

/**
 * Events the core returns from a step. The `animal:*` entries map 1:1 to bus events (payload =
 * the entry minus `type`); `bark` / `shake` are local one-shot cues for the body and the audio.
 */
export type AnimalEvent =
  | { type: 'animal:alert'; id: string }
  | { type: 'animal:fled'; id: string; by: 'player' | 'cue'; dist: number }
  | { type: 'animal:settled'; id: string }
  | { type: 'animal:returned'; id: string }
  | { type: 'bark'; id: string; x: number; z: number }
  | { type: 'shake'; id: string; x: number; z: number };

/** One deer in the save. */
export interface DeerSave {
  id: string;
  look: AnimalLook;
  x: number;
  z: number;
  yaw: number;
  state: string;
  t: number;
  meter: number;
  calm: number;
  follow: string;
  spacing: number;
  shy: ShyRadii;
  /** Flight in progress: from, to, cause, player distance at the trigger. */
  flee?: { fx: number; fz: number; tx: number; tz: number; by: 'player' | 'cue'; dist: number };
  /** leave() target in progress. */
  away?: { x: number; z: number };
}
/** One dog in the save. */
export interface DogSave {
  id: string;
  look: AnimalLook;
  x: number;
  z: number;
  yaw: number;
  state: string;
  t: number;
  follow: string;
  spacing: number;
  slot: number;
  path?: [number, number][];
  i?: number;
  bark?: boolean;
  back?: boolean;
  lie?: { x: number; z: number; follow: string };
  /** Ground speed (m/s) while moving; absent = standing. */
  v?: number;
  /** Feet planted until the dog lines up with its travel direction. */
  turning?: boolean;
}
/**
 * Save slice of the animal core. The integration task decides where it lives (its own
 * `SystemStates` key or inside the menagerie slice, C5) and adds the augmentation there.
 */
export interface AnimalSave { v: 1; deer: DeerSave[]; dogs: DogSave[] }

declare module '../../core/events' {
  interface GameEvents {
    /** Request, every op (renamed from C5's `animal:spawn`, agreed with kq-story). Owner: story → animal system. */
    'animal:request': AnimalAction;
    /** Head up, the 1.5 s tell. */
    'animal:alert': { id: string };
    /** dist = metres between the player and the animal when it bolted. */
    'animal:fled': { id: string; by: 'player' | 'cue'; dist: number };
    /** Stopped again after fleeing. */
    'animal:settled': { id: string };
    /** A dog back at its follow target. */
    'animal:returned': { id: string };
  }
}
