import { PerspectiveCamera, Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager, SettingsStore } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import forage from '../src/systems/forage';
import { createProgressionSlice } from '../src/systems/progression/logic';
import quests from '../src/systems/quests';
import { ObjectiveView } from '../src/systems/story/objectives';
import { createStorySlice } from '../src/systems/story/engine';
import { ENDING_SLOT, endingTitleActions } from '../src/systems/story/title/actions';
import { Hud } from '../src/ui/hud';
import { TitleScreen, titleHooks } from '../src/ui/title';
import { TouchControls, type TouchDeps } from '../src/ui/touch';

class ElementStub {
  className = '';
  readonly style = Object.assign({} as Record<string, string>, { setProperty: () => {} });
  readonly dataset: Record<string, string> = {};
  readonly children: ElementStub[] = [];
  readonly attributes = new Map<string, string>();
  readonly clientWidth = 540;
  readonly classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    toggle: (name: string, on: boolean) => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      if (on) classes.add(name);
      else classes.delete(name);
      this.className = [...classes].join(' ');
    },
    add: (name: string) => this.classList.toggle(name, true),
    remove: (name: string) => this.classList.toggle(name, false),
  };

  get disabled(): boolean { return this.attributes.has('disabled'); }
  set disabled(on: boolean) { this.toggleAttribute('disabled', on); }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  toggleAttribute(name: string, on: boolean): void {
    if (on) this.attributes.set(name, '');
    else this.attributes.delete(name);
  }
  append(...children: ElementStub[]): void { this.children.push(...children); }
  appendChild(child: ElementStub): void { this.append(child); }
  replaceChildren(...children: ElementStub[]): void { this.children.splice(0, this.children.length, ...children); }
  querySelector(_selector?: string): ElementStub | null { return null; }
  querySelectorAll(): ElementStub[] { return []; }
  remove(): void {}
  addEventListener(): void {}
  focus(): void {}

  find(test: (el: ElementStub) => boolean): ElementStub | undefined {
    if (test(this)) return this;
    for (const child of this.children) {
      const match = child.find(test);
      if (match) return match;
    }
  }
}

