import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tourRoute from '../content/routes/p-fuehrung.json';
import tourStory from '../content/story/00-tour.story.json';
import { AudioManager, type Bus } from '../src/audio/audio';
import type { DialogueLine } from '../src/content/types';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { t } from '../src/i18n';
import ambience from '../src/systems/ambience';
import { EchoDirector } from '../src/systems/chronik/echo';
import type { ChronikClue } from '../src/systems/chronik/types';
import footsteps from '../src/systems/footsteps';
import { speakerMeta } from '../src/systems/story/dialogue/speakers';
import { Voice } from '../src/systems/story/dialogue/voice';
import { playStorySoundAction } from '../src/systems/story/sfx';
import type { StoryFile } from '../src/systems/story/types';
import { World } from '../src/world/world';
import { loadWorldData } from './world-data';

class Param {
  value = 1;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
}

class Node {
  connections: Node[] = [];
  gain = new Param();
  connect(node: Node) { this.connections.push(node); return node; }
  disconnect() { this.connections.length = 0; }
}

class Source extends Node {
  onended: (() => void) | null = null;
  private endedListeners: (() => void)[] = [];
  frequency = new Param();
  start = vi.fn();
  stop = vi.fn();
  addEventListener(_type: string, listener: () => void) { this.endedListeners.push(listener); }
  end() {
    this.onended?.();
    for (const listener of this.endedListeners) listener();
  }
}

class Panner extends Node {
  positionX = new Param();
  positionY = new Param();
  positionZ = new Param();
}

class Context {
  currentTime = 1;
  state = 'running';
  sampleRate = 32;
  destination = new Node();
  listener = { setPosition() {} };
  sources: Source[] = [];
  createGain() { return new Node(); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), ratio: new Param() }); }
  createBiquadFilter() { return Object.assign(new Node(), { frequency: new Param(), Q: new Param() }); }
  createDelay() { return Object.assign(new Node(), { delayTime: new Param() }); }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createOscillator() { return this.createBufferSource(); }
  createConstantSource() { return Object.assign(this.createBufferSource(), { offset: new Param() }); }
}

const bus = (audio: AudioManager, name: Bus) => audio.bus(name) as unknown as Node;
const duckGain = (audio: AudioManager, name: 'music' | 'ambience') => bus(audio, name).connections[0]!.gain.value;
const buffer = { duration: 4 } as AudioBuffer;

function reaches(source: Node, dest: Node): boolean {
  return source === dest || (source.connections?.some((node) => reaches(node, dest)) ?? false);
}

beforeEach(() => {
  vi.stubGlobal('window', { AudioContext: Context, setTimeout: vi.fn() });
  vi.stubGlobal('PannerNode', Panner);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('disconnects both spatial audio nodes per echo after its tail on completion and abort', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const element = { append() {}, remove() {}, classList: { toggle() {}, add() {}, remove() {} } };
  vi.stubGlobal('document', { createElement: () => ({ ...element }) });
  const audio = new AudioManager();
  audio.unlock();
  const createSpatial = vi.spyOn(audio, 'createSource3D');
  const { sources } = audio.ctx as unknown as Context;
  const events = new EventBus();
  const scene = new Scene();
  const onDone = vi.fn();
  const ctx = {
    audio, scene, events, t, player: { position: new Vector3(), yaw: 0 },
    world: { heightAt: () => 0 }, era: { info: { night: false } },
    post: { uniforms: { uDesaturate: { value: 0.1 } } }, settings: { state: { reducedMotion: true } },
    content: { speakers: new Map() }, ui: { hud: { subtitle() {} } },
  } as unknown as GameContext;
  const clue: ChronikClue = { id: 'test.echo', kind: 'echo', title_de: 'Echo', where: { era: '1789', x: 0, z: -5, radius: 4 }, reveals: {} };
  const lines: DialogueLine[] = [{ id: 'test.line', speaker: 'mannlich', text_de: 'Hallo.', trigger: { event: 'echo:start', id: clue.id } }];
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
    whisper.end();
    vi.runAllTimers();
    expect(liveConnections()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(duckGain(audio, 'ambience')).toBe(1);
  }
  expect(onDone).toHaveBeenCalledTimes(2);
  expect(onDone).toHaveBeenLastCalledWith(clue, [{ speaker: 'mannlich', text: 'Hallo.' }], false);
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
