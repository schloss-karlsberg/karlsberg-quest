import type { GameContext } from '../../core/context';
import type { Settings, SettingsStore } from '../../core/save';
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import { type SettingsRow, addControlKeys, addSettingsRows } from '../../ui/menus';

/** Settings rows added to the pause/title settings page (rauhnacht, subtitles and soundIndicators are read by hunt). */
export function settingsRows(settings: SettingsStore): SettingsRow[] {
  const s = settings.state;
  const set = (fn: (d: Settings) => void, key: string) => settings.update(fn, key);
  const check = (testid: string, value: boolean, on: (v: boolean) => void, label: string) =>
    h('input', { type: 'checkbox', checked: value, 'aria-label': label, 'data-testid': testid, onchange: (e: Event) => on((e.target as HTMLInputElement).checked) });
  return [
    [t('settings.rauhnacht'), check('set-rauhnacht', s.rauhnacht === true, (v) => set((d) => (d.rauhnacht = v), 'rauhnacht'), t('settings.rauhnacht')), 'game'],
    [t('settings.subtitlesOn'), check('set-subtitles', s.subtitles !== false, (v) => set((d) => (d.subtitles = v), 'subtitles'), t('settings.subtitlesOn')), 'access'],
    [t('settings.soundIndicators'), check('set-indicators', s.soundIndicators !== false, (v) => set((d) => (d.soundIndicators = v), 'soundIndicators'), t('settings.soundIndicators')), 'access'],
  ];
}

let registered = false;

/** Register the rows and key-help entries once (the graphics preset is core: render/quality.ts). */
export function installSettings(_ctx: GameContext): void {
  if (!registered) {
    registered = true;
    addSettingsRows(settingsRows);
    addControlKeys('relief_off', 'xray', 'plans');
  }
}
