import { afterEach, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/audio/audio';
import { ContentDB } from '../src/content/db';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import { seededRng } from '../src/systems/barks/rules';
import story, { type StoryHooks } from '../src/systems/story';
import { VoiceClips } from '../src/systems/story/dialogue/voiceClips';
import { Context, duckGain } from './audio-fixture';

class Element extends EventTarget {
  children: Element[] = [];
  className = '';
  textContent = '';
  style = {};
  dataset = {};
  content = { firstElementChild: this };
  readonly classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    add: (...names: string[]) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' '); },
    remove: (...names: string[]) => { this.className = this.className.split(' ').filter((name) => !names.includes(name)).join(' '); },
    toggle: (name: string, on: boolean) => { if (on) this.classList.add(name); else this.classList.remove(name); },
  };
  append(...nodes: Element[]) { this.children.push(...nodes); }
  prepend(...nodes: Element[]) { this.children.unshift(...nodes); }
  appendChild(node: Element) { this.append(node); }
  replaceChildren(...nodes: (Element | string)[]) {
    this.children = nodes.map((node) => typeof node === 'string' ? Object.assign(new Element(), { textContent: node }) : node);
  }
  setAttribute() {}
  querySelector(selector: string): Element | null {
    const name = selector.slice(1);
    for (const child of this.children) {
      if (child.classList.contains(name)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

const recording = { id: 'test.recorded', entry: { files: { legacy: 'line.mp3' }, textHash: '' }, buffer: { duration: 4 } as AudioBuffer, seconds: 4 };

async function setupStoryVoice() {
  const kq: { story?: StoryHooks } = {};
  vi.stubGlobal('window', Object.assign(new EventTarget(), { kq, AudioContext: Context, setInterval: vi.fn() }));
  vi.stubGlobal('Node', Element);
  const createElement = () => new Element();
  vi.stubGlobal('document', { createElement, createTextNode: createElement, body: createElement(), querySelector: () => null });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T00:00:00Z'));
  vi.spyOn(Math, 'random').mockImplementation(seededRng(54));
  vi.spyOn(VoiceClips.prototype, 'init').mockImplementation(() => {});
  const preload = vi.spyOn(VoiceClips.prototype, 'preload').mockImplementation(() => {});
  const take = vi.spyOn(VoiceClips.prototype, 'take').mockImplementation((id) => id === recording.id ? recording : null);
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const save = new SaveManager(state, new MemoryStorage(), events, () => 0);
  const audio = new AudioManager();
  audio.unlock();
  const layer = createElement();
  const era: { current: Era } = { current: 'today' };
  const pause = { paused: false };
  const settings = { state: { reducedMotion: false, subtitles: false } };
  const input = { wasPressed: () => false, isDown: () => false, touchMode: false };
  const ctx = { events, state, save, audio, settings, pause, era, input, params: new URLSearchParams(),
    systems: new Map(), content: new ContentDB([]), assets: { licences: async () => null }, loop: { manual: false },
    world: { applyLook: vi.fn() }, player: { position: { x: 0, z: 0 }, yaw: 0, stats: {} },
    ui: { layer: () => layer, modals: { count: 0 }, cards: { hold: vi.fn(), soft: vi.fn() },
      hud: { el: createElement(), stack: vi.fn(), setMarker: vi.fn(), acting: () => false } } } as unknown as GameContext;
  await story.init(ctx);
  const frame = () => story.frame(0);
  frame();
  events.emit('game:start', { resumed: false });
  return { events, audio, era, pause, settings, input, save, frame, take, preload,
    ac: audio.ctx as unknown as Context, hooks: kq.story!, dialogue: layer.querySelector('.kqs-dlg')!,
    step: (dt: number) => story.update(dt) };
}

afterEach(() => {
  story.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('paces the subtitle to a recording and pauses the same clip across a menu and era change', async () => {
  const { events, pause, era, audio, ac, dialogue, step, frame, hooks, preload, take } = await setupStoryVoice();
  const text = 'Willkommen an der Quelle.';
  hooks.say('imhoff', text, recording.id);
  expect(preload).toHaveBeenCalledWith([{ id: recording.id, text: [text, text], speaker: 'imhoff' }]);
  expect(take).toHaveBeenCalledWith(recording.id, [text, text], 'imhoff');
  expect(dialogue.classList.contains('kqs-show')).toBe(true);
  expect(hooks.voice.stats()).toMatchObject({ lastClip: recording.id, playing: true, murmured: 0 });
  step(1);
  expect(dialogue.querySelector('.kqs-typed')?.textContent).toBe(text.slice(0, Math.floor(text.length / 4)));
  const shift = { from: 'today', to: '1789' } as const;
  events.emit('shift:begin', shift);
  era.current = shift.to;
  events.emit('era:change', shift);
  events.emit('shift:done', shift);
  expect(dialogue.querySelector('.kqs-typed')?.textContent).toBe(text.slice(0, Math.floor(text.length / 4)));
  expect(hooks.voice.stats().playing).toBe(true);
  expect(ac.sources).toHaveLength(1);

  ac.currentTime = 2;
  pause.paused = true;
  frame();
  expect(ac.sources[0]?.stop).toHaveBeenLastCalledWith(2);
  expect(hooks.voice.stats().playing).toBe(false);
  expect(duckGain(audio, 'music')).toBe(1);
  ac.currentTime = 8;
  pause.paused = false;
  frame();
  expect(ac.sources[1]?.start).toHaveBeenCalledWith(8, 1);
  expect(duckGain(audio, 'music')).toBe(0.5);
  ac.sources[1]?.end();
  step(0.1);
  expect(dialogue.querySelector('.kqs-typed')?.textContent).toBe(text);
  expect(duckGain(audio, 'music')).toBe(1);
});

it('shows missing-clip dialogue with a murmur even with sound captions disabled', async () => {
  const { hooks, input, audio, ac, dialogue, step, take } = await setupStoryVoice();
  input.touchMode = true;
  hooks.say('imhoff', 'Hallo!', 'test.missing');
  step(0.12);
  expect(take).toHaveBeenCalledWith('test.missing', ['Hallo!', 'Hallo!'], 'imhoff');
  expect(hooks.voice.stats()).toMatchObject({ clips: 0, murmured: 1, playing: false });
  expect(dialogue.classList.contains('kqs-show')).toBe(true);
  expect(dialogue.querySelector('.kqs-typed')?.textContent).toBe('Hallo');
  expect(dialogue.querySelector('.kqs-rest')?.textContent).toBe('!');
  expect(dialogue.querySelector('.kqs-skip')?.children[0]?.textContent).toBe('Tippen: weiter');
  expect(ac.sources).toHaveLength(1);
  expect(duckGain(audio, 'ambience')).toBe(0.38);
  dialogue.dispatchEvent(new Event('mousedown'));
  expect(dialogue.querySelector('.kqs-typed')?.textContent).toBe('Hallo!');
  ac.sources[0]?.end();
  expect(duckGain(audio, 'ambience')).toBe(1);
});

it('shows the complete subtitle immediately in reduced motion and keeps it up until the recording ends', async () => {
  const { settings, events, audio, hooks, dialogue, ac, step } = await setupStoryVoice();
  settings.state.reducedMotion = true;
  events.emit('dialogue:say', { speaker: 'imhoff', id: recording.id, text: 'Willkommen!', ms: 0 });
  expect(dialogue.querySelector('.kqs-typed')?.textContent).toBe('Willkommen!');
  step(0.5);
  expect(hooks.state().dialogue?.id).toBe(recording.id);
  expect(duckGain(audio, 'ambience')).toBe(0.38);
  ac.sources[0]?.end();
  step(0.1);
  expect(hooks.state().dialogue).toBeNull();
  expect(duckGain(audio, 'ambience')).toBe(1);
});

it('stops a recorded line and removes both active and queued subtitles when loading an inactive story', async () => {
  const { save, hooks, audio, ac, dialogue, step } = await setupStoryVoice();
  expect(save.save('inactive')).toBe(true);
  hooks.say('imhoff', 'Willkommen!', recording.id);
  hooks.say('imhoff', 'Hier entlang.', 'test.queued');
  expect(hooks.state()).toMatchObject({ dialogue: { id: recording.id }, pendingLines: 1 });
  expect(duckGain(audio, 'ambience')).toBe(0.38);
  ac.currentTime = 2;

  expect(save.load('inactive')).toBe(true);
  expect(hooks.state()).toMatchObject({ dialogue: null, pendingLines: 0 });
  expect(dialogue.classList.contains('kqs-show')).toBe(false);
  expect(ac.sources[0]?.stop).toHaveBeenLastCalledWith(2.04);
  expect(duckGain(audio, 'ambience')).toBe(1);
  step(5);
  expect(hooks.shown()).toEqual([recording.id]);
});

it.todo('Choose whether a recorded era-specific warning already on screen should finish speaking after a shift or cut with its expired subtitle.');
it.todo('Choose the murmur cadence for reduced motion, where fallback subtitles render all at once.');
