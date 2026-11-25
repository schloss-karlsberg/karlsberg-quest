import { expect, it, vi } from 'vitest';
import { VoiceClip } from '../src/systems/story/dialogue/voice';

it('finishes a recorded clip on the source ended event without a game update', () => {
  const input = {} as GainNode;
  const output = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const source = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  const context = {
    state: 'running',
    currentTime: 1,
    createGain: () => output,
    createBufferSource: () => source,
  };
  const buffer = { duration: 2.4 } as AudioBuffer;
  const releaseDuck = vi.fn();
  const clip = new VoiceClip(context as unknown as AudioContext, buffer, { input, post: input }, null, () => releaseDuck);

  expect(clip.start()).toBe(true);
  expect(source.buffer).toBe(buffer);
  expect(source.start).toHaveBeenCalledWith(1, 0);
  expect(clip.playing).toBe(true);

  context.currentTime += buffer.duration;
  source.onended?.();

  expect(releaseDuck).toHaveBeenCalledOnce();
  expect(clip.playing).toBe(false);
  expect(clip.done).toBe(true);
  expect(output.disconnect).toHaveBeenCalledOnce();
});
