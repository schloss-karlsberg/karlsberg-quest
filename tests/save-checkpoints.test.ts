import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager, SettingsStore } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import combat, { createCombatSlice } from '../src/systems/combat';
import hunt from '../src/systems/hunt';
import { newLantern } from '../src/systems/hunt/lanternLogic';
import progression, { createProgressionSlice } from '../src/systems/progression';
import travel from '../src/systems/travel';
import { cacheLoot, generatePois, poiXp } from '../src/systems/travel/pois';
import { openPausePage } from '../src/ui/pause-pages';

// Only the DOM shell is stubbed. The gear button uses the real page's click handler.
class ElementStub extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly dataset = {};
  readonly style = {};
  readonly classList = { add() {}, remove() {}, toggle() {} };
  readonly content = { firstElementChild: null };

  append() {}
  appendChild() {}
  replaceChildren() {}
  remove() {}
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
}

function setup(configure: (state: ReturnType<typeof createInitialState>) => void) {
  vi.useFakeTimers();
  const elements: ElementStub[] = [];
  vi.stubGlobal('Node', ElementStub);
  vi.stubGlobal('document', {
    createElement: () => {
      const el = new ElementStub();
      elements.push(el);
      return el;
    },
    createTextNode: () => new ElementStub(),
    getElementById: () => null,
    querySelector: () => null,
    head: new ElementStub(),
  });
  const initial = createInitialState();
  initial.systems.progression = createProgressionSlice();
  initial.systems.combat = { ...createCombatSlice(), hp: 20, stamina: 30, bann: 1 };
  initial.systems.hunt = { alert: 0, lantern: newLantern(), caught: 0 };
  configure(initial);

  const state = new GameStateStore(initial);
  const events = new EventBus();
  const storage = new MemoryStorage();
  let now = 0;
  const save = new SaveManager(state, storage, events, () => now);
  const writes: string[] = [];
  events.on('save:written', ({ reason }) => writes.push(reason));
  let quickPressed = false;
  const pause = { paused: false };
  const modals = {
    count: 0,
    open({ onClose }: { onClose: () => void }) {
      this.count++;
      pause.paused = true;
      return { el: new ElementStub(), close: () => {
        this.count--;
        pause.paused = false;
        onClose();
      } };
    },
  };
  const ctx = {
    state, events, save, pause,
    params: new URLSearchParams(), settings: new SettingsStore(storage), scene: new Scene(),
    loop: { tick: 0 }, era: { current: 'today' },
    world: {
      heightAt: () => 0, heightfields: { '1789': { slopeDeg: () => 0 } },
      collider: { footprintAt: () => -1 }, surfaceAt: () => 'grass',
    },
    player: { flying: true, stats: { lanternLit: false } },
    input: { touchMode: false, wasPressed: (action: string) => action === 'quickUse' && quickPressed },
    audio: { ctx: null, bus: () => null },
    ui: { modals, layer: () => new ElementStub(), hud: { dock() {} }, cards: { source() {} }, toast() {} },
    quality: { level: 'low', listeners: [] }, renderer: { domElement: new ElementStub() },
    t: (key: string) => key,
  } as unknown as GameContext;

  progression.init(ctx);
  hunt.init(ctx);
  combat.init(ctx);
  events.emit('game:start', { resumed: true });

  return {
    ctx, state, events, save, storage, writes,
    advance: (ms: number) => { now += ms; },
    useFromGear(item: string) {
      openPausePage(ctx.ui.modals, 'gear');
      expect(pause.paused).toBe(true);
      const button = elements.findLast((el) => el.attributes.get('data-testid') === `gear-use-${item}`);
      expect(button).toBeDefined();
      expect(button!.attributes.has('disabled')).toBe(false);
      button!.dispatchEvent(new Event('click'));
    },
    quickUse() {
      expect(pause.paused).toBe(false);
      quickPressed = true;
      progression.update(1 / 60);
      quickPressed = false;
    },
  };
}

