/**
 * One table of bone and clip names for the rigged humans the game drives, so code asks for a
 * logical bone (`hips`, `hand_r`) and works on every rig. Pure data, no three.js (unit-tested in
 * tests/bones.test.ts); `Rig.boneOf` (rig.ts) looks the names up.
 *
 * Rigs:
 *  - `quaternius`: the CC0 Quaternius humans (the surveyor avatar, the NPC and people stand-ins):
 *    Hips, Abdomen, Torso, Chest, Neck, Head, Shoulder.L, UpperArm.L, LowerArm.L, Wrist.L,
 *    Index1.L … Index4.L, UpperLeg.L, LowerLeg.L, Foot.L.
 *  - `mpfb`: the MakeHuman "game_engine" rig of the authored characters (scripts/chars/mpfb/,
 *    UE-style names): pelvis, spine_01 … spine_03, neck_01, head, clavicle_l, upperarm_l,
 *    lowerarm_l, hand_l, index_01_l … index_03_l, thigh_l, calf_l, foot_l, ball_l.
 *
 * Names are as written in the source rig; three's GLTFLoader drops `.` from node names
 * ('UpperArm.L' loads as 'UpperArmL'), which `Rig.bone` and `sanitizeBoneName` handle.
 * The mapping is the one scripts/chars/mpfb/retarget.py bakes the clips with.
 */

export type RigKind = 'quaternius' | 'mpfb';

export const RIG_KINDS: readonly RigKind[] = ['quaternius', 'mpfb'];

type Side = 'l' | 'r';
type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
type Limb = 'clavicle' | 'upperarm' | 'lowerarm' | 'hand' | 'thigh' | 'calf' | 'foot' | 'toe';

/**
 * Logical bones: the trunk from the hips up (`spine` = the lowest spine bone, Abdomen / spine_01;
 * `spine2` = Torso / spine_02; `chest` = Chest / spine_03), the limbs per side, the finger joints
 * from the knuckle out (`index1_r` = Index1.R / index_01_r).
 */
export type LogicalBone =
  | 'root'
  | 'hips'
  | 'spine'
  | 'spine2'
  | 'chest'
  | 'neck'
  | 'head'
  | `${Limb}_${Side}`
  | `${Finger}${1 | 2 | 3 | 4}_${Side}`;

type NameTable = Readonly<Record<LogicalBone, string | null>>;

