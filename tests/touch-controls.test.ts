import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { TouchControls, type TouchDeps } from '../src/ui/touch';

class ElementStub extends EventTarget {
  children: ElementStub[] = [];
  attributes = new Map<string, string>();
  textContent = '';
  content = { firstElementChild: this };
  private readonly classes = new Set<string>();
  set className(value: string) {
    this.classes.clear();
    for (const name of value.split(' ')) this.classes.add(name);
  }
  classList = {
    contains: (name: string) => this.classes.has(name),
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, on = !this.classes.has(name)) => on ? this.classes.add(name) : this.classes.delete(name),
  };
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  toggleAttribute() {}
  append(...children: ElementStub[]) { this.children.push(...children); }
  appendChild(child: ElementStub) { this.append(child); }
  replaceChildren(...children: ElementStub[]) { this.children = children; }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string): ElementStub[] {
    const testID = selector.match(/^\[data-testid="([^"]+)"\]$/)?.[1];
    return this.children.flatMap((child) => {
      const matches = testID ? child.attributes.get('data-testid') === testID
        : selector.startsWith('.') && child.classList.contains(selector.slice(1));
      return [...(matches ? [child] : []), ...child.querySelectorAll(selector)];
    });
  }
}

function rig() {
  vi.stubGlobal('Node', ElementStub);
  vi.stubGlobal('document', Object.assign(new EventTarget(), {
    createElement: () => new ElementStub(),
    createTextNode: (textContent: string) => Object.assign(new ElementStub(), { textContent }),
    documentElement: new ElementStub(),
  }));
  vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 400 }));
  vi.stubGlobal('MutationObserver', class { observe() {} });
  const root = new ElementStub();
  const events = new EventBus();
  let shown: ReturnType<TouchDeps['hud']['promptShown']> = null;
  const hud: Pick<TouchDeps['hud'], 'onPrompt' | 'promptShown' | 'setTouchIcons'> = {
    onPrompt: null,
    promptShown: () => shown,
    setTouchIcons: vi.fn(),
  };
  new TouchControls({
    root, events, hud, input: {},
    settings: { state: { touchControls: 'on' }, subscribe: vi.fn() },
    openPause: vi.fn(), dismissNoticeAt: vi.fn(),
    canFly: () => false, flying: () => false, measuring: () => false,
  } as unknown as TouchDeps);
  return {
    events,
    button: (name: string) => root.querySelector(`[data-testid="touch-${name}"]`)!,
    prompt: (key: string | null, text: string | null) => {
      shown = key || text ? { owner: 'story', key, text: text ?? '' } : null;
      hud.onPrompt?.(key, text);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('touch prompt cues', () => {
  it('moves the photo cue to the shutter on opening and restores it on closing', () => {
    const { button, events, prompt } = rig();
    const camera = button('photo'), shutter = button('attack');
    prompt('N', 'Fotomodus öffnen');
    expect(camera.classList.contains('cue')).toBe(true);
    expect(shutter.classList.contains('cue')).toBe(false);
    events.emit('photo:open', {});
    expect(camera.classList.contains('cue')).toBe(false);
    expect(shutter.classList.contains('cue')).toBe(true);
    expect(shutter.attributes.get('aria-label')).toBe('Auslöser: Foto machen');
    events.emit('photo:close', {});
    expect(shutter.classList.contains('cue')).toBe(false);
    expect(camera.classList.contains('cue')).toBe(true);
    prompt(null, null);
    events.emit('photo:open', {});
    expect(shutter.classList.contains('cue')).toBe(false);
  });

  it('clears the Aktion highlight when the sprint hint replaces an interaction prompt', () => {
    const { button, prompt } = rig();
    const action = button('interact');
    prompt('E', 'Gerold zuhören');
    expect(action.classList.contains('lit')).toBe(true);
    prompt('Umschalt', 'Zum Rennen ganz vor');
    expect(action.classList.contains('lit')).toBe(false);
    expect(action.querySelector('.kq-t-label')?.textContent).toBe('Aktion');
  });

  it('announces regrouping for the group offer and restores the default name afterward', () => {
    const { button, events } = rig();
    const label = () => button('shift').attributes.get('aria-label');
    expect(label()).toBe('Zeitsprung (halten: zurück zur Quelle)');
    events.emit('group:find', { group: 'fuehrung', prompt: true });
    expect(label()).toBe('Halten: zur Gruppe');
    events.emit('group:find', { group: 'fuehrung', prompt: false });
    expect(label()).toBe('Zeitsprung (halten: zurück zur Quelle)');
  });
});
