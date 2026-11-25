import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import codex from '../content/packs/codex.pack.json';
import tourRoute from '../content/routes/p-fuehrung.json';
import type { ContentPack } from '../src/content/types';
import { ContentDB } from '../src/content/db';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus, type EventName } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import { t } from '../src/i18n';
import { distToSegment } from '../src/systems/fx/geom';
import { BAUWAGEN_FACT, BauwagenDiscovery } from '../src/systems/scenery/bauwagen-discovery';
import { BAUWAGEN_DOOR, BAUWAGEN_SET, BAUWAGEN_SITE } from '../src/systems/scenery/bauwagen';
import { SetBuilder } from '../src/systems/scenery/builder';
import { SETS } from '../src/systems/scenery/sets';
import { TOUR_STOP_SETS } from '../src/systems/scenery/tour';
import '../src/systems/scenery/strings';
import { endingScenes } from '../src/systems/story/endings/scenes';
import '../src/systems/story/strings';
import { SURVEY_POINTS } from '../src/systems/travel/points';
import { generatePois } from '../src/systems/travel/pois';
import { pushOutOfBox } from '../src/world/collision';
import { loadWorldData } from './world-data';

const content = new ContentDB([{ file: 'content/packs/codex.pack.json', pack: codex as ContentPack }]);
const stories = import.meta.glob<string>('/content/story/*.story.json', { query: '?raw', eager: true, import: 'default' });
const quests = import.meta.glob<string>('/content/quests/*.quests.json', { query: '?raw', eager: true, import: 'default' });
const endings = import.meta.glob<string>('/content/packs/enden.pack.json', { query: '?raw', eager: true, import: 'default' });

describe('Bauwagen site', () => {
  it('stands on dry present-day ground just south of the track, with one static mesh and a solid body', () => {
    const { x, z, clearing } = BAUWAGEN_SITE;
    const world = loadWorldData();
    expect({ x, z }).toEqual({ x: 760, z: -915 });
    expect(BAUWAGEN_SET.eras).toEqual(['today']);
    expect(SETS).toContain(BAUWAGEN_SET);
    expect(world.pathAt(x, z)).toBe(0);
    expect(world.pathAt(x, z + 16)).toBeGreaterThan(0.4);
    expect(clearing).toBeLessThan(16);
    for (const [px, pz] of [[x, z], [BAUWAGEN_DOOR.x, z + 4], [x, z + 16]] as const) {
      expect(world.water(px, pz)).toBe(false);
      expect(world.h2025.slopeDeg(px, pz)).toBeLessThan(15);
    }

    const builder = new SetBuilder((px, pz) => world.h2025.heightAt(px, pz));
    BAUWAGEN_SET.build(builder, { era: 'today', gateOpen: 0 });
    const set = builder.build(BAUWAGEN_SET.id);
    expect(set.models).toEqual([]);
    expect(set.strikes).toEqual([]);
    expect(set.group.children).toHaveLength(1);
    expect(set.materials).toHaveLength(1);
    const mesh = set.group.children[0] as Mesh;
    expect(mesh.isMesh).toBe(true);
    expect(mesh.geometry.getAttribute('position').count / 3).toBeLessThan(2_000);
    expect(set.solids).toHaveLength(1);
    const body = set.solids[0];
    if (body?.kind !== 'box') throw new Error('Expected a trailer footprint');
    expect(pushOutOfBox(x, z, 0.45, body)).not.toBeNull();
    expect(pushOutOfBox(BAUWAGEN_DOOR.x, z + 4, 0.45, body)).toBeNull();
    expect(pushOutOfBox(x, z + 16, 0.45, body)).toBeNull();
    mesh.geometry.dispose();
    set.materials[0]?.dispose();
  }, 30_000);

  it('stays outside the tour route, story, objectives and map or Bussole target catalogs', () => {
    const { x, z } = BAUWAGEN_SITE;
    const distances = tourRoute.points.slice(1).map(([bx, bz], i) => {
      const [ax, az] = tourRoute.points[i]!;
      return distToSegment(x, z, ax!, az!, bx!, bz!);
    });
    expect(Math.min(...distances)).toBeGreaterThan(BAUWAGEN_SET.range);
    expect(TOUR_STOP_SETS).not.toContain(BAUWAGEN_SET);
    for (const list of [SURVEY_POINTS, generatePois()]) {
      expect(list.some((p) => Math.hypot(p.x - x, p.z - z) < 10)).toBe(false);
    }
    for (const [file, json] of Object.entries({ ...stories, ...quests, ...endings })) {
      expect(json, file).not.toMatch(/\bbauwagen\b/i);
      expect(json, file).not.toContain(BAUWAGEN_FACT);
    }
    expect(JSON.stringify(endingScenes(2026))).not.toMatch(/bauwagen/i);
    for (const key of ['story.end.intro', 'story.end.burn.obj', 'story.end.keep.obj']) expect(t(key)).not.toMatch(/bauwagen/i);
  });
});

