import { SPEAKER_PERMISSION_NOTICE, type LicencesFile, type VoiceCredit } from '../assets/types';
import type { SettingsStore } from '../core/save';
import type { AttributionItem } from '../data/types';
import { t } from '../i18n';
import { type Action, effectiveBindings } from '../player/input';
import { h } from './dom';
import type { ModalHandle, ModalManager } from './modal';
import { openPausePage, pausePages } from './pause-pages';

export interface MenuDeps {
  modals: ModalManager;
  settings: SettingsStore;
  attribution: () => AttributionItem[];
  save: () => boolean;
  toTitle: () => void;
}

export { SETTINGS_SECTIONS, type SettingsRow, type SettingsSection, addSettingsRows, settingsForm } from './settings';
import { keyLabel, refreshOnKeyboardLayout, settingsForm } from './settings';

interface ControlRow {
  id: string;
  actions?: readonly Action[];
}

const CONTROL_ROWS: ControlRow[] = [
  { id: 'move', actions: ['forward', 'left', 'back', 'right'] },
  { id: 'turn', actions: ['lookLeft', 'lookRight', 'lookUp', 'lookDown'] },
  { id: 'run', actions: ['sprint'] },
  { id: 'sneak', actions: ['crouch'] },
  { id: 'prone', actions: ['prone'] },
  { id: 'spirit', actions: ['fly'] },
  { id: 'scan', actions: ['scan'] },
  { id: 'map', actions: ['map'] },
  { id: 'listen', actions: ['listen'] },
  { id: 'examine', actions: ['interact'] },
  { id: 'shift', actions: ['shift'] },
  { id: 'lantern', actions: ['lantern'] },
  { id: 'inventory', actions: ['inventory'] },
  { id: 'measure', actions: ['measure'] },
  { id: 'pause' },
];

/** Feature rows register `ui.keys.<id>` and use `.key` for fixed shortcuts outside Input. */
export function addControlKeys(...rows: ControlRow[]): void {
  for (const row of rows) if (!CONTROL_ROWS.some(({ id }) => id === row.id)) CONTROL_ROWS.push(row);
}

function scanKeyLabels(codes: readonly string[], layout?: ReadonlyMap<string, string>): string[] {
  const forward: string[] = [];
  const reverse: string[] = [];
  for (const code of codes) {
    const key = keyLabel(code, layout);
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      reverse.push(t('ui.keys.scan.reverseOnly', { key }));
    } else {
      forward.push(`[${key}]`);
      reverse.push(`[${t('ui.keys.scan.reverse', { key })}]`);
    }
  }
  return [...forward, ...reverse];
}

export function controlKeyRows(overrides: Record<string, string[]>, layout?: ReadonlyMap<string, string>) {
  const bindings = effectiveBindings(overrides);
  return CONTROL_ROWS.map(({ id, actions }) => {
    const keys = actions?.map((action) => {
      const codes = bindings[action];
      const labels = action === 'scan'
        ? scanKeyLabels(codes, layout)
        : codes.map((code) => `[${keyLabel(code, layout)}]`);
      return labels.length ? labels.join(' / ') : t('settings.keys.none');
    }).join(' · ') ?? t(`ui.keys.${id}.key`);
    return { id, keys, description: t(`ui.keys.${id}`) };
  });
}

export function controlsBody(settings: SettingsStore): HTMLElement {
  const body = h('tbody');
  const render = () => body.replaceChildren(
    ...controlKeyRows(settings.state.bindings).map(({ keys, description }) => h('tr', [h('td.k', keys), h('td', description)])),
  );
  render();
  refreshOnKeyboardLayout(render);
  return h('table.kq-keys', { 'data-testid': 'key-help' }, body);
}

let assetLicences: LicencesFile | null = null;
/** public/assets/LICENSES.json, read at boot (AssetLoader.licences); shown under "Lizenzen & Quellen". */
export function setAssetLicences(f: LicencesFile | null): void {
  assetLicences = f;
}

