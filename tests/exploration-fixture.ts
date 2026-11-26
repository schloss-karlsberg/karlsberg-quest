import { vi } from 'vitest';
import { ERA_INFO, type Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import { Rng } from '../src/systems/hunt/rng';

/** Slot loads restore the world era before feature listeners run, as in boot. */
export function explorationSession() {
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const save = new SaveManager(state, new MemoryStorage(), events, () => 100_000);
  const random = new Rng(58);
  vi.spyOn(Math, 'random').mockImplementation(() => random.next());
  const era = {
    current: state.state.era,
    get info() { return ERA_INFO[this.current]; },
    set(to: Era) {
      const from = this.current;
      this.current = state.mutable.era = to;
      if (to !== from) events.emit('era:change', { from, to });
    },
  };
  events.on('save:loaded', () => era.set(state.state.era));
  vi.stubGlobal('window', {
    kq: {}, innerHeight: 720, setTimeout, clearTimeout,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval: vi.fn(),
  });
  class Element {
    private classes = new Set<string>();
    style = {};
    dataset = {};
    classList = {
      add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
      contains: (name: string) => this.classes.has(name),
      toggle: vi.fn(),
    };
    setAttribute = vi.fn();
    append = vi.fn();
    appendChild = vi.fn();
    prepend = vi.fn();
    replaceChildren = vi.fn();
    remove = vi.fn();
    addEventListener = vi.fn();
  }
  vi.stubGlobal('Node', Element);
  const element = () => new Element();
  vi.stubGlobal('document', {
    createElement: element, createTextNode: element, getElementById: () => null, querySelector: () => null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    head: { append: vi.fn(), querySelector: () => null },
  });
  return { events, state, save, era, element };
}
