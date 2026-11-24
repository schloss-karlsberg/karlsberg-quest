/**
 * The end-of-game party (docs/design/tour/systems.md §6, bible 06-enden §8 "Das Fest"): the
 * interface agreed with the story team. The story imports these types type-only.
 *
 * Requests (also through the cue bridge `story:cue {id: 'party:set' | 'party:credits' |
 * 'party:clear', data}`):
 *  - `party:set` builds the party on today's plateau for an ending variant (people, dogs, props).
 *  - `party:credits` rolls the credits strip with a slow orbit that lingers on each double.
 *  - `party:clear` removes everything.
 * Events out carry scalar fields only.
 */

export type PartyVariant = 'museum' | 'burn' | 'keep';
export const PARTY_VARIANTS: readonly PartyVariant[] = ['museum', 'burn', 'keep'];

export interface PartySetRequest {
  variant: PartyVariant;
  /** Centre of the party (default TF-01, 1216 / −1114); every placement moves with it. */
  at?: { x: number; z: number };
}
export interface PartyCreditsRequest {
  /** Override the assembled credits for this run. */
  lines?: string[];
}

/** The party slice: no bodies (the story re-issues `party:set` on resume), only what avoids a double `credits:done`. */
export interface PartySlice {
  variant: PartyVariant | null;
  /** 'playing' at save time → after a load `credits:done {skipped: true}` once. */
  credits: 'none' | 'playing' | 'done';
}

declare module '../../core/events' {
  interface GameEvents {
    'party:set': PartySetRequest;
    'party:credits': PartyCreditsRequest;
    /** Dismiss the credits (gameplay Enter, Escape or the browser's pointer-lock exit). */
    'party:skip': Record<string, never>;
    'party:clear': Record<string, never>;
    /** The party stands (people, dogs and props spawned). */
    'party:ready': { variant: string };
    /** The camera lingers 2–3 s on a double (`who` = people spec id, e.g. 'double.herzog'); i = 0.. in order. The story plays its line on a match. */
    'party:spotlight': { who: string; i: number };
    /** Nominal duration of the animated credits in game time. */
    'credits:start': { seconds: number };
    /** Exactly once per credits run (a skip, the natural end, a load while they played). */
    'credits:done': { skipped: boolean };
  }
}

export interface PartyHooks {
  set(variant: PartyVariant, at?: { x: number; z: number }): boolean;
  credits(lines?: string[]): boolean;
  skip(): void;
  clear(): void;
  state(): {
    variant: PartyVariant | null;
    at: { x: number; z: number } | null;
    credits: 'none' | 'playing' | 'done';
    t: number;
    seconds: number;
    spotlights: string[];
    people: { who: string; spec: string; speaker: string | null; x: number; z: number; activity: string }[];
    dogs: string[];
  };
  /** Bodies (people) and draw calls: the set's meshes, the bodies' meshes (stand-ins: per skinned part). */
  stats(): { bodies: number; dogs: number; setDrawCalls: number; bodyDrawCalls: number; dogDrawCalls: number };
}

declare module '../../debug/hooks' {
  interface KqHooks {
    party?: PartyHooks;
  }
}
