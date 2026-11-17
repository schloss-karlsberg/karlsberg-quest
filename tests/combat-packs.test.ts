/**
 * Fun pass 2026-11-16 (docs/ACTION-RPG.md §5.5): mixed packs with an elite, the caster, the
 * surround, the rhythm of the pack's blows, the short Raffschatten dash, the boss reveal and the
 * Gnadenstoß.
 */
import { describe, expect, it } from 'vitest';
import { ELITES, ENEMIES, enemyDef } from '../src/rpg/enemies';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { eliteIndex, escortsOf, packWorthy } from '../src/systems/combat/packs';
import { telegraphTime, upsertGroup } from '../src/systems/combat/rules';
import { BOSS_INTRO, CombatSim, type SimEvent, type SimInput, reforms } from '../src/systems/combat/sim';

const flat = { heightAt: () => 0 };

function sim(level = 6) {
  const groups: Record<string, EnemyGroupState> = {};
  const stats = deriveStats({ level, talents: {}, equipped: { weapon: 'item.stab.eisen', charms: [] } });
  const s = new CombatSim(flat, groups, { gentle: false, reducedMotion: false, stats, sweep: false, konter: false, waerme: false, dritter: false });
  return { s, groups };
}

function input(o: Partial<SimInput> = {}): SimInput {
  return { x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: '1793-02', time: 'night', ...o };
}

function run(s: CombatSim, sec: number, o: Partial<SimInput> = {}): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < sec; t += 1 / 60) out.push(...s.step(1 / 60, input(o)));
  return out;
}

