import { Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { ERA_INFO } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { GameStateStore, createInitialState } from '../src/core/state';
import { REBINDABLE } from '../src/player/input';

beforeEach(() => { vi.resetModules(); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('German string lookup', () => {
  it('resolves the keys built by the era HUD and remapping table', async () => {
    const { hasString } = await import('../src/i18n');
    for (const { labelKey } of Object.values(ERA_INFO)) expect(hasString(labelKey), labelKey).toBe(true);
    for (const action of REBINDABLE) expect(hasString(`action.${action}`), action).toBe(true);
  });

  it('resolves both labels for every control after feature initialization', async () => {
    const [{ hasString }, { CONTROL_KEYS }, { default: skills }, { default: photo }, { default: notes }] = await Promise.all([
      import('../src/i18n'),
      import('../src/ui/menus'),
      import('../src/systems/skills'),
      import('../src/systems/photo'),
      import('../src/systems/notes'),
    ]);
    const createElement = () => Object.assign(new EventTarget(), {
      append: vi.fn(),
      appendChild: vi.fn(),
      classList: { remove: vi.fn() },
      getContext: () => null,
      remove: vi.fn(),
      setAttribute: vi.fn(),
      style: {},
    });
    vi.stubGlobal('Node', EventTarget);
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { createElement, createTextNode: () => new EventTarget() }));
    vi.stubGlobal('indexedDB', undefined);

    const ctx = {
      events: new EventBus(),
      state: new GameStateStore(createInitialState()),
      scene: new Scene(),
      era: { current: 'today' },
      world: { heightAt: () => 0 },
      ui: { root: createElement(), layer: createElement, cards: { source: vi.fn() } },
    } as unknown as GameContext;
    const features = [skills, photo, notes];
    try {
      for (const feature of features) feature.init(ctx);
      expect(CONTROL_KEYS).toEqual(expect.arrayContaining(['relief_off', 'xray', 'plans', 'photo', 'notes']));
      for (const id of CONTROL_KEYS) {
        const key = `ui.keys.${id}`;
        expect(hasString(key), key).toBe(true);
        expect(hasString(`${key}.key`), `${key}.key`).toBe(true);
      }
    } finally {
      for (const feature of features.reverse()) feature.dispose();
    }
  });

  it('shows an unknown key and warns once, then uses a late feature registration', async () => {
    const { addStrings, hasString, t } = await import('../src/i18n');
    const key = 'test.late.label';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(hasString(key)).toBe(false);
    expect(t(key)).toBe(key);
    expect(t(key)).toBe(key);
    expect(warn).toHaveBeenCalledExactlyOnceWith(`[i18n] missing string '${key}'`);
    addStrings('de', { [key]: 'Stufe {n}' });
    expect(hasString(key)).toBe(true);
    expect(t(key, { n: 0 })).toBe('Stufe 0');
    addStrings('de', { [key]: 'Rang {n}' });
    expect(t(key, { n: 2 })).toBe('Rang 2');
  });

  it('fills repeated placeholders with literal values, leaving omitted values visible', async () => {
    const { addStrings, hasString, t } = await import('../src/i18n');
    const key = 'test.record';
    expect(hasString(key)).toBe(false);
    addStrings('de', { [key]: '{name}/{name} ({n}) {more}' });
    expect(t(key, { name: '$&', n: 0 })).toBe('$&/$& (0) {more}');
    expect(t(key, { name: '', n: 3, more: 'fertig' })).toBe('/ (3) fertig');
  });

  it('formats both registered forms of the hunt track count', async () => {
    const { t } = await import('../src/i18n');
    await import('../src/systems/hunt/strings');
    expect(t('hunt.read.n1')).toBe('einem Hund');
    expect(t('hunt.read.n', { n: 'zwei' })).toBe('zwei Hunden');
    expect(t('hunt.read.n', { n: 0 })).toBe('0 Hunden');
  });

  it('treats inherited object names as missing translation keys and missing parameters', async () => {
    const { addStrings, hasString, t } = await import('../src/i18n');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(hasString('toString')).toBe(false);
    expect(t('toString', {})).toBe('toString');
    expect(warn).toHaveBeenCalledOnce();
    addStrings('de', { 'test.inherited': '{toString}' });
    expect(t('test.inherited', {})).toBe('{toString}');
    expect(t('test.inherited', { toString: 'Wert' })).toBe('Wert');
  });

  it.todo('decide whether unused content-bible tutorial keys such as ui.tut.fill should remain available to features');
});
