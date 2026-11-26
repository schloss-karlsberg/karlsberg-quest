import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';
import { skipRealTimeWaits, stepsDriveVisuals } from '../src/core/bullet';
import {
  ChooseGate,
  attackReady,
  compassDeg,
  PressTracker,
  droppedInputs,
  pressAfter,
  pressBefore,
  lookPlan,
  promptLine,
  relBearing,
  summarizeEnemies,
  summarizeRadio,
  summarizeSimEvent,
  tapWindow,
  stripVisible,
  telegraphLeft,
  wrap180,
} from '../src/debug/pilot';
import { CombatSim, type SimEvent, type SimInput } from '../src/systems/combat/sim';
import { INPUT_BUFFER } from '../src/systems/combat/rules';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';

/** Bullet-time pilot (src/debug/pilot.ts): the observation's pure parts. */

const enemy = (o: Record<string, unknown> = {}) =>
  ({
    id: 'e1',
    kind: 'streuner',
    x: 0,
    z: -10,
    hp: 30,
    maxHp: 40,
    state: 'approach',
    t: 0,
    windup: 0,
    attack: null,
    boss: false,
    elite: false,
    stun: 0,
    def: { name_de: 'Streuner' },
    ...o,
  }) as never;

describe('pilot geometry', () => {
  it('compass degrees follow kq.teleport (0 = north, 90 = east)', () => {
    expect(compassDeg(0)).toBe(0);
    expect(compassDeg(-Math.PI / 2)).toBeCloseTo(90);
    expect(compassDeg(Math.PI / 2)).toBeCloseTo(270);
  });

  it('wraps to (−180, 180]', () => {
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
    expect(wrap180(180)).toBe(180);
  });

  it('relative bearing: + is right, ±180 behind', () => {
    // facing north (yaw 0 looks to −z)
    expect(relBearing(0, 0, 0, 0, -5)).toBeCloseTo(0);
    expect(relBearing(0, 0, 0, 5, 0)).toBeCloseTo(90);
    expect(relBearing(0, 0, 0, -5, 0)).toBeCloseTo(-90);
    expect(Math.abs(relBearing(0, 0, 0, 0, 5))).toBeCloseTo(180);
    // facing east: north is to the left
    expect(relBearing(0, 0, -Math.PI / 2, 0, -5)).toBeCloseTo(-90);
  });
});

describe('pilot enemies', () => {
  it('telegraph time left only while winding up', () => {
    expect(telegraphLeft({ state: 'windup', t: 0.2, windup: 0.7 })).toBe(0.5);
    expect(telegraphLeft({ state: 'windup', t: 0.9, windup: 0.7 })).toBe(0);
    expect(telegraphLeft({ state: 'strike', t: 0.1, windup: 0.7 })).toBeNull();
  });

  it('summarises the nearby enemies, nearest first, within 40 m', () => {
    const list = [
      enemy({ id: 'far', x: 0, z: -60 }),
      enemy({ id: 'b', x: 6, z: 0, state: 'windup', t: 0.1, windup: 0.6, attack: { id: 'biss', kind: 'melee' } }),
      enemy({ id: 'a', x: 0, z: -3, elite: true, title: 'Leithund' }),
    ];
    const out = summarizeEnemies(0, 0, 0, list, (e) => (e as { id: string }).id === 'a');
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
    expect(out[0]).toMatchObject({ d: 3, bearing: 0, onScreen: true, name: 'Leithund (Streuner)', elite: true, telegraph: null, attack: null });
    expect(out[1]).toMatchObject({ d: 6, bearing: 90, onScreen: false, state: 'windup', telegraph: 0.5, attack: 'biss (melee)', hp: 30, max: 40 });
  });
});

