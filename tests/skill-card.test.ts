import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import { SETTLE, UnlockCards } from '../src/systems/skills/card';
import skills from '../src/systems/skills/index';
import { CardDirector, captionCoversCard } from '../src/ui/cards';

class CardElement {
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    contains: (name: string) => this.classes.has(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name),
  };
  child?: CardElement;
  parent?: CardElement;
  readonly style = {};

  append(child: CardElement): void {
    this.child = child;
    child.parent = this;
  }

  remove(): void {
    if (this.parent?.child === this) this.parent.child = undefined;
  }
}

vi.mock('../src/ui/dom', () => ({
  h: () => new CardElement(),
  svg: () => null,
}));
vi.mock('../src/systems/skills/settings', () => ({ installSettings: () => {} }));
vi.mock('../src/systems/skills/audio', () => ({ stampChime: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

function setup(): UnlockCards {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
  return new UnlockCards(new CardElement() as unknown as HTMLElement);
}

describe('standalone skill card dismissal', () => {
  it('leaves a queued card intact and gives a visible card its full shortened fade', () => {
    const cards = setup();
    const first = { skill: 'relief', level: 2 } as const;
    cards.onStamp = vi.fn();
    cards.push(first);
    cards.dismiss();
    cards.frame(SETTLE, false, false);
    cards.frame(0, false, false); // settled: the card comes up on the next frame
    expect(cards.showing).toEqual(first);

    const next = { skill: 'kartograf', level: 3 } as const;
    cards.push(next);
    cards.dismiss();
    cards.frame(0, false, false);
    const el = (cards.root as unknown as CardElement).child!;
    expect(el.classes.has('kqk-out')).toBe(true);
    expect(cards.showing).toEqual(first);
    cards.frame(0.2, false, false);
    cards.dismiss();
    cards.frame(0.41, false, false);
    expect(cards.showing).toBeNull();
    expect(cards.onStamp).not.toHaveBeenCalled();
    cards.frame(SETTLE, false, false);
    cards.frame(0, false, false);
    expect(cards.showing).toEqual(next);
  });

  it('dismisses a grouped card in reduced motion within the same fade window', () => {
    const cards = setup();
    cards.onStamp = vi.fn();
    cards.onRemark = vi.fn();
    cards.push({ skill: 'relief', level: 2 });
    cards.push({ skill: 'kartograf', level: 3 });
    cards.frame(SETTLE, true, false);
    cards.frame(0, true, false);
    cards.frame(1.2, true, false);
    expect(cards.onStamp).toHaveBeenCalledTimes(2);
    expect(cards.onRemark).toHaveBeenCalledTimes(2);
    cards.dismiss();
    cards.frame(UnlockCards.FADE + 0.01, true, false);
    expect(cards.busy).toBe(false);
    expect(cards.onStamp).toHaveBeenCalledTimes(2);
    expect(cards.onRemark).toHaveBeenCalledTimes(2);
  });
});

describe('skill notices on short touch layouts', () => {
  it('defers the unlock during a long stick hold, pauses it on another hold and reuses dismissal', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
    vi.stubGlobal('window', { innerHeight: 375 });
    const layer = new CardElement();
    const director = new CardDirector({ inAction: false, showToast: vi.fn(), holdToast: vi.fn(), closeToast: vi.fn() }, { count: 0 });
    const claim = vi.spyOn(director, 'claim');
    const input = { touchMode: true, touchStickActive: true };
    const state = new GameStateStore(createInitialState());
    const events = new EventBus();
    const remark = vi.fn();
    events.on('dialogue:say', remark);
    const ctx = {
      input, state, events,
      ui: { layer: () => layer, cards: director },
      settings: { state: { reducedMotion: true } },
      pause: { paused: false, reasons: new Set() },
      t: (key: string) => `translated ${key}`,
    } as unknown as GameContext;
    const advance = (frames: number) => {
      for (let i = 0; i < frames; i++) skills.update(0.1, ctx);
    };

    skills.init(ctx);
    try {
      state.update((st) => { st.skills = { relief: 2, kartograf: 3 }; }, 'skill');
      const queue = layer.child!;
      advance(100);
      expect(queue.child).toBeUndefined();
      expect(claim).not.toHaveBeenCalled();

      input.touchStickActive = false;
      advance(2);
      const card = queue.child!;
      expect(card.classes).toContain('kqk-in');
      expect(director.showing).toBe('skill');

      input.touchStickActive = true;
      advance(100);
      expect(queue.child).toBe(card);
      expect(card.classes).toContain('kqk-held');
      expect(remark).not.toHaveBeenCalled();

      input.touchStickActive = false;
      advance(2);
      expect(card.classes).not.toContain('kqk-held');
      const dismiss = claim.mock.calls[0]?.[1];
      expect(dismiss).toBeTypeOf('function');
      expect(claim.mock.calls.length).toBeGreaterThan(1);
      for (const [, callback] of claim.mock.calls) expect(callback).toBe(dismiss);

      expect(director.dismissNotice()).toBe(true);
      advance(1);
      expect(card.classes).toContain('kqk-out');
      expect(director.dismissNotice()).toBe(true);
      advance(8);
      expect(queue.child).toBeUndefined();
      expect(remark.mock.calls.map(([line]) => line.id)).toEqual(['laub.skill.relief.2', 'laub.skill.kartograf.3']);
    } finally {
      skills.dispose();
    }
  });
});

describe('sound captions on short touch layouts (TASK-074)', () => {
  it('holds a card back only on a short touch layout while a caption is up', () => {
    expect(captionCoversCard(true, 375, 1)).toBe(true);
    expect(captionCoversCard(true, 375, 0)).toBe(false);
    expect(captionCoversCard(false, 375, 2)).toBe(false); // desktop / mouse
    expect(captionCoversCard(true, 820, 1)).toBe(false); // tablet / portrait: the card has room
  });

  it('steps the skill card aside while a caption shares the band and brings it back after', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
    vi.stubGlobal('window', { innerHeight: 375 });
    const layer = new CardElement();
    const director = new CardDirector({ inAction: false, showToast: vi.fn(), holdToast: vi.fn(), closeToast: vi.fn() }, { count: 0 });
    const hud = { captionLines: 0 };
    const state = new GameStateStore(createInitialState());
    const ctx = {
      input: { touchMode: true, touchStickActive: false }, state, events: new EventBus(),
      ui: { layer: () => layer, cards: director, hud },
      settings: { state: { reducedMotion: true } },
      pause: { paused: false, reasons: new Set() },
      t: (key: string) => key,
    } as unknown as GameContext;
    const advance = (frames: number) => {
      for (let i = 0; i < frames; i++) skills.update(0.1, ctx);
    };
    skills.init(ctx);
    try {
      state.update((st) => { st.skills = { relief: 2 }; }, 'skill');
      advance(8);
      const card = layer.child!.child!;
      expect(card.classes).toContain('kqk-in');
      expect(card.classes).not.toContain('kqk-held');

      hud.captionLines = 1;
      advance(100); // longer than the card's own time: its clock stops while held
      expect(layer.child!.child).toBe(card);
      expect(card.classes).toContain('kqk-held');

      hud.captionLines = 0;
      advance(1);
      expect(card.classes).not.toContain('kqk-held');
    } finally {
      skills.dispose();
    }
  });
});
