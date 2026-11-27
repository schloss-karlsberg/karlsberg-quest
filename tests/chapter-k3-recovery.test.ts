import { Scene, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBundledContent } from '../src/content/db';
import type { GameContext } from '../src/core/context';
import { ERA_INFO, type Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { createInitialState, deserializeState, GameStateStore, serializeState } from '../src/core/state';
import type { QuestTopic } from '../src/rpg/types';
import quests from '../src/systems/quests';
import { createQuestSlice } from '../src/systems/quests/logic';
import story from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';
import type { KqHooks } from '../src/debug/hooks';

class Element {
  classList = { add() {}, remove() {}, toggle() {} };
  style = {};
  dataset = {};
  content = { firstElementChild: null };
  append() {}
  appendChild() {}
  prepend() {}
  replaceChildren() {}
  remove() {}
  setAttribute() {}
  addEventListener() {}
  querySelector() { return null; }
}

const DT = 1 / 60;
const FESTSAAL = 'q.k3.festsaal';
const JAGUAR = 'q.k3.jaguar';

async function game(beat: string, withStory = false) {
  const initial = createInitialState();
  initial.era = '1793-07';
  initial.systems.story = { ...createStorySlice(), active: true, chapter: 'k3', beat };
  initial.systems.quests = createQuestSlice();
  const state = new GameStateStore(initial);
  const events = new EventBus();
  const position = new Vector3(1265, 351.4, -1126);
  const hooks: Partial<KqHooks> = {};
  vi.stubGlobal('window', {
    kq: hooks, setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
  });
  const era = {
    current: initial.era as Era,
    get info() { return ERA_INFO[this.current]; },
    set(to: Era) {
      const from = this.current;
      this.current = to;
      events.emit('era:change', { from, to });
    },
  };
  const ctx = {
    state, events, era, scene: new Scene(), params: new URLSearchParams(),
    content: loadBundledContent(),
    systems: new Map(),
    assets: { licences: async () => null },
    save: { autosave() {} },
    settings: { state: { reducedMotion: true } },
    loop: { manual: true },
    pause: { paused: false, reasons: new Set<string>() },
    input: { wasPressed: () => false, isDown: () => false },
    player: {
      position, stats: { lanternLit: false, speed: 0 }, stance: 'stand',
      teleport: (x: number, z: number) => position.set(x, position.y, z),
    },
    world: { forest: { invalidate() {} }, heightAt: () => 0, applyLook() {} },
    audio: { bindVoiceEmitter: () => () => {} },
    ui: {
      layer: () => new Element(),
      modals: { count: 0 },
      cards: { hold() {}, soft() {} },
      hud: {
        stack() {}, dock() {}, prompt() {}, busy() {}, setMarker() {}, acting: () => false,
      },
      toast() {},
    },
  } as unknown as GameContext;
  if (withStory) {
    await story.init(ctx);
    vi.advanceTimersByTime(25);
  }
  quests.init(ctx);
  function step(seconds: number) {
    for (let tick = 0; tick < Math.round(seconds / DT); tick++) {
      story.update(DT);
      quests.update(DT);
    }
  }
  return { state, events, position, era, hooks, step };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Node', Element);
  vi.stubGlobal('document', { body: new Element(), createElement: () => new Element(), createTextNode: () => new Element() });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('CSS', { escape: (s: string) => s });
  vi.stubGlobal('fetch', undefined);
});

afterEach(() => {
  story.dispose();
  quests.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Chapter 3 quest recovery', () => {
  it('offers and accepts Hanne’s turn-in after the saved clock choice finishes the retry’s beat in one tick', async () => {
    const { state, events, position, era, hooks, step } = await game('k3_3', true);
    let hanne: QuestTopic[] = [];
    const gardenHanne = vi.fn();
    events.on('npc:topics', ({ npc, topics }) => { if (npc === 'hanne') hanne = topics; });
    events.on('npc:spawn', (npc) => { if (npc.npc === 'hanne' && npc.chapter === 'k3g') gardenHanne(npc); });
    events.emit('quest:command', { op: 'complete', id: 'q.k3.strohmann' });
    events.emit('quest:command', { op: 'start', id: FESTSAAL });
    hooks.story!.goto('k3', 'k3_4');
    state.mutable.flags['festsaal.took'] = 'uhr';
    step(DT);
    expect(state.state.flags['choice.k3.objekt']).toBe('uhr');
    expect(state.state.systems.story?.beat).toBe('k3_5');

    events.emit('player:caught', { by: 'fire' });
    step(2.5);
    era.set('1793-07');
    position.set(1265, 351.4, -1126);
    state.mutable.flags['interior.building'] = 'KB-B01';
    step(0.3);
    expect(state.state.systems.story?.beat).toBe('k3_5');
    expect(state.state.flags['npc.hush']).toBeUndefined();

    delete state.mutable.flags['interior.building'];
    position.set(1284, 345, -1229);
    step(DT);
    position.set(1270, 345, -1293);
    step(12);
    expect(gardenHanne).toHaveBeenCalledOnce();
    expect(state.state.flags['npc.hush']).toBeUndefined();
    expect(hanne).toContainEqual(expect.objectContaining({ kind: 'turnin', quest: FESTSAAL }));
    events.emit('quest:turnin', { id: FESTSAAL, npc: 'hanne' });
    step(DT);
    expect(state.state.systems.quests?.quests[FESTSAAL]?.state).toBe('done');
    expect(state.state.systems.story?.beat).toBe('k3_7');
  });

  it.each(['acceptance', 'load'])('pays once on %s when the specific jaguar was already calmed', async (when) => {
    const { state, events, step } = await game('k3_6');
    const paid = vi.fn();
    events.on('quest:completed', ({ id }) => { if (id === JAGUAR) paid(); });
    state.mutable.systems.menagerie = { animals: [], calmed: [when === 'acceptance' ? 'k3.jaguar' : 'other.jaguar'] };
    events.emit('quest:accept', { id: JAGUAR, npc: 'hanne' });
    step(DT);
    if (when === 'load') {
      expect(state.state.systems.quests?.quests[JAGUAR]).toMatchObject({ state: 'active', counts: {} });
      state.mutable.systems.menagerie.calmed!.push('k3.jaguar');
      state.replace(deserializeState(serializeState(state.mutable)), 'load');
      events.emit('save:loaded', { slot: 'auto' });
    }
    expect(state.state.systems.quests?.quests[JAGUAR]).toMatchObject({ state: 'done', counts: { jaguar: 1 } });
    expect(paid).toHaveBeenCalledOnce();
    events.emit('save:loaded', { slot: 'auto' });
    step(DT);
    expect(paid).toHaveBeenCalledOnce();
  });
});