let root: ElementStub;
beforeEach(() => {
  root = new ElementStub();
  vi.stubGlobal('Node', ElementStub);
  vi.stubGlobal('document', {
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: root,
    body: root,
    activeElement: root,
    createElement: (tag: string) => tag === 'template' ? { content: { firstElementChild: new ElementStub() } } : new ElementStub(),
    createTextNode: () => new ElementStub(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tour compass', () => {
  it('refreshes the tracked story waypoint on the first frame after the Weiher handoff', () => {
    const hud = new Hud();
    const state = new GameStateStore(createInitialState());
    const events = new EventBus();
    const weiher = { text: 'Der Gruppe folgen: zum Karlsbergweiher', x: 900, z: -850 };
    const quelle = { text: 'Der Gruppe folgen: hinauf zur Karlsbergquelle', x: 1059.3, z: -833.1 };
    const story = Object.assign(createStorySlice(), { active: true, chapter: 'tour', beat: 't13', objective: weiher });
    state.mutable.systems.story = story;
    const hooks: { quests?: NonNullable<typeof window.kq>['quests'] } = {};
    vi.stubGlobal('window', { kq: hooks, innerWidth: 1280, innerHeight: 720 });
    const ctx = {
      state, events, params: new URLSearchParams(), scene: new Scene(), camera: new PerspectiveCamera(),
      era: { current: 'today' }, player: { position: { x: 890, z: -830 } },
      world: { heightAt: () => 0, collider: { enabled: false } },
      settings: { state: { reducedMotion: false } },
      ui: { hud, layer: () => new ElementStub(), modals: { count: 0 } },
    } as unknown as GameContext;
    quests.init(ctx);
    try {
      quests.frame(1 / 60);
      expect(hooks.quests?.lead()?.label).toBe(weiher.text);
      const oldBearing = hooks.quests?.markers().find(({ id }) => id === 'kqq:obj')?.bearing;
      expect(oldBearing).toBeDefined();

      story.beat = 't14';
      story.objective = quelle;
      events.emit('objective:set', { ...quelle, id: 'tour' });
      quests.frame(1 / 60);

      expect(hooks.quests?.lead()).toMatchObject({ label: quelle.text, x: quelle.x, z: quelle.z });
      expect(hud.waymark.target).toMatchObject({ x: quelle.x, z: quelle.z });
      const bearing = hooks.quests?.markers().find(({ id }) => id === 'kqq:obj')?.bearing;
      expect(bearing).toBeCloseTo(89, 0);
    } finally {
      quests.dispose();
    }
  });

  it('shows the moving group waypoint distance in the objective line', () => {
    const hud = new Hud();
    const goal = { id: 'tour', text: 'Der Gruppe folgen', x: 40, z: 0 };
    const view = new ObjectiveView(root as unknown as HTMLElement, hud);
    view.set(goal);
    const group = { x: 3, z: 4, y: 0, r: 3, kind: 'zone', main: true, label: goal.text } as const;
    hud.waymark.set(group);
    hud.questLead = { target: group, story: goal, movingGroup: true };
    view.frame(1 / 60, 0, 0, 0, { compass: false, visible: true, reducedMotion: false });
    expect(view.line).toBe('Der Gruppe folgen · 5 m');

    const closer = { ...group, x: 0, z: 1 };
    hud.waymark.set(closer);
    hud.questLead = { target: closer, story: goal, movingGroup: true };
    view.frame(1 / 60, 0, 0, 0, { compass: false, visible: true, reducedMotion: false });
    expect(view.line).toBe('Der Gruppe folgen');
  });

  it('points the Bussole at the foot of the steps on a story-led door route', () => {
    const needle = new ElementStub();
    vi.spyOn(ElementStub.prototype, 'querySelector').mockImplementation((selector?: string) =>
      selector === '.kqs-b-needle' ? needle : null);
    const hud = new Hud();
    const goal = { id: 'registratur', text: 'In die Registratur', x: 0, z: -20 };
    const view = new ObjectiveView(root as unknown as HTMLElement, hud);
    view.set(goal);
    hud.questLead = { target: { x: 13.4, z: 0 }, story: goal };
    hud.waymark.set({ x: 0, y: 2, z: -14, r: 1.5, kind: 'zone', main: true, label: goal.text });

    view.frame(1 / 60, 0, 0, 0, { compass: true, visible: true, reducedMotion: true });

    expect(needle.attributes.get('transform')).toBe('rotate(90.00 50 50)');
    expect(view.line).toBe('In die Registratur · 15 m');
  });

  it('keeps the guide on the second row when looking ahead or when both markers clamp to the same edge', () => {
    const hud = new Hud();
    hud.setMarker('objective', 25, undefined, { kind: 'obj', edge: true, dist: 120 });
    hud.setMarker('guide', 25, undefined, { kind: 'obj', edge: true, labelRow: 2, label: 'Gruppe', dist: 45 });
    const el = hud.el as unknown as ElementStub;
    const guide = el.find((node) => node.dataset.marker === 'guide')!;
    const objective = el.find((node) => node.dataset.marker === 'objective')!;
    hud.setHeading(25);
    expect([guide.dataset.side, objective.dataset.side]).toEqual([undefined, undefined]);
    expect(guide.style.left).toBe(objective.style.left);
    expect(guide.className).toBe('kq-compass-marker kqq-cm kqq-cm-obj kq-compass-label-second');
    expect(objective.classList.contains('kq-compass-label-second')).toBe(false);
    hud.setHeading(135);
    expect([guide.dataset.side, objective.dataset.side]).toEqual(['l', 'l']);
    expect(guide.style.left).toBe(objective.style.left);
    expect(guide.classList.contains('kq-compass-label-second')).toBe(true);
  });

  it('writes the marker classes only when its kind or row changes', () => {
    const hud = new Hud();
    hud.setMarker('guide', 25, undefined, { kind: 'obj', edge: true, labelRow: 2 });
    const guide = (hud.el as unknown as ElementStub).find((el) => el.dataset.marker === 'guide')!;
    let classes = guide.className;
    const writeClasses = vi.fn((value: string) => { classes = value; });
    Object.defineProperty(guide, 'className', { get: () => classes, set: writeClasses });
    hud.setMarker('guide', 25, undefined, { kind: 'obj', edge: true, labelRow: 2 });
    hud.setMarker('guide', 35, undefined, { kind: 'obj', edge: true, labelRow: 2 });
    expect(writeClasses).not.toHaveBeenCalled();
    hud.setMarker('guide', 35, undefined, { kind: 'ready', edge: true, labelRow: 2 });
    hud.setMarker('guide', 35, undefined, { kind: 'ready', edge: true });
    expect(writeClasses.mock.calls).toEqual([
      ['kq-compass-marker kqq-cm kqq-cm-ready kq-compass-label-second'],
      ['kq-compass-marker kqq-cm kqq-cm-ready'],
    ]);
  });
});

it('renders the saved ending action disabled on the first title, then enables it in the same menu', () => {
  const store = new GameStateStore(createInitialState());
  const save = new SaveManager(store, new MemoryStorage());
  store.mutable.systems.story = { ...createStorySlice(), chapter: 'enden', beat: 'e1' };
  save.save(ENDING_SLOT);
  save.autosave('ordinary', true);
  expect(endingTitleActions(save)).toEqual([]);
  store.mutable.systems.story.ending = 'museum';
  store.mutable.systems.story.finished = true;
  save.autosave('credits', true);
  const settings = titleHooks.openSettings;
  titleHooks.openSettings = () => {};
  try {
    const title = new TitleScreen({
      save, onStart: () => {}, onLicences: () => {}, confirm: async () => false, extraActions: () => endingTitleActions(save),
    });
    const el = title.el as unknown as ElementStub;
    const extras = el.find((node) => node.classList.contains('kq-title-extras'))!;
    const replay = () => extras.find((node) => node.attributes.get('data-testid') === 'title-ending-again');
    expect(extras.classList.contains('kq-hidden')).toBe(false);
    expect(replay()?.disabled).toBe(true);
    title.setReady();
    expect(extras.classList.contains('kq-hidden')).toBe(false);
    expect(replay()?.disabled).toBe(false);
  } finally {
    titleHooks.openSettings = settings;
  }
  expect(endingTitleActions(save)[0]?.run()).toBe(true);
  expect(store.state.systems.story).toMatchObject({ ending: null, finished: false });
});

it.each([true, false])('uses the touch HUD on a 667 × 375 viewport with a coarse pointer: %s', (coarse) => {
  vi.stubGlobal('window', { innerWidth: 667, innerHeight: 375, addEventListener() {} });
  vi.stubGlobal('MutationObserver', class { observe(): void {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));
  const input = { touchMode: false, releaseVirtual() {} };
  const controls = new TouchControls({
    input: input as TouchDeps['input'],
    settings: new SettingsStore(new MemoryStorage()),
    hud: new Hud(),
    events: new EventBus(),
    root: root as unknown as HTMLElement,
    openPause: () => {},
    dismissNoticeAt: () => {},
    canFly: () => false,
    flying: () => false,
    measuring: () => false,
  });
  controls.setPlaying(true);
  expect(input.touchMode).toBe(coarse);
  expect(root.attributes.has('data-kq-touch')).toBe(coarse);
  expect(root.attributes.has('data-kq-rotate')).toBe(false);
});

it.each([false, true])('shows the throw hint on the first pickup during a cut tip and dialogue (touch: %s)', (touchMode) => {
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const progression = state.mutable.systems.progression = createProgressionSlice();
  const autosave = vi.fn();
  const hud = new Hud();
  const toast = vi.fn();
  const muted = new Set<string>();
  const ctx = {
    events, state, save: { autosave }, scene: new Scene(),
    input: {
      enabled: true, muted, touchMode, bindings: { throw: ['KeyF'] },
      wasPressed: () => false, wasCancelled: () => false,
    },
    ui: { hud, toast, modals: { count: 0 } }, player: {},
    quality: { level: 'high', listeners: [] }, world: { nature: {} },
    settings: { state: { reducedMotion: false } },
  } as unknown as GameContext;
  forage.init(ctx);
  try {
    const hint = (hud.el as unknown as ElementStub).find((el) => el.attributes.get('data-testid') === 'first-throw-hint')!;
    const pickup = (total: number) => {
      progression.inventory['item.kastanie'] = total;
      events.emit('item:pickup', { item: 'item.kastanie', count: 1, total, reason: 'loot' });
    };
    events.emit('equip:change', { slot: 'weapon', item: 'item.stab.esche' });
    for (let i = 0; i < 151; i++) forage.update(1 / 60);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Mit dem Stab'), 7000);
    events.emit('dialogue:active', { speaker: 'imhoff' });
    muted.add('throw');
    expect(hint.attributes.has('hidden')).toBe(true);
    pickup(1);
    expect(hint).toMatchObject({
      hidden: false,
      textContent: expect.stringContaining(touchMode ? 'Tippe auf die Kastanie' : 'F drücken'),
    });
    expect(state.state.systems.forage?.hints).toEqual(['cut', 'throw']);
    for (let i = 0; i < 421; i++) forage.update(1 / 60);
    expect(hint).toHaveProperty('hidden', true);
    pickup(2);
    expect(hint).toHaveProperty('hidden', true);
    expect(autosave).toHaveBeenCalledTimes(2);
  } finally {
    forage.dispose();
  }
});
