/**
 * New-game flow on the title screen: content warning (16+) → visitor name → tour map.
 * Starting the tour also unlocks audio.
 * Installed through `titleHooks` (src/ui/title.ts).
 */
import type { SettingsStore } from '../../../core/save';
import { t } from '../../../i18n';
import { h, svg } from '../../../ui/dom';
import { wrapTab } from '../../../ui/focus';
import { settingsForm } from '../../../ui/menus';
import type { ModalManager } from '../../../ui/modal';
import { titleHooks } from '../../../ui/title';

export interface FlowDeps {
  settings: SettingsStore;
  modals: ModalManager;
  /** The chosen name (applied to the story when the new game starts). */
  onName(name: string): void;
}

// Schematic of the tour route in content/story/00-tour.story.json.
const TOUR_MAP = `<svg class="kqs-tour-map" viewBox="0 0 560 248" role="img">
  <rect class="kqs-tour-paper" x="1" y="1" width="558" height="246" rx="3"/>
  <rect class="kqs-tour-frame" x="7" y="7" width="546" height="234" rx="1"/>
  <g class="kqs-tour-contours">
    <path d="M8 46C64 65 92 23 158 25s65 39 117 31 84-42 137-27 91 14 140-2"/>
    <path d="M8 60C62 80 105 41 156 41s64 37 120 28 82-43 136-26 92 13 140-2"/>
    <path d="M8 184c73-18 74-30 115-24s43 64 103 63 69-46 133-43 104 11 193-39"/>
    <path d="M8 199c61-10 82-32 115-26s48 63 101 62 74-46 135-42 118 3 193-40"/>
    <path d="M263 167c14-34 4-64 29-80 32-21 77-10 104-27M270 175c19-33 13-68 31-79 23-15 51-8 75-22"/>
    <path d="M367 218c38-20 86-3 151-35m-107 43c36-9 79-13 141-46"/>
  </g>
  <g class="kqs-tour-water">
    <path d="M357 94c39-12 48 17 81 9 19-5 32-21 54-15" fill="none"/>
    <path d="M307 113c-3-15 14-31 35-30 12 0 15 7 23 10l-9 24c-22-7-42 12-49-4Z"/>
    <path d="M323 99c7-4 14-5 22-4m-27 11c7-1 16-6 27-4" fill="none"/>
  </g>
  <path class="kqs-tour-landmarks" d="M39 149v-12l12-8 13 8v15H38m8 0v-9h7v9
    M148 208l8-19 13-4 10 18m-23-14 8 6 5-10m-5 10-4 12
    M508 84l8-11 8 11v11h-16Z"/>
  <path class="kqs-tour-route" d="M72 122c18 4 32 18 43 33s13 41 37 45
    c13 2 29-10 47-10 27 0 48 1 69-21s40-43 69-41 46 10 74-7 44-41 81-33"/>
  <g class="kqs-tour-stops">
    <circle cx="72" cy="122" r="12"/><text x="72" y="122">1</text>
    <circle cx="199" cy="190" r="12"/><text x="199" y="190">2</text>
    <circle cx="337" cy="128" r="12"/><text x="337" y="128">3</text>
    <circle cx="492" cy="88" r="12"/><text x="492" y="88">4</text>
  </g>
  <g class="kqs-tour-labels">
    <text x="27" y="96" data-stop="hof"/>
    <text x="199" y="227" text-anchor="middle" data-stop="felsenpfad"/>
    <text x="337" y="165" text-anchor="middle" data-stop="weiher"/>
    <text x="530" y="63" text-anchor="end" data-stop="quelle"/>
  </g>
</svg>`;

function screen(...kids: HTMLElement[]): HTMLElement {
  return h('div.kqs-flow', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'new-game-heading' }, kids);
}

export function runNewGameFlow(host: HTMLElement, d: FlowDeps): Promise<false | (() => void)> {
  return new Promise((resolve) => {
    let root: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      root?.remove();
      root = el;
      host.append(el);
      el.addEventListener('keydown', (e) => {
        wrapTab(e, el);
        if (e.key === 'Escape' && !e.repeat) {
          e.preventDefault();
          cancel();
        }
      });
      queueMicrotask(() => el.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
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
      h('div.kqs-flow-card.kq-paper', { 'data-testid': 'content-warning' }, [
        h('div.kqs-warning-heading', [
          h('h2#new-game-heading', t('story.warning.title')),
          h('span.kqs-age', t('story.warning.age')),
        ]),
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
        value: t('story.name.default'),
        placeholder: t('story.name.title'),
        'aria-label': t('story.name.title'),
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
        show(tourMapScreen(name));
      };
      ok.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          submit();
        }
      });
      input.addEventListener('input', () => (ok.disabled = !input.value.trim()));
      queueMicrotask(() => input.select());
      return screen(
        h('div.kqs-flow-card.kq-paper', [
          h('h2#new-game-heading', t('story.name.title')),
          input,
          h('div.actions', [h('button.kq-btn', { onclick: () => show(warning) }, t('story.warning.back')), ok]),
        ]),
      );
    };

    // 3 — preview the route and start
    const tourMapScreen = (visitorName: string) => {
      const map = svg(TOUR_MAP);
      const stops = Array.from(map.querySelectorAll('[data-stop]'), (label) => {
        const name = t(`story.tourMap.stop.${label.getAttribute('data-stop')}`);
        label.textContent = name;
        return name;
      });
      map.setAttribute('aria-label', stops.join(' → '));
      const start = h('button.kq-btn.primary', { 'data-testid': 'start-tour', 'data-autofocus': '' }, t('story.tourMap.start'));
      start.addEventListener('click', () => {
        root?.remove();
        // Resolve within the start gesture so boot can unlock Web Audio.
        resolve(() => d.onName(visitorName));
      }, { once: true });
      return screen(h('div.kqs-flow-card.kq-paper.kqs-tour-card', { 'data-testid': 'tour-map' }, [
        h('h2#new-game-heading', t('story.tourMap.title')),
        map,
        start,
      ]));
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
