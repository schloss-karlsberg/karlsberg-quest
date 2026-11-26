import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { effectiveBindings } from '../src/player/input';
import { actionLabel } from '../src/ui/actionLabel';
import { settingsForm } from '../src/ui/settings';
import { recordControls } from './control-fixture';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('settings controls', () => {
  it('announces both ends of the volume slider and reloads a muted channel independently', () => {
    const control = recordControls();
    const storage = new MemoryStorage();
    const settings = new SettingsStore(storage);
    settingsForm(settings);
    const voice = control('vol-voice');
    const changed = vi.fn();
    settings.subscribe(changed);

    voice.value = '1';
    voice.dispatchEvent(new Event('input'));
    expect(settings.state.volume.voice).toBe(1);
    expect(voice.attributes.get('aria-valuetext')).toBe('100 %');

    voice.value = '0';
    voice.dispatchEvent(new Event('input'));
    expect(voice.attributes.get('aria-valuetext')).toBe('0 %');
    expect(changed).toHaveBeenLastCalledWith(settings.state, 'volume');
    expect(new SettingsStore(storage).state.volume).toEqual({
      master: 0.8, music: 0.7, sfx: 0.9, voice: 0, ambience: 0.8,
    });
  });

  it('uses the current motion preference when jumping sections and remembers an explicit override', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const control = recordControls();
    const storage = new MemoryStorage();
    const settings = new SettingsStore(storage);
    settingsForm(settings);
    const motion = control('set-motion');
    expect(motion.checked).toBe(true);
    expect(control('set-flash').checked).toBe(true);
    expect(control('set-contrast').checked).toBe(false);
    control('set-nav-audio').dispatchEvent(new Event('click'));
    expect(control('audio').scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });

    motion.checked = false;
    motion.dispatchEvent(new Event('change'));
    control('set-nav-audio').dispatchEvent(new Event('click'));
    expect(control('audio').scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' });
    expect(new SettingsStore(storage).state).toMatchObject({ reducedMotion: false, reducedFlash: true });
  });

  it('uses the requested custom key slot if there is no touch button, and leaves an unbound hint empty', () => {
    const input = { touchMode: true, bindings: effectiveBindings({ lookDown: ['KeyJ', 'Numpad2'], inventory: [] }) };
    expect(actionLabel(input, 'lookDown', 1)).toBe('Num 2');
    expect(actionLabel(input, 'lookDown', 2, 'PageDown')).toBe('Bild↓');
    expect(actionLabel(input, 'inventory')).toBe('');
  });
});
