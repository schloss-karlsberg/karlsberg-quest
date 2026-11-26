import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { createInitialState, type GameState, GameStateStore } from '../src/core/state';
import skills from '../src/systems/skills';
import { CardDirector } from '../src/ui/cards';

const { element } = vi.hoisted(() => {
  interface TestElement {
    children: TestElement[];
    style: { pointerEvents?: string };
    classList: {
      add(name: string): void;
      remove(name: string): void;
      contains(name: string): boolean;
      toggle(name: string, on: boolean): void;
    };
    append(child: TestElement): void;
    remove(): void;
  }
  function element(): TestElement {
    const classes = new Set<string>();
    return {
      children: [],
      style: {},
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
        contains: (name: string) => classes.has(name),
        toggle: (name: string, on: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
        },
      },
      append(child) {
        this.children.push(child);
        child.remove = () => { this.children = this.children.filter((el) => el !== child); };
      },
      remove: () => {},
    };
  }
  return { element };
});
vi.mock('../src/ui/dom', () => ({ h: element, svg: element }));

function setupSkills() {
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const cards = new CardDirector({ inAction: false, showToast: vi.fn(), holdToast: vi.fn(), closeToast: vi.fn() }, { count: 0 });
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const autosave = vi.fn();
  const unlocked = vi.fn();
  const pause = { paused: false, reasons: new Set<string>() };
  const layer = element();
  const ctx = {
    audio: { ctx: null, bus: () => null },
    events, state, pause,
    ui: { cards, layer: () => layer },
    save: { autosave },
    settings: { state: { reducedMotion: true } },
    t: (key: string) => key,
  } as unknown as GameContext;
  events.on('skill:unlocked', unlocked);
  skills.init(ctx);
  return {
    cards, events, state, pause, autosave, unlocked,
    shown: () => layer.children[0]!.children.length,
    step(frames: number) {
      for (let i = 0; i < frames; i++) {
        cards.tick(0.1);
        skills.frame(0.1, ctx);
      }
    },
  };
}

afterEach(() => {
  skills.dispose();
  vi.unstubAllGlobals();
});

describe('survey skill grants and cards', () => {
  it('waits for the shared slot even on the frame the unlock settles', () => {
    const t = setupSkills();
    expect(t.cards.claim('reward')).toBe(true);
    t.events.emit('skill:grant', { skill: 'kartograf', level: 2 });
    t.step(5);
    expect(t.cards.showing).toBe('reward');
    expect(t.shown()).toBe(0);

    t.cards.release('reward');
    t.step(3);
    expect(t.shown()).toBe(0);
    t.step(1);
    expect(t.cards.showing).toBe('skill');
    expect(t.shown()).toBe(1);
  });

  it('keeps a visible unlock through pause and releases the slot when play resumes', () => {
    const t = setupSkills();
    t.events.emit('skill:grant', { skill: 'relief', level: 1 });
    t.step(6);
    expect(t.shown()).toBe(1);
    t.pause.paused = true;
    t.step(80);
    expect(t.cards.showing).toBe('skill');
    expect(t.shown()).toBe(1);
    t.pause.paused = false;
    t.step(70);
    expect(t.shown()).toBe(0);
    expect(t.cards.showing).toBeNull();
  });

  it('clears the active and queued unlocks on load and applies a higher saved tier silently', () => {
    const t = setupSkills();
    t.events.emit('skill:grant', { skill: 'relief', level: 2 });
    t.step(6);
    expect(t.shown()).toBe(1);
    t.events.emit('skill:grant', { skill: 'kartograf', level: 2 });
    expect(t.autosave.mock.calls).toEqual([['skill'], ['skill']]);
    expect(t.state.state.skills.relief).toBe(2);
    const saved = JSON.parse(t.state.toJSON()) as GameState;
    saved.skills.relief = 3;
    t.unlocked.mockClear();
    t.state.replace(saved, 'load');
    t.events.emit('save:loaded', { slot: 'test' });
    expect(t.state.state.skills.relief).toBe(3);
    t.step(10);
    expect(t.shown()).toBe(0);
    expect(t.cards.showing).toBeNull();
    expect(t.unlocked).not.toHaveBeenCalled();

    t.events.emit('skill:grant', { skill: 'kartograf', level: 1 });
    expect(t.state.state.skills).toEqual({ relief: 3, kartograf: 2 });
    t.events.emit('skill:grant', { skill: 'kartograf', level: 3 });
    expect(t.unlocked).toHaveBeenCalledExactlyOnceWith({ skill: 'kartograf', level: 3 });
    expect(t.state.state.skills).toEqual({ relief: 3, kartograf: 3 });
  });
});
