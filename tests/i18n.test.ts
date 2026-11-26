import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERA_INFO } from '../src/core/era';
import { addStrings, hasString, t } from '../src/i18n';
import { REBINDABLE } from '../src/player/input';
import { CONTROL_KEYS } from '../src/ui/menus';
import '../src/systems/hunt/strings';

afterEach(() => { vi.restoreAllMocks(); });

describe('German string lookup', () => {
  it('resolves the keys built by the era HUD, remapping table and controls page', () => {
    for (const { labelKey } of Object.values(ERA_INFO)) expect(hasString(labelKey), labelKey).toBe(true);
    for (const action of REBINDABLE) expect(hasString(`action.${action}`), action).toBe(true);
    for (const id of CONTROL_KEYS) {
      expect(hasString(`ui.keys.${id}`), id).toBe(true);
      expect(hasString(`ui.keys.${id}.key`), id).toBe(true);
    }
  });

  it('shows an unknown key and warns once, then uses a late feature registration', () => {
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

  it('fills repeated placeholders with literal values, leaving omitted values visible', () => {
    addStrings('de', { 'test.record': '{name}/{name} ({n}) {more}' });
    expect(t('test.record', { name: '$&', n: 0 })).toBe('$&/$& (0) {more}');
    expect(t('test.record', { name: '', n: 3, more: 'fertig' })).toBe('/ (3) fertig');
  });

  it('formats both registered forms of the hunt track count', () => {
    expect(t('hunt.read.n1')).toBe('einem Hund');
    expect(t('hunt.read.n', { n: 'zwei' })).toBe('zwei Hunden');
    expect(t('hunt.read.n', { n: 0 })).toBe('0 Hunden');
  });

  it('treats inherited object names as missing translation keys and missing parameters', () => {
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
