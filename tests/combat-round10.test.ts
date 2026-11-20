/**
 * Playtest round 10 combat rules (docs/PLAYTEST-ROUND10.md F-05, F-06, F-12, F-22, F-23, F-34, F-37;
 * docs/BALANCE.md §6): the stumble out of Atem, the forgiving reset, the reform rule, the input
 * buffer and the light Hieb's step-in. Sim-level and deterministic.
 */
import { describe, expect, it } from 'vitest';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { COMBO, INPUT_BUFFER, RESET, STEP_IN, STUMBLE, dodgeInvulnerable, dodgeSpeed, keepsWounds, leashBroken, upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, type Enemy, REFORM_HP, REFORMERS, type SimEvent, type SimInput, canReform } from '../src/systems/combat/sim';
import { captionToDrop } from '../src/systems/combat/hud';
import { reformLessonKey } from '../src/systems/combat/strings';
import { t } from '../src/i18n';

const flat = { heightAt: () => 0 };
const DT = 1 / 60;

function sim() {
  const groups: Record<string, EnemyGroupState> = {};
  const stats = deriveStats({ level: 4, talents: {}, equipped: { weapon: 'item.stab.eisen', charms: [] } });
  const s = new CombatSim(flat, groups, { gentle: false, reducedMotion: false, stats, sweep: false, konter: false, waerme: false, dritter: false });
  return { s, groups };
}

function input(o: Partial<SimInput> = {}): SimInput {
  return { x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: '1789', time: 'day', ...o };
}

/** Step `sec` seconds; `pin` keeps an enemy where the test put it (and out of its own attacks). */
function run(s: CombatSim, sec: number, o: Partial<SimInput> = {}, pin?: { e: Enemy; x: number; z: number }): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < sec - 1e-9; t += DT) {
    if (pin) {
      pin.e.x = pin.x;
      pin.e.z = pin.z;
      pin.e.vx = 0;
      pin.e.vz = 0;
      for (const k in pin.e.cd) pin.e.cd[k] = 99;
    }
    out.push(...s.step(DT, input(o)));
  }
  return out;
}

/** One press of the attack button, then `sec` s without. */
function tap(s: CombatSim, pin?: { e: Enemy; x: number; z: number }, sec = 0.5): SimEvent[] {
  return [...run(s, DT, { attackPressed: true }, pin), ...run(s, sec, {}, pin)];
}

/** One enemy of `kind` at (x, z), materialised. */
function one(kind: string, x: number, z: number, o: Partial<EnemyGroupState> & { group?: string } = {}) {
  const { s, groups } = sim();
  upsertGroup(groups, { group: o.group ?? 'g', kind, era: '1789', x, z, count: 1, tier: 1, ...o });
  s.step(DT, input());
  const e = s.live()[0]!;
  e.x = x;
  e.z = z;
  return { s, groups, e };
}

describe('round 10 · F-12: out of Atem the roll still comes out (a stumble)', () => {
  it('exhausted: a dodge is a short stumble with short i-frames, never perfect; hits stay blocked', () => {
    const { s } = sim();
    s.p.st.stamina = 0;
    s.p.st.exhausted = true;
    expect(s.dodgeKind()).toBe('stumble');
    const evs = s.step(DT, input({ dodgePressed: true, moveX: 1 }));
    const d = evs.find((v) => v.type === 'dodge');
    expect(d && d.type === 'dodge' && d.stumble).toBe(true);
    expect(d && d.type === 'dodge' && d.perfect).toBe(false);
    if (d && d.type === 'dodge') expect(Math.hypot(d.vx, d.vz)).toBeCloseTo(dodgeSpeed(STUMBLE.dist), 5);
    expect(s.p.dodge?.stumble).toBe(true);
    // it costs nothing and does not hold the Atem back
    expect(s.p.st.stamina).toBeLessThan(1);
    expect(s.p.st.idle).toBeGreaterThan(1);
    // the window is shorter than a full roll's
    expect(dodgeInvulnerable(0.3, true)).toBe(false);
    expect(dodgeInvulnerable(0.3, false)).toBe(true);
    expect(dodgeInvulnerable(0.15, true)).toBe(true);
    // the staff stays down
    run(s, 0.4);
    const atk = s.step(DT, input({ attackPressed: true }));
    expect(atk.some((v) => v.type === 'tired')).toBe(true);
    expect(s.p.swing).toBeNull();
  });

  it('one stumble per STUMBLE.cd s; a full roll comes back once the Atem does', () => {
    const { s } = sim();
    s.p.st.stamina = 0;
    s.p.st.exhausted = true;
    s.step(DT, input({ dodgePressed: true }));
    run(s, 0.4);
    // still exhausted (Atem < 25) and inside the cooldown
    s.p.st.stamina = 0;
    expect(s.dodgeKind()).toBeNull();
    expect(s.step(DT, input({ dodgePressed: true })).some((v) => v.type === 'tired')).toBe(true);
    run(s, STUMBLE.cd);
    s.p.st.stamina = 0;
    s.p.st.exhausted = true;
    expect(s.dodgeKind()).toBe('stumble');
    s.p.st.stamina = 60;
    s.p.st.exhausted = false;
    expect(s.dodgeKind()).toBe('roll');
  });
});

