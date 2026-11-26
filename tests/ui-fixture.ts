import { vi } from 'vitest';

export class PageNode extends EventTarget {
  children: PageNode[] = [];
  parentElement: PageNode | null = null;
  dataset: Record<string, string> = {};
  style = {};
  id = '';
  className = '';
  classList = { add: (...names: string[]) => { this.className += ` ${names.join(' ')}`; } };
  scrollTop = 0;
  hidden = false;
  disabled = false;
  checked = false;
  value = '';
  focus = vi.fn();
  scrollIntoView = vi.fn();
  private attributes = new Map<string, string>();
  constructor(readonly tag: string, private text = '') { super(); }

  get firstChild() { return this.children[0] ?? null; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.replaceChildren(); this.text = value; }
  appendChild(child: PageNode) { child.parentElement = this; this.children.push(child); }
  append(...nodes: PageNode[]) { nodes.forEach(node => this.appendChild(node)); }
  removeChild(child: PageNode) { this.children.splice(this.children.indexOf(child), 1); child.parentElement = null; }
  remove() { this.parentElement?.removeChild(this); }
  replaceChildren(...nodes: PageNode[]) {
    this.children.forEach(child => { child.parentElement = null; });
    this.children = []; this.text = ''; this.append(...nodes);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'data-testid') this.dataset.testid = value;
    if (name === 'disabled' || name === 'checked') this[name] = true;
    if (name === 'value' || name === 'id') this[name] = value;
  }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  all(test: (node: PageNode) => boolean): PageNode[] {
    return this.children.flatMap(child => [...(test(child) ? [child] : []), ...child.all(test)]);
  }
  byId(testid: string): PageNode {
    const found = this.all(node => node.dataset.testid === testid)[0];
    if (!found) throw new Error(`No control with data-testid=${testid}`);
    return found;
  }
  matches(tags: string) { return tags.split(', ').includes(this.tag); }
  querySelector(tags: string) { return this.all(node => node.matches(tags))[0] ?? null; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  get element(): HTMLElement { return this as unknown as HTMLElement; }
}

export function installPageDom() {
  vi.stubGlobal('Node', PageNode);
  vi.stubGlobal('HTMLElement', PageNode);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', {
    createElement: (tag: string) => new PageNode(tag),
    createTextNode: (text: string) => new PageNode('#text', text),
  });
  return new PageNode('div');
}
