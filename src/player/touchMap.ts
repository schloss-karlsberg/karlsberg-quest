import type { Action } from './input';

/**
 * Pure touch input mapping (phase 1 of docs/PERF-MOBILE-RESEARCH.md §B), tested in
 * tests/touchMap.test.ts. The DOM side lives in src/ui/touch.ts; it feeds `Input.press()` and
 * `Input.addLook()` with what these functions decide, so no feature system knows about touch.
 */

/** "Touch-Steuerung" setting: Auto follows the device, An / Aus force it. */
export type TouchSetting = 'auto' | 'on' | 'off';
export const TOUCH_SETTINGS: readonly TouchSetting[] = ['auto', 'on', 'off'];

export const TOUCH = {
  /** Stick radius in CSS px (the knob's travel). */
  stickRadius: 56,
  /** Below this share of the radius the stick does nothing. */
  deadZone: 0.22,
  /** A direction counts once its axis passes this share (8-way with diagonals). */
  axis: 0.38,
  /** Pushed to the rim: sprint. */
  sprintAt: 0.92,
  /** Drag-look: CSS px of finger travel → mouse-look px (then the mouse sensitivity applies). */
  lookScale: 1.8,
  /** Longer than this is a hold (Wuchthieb charge, Lauschen, Epoche zurück). Matches combat's 0.45 s. */
  holdMs: 450,
} as const;

export interface StickResult {
  /** Movement actions to hold. */
  actions: Action[];
  /** 0..1 of the radius (after clamping). */
  magnitude: number;
  /** Knob offset in px, clamped to the radius. */
  knobX: number;
  knobY: number;
}

/** Stick offset (finger − origin, screen px, y down) → held movement actions. */
export function stickToMove(dx: number, dy: number, radius: number = TOUCH.stickRadius): StickResult {
  const len = Math.hypot(dx, dy);
  const k = len > radius ? radius / len : 1;
  const knobX = dx * k;
  const knobY = dy * k;
  const magnitude = radius > 0 ? Math.min(1, len / radius) : 0;
  const actions: Action[] = [];
  if (magnitude >= TOUCH.deadZone && len > 0) {
    const nx = dx / len;
    const ny = dy / len;
    if (ny < -TOUCH.axis) actions.push('forward');
    if (ny > TOUCH.axis) actions.push('back');
    if (nx < -TOUCH.axis) actions.push('left');
    if (nx > TOUCH.axis) actions.push('right');
    // sprint only while going forward-ish (running backwards is not a thing)
    if (magnitude >= TOUCH.sprintAt && ny < -TOUCH.axis) actions.push('sprint');
  }
  return { actions, magnitude, knobX, knobY };
}

/** Which actions to press and release to get from `prev` to `next` held sets. */
export function diffHeld(prev: readonly Action[], next: readonly Action[]): { press: Action[]; release: Action[] } {
  return { press: next.filter((a) => !prev.includes(a)), release: prev.filter((a) => !next.includes(a)) };
}

/** Finger travel → look px for `Input.addLook` (the player's mouse sensitivity / invert apply after). */
export function lookDelta(dx: number, dy: number, scale: number = TOUCH.lookScale): { dx: number; dy: number } {
  return { dx: dx * scale, dy: dy * scale };
}

/** Is the touch UI on? Auto: a coarse primary pointer, or a touch seen this session. */
export function touchActive(setting: TouchSetting | undefined, coarse: boolean, touchSeen: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return coarse || touchSeen;
}

/** Below this short side (CSS px) a device counts as a phone: tablets keep portrait. */
export const ROTATE_MAX_SHORT_SIDE = 600;

export interface RotateQuery {
  /** Touch UI on. */
  touch: boolean;
  /** Viewport in CSS px. */
  width: number;
  height: number;
  /** Gameplay (no title screen, no new-game flow); a modal over gameplay still counts. */
  inGame: boolean;
}

/**
 * The "please turn the phone" overlay: only on a touch phone held upright, and only in gameplay.
 * The title, Neuigkeiten, the settings and the new-game screens read fine in portrait (M-02).
 */
export function rotateWanted(q: RotateQuery): boolean {
  return q.touch && q.inGame && q.height > q.width && Math.min(q.width, q.height) < ROTATE_MAX_SHORT_SIDE;
}

export function isTouchSetting(v: unknown): v is TouchSetting {
  return v === 'auto' || v === 'on' || v === 'off';
}

