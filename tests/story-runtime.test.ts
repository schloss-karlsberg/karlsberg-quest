import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import k4Pack from '../content/packs/kapitel-4.pack.json';
import { ContentDB } from '../src/content/db';
import type { ContentPack } from '../src/content/types';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore, type GameState } from '../src/core/state';
import type { QuestProgress } from '../src/rpg/types';
import { createProgressionSlice } from '../src/systems/progression/logic';
import quests from '../src/systems/quests';
import { createQuestSlice } from '../src/systems/quests/logic';
import story from '../src/systems/story';
import { ENDING_SLOT } from '../src/systems/story/title/actions';
import { createStorySlice } from '../src/systems/story/engine';
import { pauseHooks } from '../src/ui/menus';
import { pausePages } from '../src/ui/pause-pages';

const noop = () => {};

class Element {
  readonly children: Element[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => unknown>();
  readonly classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
  readonly style = { setProperty: noop };
  readonly dataset = {};
  readonly content = { firstElementChild: null };

  addEventListener(event: string, listener: () => unknown): void { this.listeners.set(event, listener); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  append(...children: Element[]): void { this.children.push(...children); }
  appendChild(child: Element): void { this.append(child); }
  prepend(child: Element): void { this.children.unshift(child); }
  replaceChildren(...children: Element[]): void { this.children.splice(0, this.children.length, ...children); }
  querySelector(): null { return null; }
  remove(): void {}
}

async function boot(initial: GameState, withFx = false) {
  vi.stubGlobal('Node', Element);
  vi.stubGlobal('document', { createElement: () => new Element(), createTextNode: () => new Element(), body: new Element() });
  vi.stubGlobal('window', { addEventListener: noop, removeEventListener: noop, setInterval: noop, setTimeout: noop, clearTimeout: noop, clearInterval: noop });
  vi.stubGlobal('requestAnimationFrame', noop);
  vi.stubGlobal('fetch', undefined);
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  const events = new EventBus();
  const state = new GameStateStore(initial);
  const storage = new MemoryStorage();
  const save = new SaveManager(state, storage, events, () => 0);
  const era = {
    current: initial.era,
    set(to: Era) {
      const from = this.current;
      if (from === to) return;
      this.current = state.mutable.era = to;
      events.emit('era:change', { from, to });
    },
  };
  const player = {
    position: { x: 1300, y: 0, z: -1490 },
    stance: 'stand',
    stats: { lanternLit: false, speed: 0 },
    teleport(x: number, z: number) { Object.assign(this.position, { x, z }); },
    writeState(target: { x: number; z: number }) { Object.assign(target, { x: this.position.x, z: this.position.z }); },
  };
  let shiftPressed = false;
  const confirm = vi.fn(async () => true);
  const ctx = {
    events, state, save, era, player, scene: new Scene(),
    assets: { licences: async () => null },
    params: new URLSearchParams(),
    content: new ContentDB([{ file: 'kapitel-4.pack.json', pack: k4Pack as ContentPack }]),
    world: { applyLook: noop, heightAt: () => 0, forest: { invalidate: noop } },
    audio: { ctx: null, bindVoiceEmitter: () => noop, createSource3D: () => null, bus: () => null },
    ui: {
      layer: () => new Element(),
      hud: { stack: noop, dock: noop, acting: () => false, prompt: noop, setMarker: noop, subtitle: noop },
      toast: noop,
      modals: { count: 0, confirm, closeAll: noop },
      cards: { soft: noop, hold: noop },
    },
    input: { wasPressed: (key: string) => key === 'shift' && shiftPressed, isDown: () => false },
    settings: { state: { reducedMotion: false } },
    loop: { manual: true },
    pause: { paused: false, reasons: new Set<string>() },
    systems: { get: (id: string) => id === 'fx' && withFx },
  } as unknown as GameContext;
  // Stand in for the NPC renderer while keeping the authored placement events and real quest offers.
  events.on('npc:spawn', (placement) => {
    const npc = state.slice('npc', () => ({ placed: {}, said: [] }));
    npc.placed[placement.npc] = { ...placement, era: placement.era ?? era.current };
  });
  await story.init(ctx);
  return {
    ctx, events, state, save, storage, era, player, confirm,
    start: () => events.emit('game:start', { resumed: false }),
    tick(dt = 1 / 60) { story.update(dt); quests.update(dt); shiftPressed = false; },
    pressShift() { shiftPressed = true; },
  };
}

afterEach(() => {
  quests.dispose();
  story.dispose();
  vi.unstubAllGlobals();
});

function completedEnding(): GameState {
  const state = createInitialState();
  state.systems.story = { ...createStorySlice(), chapter: 'enden', completed: ['enden'], finished: true, ending: 'museum' };
  return state;
}

const rawAuto = (storage: MemoryStorage) => JSON.parse(storage.getItem(SAVE_KEY('auto'))!) as GameState;

describe('ending runtime saves', () => {
  it('writes an inactive story and the free-roam objective to the auto slot after credits', async () => {
    const state = completedEnding();
    Object.assign(state.systems.story!, { active: true, beat: 'e3', completed: [], finished: false });
    const game = await boot(state);
    game.save.save(ENDING_SLOT);
    game.start();
    game.events.emit('credits:done', { skipped: false });
    // the credits autosave already carries the finished story (TASK-045)
    expect(rawAuto(game.storage).systems.story).toMatchObject({ active: false, finished: true });
    game.tick();
    expect(rawAuto(game.storage).systems.story).toMatchObject({
      active: false,
      objective: { id: 'end.frei', text: expect.stringContaining('Ende noch einmal wählen') },
    });
  });

  it.each([true, false])('restores the authored free-roam hint from a legacy save (ending slot: %s)', async (withSlot) => {
    const game = await boot(completedEnding());
    game.save.save('auto');
    if (withSlot) game.save.save(ENDING_SLOT);
    game.start();
    expect(game.save.load('auto')).toBe(true);
    const objective = game.state.state.systems.story?.objective;
    expect(objective).toMatchObject({ id: 'end.frei', text: expect.stringContaining('Pause → Sammlungen und Codex') });
    expect(objective?.text.includes('Ende noch einmal wählen')).toBe(withSlot);
    expect(pauseHooks.extraActions?.().length).toBe(withSlot ? 1 : 0);
  });
});

describe('optional quest windows in the story runtime', () => {
  it('keeps Peter available after selecting a completed K3 and shifting to July 1793', async () => {
    const initial = completedEnding();
    const chair = 'q.k3.lehnstuhl';
    const afternoon = 'q.k3.nachmittag';
    const book = 'q.k3.buch';
    const boss = 'q.k3.strohmann';
    const hall = 'q.k3.festsaal';
    const done: QuestProgress = { state: 'done', counts: { schatten: 5, korb: 1 }, t: 20 };
    initial.systems.story!.unlocked.push('k3');
    initial.systems.story!.completed.push('k3');
    initial.systems.quests = { ...createQuestSlice(), quests: { [afternoon]: done, [book]: done, [boss]: done, [hall]: done } };
    initial.systems.progression = { ...createProgressionSlice(), taken: [`${afternoon}.korb.0`] };
    const game = await boot(initial);
    quests.init(game.ctx);
    game.start();
    const page = new Element();
    pausePages().find(({ id }) => id === 'chapters')!.render(page as unknown as HTMLElement);
    const chapter = page.children[0]!.children.flatMap((row) => row.children).find((button) => button.attributes.get('data-testid') === 'chapter-k3')!;
    await chapter.listeners.get('click')!();
    expect(game.confirm).toHaveBeenCalledOnce();
    expect(game.state.state.systems.story).toMatchObject({ chapter: 'k3', beat: 'k3_0' });
    game.tick(7);
    game.tick(1.1);
    game.player.teleport(1210, -1114);
    game.pressShift();
    game.tick();
    expect(game.era.current).toBe('1793-07');
    for (let i = 0; i < 120; i++) game.tick();
    expect(game.state.state.systems.story?.beat).toBe('k3_1');
    expect(game.state.state.systems.npc?.placed['peter']).toBeDefined();
    expect(game.state.state.flags[`quest.${chair}`]).toBe('offered');
    expect(game.state.state.flags[`quest.${afternoon}`]).toBe('active');
    expect(game.state.state.flags[`quest.${hall}`]).toBe('done');
    game.events.emit('quest:accept', { id: chair, npc: 'peter' });
    expect(game.state.state.flags[`quest.${chair}`]).toBe('active');
    expect(game.save.load('auto')).toBe(true);
    game.tick();
    expect(game.state.state.systems.story?.beat).toBe('k3_1');
    expect(game.state.state.flags[`quest.${chair}`]).toBe('active');

    const payout = vi.fn();
    game.events.on('xp:grant', payout);
    game.events.on('item:grant', payout);
    game.events.on('codex:unlocked', payout);
    game.events.on('skill:grant', payout);
    game.events.emit('quest:command', { op: 'progress', id: afternoon, objective: 'schatten', n: 5 });
    game.tick();
    expect(game.state.state.flags[`quest.${afternoon}.korb`]).toBe(1);
    game.events.emit('quest:command', { op: 'complete', id: afternoon });
    expect(game.state.state.systems.quests?.quests[afternoon]).toEqual(done);
    expect(game.state.state.systems.quests?.replay?.quests[afternoon]?.state).toBe('done');
    game.events.emit('quest:command', { op: 'complete', id: book });
    expect(payout).not.toHaveBeenCalled();
    game.tick();
    expect(game.state.state.systems.story?.beat).toBe('k3_2');
    game.tick();
    expect(game.state.state.systems.story?.beat).toBe('k3_2');
  });

  it('closes Pacht after the authored line, horn and shift, and repairs a stale deadline on reload', async () => {
    const initial = createInitialState();
    const pacht = 'q.k4.pacht';
    initial.era = '1796';
    initial.systems.story = { ...createStorySlice(), active: true, chapter: 'k4', beat: 'k4_8' };
    initial.systems.quests = { ...createQuestSlice(), tracked: [pacht], quests: {
      [pacht]: { state: 'active', counts: {}, t: 0 },
      'q.k4.standpunkt': { state: 'active', counts: { brunnen: 1, echo: 1 }, t: 0 },
    } };
    const game = await boot(initial, true);
    quests.init(game.ctx);
    game.start();
    const cues: string[] = [];
    game.events.on('dialogue:say', ({ id }) => { if (id === 'laub.k4.gestaendnis_2') cues.push('line'); });
    game.ctx.ui.hud.subtitle = () => { cues.push('horn'); return noop; };
    game.events.on('shift:request', ({ to }) => {
      cues.push('shift');
      game.events.emit('shift:begin', { from: '1796', to });
    });
    game.events.on('quest:failed', ({ id }) => { if (id === pacht) cues.push(game.era.current); });
    const status = () => game.state.state.systems.quests?.quests[pacht]?.state;
    game.tick();
    expect(game.state.state.systems.story?.beat).toBe('k4_9');
    expect(status()).toBe('active');
    game.save.save('stale');
    for (let i = 0; i < 60; i++) game.tick(0.5);
    expect(cues).toEqual(['line', 'horn', 'shift']);
    expect(status()).toBe('active');
    game.era.set('today');
    game.events.emit('shift:done', { from: '1796', to: 'today', reason: 'oblivion' });
    game.tick();
    expect(cues).toEqual(['line', 'horn', 'shift', 'today']);
    expect(status()).toBe('failed');
    expect(game.save.load('stale')).toBe(true);
    expect(status()).toBe('failed');
    expect(game.state.state.systems.quests?.tracked).not.toContain(pacht);
  });
});
