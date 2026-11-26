/**
 * People contract v0 (frozen 2026-11-20): mesh-independent NPC spawn interface. Real authored meshes replace the stand-ins behind it.
 *
 * Modern people walking the Karlsberg together: the tour guide, about 15 tour members, the modern
 * "doubles" of historical figures, a child, the two historical twins. Path-walk / group systems
 * build against THIS file only; today the people system draws them with rigged CC0 stand-in bodies
 * (./standin.ts), later the authored character meshes drop in behind the same interface.
 *
 * Getting the API: the people system sets `ctx.people` (declared by ./index.ts through declaration
 * merging on GameContext). A system that spawns people declares `after: ['people']` and reads
 * `ctx.people` in `init` or later (undefined only when the people system failed or is not
 * registered). Import the types from here with `import type` — never the implementation.
 *
 * Rules of the contract
 * - The people system updates every person each frame. Callers never call update. They move
 *   `root`, and call `setSpeed` / `face` / `play` / `lookAt`.
 * - `root` is world space, the feet at its local origin. Its forward is −z, so
 *   `root.rotation.y = yaw` faces `yaw` in the player's convention (0 faces −z, north; π/2 faces
 *   −x, west; −π/2 faces +x, east). Do not use `Object3D.lookAt` on it (that aims +z).
 * - Distance LOD (`PEOPLE_LOD`, distance from the camera):
 *   - animation at full rate within 25 m, about 10 Hz within 40 m, frozen beyond
 *   - hidden beyond the draw limit (stand-in: 60 m)
 *   - frustum culling stays on
 * - Budget tiers (`TIER_BUDGET`; for the authored meshes, the stand-ins just report them):
 *   - hero: ≤ 25k tris, ≤ 8 draw calls
 *   - featured: ≤ 12k tris, ≤ 4
 *   - extra: ≤ 6k tris, ≤ 2
 *   - LOD1 at about 50 % beyond 15 m
 * - Unknown spec id: a generic extra plus one `console.warn` (once per unknown id); the handle keeps
 *   the requested `specId`, its `info` is the generic extra's.
 * - v0 spec ids (provisional, `specs()`):
 *   - `guide`: placeholder guide "Gerold Imhoff", big, skinny, bald, height 1.95, featured
 *   - `double.herzog`, `double.mannlich`, `double.hanne`, `double.peter`, `double.jost`,
 *     `double.soll`, `double.liese`: featured, modern clothes
 *   - `child.compass`: height about 1.25, featured
 *   - `extra.1` … `extra.7`: extra
 *   - `twin.herzog`, `twin.mannlich`: the historical twins, featured, default look 'ghost'
 * - Capsule radius: adults 0.3 (featured) / 0.28 (extra), the child 0.22. Height per spec.
 * - Clips: idle / talk / sit / sitTalk / lookAround loop; point / wave / interact are one-shots that
 *   end in the looping clip that was playing (idle unless another loop was set) or in locomotion;
 *   `setSpeed` > 0.2 m/s overrides looping action clips with idle → walk → run by ground speed.
 *   Walk and run follow `setSpeed` only: `play('walk' | 'run')` ends a looping action and hands the
 *   body back to locomotion (standing still it idles). A clip missing from `info.clips` plays its
 *   nearest fallback (`CLIP_FALLBACK`).
 *
 * v0.1 (additive, 2026-11-20): talking to people
 * - `PersonSpawnOpts.speaker`: a content speaker id (e.g. 'imhoff'). `PeopleApi.bySpeaker(id)`
 *   returns the live person spawned with it (the newest, if several).
 * - The npc system binds a story NPC placement for that speaker to the person: no ghost figure of
 *   its own while bound; talk range, the E prompt, the quest glyph and the conversation framing
 *   follow `person.root`; during the conversation it calls `face` (toward the player), `lookAt`
 *   (the player's eye) and `play('talk')`, and at its end `play('idle')` and `lookAt(null)`. A
 *   walking person stays talkable (a walk system may pause itself on 'npc:conversation').
 *   Disposing the person unbinds: the placement's own figure comes back.
 */
import type { Object3D } from 'three';

export type PersonClip = 'idle' | 'walk' | 'run' | 'talk' | 'point' | 'wave' | 'lookAround' | 'sit' | 'sitTalk' | 'interact';
export type PersonLook = 'solid' | 'ghost';
export type BudgetTier = 'hero' | 'featured' | 'extra';

