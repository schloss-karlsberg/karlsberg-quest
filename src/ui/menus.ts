import type { Settings, SettingsStore } from '../core/save';
import type { AttributionItem } from '../data/types';
import { t } from '../i18n';
import { h } from './dom';
import type { ModalHandle, ModalManager } from './modal';

export interface MenuDeps {
  modals: ModalManager;
  settings: SettingsStore;
  attribution: () => AttributionItem[];
  save: () => boolean;
  toTitle: () => void;
}

/** A settings row: label + control. Feature systems add rows with `addSettingsRows` (shown below the core rows). */
export type SettingsRow = [string, HTMLElement];
const settingsExtensions: ((settings: SettingsStore) => SettingsRow[])[] = [];
export function addSettingsRows(fn: (settings: SettingsStore) => SettingsRow[]): void {
  settingsExtensions.push(fn);
}

/** Key help: `ui.keys.<id>` (description) + `ui.keys.<id>.key` (key label) from the bible, in this order. */
export const CONTROL_KEYS: string[] = ['move', 'run', 'sneak', 'prone', 'spirit', 'scan', 'map', 'listen', 'examine', 'shift', 'lantern', 'chronik', 'measure', 'pause'];
/** Feature systems append their own control ids (strings `ui.keys.<id>` / `.key` registered via addStrings). */
export function addControlKeys(...ids: string[]): void {
  for (const id of ids) if (!CONTROL_KEYS.includes(id)) CONTROL_KEYS.push(id);
}

export function controlsBody(): HTMLElement {
  return h(
    'table.kq-keys',
    { 'data-testid': 'key-help' },
    CONTROL_KEYS.map((id) => h('tr', [h('td.k', t(`ui.keys.${id}.key`)), h('td', t(`ui.keys.${id}`))])),
  );
}

export function settingsForm(settings: SettingsStore): HTMLElement {
  const s = settings.state;
  const set = (fn: (d: Settings) => void, key: string) => settings.update(fn, key);
  const range = (min: number, max: number, step: number, value: number, on: (v: number) => void, label: string) =>
    h('input', { type: 'range', min, max, step, value, 'aria-label': label, oninput: (e: Event) => on(Number((e.target as HTMLInputElement).value)) });
  const check = (value: boolean, on: (v: boolean) => void, label: string) =>
    h('input', { type: 'checkbox', checked: value, 'aria-label': label, onchange: (e: Event) => on((e.target as HTMLInputElement).checked) });
  const rows: [string, HTMLElement][] = [
    [t('settings.mouse'), range(0.2, 3, 0.05, s.mouseSensitivity, (v) => set((d) => (d.mouseSensitivity = v), 'mouseSensitivity'), t('settings.mouse'))],
    [t('settings.invertY'), check(s.invertY, (v) => set((d) => (d.invertY = v), 'invertY'), t('settings.invertY'))],
    [t('settings.fov'), range(55, 95, 1, s.fov, (v) => set((d) => (d.fov = v), 'fov'), t('settings.fov'))],
    [t('settings.gentle'), check(s.gentleMode, (v) => set((d) => (d.gentleMode = v), 'gentleMode'), t('settings.gentle'))],
    [t('settings.reducedMotion'), check(s.reducedMotion, (v) => set((d) => (d.reducedMotion = v), 'reducedMotion'), t('settings.reducedMotion'))],
  ];
  const radios = h('div.radios');
  for (const size of ['s', 'm', 'l'] as const) {
    radios.append(
      h('label', [
        h('input', { type: 'radio', name: 'kq-sub', value: size, checked: s.subtitleSize === size, onchange: () => set((d) => (d.subtitleSize = size), 'subtitleSize') }),
        ` ${t(`settings.subtitles.${size}`)}`,
      ]),
    );
  }
  rows.push([t('settings.subtitles'), radios]);
  for (const ext of settingsExtensions) rows.push(...ext(settings));
  for (const bus of ['master', 'music', 'sfx', 'ambience'] as const) {
    rows.push([t(`settings.volume.${bus}`), range(0, 1, 0.01, s.volume[bus], (v) => set((d) => (d.volume[bus] = v), 'volume'), t(`settings.volume.${bus}`))]);
  }
  return h('div.kq-form', rows.flatMap(([label, input]) => [h('label', label), input]));
}

export function licencesBody(items: AttributionItem[]): HTMLElement[] {
  return [
    h('p', t('licences.intro')),
    h(
      'ul.kq-attrib',
      items.map((it) =>
        h('li', [
          h('span.lbl', `${it.label_de}: `),
          it.text,
          it.licence ? ` — ${it.licence}` : '',
          it.disclaimer_de ? h('em', ` ${it.disclaimer_de}`) : null,
          it.url ? [' ', h('a', { href: it.url, target: '_blank', rel: 'noopener' }, it.url)] : null,
        ]),
      ),
    ),
    h('p', t('licences.fonts')),
    h('p', t('licences.audio')),
    h('p', t('licences.code')),
  ];
}

export function openLicences(deps: Pick<MenuDeps, 'modals' | 'attribution'>): ModalHandle {
  return deps.modals.open({ title: t('licences.title'), body: licencesBody(deps.attribution()), wide: true, actions: [{ label: t('modal.close') }] });
}

/** Pause menu with sub-pages (settings, licences, controls). */
export function openPause(deps: MenuDeps, onClose: () => void): ModalHandle {
  const m = deps.modals.open({ title: t('pause.title'), onClose, className: 'kq-pause' });
  const main = () => {
    m.setBody(
      h('div.kq-menu', [
        h('button.kq-btn.primary', { onclick: () => m.close(), 'data-testid': 'resume' }, t('pause.resume')),
        h('button.kq-btn', { 'data-testid': 'pause-settings', onclick: () => sub(t('settings.title'), settingsForm(deps.settings)) }, t('pause.settings')),
        h('button.kq-btn', { 'data-testid': 'pause-controls', onclick: () => sub(t('controls.title'), controlsBody()) }, t('pause.controls')),
        h('button.kq-btn', { onclick: () => deps.save() && deps.modals.open({ body: t('pause.saved'), actions: [{ label: t('modal.ok') }] }) }, t('pause.save')),
        h('button.kq-btn', { onclick: () => sub(t('licences.title'), licencesBody(deps.attribution())) }, t('pause.licences')),
        h('button.kq-link', { onclick: () => { m.close(); deps.toTitle(); } }, t('pause.toTitle')),
      ]),
      t('pause.title'),
    );
  };
  const sub = (title: string, body: HTMLElement | HTMLElement[]) => {
    m.setBody([...(Array.isArray(body) ? body : [body]), h('div.actions', h('button.kq-btn', { onclick: main }, t('settings.back')))], title);
  };
  main();
  return m;
}