export function voiceLicencesSummary(voices: readonly VoiceCredit[]): string {
  const summaries: string[] = [];
  const synthetic = voices.filter((voice) => voice.outputLicence === 'CC0-1.0');
  if (synthetic.length) {
    const names = synthetic.map((voice) => voice.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('licences.voices.and')} ${names.at(-1)}` : names[0]!;
    const tools = [...new Set(synthetic.map((voice) => `${voice.tool.replace(/\s*\(.*\)$/, '')} (${voice.toolLicence})`))].join(', ');
    summaries.push(t('licences.voices.summary', { names: list, tools }));
  }
  for (const { name, outputLicence } of voices) {
    if (outputLicence === SPEAKER_PERMISSION_NOTICE) summaries.push(t('licences.voices.speakerPermission', { name }));
  }
  return summaries.join(' ');
}

/** The voices (LICENSES.json `voices`): a licence summary plus one entry per voice. */
export function voiceLicencesBody(f: LicencesFile | null = assetLicences): HTMLElement[] {
  const v = f?.voices ?? [];
  if (!v.length) return [];
  const summary = voiceLicencesSummary(v);
  return [
    h('h3', t('licences.voices.title')),
    ...(summary ? [h('p', { 'data-testid': 'voice-licences-summary' }, summary)] : []),
    h(
      'ul.kq-attrib',
      { 'data-testid': 'voice-licences' },
      v.map((x) => h('li', [h('span.lbl', `${x.name}: `), t('licences.voices.entry', { tool: x.tool, toolLicence: x.toolLicence, outputLicence: x.outputLicence, seed: x.seed, ref: x.referenceSha256.slice(0, 8) })])),
    ),
  ];
}

/** The CC0 art assets, the decoder libraries and the voices (empty when LICENSES.json is missing). */
export function assetLicencesBody(f: LicencesFile | null = assetLicences): HTMLElement[] {
  if (!f || (!f.assets.length && !f.libraries?.length && !f.voices?.length)) return [];
  if (!f.assets.length && !f.libraries?.length) return voiceLicencesBody(f);
  return [
    h('h3', t('licences.assets.title')),
    h('p', t('licences.assets.intro')),
    h(
      'ul.kq-attrib',
      { 'data-testid': 'asset-licences' },
      [
        ...f.assets.map((a) => h('li', [h('span.lbl', `${a.name}: `), `${a.author} — ${a.licence} `, h('a', { href: a.source, target: '_blank', rel: 'noopener' }, a.source), a.modified ? h('em', ` (${a.modified})`) : null])),
        ...(f.procedural ?? []).map((a) => h('li', [h('span.lbl', `${a.name}: `), `${a.author} — ${a.licence}`])),
      ],
    ),
    ...(f.libraries?.length ? [h('ul.kq-attrib', f.libraries.map((l) => h('li', [h('span.lbl', `${l.name}: `), `${l.licence} — ${l.source}`])))] : []),
    ...voiceLicencesBody(f),
  ];
}

/** The OFL texts, copied from src/ui/fonts to public/fonts so they ship in dist (relative to index.html). */
const OFL_TEXTS = ['fonts/OFL-IMFell.txt', 'fonts/OFL-Caveat.txt'];

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
          it.files?.length ? h('em', ` ${t('licences.files')} ${it.files.join(', ')}`) : null,
        ]),
      ),
    ),
    ...assetLicencesBody(),
    h('p', [
      t('licences.fonts'),
      ` ${t('licences.fonts.texts')} `,
      ...OFL_TEXTS.flatMap((f, i) => [i ? ' · ' : '', h('a', { href: f, target: '_blank', rel: 'noopener' }, f)]),
    ]),
    h('p', t('licences.audio')),
    h('p', t('licences.code')),
    h('p', t('licences.trademarks')),
  ];
}

export function openLicences(deps: Pick<MenuDeps, 'modals' | 'attribution'>): ModalHandle {
  return deps.modals.open({ title: t('licences.title'), body: licencesBody(deps.attribution()), wide: true, backdrop: 'still', actions: [{ label: t('modal.close') }] });
}

/** Extra pause-menu entries features add (e.g. "Ende noch einmal wählen" after the credits). */
export interface PauseAction {
  label: string;
  testid: string;
  run(): void;
}
export const pauseHooks: { extraActions?(): PauseAction[] } = {};

/** F8 notes (src/systems/notes): "Notizen exportieren (n)" and "Notizen löschen" in the pause menu. */
export const notesPauseHooks: { count?(): number; exportAll?(): void; clearAll?(): Promise<void> } = {};

/** Pause menu with sub-pages (settings, licences, controls). */
export function openPause(deps: MenuDeps, onClose: () => void): ModalHandle {
  const m = deps.modals.open({ title: t('pause.title'), onClose, className: 'kq-pause', backdrop: 'still' });
  m.el.dataset.testid = 'pause-menu';
  const destinations = () => {
    const group = h('div.kq-pause-destinations');
    const refreshBadges: (() => void)[] = [];
    for (const page of pausePages()) {
      const badge = h('span.kq-pause-badge');
      const refresh = () => {
        const n = page.badge?.() ?? 0;
        badge.textContent = String(n);
        badge.hidden = n === 0;
      };
      refreshBadges.push(refresh);
      refresh();
      const button = h('button.kq-btn', {
        'data-testid': `pause-${page.id}`,
        onclick: () => {
          button.focus();
          openPausePage(deps.modals, page.id, () => refreshBadges.forEach((update) => update()));
        },
      }, [page.label, badge]);
      group.append(button);
    }
    return group;
  };
  const main = () => {
    m.setBody(
      h('div.kq-menu', [
        h('button.kq-btn.primary', { onclick: () => m.close(), 'data-testid': 'resume' }, t('pause.resume')),
        ...(pauseHooks.extraActions?.() ?? []).map((a) => h('button.kq-btn', { 'data-testid': a.testid, onclick: () => (m.close(), a.run()) }, a.label)),
        destinations(),
        h('button.kq-btn', { 'data-testid': 'pause-settings', onclick: () => sub(t('settings.title'), settingsForm(deps.settings)) }, t('pause.settings')),
        h('button.kq-btn', { 'data-testid': 'pause-controls', onclick: () => sub(t('controls.title'), controlsBody(deps.settings)) }, t('pause.controls')),
        h('button.kq-btn', { 'data-testid': 'pause-save', onclick: () => deps.save() && deps.modals.open({ body: t('pause.saved'), backdrop: 'still', actions: [{ label: t('modal.ok') }] }) }, t('pause.save')),
        ...notesButtons(),
        h('button.kq-btn', { onclick: () => sub(t('licences.title'), licencesBody(deps.attribution())) }, t('pause.licences')),
        h('button.kq-link', { onclick: () => { m.close(); deps.toTitle(); } }, t('pause.toTitle')),
      ]),
      t('pause.title'),
    );
  };
  const notesButtons = (): HTMLElement[] => {
    const nh = notesPauseHooks;
    if (!nh.exportAll || !nh.count) return [];
    const n = nh.count();
    return [
      h('button.kq-btn', { 'data-testid': 'pause-notes-export', disabled: n === 0 ? true : undefined, onclick: () => nh.exportAll?.() }, t('notes.export', { n: String(n) })),
      ...(n > 0 && nh.clearAll
        ? [
            h('button.kq-link', {
              'data-testid': 'pause-notes-clear',
              onclick: () =>
                void deps.modals.confirm(t('notes.clear.confirm', { n: String(n) })).then(async (yes) => {
                  if (!yes) return;
                  await nh.clearAll?.();
                  if (!m.closed) main();
                }),
            }, t('notes.clear')),
          ]
        : []),
    ];
  };
  const sub = (title: string, body: HTMLElement | HTMLElement[]) => {
    m.setBody([...(Array.isArray(body) ? body : [body]), h('div.actions', h('button.kq-btn', { onclick: main }, t('settings.back')))], title);
  };
  main();
  return m;
}
