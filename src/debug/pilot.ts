import { Vector3 } from 'three';
import type { GameContext } from '../core/context';
import type { CombatSim, Enemy, SimEvent } from '../systems/combat/sim';

/**
 * Bullet-time pilot (`window.kq.pilot`, docs/NEXT-SESSION.md §3.1, docs/ARCHITECTURE.md "Debug
 * hooks"): an agent plays the game in small slices. The game stands still (`?manual`, or
 * `kq.pilot.bulletTime(true)`), the agent looks at an observation (numbers + a strip of small
 * frames), chooses keys / mouse for the next ≈ 0.25 s, `act()` simulates exactly that, and the
 * game stands still again.
 *
 * Works without pointer lock and without window focus: keys go through `input.simulate`, mouse
 * look through `input.addLook` (the same accumulator real `movementX/Y` feeds) followed by
 * `player.look()` once per step, i.e. the real sensitivity / invert / clamp path.
 */

/** Mouse button use for one act: a click (down one step) or held for the whole act (Wuchthieb charge). */
export type PilotButton = boolean | 'click' | 'hold';

export interface PilotAction {
  /** Key codes held down for every step of the act (`KeyW`, `ShiftLeft` …); up again afterwards unless `keep`. */
  hold?: string[];
  /** Key codes tapped: down for the first `tapSteps` steps (default 2). With a modal / dialogue open they go to the page as real key events. */
  tap?: string[];
  /** Steps a tap stays down (1 … 2, default 2). */
  tapSteps?: number;
  /**
   * Mouse: `dx`/`dy` are look deltas in pixels (as `movementX/Y`; + dx turns right, + dy looks down),
   * spread evenly over the first `lookSteps` steps (default: all of them, a slow pan).
   * `turnDeg` (+ = right) is a turn in degrees at the current sensitivity, done up front: over the
   * first `turnSteps` steps (default 3 = 0.05 s, at most the act's steps). Taps (keys, a mouse click)
   * in the same act go down on the step the turn completes, so a swing goes out in the new direction.
   * `left` / `right`: true or 'click' for a click; 'hold' keeps the button down across the act's
   * steps and lets it up at the end (unless `keep`). A held left button that is released after
   * ≥ 0.45 s is a Wuchthieb: use ≥ 30 steps, or `keep: true` and let go in a later act. While a swing,
   * a hit-stop or an ability is running the press of a held attack waits until it ends (a press then
   * would only queue a light combo hit); the hold time counts from the press.
   */
  mouse?: { dx?: number; dy?: number; turnDeg?: number; lookSteps?: number; turnSteps?: number; left?: PilotButton; right?: PilotButton };
  /** Fixed 60 Hz steps to simulate (default 15 = 0.25 s). 0 = just look. */
  steps?: number;
  /** Frames to capture, evenly spaced over the act, the last one at its end (default 5, 0 = none). */
  frames?: number;
  /** Frame width in px (default 320; height follows the canvas aspect). */
  frameSize?: number;
  /** JPEG quality (default 0.6). */
  quality?: number;
  /** Leave this act's `hold` keys (and a held mouse button) down afterwards; the next act releases the ones it does not hold itself. */
  keep?: boolean;
}

export interface PilotEnemy {
  id: string;
  kind: string;
  /** Display name (German), with an elite's title. */
  name: string;
  /** Distance (m, horizontal). */
  d: number;
  /** Bearing relative to the view (degrees, + = right, ±180 = behind). */
  bearing: number;
  hp: number;
  max: number;
  /** AI state (idle, approach, circle, windup, strike, recover, stagger, gebannt, …). */
  state: string;
  /** Seconds until the telegraphed attack lands (wind-up left), null when none is winding up. */
  telegraph: number | null;
  /** The attack being wound up / struck (id and kind), null otherwise. */
  attack: string | null;
  /** Inside the camera's view (centre of the body). */
  onScreen: boolean;
  boss?: true;
  elite?: true;
  /** Stunned for this many seconds. */
  stun?: number;
}

export interface PilotEvent {
  type: string;
  /** Simulated seconds since the start of the act this event happened in. */
  t: number;
  [k: string]: unknown;
}

