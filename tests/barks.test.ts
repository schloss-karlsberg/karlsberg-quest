import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DialogueLine } from '../src/content/types';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import type { KqHooks } from '../src/debug/hooks';
import barks from '../src/systems/barks';
import { CALLOUT_COOLDOWN, GLOBAL_GAP, REQUEST_TTL } from '../src/systems/barks/rules';
import { createStorySlice } from '../src/systems/story/engine';

const WAIT = 'imhoff.bark.wait';
const CALLOUT = 'imhoff.bark.hier';
const SECOND_CALLOUT = 'other.bark.hier';

function harness() {
  const kq: Pick<KqHooks, 'barks'> = {};
  vi.stubGlobal('window', { kq, addEventListener() {}, removeEventListener() {} });
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const story = Object.assign(createStorySlice(), { active: true, chapter: 'tour', beat: 't13' });
  state.mutable.systems.story = story;
  const dialogue: DialogueLine[] = [
    ...[WAIT, CALLOUT, CALLOUT, SECOND_CALLOUT].map((id, i) => ({
      id: `${id}.0${i + 1}`, speaker: 'imhoff', text_de: 'Ruf', trigger: { event: 'walk:bark', id },
    })),
    { id: 'marlene.gen.01', speaker: 'marlene', text_de: 'Funk', trigger: { event: 'hub:enter' } },
    { id: 'laub.bark.fire.01', speaker: 'laub', text_de: 'Feuer', trigger: { event: 'bark:enter-fire' } },
  ];
  const modals = { count: 0 };
  const ctx = {
    params: new URLSearchParams(),
    events,
    state,
    content: { packs: [], dialogueFor: (name: string) => dialogue.filter((line) => line.trigger.event === name) },
    player: { position: { x: 0, z: 0 }, yaw: 0, pitch: 0 },
    era: { current: 'today' },
    ui: { modals },
    systems: { get: () => true },
  } as unknown as GameContext;
  const spoken: string[] = [];
  events.on('dialogue:say', ({ id }) => { if (id) spoken.push(id); });
  barks.init(ctx);
  barks.frame();
  const tick = (dt = 0.01) => barks.update(dt);
  const walk = (id: string) => events.emit('walk:bark', { npc: 'imhoff', id });
  return { events, story, spoken, tick, walk, modals, hooks: kq.barks!, flags: state.mutable.flags };
}

afterEach(() => {
  barks.dispose();
  vi.unstubAllGlobals();
});

describe('tour barks', () => {
  it('lets a call-out through the global gap and enforces a cooldown across variants', () => {
    const h = harness();
    h.walk(WAIT);
    h.tick();
    h.tick(3);
    h.walk(CALLOUT);
    h.tick();
    expect(h.spoken).toEqual([WAIT + '.01', expect.stringContaining(CALLOUT)]);
    h.tick(3);
    h.walk(CALLOUT);
    h.tick();
    expect(h.spoken).toHaveLength(2);
    h.tick(CALLOUT_COOLDOWN - 3);
    h.walk(CALLOUT);
    h.tick();
    expect(h.spoken).toHaveLength(3);
    expect(h.spoken[2]).toContain(CALLOUT);
  });

  it('keeps a call-out ahead of a newer wait bark while respecting modal silence', () => {
    const h = harness();
    h.modals.count = 1;
    h.walk(CALLOUT);
    h.walk(WAIT);
    h.tick();
    expect(h.spoken).toEqual([]);
    h.modals.count = 0;
    h.tick();
    expect(h.spoken).toEqual([expect.stringContaining(CALLOUT)]);
  });

  it('takes the newest eligible request within call-outs and within ordinary barks', () => {
    const h = harness();
    h.modals.count = 1;
    h.walk(CALLOUT);
    h.walk(SECOND_CALLOUT);
    h.walk(WAIT);
    h.events.emit('hub:enter', {});
    h.modals.count = 0;
    h.tick();
    h.tick(3);
    expect(h.spoken).toEqual([expect.stringContaining(SECOND_CALLOUT), expect.stringContaining(CALLOUT)]);
    h.hooks.advance(GLOBAL_GAP);
    h.tick();
    expect(h.spoken[2]).toBe('marlene.gen.01');
  });

  it('expires an ordinary request during cooldown without checking for a quiet moment', () => {
    const h = harness();
    h.walk(WAIT);
    h.tick();
    const quietCheck = vi.fn(() => false);
    Object.defineProperty(h.flags, 'barks.quiet', { get: quietCheck });
    h.events.emit('bark:enter-fire', {});
    for (let i = 0; i < 60; i++) h.tick(1 / 60);
    expect(quietCheck).not.toHaveBeenCalled();
    expect(h.hooks.state().pending).toEqual(['bark:enter-fire']);
    h.tick(REQUEST_TTL);
    expect(h.hooks.state().pending).toEqual([]);
    h.tick(GLOBAL_GAP);
    expect(h.spoken).toEqual([WAIT + '.01']);
  });

  it('drops queued and incoming Marlene radio at the tour spring and restores it after the tour', () => {
    const h = harness();
    h.events.emit('hub:enter', {});
    h.story.beat = 't14';
    h.tick();
    for (const beat of ['t15', 't16', 't17', 't18']) {
      h.story.beat = beat;
      h.events.emit('hub:enter', {});
      h.tick();
    }
    expect(h.spoken).toEqual([]);
    h.story.chapter = 'k1';
    h.tick();
    expect(h.spoken).toEqual([]);
    h.events.emit('hub:enter', {});
    h.tick();
    expect(h.spoken).toEqual(['marlene.gen.01']);
  });
});
