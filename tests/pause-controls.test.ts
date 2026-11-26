import { afterEach, expect, it, vi } from 'vitest';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { h } from '../src/ui/dom';
import { openPause } from '../src/ui/menus';
import { ModalManager } from '../src/ui/modal';
import { addPausePage, addPageSection, openPausePage, pageSections, pausePageHandle, refreshPausePage } from '../src/ui/pause-pages';
import { settingsForm } from '../src/ui/settings';
import { installPageDom } from './ui-fixture';

afterEach(() => vi.unstubAllGlobals());

function pause() {
  const root = installPageDom();
  const modals = new ModalManager(root.element);
  const onClose = vi.fn();
  const settings = new SettingsStore(new MemoryStorage());
  const save = vi.fn(() => false);
  const menu = openPause({ modals, settings, save, attribution: () => [], toTitle: vi.fn() }, onClose);
  return { root, modals, save, menu, onClose };
}

function escape(repeat = false) {
  window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'Escape', repeat }));
}

it('keeps the game paused until the final close and only acknowledges a successful manual save', () => {
  const { root, modals, menu, save, onClose } = pause();
  root.byId('pause-save').click();
  expect(save).toHaveBeenCalledOnce();
  expect(modals.count).toBe(1);
  save.mockReturnValue(true);
  root.byId('pause-save').click();
  expect(modals.count).toBe(2);
  expect(modals.backdrop).toBe('still');
  escape(true);
  expect(modals.count).toBe(2);
  escape();
  expect(modals.count).toBe(1);
  expect(menu.closed).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  root.byId('resume').click();
  expect(modals.backdrop).toBe('none');
  expect(onClose).toHaveBeenCalledOnce();
});

it('opens a destination once, preserves scroll on refresh and updates the menu badge on return', () => {
  let unread = 2;
  const render = vi.fn((body: HTMLElement) => {
    body.textContent = String(unread);
    body.parentElement!.scrollTop = 0;
  });
  const opened = vi.fn(), hide = vi.fn();
  addPausePage({ id: 'letters', label: 'Briefe', order: 15, render, opened, hide, badge: () => unread });
  const { root, modals, menu } = pause();
  const entry = root.byId('pause-letters');
  const badge = entry.children.at(-1)!;
  expect(badge.textContent).toBe('2');
  expect(badge.hidden).toBe(false);
  entry.click();
  const first = pausePageHandle('letters')!;
  expect(openPausePage(modals, 'letters')).toBe(first);
  expect(opened).toHaveBeenCalledOnce();
  expect(modals.count).toBe(2);
  const body = render.mock.lastCall![0];
  body.parentElement!.scrollTop = 41;
  unread = 0; refreshPausePage('letters');
  expect(body.textContent).toBe('0');
  expect(body.parentElement!.scrollTop).toBe(41);
  first.close(); first.close();
  expect(hide).toHaveBeenCalledOnce();
  expect(pausePageHandle('letters')).toBeUndefined();
  expect(badge.hidden).toBe(true);
  refreshPausePage('letters');
  expect(render).toHaveBeenCalledTimes(2);
  menu.close();
});

it('renders contributed sections in order and replaces registrations instead of duplicating them', () => {
  installPageDom();
  const section = (id: string, order: number, text: string | null) =>
    addPageSection({ id, page: 'shelf', order, render: () => text === null ? null : h('p', text) });
  section('find', 20, 'Alt'); section('bottle', 10, 'Flaschen'); section('empty', 1, null);
  section('find', 30, 'Funde');
  expect(pageSections('shelf').map(el => el.textContent)).toEqual(['Flaschen', 'Funde']);
  expect(pageSections('other')).toEqual([]);
});

it('restores muted audio and uncapped FPS and uses the live motion preference for section jumps', () => {
  const root = installPageDom();
  const storage = new MemoryStorage();
  const store = new SettingsStore(storage);
  const musicVolume = store.state.volume.music;
  root.element.append(settingsForm(store));
  const voice = root.byId('vol-voice');
  voice.value = '0'; voice.dispatchEvent(new Event('input'));
  expect(voice.getAttribute('aria-valuetext')).toBe('0 %');
  expect(voice.parentElement?.textContent).toBe('0 %');
  const fps = () => root.byId('set-fps').all(node => node.tag === 'input');
  fps().find(node => node.value === '0')!.dispatchEvent(new Event('change'));
  const motion = root.byId('set-motion');
  motion.checked = true; motion.dispatchEvent(new Event('change'));
  root.byId('set-nav-audio').click();
  const section = root.all(node => node.getAttribute('data-section') === 'audio')[0]!;
  expect(section.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  const saved = new SettingsStore(storage);
  expect(saved.state.volume.voice).toBe(0);
  expect(saved.state.volume.music).toBe(musicVolume);
  root.element.replaceChildren(settingsForm(saved));
  expect(root.byId('vol-voice').value).toBe('0');
  expect(fps().filter(node => node.checked).map(node => node.value)).toEqual(['0']);
  expect(root.byId('set-motion').checked).toBe(true);
});
