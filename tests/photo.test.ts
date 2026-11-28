import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../src/i18n';
import '../src/systems/photo';
import { ALBUM_MAX, type GrantSink, PhotoCore, type PhotoSlice, type PhotoTargetDef, type PhotoView, type PhotoWorld, SEEN_CLEAR, SEEN_MIN, STEADY_RAD_S, SteadyMeter, debugDeerBlocker, emptySlice, goodEvents, judgeShot, judgeTarget, normaliseSlice, project } from '../src/systems/photo/core';
import { targetFromData, validatePhotoTargets } from '../src/systems/photo/data';
import { validateQuests } from '../src/systems/quests/validate';
import { eventMatches } from '../src/systems/story/engine';
import type { EventCond } from '../src/systems/story/types';
import { QuestBook, type QuestDefIn, type QuestEnv, createQuestSlice } from '../src/systems/quests/logic';

it('describes the phone toggle without an era restriction in the controls reference', () => {
  expect(t('ui.keys.photo')).toBe('Handy-Kamera öffnen oder wegstecken');
});

/** A flat world, nothing in the way. */
const flat: PhotoWorld = { heightAt: () => 0 };

/** Lens at the origin, 1.6 m up, looking north (−z), 60° vertical fov, 16:9, steady. */
const view = (o: Partial<PhotoView> = {}): PhotoView => ({ x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0, fovV: 60, aspect: 16 / 9, angularSpeed: 0, ...o });

/** A target `d` metres north of the lens at eye height. */
const target = (o: Partial<PhotoTargetDef> & { d?: number; dx?: number } = {}): PhotoTargetDef => {
  const d = o.d ?? 10;
  const dx = o.dx ?? 0;
  return { id: 'reh.ricke', era: 'today', at: () => ({ x: dx, y: 1.6, z: -d }), r: 0.8, minFrac: 0.06, maxDist: 14, label_de: 'Ricke', ...o };
};

const sink = (known: string[] = []) => {
  const log = { codex: [] as string[], card: [] as string[], flag: [] as string[], warn: [] as string[] };
  const s: GrantSink = {
    knownFact: (id) => known.includes(id),
    knownCard: (id) => known.includes(id),
    codex: (id) => log.codex.push(id),
    card: (id) => log.card.push(id),
    flag: (id) => log.flag.push(id),
    warn: (m) => log.warn.push(m),
  };
  return { s, log };
};

