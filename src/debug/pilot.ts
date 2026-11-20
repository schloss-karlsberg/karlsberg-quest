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
   * spread evenly over the steps. `turnDeg` (+ = right) is the same in degrees at the current sensitivity.
   * `left` / `right`: true or 'click' for a click, 'hold' to keep the button down for the act
   * (left held ≥ 0.45 s and released = Wuchthieb).
   */
  mouse?: { dx?: number; dy?: number; turnDeg?: number; left?: PilotButton; right?: PilotButton };
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
  /** The interaction prompt on screen ("E Sprechen" …), subtitles and toasts. */
  hud: { prompt: string; subtitle: string; toasts: string[] };
  /** Combat events since the previous act / observe (hits dealt and taken, dodges, KOs, bounces, telegraphs). */
  events: PilotEvent[];
  /** JPEG data URLs, evenly spaced over the act. */
  frames: string[];
}

export interface PilotApi {
  act(a?: PilotAction): PilotObservation;
  /** The observation without stepping (one frame unless `frames: 0`). */
  observe(opts?: { frames?: number; frameSize?: number; quality?: number }): PilotObservation;
  /** Pick dialogue option n (1-based, as the numbers on the buttons). Returns the label or null. */
  choose(n: number): string | null;
  /** Release every key the pilot keeps down. */
  release(): void;
  /** Switch bullet time on / off at runtime (the simulation then runs only through act / kq.step). Returns the state. */
  bulletTime(on?: boolean): boolean;
  /** Show each act's frame strip as an overlay at the bottom of the page (for a screenshot of the browser). Returns the state. */
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
      return { type: 'dodge', t: T, perfect: ev.perfect };
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

// ---- the in-game side -------------------------------------------------------------------------------

const clean = (s: string | null | undefined, max = 400) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const txt = (root: ParentNode, sel: string, max = 400) => clean(root.querySelector<HTMLElement>(sel)?.textContent, max);
/** Visible text with its line / block breaks kept as `sep` (innerText; textContent where there is no layout). */
const inner = (el: HTMLElement | null | undefined, sep: string, max = 300) =>
  clean((el?.innerText ?? el?.textContent ?? '').split('\n').map((l) => l.trim()).filter((l) => /[\p{L}\p{N}]/u.test(l)).join(sep), max);
const visible = (el: HTMLElement) => !el.hasAttribute('disabled') && (el.offsetParent !== null || el.getClientRects().length > 0);

/** The open dialogue / modal (top of the stack) or a non-modal story choice card, with its buttons. */
function readDialogue(): { obs: PilotObservation['dialogue']; buttons: HTMLElement[] } {
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
  const options = buttons.map((b, i) => ({ n: i + 1, label: clean(b.textContent, 80).replace(/^\d+\s*/, '') }));
  return { obs: { kind, title: txt(root, ':scope > h2', 120) || clean(root.getAttribute('aria-label'), 120), who, text, options }, buttons };
}

/** Compact JPEG data URL of the canvas, read right after a render (no preserveDrawingBuffer needed). */
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

export function installPilot(ctx: GameContext): PilotApi {
  const events: PilotEvent[] = [];
  /** Simulated seconds at the start of the current act (event times are relative to it). */
  let actStart = ctx.loop.time;
  const kept = new Set<string>();
  const scratch = document.createElement('canvas');
  const v = new Vector3();
  let stripEl: HTMLElement | null = null;

  const combat = () => window.kq?.combat;
  const sim = () => combat()?.sim() ?? null;

  /** Tap the combat sim's events: wrap `step` on the live sim instance once (it may be replaced). */
  const tap = () => {
    const s = sim() as (CombatSim & { __pilot?: boolean }) | null;
    if (!s || s.__pilot) return;
    s.__pilot = true;
    const step = s.step.bind(s);
    s.step = (dt, inp) => {
      const out = step(dt, inp);
      for (const ev of out) {
        const pe = summarizeSimEvent(ev, ctx.loop.time - actStart);
        if (pe) events.push(pe);
      }
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
      dialogue: readDialogue().obs,
      hud: {
        prompt: inner(ctx.ui.hud.el.querySelector<HTMLElement>('.kq-prompt'), ' ', 120),
        subtitle: txt(ctx.ui.hud.el, '.kq-subtitles', 300),
        toasts: [...ctx.ui.hud.el.querySelectorAll<HTMLElement>('.kq-toast')].map((t) => clean(t.textContent, 160)),
      },
      events: events.splice(0),
      frames,
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
      actStart = ctx.loop.time;
      const input = ctx.input;
      const steps = Math.max(0, Math.round(a.steps ?? 15));
      const nFrames = Math.max(0, Math.round(a.frames ?? 5));
      const width = a.frameSize ?? 320;
      const quality = a.quality ?? 0.6;
      const tapSteps = Math.max(1, Math.min(steps || 1, Math.round(a.tapSteps ?? 2)));
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
      // a modal / dialogue: the game input is off, taps go to the page as real key events
      const modal = ctx.pause.paused && document.querySelector('.kq-modal') !== null;
      if (modal) for (const c of taps) if (!c.startsWith('Mouse')) keyEvent(c);
      // look: pixels like movementX/Y; turnDeg converts at the current sensitivity
      const k = 0.0022 * ctx.player.mouseSensitivity * (ctx.player.invertX ? -1 : 1);
      const dxTotal = (m.dx ?? 0) + (m.turnDeg ? (m.turnDeg * Math.PI) / 180 / k : 0);
      const dyTotal = m.dy ?? 0;
      const frames: string[] = [];
      const at = new Set<number>();
      for (let i = 1; i <= nFrames && steps > 0; i++) at.add(Math.max(1, Math.round((i * steps) / nFrames)));
      const canvas = ctx.renderer.domElement;
      let lastRender = 0;
      for (const c of holds) if (!kept.has(c)) input.simulate(c, true);
      if (!modal) for (const c of taps) input.simulate(c, true);
      const look = (dx: number, dy: number) => {
        if (!dx && !dy) return;
        input.addLook(dx, dy);
        if (!ctx.pause.paused) ctx.player.look();
      };
      if (steps === 0) look(dxTotal, dyTotal);
      for (let i = 1; i <= steps; i++) {
        // holds stay down even if a window blur cleared the key set (no new press edge)
        for (const c of holds) input.simulate(c, true, false);
        look(dxTotal / steps, dyTotal / steps);
        if (!ctx.pause.paused) ctx.loop.advance(1);
        if (i === tapSteps && !modal) for (const c of taps) if (!holds.has(c)) input.simulate(c, false);
        if (at.has(i)) {
          ctx.loop.renderOnce((i - lastRender) * ctx.loop.dt);
          lastRender = i;
          frames.push(grab(canvas, scratch, width, quality));
        }
      }
      if (!modal) for (const c of taps) if (!holds.has(c)) input.simulate(c, false);
      if (a.keep) for (const c of holds) kept.add(c);
      else for (const c of holds) input.simulate(c, false);
      if (lastRender < steps || steps === 0) {
        ctx.loop.renderOnce((steps - lastRender) * ctx.loop.dt);
        if (nFrames > 0 && frames.length === 0) frames.push(grab(canvas, scratch, width, quality));
      }
      showFrames(frames);
      return observation(frames);
    },
    observe(o = {}) {
      tap();
      const n = Math.max(0, Math.round(o.frames ?? 1));
      ctx.loop.renderOnce(0);
      const frames = n > 0 ? [grab(ctx.renderer.domElement, scratch, o.frameSize ?? 320, o.quality ?? 0.6)] : [];
      return observation(frames);
    },
    choose(n) {
      const { buttons } = readDialogue();
      const b = buttons[n - 1];
      if (!b) return null;
      const label = clean(b.textContent, 80).replace(/^\d+\s*/, '');
      b.click();
      return label;
    },
    release() {
      for (const c of kept) ctx.input.simulate(c, false);
      kept.clear();
    },
    bulletTime(on) {
      ctx.loop.manual = on ?? !ctx.loop.manual;
      ctx.ui.hud.setBulletTime(ctx.loop.manual);
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
