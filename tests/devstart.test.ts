import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, GameStateStore } from '../src/core/state';
import type { KqHooks } from '../src/debug/hooks';
import { itemDef } from '../src/rpg/items';
import { createProgressionSlice, ProgressionCore } from '../src/systems/progression/logic';
import type { SettingsStore } from '../src/core/save';
import { kapitelJump, partyDevVariant, skipsTourRoute, startAtChapter } from '../src/systems/story/devstart';
import { runNewGameFlow } from '../src/systems/story/title/flow';
import type { ModalManager } from '../src/ui/modal';
import { PageNode, installPageDom } from './ui-fixture';
import { DEFAULT_VISITOR_NAME } from '../src/systems/story/engine';
import '../src/systems/story/strings';

// the route card's schematic map: a stand-in node instead of parsed SVG markup
vi.mock('../src/ui/dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/ui/dom')>(),
  svg: () => document.createElement('svg' as 'div'),
}));

/** Testing-aid flags that replace the start of a new game (TASK-086). */
describe('dev start flags', () => {
  const p = (q: string) => new URLSearchParams(q);

  it('maps displayed chapters 2–5 to the internal K1–K4 indices', () => {
    expect([2, 3, 4, 5].map((n) => kapitelJump(p(`kapitel=${n}`)))).toEqual([1, 2, 3, 4]);
    expect(kapitelJump(p('kapitel=1'))).toBeNull();
    expect(kapitelJump(p('kapitel=6'))).toBeNull();
    expect(kapitelJump(p('kapitel=2.5'))).toBeNull();
    expect(kapitelJump(p(''))).toBeNull();
  });

  it('starts Chapter 2 with the tour staff equipped and the page in Ausrüstung', () => {
    const state = new GameStateStore(createInitialState());
    const progression = state.slice('progression', createProgressionSlice);
    const core = new ProgressionCore(() => progression, {
      emit: vi.fn(), item: itemDef, statOptions: () => ({}), setMembers: () => [], setLevelFlag: vi.fn(),
    });
    const goto = vi.fn();
    const hooks = {
      ctx: { state },
      story: { goto },
      skills: { grant: vi.fn() },
      progression: { grant: (item, count, quiet) => core.grantItem(item, count, { quiet }), level: vi.fn() },
      quests: { ids: () => [] },
    } satisfies {
      ctx: Pick<KqHooks['ctx'], 'state'>;
      story: Pick<NonNullable<KqHooks['story']>, 'goto'>;
      skills: Pick<NonNullable<KqHooks['skills']>, 'grant'>;
      progression: Pick<NonNullable<KqHooks['progression']>, 'grant' | 'level'>;
      quests: Pick<NonNullable<KqHooks['quests']>, 'ids'>;
    };
    startAtChapter(hooks as unknown as KqHooks, kapitelJump(p('kapitel=2'))!);
    expect(goto).toHaveBeenCalledExactlyOnceWith('k1', 'k1_0');
    expect(state.state.flags['story.compass']).toBe(true);
    expect(state.state.inventory.items).toEqual(['item.bussole']);
    expect(progression.equipped.weapon).toBe('item.stab.esche');
    expect(progression.inventory).toMatchObject({ 'item.stab.esche': 1, 'item.p.seite': 1, 'item.balsam': 4, 'item.lampenoel': 1 });
  });

  it('reads ?party=museum|burn|keep only', () => {
    expect(partyDevVariant(p('party=burn'))).toBe('burn');
    expect(partyDevVariant(p('party=disco'))).toBeNull();
    expect(partyDevVariant(p(''))).toBeNull();
  });

  it('skips the tour route card for a chapter jump or the party', () => {
    expect(skipsTourRoute(p('kapitel=2&nosave'))).toBe(true);
    expect(skipsTourRoute(p('party=museum&nosave&fresh'))).toBe(true);
    expect(skipsTourRoute(p('nosave&fresh'))).toBe(false);
    expect(skipsTourRoute(p('party=disco'))).toBe(false);
  });
});

class FlowNode extends PageNode {
  select(): void {}
  querySelectorAll(): FlowNode[] { return []; }
}

describe('new-game flow and the route card', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function flow(skipRoute: boolean) {
    installPageDom();
    vi.stubGlobal('document', {
      createElement: (tag: string) => new FlowNode(tag),
      createTextNode: (text: string) => new FlowNode('#text', text),
    });
    const host = new FlowNode('div');
    const onName = vi.fn();
    const settings = { state: { gentleMode: false }, update: vi.fn() } as unknown as SettingsStore;
    let result: false | (() => void) | undefined;
    void runNewGameFlow(host.element, { settings, modals: {} as ModalManager, onName, skipRoute }).then((r) => (result = r));
    host.byId('warning-accept').click();
    host.byId('name-confirm').click();
    await Promise.resolve();
    await Promise.resolve();
    return { host, onName, result: () => result };
  }

  it('starts the game from the name screen, without the route card', async () => {
    const { host, onName, result } = await flow(true);
    expect(host.all((n) => n.dataset.testid === 'tour-map')).toHaveLength(0);
    const start = result();
    expect(typeof start).toBe('function');
    (start as () => void)();
    expect(onName).toHaveBeenCalledWith(DEFAULT_VISITOR_NAME);
  });

  it('shows the route card on a normal new game', async () => {
    const { host, onName, result } = await flow(false);
    expect(result()).toBeUndefined();
    expect(host.byId('tour-map')).toBeTruthy();
    host.byId('start-tour').click();
    await Promise.resolve();
    (result() as () => void)();
    expect(onName).toHaveBeenCalledWith(DEFAULT_VISITOR_NAME);
  });
});
