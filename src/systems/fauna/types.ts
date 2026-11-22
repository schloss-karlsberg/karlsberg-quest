/**
 * Fauna contract v0 (frozen 2026-11-20): mesh-independent animal bodies, parallel to the people contract.
 * Owner of bodies + contract: kq-characters (src/systems/fauna/). Behaviour (flee/sneak, follow, alert events,
 * save/restore, kq.animals): kq-systems (src/systems/animals/), which drives these bodies like walk drives people.
 *
 * Rules (same as people v0):
 * - The fauna system updates every animal each frame; callers move `root` and call setSpeed / face / play / lookAt.
 * - Distance LOD: full animation rate ≤ 15 m, ≈ 10 Hz ≤ 40 m, frozen beyond, hidden past 60 m.
 *   Frustum culling stays on. Exception: `opts.keepAlive` keeps full rate (cinematic close-ups).
 * - root: feet at the origin, faces −z (player yaw convention); never Object3D.lookAt on root.
 * - Unknown spec id → a generic dog + one console.warn.
 * - Animals are not saved; the behaviour layer re-spawns them from its own slice.
 * - Budget (authored meshes; stand-ins only report): featured animal ≤ 8k tris, ≤ 2 draw calls; LOD1 ≈ 50 % beyond 15 m.
 *
 * Getting the API: the fauna system sets `ctx.fauna` (declared by ./index.ts through declaration
 * merging on GameContext). A system that spawns animals declares `after: ['fauna']` and reads
 * `ctx.fauna` in `init` or later (undefined only when the fauna system failed or is not
 * registered). Import the types from here with `import type`; never the implementation. Nothing
 * spawns animals by default: the behaviour layer (src/systems/animals) decides who is out.
 *
 * Details the contract's one-liners leave open (the stand-in and the authored build both follow them):
 * - `root` is world space with the feet at its local origin; `root.rotation.y = yaw` faces `yaw`
 *   (0 faces −z, north; π/2 faces −x, west; −π/2 faces +x, east), like the people.
 * - `keepAlive` keeps the full animation rate at any distance AND keeps the animal drawn past the
 *   draw limit (a cinematic subject far from the camera); `setVisible(false)` still hides it.
 * - `setSpeed` > `MOVE_OVERRIDE` (0.2 m/s) overrides the looping action clips (graze … sleep): the
 *   body gets up and walks / runs; the action comes back when the speed drops again. `play('walk' |
 *   'run')` ends a looping action and hands the body back to locomotion (standing still it idles).
 * - One-shots (`bark`, `shake`) play over whatever loops; afterwards the previous loop / locomotion
 *   carries on. Over moving legs a one-shot moves the head and neck only.
 * - A clip outside `info.clips` plays its nearest fallback: the build's own stand-in look for it
 *   when it has one, else along `CLIP_FALLBACK` (idle at the end).
 * - `info.headHeight` is the spec's eye height; `headWorld()` is the live point between the eyes
 *   (carried by the head bone), so it follows grazing, lying, look-ats.
 * - `setEyeShine(k)`: 0 = off (nothing drawn), 1 = full glint; small unlit glints at the eyes, no lights.
 * - An unknown spec id: the generic dog (`info` is the generic dog's) and one `console.warn` per
 *   unknown id; the handle keeps the requested `specId`.
 */
import type { Object3D } from 'three';

export type AnimalClip =
  | 'idle'      // loop: stand, breathe, ear flick / tail now and then
  | 'walk'      // loop (normally via setSpeed)
  | 'run'       // loop (deer: bounding flight; dogs: gallop) (normally via setSpeed)
  | 'graze'     // loop: head down, chewing (deer); sniffing the ground for dogs falls back to 'sniff'
  | 'sniff'     // loop: nose to the ground, slow drift
  | 'alert'     // loop: head up, ears forward, frozen ("sichern"); the 1.5 s tell is the behaviour layer's timing
  | 'sit'       // loop (dogs)
  | 'lie'       // loop: lying, head up
  | 'sleep'     // loop: lying, head down
  | 'bark'      // one-shot (dogs), then back to the previous loop / locomotion
  | 'shake';    // one-shot (dogs), then back

export type FaunaSpecId = 'reh.ricke' | 'reh.kitz' | 'dog.diane' | 'dog.bijou' | (string & {});

export interface AnimalSpawnOpts {
  x: number; z: number;
  y?: number;          // default: ground height at x,z
  yaw?: number;        // radians, player convention (0 faces −z)
  seed?: number;       // idle phase / small variation
  name?: string;       // debug label
  keepAlive?: boolean; // ignore distance LOD (cinematic subject)
}