describe('pilot events', () => {
  const e = { id: 'e1', kind: 'irrlicht', hp: 12 } as never;
  it('keeps hits, hurts, dodges, KOs and bounces compact', () => {
    expect(summarizeSimEvent({ type: 'hit', e, damage: 8.4, heavy: true, finisher: false, weak: false, armored: false, gebannt: false, dirX: 0, dirZ: 1 } as SimEvent, 0.123)).toEqual({ type: 'hit', t: 0.12, id: 'e1', kind: 'irrlicht', dmg: 8, heavy: true, hpLeft: 12 });
    expect(summarizeSimEvent({ type: 'playerHit', damage: 11, by: 'irrlicht', x: 0, z: 0, pushX: 0, pushZ: 0, heavy: false }, 0.2)).toEqual({ type: 'hurt', t: 0.2, dmg: 11, by: 'irrlicht', heavy: false });
    expect(summarizeSimEvent({ type: 'dodge', vx: 1, vz: 0, perfect: true, stumble: false, dur: 0.35 }, 0)).toEqual({ type: 'dodge', t: 0, perfect: true });
    expect(summarizeSimEvent({ type: 'killed', e, by: 'light' } as SimEvent, 0)).toMatchObject({ type: 'ko', id: 'e1' });
    expect(summarizeSimEvent({ type: 'blocked', e, skill: null }, 0)).toMatchObject({ type: 'bounce', kind: 'irrlicht' });
    expect(summarizeSimEvent({ type: 'telegraph', e, attack: { id: 'flare', kind: 'ranged' }, dur: 0.75 } as unknown as SimEvent, 0)).toMatchObject({ type: 'telegraph', attack: 'flare (ranged)', dur: 0.75 });
  });

  it('drops the noise', () => {
    expect(summarizeSimEvent({ type: 'chargeFull' }, 0)).toBeNull();
    expect(summarizeSimEvent({ type: 'impact', p: {} as never, hitPlayer: false }, 0)).toBeNull();
  });
});

describe('loop advance / renderOnce (pilot stepping)', () => {
  it('advances without rendering and renders on demand with the frame time', () => {
    const renders: number[] = [];
    let updates = 0;
    const loop = new FixedStepLoop({ update: () => updates++, render: (dt) => renders.push(dt) }, 60, () => 0, () => {});
    loop.advance(3);
    expect(updates).toBe(3);
    expect(loop.tick).toBe(3);
    expect(renders).toEqual([]);
    loop.renderOnce(3 / 60);
    loop.renderOnce(5);
    expect(renders[0]).toBeCloseTo(0.05);
    expect(renders[1]).toBe(0.25);
  });
});

