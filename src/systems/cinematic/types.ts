/**
 * Cinematic (cut-scene) contract C1 (docs/design/tour/systems.md "C1. Cinematic"). The story team
 * imports these types type-only; keep the shapes exactly as in C1.
 *
 * Agreed deviation from C1: `cinematic:play` carries the full spec (`CinematicPlay`), not only the
 * id. `ref` names a file `content/cinematics/<ref>.json` (src/systems/cinematic/data.ts).
 *
 * `camera:override { active }` (boot's override slot, emitted only by takeover.ts `OverrideSlot`)
 * is declared in src/core/events.ts.
 */

/** What the camera looks at: a roster NPC, an animal (registered target), or the player. */
export type CineTarget = `npc:${string}` | `animal:${string}` | 'player';

export interface CinematicKey {
  /** Seconds from start; the first key is 0, strictly increasing. */
  t: number;
  /**
   * Eye: player-relative offsets or an absolute point (y = metres above ground, default 1.6).
   * Player-relative: from the player's feet at the cinematic's START (a frozen snapshot):
   * `back` metres behind (negative = ahead), `up` metres above the feet (default: the eye height),
   * `right` metres to the right, `turn` degrees the offset frame and the default view turn to the
   * left (counter-clockwise, as the player's yaw).
   */
  eye?: { rel: 'player'; back?: number; up?: number; right?: number; turn?: number } | { x: number; z: number; y?: number };
  /**
   * What the camera looks at: a target id, a point (y = metres above ground, default 1.2), or a
   * fixed pitch / yaw (degrees; pitch + = up; yaw compass: 0 north, 90 east; no yaw = the player's).
   */
  look?: { target: CineTarget } | { x: number; z: number; y?: number } | { pitch: number; yaw?: number };
  /** 15–90 degrees. */
  fov?: number;
  /**
   * The look keys, 0..1: `fade` to black, `fog` thicker fog, `sun` a low warm sun, `dark` night.
   * 0 = the world as it was when the cinematic started.
   */
  fade?: number;
  fog?: number;
  sun?: number;
  dark?: number;
  /** Easing into this key, default smooth. */
  ease?: 'smooth' | 'linear';
}

/** A circle around x / z at radius r (m), one turn per `period` s, `y` m above ground (default 3). */
export interface CinematicOrbit {
  x: number;
  z: number;
  r: number;
  period: number;
  y?: number;
  /** Duration, 1–600 s. */
  seconds: number;
}

/** The request (story → cinematic system). Exactly one of `keys` / `ref` / `orbit`. */
export interface CinematicPlay {
  id: string;
  keys?: CinematicKey[];
  /** File ref: content/cinematics/<ref>.json. */
  ref?: string;
  orbit?: CinematicOrbit;
  /** Default true. */
  skippable?: boolean;
  /** Default true: move, look, attack, E frozen; Esc pauses the timeline. */
  lockInput?: boolean;
  /** Reduced motion: 'stills' (first and last key, cross-fade, ≤ 3 s; default) or 'skip'. */
  reduced?: 'stills' | 'skip';
}

/** A file in content/cinematics/: a play spec without `ref` (id defaults to the file name). */
export type CinematicFile = Omit<CinematicPlay, 'ref' | 'id'> & { id?: string };

declare module '../../core/events' {
  interface GameEvents {
    /** story → cinematic system: play this cinematic. */
    'cinematic:play': CinematicPlay;
    'cinematic:start': { id: string; seconds: number };
    /** Always emitted once per play (also on a bad spec, a skip, an era change, death or a load). */
    'cinematic:end': { id: string; skipped: boolean };
  }
}

export interface CinematicHooks {
  /** Play an id from content/cinematics or an inline spec; false when rejected. */
  play(spec: string | CinematicPlay): boolean;
  /** End the playing cinematic now (skipped: true; ignores the grace). */
  skip(): void;
  /** Hold the picture of cinematic `id` at `t` s (starts it when it is not playing); t < 0 runs on. */
  at(id: string, t: number): void;
  /** The ids in content/cinematics. */
  list(): string[];
  playing(): string | null;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    cinematic?: CinematicHooks;
  }
}
