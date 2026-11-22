import { describe, expect, it } from 'vitest';
import { BONE_NAMES, CLIP_ALIASES, LOGICAL_BONES, boneName, isUpperTrack, resolveClipName, rigKindOf, sanitizeBoneName, upperBones } from '../src/systems/characters/bones';

/** The joints of the two rigs as their GLBs carry them (pnpm assets:inspect --joints). */
const QUATERNIUS = 'Root, Body, Hips, Abdomen, Torso, Chest, Neck, Head, Shoulder.L, UpperArm.L, LowerArm.L, Wrist.L, Index1.L, Index2.L, Index3.L, Index4.L, Middle1.L, Middle2.L, Middle3.L, Middle4.L, Ring1.L, Ring2.L, Ring3.L, Ring4.L, Pinky1.L, Pinky2.L, Pinky3.L, Pinky4.L, Thumb1.L, Thumb2.L, Thumb3.L, Shoulder.R, UpperArm.R, LowerArm.R, Wrist.R, Index1.R, Index2.R, Index3.R, Index4.R, Middle1.R, Middle2.R, Middle3.R, Middle4.R, Ring1.R, Ring2.R, Ring3.R, Ring4.R, Pinky1.R, Pinky2.R, Pinky3.R, Pinky4.R, Thumb1.R, Thumb2.R, Thumb3.R, UpperLeg.L, LowerLeg.L, UpperLeg.R, LowerLeg.R, Foot.L, PT.L, Foot.R, PT.R'.split(', ');
const MPFB = 'Root, pelvis, spine_01, spine_02, spine_03, clavicle_l, upperarm_l, lowerarm_l, hand_l, index_01_l, index_02_l, index_03_l, middle_01_l, middle_02_l, middle_03_l, pinky_01_l, pinky_02_l, pinky_03_l, ring_01_l, ring_02_l, ring_03_l, thumb_01_l, thumb_02_l, thumb_03_l, clavicle_r, upperarm_r, lowerarm_r, hand_r, index_01_r, index_02_r, index_03_r, middle_01_r, middle_02_r, middle_03_r, pinky_01_r, pinky_02_r, pinky_03_r, ring_01_r, ring_02_r, ring_03_r, thumb_01_r, thumb_02_r, thumb_03_r, neck_01, head, thigh_l, calf_l, foot_l, ball_l, thigh_r, calf_r, foot_r, ball_r'.split(', ');
/** As three's GLTFLoader names the nodes (`.` dropped). */
const QUATERNIUS_LOADED = QUATERNIUS.map(sanitizeBoneName);