describe('pilot round-10 fixes (docs/PLAYTEST-ROUND10.md §5)', () => {
  it('radio box: speaker, whole line, showing only when shown and not hidden', () => {
    const base = { show: true, hidden: false, who: 'Marlene', speaker: 'marlene', tag: 'Fiktion', text: 'Du  schnaufst ja.', speaking: true };
    expect(summarizeRadio(base)).toEqual({ showing: true, who: 'Marlene', speaker: 'marlene', tag: 'Fiktion', text: 'Du schnaufst ja.', typing: true });
    expect(summarizeRadio({ ...base, hidden: true })).toMatchObject({ showing: false, typing: false });
    expect(summarizeRadio({ ...base, show: false }).showing).toBe(false);
  });

  it('prompt: from the prompt state, empty when none is shown or a fight hides it', () => {
    expect(promptLine({ key: 'E', text: 'Sprechen' }, false)).toBe('E Sprechen');
    expect(promptLine({ key: null, text: 'Lauschen' }, false)).toBe('Lauschen');
    expect(promptLine(null, false)).toBe('');
    expect(promptLine({ key: 'E', text: 'Wasser berühren' }, true)).toBe('');
  });

  it('turnDeg is done up front (3 steps by default), dx/dy spread over lookSteps', () => {
    const p = lookPlan(15, 0, 0, 90);
    expect(p.turnEnd).toBe(3);
    expect(p.dx.slice(0, 3)).toEqual([30, 30, 30]);
    expect(p.dx.slice(3).every((x) => x === 0)).toBe(true);
    const q = lookPlan(10, 200, 20, 0);
    expect(q.turnEnd).toBe(0);
    expect(q.dx.every((x) => x === 20)).toBe(true);
    expect(q.dy.reduce((a, b) => a + b, 0)).toBeCloseTo(20);
    const r = lookPlan(15, 60, 0, 30, 2, 1);
    expect(r.dx[0]).toBe(60);
    expect(r.dx[1]).toBe(30);
    expect(r.turnEnd).toBe(1);
    // a short act: the turn fits into it
    expect(lookPlan(2, 0, 0, 10).turnEnd).toBe(2);
    expect(lookPlan(0, 5, 5, 5).dx).toEqual([]);
  });

  it('taps go down on the step the turn completes', () => {
    expect(tapWindow(15, 2, 0)).toEqual({ down: 1, up: 2 });
    expect(tapWindow(15, 2, 3)).toEqual({ down: 3, up: 4 });
    expect(tapWindow(3, 2, 3)).toEqual({ down: 3, up: 3 });
  });

  it('two choose() calls: the second is rejected until the pilot looks again', () => {
    const g = new ChooseGate();
    expect(g.begin()).toBe(true);
    expect(g.begin()).toBe(false);
    g.settle();
    expect(g.begin()).toBe(true);
    g.cancel();
    expect(g.busy).toBe(false);
  });

  const idle = { dead: false, freeze: 0, swing: false, dodging: false, skill: false };
  const none = { queued: false, hold: -1, skill: false };
  const press = (o: Partial<{ attackPressed: boolean; dodgePressed: boolean; blocked: boolean; noDodge: boolean }>) => ({ attackPressed: false, dodgePressed: false, blocked: false, ...o });

  it('inputDropped: a click in the swing recovery, outside the combo buffer', () => {
    expect(droppedInputs(press({ attackPressed: true }), { ...idle, swing: true }, none, [])).toEqual([{ input: 'attack', reason: 'recovery' }]);
    // buffered (queued) or a new swing or the start of a hold: taken
    expect(droppedInputs(press({ attackPressed: true }), { ...idle, swing: true }, { ...none, queued: true }, [])).toEqual([]);
    expect(droppedInputs(press({ attackPressed: true }), idle, none, [{ type: 'swing' }])).toEqual([]);
    expect(droppedInputs(press({ attackPressed: true }), idle, { ...none, hold: 0.016 }, [])).toEqual([]);
  });

  it('inputDropped: hit-stop, blocked, tired, skill, dodging, interact', () => {
    expect(droppedInputs(press({ attackPressed: true }), { ...idle, freeze: 0.05 }, { ...none, queued: true }, [])).toEqual([{ input: 'attack', reason: 'hitstop' }]);
    expect(droppedInputs(press({ dodgePressed: true, blocked: true }), idle, none, [])).toEqual([{ input: 'dodge', reason: 'blocked' }]);
    expect(droppedInputs(press({ attackPressed: true }), idle, none, [{ type: 'tired' }])).toEqual([{ input: 'attack', reason: 'tired' }]);
    expect(droppedInputs(press({ dodgePressed: true }), { ...idle, skill: true }, none, [])).toEqual([{ input: 'dodge', reason: 'skill' }]);
    expect(droppedInputs(press({ dodgePressed: true }), { ...idle, dodging: true }, none, [])).toEqual([{ input: 'dodge', reason: 'dodging' }]);
    expect(droppedInputs(press({ dodgePressed: true }), idle, none, [{ type: 'dodge' }])).toEqual([]);
    expect(droppedInputs(press({}), idle, none, [], true)).toEqual([{ input: 'attack', reason: 'interact' }]);
    expect(droppedInputs(press({}), idle, none, [])).toEqual([]);
  });

  it("left:'hold' presses only once a hold can begin (no swing, hit-stop or ability running)", () => {
    expect(attackReady({ dead: false, swing: null, skill: null }, 0)).toBe(true);
    expect(attackReady({ dead: false, swing: { kind: 'light' }, skill: null }, 0)).toBe(false);
    expect(attackReady({ dead: false, swing: null, skill: null }, 0.06)).toBe(false);
    expect(attackReady({ dead: false, swing: null, skill: { id: 'wirbel' } }, 0)).toBe(false);
    expect(attackReady(null, 0)).toBe(true);
  });

  it('bullet time: the era shift steps with the fixed updates, travel skips its real-time wait', () => {
    expect(stepsDriveVisuals(true, false, false)).toBe(true);
    // e2e under WebDriver keeps the rAF-driven timing unless ?idle
    expect(stepsDriveVisuals(true, true, false)).toBe(false);
    expect(stepsDriveVisuals(true, true, true)).toBe(true);
    // normal play unchanged
    expect(stepsDriveVisuals(false, false, false)).toBe(false);
    expect(skipRealTimeWaits(true, new URLSearchParams(''))).toBe(true);
    expect(skipRealTimeWaits(false, new URLSearchParams('manual'))).toBe(true);
    expect(skipRealTimeWaits(false, new URLSearchParams('nosave'))).toBe(false);
  });
});