describe('photo mode: geometric judging', () => {
  it('projects the view centre to (0, 0) and keeps right / up the right way round', () => {
    const p = project(view(), { x: 0, y: 1.6, z: -10 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(project(view(), { x: 2, y: 1.6, z: -10 }).x).toBeGreaterThan(0);
    expect(project(view(), { x: 0, y: 3, z: -10 }).y).toBeGreaterThan(0);
    expect(project(view(), { x: 0, y: 1.6, z: 10 }).depth).toBeLessThan(0);
  });

  it('a centred target near enough is good (2 stars), closer than 0.6 × maxDist gives 3', () => {
    const j = judgeTarget(target({ d: 10 }), view(), flat, false);
    expect(j.good).toBe(true);
    expect(j.stars).toBe(2);
    expect(j.verdict).toBe('gut');
    const close = judgeTarget(target({ d: 6 }), view(), flat, false);
    expect(close.stars).toBe(3);
    expect(close.verdict).toBe('perfekt');
  });

  it('off-centre: in the frame but outside the middle third → „Nicht mittig“, 1 star', () => {
    // at 10 m, the half-width of the frame is 10 · tan30° · 16/9 ≈ 10.3 m: 6 m right ≈ 0.58 NDC
    const j = judgeTarget(target({ d: 10, dx: 6 }), view(), flat, false);
    expect(j.inFrame).toBe(true);
    expect(j.good).toBe(false);
    expect(j.stars).toBe(1);
    expect(j.verdict).toBe('nicht-mittig');
  });

  it('a target behind the lens is not in the frame (0 stars)', () => {
    const j = judgeTarget(target({ d: -10 }), view(), flat, false);
    expect(j.inFrame).toBe(false);
    expect(j.stars).toBe(0);
  });

  it('occluded: a ridge or a trunk between lens and target → „Verdeckt“', () => {
    const ridge: PhotoWorld = { heightAt: (_x, z) => (z < -4 && z > -6 ? 3 : 0) };
    expect(judgeTarget(target(), view(), ridge, false).verdict).toBe('verdeckt');
    // a trunk 5 m out, thick enough to hide two of three sample points
    const trunk: PhotoWorld = {
      heightAt: () => 0,
      trunks: (x, z, r, fn) => {
        if (Math.hypot(x, z + 5) < r + 0.6) fn(0, -5, 0.6, 12);
      },
    };
    expect(judgeTarget(target(), view(), trunk, false).verdict).toBe('verdeckt');
    // a thin sapling covers one sample at most: still good
    const thin: PhotoWorld = {
      heightAt: () => 0,
      trunks: (x, z, r, fn) => {
        if (Math.hypot(x + 0.24, z + 5) < r + 0.05) fn(-0.24, -5, 0.05, 12);
      },
    };
    expect(judgeTarget(target(), view(), thin, false).good).toBe(true);
  });

  it('too far: beyond maxDist → „Zu weit weg“', () => {
    const j = judgeTarget(target({ d: 18, minFrac: 0.01 }), view(), flat, false);
    expect(j.verdict).toBe('zu-weit');
    expect(j.good).toBe(false);
  });

  it('too small: under minFrac of the frame height → „Zu klein im Bild“', () => {
    const j = judgeTarget(target({ d: 12, minFrac: 0.3 }), view(), flat, false);
    expect(j.frac).toBeLessThan(0.3);
    expect(j.verdict).toBe('zu-klein');
  });

  it('the 2× zoom doubles the projected size', () => {
    const a = judgeTarget(target({ d: 12 }), view({ fovV: 60 }), flat, false);
    const k = 2 * Math.atan(Math.tan(Math.PI / 6) / 2) * (180 / Math.PI);
    const b = judgeTarget(target({ d: 12 }), view({ fovV: k }), flat, false);
    expect(b.frac / a.frac).toBeCloseTo(2, 3);
  });

  it('unsteady: the camera turned fast in the last 0.3 s → „Unscharf“', () => {
    const j = judgeTarget(target(), view({ angularSpeed: STEADY_RAD_S * 3 }), flat, false);
    expect(j.verdict).toBe('unscharf');
  });

  it('alerted: calm() false → „Aufgeschreckt“, true → good', () => {
    let calm = false;
    const t = target({ calm: () => calm });
    expect(judgeTarget(t, view(), flat, false).verdict).toBe('aufgeschreckt');
    calm = true;
    expect(judgeTarget(t, view(), flat, false).good).toBe(true);
  });

  it('min distance and centre "any" (data rules)', () => {
    expect(judgeTarget(target({ d: 3, minDist: 5 }), view(), flat, false).verdict).toBe('zu-nah');
    expect(judgeTarget(target({ d: 10, dx: 6, centre: 'any' }), view(), flat, false).good).toBe(true);
  });

  it('fallback distance: only after the fallback clock ran out, with its stars', () => {
    const t = target({ d: 20, minFrac: 0.03, fallbackDist: 22, fallbackAfterS: 90, fallbackStars: 2 });
    expect(judgeTarget(t, view(), flat, false).verdict).toBe('zu-weit');
    const j = judgeTarget(t, view(), flat, true);
    expect(j.good).toBe(true);
    expect(j.fallback).toBe(true);
    expect(j.stars).toBe(2);
    expect(j.verdict).toBe('weit-ok');
  });

  it('a fallback shot under two stars is not good: no good id, no album entry, no has()', () => {
    const t = target({ d: 20, minFrac: 0.03, fallbackDist: 22, fallbackAfterS: 90, fallbackStars: 1 });
    const j = judgeTarget(t, view(), flat, true);
    expect(j.good).toBe(false);
    expect(j.stars).toBe(1);
    expect(j.verdict).toBe('zu-weit');
    const s = emptySlice();
    s.near['reh.ricke'] = 999;
    const core = new PhotoCore(() => s);
    core.register(t);
    const r = core.judge('today', view(), flat);
    expect(r.good).toEqual([]);
    expect(r.stars).toBe(1);
    // the photo:good loop of index.ts emits nothing
    expect(r.details.filter((d) => d.good)).toEqual([]);
    const { s: sk, log } = sink();
    expect(core.book(r, 'x', 0, sk)).toEqual([]);
    expect(s.album).toEqual([]);
    expect(core.has('reh.ricke')).toBe(false);
    expect(log.flag).toEqual([]);
    // a 3-star fallback is good
    core.register({ ...t, fallbackStars: 3 });
    expect(core.judge('today', view(), flat).good).toEqual(['reh.ricke']);
  });

  it('the fallback clock counts seconds within fallbackDist (PhotoCore.tick)', () => {
    let s = emptySlice();
    const core = new PhotoCore(() => s);
    core.register(target({ d: 20, minFrac: 0.03, fallbackDist: 22, fallbackAfterS: 90 }));
    const player = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 89 * 10; i++) core.tick(0.1, 'today', player);
    expect(core.judge('today', view(), flat).good).toEqual([]);
    // far away nothing counts
    core.tick(5, 'today', { x: 500, y: 0, z: 500 });
    expect(core.fallbackReady('reh.ricke')).toBe(false);
    for (let i = 0; i < 20; i++) core.tick(0.1, 'today', player);
    expect(core.fallbackReady('reh.ricke')).toBe(true);
    expect(core.judge('today', view(), flat).good).toEqual(['reh.ricke']);
    s = emptySlice();
    expect(core.fallbackReady('reh.ricke')).toBe(false);
  });

  it('past era: no signal, no targets judged, white picture', () => {
    const r = judgeShot([target(), target({ id: 'x.past', era: '1789' })], '1789', view(), flat);
    expect(r.signal).toBe(false);
    expect(r.targets).toEqual([]);
    expect(r.good).toEqual([]);
    expect(r.stars).toBe(0);
    expect(r.verdict_de).toBe('Kein Netz');
  });

  it('needAll: two deer must both be good in the same shot', () => {
    const ricke = target({ id: 'reh.ricke', dx: -0.6, needAll: ['reh.kitz'] });
    const kitz = target({ id: 'reh.kitz', dx: 0.6, r: 0.65, needAll: ['reh.ricke'] });
    const both = judgeShot([ricke, kitz], 'today', view(), flat);
    expect(both.good.sort()).toEqual(['reh.kitz', 'reh.ricke']);
    // the fawn out of the frame (behind the lens): the doe alone does not count
    const away = { ...kitz, at: () => ({ x: 0, y: 1.6, z: 10 }) };
    const one = judgeShot([ricke, away], 'today', view(), flat);
    expect(one.good).toEqual([]);
    expect(one.verdict).toBe('nicht-alle');
    expect(one.stars).toBe(1);
  });

  it('a target out of the world (no live anchor) is never in the frame', () => {
    const r = judgeShot([target({ at: () => null })], 'today', view(), flat);
    expect(r.targets).toEqual([]);
    expect(r.stars).toBe(0);
  });
});

describe('photo mode: what the lens really sees (TASK-080)', () => {
  /** Doe and fawn side by side, bound to each other, `d` m in front of the lens. */
  const pair = (d: number): PhotoTargetDef[] => [
    target({ id: 'reh.ricke', kind: 'animal', d, dx: -0.75, maxDist: 27, minFrac: 0.055, needAll: ['reh.kitz'], label_de: 'Ricke' }),
    target({ id: 'reh.kitz', kind: 'animal', d, dx: 0.75, r: 0.65, maxDist: 27, minFrac: 0.044, needAll: ['reh.ricke'], label_de: 'Kitz' }),
  ];
  /** A flat world (every sight ray is clear) in which a pixel test saw these shares. */
  const seeing = (shares: Record<string, number>): PhotoWorld => ({ ...flat, seen: (id) => (id in shares ? { share: shares[id]! } : undefined) });

  it('hidden deer: every ray is clear, nothing of them shows → „Verdeckt“, one star, never „Perfekt!“', () => {
    const deer = pair(11);
    // the old judge: 3 stars for a row of ferns in front of both animals
    expect(judgeShot(deer, 'today', view(), flat)).toMatchObject({ stars: 3, verdict: 'perfekt' });
    const shot = judgeShot(deer, 'today', view(), seeing({ 'reh.ricke': 0.02, 'reh.kitz': 0 }));
    expect(shot).toMatchObject({ good: [], stars: 1, verdict: 'verdeckt', verdict_de: 'Verdeckt' });
    for (const d of shot.details) expect(d).toMatchObject({ inFrame: true, good: false, stars: 1, verdict: 'verdeckt' });
    expect(goodEvents(shot)).toEqual([]);
  });

  it('clear deer: close and in the open → both good, 3 stars; farther → 2 stars', () => {
    const open = seeing({ 'reh.ricke': 0.96, 'reh.kitz': 0.9 });
    expect(judgeShot(pair(11), 'today', view(), open)).toMatchObject({ good: ['reh.ricke', 'reh.kitz'], stars: 3, verdict: 'perfekt' });
    expect(judgeShot(pair(15.5), 'today', view(), open)).toMatchObject({ good: ['reh.ricke', 'reh.kitz'], stars: 3 });
    expect(judgeShot(pair(17), 'today', view({ fovV: 32 }), open)).toMatchObject({ good: ['reh.ricke', 'reh.kitz'], stars: 2, verdict: 'gut' });
  });

  it('the limits: under SEEN_MIN hidden, under SEEN_CLEAR good without the third star', () => {
    const one = target({ kind: 'animal', d: 8, maxDist: 27 });
    const at = (share: number) => judgeTarget(one, view(), seeing({ 'reh.ricke': share }), false);
    expect(at(SEEN_MIN - 0.01)).toMatchObject({ good: false, verdict: 'verdeckt', stars: 1 });
    expect(at(SEEN_MIN)).toMatchObject({ good: true, verdict: 'gut', stars: 2 });
    expect(at(SEEN_CLEAR - 0.01)).toMatchObject({ good: true, verdict: 'gut', stars: 2 });
    expect(at(SEEN_CLEAR)).toMatchObject({ good: true, verdict: 'perfekt', stars: 3, seen: SEEN_CLEAR });
  });

  it('one animal covered: the other is „Nicht alle im Bild“, the shot is not good', () => {
    const shot = judgeShot(pair(11), 'today', view(), seeing({ 'reh.ricke': 0.9, 'reh.kitz': 0.1 }));
    expect(shot).toMatchObject({ good: [], stars: 1 });
    expect(shot.details.map((d) => d.verdict)).toEqual(['nicht-alle', 'verdeckt']);
  });

  it('a pair is one picture: half a doe beside a clear fawn is good, not „Perfekt!“', () => {
    const shot = judgeShot(pair(11), 'today', view(), seeing({ 'reh.ricke': 0.5, 'reh.kitz': 0.95 }));
    expect(shot).toMatchObject({ good: ['reh.ricke', 'reh.kitz'], stars: 2, verdict: 'gut' });
    expect(shot.details.map((d) => [d.stars, d.verdict])).toEqual([[2, 'gut'], [2, 'gut']]);
    expect(goodEvents(shot).map((e) => e.stars)).toEqual([2, 2]);
  });

  it('a measurement replaces the sight rays: a rise the rays hit does not hide a body the lens sees', () => {
    const ridge: PhotoWorld = { heightAt: (_x, z) => (Math.abs(z + 5) < 0.3 ? 3 : 0) };
    const one = target({ kind: 'animal', d: 10, maxDist: 27 });
    expect(judgeTarget(one, view(), ridge, false)).toMatchObject({ verdict: 'verdeckt', clear: 0 });
    const heightAt = vi.fn(ridge.heightAt);
    const measured = judgeTarget(one, view(), { heightAt, seen: () => ({ share: 0.8 }) }, false);
    expect(measured).toMatchObject({ good: true, stars: 3, seen: 0.8, clear: 4 });
    expect(heightAt).not.toHaveBeenCalled();
  });

  it('a target that was not measured (no drawn body, or too small to tell) keeps the sight rays', () => {
    const board = target({ id: 'photo.parkplatz', d: 10 });
    const shot = judgeShot([board], 'today', view(), seeing({ 'reh.ricke': 0 }));
    expect(shot).toMatchObject({ good: ['photo.parkplatz'], stars: 2 });
    expect(shot.details[0]!.seen).toBeUndefined();
  });

  it('the other rules still come first or after as before: too far, off-centre, fleeing', () => {
    const open = seeing({ 'reh.ricke': 1, 'reh.kitz': 1 });
    expect(judgeShot(pair(30), 'today', view({ fovV: 20 }), open).verdict).toBe('zu-weit');
    expect(judgeShot(pair(11), 'today', view({ yaw: 0.5 }), open).verdict).toBe('nicht-mittig');
    const fleeing = pair(11).map((t) => ({ ...t, calm: () => false }));
    expect(judgeShot(fleeing, 'today', view(), open)).toMatchObject({ good: [], verdict: 'aufgeschreckt' });
  });
});

describe('photo mode: steadiness', () => {
  it('mean angular speed over the last 0.3 s', () => {
    const m = new SteadyMeter();
    for (let i = 0; i <= 30; i++) m.push(i / 60, 0, 0);
    expect(m.speed(30 / 60)).toBe(0);
    // turning 1 rad/s
    for (let i = 31; i <= 60; i++) m.push(i / 60, (i - 30) / 60, 0);
    expect(m.speed(1)).toBeCloseTo(1, 1);
    // and still again: after 0.3 s it is steady
    for (let i = 61; i <= 90; i++) m.push(i / 60, 0.5, 0);
    expect(m.speed(1.5)).toBeLessThan(STEADY_RAD_S);
  });
});

describe('photo mode: album and grants', () => {
  const shoot = (core: PhotoCore, sinkS: GrantSink) => core.book(core.judge('today', view(), flat), '2026-11-20T14:31:00Z', 10, sinkS);

  it('grants fire once per target; unknown ids are skipped with a warning', () => {
    const s = emptySlice();
    const core = new PhotoCore(() => s);
    core.register(target({ grants: { codex: 'cx.T4', card: 'ph.unknown', flag: 'photo.reh' } }));
    const { s: sk, log } = sink(['cx.T4']);
    expect(shoot(core, sk)).toHaveLength(1);
    shoot(core, sk);
    expect(log.codex).toEqual(['cx.T4']);
    expect(log.flag).toEqual(['photo.reh']);
    expect(log.card).toEqual([]);
    expect(log.warn).toHaveLength(1);
    expect(core.has('reh.ricke')).toBe(true);
    // one album entry per target
    expect(s.album).toHaveLength(1);
    expect(s.album[0]).toMatchObject({ id: 'reh.ricke', era: 'today', stars: 2 });
  });

  it('a better shot of the same target replaces its stars', () => {
    const s = emptySlice();
    const core = new PhotoCore(() => s);
    let d = 10;
    core.register(target({ at: () => ({ x: 0, y: 1.6, z: -d }) }));
    const { s: sk } = sink();
    shoot(core, sk);
    d = 5;
    expect(shoot(core, sk)).toHaveLength(1);
    expect(s.album).toHaveLength(1);
    expect(s.album[0]!.stars).toBe(3);
  });

  it('the album keeps at most 60 entries (the oldest go), has() remembers all', () => {
    const s = emptySlice();
    const core = new PhotoCore(() => s);
    const { s: sk } = sink();
    for (let i = 0; i < ALBUM_MAX + 5; i++) {
      core.targets.clear();
      core.register(target({ id: `t.n${i}` }));
      shoot(core, sk);
    }
    expect(s.album).toHaveLength(ALBUM_MAX);
    expect(s.album[0]!.id).toBe('t.n5');
    expect(core.has('t.n0')).toBe(true);
    // and a save with too many entries is cut on load
    const big = normaliseSlice({ ...s, album: [...s.album, ...s.album] } as PhotoSlice);
    expect(big.album).toHaveLength(ALBUM_MAX);
  });

  it('nothing is booked in the past or without a good target', () => {
    const s = emptySlice();
    const core = new PhotoCore(() => s);
    core.register(target());
    const { s: sk } = sink();
    expect(core.book(core.judge('1789', view(), flat), 'x', 0, sk)).toEqual([]);
    expect(core.book(core.judge('today', view({ yaw: Math.PI }), flat), 'x', 0, sk)).toEqual([]);
    expect(s.album).toEqual([]);
  });

  it('one shot with two good targets gives two photo:good events (index.ts emits one per good detail)', () => {
    const s = emptySlice();
    const core = new PhotoCore(() => s);
    core.register(target({ id: 'reh.ricke', dx: -0.6, needAll: ['reh.kitz'] }));
    core.register(target({ id: 'reh.kitz', dx: 0.6, r: 0.65, needAll: ['reh.ricke'] }));
    const r = core.judge('today', view(), flat);
    // the system's emit loop, as in src/systems/photo/index.ts shoot()
    const events: { id: string; stars: number }[] = [];
    for (const d of r.details) if (d.good) events.push({ id: d.id, stars: d.stars });
    expect(events.map((e) => e.id).sort()).toEqual(['reh.kitz', 'reh.ricke']);
    expect(events.every((e) => e.stars >= 2)).toBe(true);
  });
});

describe('photo targets data (content/photo/targets.json, contract C3)', () => {
  const file = JSON.parse(readFileSync(join(__dirname, '../content/photo/targets.json'), 'utf8'));
  const bounds = { x0: 150, z0: -2150, x1: 2300, z1: 500 };

  it('the shipped file is valid; placeholders are flagged', () => {
    const r = validatePhotoTargets('targets.json', file, { facts: new Set(), bounds });
    expect(r.errors).toEqual([]);
    expect([...r.ids].sort()).toEqual(['photo.parkplatz', 'reh.kitz', 'reh.ricke']);
    // only the car-park demo board is still a placeholder; the deer are driven by the animals system
    const flagged = file.targets.filter((t: { placeholder?: boolean }) => t.placeholder === true).map((t: { id: string }) => t.id);
    expect(flagged).toEqual(['photo.parkplatz']);
    for (const t of file.targets as { label_de: string }[]) expect(t.label_de).not.toMatch(/platzhalter/i);
  });

  it('catches the C3 rule breaks', () => {
    const bad = {
      targets: [
        { id: 'a.b', kind: 'animal', era: '1789', label_de: 'Ricke (Platzhalter)', r: 1, frame: { minFrac: 0.1 } },
        { id: 'a.c', kind: 'detail', era: 'today', label_de: 'x', at: { x: 9000, z: 0 }, npc: 'soll', r: 0, frame: { minFrac: 0.001, needAll: ['a.zz'] }, grants: { codex: 'cx.nope', card: 'ph.nope' } },
        { id: 'a.d', kind: 'inscription', era: 'today', label_de: 'x', at: { x: 500, z: -800 }, r: 0.3, frame: { minFrac: 0.1, maxDist: 6 } },
        { id: 'a.d', kind: 'detail', era: 'today', label_de: 'x', at: { x: 500, z: -800 }, r: 0.3, frame: { minFrac: 0.1 } },
      ],
    };
    const msgs = validatePhotoTargets('t.json', bad, { facts: new Set(['cx.01']), bounds }).errors.map((e) => `${e.id}: ${e.message}`);
    const has = (re: RegExp) => expect(msgs.some((m) => re.test(m)), `${re} in\n${msgs.join('\n')}`).toBe(true);
    has(/a\.b: era must be 'today'/);
    has(/a\.b: label_de is player-facing: no placeholder marker/);
    has(/a\.b: exactly one anchor/);
    has(/a\.c: exactly one anchor/);
    has(/a\.c: at .* outside/);
    has(/a\.c: r must be > 0/);
    has(/a\.c: frame\.minFrac/);
    has(/a\.c: needAll: unknown target 'a\.zz'/);
    has(/a\.c: grants\.codex/);
    has(/a\.c: grants\.card/);
    has(/a\.d: an inscription needs maxDist ≤ 4/);
    has(/a\.d: duplicate target id/);
  });

  it('a data entry becomes a runtime target (point anchor on the ground, live anchors out of the world)', () => {
    const park = targetFromData(file.targets[0], () => 300);
    expect(park.at()).toEqual({ x: 528, y: 300 + park.r, z: -806 });
    expect(park.maxDist).toBe(25);
    const ricke = targetFromData(file.targets[1], () => 300);
    expect(ricke.at()).toBeNull();
    expect(ricke.needAll).toEqual(['reh.kitz']);
    expect(ricke.fallbackDist).toBe(32);
    expect(ricke.fallbackAfterS).toBe(90);
  });

  it('rejects a fallback minimum frame fraction above the normal threshold', () => {
    const [park, ricke, kitz] = file.targets;
    const invalid = { ...ricke, frame: { ...ricke.frame, fallback: { ...ricke.frame.fallback, minFrac: 0.08 } } };
    const result = validatePhotoTargets('targets.json', { targets: [park, invalid, kitz] });
    expect(result.errors).toEqual([expect.objectContaining({ id: 'reh.ricke', message: expect.stringContaining('frame.fallback.minFrac') })]);
  });

  const deerAt = (dist: number): PhotoTargetDef[] =>
    file.targets.slice(1).map((data: Parameters<typeof targetFromData>[0], i: number) => ({
      ...targetFromData(data, flat.heightAt),
      at: () => ({ x: i === 0 ? -0.75 : 0.75, y: 1.6, z: -dist }),
    }));
  const zoomed95 = (360 / Math.PI) * Math.atan(Math.tan((95 * Math.PI) / 360) / 2);

  it.each([20, 23, 25])('both deer can score two stars at %i m with 2×', (dist) => {
    const deer = deerAt(dist);
    expect(judgeShot(deer, 'today', view({ fovV: zoomed95 }), flat)).toMatchObject({
      good: ['reh.ricke', 'reh.kitz'],
      stars: 2,
    });
    const wide = judgeShot(deer, 'today', view({ fovV: 80 }), flat);
    expect(wide.good).toEqual([]);
    expect(wide.verdict).toBe('zu-klein');
  });

  it.each([26.8, 28, 31.9])('both deer at %s m pass at 95° and 2× after 90 s nearby', (dist) => {
    const save = emptySlice();
    const core = new PhotoCore(() => save);
    for (const deer of deerAt(dist)) core.register(deer);
    const v = view({ fovV: zoomed95 });
    core.tick(89, 'today', v);
    expect(core.judge('today', v, flat)).toMatchObject({ good: [], verdict: dist > 27 ? 'zu-weit' : 'nicht-alle' });
    core.tick(1, 'today', v);
    const shot = core.judge('today', v, flat);
    expect(shot).toMatchObject({ good: ['reh.ricke', 'reh.kitz'], stars: 2, verdict: 'weit-ok' });
    expect(shot.details[0]).toMatchObject({ fallback: true, stars: 2 });
    expect(core.judge('today', view({ fovV: 95 }), flat).verdict).toBe('zu-klein');
  });

  it('reports the pair in frame at the tour stop without sampling any sight rays', () => {
    const terrain = vi.fn(flat.heightAt);
    const walls = vi.fn(() => false);
    const trunks = vi.fn();
    const shot = judgeShot(deerAt(36), 'today', view({ fovV: zoomed95 }), { heightAt: terrain, blocked: walls, trunks }, () => true);
    expect(shot).toMatchObject({ targets: ['reh.ricke', 'reh.kitz'], good: [], stars: 1, verdict: 'zu-weit' });
    for (const detail of shot.details) expect(detail).toMatchObject({ inFrame: true, verdict: 'zu-weit', clear: 0 });
    for (const sample of [terrain, walls, trunks]) expect(sample).not.toHaveBeenCalled();
  });

  it('a clipped edge and lower body can pass, while a mostly hidden deer cannot', () => {
    const ricke = { ...targetFromData(file.targets[1], flat.heightAt), at: () => ({ x: 0, y: 1.6, z: -20 }) };
    const v = view({ fovV: 44 });
    const partial: PhotoWorld = {
      heightAt: (_x, z) => (Math.abs(z + 10) < 0.2 ? 1.48 : 0),
      trunks: (_x, _z, _r, fn) => fn(-0.24, -10, 0.05, 3),
    };
    expect(judgeTarget(ricke, v, partial, false)).toMatchObject({ clear: 3, good: true });
    const mostlyHidden: PhotoWorld = { heightAt: (_x, z) => (Math.abs(z + 10) < 0.2 ? 1.7 : 0) };
    expect(judgeTarget(ricke, v, mostlyHidden, false)).toMatchObject({ clear: 1, verdict: 'verdeckt', good: false });
  });
});

describe('quest objective "photo"', () => {
  const quest = (target?: string) => ({
    file: 'content/quests/test.quests.json',
    data: {
      chapter: 'test',
      quests: [
        {
          id: 'q.test.foto',
          kind: 'side',
          chapter: 'test',
          title_de: 'Ein Foto',
          summary_de: 'Ein Foto machen.',
          giver: { npc: 'soll' },
          objectives: [{ id: 'foto', type: 'photo', text_de: 'Fotografiere die Tafel', ...(target ? { target } : {}) }],
          rewards: { xp: 10 },
        },
      ],
    },
  });

  it('the validator wants a known target', () => {
    const ids = new Set(['photo.parkplatz']);
    const errs = (t?: string) => validateQuests([quest(t) as never], { photoTargets: ids }).errors.filter((e) => /photo/.test(e.message)).map((e) => e.message);
    expect(errs('photo.parkplatz')).toEqual([]);
    expect(errs('photo.nope')[0]).toMatch(/unknown target 'photo\.nope'/);
    expect(errs(undefined)[0]).toMatch(/photo needs target/);
  });

  it('counts photo:good with its target id', () => {
    const def = { ...quest('photo.parkplatz').data.quests[0]! };
    const e: QuestEnv = { flags: {}, codex: [], emit: () => {}, now: () => 0, rng: () => 0.5 };
    const book = new QuestBook(new Map([[def.id, def as unknown as QuestDefIn]]), createQuestSlice(), e);
    book.accept('q.test.foto');
    expect(book.handle('photo:good', { id: 'photo.other', stars: 3 })).toBe(false);
    expect(book.handle('photo:good', { id: 'photo.parkplatz', stars: 2 })).toBe(true);
    expect(book.state('q.test.foto')).toBe('ready');
  });

  const env = (): QuestEnv => ({ flags: {}, codex: [], emit: () => {}, now: () => 0, rng: () => 0.5 });
  const fotoBook = (slice = createQuestSlice()) => {
    const def = { ...quest('photo.parkplatz').data.quests[0]! };
    return new QuestBook(new Map([[def.id, def as unknown as QuestDefIn]]), slice, env());
  };

  it('a photo objective counts a good shot taken before the quest started', () => {
    // the shot first: the photo system's slice knows the target
    const photo = emptySlice();
    const core = new PhotoCore(() => photo);
    core.register(target({ id: 'photo.parkplatz' }));
    core.book(core.judge('today', view(), flat), 'x', 0, sink().s);
    expect(core.has('photo.parkplatz')).toBe(true);
    // then the quest: accept, and the quests system settles open objectives (index.ts, settle on accept)
    const book = fotoBook();
    book.accept('q.test.foto');
    expect(book.state('q.test.foto')).toBe('active');
    book.settleKnown(() => false, (id) => core.has(id));
    expect(book.state('q.test.foto')).toBe('ready');
  });

  it('without a photo the objective stays open on settle', () => {
    const book = fotoBook();
    book.accept('q.test.foto');
    book.settleKnown(() => false, () => false);
    expect(book.state('q.test.foto')).toBe('active');
  });

  it('save / load: a resumed quest whose target is already in the album completes', () => {
    const book = fotoBook();
    book.accept('q.test.foto');
    // the save: quest slice and photo slice through JSON (the photo was taken after the quest save)
    const savedQuests = JSON.parse(JSON.stringify(book.slice));
    const photo = normaliseSlice(JSON.parse(JSON.stringify({ ...emptySlice(), good: ['photo.parkplatz'], album: [{ id: 'photo.parkplatz', era: 'today', at: 'x', play: 0, stars: 2 }] })));
    // load: a new book on the loaded slice, restore() settles with the photo slice's good set
    const loaded = fotoBook(savedQuests);
    expect(loaded.state('q.test.foto')).toBe('active');
    loaded.settleKnown(() => false, (id) => photo.good.includes(id));
    expect(loaded.state('q.test.foto')).toBe('ready');
  });
});

describe('photo:good carries the subject state', () => {
  it('passes the state() string through on photo:good (read at the shot, stars unchanged)', () => {
    const s = emptySlice();
    const core = new PhotoCore(() => s);
    let state = 'graze';
    core.register(target({ state: () => state }));
    state = 'alert';
    const r = core.judge('today', view(), flat);
    expect(goodEvents(r)).toEqual([{ id: 'reh.ricke', stars: 2, state: 'alert' }]);
    expect(r.verdict).toBe('gut');
    // optional: the album entry keeps the state of its shot
    const { s: sk } = sink();
    core.book(r, 'x', 0, sk);
    expect(s.album[0]!.state).toBe('alert');
  });

  it('omits state without a getter (no key at all)', () => {
    const r = judgeShot([target()], 'today', view(), flat);
    const [e] = goodEvents(r);
    expect(e).toEqual({ id: 'reh.ricke', stars: 2 });
    expect('state' in e!).toBe(false);
  });

  it('only good targets read their state; a not-good target gives no event', () => {
    let reads = 0;
    const r = judgeShot([target({ dx: 6, state: () => (reads++, 'graze') })], 'today', view(), flat);
    expect(goodEvents(r)).toEqual([]);
    expect(reads).toBe(0);
  });

  it('fleeing (calm() false) still voids the shot, whatever state() says', () => {
    const r = judgeShot([target({ calm: () => false, state: () => 'flee' })], 'today', view(), flat);
    expect(r.good).toEqual([]);
    expect(r.verdict).toBe('aufgeschreckt');
    expect(goodEvents(r)).toEqual([]);
  });

  it('a story EventCond with match { id, state: "alert" } matches the photo:good payload', () => {
    const cond: EventCond = { event: 'photo:good', match: { id: 'reh.ricke', state: 'alert' } };
    const r = judgeShot([target({ state: () => 'alert' })], 'today', view(), flat);
    const [e] = goodEvents(r);
    expect(eventMatches(cond, 'photo:good', e)).toBe(true);
    expect(eventMatches(cond, 'photo:good', { ...e, state: 'graze' })).toBe(false);
    expect(eventMatches(cond, 'photo:good', { id: 'reh.ricke', stars: 2 })).toBe(false);
    expect(eventMatches(cond, 'photo:shot', e)).toBe(false);
    // a cond without state still matches a payload that carries one
    expect(eventMatches({ event: 'photo:good', match: { id: 'reh.ricke' } }, 'photo:good', e)).toBe(true);
  });
});

describe('photo: attach bindings stack by handle', () => {
  const setup = () => {
    const core = new PhotoCore(() => emptySlice());
    const anchor = { x: 0, y: 1.6, z: -10 };
    core.register(target({ id: 'reh.ricke', at: () => anchor }));
    const t = core.targets.get('reh.ricke')!;
    return { core, t, anchor };
  };
  const A = { x: 1, y: 1, z: 1 };
  const B = { x: 2, y: 2, z: 2 };

  it('out-of-order detach: A, B attach; A detach → B active; B detach → data anchor', () => {
    const { core, t, anchor } = setup();
    expect(core.isAttached('reh.ricke')).toBe(false);
    const offA = core.attach('reh.ricke', { at: () => A, state: () => 'a' })!;
    const offB = core.attach('reh.ricke', { at: () => B, state: () => 'b' })!;
    expect(t.at()).toBe(B);
    offA();
    expect(t.at()).toBe(B);
    expect(t.state?.()).toBe('b');
    expect(core.isAttached('reh.ricke')).toBe(true);
    offB();
    expect(t.at()).toBe(anchor);
    expect(t.state).toBeUndefined();
    expect(core.isAttached('reh.ricke')).toBe(false);
  });

  it('no stale restore: a detached getter never comes back, a second undo is a no-op', () => {
    const { core, t, anchor } = setup();
    const offA = core.attach('reh.ricke', { at: () => A, calm: () => false })!;
    const offB = core.attach('reh.ricke', { at: () => B })!;
    offB();
    expect(t.at()).toBe(A);
    offA();
    expect(t.at()).toBe(anchor);
    expect(t.calm).toBeUndefined();
    const offC = core.attach('reh.ricke', { at: () => B })!;
    offA();
    offB();
    expect(t.at()).toBe(B);
    offC();
    expect(t.at()).toBe(anchor);
    expect(core.attach('nope', { at: () => A })).toBeNull();
  });

  it('the debug deer refuses when a target is already attached (or kq.animals reports deer)', () => {
    const { core } = setup();
    core.register(target({ id: 'reh.kitz' }));
    const ids = ['reh.ricke', 'reh.kitz'];
    const attached = (id: string) => core.isAttached(id);
    expect(debugDeerBlocker(ids, attached)).toBeNull();
    const off = core.attach('reh.kitz', { at: () => A })!;
    expect(debugDeerBlocker(ids, attached)).toMatch(/reh\.kitz/);
    off();
    expect(debugDeerBlocker(ids, attached, {})).toBeNull();
    expect(debugDeerBlocker(ids, attached, { list: () => [{ id: 'reh.ricke', kind: 'deer' }] })).toMatch(/animals/);
    expect(debugDeerBlocker(ids, attached, { list: () => [{ id: 'dog.diane', kind: 'dog' }] })).toBeNull();
  });
});
