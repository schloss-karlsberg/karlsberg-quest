import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_BY_ID } from '../src/assets/manifest';
import { COSTUMES, ENEMY_RIGS, PIKEUR_RIG, builtInHat, costumeFor, enemyModels, enemyRig, modelFor, slotColour } from '../src/systems/characters/catalog';
import { bodyTemplate } from '../src/systems/combat/bodies';
import { ROSTER } from '../src/systems/npc/roster';

const ROOT = path.resolve(__dirname, '../public/assets');

/** The JSON chunk of a GLB (names of animations, meshes, materials; no binary decoding). */
function glbJson(url: string): { animations?: { name: string }[]; meshes?: { name: string }[]; materials?: { name: string }[]; nodes?: { name?: string }[] } {
  const b = fs.readFileSync(path.join(ROOT, url));
  expect(b.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const len = b.readUInt32LE(12);
  expect(b.readUInt32LE(16)).toBe(0x4e4f534a); // 'JSON'
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}

function clips(model: string): string[] {
  const e = ASSET_BY_ID.get(model);
  expect(e, model).toBeDefined();
  return (glbJson(e!.url).animations ?? []).map((a) => a.name);
}

describe('characters: rigged CC0 models (catalog)', () => {
  it('every ghost NPC wears a model from the manifest that has the clips the ghost plays', () => {
    for (const look of Object.values(ROSTER)) {
      const m = modelFor(look);
      const names = clips(m);
      for (const c of ['Idle_Neutral', 'Walk', 'Run', 'Interact', 'Wave']) expect(names, `${look.id} → ${m}: ${c}`).toContain(c);
    }
  });

  it('costumes colour real material slots; per-NPC accents override the outfit', () => {
    for (const look of Object.values(ROSTER)) {
      const m = modelFor(look);
      const mats = new Set((glbJson(ASSET_BY_ID.get(m)!.url).materials ?? []).map((x) => x.name));
      const c = costumeFor(look);
      const slots = Object.keys(c).filter((k) => !k.startsWith('mesh:'));
      // most of the outfit's slots exist on the model it is worn on
      expect(slots.filter((s) => mats.has(s)).length, `${look.id} on ${m}`).toBeGreaterThanOrEqual(Math.min(4, slots.length));
    }
    expect(slotColour(costumeFor(ROSTER.diener!), 'x', 'Green')).toBe(0x5e1c1f);
    expect(slotColour(COSTUMES.maid, 'Formad_Head_2', 'Red')).toBe(COSTUMES.maid['mesh:Formad_Head_2']);
    expect(slotColour(COSTUMES.maid, 'Other', 'Nope')).toBeNull();
  });

  it('the farmer model brings its own slouch hat; other hats are built on the head bone', () => {
    expect(builtInHat('characters.human.farmer', 'slouch')).toBe(true);
    expect(builtInHat('characters.human.adventurer', 'tricorn')).toBe(false);
    expect(modelFor(ROSTER.hanne!)).toBe('characters.human.woman');
    expect(modelFor(ROSTER.peter!)).toBe('characters.human.farmer');
    expect(modelFor(ROSTER.soll!)).toBe('characters.human.adventurer');
  });

  it('rigged enemies: every model and clip exists; the rest stay procedural', () => {
    for (const [kind, r] of [...Object.entries(ENEMY_RIGS), ['pikeur', PIKEUR_RIG.horse] as const, ['pikeur.hound', PIKEUR_RIG.hound] as const]) {
      const names = clips(r.model);
      for (const c of [r.idle, r.walk, r.run, r.attack, r.hit, r.death]) expect(names, `${kind}: ${c}`).toContain(c);
      expect(r.attackWindup).toBeGreaterThan(0);
      expect(r.attackWindup).toBeLessThan(0.6);
      expect(r.coreR).toBeLessThan(r.height * 0.2); // a small heart, never a blob
    }
    expect(enemyModels('pikeur').sort()).toEqual(['characters.creature.horse', 'characters.creature.wolf']);
    expect(enemyRig('nebelling')).toBeNull();
    expect(enemyModels('steinbrecher')).toEqual([]);
  });

  it('on a rig only the flagged template parts still draw (the rider, the coins)', () => {
    const pk = bodyTemplate('pikeur', 0.3);
    const kept = pk.parts.filter((p) => p.onRig);
    expect(kept.length).toBeGreaterThan(10);
    expect(kept.every((p) => p.bone === 'rider' || p.bone === 'armR' || p.bone === 'flap')).toBe(true);
    // the horse and the hounds are the models now
    expect(pk.parts.some((p) => p.bone === 'hound' && p.onRig)).toBe(false);
    expect(bodyTemplate('raffschatten', 0.4).parts.filter((p) => p.onRig)).toHaveLength(3);
    expect(bodyTemplate('streuner', 0.4).parts.filter((p) => p.onRig)).toHaveLength(0);
  });

  it('the Nebelling glows from a small cold heart inside darker mist', () => {
    const t = bodyTemplate('nebelling', 0.5);
    const cores = t.parts.filter((p) => p.kind === 'glow' && p.bone === 'core');
    expect(cores.length).toBe(2);
    const mist = t.parts.filter((p) => p.kind === 'puff');
    for (const p of mist) expect(Math.max(...p.col)).toBeLessThan(0.4);
  });
});
