/**
 * The conversation panel's advance hint (kq-mobile phone pass): „E weiter“ on desktop, the touch
 * button's name („Aktion“) in touch mode, read at render time (Touch-Steuerung switches at runtime).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../src/player/input';
import { talkHintKey } from '../src/systems/npc/ui';

describe('conversation advance hint', () => {
  const input = { touchMode: false, bindings: structuredClone(DEFAULT_BINDINGS) };

  it('names the E key on desktop (the panel key, not the mouse interact binding)', () => {
    expect(talkHintKey({ ...input, touchMode: false })).toEqual({ label: 'E', touch: false });
    expect(talkHintKey(null)).toEqual({ label: 'E', touch: false });
  });

  it('names the Aktion button in touch mode, and follows a mode switch', () => {
    const live = { ...input };
    live.touchMode = true;
    expect(talkHintKey(live)).toEqual({ label: 'Aktion', touch: true });
    live.touchMode = false;
    expect(talkHintKey(live).label).toBe('E');
  });
});