/** The avatar's upper-body split before the alias table (Quaternius only). */
const OLD_UPPER = /^(Torso|Chest|Neck|Head|Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;

describe('bone alias table', () => {
  it('maps the core bones of both rigs', () => {
    const want: [string, string, string][] = [
      ['hips', 'Hips', 'pelvis'],
      ['spine', 'Abdomen', 'spine_01'],
      ['spine2', 'Torso', 'spine_02'],
      ['chest', 'Chest', 'spine_03'],
      ['neck', 'Neck', 'neck_01'],
      ['head', 'Head', 'head'],
      ['clavicle_l', 'Shoulder.L', 'clavicle_l'],
      ['upperarm_r', 'UpperArm.R', 'upperarm_r'],
      ['lowerarm_l', 'LowerArm.L', 'lowerarm_l'],
      ['hand_r', 'Wrist.R', 'hand_r'],
      ['thigh_l', 'UpperLeg.L', 'thigh_l'],
      ['calf_r', 'LowerLeg.R', 'calf_r'],
      ['foot_l', 'Foot.L', 'foot_l'],
      ['index1_r', 'Index1.R', 'index_01_r'],
      ['pinky1_r', 'Pinky1.R', 'pinky_01_r'],
      ['thumb3_l', 'Thumb3.L', 'thumb_03_l'],
    ];
    for (const [logical, q, m] of want) {
      expect(boneName('quaternius', logical as never), logical).toBe(q);
      expect(boneName('mpfb', logical as never), logical).toBe(m);
    }
    // bones only one rig has
    expect(boneName('quaternius', 'toe_l')).toBeNull();
    expect(boneName('mpfb', 'toe_r')).toBe('ball_r');
    expect(boneName('quaternius', 'index4_l')).toBe('Index4.L');
    expect(boneName('mpfb', 'index4_l')).toBeNull();
    expect(boneName('quaternius', 'thumb4_r')).toBeNull();
  });

  it('every name in the table is a real joint of its rig', () => {
    for (const b of LOGICAL_BONES) {
      const q = BONE_NAMES.quaternius[b];
      const m = BONE_NAMES.mpfb[b];
      if (q !== null) expect(QUATERNIUS, `${b} → ${q}`).toContain(q);
      if (m !== null) expect(MPFB, `${b} → ${m}`).toContain(m);
    }
    // and every MPFB joint is reachable by a logical name
    const mapped = new Set(LOGICAL_BONES.map((b) => BONE_NAMES.mpfb[b]));
    expect(MPFB.filter((n) => !mapped.has(n))).toEqual([]);
  });

  it('tells the rigs apart by their joints, raw or as loaded', () => {
    expect(rigKindOf((n) => QUATERNIUS.includes(n))).toBe('quaternius');
    expect(rigKindOf((n) => QUATERNIUS_LOADED.includes(n))).toBe('quaternius');
    expect(rigKindOf((n) => MPFB.includes(n))).toBe('mpfb');
    expect(rigKindOf((n) => ['Root', 'Body', 'Spine', 'Head', 'Tail'].includes(n))).toBeNull();
  });

  it('sanitizes like GLTFLoader', () => {
    expect(sanitizeBoneName('UpperArm.L')).toBe('UpperArmL');
    expect(sanitizeBoneName('a b:c/d[e]')).toBe('a_bcde');
    expect(sanitizeBoneName('spine_01')).toBe('spine_01');
  });

  it('the upper-body layer of the surveyor is exactly the old split', () => {
    for (const n of QUATERNIUS_LOADED) expect(isUpperTrack('quaternius', `${n}.quaternion`), n).toBe(OLD_UPPER.test(n));
  });

  it('the upper-body layer of the MPFB rig: spine_02 up, arms, fingers; not the hips, spine_01 or legs', () => {
    const up = MPFB.filter((n) => isUpperTrack('mpfb', `${n}.quaternion`));
    expect(up).toContain('spine_02');
    expect(up).toContain('spine_03');
    expect(up).toContain('neck_01');
    expect(up).toContain('head');
    expect(up).toContain('clavicle_l');
    expect(up).toContain('hand_r');
    expect(up).toContain('pinky_03_r');
    for (const n of ['Root', 'pelvis', 'spine_01', 'thigh_l', 'calf_r', 'foot_l', 'ball_r']) expect(up, n).not.toContain(n);
    // everything but the root, the hips, spine_01 and the eight leg bones
    expect(up.length).toBe(MPFB.length - 11);
    expect(isUpperTrack('mpfb', 'pelvis.position')).toBe(false);
    expect(upperBones('quaternius').has('UpperArmL')).toBe(true);
  });

  it('resolves clip names through the aliases', () => {
    const quaternius = ['Idle', 'Idle_Sword', 'Walk', 'Run', 'HitRecieve', 'Wave'];
    expect(resolveClipName(quaternius, 'Idle')).toBe('Idle');
    expect(resolveClipName(quaternius, 'HitRecieve')).toBe('HitRecieve');
    expect(resolveClipName(['Idle_Neutral', 'HitReceive'], 'Idle')).toBe('Idle_Neutral');
    expect(resolveClipName(['HitReceive'], 'HitRecieve')).toBe('HitReceive');
    expect(resolveClipName(quaternius, 'Roll')).toBeNull();
    expect(resolveClipName(['Custom'], 'Custom')).toBe('Custom');
    // every avatar clip has an entry whose first alias is its own name
    for (const [k, v] of Object.entries(CLIP_ALIASES)) expect(v[0]).toBe(k);
  });
});
