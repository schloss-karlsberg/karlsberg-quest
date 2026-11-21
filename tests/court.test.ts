import { describe, expect, it } from 'vitest';
import {
  AUFGEFALLEN,
  BLICK,
  DECAY,
  MISSTRAUEN,
  RING_MUL,
  RUN_SPEED,
  STAFF_WINDOW,
  TELLS,
  type PlayerSignals,
  activeTells,
  costumeFor,
  fanColour,
  inFan,
  inspectOutcome,
  stageOf,
  stepSuspicion,
  tellRate,
  yawDegToward,
  yawGap,
  zoneMul,
} from '../src/systems/court/logic';
import { EHRENHOF_OUTSIDE, ZONES, inZoneGround, watcherZone, zoneAt, zoneById } from '../src/systems/court/zones';
import { sweepYaw } from '../src/systems/npc/logic';
import { packCones } from '../src/systems/hunt/cones';
import { GATE_CENTER, GITTER_PIERS } from '../src/systems/scenery/sets';
import { validateStories } from '../src/systems/story/validate';

const calm: PlayerSignals = { coat: true, speed: 1.2, staffAgo: Infinity, attacked: false, took: false };
const DT = 1 / 60;

/** Run `secs` of ticks with the same tells; returns the level. */
function run(level: number, sig: PlayerSignals, secs: number, opts: { sees?: boolean; dist?: number; mul?: number } = {}): number {
  let v = level;
  const hits = activeTells(sig);
  for (let i = 0; i < Math.round(secs / DT); i++) v = stepSuspicion(v, hits, opts.sees ?? true, opts.dist ?? 6, opts.mul ?? 1, DT).level;
  return v;
}

describe('court tells', () => {
  it('a calm courtier shows no tell', () => {
    expect(activeTells(calm)).toEqual([]);
  });

  it('hi-vis (no coat) fills in 1.2 s within 10 m, half as fast beyond', () => {
    const sig = { ...calm, coat: false };
    expect(activeTells(sig).map((h) => h.id)).toEqual(['hivis']);
    expect(run(0, sig, 1.15)).toBeLessThan(1);
    expect(run(0, sig, 1.22)).toBe(1);
    expect(tellRate('hivis', 14)).toBeCloseTo(TELLS.hivis.rate / 2);
    expect(run(0, sig, 1.22, { dist: 14 })).toBeCloseTo(0.508, 2);
  });

  it('running at ≥ 4.8 m/s is +0.6/s; walking is nothing', () => {
    expect(activeTells({ ...calm, speed: RUN_SPEED - 0.01 })).toEqual([]);
    const sig = { ...calm, speed: RUN_SPEED };
    expect(activeTells(sig).map((h) => h.id)).toEqual(['running']);
    expect(run(0, sig, 1)).toBeCloseTo(0.6, 2);
  });

  it('staff: a blow is instant 1.0; lock-on / charge in the last 4 s is +1.0/s', () => {
    const blow = stepSuspicion(0, activeTells({ ...calm, attacked: true, staffAgo: 0 }), true, 6, 0.5, DT);
    expect(blow).toEqual({ level: 1, tell: 'staff' });
    // the blow is not also counted as a rate
    expect(activeTells({ ...calm, attacked: true, staffAgo: 0 })).toEqual([{ id: 'staff', kind: 'instant' }]);
    expect(run(0, { ...calm, staffAgo: 1 }, 0.5)).toBeCloseTo(0.5, 2);
    expect(activeTells({ ...calm, staffAgo: STAFF_WINDOW + 0.01 })).toEqual([]);
  });

  it('taking something in view is instant 1.0; out of view nothing', () => {
    const hits = activeTells({ ...calm, took: true });
    expect(stepSuspicion(0, hits, true, 12, 0.6, DT)).toEqual({ level: 1, tell: 'take' });
    expect(stepSuspicion(0, hits, false, 12, 0.6, DT).level).toBe(0);
  });

  it('the later tells are designed but not detected', () => {
    for (const id of ['dodge', 'lantern', 'lawn', 'place', 'crouch', 'tape', 'linger'] as const) expect(TELLS[id].mvp).toBe(false);
    for (const id of ['hivis', 'running', 'staff', 'take'] as const) expect(TELLS[id].mvp).toBe(true);
  });

  it('the strongest tell is the one named', () => {
    const s = stepSuspicion(0, activeTells({ ...calm, coat: false, speed: 6 }), true, 5, 1, DT);
    expect(s.tell).toBe('hivis');
  });
});