/**
 * The touch button that stands for a prompt's key label (what the HUD shows instead of the key
 * cap): 'E' → interact … Unknown labels fall back to the interact button (every in-world prompt
 * is answered with it). 'Maus' (look / aim) has no button: it gets the neutral swipe hint ('look'),
 * never the interact hand.
 */
export type TouchIcon = 'interact' | 'attack' | 'dodge' | 'bannlicht' | 'shift' | 'fly' | 'journal' | 'map' | 'balm' | 'lock' | 'crouch' | 'relief' | 'pause' | 'photo' | 'look';
const KEY_ICON: Record<string, TouchIcon> = {
  E: 'interact',
  F: 'fly',
  Q: 'shift',
  G: 'bannlicht',
  'MAUS RECHTS': 'bannlicht',
  RMB: 'bannlicht',
  'MAUS LINKS': 'attack',
  LMB: 'attack',
  KLICK: 'attack',
  K: 'attack',
  LEERTASTE: 'dodge',
  SPACE: 'dodge',
  J: 'journal',
  M: 'map',
  H: 'balm',
  TAB: 'lock',
  C: 'crouch',
  X: 'crouch',
  N: 'photo',
  MAUS: 'look',
  MOUSE: 'look',
  '1': 'relief',
  '2': 'relief',
  '3': 'relief',
  ESC: 'pause',
  P: 'pause',
  // touch mode: prompts may carry the touch button's name instead of a key (`touchName`)
  HIEB: 'attack',
  AUSWEICHEN: 'dodge',
  BANNLICHT: 'bannlicht',
  ZIEL: 'lock',
  BALSAM: 'balm',
  AKTION: 'interact',
  EPOCHE: 'shift',
  FELDBUCH: 'journal',
  KARTE: 'map',
  FLIEGEN: 'fly',
  SINKEN: 'crouch',
  DUCKEN: 'crouch',
  PAUSE: 'pause',
};

export function touchIconFor(key: string): TouchIcon {
  const k = key.trim().toUpperCase();
  return KEY_ICON[k] ?? KEY_ICON[k.split(/\s*[/·]\s*/)[0] ?? ''] ?? 'interact';
}

/**
 * Which touch button answers a HUD prompt (key + text): null when none does. A movement prompt
 * („W A S D: Gehen …“) belongs to the stick, not to the Aktion button: the button keeps „Aktion“
 * instead of carrying „Gehen · ins Bild klick…“ (M-05).
 */
export function touchPromptIcon(key: string | null, text: string | null | undefined): TouchIcon | null {
  if (!key) return text?.trim() ? 'interact' : null;
  if (/^\s*W\s*[,·/]?\s*A\s*[,·/]?\s*S\s*[,·/]?\s*D\b/i.test(key)) return null;
  return touchIconFor(key);
}

/**
 * German name of the on-screen button that does `action` (what text says on touch where it would
 * name a key: "das Bannlicht (Bannlicht)", "Auf Balsam"). The abilities are the numbered buttons.
 * Null: no touch button for it (the caller keeps the key label).
 */
const TOUCH_NAMES: Partial<Record<Action, string>> = {
  attack: 'Hieb',
  dodge: 'Ausweichen',
  bannlicht: 'Bannlicht',
  lockOn: 'Ziel',
  quickUse: 'Balsam',
  interact: 'Aktion',
  listen: 'Aktion',
  shift: 'Epoche',
  journal: 'Feldbuch',
  map: 'Karte',
  fly: 'Fliegen',
  up: 'Steigen',
  down: 'Sinken',
  crouch: 'Ducken',
  pause: 'Pause',
  skill1: '1',
  skill2: '2',
  skill3: '3',
};

export function touchName(action: Action): string | null {
  return TOUCH_NAMES[action] ?? null;
}

/**
 * The crouch button in the thumb arc (one button, two jobs, like C on the keyboard): on foot a
 * tap toggles crouching (sneaking; active while crouched), in the spirit view it is held to sink.
 */
export function crouchButtonMode(flying: boolean, stance: string): { icon: 'crouch' | 'down'; on: boolean; label: 'touch.crouch' | 'touch.down' } {
  return flying ? { icon: 'down', on: false, label: 'touch.down' } : { icon: 'crouch', on: stance === 'crouch', label: 'touch.crouch' };
}
