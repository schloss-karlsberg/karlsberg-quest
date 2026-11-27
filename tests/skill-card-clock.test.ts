import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { GameStateStore, createInitialState } from '../src/core/state';
import skills, { type SkillsHooks } from '../src/systems/skills';
import { LevelCards } from '../src/systems/progression/levelup-card';
import { CardDirector } from '../src/ui/cards';

vi.mock('../src/ui/dom', async (original) => ({
  ...await original<typeof import('../src/ui/dom')>(),
  h: () => ({ append: vi.fn(), remove: vi.fn(), classList: { add: vi.fn(), toggle: vi.fn(), contains: () => false } }),
  svg: vi.fn(),
}));

afterEach(() => {
  skills.dispose();
  vi.unstubAllGlobals();
});

it.each([true, false])('counts visible skill-card time only in fixed updates (manual=%s)', (manual) => {
  const events = new EventBus();
  const stamp = vi.fn();
  events.on('dialogue:say', stamp);
  const pause = { paused: false };
  const director = new CardDirector({ inAction: false, showToast: vi.fn(), closeToast: vi.fn(), holdToast: vi.fn() }, { count: 0 });
  const layer = { append: vi.fn(), classList: { remove: vi.fn() }, style: {} };
  const kq: { skills?: SkillsHooks } = {};
  vi.stubGlobal('window', { kq });
  // CSS entrance callbacks never run in this fixture.
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const ctx = {
    events, state: new GameStateStore(createInitialState()), loop: { manual }, pause, input: { touchMode: false, touchStickActive: false },
    ui: { cards: director, layer: () => layer }, settings: { state: { reducedMotion: manual } },
    audio: { bus: () => null }, t: () => 'Test', save: { autosave: vi.fn() },
  } as unknown as GameContext;
  skills.init(ctx);
  skills.frame(0, ctx);
  const card = kq.skills!;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) skills.update(1 / 60, ctx);
  };
  card.grant('relief', 2);
  expect(card.cardsBusy()).toBe(true);
  for (let i = 0; i < 100; i++) skills.frame(0.1, ctx);
  expect(card.card()).toBeNull();
  step(26);
  expect(card.card()).toBeNull();
  step(3);
  expect(card.card()).toEqual({ skill: 'relief', level: 2 });
  expect(director.showing).toBe('skill');

  director.hold('echo', true);
  step(600);
  director.hold('echo', false);
  pause.paused = true;
  step(600);
  pause.paused = false;
  for (let i = 0; i < 100; i++) skills.frame(0.1, ctx);
  expect(stamp).not.toHaveBeenCalled();

  step(70); // stamp at 1.15 s
  expect(stamp).toHaveBeenCalledTimes(1);
  step(300); // just before the 6.2 s expiry
  expect(card.card()).toEqual({ skill: 'relief', level: 2 });
  step(3);
  expect(card.card()).toBeNull();
  expect(director.showing).toBeNull();
  expect(card.cardsBusy()).toBe(false);
  expect(stamp).toHaveBeenCalledTimes(1);
});

it('preserves the level-card reading time and touch dismissal fade while stepped', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const cards = new LevelCards({ append: vi.fn() } as unknown as HTMLElement);
  cards.onStamp = vi.fn();
  cards.push(2, 1);
  cards.frame(0, true, false);
  cards.frame(6, true, true);
  expect(cards.onStamp).not.toHaveBeenCalled();
  cards.frame(0.91, true, false);
  expect(cards.onStamp).toHaveBeenCalledTimes(1);
  cards.frame(4.68, true, false);
  expect(cards.showing?.level).toBe(2);
  cards.frame(0.02, true, false);
  expect(cards.showing).toBeNull();

  cards.push(3, 2);
  cards.frame(0, true, false);
  cards.dismiss();
  cards.frame(0.59, true, false);
  expect(cards.showing?.level).toBe(3);
  cards.frame(0.02, true, false);
  expect(cards.showing).toBeNull();
  expect(cards.onStamp).toHaveBeenCalledTimes(1);
});
