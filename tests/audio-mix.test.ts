import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tourRoute from '../content/routes/p-fuehrung.json';
import tourStory from '../content/story/00-tour.story.json';
import { AudioManager } from '../src/audio/audio';
import type { DialogueLine } from '../src/content/types';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { defaultSettings, MemoryStorage, SETTINGS_KEY, SettingsStore } from '../src/core/save';
import { t } from '../src/i18n';
import type { Stance } from '../src/player/stance';
import ambience from '../src/systems/ambience';
import { seededRng } from '../src/systems/barks/rules';
import { EchoDirector } from '../src/systems/chronik/echo';
import type { ChronikClue } from '../src/systems/chronik/types';
import footsteps from '../src/systems/footsteps';
import { speakerMeta } from '../src/systems/story/dialogue/speakers';
import { Voice } from '../src/systems/story/dialogue/voice';
import { playStorySoundAction } from '../src/systems/story/sfx';
import type { StoryFile } from '../src/systems/story/types';
import { World } from '../src/world/world';
import { bus, Context, duckGain, Panner, type Node } from './audio-fixture';
import { loadWorldData } from './world-data';

const buffer = { duration: 4 } as AudioBuffer;

function reaches(source: Node, dest: Node): boolean {
  return source === dest || (source.connections?.some((node) => reaches(node, dest)) ?? false);
}

beforeEach(() => {
  vi.stubGlobal('window', { AudioContext: Context, setTimeout: vi.fn() });
  vi.stubGlobal('PannerNode', Panner);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('audio activation and settings', () => {
  it('creates the graph on the start gesture and resumes a suspended context without rebuilding it', async () => {
    class SuspendedContext extends Context {
      override state: AudioContextState = 'suspended';
    }
    vi.stubGlobal('window', { AudioContext: SuspendedContext });
    const audio = new AudioManager();
    const opened = vi.fn();
    audio.onUnlock(opened);
    expect(audio.unlocked).toBe(false);
    expect(audio.bus('music')).toBeNull();
    expect(audio.noise()).toBeNull();
    expect(opened).not.toHaveBeenCalled();

    audio.unlock();
    const ctx = audio.ctx as unknown as Context;
    const music = audio.bus('music');
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(opened).toHaveBeenCalledExactlyOnceWith(ctx);
    expect(audio.unlocked).toBe(true);
    const late = vi.fn();
    audio.onUnlock(late);
    expect(late).toHaveBeenCalledExactlyOnceWith(ctx);
    await ctx.suspend();
    audio.unlock();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(audio.ctx).toBe(ctx);
    expect(audio.bus('music')).toBe(music);
    expect(opened).toHaveBeenCalledOnce();
  });

  it('suspends a hidden tab and only restores audio when it suspended the context itself', async () => {
    const audio = new AudioManager();
    audio.setHidden(true);
    audio.setHidden(false);
    expect(audio.ctx).toBeNull();
    audio.unlock();
    const ctx = audio.ctx as unknown as Context;
    ctx.state = 'suspended';
    audio.setHidden(true);
    audio.setHidden(false);
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(ctx.suspend).not.toHaveBeenCalled();

    ctx.state = 'running';
    audio.setHidden(true);
    await Promise.resolve();
    expect(audio.unlocked).toBe(false);
    audio.setHidden(false);
    await Promise.resolve();
    expect(audio.unlocked).toBe(true);
    expect(ctx.suspend).toHaveBeenCalledOnce();
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it('fills missing buses in older settings and restores each saved volume at first unlock', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ volume: { master: 1, music: 0 } }));
    const settings = new SettingsStore(storage);
    expect(settings.state.volume).toEqual({ ...defaultSettings().volume, master: 1, music: 0 });
    const volume = { master: 1, music: 0, sfx: 0.31, ambience: 0.57, voice: 0 };
    settings.update((state) => { state.volume = volume; });
    const restored = new SettingsStore(storage);
    const audio = new AudioManager();
    audio.setVolumes(restored.state.volume);
    audio.unlock();
    expect(restored.state.volume).toEqual(volume);
    expect(audio.master?.gain.value).toBe(volume.master);
    for (const name of ['music', 'sfx', 'ambience', 'voice'] as const) {
      expect(bus(audio, name).gain.value).toBe(volume[name]);
    }
    const release = audio.holdVoice();
    expect(duckGain(audio, 'music')).toBe(1);
    expect(duckGain(audio, 'ambience')).toBe(1);
    release();
  });
});