export interface AnimalInfo {
  specId: string;
  length: number;        // m, nose to rump
  height: number;        // m, shoulder height
  radius: number;        // m, collision circle
  headHeight: number;    // m, eye height when standing (camera/photo targets)
  speeds: { walk: number; run: number }; // m/s at which the walk / run clips are stride-matched
  clips: readonly AnimalClip[];          // really supported; others play the nearest fallback
}

export interface Animal {
  readonly id: string;
  readonly specId: string;
  readonly root: Object3D;
  readonly info: AnimalInfo;
  readonly ready: Promise<boolean>;  // true when the mesh is in, false on fallback; usable before (invisible until ready)
  setSpeed(mps: number): void;       // idle → walk → run by ground speed, feet phase-locked; > 0.2 m/s overrides looping action clips
  play(clip: AnimalClip, o?: { loop?: boolean; fade?: number; speed?: number }): void;
  face(yaw: number, o?: { seconds?: number }): void; // smooth body turn (radians, player convention); seconds: turn time (default FACE_SECONDS), 0 = at once for a caller that turns smoothly itself
  lookAt(p: { x: number; y: number; z: number } | null): void; // head turn within limits; null = forward
  headWorld(out: { x: number; y: number; z: number }): void;    // current head position (photo framing, cinematic target)
  setEyeShine(k: number): void;      // 0..1 eye glint (keep ending: "eyes catching the fire a little too brightly")
  setVisible(v: boolean): void;
  dispose(): void;
}

export interface FaunaApi {
  spawn(specId: FaunaSpecId, o: AnimalSpawnOpts): Animal;
  get(id: string): Animal | undefined;
  list(): readonly Animal[];
  clear(): void;
  specs(): readonly string[];
}
// Access: ctx.fauna (FaunaApi | undefined) via declaration merge; systems declare after: ['fauna']. Debug: kq.fauna.
//
// v0 specs (provisional):
// - reh.ricke: roe doe, grey winter coat. Shoulder 0.75, length 1.15, radius 0.35, eye 0.95. Walk 1.2 m/s, run (bounding) 8 m/s.
// - reh.kitz: fawn, grey winter coat, NO spots, nearly the doe's size. Shoulder 0.68, length 1.05, radius 0.32, eye 0.86.
// - dog.diane: the leader, a lean medium-large hunting dog. Shoulder 0.58, length 0.95, radius 0.3, eye 0.62. Walk 1.4, run 7.
// - dog.bijou: small, thinks he's a stag. Shoulder 0.32, length 0.55, radius 0.2, eye 0.36. Walk 1.2, run 5.
// (The kitz's speeds are not in the frozen text: the spec table gives it the doe's, so it keeps up with her.)

// ---- the contract's numbers (frozen with the types; the stand-in and the authored build share them)

/** Distance LOD (m from the camera): full-rate animation, ~10 Hz, frozen; hidden beyond the draw limit. Same bands as `PEOPLE_LOD`. */
export const FAUNA_LOD = {
  /** Animation at full rate within this distance. */
  fullRate: 15,
  /** About `slowHz` within this distance, frozen beyond. */
  slowRate: 40,
  slowHz: 10,
  /** Hidden beyond this distance (unless `keepAlive`). */
  drawLimit: 60,
  /** Authored meshes switch to LOD1 (about `lod1Ratio` of the triangles) beyond this distance. */
  lod1: 15,
  lod1Ratio: 0.5,
} as const;

/** Per-animal budget of the authored meshes (the stand-ins only report what they cost). */
export const FAUNA_BUDGET = {
  featured: { tris: 8_000, drawCalls: 2 },
} as const;

/** Speed (m/s) above which locomotion overrides the looping action clips. */
export const MOVE_OVERRIDE = 0.2;

/**
 * Nearest fallback of each clip (followed until a clip the build plays is reached; idle always is):
 * a dog's graze is sniffing (the contract's own rule), sleep without its own pose is lying, a bark
 * the body cannot make is at least an alert head. Each build lists what it really has in
 * `info.clips`. No cycles: the chain ends in idle.
 */
export const CLIP_FALLBACK: Readonly<Record<AnimalClip, AnimalClip | null>> = {
  idle: null,
  walk: 'idle',
  run: 'walk',
  graze: 'sniff',
  sniff: 'idle',
  alert: 'idle',
  sit: 'idle',
  lie: 'idle',
  sleep: 'lie',
  bark: 'alert',
  shake: 'idle',
};

/** Every clip of the contract, in declaration order. */
export const ANIMAL_CLIPS: readonly AnimalClip[] = ['idle', 'walk', 'run', 'graze', 'sniff', 'alert', 'sit', 'lie', 'sleep', 'bark', 'shake'];

/** One-shots (end in the previous loop / locomotion); the rest loop. */
export const ONE_SHOTS: ReadonlySet<AnimalClip> = new Set<AnimalClip>(['bark', 'shake']);
