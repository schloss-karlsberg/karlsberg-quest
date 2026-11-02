import { describe, expect, it } from 'vitest';
import { skillMet } from '../src/systems/chronik/logic';
import {
  SKILL_MAX,
  canMeasure,
  canXray,
  gateFrom,
  hornMeaning,
  isFreeSurvey,
  mapLayers,
  nextMap,
  nextPlanView,
  parseSkill,
  scanAllowed,
  setFreeOverride,
  showPackRoutes,
  showRoomLayout,
  skillId,
  skillIncreases,
} from '../src/systems/skills/logic';

const gate = (skills: Record<string, number>, free = false) => ({ skills, free });

describe('skills: parsing and increases', () => {
  it('parses ids, aliases and level specs', () => {
    expect(skillId('Röntgenblick')).toBe('roentgen');
    expect(skillId('relief-blick')).toBe('relief');
    expect(skillId('nope')).toBeNull();
    expect(parseSkill('kartograf:3')).toEqual({ skill: 'kartograf', level: 3 });
    expect(parseSkill('kartograf3')).toEqual({ skill: 'kartograf', level: 3 });
    expect(parseSkill('spurenleser')).toEqual({ skill: 'spurenleser', level: 1 });
    expect(parseSkill('roentgen', 5)).toEqual({ skill: 'roentgen', level: SKILL_MAX.roentgen });
    expect(parseSkill('baumeister', 0)).toEqual({ skill: 'baumeister', level: 1 });
    expect(parseSkill('quatsch:2')).toBeNull();
  });

  it('reports one increase per skill at its new level, ignores unknown keys and drops', () => {
    expect(skillIncreases({ relief: 1 }, { relief: 3, kartograf: 1, foo: 4 })).toEqual([
      { skill: 'relief', from: 1, level: 3 },
      { skill: 'kartograf', from: 0, level: 1 },
    ]);
    expect(skillIncreases({ relief: 2 }, { relief: 1 })).toEqual([]);
    expect(skillIncreases({}, { roentgen: 9 })).toEqual([{ skill: 'roentgen', from: 0, level: 1 }]);
  });

  it('the content requirement format matches the Chronik check (clue.k3.messen needs kartograf:3)', () => {
    expect(skillMet('kartograf:3', { kartograf: 2 })).toBe(false);
    expect(skillMet('kartograf:3', { kartograf: 3 })).toBe(true);
  });
});

describe('skills: gates', () => {
  it('free survey without a running story, strict/all via URL', () => {
    expect(isFreeSurvey(false, null)).toBe(true);
    expect(isFreeSurvey(true, null)).toBe(false);
    expect(isFreeSurvey(true, 'all')).toBe(true);
    expect(isFreeSurvey(false, 'strict')).toBe(false);
    const params = new URLSearchParams('');
    expect(gateFrom({ skills: {}, systems: { story: { active: true } } }, params).free).toBe(false);
    expect(gateFrom({ skills: {}, systems: {} }, params).free).toBe(true);
    setFreeOverride(false);
    expect(gateFrom({ skills: {}, systems: {} }, params).free).toBe(false);
    setFreeOverride(null);
  });

  it('Relief-Blick n opens scan mode n', () => {
    expect(scanAllowed(0, gate({}))).toBe(true);
    expect(scanAllowed(1, gate({}))).toBe(false);
    expect(scanAllowed(2, gate({ relief: 1 }))).toBe(false);
    expect(scanAllowed(2, gate({ relief: 2 }))).toBe(true);
    expect(scanAllowed(3, gate({ relief: 2 }))).toBe(false);
    expect(scanAllowed(3, gate({}, true))).toBe(true);
  });

  it('M cycles off → 1840 → 1935 → off by Kartograf level', () => {
    expect(nextMap(0, gate({}))).toBeNull();
    expect(mapLayers(gate({ kartograf: 1 }))).toEqual([1840]);
    expect(nextMap(0, gate({ kartograf: 1 }))).toBe(1840);
    expect(nextMap(1840, gate({ kartograf: 1 }))).toBe(0);
    expect(nextMap(0, gate({ kartograf: 2 }))).toBe(1840);
    expect(nextMap(1840, gate({ kartograf: 2 }))).toBe(1935);
    expect(nextMap(1935, gate({ kartograf: 3 }))).toBe(0);
    // a 1935 layer left on after the level dropped (load) still turns off
    expect(nextMap(1935, gate({ kartograf: 1 }))).toBe(0);
  });

  it('B cycles off → plan → confidence → off by Baumeister level', () => {
    expect(nextPlanView('off', gate({}))).toBeNull();
    expect(nextPlanView('off', gate({ baumeister: 1 }))).toBe('plan');
    expect(nextPlanView('plan', gate({ baumeister: 1 }))).toBe('off');
    expect(nextPlanView('plan', gate({ baumeister: 2 }))).toBe('conf');
    expect(nextPlanView('conf', gate({ baumeister: 2 }))).toBe('off');
    expect(showRoomLayout(gate({ baumeister: 2 }))).toBe(false);
    expect(showRoomLayout(gate({ baumeister: 3 }))).toBe(true);
  });

  it('measure, Röntgenblick, pack routes, horn meaning', () => {
    expect(canMeasure(gate({ kartograf: 2 }))).toBe(false);
    expect(canMeasure(gate({ kartograf: 3 }))).toBe(true);
    expect(canXray(gate({}))).toBe(false);
    expect(canXray(gate({ roentgen: 1 }))).toBe(true);
    expect(showPackRoutes(gate({ spurenleser: 1 }))).toBe(false);
    expect(showPackRoutes(gate({ spurenleser: 2 }))).toBe(true);
    expect(hornMeaning({}, false)).toBe(false);
    expect(hornMeaning({ spurenleser: 1 }, false)).toBe(true);
    expect(hornMeaning({}, true)).toBe(true);
  });
});