afterEach(() => {
  travel.dispose();
  combat.dispose();
  hunt.dispose();
  progression.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('guarded cache checkpoints', () => {
  it.each(['idle', 'recent', 'cinematic'])('saves the entire two-supply payout with %s autosaves', (timing) => {
    const t = setup(() => {});
    travel.init(t.ctx);
    const cache = generatePois().find((poi) => poi.kind === 'cache' && cacheLoot(poi.id).length === 2)!;
    const items = cacheLoot(cache.id);
    const ids = items.map((_item, i) => `${cache.id}.${i}`);
    const xp = poiXp('cache', 1);
    const clear = () => t.events.emit('enemy:cleared', { group: cache.id, kind: cache.enemy! });
    const grant = vi.fn();
    t.events.on('xp:grant', grant);

    expect(t.save.autosave('before-clear')).toBe(true);
    const before = t.storage.getItem(SAVE_KEY('auto'));
    t.advance(timing === 'idle' ? t.save.minIntervalMs : 1);
    if (timing === 'cinematic') t.save.hold('cinematic', true);
    const payouts: unknown[] = [];
    t.events.on('save:written', () => {
      const saved = t.save.peek()!;
      payouts.push({ done: saved.systems.travel?.done, placed: Object.keys(saved.systems.progression?.placed ?? {}), xp: saved.systems.progression?.xp });
    });

    clear();
    if (timing === 'cinematic') {
      expect(t.save.held).toBe(true);
      expect(t.storage.getItem(SAVE_KEY('auto'))).toBe(before);
      expect(payouts).toEqual([]);
      t.save.hold('cinematic', false);
    }
    expect(payouts).toEqual([{ done: [cache.id], placed: ids, xp }]);
    const slot = t.storage.getItem(SAVE_KEY('auto'));

    clear();
    expect(t.save.load()).toBe(true);
    clear();
    const prog = t.state.state.systems.progression!;
    expect(t.state.state.systems.travel?.done).toEqual([cache.id]);
    expect(Object.values(prog.placed!).map(({ id, item }) => [id, item])).toEqual(ids.map((id, i) => [id, items[i]]));
    expect(prog.xp).toBe(xp);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(t.storage.getItem(SAVE_KEY('auto'))).toBe(slot);
    expect(t.writes).toEqual(['before-clear', 'poi']);
  });
});

describe('consumable checkpoints', () => {
  it.each(['gear', 'quick-use'])('saves Kräuterbalsam and 65 HP immediately via %s', (entry) => {
    const t = setup((state) => { state.systems.progression!.inventory['item.balsam'] = 2; });
    expect(t.save.autosave('before-use')).toBe(true);
    t.advance(1);

    if (entry === 'gear') t.useFromGear('item.balsam');
    else t.quickUse();

    expect(t.writes).toEqual(['before-use', 'progression-use']);
    expect(t.save.load()).toBe(true);
    expect(t.state.state.systems.combat?.hp).toBe(65);
    expect(t.state.state.systems.progression?.inventory['item.balsam']).toBe(1);
  });

  it('leaves the checkpoint untouched when the quick stack is empty', () => {
    const t = setup(() => {});
    const used = vi.fn();
    t.events.on('item:use', used);
    expect(t.save.autosave('before-use')).toBe(true);
    const slot = t.storage.getItem(SAVE_KEY('auto'));
    t.advance(t.save.minIntervalMs);
    t.quickUse();
    expect(used).not.toHaveBeenCalled();
    expect(t.storage.getItem(SAVE_KEY('auto'))).toBe(slot);
    expect(t.writes).toEqual(['before-use']);
  });

  it('saves restored Atem within the stamina cap', () => {
    const t = setup((state) => {
      const prog = state.systems.progression!;
      prog.inventory['item.riechsalz'] = 1;
      prog.quick = 'item.riechsalz';
    });
    t.quickUse();
    expect(t.save.load()).toBe(true);
    expect(t.state.state.systems.combat?.stamina).toBe(100);
    expect(t.state.state.systems.progression?.inventory['item.riechsalz']).toBeUndefined();
  });

  it.each([[0.2, 0.7, 0], [0.8, 1, 1]])('saves oil filled from %s to %s and Bannlicht within its cap', (oil, expected, bann) => {
    const t = setup((state) => {
      state.systems.progression!.inventory['item.lampenoel'] = 2;
      state.systems.hunt!.lantern!.oil = oil;
      state.systems.combat!.bann = bann;
    });
    t.useFromGear('item.lampenoel');
    expect(t.save.load()).toBe(true);
    expect(t.state.state.systems.combat?.bann).toBe(2);
    expect(t.state.state.systems.progression?.inventory['item.lampenoel']).toBe(1);
    expect(t.state.state.systems.hunt?.lantern?.oil).toBeCloseTo(expected);
    expect(t.state.state.systems.hunt?.lantern?.lit).toBe(true);
    expect(t.state.state.flags['lanternLit']).toBe(true);
  });

  it('still accepts a full lantern refill request and refills at home', () => {
    const t = setup((state) => { state.systems.hunt!.lantern!.oil = 0.2; });
    const lantern = t.state.mutable.systems.hunt!.lantern!;
    t.events.emit('lantern:request', { lit: true, refill: true });
    expect(lantern).toMatchObject({ oil: 1, lit: true });
    lantern.oil = 0.2;
    t.events.emit('hub:enter', {});
    expect(lantern.oil).toBe(1);
  });
});
