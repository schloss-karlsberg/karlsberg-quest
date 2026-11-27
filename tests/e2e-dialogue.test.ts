import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainDialogue } from '../e2e/helpers/dialogue';

afterEach(() => vi.unstubAllGlobals());

describe('e2e presenter drain', () => {
  it('reports the text of an ID-less line still active at the tick limit', () => {
    const dialogue = { text: 'An active quest line.' };
    const story = { flush: vi.fn(), state: () => ({ dialogue, pendingLines: 0 }) };
    const advance = vi.fn();
    vi.stubGlobal('window', { kq: { story, ctx: { loop: { advance } } } });

    expect(drainDialogue({ chunks: 2, ticksPerChunk: 60 })).toEqual({ dialogue, pendingLines: 0 });
    expect(story.flush).toHaveBeenCalledOnce();
    expect(advance.mock.calls).toEqual([[60], [60]]);
  });

  it('drains queued lines and stops stepping once the presenter is idle', () => {
    let pendingLines = 1;
    const story = { flush: vi.fn(), state: () => ({ dialogue: null, pendingLines }) };
    const advance = vi.fn(() => { pendingLines = 0; });
    vi.stubGlobal('window', { kq: { story, ctx: { loop: { advance } } } });

    expect(drainDialogue({ chunks: 2, ticksPerChunk: 60 })).toEqual({ dialogue: null, pendingLines: 0 });
    expect(advance).toHaveBeenCalledExactlyOnceWith(60);
  });
});
