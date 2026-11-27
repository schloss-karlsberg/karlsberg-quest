/**
 * TASK-005: the phone comes out of the pocket — reach, phone in hand, raise, camera glide,
 * viewfinder — in about a second; closing plays it backwards; N / the shutter skip; forced closes
 * snap; reduced motion and first person cut straight to the lens.
 */
import { describe, expect, it } from 'vitest';
import { CLOSE_S, CUT_S, HAND_OUT, OPEN_S, PhoneRaise, raiseAt } from '../src/systems/photo/raise';

const run = (r: PhoneRaise, seconds: number, step = 1 / 60) => {
  const seen: ReturnType<typeof raiseAt>[] = [];
  for (let t = 0; t < seconds - 1e-9; t += step) {
    r.tick(step);
    seen.push(r.out);
  }
  return seen;
};

describe('the phone raise', () => {
  it('opens in about a second: reach, phone in hand, raise with the camera glide, then the viewfinder', () => {
    expect(OPEN_S).toBeLessThanOrEqual(1);
    expect(CLOSE_S).toBeLessThanOrEqual(OPEN_S);
    const r = new PhoneRaise();
    r.open(false);
    const seen = run(r, OPEN_S + 0.05);
    expect(r.phase).toBe('open');
    expect(r.out).toEqual({ raise: 1, inHand: true, lens: 1, ui: 1 });
    // in order: the hand is out before the camera moves, the camera is in before the viewfinder shows
    const firstInHand = seen.findIndex((o) => o.inHand);
    const firstLens = seen.findIndex((o) => o.lens > 0);
    const firstUi = seen.findIndex((o) => o.ui > 0);
    const lensDone = seen.findIndex((o) => o.lens >= 1);
    expect(firstInHand).toBeGreaterThan(0);
    expect(firstInHand).toBeLessThan(firstLens);
    expect(lensDone).toBeLessThanOrEqual(firstUi);
    // the arm and the lens never step back while opening
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.raise).toBeGreaterThanOrEqual(seen[i - 1]!.raise);
      expect(seen[i]!.lens).toBeGreaterThanOrEqual(seen[i - 1]!.lens);
    }
  });

  it('closes as the opening played backwards, and the phone is gone afterwards', () => {
    const r = new PhoneRaise();
    r.open(false);
    r.skip();
    r.close();
    const seen = run(r, CLOSE_S + 0.05);
    expect(r.phase).toBe('closed');
    expect(r.out).toEqual({ raise: 0, inHand: false, lens: 0, ui: 0 });
    // the viewfinder goes first, then the camera comes out, then the phone goes back in
    const uiGone = seen.findIndex((o) => o.ui === 0);
    const lensOut = seen.findIndex((o) => o.lens === 0);
    const pocketed = seen.findIndex((o) => !o.inHand);
    expect(uiGone).toBeLessThanOrEqual(lensOut);
    expect(lensOut).toBeLessThan(pocketed);
    // the same look at the same progress both ways
    expect(raiseAt(0.4, false)).toEqual(raiseAt(0.4, false));
    expect(raiseAt(0.4, false).raise).toBeGreaterThan(HAND_OUT);
  });

  it('N or the shutter during the move jumps to its end', () => {
    const r = new PhoneRaise();
    r.open(false);
    run(r, 0.2);
    expect(r.moving).toBe(true);
    r.skip();
    expect(r.phase).toBe('open');
    expect(r.out.lens).toBe(1);
    r.close();
    run(r, 0.1);
    r.skip();
    expect(r.phase).toBe('closed');
    expect(r.out.inHand).toBe(false);
  });

  it('a forced close snaps shut from anywhere, never half-blended', () => {
    for (const at of [0.1, 0.4, 0.7, OPEN_S + 0.1]) {
      const r = new PhoneRaise();
      r.open(false);
      run(r, at);
      r.snapShut();
      expect(r.out).toEqual({ raise: 0, inHand: false, lens: 0, ui: 0 });
      expect(r.phase).toBe('closed');
    }
  });

  it('turning round mid-move continues from where the arm is', () => {
    const r = new PhoneRaise();
    r.open(false);
    run(r, 0.5);
    const p = r.p;
    r.close();
    expect(r.p).toBe(p);
    r.open(false);
    expect(r.phase).toBe('opening');
    run(r, OPEN_S);
    expect(r.phase).toBe('open');
  });

  it('reduced motion and first person cut to the lens; only the viewfinder fades', () => {
    expect(CUT_S).toBeLessThanOrEqual(0.2);
    const r = new PhoneRaise();
    r.open(true);
    expect(r.out.lens).toBe(1);
    const seen = run(r, CUT_S + 0.02);
    expect(seen.every((o) => o.lens === 1)).toBe(true);
    expect(r.out.ui).toBe(1);
    r.close();
    run(r, CUT_S + 0.02);
    expect(r.out).toEqual({ raise: 0, inHand: false, lens: 0, ui: 0 });
  });

  it('ignores broken frame times', () => {
    const r = new PhoneRaise();
    r.open(false);
    r.tick(Number.NaN);
    r.tick(-1);
    r.tick(Number.POSITIVE_INFINITY);
    expect(r.p).toBe(0);
    expect(r.phase).toBe('opening');
  });
});