it('plays softer steps in low stances and cleans up the wet and gravel cues after their tails', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(seededRng(54));
  const audio = new AudioManager();
  const events = new EventBus();
  const player: { stance: Stance } = { stance: 'stand' };
  const subtitle = vi.fn();
  footsteps.init({ audio, events, player, ui: { hud: { subtitle } } } as unknown as GameContext);
  const step = (surface: string, running = false) => events.emit('player:step', { x: 0, z: 0, surface, running });
  step('gravel');
  expect(vi.getTimerCount()).toBe(0);

  audio.unlock();
  const ac = audio.ctx as unknown as Context;
  step('gravel');
  player.stance = 'crouch';
  step('water');
  player.stance = 'prone';
  step('water', true);
  expect(ac.sources).toHaveLength(4);
  const [crunch, grit, splash, runningSplash] = ac.sources.map((source) => source.connections[0]!.connections[0]!);
  const [stand, crouch, prone] = [crunch, splash, runningSplash].map((envelope) => envelope!.connections[0]!);
  expect(grit?.connections[0]).toBe(stand);
  expect([stand, crouch, prone].map((gain) => gain?.gain.value)).toEqual([1, 0.5, 0.3]);
  expect(splash?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 1.03);
  expect(runningSplash?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.35, 1.03);
  expect(ac.sources[2]?.stop).toHaveBeenCalledWith(expect.closeTo(1.4));
  expect(subtitle).not.toHaveBeenCalled();
  vi.advanceTimersByTime(799);
  expect([stand, crouch, prone].every((gain) => gain?.connections[0] === bus(audio, 'sfx'))).toBe(true);
  vi.advanceTimersByTime(1);
  expect([stand, crouch, prone].map((gain) => gain?.connections.length)).toEqual([0, 0, 0]);
});