export interface PilotObservation {
  /** Simulated seconds since start (fixed steps · 1/60). */
  time: number;
  tick: number;
  /** The simulation is paused (modal / menu / title): `act` does not advance it. */
  paused: boolean;
  player: {
    hp: number;
    max: number;
    stamina: number;
    staminaMax: number;
    exhausted: boolean;
    bann: number;
    x: number;
    z: number;
    /** Facing, degrees clockwise from north (0 = north, 90 = east), as `kq.teleport`. */
    yaw: number;
    pitch: number;
    era: string;
    inCombat: boolean;
    dead: boolean;
  };
  /** Lock-on target id and the soft target. */
  lock: { locked: string | null; soft: string | null };
  /** Enemies within 40 m, nearest first (at most 10). */
  enemies: PilotEnemy[];
  /** What the HUD leads to (compass / waymark): label, distance, bearing relative to the view. */
  objective: { label: string; quest: string | null; objective: string | null; d: number | null; bearing: number | null; tracker: string } | null;
  /** Open dialogue / modal: speaker, text and numbered options (`kq.pilot.choose(n)`). */
  dialogue: { kind: 'npc' | 'choice' | 'modal'; title: string; who: string; text: string; options: { n: number; label: string }[] } | null;
  /**
   * The interaction prompt on screen ("E Sprechen" …; '' when none is shown, also in a fight, where
   * prompts are hidden) and the feature that owns it (E goes to it), subtitles and toasts.
   */
  hud: { prompt: string; promptOwner: string | null; subtitle: string; toasts: string[] };
  /**
   * The radio / spoken-line box (Marlene and the other speakers, bottom centre): whether it is on
   * screen, the speaker's display name and id, its tag (Fiktion / historisch / Echo), the whole line
   * (also the part not typed yet) and whether it is still typing. Enter (`tap: ['Enter']`) skips.
   */
  radio: PilotRadio;
  /**
   * Combat events since the previous act / observe (hits dealt and taken, dodges, KOs, bounces,
   * telegraphs), and `{type: 'inputDropped', input: 'attack' | 'dodge', reason}` when a press had no
   * effect. A press waiting in the combat input buffer (0.25 s, also through hit-stop) is not
   * reported unless it never acts (reasons: 'bufferExpired' = it waited in the buffer and ran out;
   * 'blocked' = attacks off (modal, measuring, flying, talking …); 'skill'; 'dodging'; 'tired';
   * 'noDodge'; 'interact' = the left click went to the interact target; 'dead'; 'recovery' /
   * 'hitstop' = only for a press that did not reach the buffer; 'unknown'), and
   * `{type: 'chooseRejected', n}` for a `choose()` that came before the previous one settled.
   */
  events: PilotEvent[];
  /** JPEG data URLs, evenly spaced over the act. */
  frames: string[];
  /** Exploded-geometry findings so far (`kq.nanWatch`) and the newest one's summary. */
  nanWatch?: { n: number; last: string | null };
}

export interface PilotRadio {
  showing: boolean;
  who: string;
  speaker: string;
  tag: string;
  text: string;
  typing: boolean;
}

export interface PilotApi {
  act(a?: PilotAction): PilotObservation;
  /** The observation without stepping (one frame unless `frames: 0`). */
  observe(opts?: { frames?: number; frameSize?: number; quality?: number }): PilotObservation;
  /**
   * Pick dialogue option n (1-based, as the numbers on the buttons). Returns the label or null.
   * One at a time: after a pick, the next `choose()` is rejected (null, and a `chooseRejected`
   * event) until an `act()` or `observe()` has run, because the next modal may not be on screen
   * yet and the pick would hit the wrong one (`choose(a); choose(b)` in one call).
   */
  choose(n: number): string | null;
  /** Release every key the pilot keeps down. */
  release(): void;
  /** Switch bullet time on / off at runtime (the simulation then runs only through act / kq.step). Returns the state. */
  bulletTime(on?: boolean): boolean;
  /**
   * Show each act's frame strip as an overlay at the bottom of the page (for a screenshot of the
   * browser). It hides while the radio box speaks or a dialogue / modal is open, so it never covers
   * them (updated on every act / observe). Returns the state.
   */
  showStrip(on?: boolean): boolean;
}

