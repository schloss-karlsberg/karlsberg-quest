/**
 * Who stands where at the party (bible 06-enden §8.1, draft x/z "prüfen") and where the props go,
 * around TF-01 (the Ehrenhof clearing of today, 1216 / −1114). Pure data and maths, no three.js.
 *
 * Coordinates are absolute for the default centre; `partyLayout(variant, at)` moves everything by
 * `at − TF01`. Faces name a target (a prop anchor, a person, the centre) or a fixed yaw.
 *
 * Roster (16 people + 2 dogs):
 *  - the guide (people spec `guide`, speaker `imhoff`, placeholder Gerold Imhoff)
 *  - Marlene: no people spec of her own yet → stand-in `extra.7` (olive jacket, forester-like) with a
 *    distinct seed and speaker `marlene` (MARLENE_SPEC picks a real 'marlene' spec once it exists)
 *  - the 7 doubles `double.herzog|mannlich|hanne|peter|jost|soll|liese` (speakers herzogd, mannd,
 *    hanned, peterd, jostd, solld, liesed: the bible-08 line prefixes)
 *  - the 7 extras of §8.1: Mats (`child.compass`), his mother, the couple from Zweibrücken, two
 *    hikers, the student (`extra.1…6`; extra.7 is Marlene's stand-in)
 *  - the dogs `diane`, `bijou` (animals system, `animal:request`)
 */
import type { PersonClip } from '../people/types';
import type { PartyVariant } from './types';

export interface XZ {
  x: number;
  z: number;
}

/** TF-01, the clearing's centre (bible 06 §8: "Ehrenhof-Lichtung von heute, eben, r ≈ 35"). */
export const TF01: XZ = { x: 1216, z: -1114 };
/** The dev / story checkpoint at the clearing's edge (storyboard #24, systems.md §6 beat e3). */
export const PARTY_CHECKPOINT: XZ = { x: 1200, z: -1095 };

/** What a person does at the party (people clips; interact repeats as a one-shot every few seconds). */
export type Activity = Extract<PersonClip, 'sit' | 'talk' | 'sitTalk' | 'interact' | 'idle' | 'lookAround'>;

/** A face target: a prop anchor, another person (by `who`), the centre, the player or a yaw (rad). */
export type Face = { prop: PropId } | { who: string } | 'center' | 'player' | { yaw: number };

export interface Placement {
  /** Stable id at the party: the spec id for the guide and the doubles, a name for the others. */
  who: string;
  spec: string;
  speaker?: string;
  seed?: number;
  x: number;
  z: number;
  face: Face;
  activity: Activity;
  /** A double: gets a spotlight during the credits. */
  double?: boolean;
}

export type PropId =
  | 'table'
  | 'benchTable'
  | 'benchHanne'
  | 'benchKeep'
  | 'chair'
  | 'cake'
  | 'cashBox'
  | 'stove'
  | 'pot'
  | 'punch'
  | 'fireBowl'
  | 'lightsA'
  | 'lightsB'
  | 'lantern1'
  | 'lantern2'
  | 'lantern3'
  | 'archiveBox';

export interface PropSpot extends XZ {
  /** Yaw (rad, 0 = the prop's long side along x). */
  yaw?: number;
  /** Height above the ground of its base (e.g. on the table). */
  up?: number;
}

/** Table top height (m): things on the table stand on it. */
export const TABLE_TOP = 0.76;

/** Prop spots (§8 "Biertisch, Kuchen, Glühweintopf auf Gaskocher, Feuerschale, Lichterkette zwischen zwei Buchen, Laternen"). */
export const PROPS: Readonly<Record<PropId, PropSpot>> = {
  table: { x: 1214, z: -1113.4 },
  benchTable: { x: 1214, z: -1114.15 },
  benchHanne: { x: 1218.05, z: -1122.2 },
  benchKeep: { x: 1205.6, z: -1119.9, yaw: 0.5 },
  chair: { x: 1210, z: -1108, yaw: 0.6 },
  cake: { x: 1213.45, z: -1113.35, up: TABLE_TOP },
  cashBox: { x: 1212.95, z: -1113.6, up: TABLE_TOP },
  stove: { x: 1214.55, z: -1113.3, up: TABLE_TOP },
  pot: { x: 1214.75, z: -1113.3, up: TABLE_TOP },
  punch: { x: 1214.32, z: -1113.3, up: TABLE_TOP },
  fireBowl: { x: 1217.2, z: -1117.6 },
  // the fairy lights' two ends (placeholder posts until the set hangs them on two real beeches)
  lightsA: { x: 1208.6, z: -1111.6, up: 3.4 },
  lightsB: { x: 1220.4, z: -1115.4, up: 3.4 },
  lantern1: { x: 1213.0, z: -1113.15, up: TABLE_TOP },
  lantern2: { x: 1219.0, z: -1121.7 },
  lantern3: { x: 1206.5, z: -1119.2 },
  // museum only: Marlene put the archive box on the table
  archiveBox: { x: 1213.95, z: -1113.5, up: TABLE_TOP },
};

