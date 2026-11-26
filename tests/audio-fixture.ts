import { vi } from 'vitest';
import type { AudioManager, Bus } from '../src/audio/audio';

class Param {
  value = 1;
  setTargetAtTime = vi.fn((value: number, _startTime: number, _timeConstant: number) => { this.value = value; });
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
}

export class Node {
  connections: Node[] = [];
  gain = new Param();
  connect(node: Node) { this.connections.push(node); return node; }
  disconnect() { this.connections.length = 0; }
}

class Source extends Node {
  onended: (() => void) | null = null;
  loop = false;
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

export class Panner extends Node {
  positionX = new Param();
  positionY = new Param();
  positionZ = new Param();
}

export class Context {
  currentTime = 1;
  state: AudioContextState = 'running';
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
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
}

export const bus = (audio: AudioManager, name: Bus) => audio.bus(name) as unknown as Node;
export const duckGain = (audio: AudioManager, name: 'music' | 'ambience') => bus(audio, name).connections[0]!.gain.value;
