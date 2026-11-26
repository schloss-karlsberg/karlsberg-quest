import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import notes from '../src/systems/notes';
import { STUCK_SECONDS, Telemetry, createTelemetry, normaliseTelemetry } from '../src/systems/notes/logic';
import * as noteStore from '../src/systems/notes/store';
import { MemoryStore, openNoteStore } from '../src/systems/notes/store';
import story from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';
import type { StoryFile } from '../src/systems/story/types';
import { explorationSession } from './exploration-fixture';
import { initStory } from './story-session-fixture';

const situation = { x: 2, z: 7, era: '1789', quest: 'test', objective: 'gate', play: 0, at: '2026-11-26T10:00:00Z' };

it('keeps detached note snapshots and telemetry in memory when IndexedDB is unavailable', async () => {
  vi.stubGlobal('indexedDB', undefined);
  try {
    const store = await openNoteStore();
    expect(store.kind).toBe('memory');
    const note = { text: 'Tor', pos: { x: 1 } };
    const first = await store.add(note);
    note.pos.x = 9;
    const second = await store.add(note);
    expect(second).toBeGreaterThan(first);
    const notes = await store.all<typeof note>();
    expect(notes.map(n => [n.id, n.pos.x])).toEqual([[first, 1], [second, 9]]);
    notes[0]!.pos.x = 4;
    expect((await store.all<typeof note>())[0]?.pos.x).toBe(1);
    const meta = { open: ['q1'] };
    await store.setMeta('telemetry', meta);
    meta.open.length = 0;
    expect(await store.getMeta('telemetry')).toEqual({ open: ['q1'] });
    await store.clear();
    expect(await store.all()).toEqual([]);
    expect(await store.getMeta('telemetry')).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('can flush and resume the stuck clock on either side of the threshold', async () => {
  const store = new MemoryStore();
  let tele = new Telemetry();
  async function flushAndReload() {
    // Same write condition as the notes system's periodic flush.
    if (tele.dirty) await store.setMeta('telemetry', tele.s);
    tele = new Telemetry(normaliseTelemetry(await store.getMeta('telemetry')));
  }

  tele.tick(STUCK_SECONDS - 1, situation, true);
  await flushAndReload();
  expect(tele.s.sinceProgress).toBe(STUCK_SECONDS - 1);
  expect(tele.tick(1, { ...situation, play: STUCK_SECONDS }, true)?.seconds).toBe(STUCK_SECONDS);
  await flushAndReload();
  tele.tick(7, { ...situation, play: STUCK_SECONDS + 7 }, true);
  await flushAndReload();
  expect(tele.openStuck()?.seconds).toBe(STUCK_SECONDS + 7);
  tele.progress();
  await flushAndReload();
  expect(tele.s.sinceProgress).toBe(0);
  expect(tele.s.stuck).toMatchObject([{ ended: true, seconds: STUCK_SECONDS + 7 }]);
});

it('persists objective progress even before there is a stuck episode to close', () => {
  const tele = new Telemetry(normaliseTelemetry({ sinceProgress: STUCK_SECONDS - 1 }));
  tele.progress();
  expect(tele.dirty).toBe(true);
  expect(tele.tick(1, situation, true)).toBeNull();
  expect(tele.s.sinceProgress).toBe(1);
});

// ---- the Notes system with the real Story resume (a boot or a load replays the saved beat)

// A two-beat campaign, no portraits and no rendered objective (story-session-fixture).
vi.mock('../src/systems/story/stories', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/systems/story/stories')>(),
  loadBundledStories: () => [{
    file: 'session.story.json',
    story: {
      chapter: 'session', order: 0, title_de: 'Test', start: 'gate',
      beats: [
        { id: 'gate', enter: [{ do: 'objective', text: 'Zum Tor' }], complete: { manual: true } },
        { id: 'yard', enter: [{ do: 'objective', text: 'Zum Hof' }], complete: { manual: true } },
      ],
    } satisfies StoryFile,
  }],
}));
vi.mock('../src/systems/story/dialogue/portraits', () => ({ ensurePortraitDefs: vi.fn() }));
vi.mock('../src/systems/story/objectives', () => ({
  ObjectiveView: class { set() {} frame() {} },
}));

async function notesWithStory(storedSeconds: number) {
  const { events, state, save, era, element } = explorationSession();
  // the telemetry the last session left in the note store (IndexedDB in the browser)
  const store = new MemoryStore();
  await store.setMeta('telemetry', { ...createTelemetry(), sinceProgress: storedSeconds });
  vi.spyOn(noteStore, 'openNoteStore').mockResolvedValue(store);
  const player = { position: new Vector3(), yaw: 0, pitch: 0, stance: 'stand', frozen: false, teleport: vi.fn() };
  const ctx = {
    events, state, save, era, player, pause: { paused: false }, loop: { time: 0, tick: 0, manual: false },
    scene: new Scene(), camera: new PerspectiveCamera(), systems: { get: vi.fn() },
    audio: { bus: () => null }, t: (key: string) => key,
    input: { wasPressed: () => false }, settings: { state: { reducedMotion: false } },
    ui: { layer: element, modals: { count: 0 }, toast: vi.fn(), hud: { busy: vi.fn() }, cards: { soft: vi.fn() } },
    world: { heightAt: () => 0 },
  } as unknown as GameContext;
  // the saved slot stands in the first beat with its objective
  state.mutable.systems.story = { ...createStorySlice(), active: true, chapter: 'session', beat: 'gate', objective: { text: 'Zum Tor' } };
  await initStory(ctx, element);
  notes.init(ctx);
  notes.frame(0); // installs kq.telemetry
  await vi.waitFor(() => expect(window.kq!.telemetry!.state().sinceProgress).toBe(storedSeconds));
  return { events, save, tele: window.kq!.telemetry! };
}

describe('the stuck clock across a story resume', () => {
  afterEach(() => {
    notes.dispose();
    story.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['boot', 'load'])('keeps the stored clock when the story replays the saved beat (%s)', async (how) => {
    const { events, save, tele } = await notesWithStory(STUCK_SECONDS - 1);
    const beats = vi.fn();
    events.on('story:beat', beats);
    if (how === 'load') {
      events.emit('game:start', { resumed: true });
      save.save('same');
      save.load('same');
    } else events.emit('game:start', { resumed: true });
    expect(beats).toHaveBeenLastCalledWith({ chapter: 'session', beat: 'gate', resume: true });
    expect(tele.state().sinceProgress).toBe(STUCK_SECONDS - 1);
    notes.update(1);
    expect(tele.state().stuck).toMatchObject([{ seconds: STUCK_SECONDS, ended: false, objective: 'Zum Tor' }]);
  });

  it('still counts a beat that is reached anew and a changed objective as progress', async () => {
    const { events, tele } = await notesWithStory(STUCK_SECONDS - 1);
    events.emit('game:start', { resumed: true });
    events.emit('story:beat', { chapter: 'session', beat: 'yard' });
    expect(tele.state().sinceProgress).toBe(0);
    notes.update(1);
    events.emit('objective:set', { text: 'Zum Hof' });
    expect(tele.state().sinceProgress).toBe(0);
  });
});
