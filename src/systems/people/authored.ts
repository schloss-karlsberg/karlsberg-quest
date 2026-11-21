/**
 * The authored people bodies behind the people contract (./types.ts): MPFB builds from
 * scripts/chars/mpfb (the CC0 MakeHuman base mesh and its 53-bone game_engine rig, our own clothes,
 * clips retargeted from the Quaternius humans), packed into public/assets/models/chars/. A spec with
 * `authored` (./specs.ts) draws this body; every other spec keeps its stand-in. The person logic
 * (locomotion, one-shots, head turns, distance LOD) is the stand-in's (./standin.ts); this file is
 * what differs, as a `BodyKit`:
 *
 * - **Clips: one table.** `AUTHORED_SOURCE` maps the people clip sources to the MPFB clip names (the
 *   retarget bake keeps the Quaternius names), `AUTHORED_CLIPS` what each PersonClip plays.
 * - **Bones:** a small local alias table (`AUTHORED_BONES`: neck, feet, the upper-body split),
 *   looked up through the rig helpers (characters/rig.ts).
 * - **One shared material.** The pipeline bakes every surface colour of a body into its vertex
 *   colours and gives the mesh ONE material named 'People' (kqchar/palette.py). Every mesh with that
 *   material, in every authored person, gets the same `MeshStandardMaterial` instance
 *   (`peopleMaterial()`: vertex colours, the world light of render/standard.ts). Nothing is cloned
 *   per person, so the renderer draws each person in one call with no material or program switch
 *   between people. The material is never disposed by a person. (The ghost look still gets its own
 *   per-person shader, like the stand-in.)
 * - **LOD1:** the GLB carries a decimated copy of the body ('avatar-body_lod1', about half the
 *   triangles, the same skin); the person shows it beyond `PEOPLE_LOD.lod1` (15 m, ±0.5 m hysteresis).
 */
import { type Mesh, MeshStandardMaterial } from 'three';
import { kqStandard } from '../../render/standard';
import { linHex } from '../characters/shaders';
import type { PersonSpec } from './specs';
import type { BodyKit, StandInPlan } from './standin';
import { PEOPLE_LOD, type PersonClip } from './types';

/** The palette material names of the authored GLBs (kqchar/palette.py MATERIAL / EYE_MATERIAL). */
export const PEOPLE_MATERIAL = 'People';
export const PEOPLE_EYE_MATERIAL = 'PeopleEye';

/** Mesh-name suffix of the LOD1 copy in an authored GLB (kqchar/lod.py). */
export const LOD1_SUFFIX = '_lod1';

/** Hysteresis (m) round `PEOPLE_LOD.lod1`, so a person at the boundary does not flicker. */
export const LOD1_HYSTERESIS = 0.5;

/** The LOD level a person at `dist` m from the camera shows, given the one it shows now. */
export function lod1Level(dist: number, now: 0 | 1): 0 | 1 {
  if (!Number.isFinite(dist)) return now;
  if (dist > PEOPLE_LOD.lod1 + LOD1_HYSTERESIS) return 1;
  if (dist < PEOPLE_LOD.lod1 - LOD1_HYSTERESIS) return 0;
  return now;
}

/**
 * The people clip sources → MPFB clip names (first present wins). The retarget bake
 * (scripts/chars/mpfb/retarget.py) keeps the Quaternius clip names; `Point` is its pointing gesture
 * made from Interact (`--point Interact`: the same reach, index straight, the other fingers curled).
 * The GLB is packed with exactly these six.
 */
export const AUTHORED_SOURCE = {
  idle: ['Idle'],
  walk: ['Walk'],
  run: ['Run'],
  interact: ['Interact'],
  wave: ['Wave'],
  point: ['Point'],
} as const;

/**
 * PersonClip → what the authored body plays. The stand-in's plan (talk = idle with Interact
 * gestures, lookAround = idle with a head sweep) plus a real point (the baked Point clip); sit /
 * sitTalk are fallbacks (idle sunk onto the seat) until a sitting clip is baked.
 */
export const AUTHORED_CLIPS: Readonly<Record<PersonClip, StandInPlan>> = {
  idle: { kind: 'loop', native: true },
  walk: { kind: 'loop', native: true },
  run: { kind: 'loop', native: true },
  talk: { kind: 'loop', gestures: true, native: true },
  point: { kind: 'shot', shot: 'point', native: true },
  wave: { kind: 'shot', shot: 'wave', native: true },
  lookAround: { kind: 'loop', sweep: true, native: true },
  sit: { kind: 'loop', drop: 0.42, native: false },
  sitTalk: { kind: 'loop', drop: 0.42, gestures: true, native: false },
  interact: { kind: 'shot', shot: 'interact', native: true },
};

/** The clips the authored body really supports (`info.clips`). */
export const AUTHORED_SUPPORTED: readonly PersonClip[] = (Object.keys(AUTHORED_CLIPS) as PersonClip[]).filter((c) => AUTHORED_CLIPS[c].native);

/** The game_engine rig's bones the person drives (names as GLTFLoader loads them). */
export const AUTHORED_BONES = {
  neck: 'neck_01',
  feet: [/^foot_l$/, /^foot_r$/] as const,
  /** Upper body (one-shots over walking legs): the Quaternius split mapped through retarget.py's bone map (Torso/Chest = spine_02/03). */
  upper: /^(spine_02|spine_03|neck_01|head|clavicle_|upperarm_|lowerarm_|hand_|thumb_|index_|middle_|ring_|pinky_)/,
} as const;

let bodyMat: MeshStandardMaterial | null = null;
let eyeMat: MeshStandardMaterial | null = null;

/**
 * The ONE material every authored person draws with (vertex colours; created once, never disposed
 * by a person). `eye`: the optional second material of a GLB built with `budget.eye_call`.
 */
export function peopleMaterial(eye = false): MeshStandardMaterial {
  if (eye) {
    eyeMat ??= kqStandard(new MeshStandardMaterial({ name: 'kq-people-eye', vertexColors: true, roughness: 0.15, metalness: 0 }), { ambient: 1.15 });
    return eyeMat;
  }
  bodyMat ??= kqStandard(new MeshStandardMaterial({ name: 'kq-people', vertexColors: true, roughness: 0.72, metalness: 0 }), { ambient: 1.15 });
  return bodyMat;
}

/** The authored body kit (see the file comment). */
export const AUTHORED_KIT: BodyKit = {
  name: 'authored',
  model: (spec: PersonSpec) => spec.authored!.model,
  source: AUTHORED_SOURCE,
  plans: AUTHORED_CLIPS,
  supported: AUTHORED_SUPPORTED,
  upper: AUTHORED_BONES.upper,
  neck: AUTHORED_BONES.neck,
  feet: AUTHORED_BONES.feet,
  widthScale: false,
  dress(mesh: Mesh, slot: string, spec: PersonSpec) {
    const lod = mesh.name.endsWith(LOD1_SUFFIX) ? 1 : 0;
    const eye = slot === PEOPLE_EYE_MATERIAL;
    if (slot !== PEOPLE_MATERIAL && !eye) console.warn(`[people] authored mesh ${mesh.name}: unexpected material '${slot}', drawn with the people material`);
    return { solid: peopleMaterial(eye), owned: false, cloth: linHex(spec.authored?.cloth ?? 0x808080), lod };
  },
};
