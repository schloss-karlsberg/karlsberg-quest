import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/core/context';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { installSettings } from '../src/systems/skills/settings';
import '../src/systems/skills/strings';
import { controlKeyRows } from '../src/ui/menus';

installSettings({} as GameContext);

function rowValues(bindings: Record<string, string[]> = {}, layout?: ReadonlyMap<string, string>) {
  return Object.fromEntries(controlKeyRows(bindings, layout).map(({ id, keys }) => [id, keys]));
}

describe('Steuerung key help', () => {
  it('shows current defaults, with movement and look grouped in direction order', () => {
    expect(rowValues()).toMatchObject({
      move: '[W] / [↑] · [A] · [S] / [↓] · [D]',
      turn: '[←] / [,] / [Num 4] · [→] / [.] / [Num 6] · [Bild↑] / [Num 8] · [Bild↓] / [Num 2]',
      listen: '[E]',
      examine: '[Maus links]',
      scan: '[2] / [Umschalt+2]',
      pause: '[Esc]',
      spirit: '[1]',
      measure: '[3]',
      relief_off: '[^]',
      xray: '[4]',
      plans: '[5]',
    });
  });

  it('uses saved alternates and the unbound label in grouped, single and feature rows', () => {
    const storage = new MemoryStorage();
    const settings = new SettingsStore(storage);
    settings.update((draft) => (draft.bindings = {
      forward: ['KeyZ', 'Numpad7'],
      back: [],
      lookLeft: ['KeyJ'],
      lookDown: [],
      listen: [],
      scan: ['KeyR', 'F6'],
      scan0: ['KeyV'],
      xray: [],
      plans: ['KeyB', 'Digit7'],
    }), 'bindings');

    const reloaded = new SettingsStore(storage);
    expect(rowValues(reloaded.state.bindings)).toMatchObject({
      move: '[Z] / [Num 7] · [A] · — · [D]',
      turn: '[J] · [→] / [.] / [Num 6] · [Bild↑] / [Num 8] · —',
      listen: '—',
      scan: '[R] / [F6] / [Umschalt+R] / [Umschalt+F6]',
      relief_off: '[V]',
      xray: '—',
      plans: '[B] / [7]',
    });
    expect(rowValues({ scan: [] }).scan).toBe('—');

    reloaded.update((draft) => (draft.bindings = {}), 'bindings');
    expect(rowValues(new SettingsStore(storage).state.bindings)).toEqual(rowValues());
  });

  it('keeps Escape fixed even with a saved pause override', () => {
    expect(rowValues({ pause: ['KeyP'] }).pause).toBe('[Esc]');
  });

  it('shows either bound Shift key as a standalone reverse scan shortcut', () => {
    expect(rowValues({ scan: ['ShiftLeft'] }).scan).toBe('[Umschalt] (rückwärts)');
    expect(rowValues({ scan: ['ShiftRight', 'Digit2'] }).scan)
      .toBe('[2] / [Umschalt r.] (rückwärts) / [Umschalt+2]');
  });

  it('uses supplied layout labels while preserving localized special keys', () => {
    const layout = new Map([['KeyW', 'z'], ['KeyY', 'ü'], ['ArrowUp', 'up']]);
    const rows = rowValues({ listen: ['KeyY'], scan: ['KeyY'], plans: ['KeyY'] }, layout);
    expect(rows).toMatchObject({
      move: '[Z] / [↑] · [A] · [S] / [↓] · [D]',
      listen: '[Ü]',
      scan: '[Ü] / [Umschalt+Ü]',
      plans: '[Ü]',
    });
  });

  it('prefers supplied punctuation and digit-key labels', () => {
    const layout = new Map([
      ['Backquote', '`'], ['Comma', ';'], ['Period', ':'], ['Digit2', 'é'], ['Digit4', "'"],
    ]);
    expect(rowValues({}, layout)).toMatchObject({
      turn: '[←] / [;] / [Num 4] · [→] / [:] / [Num 6] · [Bild↑] / [Num 8] · [Bild↓] / [Num 2]',
      scan: '[É] / [Umschalt+É]',
      relief_off: '[`]',
      xray: "[']",
    });
  });
});