describe('packs: elites and escorts', () => {
  it('a pack of three or more in the past has one elite and escorts; the present and bosses have none', () => {
    expect(packWorthy({ count: 4, era: '1789' })).toBe(true);
    expect(packWorthy({ count: 2, era: '1789' })).toBe(false);
    expect(packWorthy({ count: 4, era: 'today' })).toBe(false);
    expect(packWorthy({ count: 3, era: '1796', boss: true })).toBe(false);
    expect(eliteIndex({ count: 4, era: '1789' })).toBe(3);
    expect(eliteIndex({ count: 4, era: '1789', eliteDown: true })).toBe(-1);
    for (const k of ['nebelling', 'irrlicht', 'streuner', 'raffschatten', 'glutling', 'grusling', 'steinfresser']) {
      const esc = escortsOf({ kind: k, count: 5, era: '1789' });
      expect(esc.length, k).toBeGreaterThan(0);
      for (const x of esc) {
        expect(x.kind).not.toBe(k);
        expect(enemyDef(x.kind), x.kind).toBeTruthy();
      }
    }
  });

  it('every elite has a name, a readable extra move and a known kind', () => {
    for (const el of Object.values(ELITES)) {
      expect(enemyDef(el.kind), el.kind).toBeTruthy();
      expect(el.name_de.length).toBeGreaterThan(3);
      expect(el.extra.telegraph).toBeGreaterThanOrEqual(0.4);
      expect(el.hpMul).toBeGreaterThan(1.5);
    }
    // the caster is in the roster, ranged only, labelled fiction
    const w = ENEMIES.find((e) => e.id === 'nebelweber')!;
    expect(w.attacks.every((a) => a.kind === 'ranged')).toBe(true);
    expect(w.note_de).toContain('(Fiktion)');
  });

  it('the Streuner pack company changes with the era (no three identical packs in a row)', () => {
    const kinds = (era: string) => escortsOf({ kind: 'streuner', count: 3, boss: false, era: era as never, tier: 2 }).map((e) => e.kind).join(',');
    const all = ['1789', '1793-02', '1793-07', '1796'].map(kinds);
    expect(new Set(all).size).toBe(4);
  });

  it('a Streuner pack comes with its Leithund and the company of its era; escorts never count for the group', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'p', kind: 'streuner', era: '1793-02', x: 0, z: -30, count: 4, tier: 2 });
    run(s, 0.1);
    const live = s.live();
    const elites = live.filter((e) => e.elite);
    expect(elites).toHaveLength(1);
    expect(elites[0]!.title).toBe('Leithund');
    expect(elites[0]!.maxHp).toBeGreaterThan(live.find((e) => e.kind === 'streuner' && !e.elite)!.maxHp * 1.8);
    expect(elites[0]!.def.attacks.some((a) => a.id === 'hetzjagd')).toBe(true);
    const esc = live.filter((e) => e.escort);
    // 1793-02: a flurry of Mahnbriefe (1789 brings the Nebelweber)
    expect(esc.map((e) => e.kind)).toEqual(['mahnbrief', 'mahnbrief', 'mahnbrief']);
    expect(esc[0]!.group).toBe('p+escort');
    // the escort undone: the group's count does not move
    s.killNow(esc[0]!.id);
    expect(groups['p']!.killed).toBe(0);
  });

  it('the group undone, its escorts drift off into the fog; a fallen elite stays fallen', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'p', kind: 'nebelling', era: '1789', x: 0, z: -40, count: 3, tier: 1 });
    run(s, 0.1, { era: '1789' });
    expect(s.live().some((e) => e.escort)).toBe(true);
    for (const e of s.live().filter((x) => x.group === 'p')) s.killNow(e.id);
    expect(groups['p']!.eliteDown).toBe(true);
    const evs = run(s, 2, { era: '1789' });
    expect(evs.some((v) => v.type === 'drift')).toBe(true);
    expect(s.live().filter((e) => e.escort)).toHaveLength(0);
    // content re-declares the group (a reload): the elite does not come back
    upsertGroup(groups, { group: 'p', kind: 'nebelling', era: '1789', x: 0, z: -40, count: 3, tier: 1 });
    expect(groups['p']!.eliteDown).toBe(true);
  });

  it('the Gnadenstoß: a low elite falls to one Wuchthieb', () => {
    const { s, groups } = sim(8);
    upsertGroup(groups, { group: 'p', kind: 'raffschatten', era: '1793-07', x: 0, z: -40, count: 3, tier: 3 });
    run(s, 0.1, { era: '1793-07' });
    const el = s.live().find((e) => e.elite)!;
    el.x = 0;
    el.z = -1.6;
    el.hp = el.maxHp * 0.24;
    el.finishable = true;
    el.state = 'stagger';
    el.stagger = 5;
    const evs: SimEvent[] = [];
    evs.push(...s.step(1 / 60, input({ era: '1793-07', attackPressed: true, attackDown: true })));
    for (let t = 0; t < 0.6; t += 1 / 60) {
      el.x = 0;
      el.z = -1.6;
      evs.push(...s.step(1 / 60, input({ era: '1793-07', attackDown: true })));
    }
    for (let t = 0; t < 0.8; t += 1 / 60) evs.push(...s.step(1 / 60, input({ era: '1793-07' })));
    expect(evs.some((v) => v.type === 'finisher')).toBe(true);
    expect(el.state).toBe('dissolve');
  });
});

