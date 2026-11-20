import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../src/player/input';
import { KEY_PITCH_FACTOR, KEY_TURN_RATE, KEY_TURN_TAU, type KeyTurnRates, easeRate, stepKeyTurn } from '../src/player/keyTurn';
import { EventRing, STUCK_SECONDS, type Situation, Telemetry, normaliseTelemetry, trimPayload } from '../src/systems/notes/logic';

/** Hold a turn input for `seconds` in steps of `dt`; returns the total yaw / pitch change. */
function hold(rates: KeyTurnRates, h: number, v: number, seconds: number, dt: number, speed = KEY_TURN_RATE) {
  let yaw = 0;
  let pitch = 0;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    const d = stepKeyTurn(rates, { h, v, speed }, dt);
    yaw += d.dYaw;
    pitch += d.dPitch;
  }
  return { yaw, pitch };
}

describe('arrow-key turning (§3.4)', () => {
  it('← / → turn the view, ↑ / ↓ still walk, A / D strafe, Bild↑ / Bild↓ tilt', () => {
    expect(DEFAULT_BINDINGS.lookLeft).toContain('ArrowLeft');
    expect(DEFAULT_BINDINGS.lookRight).toContain('ArrowRight');
    expect(DEFAULT_BINDINGS.left).toEqual(['KeyA']);
    expect(DEFAULT_BINDINGS.right).toEqual(['KeyD']);
    expect(DEFAULT_BINDINGS.forward).toEqual(['KeyW', 'ArrowUp']);
    expect(DEFAULT_BINDINGS.back).toEqual(['KeyS', 'ArrowDown']);
    expect(DEFAULT_BINDINGS.lookUp).toContain('PageUp');
    expect(DEFAULT_BINDINGS.lookDown).toContain('PageDown');
    // F8 belongs to the notes, never to an action
    for (const codes of Object.values(DEFAULT_BINDINGS)) expect(codes).not.toContain('F8');
  });

  it('settles at ≈ 120°/s; left is + yaw (Player.yaw convention), right is −', () => {
    const r = { yaw: 0, pitch: 0 };
    hold(r, 1, 0, 1, 1 / 60);
    expect(r.yaw).toBeCloseTo(KEY_TURN_RATE, 3);
    expect((r.yaw * 180) / Math.PI).toBeCloseTo(120, 0);
    const r2 = { yaw: 0, pitch: 0 };
    const d = hold(r2, -1, 0, 1, 1 / 60);
    expect(d.yaw).toBeLessThan(0);
    // one second from rest: the full rate minus the ease-in (τ)
    expect(-d.yaw).toBeCloseTo(KEY_TURN_RATE * (1 - KEY_TURN_TAU * (1 - Math.exp(-1 / KEY_TURN_TAU))), 4);
  });

  it('is frame-rate independent (30, 60, 144 Hz and one big step agree)', () => {
    const at = (dt: number) => hold({ yaw: 0, pitch: 0 }, 1, 1, 0.5, dt);
    const ref = at(1 / 60);
    for (const dt of [1 / 30, 1 / 144, 0.5]) {
      const d = at(dt);
      expect(d.yaw).toBeCloseTo(ref.yaw, 6);
      expect(d.pitch).toBeCloseTo(ref.pitch, 6);
    }
  });

  it('eases in and out (smooth): a tap turns a little, letting go coasts briefly then stops', () => {
    const r = { yaw: 0, pitch: 0 };
    const tap = hold(r, 1, 0, 1 / 60, 1 / 60);
    expect(tap.yaw).toBeGreaterThan(0);
    expect(tap.yaw).toBeLessThan(KEY_TURN_RATE / 60);
    hold(r, 1, 0, 0.5, 1 / 60);
    const coast = hold(r, 0, 0, 2, 1 / 60);
    expect(coast.yaw).toBeGreaterThan(0);
    expect(coast.yaw).toBeLessThan(KEY_TURN_RATE * KEY_TURN_TAU * 1.01);
    expect(r.yaw).toBe(0);
    // reversing direction passes through zero smoothly instead of snapping
    const r3 = { yaw: KEY_TURN_RATE, pitch: 0 };
    stepKeyTurn(r3, { h: -1, v: 0, speed: KEY_TURN_RATE }, 1 / 60);
    expect(r3.yaw).toBeGreaterThan(0);
  });

  it('pitch is slower than yaw; speed scales with the sensitivity; dt ≤ 0 does nothing', () => {
    const r = { yaw: 0, pitch: 0 };
    hold(r, 0, -1, 2, 1 / 60);
    expect(r.pitch).toBeCloseTo(-KEY_TURN_RATE * KEY_PITCH_FACTOR, 3);
    const fast = hold({ yaw: 0, pitch: 0 }, 1, 0, 1, 1 / 60, KEY_TURN_RATE * 2);
    const slow = hold({ yaw: 0, pitch: 0 }, 1, 0, 1, 1 / 60);
    expect(fast.yaw / slow.yaw).toBeCloseTo(2, 6);
    expect(easeRate(1, 0, 0)).toBe(1);
    expect(stepKeyTurn({ yaw: 1, pitch: 0 }, { h: 1, v: 0, speed: 1 }, 0)).toEqual({ dYaw: 0, dPitch: 0 });
  });
});

