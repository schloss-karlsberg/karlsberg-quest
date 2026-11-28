/**
 * A watcher and a noise (TASK-095, src/systems/court/distract.ts): the pure state machine. A
 * chestnut lands in earshot → the watcher turns, walks over, looks around, walks back; it is wary
 * afterwards; one that is struck is alerted instead.
 */
import { describe, expect, it } from 'vitest';
import { DISTRACT, abort, createDistract, distractYaw, distracted, hearNoise, hears, stepDistract, strike, type Distract, type DistractPhase } from '../src/systems/court/distract';
import { BLICK, MISSTRAUEN, TELLS, activeTells, stepSuspicion, yawGap } from '../src/systems/court/logic';
import { THROW } from '../src/systems/forage/logic';

const DT = 1 / 60;
const POST = { x: 100, z: 50 };
/** A landing chestnut 6 m east of the post. */
const EAST = { x: 106, z: 50, loud: THROW.loud };

/** Step until the phase changes (at most `max` s); returns the phases passed and the seconds each took. */
function run(d: Distract, until: DistractPhase, max = 40): { phases: DistractPhase[]; took: Record<string, number> } {
  const phases: DistractPhase[] = [];
  const took: Record<string, number> = {};
  for (let t = 0; t < max && d.phase !== until; t += DT) {
    took[d.phase] = (took[d.phase] ?? 0) + DT;
    const next = stepDistract(d, DT);
    if (next) phases.push(next);
  }
  return { phases, took };
}

describe('hearing', () => {
  it('a landing chestnut carries about twelve metres, a throw from cover reaches that easily', () => {
    const earshot = DISTRACT.hear * THROW.loud;
    expect(earshot).toBeGreaterThan(10);
    expect(earshot).toBeLessThan(14);
    expect(hears(POST.x, POST.z, { x: POST.x + earshot - 0.1, z: POST.z, loud: THROW.loud })).toBe(true);
    expect(hears(POST.x, POST.z, { x: POST.x + earshot + 0.1, z: POST.z, loud: THROW.loud })).toBe(false);
    expect(hears(POST.x, POST.z, { x: POST.x, z: POST.z, loud: 0 })).toBe(false);
    // the player can stand outside a 14 m fan and still land one in earshot beyond the watcher
    expect(THROW.range).toBeGreaterThan(14 + 4);
  });
});

describe('a noise in earshot', () => {
  it('turns the head, walks over, looks around, walks back: about fifteen seconds with its back turned', () => {
    const d = createDistract();
    expect(hearNoise(d, POST, EAST)).toBe('go');
    expect(d.phase).toBe('turn');
    expect(distracted(d)).toBe(true);
    // at once it looks east, at the noise
    expect(distractYaw(d, POST)).toBeCloseTo(90, 5);
    const { phases, took } = run(d, 'post');
    expect(phases).toEqual(['walk', 'look', 'back', 'post']);
    expect(took.turn).toBeCloseTo(DISTRACT.turn, 1);
    // 6 m away: it stops 1.5 m short, 4.5 m from its post
    expect(took.walk).toBeCloseTo(4.5 / DISTRACT.speed, 1);
    expect(took.look).toBeCloseTo(DISTRACT.look, 1);
    expect(took.back).toBeCloseTo(4.5 / DISTRACT.speed, 1);
    expect(d.ox).toBe(0);
    expect(d.oz).toBe(0);
    expect(distracted(d)).toBe(false);
    expect(distractYaw(d, POST)).toBeNull();
    const away = took.turn! + took.walk! + took.look! + took.back!;
    expect(away).toBeGreaterThan(8);
    expect(away).toBeLessThan(20);
  });

  it('never goes farther than its leash, and not through a wall', () => {
    const far = createDistract();
    hearNoise(far, POST, { x: POST.x, z: POST.z - 11.5, loud: 1 });
    run(far, 'look');
    expect(Math.hypot(far.ox, far.oz)).toBeCloseTo(DISTRACT.leash, 3);
    expect(far.oz).toBeLessThan(0);

    const walled = createDistract();
    hearNoise(walled, POST, EAST, { free: () => 2.2 });
    run(walled, 'look');
    expect(Math.hypot(walled.ox, walled.oz)).toBeCloseTo(2.2, 3);

    // a noise at its feet, or a way that is blocked at once: it looks from where it stands
    const atFeet = createDistract();
    hearNoise(atFeet, POST, { x: POST.x + 1.8, z: POST.z, loud: 1 });
    const blocked = createDistract();
    hearNoise(blocked, POST, EAST, { free: () => 0.4 });
    for (const d of [atFeet, blocked]) {
      expect(d.gx).toBe(0);
      expect(run(d, 'post').phases).toEqual(['look', 'post']);
      expect(d.ox).toBe(0);
    }
  });

  it('looks at the noise on the way, swings its head at the spot, and looks home on the way back', () => {
    const d = createDistract();
    hearNoise(d, POST, EAST);
    run(d, 'walk');
    stepDistract(d, 1);
    expect(distractYaw(d, POST)).toBeCloseTo(90, 5);
    run(d, 'look');
    const seen: number[] = [];
    for (let t = 0; t < DISTRACT.look - 0.1; t += DT) {
      stepDistract(d, DT);
      seen.push(yawGap(distractYaw(d, POST)!, 90));
    }
    expect(Math.max(...seen)).toBeGreaterThan(DISTRACT.sweep - 3);
    expect(Math.max(...seen)).toBeLessThanOrEqual(DISTRACT.sweep + 0.01);
    run(d, 'back');
    stepDistract(d, DT);
    // west, back to the post: now its fan sweeps the way it came
    expect(distractYaw(d, POST)).toBeCloseTo(270, 5);
  });
});

