import { PerspectiveCamera } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager, type Bus } from '../src/audio/audio';
import { speakerMeta } from '../src/systems/story/dialogue/speakers';
import { Voice } from '../src/systems/story/dialogue/voice';

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
  destination = new Node();
  listener = { setPosition() {} };
  sources: Source[] = [];
  createGain() { return new Node(); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), ratio: new Param() }); }
  createBiquadFilter() { return Object.assign(new Node(), { frequency: new Param(), Q: new Param() }); }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createOscillator() { return this.createBufferSource(); }
}

const bus = (audio: AudioManager, name: Bus) => audio.bus(name) as unknown as Node;
const duckGain = (audio: AudioManager, name: 'music' | 'ambience') => bus(audio, name).connections[0]!.gain.value;
const buffer = { duration: 4 } as AudioBuffer;

beforeEach(() => {
  vi.stubGlobal('window', { AudioContext: Context });
  vi.stubGlobal('PannerNode', Panner);
});
afterEach(() => vi.unstubAllGlobals());

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
    expect(clip.start()).toBe(true);
    expect(ctx.sources[1]?.start).toHaveBeenCalledWith(2, 1);
    ctx.sources[0]?.end();
    expect(duckGain(audio, 'music')).toBe(0.50);
    clip.stop();
    expect(duckGain(audio, 'music')).toBe(1);

    const completed = voice.playClip(buffer, spec)!;
    ctx.sources[2]?.end();
    expect(completed.state).toBe('ended');
    expect(duckGain(audio, 'music')).toBe(1);
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