/** Spec for Marlene when the people API has one; else this stand-in with its own seed. */
export const MARLENE_SPEC = 'marlene';
export const MARLENE_STANDIN = { spec: 'extra.7', seed: 9071 };

/** The doubles in roster order (the spotlight order follows the camera's way round, see credits.ts). */
export const DOUBLES = ['double.herzog', 'double.mannlich', 'double.hanne', 'double.peter', 'double.jost', 'double.soll', 'double.liese'] as const;

const BASE: readonly Placement[] = [
  { who: 'guide', spec: 'guide', speaker: 'imhoff', x: 1214, z: -1112, face: { prop: 'table' }, activity: 'interact' },
  { who: 'marlene', spec: MARLENE_SPEC, speaker: 'marlene', x: 1220, z: -1118, face: 'center', activity: 'idle' },
  { who: 'double.herzog', spec: 'double.herzog', speaker: 'herzogd', x: 1210, z: -1108, face: { prop: 'fireBowl' }, activity: 'sit', double: true },
  { who: 'double.mannlich', spec: 'double.mannlich', speaker: 'mannd', x: 1224, z: -1110, face: 'center', activity: 'lookAround', double: true },
  { who: 'double.hanne', spec: 'double.hanne', speaker: 'hanned', x: 1217.6, z: -1122.2, face: { yaw: 0 }, activity: 'sit', double: true },
  { who: 'double.peter', spec: 'double.peter', speaker: 'peterd', x: 1218.5, z: -1122.2, face: { yaw: 0 }, activity: 'sit', double: true },
  { who: 'double.jost', spec: 'double.jost', speaker: 'jostd', x: 1206, z: -1118, face: { yaw: 2.2 }, activity: 'interact', double: true },
  { who: 'double.soll', spec: 'double.soll', speaker: 'solld', x: 1213, z: -1115, face: { prop: 'cashBox' }, activity: 'interact', double: true },
  { who: 'double.liese', spec: 'double.liese', speaker: 'liesed', x: 1222, z: -1114, face: { who: 'marlene' }, activity: 'interact', double: true },
  // the extras, scattered (§8.1: Mats with the toy compass and his mother; a couple from
  // Zweibrücken; two hikers; a student with a thermos)
  { who: 'mats', spec: 'child.compass', x: 1211.4, z: -1116.6, face: { who: 'mutter' }, activity: 'lookAround' },
  { who: 'mutter', spec: 'extra.2', x: 1210.6, z: -1117.3, face: { who: 'mats' }, activity: 'talk' },
  { who: 'paar_a', spec: 'extra.1', x: 1219.4, z: -1109.2, face: { who: 'paar_b' }, activity: 'talk' },
  { who: 'paar_b', spec: 'extra.3', x: 1220.5, z: -1109.9, face: { who: 'paar_a' }, activity: 'talk' },
  { who: 'wanderin_a', spec: 'extra.6', x: 1225.4, z: -1116.6, face: { who: 'wanderin_b' }, activity: 'talk' },
  { who: 'wanderin_b', spec: 'extra.5', x: 1226.2, z: -1117.8, face: { who: 'wanderin_a' }, activity: 'lookAround' },
  { who: 'student', spec: 'extra.4', x: 1215.6, z: -1108.3, face: 'center', activity: 'idle' },
];

