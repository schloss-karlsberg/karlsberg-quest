import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { ERA_INFO } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager, SettingsStore } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore } from '../src/core/state';
import { enemyDef } from '../src/rpg/enemies';
import { LEVEL_XP } from '../src/rpg/stats';
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
  private readonly children: ElementStub[] = [];

  constructor(private text = '') { super(); }

  get textContent(): string { return this.text + this.children.map((el) => el.textContent).join(''); }
  set textContent(text: string) { this.text = text; }

  append() {}
  appendChild(el: ElementStub) { this.children.push(el); }
  replaceChildren() {}
  remove() {}
  querySelector() { return null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
}

function setup(configure: (state: ReturnType<typeof createInitialState>) => void) {
  vi.useFakeTimers();
  const elements: ElementStub[] = [];
  vi.stubGlobal('Node', ElementStub);
  vi.stubGlobal('window', { kq: {} });
  vi.stubGlobal('document', {
    createElement: () => {
      const el = new ElementStub();
      elements.push(el);
      return el;
    },
    createTextNode: (text: string) => new ElementStub(text),
    getElementById: () => null,
    querySelector: () => null,
    head: new ElementStub(), body: new ElementStub(),
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
  const save = new SaveManager(state, storage, events, () => now, () => now);
  const writes: string[] = [];
  events.on('save:written', ({ reason }) => writes.push(reason));
  let quickPressed = false;
  let attackPressed = false;
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
    loop: { tick: 0, time: 0 }, era: { current: 'today', info: ERA_INFO.today }, camera: new PerspectiveCamera(),
    world: {
      heightAt: () => 0, heightfield: { slopeDeg: () => 0 },
      heightfields: { '2025': { heightAt: () => 0 }, '1789': { slopeDeg: () => 0 } },
      collider: { footprintAt: () => -1 }, surfaceAt: () => 'grass',
      look: { disc: 'sun', sky: { stars: 0 }, sun: { elevation: 45 } },
    },
    player: { position: new Vector3(), yaw: 0, stance: 'stand', flying: true, stats: { lanternLit: false, speed: 0 }, impulse() {} },
    input: { enabled: true, touchMode: false, isDown: () => false, wasPressed: (action: string) => (action === 'quickUse' && quickPressed) || (action === 'attack' && attackPressed) },
    audio: { ctx: null, unlocked: false, bus: () => null, noise: () => null },
    ui: { modals, layer: () => new ElementStub(), hud: { el: new ElementStub(), dock() {}, busy() {} }, cards: { source() {}, release() {} }, toast() {} },
    quality: { level: 'low', listeners: [] }, renderer: { domElement: new ElementStub() },
    t: (key: string) => key,
  } as unknown as GameContext;

  progression.init(ctx);
  hunt.init(ctx);
  combat.init(ctx);
  events.emit('game:start', { resumed: true });
  combat.update(0); // Install the combat debug hooks without advancing game time.

  return {
    ctx, state, events, save, storage, writes, elements, combatSim: window.kq!.combat!.sim()!,
    advance: (ms: number) => { now += ms; },
    attack() {
      attackPressed = true;
      combat.update(1 / 60);
      attackPressed = false;
      for (let i = 0; i < 27; i++) combat.update(1 / 60);
    },
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
  it('saves the new full HP when cache XP raises the player to level 2', () => {
    const level2Xp = LEVEL_XP[1]!;
    const t = setup((state) => {
      state.systems.progression!.xp = level2Xp - poiXp('cache', 1);
      state.systems.combat!.hp = 100;
    });
    travel.init(t.ctx);
    const cache = generatePois().find((poi) => poi.kind === 'cache')!;
    const player = t.combatSim.p;
    expect(player).toMatchObject({ hp: 100, max: 100 });

    t.events.emit('enemy:cleared', { group: cache.id, kind: cache.enemy! });

    expect(player).toMatchObject({ hp: 112, max: 112 });
    const saved = t.save.peek()!;
    expect(saved.systems.progression).toMatchObject({ level: 2, xp: level2Xp });
    expect(saved.systems.combat?.hp).toBe(112);
    expect(t.writes).toEqual(['poi']);
    expect(t.save.load()).toBe(true);
    expect(player).toMatchObject({ hp: 112, max: 112 });
  });

  it.each(['idle', 'recent', 'cinematic', 'failed write'])('checkpoints the last guard and two-supply payout together with %s autosaves', (timing) => {
    const t = setup((state) => { state.systems.progression!.equipped.weapon = 'item.stab.esche'; });
    travel.init(t.ctx);
    const cache = generatePois().find((poi) => poi.kind === 'cache' && poi.era === 'today' && poi.chapter === 'prolog' && cacheLoot(poi.id).length === 2)!;
    const items = cacheLoot(cache.id);
    const ids = items.map((_item, i) => `${cache.id}.${i}`);
    const xp = poiXp('cache', 1) + enemyDef(cache.enemy!)!.xp;
    const grant = vi.fn();
    t.events.on('xp:grant', grant);

    const { player } = t.ctx;
    player.flying = false;
    player.position.set(cache.x, 0, cache.z);
    travel.update(1 / 60, t.ctx);
    const group = t.combatSim.groups[cache.id]!;
    group.killed = group.count - 1;
    combat.update(1 / 60);
    const guard = t.combatSim.live().find((e) => e.group === cache.id)!;
    guard.hp = 1;
    guard.reformed = true; // A reformer has used its one reform, so this hit finishes the fight.
    player.position.set(guard.x, 0, guard.z + 1.8);

    expect(t.save.autosave('before-clear')).toBe(true);
    const before = t.storage.getItem(SAVE_KEY('auto'));
    t.advance(timing === 'idle' || timing === 'failed write' ? t.save.minIntervalMs : 1);
    if (timing === 'cinematic') t.save.hold('cinematic', true);
    const writes = vi.spyOn(t.storage, 'setItem');
    if (timing === 'failed write') {
      // Let a partial write succeed so it would survive a failed final checkpoint.
      writes.mockImplementation((key, raw) => {
        if (deserializeState(raw).systems.travel?.done.includes(cache.id)) throw new Error('storage is full');
        MemoryStorage.prototype.setItem.call(t.storage, key, raw);
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    }

    t.attack();
    expect(group.killed).toBe(group.count);
    if (timing === 'cinematic') {
      expect(t.save.held).toBe(true);
      expect(t.storage.getItem(SAVE_KEY('auto'))).toBe(before);
      expect(writes).not.toHaveBeenCalled();
      t.save.hold('cinematic', false);
    }
    expect(writes).toHaveBeenCalledTimes(1);
    const saved = deserializeState(writes.mock.calls[0]![1]);
    expect(saved.systems.combat?.groups[cache.id]?.killed).toBe(group.count);
    expect(saved.systems.travel?.done).toEqual([cache.id]);
    expect(Object.keys(saved.systems.progression?.placed ?? {}).filter((id) => id.startsWith(`${cache.id}.`))).toEqual(ids);
    expect(saved.systems.progression?.xp).toBe(xp);

    if (timing === 'failed write') {
      expect(t.storage.getItem(SAVE_KEY('auto'))).toBe(before);
      expect(t.save.load()).toBe(true);
      expect(t.combatSim.groups[cache.id]?.killed).toBe(group.count - 1);
      expect(t.state.state.systems.travel?.done).not.toContain(cache.id);
      return;
    }
    const slot = t.storage.getItem(SAVE_KEY('auto'));

    const clear = () => t.events.emit('enemy:cleared', { group: cache.id, kind: cache.enemy! });
    clear();
    expect(t.save.load()).toBe(true);
    clear();
    const prog = t.state.state.systems.progression!;
    expect(t.state.state.systems.travel?.done).toEqual([cache.id]);
    expect(ids.map((id) => prog.placed![id]?.item)).toEqual(items);
    expect(prog.xp).toBe(xp);
    expect(grant.mock.calls.filter(([event]) => event.reason === 'poi')).toHaveLength(1);
    expect(t.storage.getItem(SAVE_KEY('auto'))).toBe(slot);
    expect(t.writes).toEqual(['before-clear', 'poi']);
  });
});

it('restarts Bannlicht recharge after loading two of three charges', () => {
  const t = setup((state) => {
    state.systems.progression!.talents['laterne.weit'] = 1;
    state.systems.progression!.talents['laterne.kreis'] = 1;
    state.systems.combat!.bann = 2;
  });
  const { p, opt } = t.combatSim;
  expect(p).toMatchObject({ bann: 2, bannMax: 3 });
  expect(t.save.autosave('before-fight')).toBe(true);
  p.bann = 1;
  p.bannT = opt.stats.bannRecharge - 1 / 120;

  expect(t.save.load()).toBe(true);
  combat.update(1 / 60);
  expect(p.bann).toBe(2);
  expect(p.bannT).toBeCloseTo(1 / 60);
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

  it('uses Kalkstaub in combat and keeps its consumption on the regular autosave interval', () => {
    const t = setup((state) => {
      state.systems.progression!.inventory['item.kalkstaub'] = 2;
      state.systems.progression!.quick = 'item.kalkstaub';
    });
    const group = window.kq!.combat!.spawn('nebelling', { dist: 3 });
    const enemy = t.combatSim.live().find((e) => e.group === group)!;
    expect(enemy.stun).toBe(0);
    expect(t.save.autosave('before-use')).toBe(true);
    t.advance(1);

    t.quickUse();
    expect(enemy.stun).toBeGreaterThan(0);
    expect(t.state.state.systems.progression?.inventory['item.kalkstaub']).toBe(1);
    expect(t.writes).toEqual(['before-use']);
    expect(t.save.load()).toBe(true);
    expect(t.state.state.systems.progression?.inventory['item.kalkstaub']).toBe(2);

    t.advance(t.save.minIntervalMs);
    t.quickUse();
    expect(t.writes).toEqual(['before-use', 'progression-use']);
    expect(t.save.peek()?.systems.progression?.inventory['item.kalkstaub']).toBe(1);
  });

  it('restores saved Atem within the stamina cap on the next combat step', () => {
    const t = setup((state) => {
      const prog = state.systems.progression!;
      prog.inventory['item.riechsalz'] = 1;
      prog.quick = 'item.riechsalz';
    });
    t.quickUse();
    expect(t.save.peek()?.systems.combat?.stamina).toBe(100);
    const stamina = t.combatSim.p.st;
    stamina.stamina = 25;
    stamina.idle = 0;
    expect(t.save.load()).toBe(true);
    combat.update(1 / 60);
    expect(t.state.state.systems.combat?.stamina).toBe(100);
    expect(t.state.state.systems.progression?.inventory['item.riechsalz']).toBeUndefined();
  });

  it.each([[0, 0.5, 0], [0.2, 0.7, 0], [0.8, 1, 1]])('shows the half-tank refill and saves oil from %s to %s and Bannlicht within its cap', (oil, expected, bann) => {
    const t = setup((state) => {
      state.systems.progression!.inventory['item.lampenoel'] = 2;
      state.systems.hunt!.lantern!.oil = oil;
      state.systems.combat!.bann = bann;
    });
    t.useFromGear('item.lampenoel');
    const row = t.elements.findLast((el) => el.attributes.get('data-testid') === 'gear-supply-item.lampenoel');
    expect(row?.textContent).toContain('füllt 50 % des Tanks nach');
    expect(t.save.peek()?.systems.combat?.bann).toBe(2);
    t.combatSim.p.bann = 0;
    expect(t.save.load()).toBe(true);
    combat.update(1 / 60);
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

  it('refills low lantern oil when touching a Wegstein', () => {
    const t = setup((state) => { state.systems.hunt!.lantern!.oil = 0.2; });
    travel.init(t.ctx);
    const shrine = generatePois().find((poi) => poi.kind === 'shrine' && poi.era === 'today' && poi.chapter === 'prolog')!;
    const lantern = t.state.state.systems.hunt!.lantern!;
    expect(lantern).toMatchObject({ oil: 0.2, lit: false });

    t.ctx.player.flying = false;
    t.ctx.player.position.set(shrine.x, 0, shrine.z);
    travel.update(1 / 60, t.ctx);

    expect(lantern).toMatchObject({ oil: 1, lit: false });
    expect(t.combatSim.p.hp).toBe(100);
  });
});