const SIDES: readonly Side[] = ['l', 'r'];
const FINGERS: readonly Finger[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const LIMBS: Readonly<Record<Limb, { quaternius: string | null; mpfb: string | null }>> = {
  clavicle: { quaternius: 'Shoulder', mpfb: 'clavicle' },
  upperarm: { quaternius: 'UpperArm', mpfb: 'upperarm' },
  lowerarm: { quaternius: 'LowerArm', mpfb: 'lowerarm' },
  hand: { quaternius: 'Wrist', mpfb: 'hand' },
  thigh: { quaternius: 'UpperLeg', mpfb: 'thigh' },
  calf: { quaternius: 'LowerLeg', mpfb: 'calf' },
  foot: { quaternius: 'Foot', mpfb: 'foot' },
  toe: { quaternius: null, mpfb: 'ball' },
};

function table(kind: RigKind): NameTable {
  const q = kind === 'quaternius';
  const t: Record<string, string | null> = {
    root: 'Root',
    hips: q ? 'Hips' : 'pelvis',
    spine: q ? 'Abdomen' : 'spine_01',
    spine2: q ? 'Torso' : 'spine_02',
    chest: q ? 'Chest' : 'spine_03',
    neck: q ? 'Neck' : 'neck_01',
    head: q ? 'Head' : 'head',
  };
  for (const s of SIDES) {
    for (const [limb, names] of Object.entries(LIMBS)) {
      const n = names[kind];
      t[`${limb}_${s}`] = n === null ? null : q ? `${n}.${s.toUpperCase()}` : `${n}_${s}`;
    }
    for (const f of FINGERS) {
      // Quaternius: Index1..Index4 (Index4 the tip), Thumb1..Thumb3; MPFB: index_01..index_03
      for (const k of [1, 2, 3, 4] as const) {
        const has = q ? k <= (f === 'thumb' ? 3 : 4) : k <= 3;
        const cap = f[0]!.toUpperCase() + f.slice(1);
        t[`${f}${k}_${s}`] = !has ? null : q ? `${cap}${k}.${s.toUpperCase()}` : `${f}_0${k}_${s}`;
      }
    }
  }
  return t as NameTable;
}

/** Logical bone → the bone's name in each rig (null: the rig has no such bone). */
export const BONE_NAMES: Readonly<Record<RigKind, NameTable>> = { quaternius: table('quaternius'), mpfb: table('mpfb') };

/** Every logical bone name. */
export const LOGICAL_BONES = Object.keys(BONE_NAMES.mpfb) as LogicalBone[];

/** A node name as three's GLTFLoader stores it (PropertyBinding.sanitizeNodeName: whitespace → _, `[].:/` dropped). */
export function sanitizeBoneName(name: string): string {
  return name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
}

/** The bone's name in a rig, as written in the source (null: no such bone). */
export function boneName(kind: RigKind, bone: LogicalBone): string | null {
  return BONE_NAMES[kind][bone] ?? null;
}

/**
 * Which rig a skeleton is, from the names it has (raw or sanitized): MPFB has pelvis + spine_01,
 * Quaternius Hips + Abdomen. Null for anything else (animals, a rig we do not know).
 */
export function rigKindOf(has: (name: string) => boolean): RigKind | null {
  const any = (n: string) => has(n) || has(sanitizeBoneName(n));
  if (any('pelvis') && any('spine_01')) return 'mpfb';
  if (any('Hips') && any('Abdomen')) return 'quaternius';
  return null;
}

/**
 * Bones of the upper-body layer (the avatar's and the stand-ins' clip split: swings, gestures and
 * hits play over walking legs): the trunk from `spine2` up, the neck and head, the arms and the
 * fingers. Hips, `spine` and the legs stay with the legs. Names raw and sanitized.
 */
const UPPER: readonly LogicalBone[] = LOGICAL_BONES.filter((b) => b === 'spine2' || b === 'chest' || b === 'neck' || b === 'head' || /^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(b));

const upperCache = new Map<RigKind, ReadonlySet<string>>();

export function upperBones(kind: RigKind): ReadonlySet<string> {
  let s = upperCache.get(kind);
  if (!s) {
    const names = UPPER.map((b) => boneName(kind, b)).filter((n): n is string => n !== null);
    s = new Set([...names, ...names.map(sanitizeBoneName)]);
    upperCache.set(kind, s);
  }
  return s;
}

/** Does an animation track (`<node>.<property>`) drive an upper-body bone of this rig? */
export function isUpperTrack(kind: RigKind, trackName: string): boolean {
  const i = trackName.lastIndexOf('.');
  return upperBones(kind).has(i < 0 ? trackName : trackName.slice(0, i));
}

/**
 * Clip names: the avatar's names (the Quaternius ones, `HitRecieve` as spelled in the pack) →
 * the names a rig's GLB may carry them under, first match wins. The MPFB player's clips are
 * baked under the same names (retarget.py), so most lists hold one name.
 */
export const CLIP_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Idle: ['Idle', 'Idle_Neutral'],
  Idle_Sword: ['Idle_Sword'],
  Walk: ['Walk'],
  Run: ['Run'],
  Run_Back: ['Run_Back'],
  Run_Left: ['Run_Left'],
  Run_Right: ['Run_Right'],
  Interact: ['Interact'],
  Sword_Slash: ['Sword_Slash'],
  Roll: ['Roll'],
  Death: ['Death'],
  HitRecieve: ['HitRecieve', 'HitReceive'],
  HitRecieve_2: ['HitRecieve_2', 'HitReceive_2'],
  Punch_Left: ['Punch_Left'],
  Punch_Right: ['Punch_Right'],
  Wave: ['Wave'],
};

/** The name a clip carries in a GLB (from its clip names), or null. Unknown names match only themselves. */
export function resolveClipName(available: readonly string[], name: string): string | null {
  for (const n of CLIP_ALIASES[name] ?? [name]) if (available.includes(n)) return n;
  return null;
}