it('fades water with altitude and winter, routes dread to music, and stops both beds on disposal', () => {
  vi.spyOn(Math, 'random').mockImplementation(seededRng(54));
  const audio = new AudioManager();
  const { x, z } = tourRoute.stops.find((stop) => stop.id === 'weiher')!;
  const player = { position: { x, z, y: 280 }, flying: false };
  const era: { current: Era } = { current: 'today' };
  const ctx = { audio, era, player, world: { heightAt: () => 280 },
    settings: { state: { subtitles: false } } } as unknown as GameContext;
  ambience.init(ctx);
  try {
    ambience.update(0.2);
    expect(audio.ctx).toBeNull();
    audio.unlock();
    ambience.update(0.2);
    const { sources, currentTime } = audio.ctx as unknown as Context;
    const loops = sources.filter((source) => source.loop);
    expect(loops).toHaveLength(3);
    const [, pond, brook] = loops;
    const score = sources.filter((source) => reaches(source, bus(audio, 'music')));
    expect(score).toHaveLength(4);
    const dreadGain = score[0]!.connections[0]!.connections[0]!.gain;
    const pondGain = pond!.connections[0]!.connections[0]!.gain;
    const brookGain = brook!.connections[0]!.connections[0]!.gain;
    const expectFade = (gain: typeof pondGain, target: number) => {
      const call = gain.setTargetAtTime.mock.lastCall;
      expect(call).toEqual([expect.closeTo(target), currentTime, expect.any(Number)]);
      expect(call![2]).toBeGreaterThan(0);
    };
    const shore = pondGain.value;
    expect(shore).toBeGreaterThan(0);
    expect(brookGain.value).toBe(0);
    expect(dreadGain.value).toBe(0);

    player.flying = true;
    player.position.y += 15;
    ambience.update(0.2);
    expect(pondGain.value).toBeCloseTo(shore / 2);
    expectFade(pondGain, shore / 2);
    player.position.y += 15;
    ambience.update(0.2);
    expect(pondGain.value).toBe(0);
    player.flying = false;
    ambience.update(0.2);
    expect(pondGain.value).toBeCloseTo(shore);

    era.current = '1793-02';
    ambience.update(0);
    expect(pondGain.value).toBe(0);
    expect(dreadGain.value).toBeCloseTo(0.7 * 0.12);
    expectFade(pondGain, 0);
    expectFade(dreadGain, 0.7 * 0.12);
    expect(sources.filter((source) => source.loop)).toEqual(loops);
    ambience.dispose();
    expect(pond?.stop).toHaveBeenCalledWith(2);
    expect(brook?.stop).toHaveBeenCalledWith(2);
    expect(score.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    expect(dreadGain.value).toBe(0);
  } finally {
    ambience.dispose();
  }
});

it('disconnects both spatial audio nodes per echo after its tail on completion and abort', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const element = { append() {}, remove() {}, classList: { toggle() {}, add() {}, remove() {} } };
  vi.stubGlobal('document', { createElement: () => ({ ...element }) });
  const audio = new AudioManager();
  audio.unlock();
  const createSpatial = vi.spyOn(audio, 'createSource3D');
  const { sources, currentTime } = audio.ctx as unknown as Context;
  const events = new EventBus();
  const scene = new Scene();
  const onDone = vi.fn();
  const ctx = {
    audio, scene, events, t, player: { position: new Vector3(), yaw: 0 },
    world: { heightAt: () => 0 }, era: { info: { night: false } },
    post: { uniforms: { uDesaturate: { value: 0.1 } } }, settings: { state: { reducedMotion: true } },
    content: { speakers: new Map() }, ui: { hud: { subtitle() {} } },
  } as unknown as GameContext;
  const clue: ChronikClue = {
    id: 'test.echo', kind: 'echo', title_de: 'Echo', fiction: true,
    where: { era: '1789', x: 0, z: -5, radius: 4 }, reveals: {},
  };
  const lines: DialogueLine[] = [{
    id: 'test.line', speaker: 'test-fictional-speaker', text_de: 'Hallo.',
    trigger: { event: 'echo:start', id: clue.id },
  }];
  const echo = new EchoDirector(ctx, () => lines, element as unknown as HTMLElement, onDone);
  const liveConnections = () => createSpatial.mock.results.flatMap(({ value }) => (
    [value.input, value.panner] as Node[]
  )).reduce((sum, node) => sum + node.connections.length, 0);

  for (const aborted of [true, false, true, false]) {
    echo.start(clue);
    expect(liveConnections()).toBe(2);
    echo.update(2);
    expect(liveConnections()).toBe(4);
    expect(duckGain(audio, 'ambience')).toBe(0.38);
    const whisper = sources.at(-1)!;
    if (aborted) echo.finish(true);
    else echo.update(echo.progress.total);
    expect(echo.active).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(ctx.post.uniforms.uDesaturate!.value).toBe(0.1);
    expect(vi.getTimerCount()).toBe(2);
    expect(whisper.stop).toHaveBeenCalledExactlyOnceWith(expect.any(Number));
    const stopAt = whisper.stop.mock.calls[0]![0];
    expect(Number.isFinite(stopAt)).toBe(true);
    expect(stopAt).toBeGreaterThan(currentTime);
    whisper.end();
    vi.runAllTimers();
    expect(liveConnections()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(duckGain(audio, 'ambience')).toBe(1);
  }
  expect(onDone).toHaveBeenCalledTimes(2);
  expect(onDone).toHaveBeenLastCalledWith(clue, [{ speaker: 'test-fictional-speaker', text: 'Hallo.' }], false);
  echo.dispose();
});

describe('tour sounds', () => {
  it('routes scripted cues to SFX, honors mute and captions, and plays during reduced motion', () => {
    const audio = new AudioManager();
    audio.unlock();
    const { sources } = audio.ctx as unknown as Context;
    const settings = { state: { subtitles: true, reducedMotion: true } };
    const subtitle = vi.fn();
    const ctx = { audio, settings, world: { heightAt: () => 280 }, ui: { hud: { subtitle } } } as unknown as GameContext;
    const cues = (tourStory as StoryFile).beats.flatMap((beat) => beat.enter ?? []).filter((a) => a.do === 'sound');
    expect(cues.map((a) => a.sound)).toEqual(['wind', 'bark', 'deer-rustle', 'compass']);
    audio.setVolumes({ sfx: 0.27, master: 0.64 });
    const release = audio.holdVoice();
    for (const cue of cues) {
      const before = sources.length;
      playStorySoundAction(ctx, cue);
      expect(sources.slice(before).some((node) => reaches(node, bus(audio, 'sfx'))), cue.sound).toBe(true);
      expect(subtitle).toHaveBeenLastCalledWith(null, cue.caption, expect.any(Number));
    }
    expect(bus(audio, 'sfx').gain.value).toBe(0.27);
    expect(bus(audio, 'sfx').connections[0]).toBe(audio.master);
    expect(audio.master?.gain.value).toBe(0.64);
    expect(duckGain(audio, 'ambience')).toBe(0.38);
    release();

    audio.setVolumes({ sfx: 0 });
    playStorySoundAction(ctx, cues[2]!);
    expect(bus(audio, 'sfx').gain.value).toBe(0);
    expect(subtitle).toHaveBeenCalledTimes(cues.length + 1);
    audio.setVolumes({ master: 0 });
    settings.state.subtitles = false;
    playStorySoundAction(ctx, cues[2]!);
    expect(audio.master?.gain.value).toBe(0);
    expect(subtitle).toHaveBeenCalledTimes(cues.length + 1);
  });

  it('plays gravel footsteps without captions on the present-day Felsenpfad', () => {
    const audio = new AudioManager();
    audio.unlock();
    const { sources } = audio.ctx as unknown as Context;
    const events = new EventBus();
    const subtitle = vi.fn();
    const loop = { time: 1 };
    const settings = { state: { subtitles: true } };
    footsteps.init({ audio, events, loop, settings, player: { stance: 'stand' }, t, ui: { hud: { subtitle } } } as unknown as GameContext);
    const { grid, ground, pathAt } = loadWorldData();
    const world = { era: 'today', grid, data: { ground }, pathAt, coverAt: () => 1 } as unknown as World;
    const { x, z } = tourRoute.stops.find((stop) => stop.id === 'felsen')!;
    const surface = World.prototype.surfaceAt.call(world, x, z);
    expect(surface).toBe('gravel');
    events.emit('player:step', { x, z, surface, running: false });
    expect(subtitle).not.toHaveBeenCalled();
    expect(sources).toHaveLength(2);
    expect(sources.every((node) => reaches(node, bus(audio, 'sfx')))).toBe(true);
  });

  it('routes the tour beds and 1789 activity through the voice-ducked ambience bus', () => {
    const audio = new AudioManager();
    audio.unlock();
    const position = { x: 897.2, y: 280, z: -845.3 };
    const { sources } = audio.ctx as unknown as Context;
    const subtitle = vi.fn(() => () => {});
    const era = { current: 'today' };
    ambience.init({ audio, era, player: { position, flying: false }, world: { heightAt: () => 280 },
      settings: { state: { subtitles: true } }, t, ui: { hud: { subtitle } } } as unknown as GameContext);
    try {
      ambience.update(0.2);
      expect(sources.filter((node) => reaches(node, bus(audio, 'ambience')))).toHaveLength(3); // Wind, pond and brook.
      expect(duckGain(audio, 'ambience')).toBe(1);
      audio.setVolumes({ ambience: 0.62 });
      const release = audio.holdVoice();
      const before = sources.length;
      Object.assign(position, { x: 1216, z: -1114 });
      era.current = '1789';
      ambience.update(3.2);
      expect(subtitle).toHaveBeenCalledWith(null, 'In der Ferne klappern Hufe.', 3500, true);
      const activity = sources.slice(before);
      expect(activity.length).toBeGreaterThan(0);
      expect(activity.every((node) => reaches(node, bus(audio, 'ambience')))).toBe(true);
      expect(bus(audio, 'ambience').gain.value).toBe(0.62);
      expect(duckGain(audio, 'ambience')).toBe(0.38);
      audio.setVolumes({ ambience: 0 });
      release();
      expect(bus(audio, 'ambience').gain.value).toBe(0);
      expect(duckGain(audio, 'ambience')).toBe(1);
    } finally {
      ambience.dispose();
    }
  });
});

describe('speech mix', () => {
  it('preserves the bus controls, pause and mute while handling overlapping voices', () => {
    const audio = new AudioManager();
    audio.setVolumes({ master: 0 });
    audio.setPaused(true);
    audio.unlock();
    expect(audio.master?.gain.value).toBe(0);

    const releaseFirst = audio.holdVoice();
    const releaseSecond = audio.holdVoice();
    expect(duckGain(audio, 'ambience')).toBe(0.38);
    expect(duckGain(audio, 'music')).toBe(0.50);
    expect(bus(audio, 'sfx').connections[0]).toBe(audio.master);
    expect(bus(audio, 'voice').connections[0]).toBe(audio.master);

    audio.setVolumes({ master: 0.6, ambience: 0, music: 0.23, voice: 0 });
    expect(audio.master?.gain.value).toBe(0.15);
    expect(bus(audio, 'ambience').gain.value).toBe(0);
    expect(bus(audio, 'music').gain.value).toBe(0.23);
    expect(duckGain(audio, 'ambience')).toBe(1);
    audio.setVolumes({ voice: 0.5 });
    expect(duckGain(audio, 'music')).toBe(0.50);

    releaseFirst();
    releaseFirst();
    expect(duckGain(audio, 'ambience')).toBe(0.38);
    // The spring and era shift fade this upstream bus independently.
    bus(audio, 'music').gain.value = 0.046;
    releaseSecond();
    expect(duckGain(audio, 'ambience')).toBe(1);
    expect(duckGain(audio, 'music')).toBe(1);
    expect(bus(audio, 'music').gain.value).toBe(0.046);
    expect(audio.volumes.music).toBe(0.23);
    audio.setPaused(false);
    expect(audio.master?.gain.value).toBe(0.6);
  });

  it('releases and reacquires ducking when a clip is paused, resumed, skipped or ends', () => {
    const audio = new AudioManager();
    audio.unlock();
    const ctx = audio.ctx as unknown as Context;
    const voice = new Voice(audio);
    const spec = speakerMeta('imhoff').voice;

    const clip = voice.playClip(buffer, spec)!;
    expect(duckGain(audio, 'music')).toBe(0.50);
    ctx.currentTime = 2;
    clip.pause();
    expect(duckGain(audio, 'music')).toBe(1);
    ctx.currentTime = 10;
    expect(clip.start()).toBe(true);
    expect(ctx.sources[1]?.start).toHaveBeenCalledWith(10, 1);
    expect(ctx.sources[1]?.stop).toHaveBeenCalledWith(13);
    ctx.sources[0]?.end();
    expect(duckGain(audio, 'music')).toBe(0.50);
    clip.stop();
    expect(duckGain(audio, 'music')).toBe(1);

    const completed = voice.playClip(buffer, spec)!;
    ctx.sources[2]?.end();
    expect(completed.state).toBe('ended');
    expect(duckGain(audio, 'music')).toBe(1);
  });

  it('finishes a Laub clip on the audio clock when its ended event is delayed', () => {
    const audio = new AudioManager();
    audio.unlock();
    const ctx = audio.ctx as unknown as Context;
    const voice = new Voice(audio);
    const spec = speakerMeta('laub').voice;
    const clip = voice.playClip(buffer, spec)!;
    expect(ctx.sources[0]!.stop).toHaveBeenCalledWith(5);

    ctx.currentTime = 4.99;
    expect(clip.playing).toBe(true);
    expect(duckGain(audio, 'ambience')).toBe(0.38);

    ctx.currentTime = 5;
    expect(clip.playing).toBe(false);
    expect(clip.done).toBe(true);
    expect(duckGain(audio, 'ambience')).toBe(1);

    const next = voice.playClip(buffer, spec)!;
    ctx.sources[0]!.end();
    expect(next.playing).toBe(true);
    expect(duckGain(audio, 'ambience')).toBe(0.38);
  });

  it.each(['voice', 'master'] as const)('leaves timing to the subtitles when %s is muted', (channel) => {
    const audio = new AudioManager();
    audio.unlock();
    audio.setVolumes({ [channel]: 0 });
    const voice = new Voice(audio);
    expect(voice.playClip(buffer, speakerMeta('imhoff').voice)).toBeNull();
    expect((audio.ctx as unknown as Context).sources).toHaveLength(0);
  });

  it('routes Gerold clips and murmurs through one moving source on the voice bus', () => {
    const audio = new AudioManager();
    audio.unlock();
    const ctx = audio.ctx as unknown as Context;
    const voice = new Voice(audio);
    const spec = speakerMeta('imhoff').voice;
    let position: { x: number; y: number; z: number } | undefined = { x: 524, y: 282, z: -770 };
    const unbind = audio.bindVoiceEmitter('imhoff', () => position);
    const input = audio.voiceOutput(spec.emitter) as unknown as Node;
    const panner = input.connections[0] as Panner;
    expect(panner.connections[0]).toBe(bus(audio, 'voice'));
    expect(panner.positionX.value).toBe(524);

    const clip = voice.playClip(buffer, spec)!;
    voice.blip(spec);
    // Both chains should reach the same emitter, including the murmur's extra formant filter.
    for (const source of ctx.sources) {
      let node: Node | undefined = source;
      while (node && node !== input) node = node.connections[0];
      expect(node).toBe(input);
    }
    position.x += 5;
    audio.updateListener(new PerspectiveCamera());
    expect(panner.positionX.value).toBe(529);
    clip.stop();
    expect(duckGain(audio, 'ambience')).toBe(0.38);
    ctx.sources[1]?.end();
    expect(duckGain(audio, 'ambience')).toBe(1);

    position = undefined;
    expect(audio.voiceOutput(spec.emitter)).toBe(audio.bus('voice'));
    unbind();
    expect(panner.connections).toHaveLength(0);
  });
});