describe('court suspicion', () => {
  it('decays at −0.25/s when it sees no tell, and also when it does not see you', () => {
    expect(run(1, calm, 1)).toBeCloseTo(1 - DECAY, 3);
    expect(run(0.5, { ...calm, coat: false }, 1, { sees: false })).toBeCloseTo(0.25, 3);
    expect(run(0.1, calm, 2)).toBe(0);
  });

  it('thresholds 0.35 Blick / 0.7 Misstrauen / 1.0 Aufgefallen, falling with hysteresis', () => {
    expect([BLICK, MISSTRAUEN, AUFGEFALLEN]).toEqual([0.35, 0.7, 1]);
    expect(stageOf(0.34)).toBe(0);
    expect(stageOf(0.35)).toBe(1);
    expect(stageOf(0.7)).toBe(2);
    expect(stageOf(1)).toBe(3);
    expect(stageOf(0.33, 1)).toBe(1);
    expect(stageOf(0.29, 1)).toBe(0);
    expect(stageOf(0.66, 2)).toBe(2);
    expect(stageOf(0.5, 2)).toBe(1);
  });

  it('zone multipliers: teaching ×0.6, Ehrenhof ×1 then ×0.5 once admitted, ring ×3, outside nothing', () => {
    const oran = zoneById('court.orangerie')!;
    const ehr = zoneById('court.ehrenhof')!;
    expect(zoneMul(oran, false, false)).toBe(0.6);
    expect(zoneMul(ehr, false, false)).toBe(1);
    expect(zoneMul(ehr, true, false)).toBe(0.5);
    expect(zoneMul(ehr, false, true)).toBe(RING_MUL);
    expect(zoneMul(null, false, false)).toBe(0);
    expect(zoneMul(null, false, true)).toBe(3);
    // running in the teaching zone: 0.36/s
    expect(run(0, { ...calm, speed: 5 }, 1, { mul: 0.6 })).toBeCloseTo(0.36, 2);
    // outside any zone a seen tell adds nothing
    expect(run(0, { ...calm, coat: false }, 3, { mul: 0 })).toBe(0);
  });

  it('inspection ring: running during the 2.5 s ring gets you thrown out, standing still does not', () => {
    expect(run(0, { ...calm, speed: 5 }, 2.5, { mul: RING_MUL })).toBe(1);
    expect(run(0, calm, 2.5, { mul: RING_MUL })).toBe(0);
  });
});

describe('court inspection + costume', () => {
  it('no coat → ejected, no letter → refused, both → the ring', () => {
    expect(inspectOutcome({ coat: false, letter: true })).toBe('eject');
    expect(inspectOutcome({ coat: false, letter: false })).toBe('eject');
    expect(inspectOutcome({ coat: true, letter: false })).toBe('refuse');
    expect(inspectOutcome({ coat: true, letter: true })).toBe('ring');
  });

  it("the court costume in every past era once the coat is had, never today", () => {
    expect(costumeFor(true, '1789')).toBe('court');
    expect(costumeFor(true, '1796')).toBe('court');
    expect(costumeFor(true, 'today')).toBe('default');
    expect(costumeFor(false, '1789')).toBe('default');
  });
});

describe('court geometry', () => {
  it('fans: heading 0 = north (−z), 90 = east; fov and range', () => {
    expect(inFan(0, 0, 0, 70, 14, 0, -10).inside).toBe(true);
    expect(inFan(0, 0, 0, 70, 14, 0, 10).inside).toBe(false);
    expect(inFan(0, 0, 90, 70, 14, 10, 0).inside).toBe(true);
    expect(inFan(0, 0, 0, 70, 14, 0, -15).inside).toBe(false);
    // 34° off axis in, 36° out (fov 70)
    const at = (deg: number) => inFan(0, 0, 0, 70, 14, 10 * Math.sin((deg * Math.PI) / 180), -10 * Math.cos((deg * Math.PI) / 180)).inside;
    expect(at(34)).toBe(true);
    expect(at(36)).toBe(false);
    expect(yawDegToward(0, 0, 10, 0)).toBeCloseTo(90);
    expect(yawDegToward(0, 0, 0, -10)).toBeCloseTo(0);
    expect(yawGap(350, 10)).toBeCloseTo(20);
  });

  it('sweep eases between two headings along the short arc', () => {
    const w = { sweep: [350, 30] as [number, number], period: 8 };
    expect(sweepYaw(w, 0, 0)).toBeCloseTo(350);
    expect(sweepYaw(w, 0, 4)).toBeCloseTo(390);
    expect(sweepYaw(undefined, 120, 3)).toBe(120);
    expect(sweepYaw(undefined, undefined, 3)).toBe(180);
  });

  it('fan colours: pale → orange → red', () => {
    const [r0, g0] = fanColour(0);
    const [r1, g1] = fanColour(0.7);
    const [r2, g2] = fanColour(1);
    expect(g0).toBeGreaterThan(g1);
    expect(g1).toBeGreaterThan(g2);
    expect(r0).toBeGreaterThan(0.8);
    expect(r1).toBeGreaterThan(0.9);
    expect(r2).toBeGreaterThan(0.8);
  });

  it('the Ehrenhof zone stops at the gitter; its exit and the travel arrival stand outside', () => {
    const ehr = zoneById('court.ehrenhof')!;
    expect(inZoneGround(ehr, 1212, -1116)).toBe(true);
    expect(inZoneGround(ehr, GATE_CENTER[0] + 2, GATE_CENTER[1])).toBe(true);
    expect(inZoneGround(ehr, GATE_CENTER[0] - 2, GATE_CENTER[1])).toBe(false);
    // the half-plane follows the gitter piers
    for (const [x, z] of [GITTER_PIERS[0]!, GITTER_PIERS[GITTER_PIERS.length - 1]!]) {
      expect(inZoneGround({ ...ehr, r: 999 }, x + 1, z)).toBe(true);
      expect(inZoneGround({ ...ehr, r: 999 }, x - 1, z)).toBe(false);
    }
    expect(zoneAt(ehr.exit.x, ehr.exit.z, '1789')).toBeNull();
    expect(zoneAt(EHRENHOF_OUTSIDE.x, EHRENHOF_OUTSIDE.z, '1789')).toBeNull();
    const oran = zoneById('court.orangerie')!;
    expect(zoneAt(oran.exit.x, oran.exit.z, '1789')).toBeNull();
    expect(zoneAt(1260, -985, '1789')?.id).toBe('court.orangerie');
    expect(zoneAt(1260, -985, 'today')).toBeNull();
    expect(zoneAt(0, 0, '1789', '', 'KB-B02')?.id).toBe('court.ehrenhof');
    expect(zoneAt(0, 0, '1789', 'B10.1.s-pfeilersaal')?.id).toBe('court.orangerie');
    expect(ZONES.every((z) => z.era === '1789')).toBe(true);
  });

  it('a watcher at the gate belongs to the Ehrenhof (also from outside the gitter)', () => {
    expect(watcherZone(GATE_CENTER[0] + 1, GATE_CENTER[1], '1789')?.id).toBe('court.ehrenhof');
    expect(watcherZone(1186, -1112, '1789')?.id).toBe('court.ehrenhof');
    expect(watcherZone(1250, -990, '1789')?.id).toBe('court.orangerie');
    expect(watcherZone(0, 0, '1789', 'court.orangerie')?.id).toBe('court.orangerie');
  });
});

