/**
 * The credits over the party (bible 06 §8.2 step 4): the lines, how long the strip runs, and the
 * camera's way round the party that lingers 2–3 s on each double. Pure (no three.js, no DOM).
 *
 * The camera: the cinematic system's `orbit` spec circles at a constant rate and cannot stop on a
 * person, so the way round is written as cinematic `keys` on the same circle (r 14 m around the
 * centre, about one turn in 40 s): travel along the arc (a key every ≤ 0.45 rad, so it bends
 * instead of cutting chords) to the next double, then a 2.6 s dwell close on that double (lower,
 * narrower lens) while `party:spotlight` goes out. The doubles are visited in order of their angle
 * round the centre, so the camera always turns the same way.
 */
import type { CinematicKey } from '../cinematic/types';
import type { XZ } from './placements';

/** Fallback when content/party/credits.json is missing (the story team owns that file). */
export const PLACEHOLDER_LINES = ['Karlsberg Quest', 'Ein Spiel über einen verschwundenen Ort', 'Danke fürs Spielen'];

export const ORBIT = {
  r: 14,
  /** Seconds per full turn (nominal; the dwells slow it down). */
  period: 40,
  /** Eye height over the ground while travelling / dwelling (m). */
  y: 3.2,
  dwellY: 2.1,
  fov: 50,
  dwellFov: 34,
  /** Seconds the camera lingers on a double (2–3 s). */
  dwell: 2.6,
  /** Seconds of the opening move and the closing rise. */
  intro: 3,
  outro: 3.5,
  /** The eye stands this far round from the double's own angle (rad): a three-quarter view. */
  lead: 0.32,
  /** Max arc between two keys (rad). */
  step: 0.45,
} as const;

/** Seconds the strip needs per line (horizontal crawl / reduced-motion step). */
export const STRIP_SECONDS_PER_LINE = 4;
/** The credits run at least this long. */
export const MIN_SECONDS = 20;
/** Grace before Esc / Enter / Space skip the strip when no cinematic owns the skip (s). */
export const SKIP_GRACE = 1;

/** Pick the lines: the request's override, else the file, else the placeholder. Blank entries dropped. */
export function creditLines(override: unknown, file: unknown): string[] {
  const clean = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    const out = v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim());
    return out.length ? out : null;
  };
  const fromFile = file && typeof file === 'object' ? clean((file as { lines?: unknown }).lines) : null;
  return clean(override) ?? fromFile ?? [...PLACEHOLDER_LINES];
}

export interface Spot {
  who: string;
  i: number;
  /** Seconds from the start of the credits when the dwell begins (the event goes out). */
  t: number;
}

export interface CreditsPlan {
  keys: CinematicKey[];
  spots: Spot[];
  /** Length of the camera way (s). */
  camSeconds: number;
  /** Length of the whole credits (max of the camera and the strip). */
  seconds: number;
}

const TAU = Math.PI * 2;
/** Angle round the centre (rad, sin → x, cos → z). */
const angleOf = (c: XZ, p: XZ): number => Math.atan2(p.x - c.x, p.z - c.z);
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** The cinematic keys' limit is 60 s: the camera way stays under this (travel speeds up, dwells stay). */
export const CAM_MAX = 58;
/** The credits outlast the camera way by this (s). */
export const CAM_TAIL = 0.6;

/** The camera way and the spotlight times for these doubles round `centre`. */
export function creditsPlan(centre: XZ, doubles: readonly { who: string; x: number; z: number }[], lineCount: number): CreditsPlan {
  let speed = TAU / ORBIT.period; // rad/s while travelling
  let plan = buildPlan(centre, doubles, lineCount, speed);
  for (let i = 0; i < 6 && plan.camSeconds > CAM_MAX; i++) {
    speed *= (plan.camSeconds / CAM_MAX) * 1.08;
    plan = buildPlan(centre, doubles, lineCount, speed);
  }
  return plan;
}

function buildPlan(centre: XZ, doubles: readonly { who: string; x: number; z: number }[], lineCount: number, speed: number): CreditsPlan {
  const O = ORBIT;
  const eyeAt = (a: number, y: number) => ({ x: round(centre.x + Math.sin(a) * O.r), z: round(centre.z + Math.cos(a) * O.r), y });
  const centreLook = { x: centre.x, z: centre.z, y: 1.2 };
  const ordered = doubles.map((d) => ({ ...d, a: angleOf(centre, d) })).sort((p, q) => p.a - q.a);
  const keys: CinematicKey[] = [];
  const spots: Spot[] = [];
  let t = 0;
  let a = (ordered[0]?.a ?? 0) + O.lead - 0.9;
  let cy = O.y + 0.8;
  keys.push({ t: 0, eye: eyeAt(a, cy), look: centreLook, fov: O.fov });
  const travel = (to: number, y: number, look: CinematicKey['look'], fov: number, minT: number) => {
    const span = to - a;
    const dur = Math.max(minT, span / speed);
    const n = Math.max(1, Math.ceil(Math.abs(span) / O.step));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      // from the height it is at to the target, rising over the party in between
      const ey = cy + (y - cy) * f + (O.y - Math.min(cy, y)) * Math.sin(Math.PI * f);
      const key: CinematicKey = { t: round(t + dur * f), eye: eyeAt(a + span * f, round(ey)), ease: k === n ? 'smooth' : 'linear' };
      if (k === n) {
        key.look = look;
        key.fov = fov;
      }
      keys.push(key);
    }
    t = round(t + dur);
    a = to;
    cy = y;
  };
  ordered.forEach((d, i) => {
    let to = d.a + O.lead;
    while (to <= a + 0.05) to += TAU;
    const head = { x: d.x, z: d.z, y: 1.45 };
    travel(to, O.dwellY, head, O.dwellFov, i === 0 ? O.intro : 1.6);
    spots.push({ who: d.who, i, t });
    // the dwell: drift a little further round, the lens stays on the double
    a += 0.05;
    t = round(t + O.dwell);
    keys.push({ t, eye: eyeAt(a, O.dwellY), look: head, fov: O.dwellFov, ease: 'linear' });
  });
  // the closing rise: a little further round, looking over the whole party
  travel(a + 0.6, O.y + 1.5, centreLook, O.fov, O.outro);
  const camSeconds = t;
  // the camera way ends a moment before the credits, so the cinematic ends on its own (not stopped by us)
  const seconds = Math.max(MIN_SECONDS, camSeconds + CAM_TAIL, lineCount * STRIP_SECONDS_PER_LINE);
  return { keys, spots, camSeconds, seconds: Math.ceil(seconds * 100) / 100 };
}

/**
 * The strip at time t of T: horizontal crawl offset 0..1 (0 = the first line enters at the right
 * edge, 1 = the last line has left at the left), or with reduced motion the index of the line shown.
 */
export function stripAt(t: number, T: number, lines: number, reduced: boolean): { crawl: number; line: number } {
  const k = T > 0 ? Math.max(0, Math.min(1, t / T)) : 1;
  return { crawl: k, line: reduced ? Math.min(lines - 1, Math.floor(k * lines)) : -1 };
}