const at = (over: Partial<Situation> = {}): Situation => ({ x: 10.04, z: -20, era: '1789', quest: 'q.k1.a', objective: 'Zum Tor', play: 100, at: '2026-11-20T10:00:00.000Z', ...over });

describe('F8 notes: event ring (§3.3)', () => {
  it('keeps the last 30 s, drops noisy events, makes t relative', () => {
    const r = new EventRing();
    r.push(0, 'quest:accepted', { id: 'old' });
    r.push(5, 'player:step', { x: 1, z: 2, surface: 'grass', running: false });
    r.push(20, 'enemy:killed', { id: 'e1', kind: 'streuner' });
    r.push(40, 'player:damaged', { amount: 12.345, hp: 50, max: 100, by: 'streuner' });
    const s = r.snapshot(45);
    expect(s.map((e) => e.name)).toEqual(['enemy:killed', 'player:damaged']);
    expect(s[0]!.t).toBe(-25);
    expect(s[1]!.p).toContain('12.3');
  });

  it('caps the count and the payload size', () => {
    const r = new EventRing(30, 10);
    for (let i = 0; i < 50; i++) r.push(i * 0.1, 'combat:hit', { i });
    expect(r.size).toBe(10);
    const long = trimPayload({ text: 'x'.repeat(500), list: Array.from({ length: 20 }, (_, i) => i) });
    expect(long.length).toBeLessThanOrEqual(240);
    expect(trimPayload({ a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })).toContain('…+2');
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(trimPayload(cyc)).toContain('unserialisable');
  });
});

describe('passive telemetry (§3.3)', () => {
  it('times a quest from accept to turn-in (active play seconds)', () => {
    const t = new Telemetry();
    t.questAccepted('q.a', 100);
    t.questAccepted('q.a', 150); // a second accept does not restart the clock
    const q = t.questCompleted('q.a', true, 400, 'now');
    expect(q).toMatchObject({ id: 'q.a', start: 100, end: 400, seconds: 300, main: true });
    expect(t.s.open).toEqual({});
    expect(t.questCompleted('q.never', false, 10, 'now')).toBeNull();
    t.questAccepted('q.b', 10);
    t.questDropped('q.b');
    expect(t.s.open).toEqual({});
    t.questAccepted('q.c', 500);
    t.newGame();
    expect(t.s.open).toEqual({});
    expect(t.dirty).toBe(true);
  });

  it('records deaths / KOs with place, killer and objective', () => {
    const t = new Telemetry();
    const d = t.death('died', 'streuner', at(), { family: 'tier' });
    expect(d).toMatchObject({ kind: 'died', by: 'streuner', family: 'tier', x: 10, z: -20, era: '1789', quest: 'q.k1.a', objective: 'Zum Tor' });
    expect(t.s.deaths).toHaveLength(1);
  });

  it('opens a stuck episode after 3 min of active play with an objective, ends it on progress', () => {
    const t = new Telemetry();
    // no objective: the clock does not run
    expect(t.tick(600, at(), false)).toBeNull();
    expect(t.s.sinceProgress).toBe(0);
    for (let s = 0; s < STUCK_SECONDS - 1; s++) expect(t.tick(1, at(), true)).toBeNull();
    const e = t.tick(1, at({ x: 5, z: 6 }), true);
    expect(e).toMatchObject({ x: 5, z: 6, objective: 'Zum Tor', ended: false });
    expect(t.tick(60, at(), true)).toBeNull(); // the open one grows, no second episode
    expect(t.s.stuck).toHaveLength(1);
    expect(t.s.stuck[0]!.seconds).toBe(STUCK_SECONDS + 60);
    t.progress();
    expect(t.s.stuck[0]!.ended).toBe(true);
    expect(t.s.sinceProgress).toBe(0);
    expect(t.openStuck()).toBeNull();
  });

  it('normalises stored telemetry (IndexedDB) and resets', () => {
    expect(normaliseTelemetry(null).quests).toEqual([]);
    const n = normaliseTelemetry({ quests: [{ id: 'a' }], sinceProgress: 12, open: { b: 3 } });
    expect(n.quests).toHaveLength(1);
    expect(n.sinceProgress).toBe(12);
    expect(n.open).toEqual({ b: 3 });
    const t = new Telemetry(n);
    t.reset();
    expect(t.s.quests).toEqual([]);
  });
});
