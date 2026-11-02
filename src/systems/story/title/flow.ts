/**
 * New-game flow on the title screen (bible P0): content warning (16+) → name entry for the
 * surveyor → a dark trailer and a match: "Laterne anzünden" (the click also unlocks audio).
 * Installed through `titleHooks` (src/ui/title.ts).
 */
import type { SettingsStore } from '../../../core/save';
import { t } from '../../../i18n';
import { h, svg } from '../../../ui/dom';
import { settingsForm } from '../../../ui/menus';
import type { ModalManager } from '../../../ui/modal';
import { titleHooks } from '../../../ui/title';

export interface FlowDeps {
  settings: SettingsStore;
  modals: ModalManager;
  /** The chosen name (applied to the story when the new game starts). */
  onName(name: string): void;
}

/** A storm lantern (Sturmlaterne), etched: bail, brass cap, glass globe in a wire guard, tank. */
const LANTERN_BIG = `<svg viewBox="0 0 160 220" class="kqs-lantern-svg" aria-hidden="true">
  <defs>
    <radialGradient id="kqs-flame-g" cx="50%" cy="65%" r="60%"><stop offset="0" stop-color="#fff4c9"/><stop offset=".45" stop-color="#ffb347"/><stop offset="1" stop-color="#d0541c" stop-opacity="0"/></radialGradient>
    <radialGradient id="kqs-globe-g" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset=".7" stop-color="#ff9a3a" stop-opacity=".12"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
  </defs>
  <circle class="kqs-l-halo" cx="80" cy="112" r="100" fill="url(#kqs-glow)"/>
  <path d="M42 76C38 30 122 30 118 76" fill="none" stroke="#8f7a52" stroke-width="2.6"/>
  <path d="M40 76h8M112 76h8" stroke="#8f7a52" stroke-width="3"/>
  <path d="M54 68Q80 46 106 68L102 78H58Z" fill="url(#kqs-brass)" stroke="#1a120c" stroke-width="1.6"/>
  <path d="M54 68Q80 46 106 68L102 78H58Z" fill="url(#kqs-hb)" opacity=".5"/>
  <rect x="72" y="50" width="16" height="7" rx="2" fill="url(#kqs-brass)" stroke="#1a120c"/>
  <path d="M60 80C42 102 42 134 62 152H98C118 134 118 102 100 80Z" fill="#20180f" opacity=".55"/>
  <path class="kqs-l-flame" d="M60 80C42 102 42 134 62 152H98C118 134 118 102 100 80Z" fill="url(#kqs-globe-g)"/>
  <path d="M60 80C42 102 42 134 62 152H98C118 134 118 102 100 80Z" fill="none" stroke="#d8c9a6" stroke-width="1.6" opacity=".8"/>
  <path d="M66 86C56 104 56 128 68 146" fill="none" stroke="#fff6dc" stroke-width="2" opacity=".35" stroke-linecap="round"/>
  <g fill="none" stroke="#8f7a52" stroke-width="1.8"><path d="M52 92C44 110 44 128 56 146"/><path d="M108 92C116 110 116 128 104 146"/><path d="M80 80V152"/><path d="M48 116H112"/></g>
  <g class="kqs-l-flame"><path d="M80 98c9 12 11 20 11 26a11 11 0 0 1-22 0c0-6 2-14 11-26z" fill="url(#kqs-flame-g)"/><path d="M80 112c4 5 5 9 5 12a5 5 0 0 1-10 0c0-3 1-6 5-12z" fill="#fff6d8"/></g>
  <rect x="74" y="134" width="12" height="16" rx="2" fill="#6a4a18" stroke="#1a120c"/>
  <path d="M44 152H116L124 182Q80 198 36 182Z" fill="url(#kqs-brass)" stroke="#1a120c" stroke-width="1.8"/>
  <path d="M44 152H116L124 182Q80 198 36 182Z" fill="url(#kqs-h2)" opacity=".45"/>
  <path d="M40 166Q80 174 120 166" fill="none" stroke="#1a120c" stroke-width="1" opacity=".6"/>
  <rect x="108" y="140" width="6" height="14" fill="#5a4a30" stroke="#1a120c"/>
</svg>`;

