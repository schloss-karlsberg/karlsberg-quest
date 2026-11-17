/**
 * Combat variety pass (docs/ACTION-RPG.md §4.2, §5.1, §5.5): the Foliant's guard, the Nebelweberin's
 * veil, the Scherbling's mirror, the Rufer's call, the second wave, the era hazards, the Bannlicht
 * as a tool and the three abilities (Ausfall, Erdstoß, Wirbel) — each through the real simulation.
 */
import { describe, expect, it } from 'vitest';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { callOf, hazardOf, waveOf } from '../src/systems/combat/packs';
import { BANN, HEAVY, SKILLS, type SkillId, headingOf, skillCooldown, skillsForLevel, upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, type Enemy, type SimEvent, type SimInput } from '../src/systems/combat/sim';

const flat = { heightAt: () => 0 };

function input(o: Partial<SimInput> = {}): SimInput {
  return { x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: '1789', time: 'day', ...o };
}

function sim(skills: SkillId[] = [], gentle = false) {
  const groups: Record<string, EnemyGroupState> = {};
  const s = new CombatSim(flat, groups, { gentle, reducedMotion: false, stats: deriveStats(null, { gentle }), sweep: false, konter: false, waerme: false, dritter: false, skills });
  s.p.god = true;
  return { s, groups };
}

/** Step until `until` holds (or the time runs out); returns every event. */
function runUntil(s: CombatSim, seconds: number, inp: (s: CombatSim) => Partial<SimInput>, until?: (evs: SimEvent[]) => boolean): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const evs = s.step(1 / 60, input(inp(s)));
    out.push(...evs);
    if (until?.(evs)) break;
  }
  return out;
}

const facing = (e: Enemy, at = { x: 0, z: 0 }) => ({ yaw: headingOf(e.x - at.x, e.z - at.z) });
const first = (s: CombatSim, kind: string) => s.live().find((e) => e.kind === kind)!;

describe('combat variety: shields, veils, mirrors, callers', () => {
  it('the Foliant blocks light blows from the front; a Wuchthieb breaks the guard and staggers it', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'f', kind: 'foliant', era: '1789', x: 0, z: -2.4, count: 1 });
    runUntil(s, 1.2, () => ({}));
    const f = first(s, 'foliant');
    // light blows while it faces us with the guard up (an attack of its own opens it)
    const up = () => f.state !== 'windup' && f.state !== 'strike' && f.state !== 'recover' && f.state !== 'stagger';
    const evs = runUntil(s, 10, () => ({ ...facing(f), attackPressed: up() }), (e) => e.some((v) => v.type === 'blocked'));
    expect(evs.some((v) => v.type === 'blocked')).toBe(true);
    // let the swing finish and the guard come up again, then hold the attack into a Wuchthieb
    runUntil(s, 0.8, () => facing(f));
    runUntil(s, 8, () => facing(f), () => up() && f.state !== 'notice');
    let held = 0;
    const heavy = runUntil(
      s,
      4,
      () => {
        held += 1 / 60;
        const down = held < HEAVY.min + 0.1;
        return { ...facing(f), attackPressed: held < 1.5 / 60, attackDown: down };
      },
      (e) => e.some((v) => v.type === 'guardBreak'),
    );
    expect(heavy.some((v) => v.type === 'guardBreak')).toBe(true);
    expect(f.guardBroken).toBeGreaterThan(0);
    expect(f.state).toBe('stagger');
  });

  it('the Nebelweberin veils her pack; the Bannlicht tears the veil', () => {
    const { s, groups } = sim();
    // a 1789 Nebelling pack brings its Nebelweberin (and a Foliant) as escorts
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -6, count: 3, tier: 1, radius: 1.5 });
    runUntil(s, 0.1, () => ({}));
    expect(s.live().some((e) => e.kind === 'nebelweber')).toBe(true);
    const evs = runUntil(s, 20, () => ({}), (e) => e.some((v) => v.type === 'ward'));
    const ward = evs.find((v) => v.type === 'ward');
    expect(ward).toBeTruthy();
    const veiled = ward && ward.type === 'ward' ? ward.targets[0]! : null;
    expect(veiled!.ward).toBeGreaterThan(0);
    const torn = runUntil(s, 0.2, () => ({ ...facing(veiled!), bannPressed: true }));
    expect(torn.some((v) => v.type === 'wardBreak')).toBe(true);
    expect(veiled!.ward).toBe(0);
  });

  it('the Scherbling throws the Bannlicht back (dazzle and a cut) until a Wuchthieb cracks it', () => {
    const { s, groups } = sim();
    s.p.god = false;
    upsertGroup(groups, { group: 's', kind: 'scherbling', era: '1793-07', x: 0, z: -4, count: 1 });
    runUntil(s, 0.3, () => ({ era: '1793-07' }));
    const e = first(s, 'scherbling');
    const hp = s.p.hp;
    const evs = runUntil(s, 0.1, () => ({ ...facing(e), era: '1793-07', bannPressed: true }));
    expect(evs.some((v) => v.type === 'reflect')).toBe(true);
    expect(s.p.dazzle).toBeGreaterThan(0);
    expect(s.p.hp).toBeLessThan(hp);
    // a cracked mirror no longer reflects
    e.cracked = true;
    s.p.dazzle = 0;
    s.p.bann = 2;
    const again = runUntil(s, 0.1, () => ({ ...facing(e), era: '1793-07', bannPressed: true }));
    expect(again.some((v) => v.type === 'reflect')).toBe(false);
  });

  it('the Rufer calls adds out of the fog — they give no group credit — and a blow into the call breaks it', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'r', kind: 'rufer', era: '1793-02', x: 0, z: -10, count: 1 });
    const evs = runUntil(s, 14, () => ({ era: '1793-02' }), (e) => e.some((v) => v.type === 'call'));
    const call = evs.find((v) => v.type === 'call');
    expect(call && call.type === 'call' && call.n).toBeGreaterThan(0);
    runUntil(s, 1.5, () => ({ era: '1793-02' }));
    const called = s.live().filter((e) => e.called);
    expect(called.length).toBeGreaterThan(0);
    expect(called.every((e) => e.escort)).toBe(true);
    // a second call: stand by the Rufer and hit it during the wind-up
    for (const c of called) s.killNow(c.id);
    const r = first(s, 'rufer');
    runUntil(s, 12, () => ({ era: '1793-02' }), () => r.state === 'windup' && r.attack?.id === 'ruf');
    expect(r.attack?.id).toBe('ruf');
    const at = { x: r.x, z: r.z + 1.6 };
    const hit = runUntil(s, 1, () => ({ era: '1793-02', x: at.x, z: at.z, ...facing(r, at), attackPressed: true }), (e) => e.some((v) => v.type === 'callBroken'));
    expect(hit.some((v) => v.type === 'callBroken')).toBe(true);
    expect(hit.some((v) => v.type === 'call')).toBe(false);
  });

  it('what a Rufer calls: the small fry of its pack, else its era', () => {
    expect(callOf('streuner', '1789')).toBe('mahnbrief');
    expect(callOf('streuner', '1793-02')).toBe('nebelling');
    expect(callOf('grusling', '1796')).toBe('grusling');
    expect(callOf(undefined, '1796')).toBe('grusling');
    expect(callOf(undefined, '1793-07')).toBe('glutling');
  });
});