describe('round 10 · F-05: one roll away does not end the fight', () => {
  it('no leash is shorter than RESET.minLeash', () => {
    const home = { x: 0, z: 0 };
    expect(leashBroken(home, { x: 10, z: 0 }, { x: 12, z: 0 }, 5)).toBe(false);
    expect(leashBroken(home, { x: RESET.minLeash + 1, z: 0 }, { x: 0, z: 0 }, 5)).toBe(true);
  });

  it('a safe zone (or a broken leash) must hold for the grace before an enemy gives up; it does not heal on the way home', () => {
    const { s, e } = one('nebelling', 0, -4);
    run(s, 1);
    expect(e.aggro).toBe(true);
    e.hp = 5;
    // a short dip into the field station's circle: nothing happens
    run(s, RESET.grace - 1, { safe: 'station' });
    expect(e.aggro).toBe(true);
    run(s, 0.5);
    expect(e.leashT).toBe(0);
    // staying there: after the grace it gives up and walks home, still wounded
    run(s, RESET.grace + 0.1, { safe: 'station' });
    expect(e.aggro).toBe(false);
    expect(['return', 'idle']).toContain(e.state);
    expect(e.hp).toBeLessThanOrEqual(5);
  });

  it('quest, escort, wave and prologue enemies keep their wounds; others heal slowly after RESET.regenDelay at home', () => {
    expect(keepsWounds({ boss: false, tier: 1, quest: 'q.x' })).toBe(true);
    expect(keepsWounds({ boss: false, tier: 1, escort: true })).toBe(true);
    expect(keepsWounds({ boss: false, tier: 0 })).toBe(true);
    expect(keepsWounds({ boss: false, tier: 1 })).toBe(false);
    expect(keepsWounds({ boss: true, tier: 1, quest: 'q.x' })).toBe(false);

    const quest = one('nebelling', 0, -4, { quest: 'q.test' } as Partial<EnemyGroupState>);
    expect(quest.e.quest).toBe('q.test');
    run(quest.s, 1);
    quest.e.hp = 5;
    run(quest.s, 30, { safe: 'station' });
    expect(quest.e.aggro).toBe(false);
    expect(quest.e.hp).toBe(5);

    const wild = one('nebelling', 0, -4);
    run(wild.s, 1);
    wild.e.hp = 5;
    run(wild.s, RESET.grace + 3, { safe: 'station' });
    expect(wild.e.aggro).toBe(false);
    // home but not yet rested: still 5
    expect(wild.e.hp).toBe(5);
    run(wild.s, 30, { safe: 'station' });
    expect(wild.e.hp).toBeGreaterThan(5);
    // slow: at most RESET.regenPerS of its strength per second
    expect(wild.e.hp).toBeLessThanOrEqual(5 + wild.e.maxHp * RESET.regenPerS * 30 + 1e-6);
  });
});