const MATCHBOX = `<svg viewBox="0 0 130 70" class="kqs-matchbox" aria-hidden="true">
  <path d="M8 30L96 22L108 34L20 44Z" fill="#9a3a26" stroke="#1a120c" stroke-width="1.6"/>
  <path d="M20 44L108 34V50L20 62Z" fill="#7c3022" stroke="#1a120c" stroke-width="1.6"/>
  <path d="M8 30L20 44V62L8 46Z" fill="#5a2418" stroke="#1a120c" stroke-width="1.6"/>
  <path d="M30 41L86 35L92 41L36 47Z" fill="#e8dcc0" stroke="#1a120c"/>
  <path d="M20 44L108 34V50L20 62Z" fill="url(#kqs-h1)" opacity=".3"/>
  <g class="kqs-match"><path d="M44 64L112 56" stroke="#d8c19a" stroke-width="3.2" stroke-linecap="round"/><circle cx="114" cy="55.6" r="3.4" fill="#8c2f1f"/></g>
</svg>`;

function screen(cls: string, ...kids: (HTMLElement | null)[]): HTMLElement {
  return h(`div.kqs-flow.${cls}`, kids);
}

export function runNewGameFlow(host: HTMLElement, d: FlowDeps): Promise<boolean> {
  return new Promise((resolve) => {
    let root: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      root?.remove();
      root = el;
      host.append(el);
      queueMicrotask(() => (el.querySelector('[data-autofocus]') as HTMLElement | null)?.focus());
    };
    const cancel = () => {
      root?.remove();
      resolve(false);
    };

    // 1 — content warning
    const gentle = h('input', {
      type: 'checkbox',
      checked: d.settings.state.gentleMode,
      'data-testid': 'warning-gentle',
      onchange: (e: Event) => d.settings.update((s) => (s.gentleMode = (e.target as HTMLInputElement).checked), 'gentleMode'),
    });
    const warning = screen(
      'kqs-warning',
      h('div.kqs-flow-card.kq-paper', { 'data-testid': 'content-warning' }, [
        h('div.kqs-age', t('story.warning.age')),
        h('h2', t('story.warning.title')),
        h('p', t('story.warning.body1')),
        h('p', t('story.warning.body2')),
        h('p.kqs-fic', t('story.warning.body3')),
        h('label.kqs-gentle', [gentle, ` ${t('story.warning.gentle')}`]),
        h('div.actions', [
          h('button.kq-btn', { onclick: cancel }, t('story.warning.back')),
          h('button.kq-btn.primary', { 'data-testid': 'warning-accept', 'data-autofocus': '', onclick: () => show(nameScreen()) }, t('story.warning.accept')),
        ]),
      ]),
    );

    // 2 — name entry
    const nameScreen = () => {
      const input = h('input.kqs-name-input', {
        type: 'text',
        maxlength: 24,
        value: t('story.name.suggest'),
        placeholder: t('story.name.placeholder'),
        'aria-label': t('story.name.placeholder'),
        'data-testid': 'player-name',
        'data-autofocus': '',
        autocomplete: 'off',
        spellcheck: 'false',
      });
      const ok = h('button.kq-btn.primary', { 'data-testid': 'name-confirm' }, t('story.name.confirm'));
      const submit = () => {
        const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 24);
        if (!name) {
          input.focus();
          return;
        }
        d.onName(name);
        show(lanternScreen());
      };
      ok.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') submit();
      });
      input.addEventListener('input', () => (ok.disabled = !input.value.trim()));
      queueMicrotask(() => input.select());
      return screen(
        'kqs-namepage',
        h('div.kqs-flow-card.kq-paper.kqs-fieldbook', [
          h('h2', t('story.name.title')),
          h('p', t('story.name.prompt')),
          h('p.kqs-name-label', t('story.name.label')),
          input,
          h('div.actions', [h('button.kq-btn', { onclick: () => show(warning) }, t('story.warning.back')), ok]),
        ]),
      );
    };

    // 3 — light the lantern
    const lanternScreen = () => {
      const lantern = h('div.kqs-lantern-stage', [svg(LANTERN_BIG), svg(MATCHBOX)]);
      const btn = h('button.kq-btn.primary.kqs-light', { 'data-testid': 'light-lantern', 'data-autofocus': '' }, t('story.lantern.light'));
      const el = screen('kqs-dark', h('p.kqs-dark-title', t('story.lantern.title')), lantern, btn, h('p.kqs-dark-hint', t('story.lantern.hint')));
      btn.addEventListener('click', () => {
        el.classList.add('kqs-lit');
        btn.disabled = true;
        // resolve inside the gesture so the game can unlock audio
        resolve(true);
        setTimeout(() => el.remove(), 2200);
      });
      return el;
    };

    show(warning);
  });
}

export function installTitleFlow(d: FlowDeps): void {
  titleHooks.beforeNewGame = (host) => runNewGameFlow(host, d);
  titleHooks.openSettings = () => {
    d.modals.open({ title: t('settings.title'), body: settingsForm(d.settings), actions: [{ label: t('modal.close'), primary: true }] });
  };
}