// ---- pure helpers (tests/pilot.test.ts) ------------------------------------------------------------

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Player yaw (rad, 0 looks to −z, + turns left) → compass degrees (0 = north, 90 = east). */
export function compassDeg(yaw: number): number {
  return (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
}

/** Wrap degrees to (−180, 180]. */
export function wrap180(d: number): number {
  let r = ((d % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r;
}

/** Bearing of x/z seen from px/pz relative to the view yaw (degrees, + = right). */
export function relBearing(px: number, pz: number, yaw: number, x: number, z: number): number {
  const target = (Math.atan2(x - px, -(z - pz)) * 180) / Math.PI;
  return wrap180(target - compassDeg(yaw));
}

/** Seconds left of an enemy's wind-up, null when it is not winding up. */
export function telegraphLeft(e: Pick<Enemy, 'state' | 't' | 'windup'>): number | null {
  if (e.state !== 'windup' || !(e.windup > 0)) return null;
  return r2(Math.max(0, e.windup - e.t));
}

type EnemyLike = Pick<Enemy, 'id' | 'kind' | 'x' | 'z' | 'hp' | 'maxHp' | 'state' | 't' | 'windup' | 'attack' | 'boss' | 'elite' | 'stun'> & { title?: string; def: { name_de: string } };

/** The enemies within `range` m, nearest first, as the observation shows them. */
export function summarizeEnemies(px: number, pz: number, yaw: number, list: readonly EnemyLike[], onScreen: (e: EnemyLike) => boolean, range = 40, max = 10): PilotEnemy[] {
  const out: (PilotEnemy & { _d: number })[] = [];
  for (const e of list) {
    const d = Math.hypot(e.x - px, e.z - pz);
    if (d > range) continue;
    const tl = telegraphLeft(e);
    const pe: PilotEnemy & { _d: number } = {
      _d: d,
      id: e.id,
      kind: e.kind,
      name: e.title ? `${e.title} (${e.def.name_de})` : e.def.name_de,
      d: r1(d),
      bearing: Math.round(relBearing(px, pz, yaw, e.x, e.z)),
      hp: Math.round(e.hp),
      max: Math.round(e.maxHp),
      state: e.state,
      telegraph: tl,
      attack: (e.state === 'windup' || e.state === 'strike') && e.attack ? `${e.attack.id} (${e.attack.kind})` : null,
      onScreen: onScreen(e),
    };
    if (e.boss) pe.boss = true;
    if (e.elite) pe.elite = true;
    if (e.stun > 0) pe.stun = r2(e.stun);
    out.push(pe);
  }
  out.sort((a, b) => a._d - b._d);
  return out.slice(0, max).map(({ _d, ...e }) => e);
}

/** One sim event → the compact form the observation lists (null: noise the pilot does not need). */
export function summarizeSimEvent(ev: SimEvent, t: number): PilotEvent | null {
  const who = (e: Pick<Enemy, 'id' | 'kind'>) => ({ id: e.id, kind: e.kind });
  const T = r2(t);
  switch (ev.type) {
    case 'hit':
      return { type: 'hit', t: T, ...who(ev.e), dmg: Math.round(ev.damage), heavy: ev.heavy, ...(ev.finisher ? { finisher: true } : {}), ...(ev.armored ? { armored: true } : {}), ...(ev.weak ? { weak: true } : {}), hpLeft: Math.round(ev.e.hp) };
    case 'playerHit':
      return { type: 'hurt', t: T, dmg: Math.round(ev.damage), by: ev.by, heavy: ev.heavy };
    case 'dodge':
      return { type: 'dodge', t: T, perfect: ev.perfect, ...(ev.stumble ? { stumble: true } : {}) };
    case 'evade':
      return { type: 'evade', t: T, by: ev.by };
    case 'killed':
      return { type: 'ko', t: T, ...who(ev.e), by: ev.by };
    case 'died':
      return { type: 'died', t: T, by: ev.by };
    case 'blocked':
      return { type: 'bounce', t: T, ...who(ev.e) };
    case 'guardBreak':
    case 'flank':
    case 'immune':
    case 'warded':
    case 'wardBreak':
    case 'crack':
    case 'reform':
    case 'resist':
    case 'finishable':
    case 'finisher':
    case 'enrage':
    case 'callBroken':
    case 'balk':
      return { type: ev.type, t: T, ...who(ev.e) };
    case 'reflect':
      return { type: 'reflect', t: T, ...who(ev.e), seconds: r2(ev.seconds) };
    case 'telegraph':
      return { type: 'telegraph', t: T, ...who(ev.e), attack: `${ev.attack.id} (${ev.attack.kind})`, dur: r2(ev.dur) };
    case 'strike':
      return { type: 'strike', t: T, ...who(ev.e), attack: ev.attack.id };
    case 'swing':
      return { type: 'swing', t: T, kind: ev.kind, combo: ev.combo };
    case 'whiff':
      return { type: 'whiff', t: T, kind: ev.kind };
    case 'stun':
      return { type: 'stun', t: T, ...who(ev.e), seconds: r2(ev.seconds) };
    case 'phase':
      return { type: 'phase', t: T, ...who(ev.e), phase: ev.phase };
    case 'summon':
      return { type: 'summon', t: T, ...who(ev.e), add: ev.kind, n: ev.n };
    case 'heal':
      return { type: 'heal', t: T, amount: Math.round(ev.amount), by: ev.by };
    case 'bann':
      return { type: 'bann', t: T, hits: ev.hits };
    case 'impact':
      return ev.hitPlayer ? { type: 'shotHit', t: T } : null;
    case 'hazardHit':
      return ev.player ? { type: 'hazardHit', t: T, kind: ev.kind } : null;
    case 'skill':
      return { type: 'skill', t: T, id: ev.id };
    case 'skillDenied':
      return { type: 'skillDenied', t: T, id: ev.id, why: ev.why };
    case 'combat':
      return { type: ev.on ? 'combatStart' : 'combatEnd', t: T };
    case 'tired':
    case 'noBann':
    case 'dazzled':
    case 'immuneHint':
      return { type: ev.type, t: T };
    case 'intro':
      return { type: 'bossIntro', t: T, ...who(ev.e) };
    case 'bossGuard':
      return { type: 'bossGuard', t: T, ...who(ev.e), why: ev.why };
    default:
      return null;
  }
}

/**
 * How an act's look is spread over its steps: `dx`/`dy` evenly over the first `lookSteps` steps
 * (default all), the `turnDx` pixels of a `turnDeg` over the first `turnSteps` (default 3, at most
 * `steps`). `turnEnd` is the step (1-based) the turn completes on, 0 without a turn.
 */
export function lookPlan(steps: number, dx: number, dy: number, turnDx: number, lookSteps?: number, turnSteps?: number): { dx: number[]; dy: number[]; turnEnd: number } {
  const n = Math.max(0, Math.round(steps));
  const outX = new Array<number>(n).fill(0);
  const outY = new Array<number>(n).fill(0);
  if (n === 0) return { dx: outX, dy: outY, turnEnd: 0 };
  const ls = Math.max(1, Math.min(n, Math.round(lookSteps ?? n)));
  for (let i = 0; i < ls; i++) {
    outX[i]! += dx / ls;
    outY[i]! += dy / ls;
  }
  let turnEnd = 0;
  if (turnDx) {
    const ts = Math.max(1, Math.min(n, Math.round(turnSteps ?? 3)));
    for (let i = 0; i < ts; i++) outX[i]! += turnDx / ts;
    turnEnd = ts;
  }
  return { dx: outX, dy: outY, turnEnd };
}

/** Steps (1-based, inclusive) a tap is down: from the step a turn completes (or 1) for `tapSteps` steps. */
export function tapWindow(steps: number, tapSteps: number, turnEnd: number): { down: number; up: number } {
  const down = Math.max(1, Math.min(Math.max(1, steps), turnEnd || 1));
  return { down, up: Math.max(down, Math.min(Math.max(1, steps), down + Math.max(1, tapSteps) - 1)) };
}

/** The prompt line as the player sees it ('' when none is shown or a fight hides prompts). */
export function promptLine(p: { key: string | null; text: string } | null, inCombat: boolean): string {
  if (!p || inCombat) return '';
  return clean(`${p.key ?? ''} ${p.text}`, 120);
}

/** The radio box as the observation shows it (from the box's classes and texts). */
export function summarizeRadio(o: { show: boolean; hidden: boolean; who: string; speaker: string; tag: string; text: string; speaking: boolean }): PilotRadio {
  const showing = o.show && !o.hidden;
  return { showing, who: clean(o.who, 80), speaker: o.speaker, tag: clean(o.tag, 40), text: clean(o.text, 400), typing: showing && o.speaking };
}

/** The player's combat state before a sim step, as far as a press needs it. */
export interface PressBefore {
  dead: boolean;
  /** Hit-stop seconds left (the player's moves are skipped this step while > 0). */
  freeze: number;
  swing: boolean;
  dodging: boolean;
  skill: boolean;
  /** Input buffer seconds left (`p.bufAtk` / `p.bufDodge`; 0 = empty). */
  bufAtk?: number;
  bufDodge?: number;
}

/** The player's combat state after a sim step, as far as a press needs it. */
export interface PressAfter {
  queued: boolean;
  hold: number;
  skill: boolean;
  dead?: boolean;
  /** Input buffer seconds left after the step: a press still waiting there was not lost (yet). */
  bufAtk?: number;
  bufDodge?: number;
}

export interface DroppedInput {
  input: 'attack' | 'dodge';
  reason: string;
}

/** The parts of the combat sim the press bookkeeping reads (never writes). */
interface PressSim {
  readonly freeze: number;
  readonly p: { dead: boolean; swing: unknown; dodge: unknown; skill: unknown; queued: boolean; hold: number; bufAtk: number; bufDodge: number };
}

/** Read the press-relevant player state before a step (read-only). */
export function pressBefore(s: PressSim): PressBefore {
  const p = s.p;
  return { dead: p.dead, freeze: s.freeze, swing: !!p.swing, dodging: !!p.dodge, skill: !!p.skill, bufAtk: p.bufAtk, bufDodge: p.bufDodge };
}

/** Read the press-relevant player state after a step (read-only). */
export function pressAfter(s: PressSim): PressAfter {
  const p = s.p;
  return { queued: p.queued, hold: p.hold, skill: !!p.skill, dead: p.dead, bufAtk: p.bufAtk, bufDodge: p.bufDodge };
}

/**
 * Presses a sim step swallowed (pure; the pilot taps the live sim's step with it): an attack press
 * that started no swing, queued no combo hit, began no hold and is not waiting in the input buffer,
 * a dodge press without a roll that is not waiting in the buffer. A buffered press is not reported
 * here; {@link PressTracker} follows it until it acts or runs out (`bufferExpired`).
 * `pilotAttack`: the pilot pressed attack this step (a press the combat layer gave to the interact
 * target never reaches the sim).
 */
export function droppedInputs(
  inp: { attackPressed: boolean; dodgePressed: boolean; blocked: boolean; noDodge?: boolean },
  before: PressBefore,
  after: PressAfter,
  out: readonly { type: string }[],
  pilotAttack = false,
): DroppedInput[] {
  const res: DroppedInput[] = [];
  const has = (t: string) => out.some((e) => e.type === t);
  // a dead player's press still lands in the buffer (the sim skips the player's moves) but is lost
  const gate = (): string | null => (before.freeze > 0 ? 'hitstop' : inp.blocked ? 'blocked' : null);
  if (inp.attackPressed) {
    const g = gate();
    if (before.dead) res.push({ input: 'attack', reason: 'dead' });
    else if ((after.bufAtk ?? 0) > 0) {
      // buffered (hit-stop, a swing outside the combo window): it may still act
    } else if (g) res.push({ input: 'attack', reason: g });
    else if (has('swing') || after.queued || after.hold >= 0) {
      // taken: a swing, a buffered combo hit or the start of a hold
    } else if (before.skill || after.skill) res.push({ input: 'attack', reason: 'skill' });
    else if (has('tired')) res.push({ input: 'attack', reason: 'tired' });
    else if (before.swing) res.push({ input: 'attack', reason: 'recovery' });
    else res.push({ input: 'attack', reason: 'unknown' });
  } else if (pilotAttack) res.push({ input: 'attack', reason: 'interact' });
  if (inp.dodgePressed) {
    const g = gate();
    if (before.dead) res.push({ input: 'dodge', reason: 'dead' });
    else if ((after.bufDodge ?? 0) > 0) {
      // buffered (hit-stop, a roll in progress): it may still act
    } else if (g) res.push({ input: 'dodge', reason: g });
    else if (inp.noDodge) res.push({ input: 'dodge', reason: 'noDodge' });
    else if (has('dodge')) {
      // taken
    } else if (before.skill || after.skill) res.push({ input: 'dodge', reason: 'skill' });
    else if (before.dodging) res.push({ input: 'dodge', reason: 'dodging' });
    else if (has('tired')) res.push({ input: 'dodge', reason: 'tired' });
    else res.push({ input: 'dodge', reason: 'unknown' });
  }
  return res;
}

/**
 * Follows presses through the combat sim's input buffer (INPUT_BUFFER, round 10): a press that
 * lands in the buffer is not reported when made; it is reported later only if it never acts:
 * `bufferExpired` when its time ran out, or the reason the buffer was cleared (dead, blocked,
 * skill, tired, unknown). Deterministic: it reads the sim's state before and after each step and
 * never changes it. A new press while one waits refreshes the same buffer slot (one press).
 */
export class PressTracker {
  private readonly pend = { attack: false, dodge: false };

  /** Is a press of this input waiting in the buffer (as far as the tracker saw)? */
  pending(input: 'attack' | 'dodge'): boolean {
    return this.pend[input];
  }

  step(
    dt: number,
    inp: { attackPressed: boolean; dodgePressed: boolean; blocked: boolean; noDodge?: boolean },
    before: PressBefore,
    after: PressAfter,
    out: readonly { type: string }[],
    pilotAttack = false,
  ): DroppedInput[] {
    const res = droppedInputs(inp, before, after, out, pilotAttack);
    const has = (t: string) => out.some((e) => e.type === t);
    for (const input of ['attack', 'dodge'] as const) {
      const atk = input === 'attack';
      const pressed = atk ? inp.attackPressed : inp.dodgePressed;
      const buf = (atk ? after.bufAtk : after.bufDodge) ?? 0;
      const prev = (atk ? before.bufAtk : before.bufDodge) ?? 0;
      if (pressed) {
        // a press reported as dropped also ends one that was waiting (the same buffer slot)
        this.pend[input] = !before.dead && buf > 0 && !res.some((d) => d.input === input);
        continue;
      }
      if (!this.pend[input]) continue;
      if (buf > 0 && !after.dead) continue;
      this.pend[input] = false;
      let reason: string | null;
      if (before.dead || after.dead) reason = 'dead';
      else if (prev <= dt + 1e-9) reason = 'bufferExpired';
      else if (atk ? has('swing') || after.queued || after.hold >= 0 : has('dodge')) reason = null;
      else if (inp.blocked) reason = 'blocked';
      else if (before.skill || after.skill) reason = 'skill';
      else if (has('tired')) reason = 'tired';
      else reason = 'unknown';
      if (reason) res.push({ input, reason });
    }
    return res;
  }
}

/** May a held attack be pressed now (a press would begin a hold, not queue a combo hit or be lost)? */
export function attackReady(p: { dead: boolean; swing: unknown; skill: unknown } | null | undefined, freeze: number): boolean {
  if (!p) return true;
  return !p.dead && !p.swing && !p.skill && !(freeze > 0);
}

/**
 * Is the frame strip shown? It spans the bottom of the page, where the radio box, subtitles and
 * prompt sit: it steps aside while the radio speaks or a dialogue / modal is open (playtest round
 * 10: it covered the radio in screenshots). The act's frames are in the observation either way.
 */
export function stripVisible(radioShowing: boolean, dialogueOpen: boolean): boolean {
  return !radioShowing && !dialogueOpen;
}

/** `choose()` one at a time: a pick blocks the next until the pilot looked again (act / observe). */
export class ChooseGate {
  private pending = false;
  /** May a pick go out now? Marks it pending if so. */
  begin(): boolean {
    if (this.pending) return false;
    this.pending = true;
    return true;
  }
  /** The pick found nothing to click: not pending after all. */
  cancel(): void {
    this.pending = false;
  }
  /** The pilot looked again: the next pick may go. */
  settle(): void {
    this.pending = false;
  }
  get busy(): boolean {
    return this.pending;
  }
}

// ---- the in-game side -------------------------------------------------------------------------------

const clean = (s: string | null | undefined, max = 400) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const txt = (root: ParentNode, sel: string, max = 400) => clean(root.querySelector<HTMLElement>(sel)?.textContent, max);
/** Visible text with its line / block breaks kept as `sep` (innerText; textContent where there is no layout). */
const inner = (el: HTMLElement | null | undefined, sep: string, max = 300) =>
  clean((el?.innerText ?? el?.textContent ?? '').split('\n').map((l) => l.trim()).filter((l) => /[\p{L}\p{N}]/u.test(l)).join(sep), max);
const visible = (el: HTMLElement) => !el.hasAttribute('disabled') && (el.offsetParent !== null || el.getClientRects().length > 0);

/** The open dialogue / modal (top of the stack) or a non-modal story choice card, with its options. */
function readDialogue(): { obs: PilotObservation['dialogue']; buttons: HTMLElement[]; inline?: boolean } {
  const modals = [...document.querySelectorAll<HTMLElement>('.kq-modal')];
  const top = modals[modals.length - 1];
  const card = document.querySelector<HTMLElement>('.kqs-choice-card[data-testid="story-choice"]');
  const root = top ?? card;
  if (!root) return { obs: null, buttons: [] };
  let kind: 'npc' | 'choice' | 'modal' = 'modal';
  let buttons: HTMLElement[];
  let text: string;
  let who = '';
  if (root.classList.contains('kqn-modal')) {
    kind = 'npc';
    who = txt(root, '.kqn-who', 80);
    text = [txt(root, '.kqn-text', 600), txt(root, '.kqn-card-slot:not(.kqn-hidden)', 400), txt(root, '.kqn-header:not(.kqn-hidden)', 160)].filter(Boolean).join(' | ');
    buttons = [...root.querySelectorAll<HTMLElement>('.kqn-topic')];
  } else if (root.querySelector('.kqs-choice')) {
    kind = 'choice';
    text = [txt(root, '.kqs-choice-prompt'), txt(root, '.kqs-choice-note', 200)].filter(Boolean).join(' | ');
    buttons = [...root.querySelectorAll<HTMLElement>('.kqs-choice-btn')];
  } else {
    text = txt(root, '.kq-modal-body', 600) || clean(root.textContent, 600);
    buttons = [...root.querySelectorAll<HTMLElement>('button:not(.close)')].filter(visible).slice(0, 16);
  }
  const options = buttons.map((b, i) => ({ n: i + 1, label: clean(b.textContent, 80).replace(/^(?:\d+|•)\s*/, '') }));
  return { obs: { kind, title: txt(root, ':scope > h2', 120) || clean(root.getAttribute('aria-label'), 120), who, text, options }, buttons, inline: root === card };
}

/** Compact JPEG data URL of the canvas, read right after a render (no preserveDrawingBuffer needed). */
function nanWatchInfo(): PilotObservation['nanWatch'] {
  const f = window.kq?.nanWatch?.findings();
  return f ? { n: f.length, last: f.at(-1)?.summary ?? null } : undefined;
}

function grab(src: HTMLCanvasElement, scratch: HTMLCanvasElement, width: number, quality: number): string {
  const w = Math.max(32, Math.round(width));
  const h = Math.max(18, Math.round((w * (src.height || 9)) / (src.width || 16)));
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  const g = scratch.getContext('2d');
  if (!g) return '';
  g.drawImage(src, 0, 0, w, h);
  return scratch.toDataURL('image/jpeg', quality);
}

/** The radio / spoken-line box (src/systems/story/dialogue/presenter.ts). */
function readRadio(): PilotRadio {
  const el = document.querySelector<HTMLElement>('.kqs-dlg');
  if (!el) return summarizeRadio({ show: false, hidden: false, who: '', speaker: '', tag: '', text: '', speaking: false });
  return summarizeRadio({
    show: el.classList.contains('kqs-show'),
    hidden: el.style.visibility === 'hidden',
    who: txt(el, '.kqs-who', 80),
    speaker: el.dataset.speaker ?? '',
    tag: txt(el, '.kqs-tag', 40),
    text: txt(el, '.kqs-dlg-text', 400),
    speaking: el.classList.contains('kqs-speaking'),
  });
}

/** Key codes of the attack action (a held one waits for a moment it can begin a hold). */
const ATTACK_CODES = new Set(['Mouse0', 'KeyK']);
/** Key codes that go to the page as real key events too (the radio box skips on Enter). */
const PAGE_KEYS = new Set(['Enter', 'NumpadEnter']);

export function installPilot(ctx: GameContext): PilotApi {
  const events: PilotEvent[] = [];
  /** Simulated seconds at the start of the current act (event times are relative to it). */
  let actStart = ctx.loop.time;
  const kept = new Set<string>();
  const scratch = document.createElement('canvas');
  const v = new Vector3();
  let stripEl: HTMLElement | null = null;
  const gate = new ChooseGate();
  /** The pilot put an attack press edge into the current step (a press that never reaches the sim is reported). */
  let pilotAttackEdge = false;

  const combat = () => window.kq?.combat;
  const sim = () => combat()?.sim() ?? null;

  /** Tap the combat sim's events: wrap `step` on the live sim instance once (it may be replaced). */
  const tap = () => {
    const s = sim() as (CombatSim & { __pilot?: boolean }) | null;
    if (!s || s.__pilot) return;
    s.__pilot = true;
    const step = s.step.bind(s);
    // presses waiting in this sim's input buffer (a new sim starts with an empty one)
    const presses = new PressTracker();
    s.step = (dt, inp) => {
      const before = pressBefore(s);
      const out = step(dt, inp);
      const t = ctx.loop.time - actStart;
      for (const ev of out) {
        const pe = summarizeSimEvent(ev, t);
        if (pe) events.push(pe);
      }
      // swallowed presses (playtest round 10: dropped clicks looked like tooling problems)
      for (const d of presses.step(dt, inp, before, pressAfter(s), out, pilotAttackEdge)) events.push({ type: 'inputDropped', t: r2(t), ...d });
      pilotAttackEdge = false;
      if (events.length > 200) events.splice(0, events.length - 200);
      return out;
    };
  };

  const onScreen = (e: { x: number; z: number; y?: number }) => {
    const cam = ctx.camera;
    v.set(e.x, (e.y ?? ctx.world.heightAt(e.x, e.z)) + 0.9, e.z).project(cam);
    return v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
  };

  const observation = (frames: string[]): PilotObservation => {
    const radio = readRadio();
    const dialogue = readDialogue().obs;
    if (stripEl) stripEl.style.display = stripVisible(radio.showing, dialogue !== null) ? 'flex' : 'none';
    const pl = ctx.player;
    const px = pl.position.x;
    const pz = pl.position.z;
    const s = sim();
    const p = s?.p;
    const lead = window.kq?.quests?.lead() ?? null;
    const tg = combat()?.target() ?? { locked: null, soft: null };
    // a bare glyph (the story line's ◆ before its text is in) is no objective
    const meaningful = (x: string) => (/\p{L}/u.test(x) ? x : '');
    const storyObj = meaningful(txt(document, '.kq-tl .kqs-objective', 200));
    // innerText keeps the tracker's lines apart (quest title, goal, distance)
    const tracker = inner(document.querySelector<HTMLElement>('.kqq-tracker'), ' | ') || storyObj;
    const objective =
      lead || tracker
        ? {
            label: lead?.label ?? storyObj,
            quest: lead?.quest ?? null,
            objective: lead?.objective ?? null,
            d: lead && lead.x !== null && lead.z !== null ? Math.round(Math.hypot(lead.x - px, lead.z - pz)) : null,
            bearing: lead && lead.x !== null && lead.z !== null ? Math.round(relBearing(px, pz, pl.yaw, lead.x, lead.z)) : null,
            tracker,
          }
        : null;
    return {
      time: r2(ctx.loop.time),
      tick: ctx.loop.tick,
      paused: ctx.pause.paused,
      player: {
        hp: Math.round(p?.hp ?? 0),
        max: Math.round(p?.max ?? 0),
        stamina: Math.round(p?.st.stamina ?? 0),
        staminaMax: Math.round(p?.st.max ?? 0),
        exhausted: p?.st.exhausted ?? false,
        bann: p?.bann ?? 0,
        x: r1(px),
        z: r1(pz),
        yaw: Math.round(compassDeg(pl.yaw)),
        pitch: Math.round((pl.pitch * 180) / Math.PI),
        era: ctx.era.current,
        inCombat: p?.inCombat ?? false,
        dead: p?.dead ?? false,
      },
      lock: { locked: tg.locked, soft: tg.soft },
      enemies: s ? summarizeEnemies(px, pz, pl.yaw, s.enemies, (e) => onScreen(e as Enemy)) : [],
      objective,
      dialogue,
      hud: {
        // from the prompt state: the element keeps its last text after it hides (round 10: stale prompts)
        prompt: promptLine(ctx.ui.hud.promptShown(), document.body.classList.contains('kq-in-combat')),
        promptOwner: ctx.ui.hud.promptShown()?.owner ?? null,
        subtitle: txt(ctx.ui.hud.el, '.kq-subtitles', 300),
        toasts: [...ctx.ui.hud.el.querySelectorAll<HTMLElement>('.kq-toast')].map((t) => clean(t.textContent, 160)),
      },
      radio,
      events: events.splice(0),
      frames,
      nanWatch: nanWatchInfo(),
    };
  };

  const showFrames = (frames: string[]) => {
    if (!stripEl) return;
    stripEl.replaceChildren(
      ...frames.map((src) => {
        const img = Object.assign(document.createElement('img'), { src });
        img.style.cssText = 'height:min(180px,20vh);width:auto;max-width:calc(100vw / ' + frames.length + ' - 2px);object-fit:contain';
        return img;
      }),
    );
  };

  /** A real key event to the page (dialogue / modals listen to keydown, the game input is off then). */
  const keyEvent = (code: string) => {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code;
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }));
  };

  const api: PilotApi = {
    act(a = {}) {
      tap();
      gate.settle();
      actStart = ctx.loop.time;
      const input = ctx.input;
      const steps = Math.max(0, Math.round(a.steps ?? 15));
      const nFrames = Math.max(0, Math.round(a.frames ?? 5));
      const width = a.frameSize ?? 320;
      const quality = a.quality ?? 0.6;
      const m = a.mouse ?? {};
      const btn = (b: PilotButton | undefined, code: string, holds: Set<string>, taps: Set<string>) => {
        if (b === 'hold') holds.add(code);
        else if (b) taps.add(code);
      };
      const holds = new Set(a.hold ?? []);
      const taps = new Set(a.tap ?? []);
      btn(m.left, 'Mouse0', holds, taps);
      btn(m.right, 'Mouse2', holds, taps);
      // kept keys the caller no longer holds come up now
      for (const c of [...kept]) if (!holds.has(c)) {
        input.simulate(c, false);
        kept.delete(c);
      }
      // a modal / dialogue: the game input is off, taps go to the page as real key events; Enter
      // also goes to the page outside modals (the radio box skips on it, round 10)
      const modal = ctx.pause.paused && document.querySelector('.kq-modal') !== null;
      for (const c of taps) if (!c.startsWith('Mouse') && (modal || PAGE_KEYS.has(c))) keyEvent(c);
      const gameTaps = modal ? [] : [...taps].filter((c) => !PAGE_KEYS.has(c));
      // look: pixels like movementX/Y; turnDeg converts at the current sensitivity and is done up
      // front (round 10: spread over the act, a click in the same act swung before the turn was done)
      const k = 0.0022 * ctx.player.mouseSensitivity * (ctx.player.invertX ? -1 : 1);
      const turnDx = m.turnDeg ? (m.turnDeg * Math.PI) / 180 / k : 0;
      const plan = lookPlan(steps, m.dx ?? 0, m.dy ?? 0, turnDx, m.lookSteps, m.turnSteps);
      const win = tapWindow(steps, Math.round(a.tapSteps ?? 2), plan.turnEnd);
      const frames: string[] = [];
      const at = new Set<number>();
      for (let i = 1; i <= nFrames && steps > 0; i++) at.add(Math.max(1, Math.round((i * steps) / nFrames)));
      const canvas = ctx.renderer.domElement;
      let lastRender = 0;
      // a held attack presses once a hold can begin (round 10: pressed during a combo swing it only
      // queued a light hit, so a Wuchthieb could not be tried)
      const waiting = new Set(modal || steps === 0 ? [] : [...holds].filter((c) => ATTACK_CODES.has(c) && !kept.has(c)));
      for (const c of holds) if (!kept.has(c) && !waiting.has(c)) input.simulate(c, true);
      const look = (dx: number, dy: number) => {
        if (!dx && !dy) return;
        input.addLook(dx, dy);
        if (!ctx.pause.paused) ctx.player.look();
      };
      if (steps === 0) look((m.dx ?? 0) + turnDx, m.dy ?? 0);
      for (let i = 1; i <= steps; i++) {
        // holds stay down even if a window blur cleared the key set (no new press edge)
        for (const c of holds) if (!waiting.has(c)) input.simulate(c, true, false);
        look(plan.dx[i - 1]!, plan.dy[i - 1]!);
        pilotAttackEdge = i === 1 && [...holds].some((c) => ATTACK_CODES.has(c) && !kept.has(c) && !waiting.has(c));
        if (i === win.down)
          for (const c of gameTaps) {
            input.simulate(c, true);
            if (ATTACK_CODES.has(c)) pilotAttackEdge = true;
          }
        if (waiting.size && !ctx.pause.paused && i >= plan.turnEnd) {
          const s = sim();
          if (attackReady(s?.p, s?.freeze ?? 0)) {
            for (const c of waiting) input.simulate(c, true);
            waiting.clear();
            pilotAttackEdge = true;
          }
        }
        if (!ctx.pause.paused) ctx.loop.advance(1);
        pilotAttackEdge = false;
        if (i === win.up) for (const c of gameTaps) if (!holds.has(c)) input.simulate(c, false);
        if (at.has(i)) {
          ctx.loop.renderOnce((i - lastRender) * ctx.loop.dt);
          lastRender = i;
          frames.push(grab(canvas, scratch, width, quality));
        }
      }
      if (waiting.size) {
        const s = sim();
        const reason = !s ? 'unknown' : s.p.dead ? 'dead' : s.p.skill ? 'skill' : s.freeze > 0 ? 'hitstop' : 'recovery';
        events.push({ type: 'inputDropped', t: r2(ctx.loop.time - actStart), input: 'attack', reason, hold: true });
      }
      for (const c of gameTaps) if (!holds.has(c)) input.simulate(c, false);
      for (const c of holds) {
        if (waiting.has(c)) continue;
        if (a.keep) kept.add(c);
        else input.simulate(c, false);
      }
      if (lastRender < steps || steps === 0) {
        ctx.loop.renderOnce((steps - lastRender) * ctx.loop.dt);
        if (nFrames > 0 && frames.length === 0) frames.push(grab(canvas, scratch, width, quality));
      }
      showFrames(frames);
      return observation(frames);
    },
    observe(o = {}) {
      tap();
      gate.settle();
      const n = Math.max(0, Math.round(o.frames ?? 1));
      ctx.loop.renderOnce(0);
      const frames = n > 0 ? [grab(ctx.renderer.domElement, scratch, o.frameSize ?? 320, o.quality ?? 0.6)] : [];
      return observation(frames);
    },
    choose(n) {
      // one pick at a time: the next modal may not be on screen yet (round 10: choose(a); choose(b))
      if (!gate.begin()) {
        events.push({ type: 'chooseRejected', t: r2(ctx.loop.time - actStart), n, reason: 'pending' });
        return null;
      }
      const { buttons, obs, inline } = readDialogue();
      const b = buttons[n - 1];
      const option = obs?.options[n - 1];
      if (!b || !option || (inline && !window.kq?.story?.choose(n - 1))) {
        gate.cancel();
        return null;
      }
      if (!inline) b.click();
      return option.label;
    },
    release() {
      for (const c of kept) ctx.input.simulate(c, false);
      kept.clear();
    },
    bulletTime(on) {
      ctx.loop.manual = on ?? !ctx.loop.manual;
      ctx.ui.hud.setBulletTime(ctx.loop.manual);
      // bullet time draws only on request (act / observe / kq.step / screenshotReady): show the badge now
      ctx.loop.requestRender();
      return ctx.loop.manual;
    },
    showStrip(on) {
      const want = on ?? !stripEl;
      if (want && !stripEl) {
        stripEl = document.createElement('div');
        stripEl.dataset.testid = 'pilot-strip';
        stripEl.style.cssText = 'position:fixed;left:0;right:0;bottom:0;display:flex;gap:2px;justify-content:center;z-index:60;pointer-events:none;background:rgba(0,0,0,.6)';
        document.body.append(stripEl);
      } else if (!want && stripEl) {
        stripEl.remove();
        stripEl = null;
      }
      return !!stripEl;
    },
  };
  ctx.ui.hud.setBulletTime(ctx.loop.manual);
  return api;
}