describe('round 10 · F-22 / F-34: paper and mist pull together by one rule', () => {
  it('a plain Hieb that empties it: it reforms once at REFORM_HP, then the next empty bar undoes it', () => {
    const { s, e } = one('nebelling', 0, -2);
    expect(canReform(e)).toBe(true);
    e.hp = 1;
    const a = tap(s, { e, x: 0, z: -2 });
    expect(a.some((v) => v.type === 'reform')).toBe(true);
    expect(e.reformed).toBe(true);
    expect(e.hp).toBe(Math.ceil(e.maxHp * REFORM_HP));
    expect(canReform(e)).toBe(false);
    e.hp = 1;
    run(s, 0.5);
    const b = tap(s, { e, x: 0, z: -2 });
    expect(b.some((v) => v.type === 'killed')).toBe(true);
  });

  it('a follow-up Hieb (2nd of the chain) undoes it for good', () => {
    const { s, e } = one('nebelling', 0, -2);
    e.hp = e.maxHp;
    const pin = { e, x: 0, z: -2 };
    // first Hieb of the chain lands, then empty it just before the second
    run(s, DT, { attackPressed: true }, pin);
    run(s, 0.3, {}, pin);
    e.hp = 1;
    const evs = tap(s, pin, 0.4);
    expect(s.p.lastCombo === 1 || evs.some((v) => v.type === 'swing' && v.combo === 1)).toBe(true);
    expect(evs.some((v) => v.type === 'reform')).toBe(false);
    expect(evs.some((v) => v.type === 'killed')).toBe(true);
  });

  it('once the Bannlicht has touched it, it no longer reforms (even after the hold wears off)', () => {
    const { s, e } = one('nebelling', 0, -2);
    e.lastBann = 0.5;
    e.stun = 0;
    e.hp = 1;
    const a = tap(s, { e, x: 0, z: -2 });
    expect(a.some((v) => v.type === 'reform')).toBe(false);
    expect(a.some((v) => v.type === 'killed')).toBe(true);
  });

  it('the first reform of every kind has its lesson, and a pinned lesson is never pushed out by captions', () => {
    for (const k of REFORMERS) {
      const text = t(reformLessonKey(k));
      expect(text, k).not.toBe(reformLessonKey(k));
      expect(text).toMatch(/Bannlicht/);
    }
    // two telegraphs, then the lesson, then two more telegraphs: the lesson stays
    let lines: { pin: boolean; id: string }[] = [];
    const add = (id: string, pin = false) => {
      lines.push({ pin, id });
      for (let i = captionToDrop(lines.map((l) => l.pin)); i >= 0; i = captionToDrop(lines.map((l) => l.pin))) lines = lines.filter((_, j) => j !== i);
    };
    add('a');
    add('b');
    add('lesson', true);
    add('c');
    add('d');
    add('e');
    expect(lines.map((l) => l.id)).toContain('lesson');
    expect(lines.filter((l) => !l.pin)).toHaveLength(2);
    expect(lines.map((l) => l.id)).toEqual(['lesson', 'd', 'e']);
    // without pins: two lines at most, as before
    expect(captionToDrop([false, false, false])).toBe(0);
    expect(captionToDrop([false, false])).toBe(-1);
  });

  it('held by the Bannlicht, it is undone at once', () => {
    const { s, e } = one('mahnbrief', 0, -2);
    e.hp = 1;
    e.stun = 2;
    e.bannBonus = true;
    const a = tap(s, { e, x: 0, z: -2 });
    expect(a.some((v) => v.type === 'reform')).toBe(false);
    expect(a.some((v) => v.type === 'killed')).toBe(true);
  });

  it('the prologue tutorial ones (tier 0) never reform; other kinds never do', () => {
    const t0 = one('nebelling', 0, -2, { tier: 0 });
    expect(canReform(t0.e)).toBe(false);
    t0.e.hp = 1;
    expect(tap(t0.s, { e: t0.e, x: 0, z: -2 }).some((v) => v.type === 'killed')).toBe(true);
    const st = one('streuner', 0, -2);
    expect(canReform(st.e)).toBe(false);
  });
});