describe('not an instant win', () => {
  it('a watcher that just came back only glances at the next noise, for twenty seconds', () => {
    const d = createDistract();
    hearNoise(d, POST, EAST);
    run(d, 'post');
    expect(d.wary).toBeGreaterThan(DISTRACT.wary - 4);
    expect(hearNoise(d, POST, EAST)).toBe('glance');
    expect(d.phase).toBe('glance');
    expect(distractYaw(d, POST)).toBeCloseTo(90, 5);
    const { phases, took } = run(d, 'post');
    expect(phases).toEqual(['post']);
    expect(took.glance).toBeCloseTo(DISTRACT.glance, 1);
    expect(d.ox).toBe(0);
    // once the wariness is over it goes again
    for (let t = 0; t < DISTRACT.wary; t += DT) stepDistract(d, DT);
    expect(d.wary).toBe(0);
    expect(hearNoise(d, POST, EAST)).toBe('go');
  });

  it('a busy watcher takes no notice of further noises', () => {
    const d = createDistract();
    hearNoise(d, POST, EAST);
    for (const phase of ['turn', 'walk', 'look', 'back'] as const) {
      if (d.phase !== phase) run(d, phase);
      expect(hearNoise(d, POST, { x: POST.x - 6, z: POST.z, loud: 1 }), phase).toBeNull();
      expect(d.nx).toBe(EAST.x);
    }
  });

  it('a watcher that must stay (the gate) only turns its head', () => {
    const d = createDistract();
    expect(hearNoise(d, POST, EAST, { stay: true })).toBe('glance');
    run(d, 'post');
    expect(d.ox).toBe(0);
    expect(d.wary).toBe(0);
  });

  it('a chestnut that strikes the watcher alerts it: no walk to the noise, and wary for longer', () => {
    const d = createDistract();
    strike(d);
    expect(d.phase).toBe('alert');
    // the system turns it to the thrower
    expect(distractYaw(d, POST)).toBeNull();
    expect(hearNoise(d, POST, EAST)).toBeNull();
    const { phases, took } = run(d, 'post');
    expect(phases).toEqual(['post']);
    expect(took.alert).toBeCloseTo(DISTRACT.alert, 1);
    expect(d.wary).toBeGreaterThan(DISTRACT.wary);
    expect(hearNoise(d, POST, EAST)).toBe('glance');
    // struck on its way to a noise: it turns round, then walks back
    const out = createDistract();
    hearNoise(out, POST, EAST);
    run(out, 'look');
    strike(out);
    expect(run(out, 'post').phases).toEqual(['back', 'post']);
    // suspicion: one hit is a long look, never an escort by itself
    expect(DISTRACT.hit).toBeGreaterThanOrEqual(BLICK);
    expect(DISTRACT.hit).toBeLessThan(MISSTRAUEN);
  });

  it('a watcher that has made the player out breaks the search off and walks back', () => {
    const d = createDistract();
    hearNoise(d, POST, EAST);
    run(d, 'look');
    abort(d);
    expect(d.phase).toBe('back');
    expect(d.wary).toBe(DISTRACT.wary);
    run(d, 'post');
    expect(d.ox).toBe(0);
    // at its post there is nothing to break off
    const still = createDistract();
    abort(still);
    expect(still).toEqual(createDistract());
  });
});

describe('throwing in view', () => {
  it('is a tell: a long look at once when a watcher sees it, nothing when none does', () => {
    const hits = activeTells({ coat: true, speed: 1, staffAgo: Infinity, attacked: false, took: false, threw: true });
    expect(hits).toEqual([{ id: 'throw', kind: 'instant' }]);
    expect(activeTells({ coat: true, speed: 1, staffAgo: Infinity, attacked: false, took: false })).toEqual([]);
    const seen = stepSuspicion(0, hits, true, 8, 1, DT);
    expect(seen).toEqual({ level: TELLS.throw.instant, tell: 'throw' });
    expect(seen.level).toBeGreaterThanOrEqual(BLICK);
    expect(seen.level).toBeLessThan(MISSTRAUEN);
    expect(stepSuspicion(0, hits, false, 8, 1, DT).level).toBe(0);
  });
});