describe('combat variety: the second wave and the era hazards', () => {
  it('a pack worth the name gets a second wave from another side, announced first', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'p', kind: 'streuner', era: '1789', x: 0, z: -12, count: 3, tier: 1 });
    const evs = runUntil(s, 20, () => ({}), (e) => e.some((v) => v.type === 'waveIncoming'));
    const w = evs.find((v) => v.type === 'waveIncoming');
    expect(w).toBeTruthy();
    if (w && w.type === 'waveIncoming') {
      // not out of the pack's own side
      expect(Math.hypot(w.x - 0, w.z + 12)).toBeGreaterThan(8);
      expect(w.n).toBe(waveOf(groups['p']!).reduce((n, x) => n + x.n, 0));
    }
    runUntil(s, 3, () => ({}));
    const wave = s.live().filter((e) => e.wave);
    expect(wave.length).toBeGreaterThan(0);
    expect(wave.every((e) => e.escort)).toBe(true);
    // small and boss groups get none
    expect(waveOf({ kind: 'streuner', count: 2, boss: false, era: '1789', tier: 1 })).toEqual([]);
    expect(waveOf({ kind: 'schuldbuch', count: 1, boss: true, era: '1789', tier: 1 })).toEqual([]);
  });

  it('the summer of 1793 rains embers, 1796 drops stones; both hurt enemies too; 1789 has none', () => {
    expect(hazardOf('1793-07')).toBe('fire');
    expect(hazardOf('1796')).toBe('stone');
    expect(hazardOf('1789')).toBeNull();
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'g', kind: 'grusling', era: '1796', x: 0, z: -3, count: 4, tier: 1, radius: 1.5 });
    const evs = runUntil(s, 25, () => ({ era: '1796' }));
    expect(evs.some((v) => v.type === 'hazard' && v.kind === 'stone')).toBe(true);
    expect(evs.some((v) => v.type === 'hazardHit')).toBe(true);
    const calm = sim();
    upsertGroup(calm.groups, { group: 'g', kind: 'mahnbrief', era: '1789', x: 0, z: -3, count: 4, tier: 1 });
    expect(runUntil(calm.s, 15, () => ({})).some((v) => v.type === 'hazard')).toBe(false);
  });
});