describe('pilot frame strip', () => {
  it('steps aside while the radio speaks or a dialogue is open', () => {
    expect(stripVisible(false, false)).toBe(true);
    expect(stripVisible(true, false)).toBe(false);
    expect(stripVisible(false, true)).toBe(false);
  });
});

/**
 * The pilot's inputDropped vs the round-10 input buffer (INPUT_BUFFER): the live CombatSim, stepped
 * the way the pilot taps it (state before / after each step, read-only).
 */
describe('pilot inputDropped and the combat input buffer', () => {
  const DT = 1 / 60;
  const newSim = () => {
    const groups: Record<string, EnemyGroupState> = {};
    const stats = deriveStats({ level: 4, talents: {}, equipped: { weapon: 'item.stab.eisen', charms: [] } });
    return new CombatSim({ heightAt: () => 0 }, groups, { gentle: false, reducedMotion: false, stats, sweep: false, konter: false, waerme: false, dritter: false });
  };
  const input = (o: Partial<SimInput> = {}): SimInput => ({
    x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: '1789', time: 'day', ...o,
  });
  /** A sim with the pilot's press bookkeeping on its step. */
  const piloted = () => {
    const s = newSim();
    const tracker = new PressTracker();
    const dropped: { input: string; reason: string }[] = [];
    const evs: SimEvent[] = [];
    const step = (o: Partial<SimInput> = {}) => {
      const inp = input(o);
      const before = pressBefore(s);
      const out = s.step(DT, inp);
      dropped.push(...tracker.step(DT, inp, before, pressAfter(s), out));
      evs.push(...out);
      return out;
    };
    const run = (sec: number, o: Partial<SimInput> = {}) => {
      for (let t = 0; t < sec - 1e-9; t += DT) step(o);
    };
    return { s, tracker, dropped, evs, step, run };
  };
  const count = (evs: SimEvent[], type: string) => evs.filter((e) => e.type === type).length;

  it('a press during hit-stop is buffered, not reported, and then executes', () => {
    const { s, tracker, dropped, evs, step, run } = piloted();
    step();
    s.freeze = 0.1; // a hit just landed (hit-stop shorter than the buffer)
    step({ attackPressed: true });
    expect(dropped).toEqual([]);
    expect(tracker.pending('attack')).toBe(true);
    expect(count(evs, 'swing')).toBe(0);
    run(0.2);
    expect(count(evs, 'swing')).toBe(1);
    expect(tracker.pending('attack')).toBe(false);
    run(1);
    expect(dropped).toEqual([]);
  });

  it('a dodge during hit-stop is buffered too and rolls when the freeze ends', () => {
    const { s, dropped, evs, step, run } = piloted();
    step();
    s.freeze = 0.1;
    step({ dodgePressed: true });
    run(0.5);
    expect(count(evs, 'dodge')).toBe(1);
    expect(dropped).toEqual([]);
  });

  it('a press during the swing recovery is buffered, not reported (and becomes the next combo hit)', () => {
    const { s, tracker, dropped, evs, step, run } = piloted();
    step({ attackPressed: true });
    expect(count(evs, 'swing')).toBe(1);
    // the very next frame: still outside the combo window (the old code said 'recovery')
    step({ attackPressed: true });
    const w = s.p.swing!;
    expect(w.dur - w.t).toBeGreaterThan(0.35);
    expect(s.p.queued).toBe(false);
    expect(dropped).toEqual([]);
    expect(tracker.pending('attack')).toBe(true);
    run(1);
    expect(count(evs, 'swing')).toBe(2);
    expect(dropped).toEqual([]);
  });

  it('a buffered press that runs out unused is reported once as bufferExpired', () => {
    // a dodge 0.02 s into a roll: 0.33 s of roll left > the 0.25 s buffer
    const a = piloted();
    a.step({ dodgePressed: true });
    a.run(0.02);
    a.step({ dodgePressed: true });
    expect(a.dropped).toEqual([]);
    a.run(1);
    expect(count(a.evs, 'dodge')).toBe(1);
    expect(a.dropped).toEqual([{ input: 'dodge', reason: 'bufferExpired' }]);
    // an attack pressed into a hit-stop longer than the buffer
    const b = piloted();
    b.step();
    b.s.freeze = INPUT_BUFFER + 0.15;
    b.step({ attackPressed: true });
    b.run(INPUT_BUFFER - DT * 2);
    expect(b.dropped).toEqual([]);
    b.run(1);
    expect(count(b.evs, 'swing')).toBe(0);
    expect(b.dropped).toEqual([{ input: 'attack', reason: 'bufferExpired' }]);
  });

  it('real drops are still reported: tired, dead, blocked', () => {
    const tired = piloted();
    tired.s.p.st.stamina = 0;
    tired.s.p.st.exhausted = true;
    tired.step({ attackPressed: true });
    expect(tired.dropped).toEqual([{ input: 'attack', reason: 'tired' }]);
    expect(tired.tracker.pending('attack')).toBe(false);

    const dead = piloted();
    dead.step();
    dead.s.p.dead = true;
    dead.step({ attackPressed: true, dodgePressed: true });
    dead.run(1);
    // reported once, not again when the (never used) buffer runs out
    expect(dead.dropped).toEqual([{ input: 'attack', reason: 'dead' }, { input: 'dodge', reason: 'dead' }]);

    const blocked = piloted();
    blocked.step({ attackPressed: true, blocked: true });
    expect(blocked.dropped).toEqual([{ input: 'attack', reason: 'blocked' }]);
  });

  it('a waiting press cleared by a block is reported with that reason', () => {
    const t = new PressTracker();
    const idle = { dead: false, freeze: 0.05, swing: false, dodging: false, skill: false, bufAtk: 0, bufDodge: 0 };
    const quiet = { attackPressed: false, dodgePressed: false, blocked: false };
    expect(t.step(DT, { ...quiet, attackPressed: true }, idle, { queued: false, hold: -1, skill: false, bufAtk: INPUT_BUFFER, bufDodge: 0 }, [])).toEqual([]);
    expect(t.pending('attack')).toBe(true);
    expect(t.step(DT, { ...quiet, blocked: true }, { ...idle, bufAtk: INPUT_BUFFER }, { queued: false, hold: -1, skill: false, bufAtk: 0, bufDodge: 0 }, [])).toEqual([{ input: 'attack', reason: 'blocked' }]);
    expect(t.pending('attack')).toBe(false);
  });
});
