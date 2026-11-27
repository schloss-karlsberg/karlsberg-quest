/**
 * The phone coming out (TASK-005): one progress value `p` (0 = in the pocket, 1 = camera mode)
 * runs up on opening and down on closing, so closing is exactly the opening played backwards.
 * Everything the player sees is a pure function of `p`:
 *
 * - `raise` (0..1): the arm, from the hand reaching for the pocket to the phone at the face (avatar);
 * - `inHand`: the phone mesh shows once the hand has left the pocket;
 * - `lens` (0..1): the camera's glide from the third-person spot into the phone (CameraRig);
 * - `ui` (0..1): the viewfinder fading in at the very end.
 *
 * A "cut" (reduced motion, first person, a test hook) has no arm and no glide: the lens is there
 * at once and only the viewfinder fades. Wall-clock frame time drives it; pure, no three.js.
 */

/** Seconds of the opening: hand to the pocket and out, the raise with the camera glide, the viewfinder. */
export const OPEN_REACH_S = 0.3;
export const OPEN_RAISE_S = 0.45;
export const OPEN_UI_S = 0.15;
export const OPEN_S = OPEN_REACH_S + OPEN_RAISE_S + OPEN_UI_S;
/** Closing is the same move, faster. */
export const CLOSE_S = 0.7;
/** A cut (reduced motion, first person): only the viewfinder fades. */
export const CUT_S = OPEN_UI_S;
/** The phone shows from this `raise` on (the hand is out of the pocket). */
export const HAND_OUT = 0.3;

export type RaisePhase = 'closed' | 'opening' | 'open' | 'closing';

export interface RaiseOut {
  raise: number;
  inHand: boolean;
  lens: number;
  ui: number;
}

const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);
const smooth = (v: number): number => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/** The look at progress `p` (pure; tested). */
export function raiseAt(p: number, cut: boolean): RaiseOut {
  const q = clamp01(p);
  if (cut) return { raise: q > 0 ? 1 : 0, inHand: q > 0, lens: q > 0 ? 1 : 0, ui: q };
  const t = q * OPEN_S;
  const raise = smooth(t / (OPEN_REACH_S + OPEN_RAISE_S));
  return {
    raise,
    inHand: raise >= HAND_OUT,
    lens: smooth((t - OPEN_REACH_S) / OPEN_RAISE_S),
    ui: clamp01((t - OPEN_REACH_S - OPEN_RAISE_S) / OPEN_UI_S),
  };
}

export class PhoneRaise {
  /** 0 = in the pocket, 1 = camera mode. */
  p = 0;
  phase: RaisePhase = 'closed';
  /** This move has no arm and no glide (reduced motion, first person, a test hook). */
  cut = false;

  /** Start (or turn round to) opening. `cut`: no arm, no glide. */
  open(cut: boolean): void {
    if (this.phase === 'open' || this.phase === 'opening') return;
    // turning round mid-close keeps the arm where it is; a cut lands on the lens at once
    if (this.phase === 'closed') this.cut = cut;
    else this.cut = this.cut || cut;
    this.phase = 'opening';
    if (this.cut) this.p = Math.max(this.p, 1e-6);
  }

  /** Start (or turn round to) closing. */
  close(): void {
    if (this.phase === 'closed' || this.phase === 'closing') return;
    this.phase = 'closing';
  }

  /** Jump to the end of the move under way (N or the shutter during it). */
  skip(): void {
    if (this.phase === 'opening') this.snapOpen();
    else if (this.phase === 'closing') this.snapShut();
  }

  /** Camera mode now (a test hook, a shot during the opening). */
  snapOpen(cut = this.cut): void {
    this.cut = cut;
    this.p = 1;
    this.phase = 'open';
  }

  /** Back in the pocket now (every forced close). */
  snapShut(): void {
    this.p = 0;
    this.phase = 'closed';
    this.cut = false;
  }

  get moving(): boolean {
    return this.phase === 'opening' || this.phase === 'closing';
  }

  tick(dt: number): void {
    if (!this.moving || !(dt > 0) || !Number.isFinite(dt)) return;
    if (this.phase === 'opening') {
      this.p = Math.min(1, this.p + dt / (this.cut ? CUT_S : OPEN_S));
      if (this.p >= 1) this.phase = 'open';
    } else {
      this.p = Math.max(0, this.p - dt / (this.cut ? CUT_S : CLOSE_S));
      if (this.p <= 0) this.snapShut();
    }
  }

  get out(): RaiseOut {
    return raiseAt(this.p, this.cut);
  }
}
