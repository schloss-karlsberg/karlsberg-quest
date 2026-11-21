/**
 * Talking to people (people contract v0.1, src/systems/people/types.ts): a story NPC placement for
 * speaker X is BOUND to a live Person spawned with `speaker: X` (`ctx.people.bySpeaker(X)`). While
 * bound the placement has no figure of its own; the talk range, the E prompt, the quest glyph and
 * the conversation framing follow `person.root` (the placement's own x / z wait unused, for when
 * the person is disposed and the figure comes back). In a conversation the person faces the player,
 * looks at the player's eye and plays 'talk'; at its end 'idle' (locomotion takes over by itself).
 * Pure helpers (no three.js), tests/people.test.ts.
 */

/** The parts of a Person the binding reads. */
export interface BodyLike {
  readonly root: { readonly position: { readonly x: number; readonly y: number; readonly z: number } };
  readonly info: { readonly height: number };
}

export interface BodySpot {
  /** A live person stands in for the placement. */
  bound: boolean;
  x: number;
  z: number;
  /** The floor (the person's feet) when bound; null = ask the world (the placement's storey). */
  y: number | null;
  /** The person's height when bound; null = the figure's own. */
  height: number | null;
}

/** Where the body of an NPC placement is now: the bound person's root, else the placement itself. */
export function bodySpot(placement: { x: number; z: number }, person: BodyLike | null | undefined): BodySpot {
  if (person) {
    const r = person.root.position;
    if (Number.isFinite(r.x) && Number.isFinite(r.z)) return { bound: true, x: r.x, z: r.z, y: Number.isFinite(r.y) ? r.y : null, height: person.info.height };
  }
  return { bound: false, x: placement.x, z: placement.z, y: null, height: null };
}

/** Yaw in the player's convention (0 faces −z) from (x, z) toward (tx, tz): what `Person.face` takes. */
export function faceYaw(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

/**
 * Who gets which conversation cue when the bound talker changes: `start` → face / lookAt /
 * play('talk'); `end` → play('idle') and lookAt(null). `prev` = the person told to talk last frame,
 * `now` = the bound person of the open conversation (null: none, or the conversation ended).
 */
export function talkCues<P>(prev: P | null, now: P | null): { start: P | null; end: P | null } {
  return { start: now !== null && now !== prev ? now : null, end: prev !== null && prev !== now ? prev : null };
}