export interface PersonSpawnOpts {
  x: number;
  z: number;
  /** Default: ground height at x,z (`world.heightAt`). */
  y?: number;
  /** Radians, the player's convention (0 faces −z). */
  yaw?: number;
  /** Default 'solid' (the twins: 'ghost'). */
  look?: PersonLook;
  /** Default: from the spec. */
  tier?: BudgetTier;
  /** Idle phase / small variation. */
  seed?: number;
  /** Debug label. */
  name?: string;
  /** v0.1: content speaker id (e.g. 'imhoff'): the npc system binds that speaker's placement to this person. */
  speaker?: string;
}

export interface PersonInfo {
  specId: string;
  tier: BudgetTier;
  /** m, standing. */
  height: number;
  /** m, collision capsule radius. */
  radius: number;
  /** Clips this build really supports (others fall back, see play()). */
  clips: readonly PersonClip[];
}

export interface Person {
  /** Unique instance id. */
  readonly id: string;
  readonly specId: string;
  /** Feet at the local origin; callers move/rotate THIS (world space). */
  readonly root: Object3D;
  readonly info: PersonInfo;
  /** True when the mesh is in, false on fallback; the handle is usable before (invisible until ready). */
  readonly ready: Promise<boolean>;
  /** Locomotion: blends idle → walk → run by ground speed, feet phase-locked; > 0.2 m/s overrides looping action clips. */
  setSpeed(mps: number): void;
  /** idle/talk/sit/sitTalk/lookAround loop; point/wave/interact one-shot, then back to idle/locomotion; unsupported → nearest fallback. */
  play(clip: PersonClip, o?: { loop?: boolean; fade?: number; speed?: number }): void;
  /** Smooth body turn toward a yaw (radians, player convention). */
  face(yaw: number, snap?: boolean): void;
  /** Head turn toward a world point; null = forward. */
  lookAt(p: { x: number; y: number; z: number } | null): void;
  setLook(look: PersonLook): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export interface PeopleApi {
  spawn(specId: string, o: PersonSpawnOpts): Person;
  get(id: string): Person | undefined;
  list(): readonly Person[];
  clear(): void;
  /** Known spec ids (provisional until the authored models land). */
  specs(): readonly string[];
  /** v0.1: the live person spawned with this speaker id (the newest, if several). */
  bySpeaker(speaker: string): Person | undefined;
}

// ---- the contract's numbers (frozen with the types; the stand-in and the authored build share them)

/** Distance LOD (m from the camera): full-rate animation, ~10 Hz, frozen; hidden beyond the draw limit. */
export const PEOPLE_LOD = {
  /** Animation at full rate within this distance. 25 m, not 15: the LOD is measured from the camera and a trailing third-person camera sits 15-25 m from the tour group, where 10 Hz stutters visibly (+1-1.5 ms CPU with 16 bodies, measured on a real GPU). */
  fullRate: 25,
  /** About `slowHz` within this distance, frozen beyond. */
  slowRate: 40,
  slowHz: 10,
  /** Hidden beyond this distance (stand-in value). */
  drawLimit: 60,
  /** Authored meshes switch to LOD1 (about `lod1Ratio` of the triangles) beyond this distance. */
  lod1: 15,
  lod1Ratio: 0.5,
} as const;

/** Per-person budget of the authored meshes (the stand-ins only report their tier). */
export const TIER_BUDGET: Readonly<Record<BudgetTier, { tris: number; drawCalls: number }>> = {
  hero: { tris: 25_000, drawCalls: 8 },
  featured: { tris: 12_000, drawCalls: 4 },
  extra: { tris: 6_000, drawCalls: 2 },
};

/** Speed (m/s) above which locomotion overrides the looping action clips. */
export const MOVE_OVERRIDE = 0.2;

/** Nearest fallback of each clip (followed until a clip in `info.clips` is reached; idle always is). */
export const CLIP_FALLBACK: Readonly<Record<PersonClip, PersonClip | null>> = {
  idle: null,
  walk: 'idle',
  run: 'walk',
  talk: 'idle',
  point: 'interact',
  wave: 'interact',
  interact: 'idle',
  lookAround: 'idle',
  sit: 'idle',
  sitTalk: 'sit',
};