function setup(initial = createInitialState(), storage = new MemoryStorage()) {
  const events = new EventBus();
  const log: [EventName, unknown][] = [];
  events.onAny((name, payload) => log.push([name, payload]));
  const state = new GameStateStore(initial);
  const save = new SaveManager(state, storage, events);
  const player = { position: { x: BAUWAGEN_DOOR.x, y: 10, z: BAUWAGEN_SITE.z + 4 }, yaw: 0, flying: false, frozen: false };
  const era = { current: 'today' as Era };
  let owner: string | null = null;
  let otherPrompt = false;
  let pressed = false;
  const ctx = {
    events, state, save, player, era, content, t,
    world: { heightAt: () => 10 },
    input: { enabled: true, wasPressed: (key: string) => pressed && key === 'listen' },
    ui: {
      modals: { count: 0 },
      hud: {
        prompt: (key: string | null, _text: string, id: string) => { owner = key ? id : null; },
        promptOwner: () => otherPrompt ? 'other' : owner,
      },
    },
  };
  const encounter = new BauwagenDiscovery(ctx as unknown as GameContext);
  return {
    ctx, log, encounter, storage,
    prompt: () => owner,
    takePrompt: () => { otherPrompt = true; },
    step(interact = false, built = true) {
      pressed = interact;
      encounter.update(built);
    },
  };
}

describe('Bauwagen discovery', () => {
  it('has only a local door prompt and respects era, position, facing and interaction priority', () => {
    const s = setup();
    s.step(true, false);
    expect(s.prompt()).toBeNull();
    s.ctx.player.position.z = BAUWAGEN_SITE.z + 16;
    s.step(true);
    expect(s.prompt()).toBeNull();
    s.ctx.player.position.z = BAUWAGEN_SITE.z - 2;
    s.ctx.player.yaw = Math.PI;
    s.step(true);
    expect(s.prompt()).toBeNull();
    s.ctx.player.position.z = BAUWAGEN_SITE.z + 4;
    s.step(true);
    expect(s.prompt()).toBeNull();
    s.ctx.player.yaw = 0;
    s.step();
    expect(s.prompt()).toBe(BAUWAGEN_SET.id);
    s.ctx.era.current = '1789';
    s.ctx.events.emit('era:change', { from: 'today', to: '1789' });
    expect(s.prompt()).toBeNull();
    s.step(true);
    expect(s.prompt()).toBeNull();
    s.ctx.era.current = 'today';
    s.ctx.player.flying = true;
    s.step(true);
    expect(s.prompt()).toBeNull();
    s.ctx.player.flying = false;
    s.ctx.events.emit('world:quiet', { on: true, reason: 'party' });
    s.step(true);
    expect(s.prompt()).toBeNull();
    s.ctx.events.emit('world:quiet', { on: false, reason: 'party' });
    s.takePrompt();
    s.step(true);
    expect(s.ctx.state.state.codex.facts).toEqual([]);
    s.encounter.dispose();
    expect(s.prompt()).toBeNull();
  });

  it('awards the fictional note once, saves it, and preserves the objectives through reload', () => {
    const initial = createInitialState();
    initial.systems.quests = { quests: {}, tracked: ['q.k1.ankunft'], unseen: [] };
    initial.flags['tour.weiher'] = true;
    const s = setup(initial);
    s.step();
    expect(s.ctx.state.state.codex.facts).toEqual([]);
    s.step(true);
    s.step(true);
    expect(s.prompt()).toBeNull();
    expect(content.facts.get(BAUWAGEN_FACT)).toMatchObject({ fiction: true, tags: ['label:FIKTION'], sources: [] });
    expect(s.log).toEqual([
      ['codex:unlocked', { factId: BAUWAGEN_FACT, noXp: true }],
      ['discovery:found', { title: 'Die letzte Messung' }],
      ['save:written', { slot: 'auto', reason: BAUWAGEN_SET.id }],
    ]);

    const restored = setup(createInitialState(), s.storage);
    expect(restored.ctx.save.load()).toBe(true);
    restored.log.length = 0;
    restored.step(true);
    expect(restored.log).toEqual([]);
    expect(restored.prompt()).toBeNull();
    expect(restored.ctx.state.state.codex.facts).toEqual([BAUWAGEN_FACT]);
    expect(restored.ctx.state.state.systems.quests?.tracked).toEqual(['q.k1.ankunft']);
    expect(restored.ctx.state.state.flags['tour.weiher']).toBe(true);
  });
});