describe('sight cones (generalised)', () => {
  it('the pack still draws one fan per standing hound, as before', () => {
    const sim = {
      state: 'searching',
      lastSight: 20,
      agents: [
        { kind: 'hound', lie: 0, x: 1, z: 2, heading: 0.5, awareness: 0.4, sees: 0.3 },
        { kind: 'hound', lie: 1, x: 0, z: 0, heading: 0, awareness: 0, sees: 0 },
        { kind: 'rider', lie: 0, x: 0, z: 0, heading: 0, awareness: 0, sees: 0 },
      ],
    } as unknown as Parameters<typeof packCones>[0];
    const c = packCones(sim);
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual({ x: 1, z: 2, yaw: 0.5, range: 23, fov: Math.PI, level: 0.4, seen: 0.6 });
  });
});

describe('story: the npc watch block', () => {
  const file = (watch: unknown) => ({
    file: 'w.story.json',
    story: { chapter: 'kw', order: 1, title_de: 'W', start: 'b', beats: [{ id: 'b', enter: [{ do: 'npc', op: 'spawn', npc: 'gardist', x: 1, z: 2, era: '1789', watch }] }] },
  });
  const errs = (watch: unknown) => validateStories([file(watch)] as never).errors.filter((i) => /watch/.test(i.message));
  it('accepts a full block and rejects bad ones', () => {
    expect(errs({ fov: 70, range: 14, sweep: [80, 140], period: 8, set: 'k1', inspector: true, zone: 'court.ehrenhof', who: 'Ein Gardist' })).toEqual([]);
    expect(errs({ range: 14 }).length).toBe(1);
    expect(errs({ fov: 70, range: 14, sweep: [1] }).length).toBe(1);
    expect(errs({ fov: 70, range: 14, inspector: 'yes' }).length).toBe(1);
    expect(errs({ fov: 70, range: 14, bogus: 1 }).length).toBe(1);
  });
});

describe('the pike look flag (npc figure, low tier)', () => {
  it('a look with pike: true stands a ghost pike beside the procedural figure; others have none', async () => {
    const { GhostFigure } = await import('../src/systems/npc/figure');
    const { lookFor } = await import('../src/systems/npc/roster');
    const plain = new GhostFigure({ ...lookFor('gardist'), pike: false }, '1789');
    const armed = new GhostFigure({ ...lookFor('gardist'), pike: true }, '1789');
    const pikes = (f: InstanceType<typeof GhostFigure>) => f.object.children.filter((c) => c.name === 'npc-pike');
    expect(pikes(plain)).toHaveLength(0);
    const [p] = pikes(armed);
    expect(p).toBeDefined();
    expect(p!.position.x).toBeGreaterThan(0.2);
    expect(p!.position.y).toBe(0);
    armed.frame(0.1, { reducedMotion: false, px: 600, face: 0 });
    expect(p!.visible).toBe(true);
    plain.dispose();
    armed.dispose();
  });
});
