import { vi } from 'vitest';

/** The DOM operations the set pieces need, plus an event target for their input listeners. */
export function stubSetPieceDom() {
  class ElementStub {
    readonly dataset: Record<string, string> = {};
    readonly style: Record<string, string> = {};
    readonly attributes = new Map<string, string>();
    readonly classes = new Set<string>();
    readonly classList = {
      add: (name: string) => this.classes.add(name),
      remove: (name: string) => this.classes.delete(name),
      toggle: (name: string, on: boolean) => this.toggle(this.classes, name, on),
    };
    readonly children = new Set<ElementStub>();
    readonly content = { firstElementChild: this };
    private parent?: ElementStub;

    private toggle(names: Set<string>, name: string, on: boolean) {
      if (on) names.add(name);
      else names.delete(name);
    }

    toggleAttribute(name: string, on: boolean) {
      if (on) this.attributes.set(name, '');
      else this.attributes.delete(name);
    }

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }

    appendChild(child: ElementStub) {
      child.remove();
      this.children.add(child);
      child.parent = this;
    }

    remove() {
      this.parent?.children.delete(this);
      this.parent = undefined;
    }

    append(child: ElementStub) {
      this.appendChild(child);
    }

    querySelector() {
      return null;
    }
  }

  const body = new ElementStub();
  const root = new ElementStub();
  const target = new EventTarget();
  const kq: Pick<NonNullable<Window['kq']>, 'court' | 'cinematic'> = {};
  const window = {
    kq,
    // All events are dispatched on one target. Ignore the browser's capture phase here.
    addEventListener: (type: string, fn: EventListener) => target.addEventListener(type, fn),
    removeEventListener: (type: string, fn: EventListener) => target.removeEventListener(type, fn),
    dispatchEvent: (event: Event) => target.dispatchEvent(event),
  };
  vi.stubGlobal('Node', ElementStub);
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', {
    body,
    documentElement: root,
    createElement: () => new ElementStub(),
    createTextNode: () => new ElementStub(),
  });
  return { body, root, window };
}