describe('the pack fights together', () => {
  it('surrounds: four Nebelinge round a still player come from at least three sides', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: 'today', x: 0, z: -9, count: 4, radius: 1.5, tier: 1 });
    s.p.god = true;
    const sides = new Set<number>();
    for (let t = 0; t < 12; t += 1 / 60) {
      s.step(1 / 60, input({ era: 'today' }));
      for (const e of s.live()) if (Math.hypot(e.x, e.z) < 4.5) sides.add(Math.round(((Math.atan2(e.z, e.x) + Math.PI) / (Math.PI * 2)) * 4) % 4);
    }
    expect(sides.size).toBeGreaterThanOrEqual(3);
  });

  it('blows come in a rhythm: two pack blows never land within half a second of each other', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'n', kind: 'streuner', era: '1793-02', x: 0, z: -6, count: 5, radius: 1.5, tier: 2 });
    s.p.god = true;
    const lands: number[] = [];
    let time = 0;
    for (; time < 25; time += 1 / 60) for (const ev of s.step(1 / 60, input())) if (ev.type === 'telegraph' && !ev.e.boss && ev.attack.kind !== 'summon') lands.push(time + ev.dur + (ev.attack.kind === 'ranged' ? 0 : 0));
    lands.sort((a, b) => a - b);
    expect(lands.length).toBeGreaterThan(8);
    let tight = 0;
    for (let i = 1; i < lands.length; i++) if (lands[i]! - lands[i - 1]! < 0.5) tight++;
    expect(tight).toBe(0);
  });

  it('the Nebelweber keeps its distance and slips away when you close in', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'w', kind: 'nebelweber', era: '1789', x: 0, z: -12, count: 1, tier: 1 });
    s.p.god = true;
    const evs = run(s, 4, { era: '1789' });
    expect(evs.some((v) => v.type === 'shot')).toBe(true);
    const w = s.live()[0]!;
    expect(Math.hypot(w.x, w.z)).toBeGreaterThan(6);
    w.x = 0;
    w.z = -2.5;
    w.state = 'approach';
    const b = run(s, 0.3, { era: '1789' });
    expect(b.some((v) => v.type === 'blink')).toBe(true);
    expect(Math.hypot(w.x, w.z)).toBeGreaterThan(6);
    // its frost lands where you stood: a landing ring
    expect(telegraphTime(enemyDef('nebelweber')!.attacks[0]!)).toBeGreaterThanOrEqual(0.9);
  });

  it('a Raffschatten runs once, and only a short way', () => {
    const { s, groups } = sim(8);
    upsertGroup(groups, { group: 'r', kind: 'raffschatten', era: '1793-07', x: 0, z: -8, count: 1, tier: 3 });
    s.p.god = true;
    let fleeing = 0;
    let flees = 0;
    let was = false;
    for (let t = 0; t < 15; t += 1 / 60) {
      s.step(1 / 60, input({ era: '1793-07' }));
      const f = s.live()[0]?.state === 'flee';
      if (f) fleeing += 1 / 60;
      if (f && !was) flees++;
      was = f;
    }
    expect(flees).toBe(1);
    expect(fleeing).toBeLessThan(1.6);
  });

  it('a boss reveals itself first: no harm either way during the intro, then it fights', () => {
    const { s, groups } = sim(6);
    upsertGroup(groups, { group: 'b', kind: 'pikeur', era: '1793-02', x: 0, z: -9, count: 1, boss: true });
    const evs = run(s, 0.2);
    expect(evs.some((v) => v.type === 'intro')).toBe(true);
    const b = s.live()[0]!;
    expect(b.state).toBe('intro');
    const hp = s.p.hp;
    run(s, BOSS_INTRO - 0.4);
    expect(s.p.hp).toBe(hp);
    run(s, 3);
    expect(['approach', 'windup', 'strike', 'recover', 'circle']).toContain(b.state);
    // the reveal plays once per session: a reset boss comes straight at you
    s.dematerialise();
    const again = run(s, 1);
    expect(again.some((v) => v.type === 'intro')).toBe(false);
  });
});

describe('playtest round 4: fights that ask something', () => {
  it('paper and mist scatter under a light blow once, then a Wuchthieb or the second time ends them', () => {
    const base = { kind: 'mahnbrief', reformed: false, boss: false, elite: false, add: false, tier: 1 };
    expect(reforms(base, 'light', false)).toBe(true);
    expect(reforms(base, 'light', true)).toBe(false);
    expect(reforms(base, 'heavy', false)).toBe(false);
    expect(reforms({ ...base, reformed: true }, 'light', false)).toBe(false);
    expect(reforms({ ...base, kind: 'streuner' }, 'light', false)).toBe(false);
    expect(reforms({ ...base, tier: 0 }, 'light', false)).toBe(false);
  });

  it('three swings through an Irrlicht bring the Bannlicht hint', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'i', kind: 'irrlicht', era: '1793-02', x: 0, z: -2, count: 1 });
    s.step(1 / 60, input());
    const e = s.live()[0]!;
    e.blinkT = 99;
    const evs: SimEvent[] = [];
    for (let i = 0; i < 4; i++) {
      e.x = 0;
      e.z = -2;
      evs.push(...s.step(1 / 60, input({ attackPressed: true })));
      evs.push(...run(s, 0.45));
    }
    expect(evs.filter((e) => e.type === 'immune').length).toBeGreaterThanOrEqual(3);
    expect(evs.some((e) => e.type === 'immuneHint')).toBe(true);
  });
});