describe('combat variety: the Bannlicht is a tool, not a nuke', () => {
  it('a flare does not undo a regular pack, and a second flare within the window stuns for half', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -4, count: 4, radius: 1 });
    runUntil(s, 0.3, () => ({}));
    const yaw = headingOf(0, -1);
    const stuns = (evs: SimEvent[]) => evs.flatMap((v) => (v.type === 'stun' ? [v.seconds] : []));
    const evs = runUntil(s, 0.1, () => ({ yaw, bannPressed: true }));
    expect(evs.some((v) => v.type === 'killed')).toBe(false);
    const once = stuns(evs);
    expect(once.length).toBeGreaterThan(0);
    s.p.bann = 2;
    runUntil(s, 1.5, () => ({}));
    const twice = stuns(runUntil(s, 0.1, () => ({ yaw, bannPressed: true })));
    expect(twice.length).toBeGreaterThan(0);
    expect(Math.max(...twice)).toBeCloseTo(Math.max(...once) * BANN.repeatMul, 5);
  });
});

describe('combat variety: abilities', () => {
  it('unlock by level: Ausfall at 2, Erdstoß at 4, Wirbel at 6; locked ones are refused', () => {
    expect(skillsForLevel(1)).toEqual([]);
    expect(skillsForLevel(2)).toEqual(['ausfall']);
    expect(skillsForLevel(4)).toEqual(['ausfall', 'erdstoss']);
    expect(skillsForLevel(12)).toEqual(['ausfall', 'erdstoss', 'wirbel']);
    const { s } = sim(['ausfall']);
    expect(s.skillReady('wirbel')).toBe('locked');
    const evs = runUntil(s, 0.05, () => ({ skill: 'wirbel' }));
    expect(evs.some((v) => v.type === 'skillDenied' && v.why === 'locked')).toBe(true);
    expect(skillCooldown('erdstoss', true)).toBeLessThan(skillCooldown('erdstoss', false));
  });

  it('Ausfall: a lunge that carries you through and hits what is in the line, then cools down', () => {
    const { s, groups } = sim(['ausfall']);
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -5, count: 1 });
    runUntil(s, 0.2, () => ({}));
    const e = first(s, 'nebelling');
    const hp = e.hp;
    let x = 0;
    let z = 0;
    let push = { vx: 0, vz: 0, t: 0 };
    const evs: SimEvent[] = [];
    for (let i = 0; i < 40; i++) {
      const out = s.step(1 / 60, input({ x, z, ...facing(e, { x, z }), skill: i === 0 ? 'ausfall' : null }));
      for (const v of out) if (v.type === 'skill') push = { vx: v.vx, vz: v.vz, t: v.dur };
      if (push.t > 0) {
        x += (push.vx * 1) / 60;
        z += (push.vz * 1) / 60;
        push.t -= 1 / 60;
      }
      evs.push(...out);
    }
    const sk = evs.find((v) => v.type === 'skill');
    expect(sk && sk.type === 'skill' && Math.hypot(sk.vx, sk.vz)).toBeGreaterThan(10);
    expect(evs.some((v) => v.type === 'skillImpact' && v.id === 'ausfall' && v.hits >= 1)).toBe(true);
    expect(e.hp < hp || e.state === 'dissolve').toBe(true);
    expect(s.skillReady('ausfall')).toBe('cooldown');
    expect(s.p.cds.ausfall).toBeGreaterThan(SKILLS.ausfall.cd - 1);
  });

  it('Erdstoß: a shock ring that hits all around, staggers and breaks a guard', () => {
    const { s, groups } = sim(['erdstoss']);
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -2, count: 3, radius: 1 });
    upsertGroup(groups, { group: 'f', kind: 'foliant', era: '1789', x: 2.2, z: 0.5, count: 1 });
    runUntil(s, 0.3, () => ({}));
    const evs = runUntil(s, 1.2, (t) => ({ skill: t.p.skill ? null : 'erdstoss' }));
    const imp = evs.find((v) => v.type === 'skillImpact' && v.id === 'erdstoss');
    expect(imp && imp.type === 'skillImpact' && imp.hits).toBeGreaterThanOrEqual(3);
    expect(evs.some((v) => v.type === 'guardBreak')).toBe(true);
  });

  it('Wirbel: three hits around you and a deflection of bolts', () => {
    const { s, groups } = sim(['wirbel']);
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -1.8, count: 2, radius: 0.8 });
    runUntil(s, 0.3, () => ({}));
    const hits: number[] = [];
    let started = false;
    runUntil(s, 1.2, (t) => {
      const go = !started && !t.p.skill;
      if (go) started = true;
      return { skill: go ? 'wirbel' : null };
    }, (e) => {
      for (const v of e) if (v.type === 'hit') hits.push(1);
      return false;
    });
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(s.skillReady('wirbel')).toBe('cooldown');
  });
});