describe('round 10 · F-23: presses are buffered, not swallowed', () => {
  it('an attack pressed during hit-stop comes out when the freeze ends', () => {
    const { s, e } = one('foliant', 0, -2.4);
    e.hp = e.maxHp = 9999;
    e.heading = 0; // its back to us (no guard)
    const pin = { e, x: 0, z: -2.4 };
    const evs: SimEvent[] = [];
    evs.push(...run(s, DT, { attackPressed: true }, pin));
    // wait for the hit (hit-stop starts with it)
    let guard = 0;
    while (!evs.some((v) => v.type === 'hit') && guard++ < 60) evs.push(...run(s, DT, {}, pin));
    expect(evs.some((v) => v.type === 'hit')).toBe(true);
    // a press in the very frame after the hit lands during the freeze
    const swingsBefore = evs.filter((v) => v.type === 'swing').length;
    evs.push(...run(s, DT, { attackPressed: true }, pin));
    evs.push(...run(s, 0.6, {}, pin));
    expect(evs.filter((v) => v.type === 'swing').length).toBe(swingsBefore + 1);
  });

  it('a dodge pressed during hit-stop comes out; one pressed late in a roll chains, one pressed early expires', () => {
    const { s, e } = one('foliant', 0, -2.4);
    e.hp = e.maxHp = 9999;
    e.heading = 0;
    const pin = { e, x: 0, z: -2.4 };
    const evs: SimEvent[] = [];
    evs.push(...run(s, DT, { attackPressed: true }, pin));
    let guard = 0;
    while (!evs.some((v) => v.type === 'hit') && guard++ < 60) evs.push(...run(s, DT, {}, pin));
    const freezeDodge = run(s, DT, { dodgePressed: true }, pin);
    const after = run(s, INPUT_BUFFER, {}, pin);
    expect([...freezeDodge, ...after].filter((v) => v.type === 'dodge')).toHaveLength(1);

    // a fresh sim: press again 0.02 s into a roll (0.33 s left > the buffer) → dropped
    const a = sim().s;
    a.step(DT, input({ dodgePressed: true }));
    run(a, 0.02);
    const early = [...a.step(DT, input({ dodgePressed: true })), ...run(a, 0.6)];
    expect(early.filter((v) => v.type === 'dodge')).toHaveLength(0);
    // …and 0.2 s in (0.15 s left) → the next roll follows straight on
    const b = sim().s;
    b.step(DT, input({ dodgePressed: true }));
    run(b, 0.2);
    const late = [...b.step(DT, input({ dodgePressed: true })), ...run(b, 0.4)];
    expect(late.filter((v) => v.type === 'dodge')).toHaveLength(1);
  });
});

describe('round 10 · F-06 / F-37: the staff reaches what looks adjacent', () => {
  const R = 0.55; // a Nebelling's body radius
  it('a target just out of reach: the Hieb steps in (≤ STEP_IN.max) and the tolerance lands it even without moving', () => {
    const z = -(COMBO.reach + R + 0.3);
    const { s, e } = one('nebelling', 0, z, { tier: 0 });
    e.hp = e.maxHp = 999;
    const evs = tap(s, { e, x: 0, z });
    const step = evs.find((v) => v.type === 'step');
    expect(step).toBeTruthy();
    if (step && step.type === 'step') {
      // a decaying push covers v·dur/2
      const dist = (Math.hypot(step.vx, step.vz) * step.dur) / 2;
      expect(dist).toBeGreaterThan(0.3);
      expect(dist).toBeLessThanOrEqual(STEP_IN.max + 1e-9);
      expect(step.vz).toBeLessThan(0); // towards it (−z)
    }
    expect(evs.some((v) => v.type === 'hit')).toBe(true);
    expect(evs.some((v) => v.type === 'whiff')).toBe(false);
  });

  it('within plain reach no step; far beyond step and tolerance nothing pulls you in and the swing whiffs', () => {
    const near = one('nebelling', 0, -2, { tier: 0 });
    near.e.hp = near.e.maxHp = 999;
    const a = tap(near.s, { e: near.e, x: 0, z: -2 });
    expect(a.some((v) => v.type === 'step')).toBe(false);
    expect(a.some((v) => v.type === 'hit')).toBe(true);
    const z = -(COMBO.reach + R + STEP_IN.max + STEP_IN.tol + 0.3);
    const far = one('nebelling', 0, z, { tier: 0 });
    const b = tap(far.s, { e: far.e, x: 0, z });
    expect(b.some((v) => v.type === 'step')).toBe(false);
    expect(b.some((v) => v.type === 'whiff')).toBe(true);
  });

  it('the Foliant (radius 0.7) at 3.4 m from its centre, as in F-37: the swing lands', () => {
    const { s, e } = one('foliant', 0, -3.4);
    e.hp = e.maxHp = 9999;
    e.heading = 0;
    const evs = tap(s, { e, x: 0, z: -3.4 });
    expect(evs.some((v) => v.type === 'hit' || v.type === 'blocked')).toBe(true);
    expect(evs.some((v) => v.type === 'whiff')).toBe(false);
  });
});
