import type { Settings, SettingsStore } from '../core/save';
import { t } from '../i18n';
import { type Action, REBINDABLE, bindKey, diffBindings, effectiveBindings } from '../player/input';
import { GRAPHICS_LEVELS } from '../render/quality';
import { clear, h } from './dom';

/**
 * The settings page (pause menu and title): five sections with a jump bar — Spiel, Steuerung
 * (incl. key remapping), Bild & Leistung (preset, resolution, Bildrate, Energiesparen, auto, perf overlay),
 * Barrierefreiheit, Ton. Every control has a visible label bound with `for`, ranges show and
 * announce their value, help texts explain what a switch does.
 */

/** Sections of the settings page, in display order. */
export const SETTINGS_SECTIONS = ['game', 'controls', 'graphics', 'access', 'audio'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * A settings row: label + control (+ section, default 'game'; + help text under the row).
 * Feature systems add rows with `addSettingsRows` (shown after the core rows of their section).
 */
export type SettingsRow = [string, HTMLElement, SettingsSection?, string?];
const settingsExtensions: ((settings: SettingsStore) => SettingsRow[])[] = [];
export function addSettingsRows(fn: (settings: SettingsStore) => SettingsRow[]): void {
  settingsExtensions.push(fn);
}

let formSeq = 0;

/** „Bildrate“ choices (settings `fpsCap`; '0' = unbegrenzt). */
const FPS_CHOICES = ['30', '60', '0'] as const;
/** The saved cap as one of the choices (anything else reads as the default 60). */
function fpsChoice(v: number | undefined): (typeof FPS_CHOICES)[number] {
  return v === 30 ? '30' : v === 0 ? '0' : '60';
}

export function settingsForm(settings: SettingsStore): HTMLElement {
  const s = settings.state;
  const set = (fn: (d: Settings) => void, key: string) => settings.update(fn, key);
  const range = (min: number, max: number, step: number, value: number, on: (v: number) => void, label: string, fmt: (v: number) => string, testid?: string) => {
    const out = h('output.val', fmt(value));
    const input = h('input', {
      type: 'range',
      min,
      max,
      step,
      value,
      'aria-label': label,
      'aria-valuetext': fmt(value),
      'data-testid': testid,
      oninput: (e: Event) => {
        const el = e.target as HTMLInputElement;
        const v = Number(el.value);
        out.textContent = fmt(v);
        el.setAttribute('aria-valuetext', fmt(v));
        on(v);
      },
    });
    return h('div.kq-range', [input, out]);
  };
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const check = (value: boolean, on: (v: boolean) => void, label: string, testid?: string) =>
    h('input', { type: 'checkbox', checked: value, 'aria-label': label, 'data-testid': testid, onchange: (e: Event) => on((e.target as HTMLInputElement).checked) });
  const radios = <T extends string>(name: string, values: readonly T[], cur: T, labelKey: (v: T) => string, on: (v: T) => void, label: string, testid?: string) => {
    const el = h('div.radios', { role: 'radiogroup', 'aria-label': label, 'data-testid': testid });
    for (const v of values) {
      el.append(h('label', [h('input', { type: 'radio', name: `${name}-${formSeq}`, value: v, checked: cur === v, onchange: () => on(v) }), ` ${t(labelKey(v))}`]));
    }
    return el;
  };
  formSeq++;
  const rows: SettingsRow[] = [
    // Spiel
    [t('settings.gentle'), check(s.gentleMode, (v) => set((d) => (d.gentleMode = v), 'gentleMode'), t('settings.gentle'), 'set-gentle'), 'game', t('settings.gentle.help')],
    [t('settings.minimap'), check(s.minimap, (v) => set((d) => (d.minimap = v), 'minimap'), t('settings.minimap'), 'set-minimap'), 'game'],
    // accessibility (bible 09 ui.set.one_key; declared by the hunt system): lying flat lights the lantern too
    [t('ui.set.one_key'), check(s.oneKey === true, (v) => set((d) => (d.oneKey = v), 'oneKey'), t('ui.set.one_key')), 'game'],
    // Steuerung
    [t('settings.mouse'), range(0.2, 3, 0.05, s.mouseSensitivity, (v) => set((d) => (d.mouseSensitivity = v), 'mouseSensitivity'), t('settings.mouse'), (v) => `${v.toFixed(2)}×`, 'set-mouse'), 'controls'],
    [t('settings.invertY'), check(s.invertY, (v) => set((d) => (d.invertY = v), 'invertY'), t('settings.invertY'), 'set-inverty'), 'controls'],
    [t('settings.invertX'), check(s.invertX === true, (v) => set((d) => (d.invertX = v), 'invertX'), t('settings.invertX'), 'set-invertx'), 'controls'],
    [
      t('settings.camera'),
      radios('kq-cam', ['third', 'first'] as const, s.cameraMode === 'first' ? 'first' : 'third', (v) => `settings.camera.${v}`, (v) => set((d) => (d.cameraMode = v), 'cameraMode'), t('settings.camera'), 'set-camera'),
      'controls',
      t('settings.camera.help'),
    ],
    [t('settings.fov'), range(55, 95, 1, s.fov, (v) => set((d) => (d.fov = v), 'fov'), t('settings.fov'), (v) => `${v}°`, 'set-fov'), 'controls'],
    // Bild & Leistung
    [
      t('settings.graphics'),
      radios('kq-gfx', GRAPHICS_LEVELS, s.graphics ?? 'high', (v) => `settings.graphics.${v}`, (v) => set((d) => (d.graphics = v), 'graphics'), t('settings.graphics'), 'set-graphics'),
      'graphics',
      t('settings.graphics.help'),
    ],
    [t('settings.resolution'), range(0.5, 1, 0.05, s.resolutionScale ?? 1, (v) => set((d) => (d.resolutionScale = v), 'resolutionScale'), t('settings.resolution'), pct, 'set-res'), 'graphics'],
    [
      t('settings.fps'),
      radios('kq-fps', FPS_CHOICES, fpsChoice(s.fpsCap), (v) => `settings.fps.${v}`, (v) => set((d) => (d.fpsCap = Number(v)), 'fpsCap'), t('settings.fps'), 'set-fps'),
      'graphics',
      t('settings.fps.help'),
    ],
    [t('settings.powerSave'), check(s.powerSave === true, (v) => set((d) => (d.powerSave = v), 'powerSave'), t('settings.powerSave'), 'set-powersave'), 'graphics', t('settings.powerSave.help')],
    [t('settings.autoQuality'), check(s.autoQuality !== false, (v) => set((d) => (d.autoQuality = v), 'autoQuality'), t('settings.autoQuality'), 'set-autoq'), 'graphics'],
    [t('settings.perfHud'), check(s.perfHud === true, (v) => set((d) => (d.perfHud = v), 'perfHud'), t('settings.perfHud'), 'set-perfhud'), 'graphics'],
    // Barrierefreiheit
    [
      t('settings.subtitles'),
      radios('kq-sub', ['s', 'm', 'l', 'xl'] as const, s.subtitleSize, (v) => `settings.subtitles.${v}`, (v) => set((d) => (d.subtitleSize = v), 'subtitleSize'), t('settings.subtitles'), 'set-subsize'),
      'access',
    ],
    [t('settings.subtitleBg'), range(0, 1, 0.05, s.subtitleBg ?? 0.62, (v) => set((d) => (d.subtitleBg = v), 'subtitleBg'), t('settings.subtitleBg'), pct, 'set-subbg'), 'access'],
    [t('settings.reducedMotion'), check(s.reducedMotion, (v) => set((d) => (d.reducedMotion = v), 'reducedMotion'), t('settings.reducedMotion'), 'set-motion'), 'access'],
    [t('settings.reducedFlash'), check(s.reducedFlash === true, (v) => set((d) => (d.reducedFlash = v), 'reducedFlash'), t('settings.reducedFlash'), 'set-flash'), 'access', t('settings.reducedFlash.help')],
    [t('settings.highContrast'), check(s.highContrast === true, (v) => set((d) => (d.highContrast = v), 'highContrast'), t('settings.highContrast'), 'set-contrast'), 'access', t('settings.highContrast.help')],
    [t('settings.colorblind'), check(s.colorblind === true, (v) => set((d) => (d.colorblind = v), 'colorblind'), t('settings.colorblind'), 'set-colorblind'), 'access', t('settings.colorblind.help')],
  ];
  for (const bus of ['master', 'music', 'sfx', 'voice', 'ambience'] as const) {
    rows.push([t(`settings.volume.${bus}`), range(0, 1, 0.01, s.volume[bus] ?? 0.8, (v) => set((d) => (d.volume[bus] = v), 'volume'), t(`settings.volume.${bus}`), pct, `vol-${bus}`), 'audio']);
  }
  for (const ext of settingsExtensions) rows.push(...ext(settings));

  const nav = h('nav.kq-set-nav', { 'aria-label': t('settings.nav') });
  const root = h('div.kq-settings', { 'data-testid': 'settings' }, nav);
  let n = 0;
  for (const sec of SETTINGS_SECTIONS) {
    const mine = rows.filter((r) => (r[2] ?? 'game') === sec);
    const id = `kq-set-${formSeq}-${sec}`;
    const form = h('div.kq-form');
    for (const [label, input, , help] of mine) {
      const control = input.matches('input') ? input : input.querySelector('input');
      const cid = `kq-set-${formSeq}-c${n++}`;
      if (control && !control.id) control.id = cid;
      // a radio group is labelled by aria-label; the visible label points at its first option
      form.append(h('label', { for: control?.id ?? cid }, label), input);
      if (help) form.append(h('p.kq-help', help));
    }
    if (sec === 'controls') form.append(keyBindings(settings));
    const heading = h('h3', { id: `${id}-h` }, t(`settings.section.${sec}`));
    const section = h('section.kq-set-sec', { id, 'aria-labelledby': `${id}-h`, 'data-section': sec }, [heading, form]);
    root.append(section);
    nav.append(
      h(
        'button.kq-chip',
        {
          type: 'button',
          'data-testid': `set-nav-${sec}`,
          onclick: () => {
            section.scrollIntoView({ block: 'start', behavior: settings.state.reducedMotion ? 'auto' : 'smooth' });
            (section.querySelector('input, button, summary') as HTMLElement | null)?.focus({ preventScroll: true });
          },
        },
        t(`settings.section.${sec}`),
      ),
    );
  }
  return root;
}

type KeyLayout = ReadonlyMap<string, string>;
let layoutMap: KeyLayout | undefined;
let layoutRequest: Promise<void> | undefined;

/** Refresh a newly rendered view when the shared keyboard layout first becomes available. */
export function refreshOnKeyboardLayout(refresh: () => void): void {
  if (layoutMap) return;
  const kb = (globalThis.navigator as (Navigator & { keyboard?: { getLayoutMap?: () => Promise<KeyLayout> } }) | undefined)?.keyboard;
  layoutRequest ??= Promise.resolve()
    .then(() => kb?.getLayoutMap?.())
    .then((map) => { layoutMap = map; }, () => {});
  void layoutRequest.then(() => {
    if (layoutMap) refresh();
  });
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Leertaste',
  ShiftLeft: 'Umschalt',
  ShiftRight: 'Umschalt r.',
  ControlLeft: 'Strg',
  ControlRight: 'Strg rechts',
  AltLeft: 'Alt',
  Tab: 'Tab',
  Escape: 'Esc',
  Enter: 'Enter',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'Bild↑',
  PageDown: 'Bild↓',
  Mouse0: 'Maus links',
  Mouse1: 'Mausrad-Klick',
  Mouse2: 'Maus rechts',
};

const PUNCTUATION_FALLBACK: Record<string, string> = { Backquote: '^', Comma: ',', Period: '.' };

/** Format a physical key code using the Keyboard Map API where available ('KeyW' → 'Z' on AZERTY). */
export function keyLabel(code: string, layout = layoutMap): string {
  const name = KEY_NAMES[code];
  if (name) return name;
  const fromLayout = layout?.get(code);
  if (fromLayout?.trim()) return fromLayout.length === 1 ? fromLayout.toUpperCase() : fromLayout;
  const m = /^(Key|Digit)(.)$/.exec(code);
  if (m) return m[2]!;
  const np = /^Numpad(.+)$/.exec(code);
  if (np) return `Num ${np[1]}`;
  return PUNCTUATION_FALLBACK[code] ?? code;
}

/** Key remapping table: every rebindable action with its keys (× removes), "+ Taste" captures one. */
function keyBindings(settings: SettingsStore): HTMLElement {
  const body = h('tbody');
  const table = h('table.kq-bind', body);
  let capture: ((e: KeyboardEvent) => void) | null = null;
  const stopCapture = () => {
    if (capture) window.removeEventListener('keydown', capture, true);
    capture = null;
  };
  const save = (o: Record<string, string[]>) => settings.update((d) => (d.bindings = o), 'bindings');
  const render = (focus?: string) => {
    clear(body);
    const eff = effectiveBindings(settings.state.bindings ?? {});
    for (const a of REBINDABLE) {
      const keys = h('td.keys');
      for (const code of eff[a]) {
        keys.append(
          h('span.kq-key', [
            keyLabel(code),
            h(
              'button.x',
              {
                type: 'button',
                'aria-label': t('settings.keys.remove', { key: keyLabel(code) }),
                onclick: () => {
                  const next = effectiveBindings(settings.state.bindings ?? {});
                  next[a] = next[a].filter((c) => c !== code);
                  save(diffBindings(next));
                  render(`bind-${a}`);
                },
              },
              '×',
            ),
          ]),
        );
      }
      if (!eff[a].length) keys.append(h('span.none', t('settings.keys.none')));
      const add = h('button.kq-chip', { type: 'button', 'data-testid': `bind-${a}`, 'aria-label': `${t(`action.${a}`)}: ${t('settings.keys.add')}` }, t('settings.keys.add'));
      add.addEventListener('click', () => listen(a, add));
      body.append(h('tr', [h('th', { scope: 'row' }, t(`action.${a}`)), keys, h('td', add)]));
    }
    if (focus) (body.querySelector(`[data-testid="${focus}"]`) as HTMLElement | null)?.focus();
  };
  const listen = (a: Action, btn: HTMLElement) => {
    stopCapture();
    btn.textContent = t('settings.keys.press');
    btn.classList.add('wait');
    capture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      stopCapture();
      if (e.code !== 'Escape' && e.code) save(bindKey(settings.state.bindings ?? {}, a, e.code));
      render(`bind-${a}`);
    };
    window.addEventListener('keydown', capture, true);
  };
  render();
  refreshOnKeyboardLayout(render);
  const reset = h(
    'button.kq-link',
    {
      type: 'button',
      'data-testid': 'bind-reset',
      onclick: () => {
        stopCapture();
        save({});
        render();
      },
    },
    t('settings.keys.reset'),
  );
  return h('details.kq-binds', { 'data-testid': 'bindings' }, [h('summary', t('settings.keys')), h('p.kq-help', t('settings.keys.help')), table, reset]);
}
