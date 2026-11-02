import type { GameContext } from '../../core/context';
import type { Settings, SettingsStore } from '../../core/save';
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import { type SettingsRow, addControlKeys, addSettingsRows } from '../../ui/menus';

declare module '../../core/save' {
  interface Settings {
    /** Graphics quality: 'low' = pixel ratio 1, fx particles reduced, sparser point cloud. Unset = auto. */
    graphics?: 'low' | 'high';
  }
}

/** Settings rows added to the pause/title settings page (rauhnacht, subtitles and soundIndicators are read by hunt). */
export function settingsRows(settings: SettingsStore): SettingsRow[] {
  const s = settings.state;
  const set = (fn: (d: Settings) => void, key: string) => settings.update(fn, key);
  const check = (testid: string, value: boolean, on: (v: boolean) => void, label: string) =>
    h('input', { type: 'checkbox', checked: value, 'aria-label': label, 'data-testid': testid, onchange: (e: Event) => on((e.target as HTMLInputElement).checked) });
  const radios = h('div.radios', { 'data-testid': 'set-graphics' });
  const cur = s.graphics ?? 'high';
  for (const q of ['low', 'high'] as const) {
    radios.append(
      h('label', [
        h('input', { type: 'radio', name: 'kq-gfx', value: q, checked: cur === q, onchange: () => set((d) => (d.graphics = q), 'graphics') }),
        ` ${t(`settings.graphics.${q}`)}`,
      ]),
    );
  }
  return [
    [t('settings.rauhnacht'), check('set-rauhnacht', s.rauhnacht === true, (v) => set((d) => (d.rauhnacht = v), 'rauhnacht'), t('settings.rauhnacht'))],
    [t('settings.subtitlesOn'), check('set-subtitles', s.subtitles !== false, (v) => set((d) => (d.subtitles = v), 'subtitles'), t('settings.subtitlesOn'))],
    [t('settings.soundIndicators'), check('set-indicators', s.soundIndicators !== false, (v) => set((d) => (d.soundIndicators = v), 'soundIndicators'), t('settings.soundIndicators'))],
    [t('settings.graphics'), radios],
  ];
}

let registered = false;

/** Register the rows and key-help entries once; apply the graphics level now and on change. */
export function installSettings(ctx: GameContext): void {
  if (!registered) {
    registered = true;
    addSettingsRows(settingsRows);
    addControlKeys('relief_off', 'xray', 'plans');
  }
  const apply = () => {
    const g = ctx.settings.state.graphics;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const want = g === 'low' ? 1 : Math.min(dpr, 1.5);
    if (Math.abs(ctx.renderer.getPixelRatio() - want) > 1e-3) {
      ctx.renderer.setPixelRatio(want);
      // boot's resize handler re-sizes renderer + post targets with the new ratio
      window.dispatchEvent(new Event('resize'));
    }
  };
  apply();
  ctx.events.on('settings:change', ({ key }) => key === 'graphics' && apply());
}