/** Per-variant moves (bible 06 §8.3). */
function variantPlacements(variant: PartyVariant): Placement[] {
  const out = BASE.map((p) => ({ ...p }));
  const by = (who: string) => out.find((p) => p.who === who)!;
  if (variant === 'museum') {
    // A: Gerold lifts the top page into the fairy lights' light; Hanne reads over his shoulder; a
    // small group leans in around him
    Object.assign(by('guide'), { activity: 'talk', face: { prop: 'archiveBox' } });
    Object.assign(by('double.hanne'), { x: 1215.0, z: -1111.6, activity: 'idle', face: { who: 'guide' } });
    Object.assign(by('marlene'), { x: 1212.9, z: -1111.5, activity: 'idle', face: { who: 'guide' } });
    Object.assign(by('mats'), { x: 1213.7, z: -1110.8, activity: 'lookAround', face: { who: 'guide' } });
    Object.assign(by('mutter'), { x: 1212.7, z: -1110.6, activity: 'idle', face: { who: 'guide' } });
    Object.assign(by('double.soll'), { face: { who: 'guide' } });
    Object.assign(by('student'), { x: 1215.4, z: -1110.4, face: { who: 'guide' } });
  } else if (variant === 'burn') {
    // B: the fire bowl burns high; the group stands round it warming their hands (Herzog keeps his
    // chair, the couple keeps to itself)
    const ring = ['guide', 'double.mannlich', 'double.hanne', 'double.peter', 'double.soll', 'double.liese', 'marlene', 'double.jost', 'mats', 'mutter', 'wanderin_a', 'student'];
    const f = PROPS.fireBowl;
    ring.forEach((who, i) => {
      const a = (i / ring.length) * Math.PI * 2 + 0.3;
      const r = who === 'mats' ? 2.1 : 2.7;
      Object.assign(by(who), { x: f.x + Math.sin(a) * r, z: f.z + Math.cos(a) * r, activity: who === 'guide' ? 'talk' : 'idle', face: { prop: 'fireBowl' } });
    });
  }
  return out;
}

/** Where the dogs lie per variant (bible 06 §8.3: B far from the fire asleep; C at the player's feet). */
export function dogPlan(variant: PartyVariant): { follow?: string; at?: [XZ, XZ]; shine: number } {
  if (variant === 'keep') return { follow: 'player', shine: 0.6 };
  if (variant === 'burn') return { at: [{ x: 1203.6, z: -1126.2 }, { x: 1202.7, z: -1125.3 }], shine: 0 };
  return { follow: 'npc:double.jost', shine: 0 };
}

export interface PartyLayout {
  centre: XZ;
  people: Placement[];
  props: Record<PropId, PropSpot>;
  dogs: { follow?: string; at?: [XZ, XZ]; shine: number };
}

/** The whole layout of a variant, moved so TF-01 lands on `at`. */
export function partyLayout(variant: PartyVariant, at: XZ = TF01): PartyLayout {
  const dx = at.x - TF01.x;
  const dz = at.z - TF01.z;
  const props = {} as Record<PropId, PropSpot>;
  for (const [k, v] of Object.entries(PROPS) as [PropId, PropSpot][]) props[k] = { ...v, x: v.x + dx, z: v.z + dz };
  const dogs = dogPlan(variant);
  if (dogs.at) dogs.at = [{ x: dogs.at[0].x + dx, z: dogs.at[0].z + dz }, { x: dogs.at[1].x + dx, z: dogs.at[1].z + dz }];
  return {
    centre: { x: at.x, z: at.z },
    people: variantPlacements(variant).map((p) => ({ ...p, x: p.x + dx, z: p.z + dz })),
    props,
    dogs,
  };
}

/** Yaw (player convention: 0 faces −z, + = left) from (x, z) toward (tx, tz). */
export const yawTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));

/** Resolve a placement's face to a yaw. */
export function faceYaw(p: Placement, layout: PartyLayout, player: XZ): number {
  const f = p.face;
  if (f === 'center') return yawTo(p.x, p.z, layout.centre.x, layout.centre.z);
  if (f === 'player') return yawTo(p.x, p.z, player.x, player.z);
  if ('yaw' in f) return f.yaw;
  if ('prop' in f) {
    const q = layout.props[f.prop];
    return yawTo(p.x, p.z, q.x, q.z);
  }
  const o = layout.people.find((q) => q.who === f.who);
  return o ? yawTo(p.x, p.z, o.x, o.z) : yawTo(p.x, p.z, layout.centre.x, layout.centre.z);
}

/** Props a variant shows (the archive box only in A). */
export function propsFor(variant: PartyVariant): PropId[] {
  return (Object.keys(PROPS) as PropId[]).filter((k) => k !== 'archiveBox' || variant === 'museum');
}
