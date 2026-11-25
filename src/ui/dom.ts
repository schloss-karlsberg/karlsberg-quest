/** Minimal DOM builder: h('div.kq-x', { onclick }, [children]). No framework. */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string; dataset?: Record<string, string> };

export function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}` | `${K}#${string}`, props?: Props | (Child | Child[])[] | Child, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const m = /^([a-z0-9]+)(?:#([\w-]+))?((?:\.[\w-]+)*)$/i.exec(sel);
  if (!m) throw new Error(`h: bad selector ${sel}`);
  const el = document.createElement(m[1] as K);
  if (m[2]) el.id = m[2];
  if (m[3]) el.className = m[3].slice(1).split('.').join(' ');
  let kids: (Child | Child[])[] = children;
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids = [props as Child | (Child | Child[])[], ...children] as (Child | Child[])[];
  } else if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'className') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

function append(el: Node, kids: unknown[]): void {
  for (const c of kids as (Child | Child[])[]) {
    if (Array.isArray(c)) append(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Inline SVG from markup (trusted, static strings only). */
export function svg(markup: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGSVGElement;
}

export const EYE_SVG = `<svg viewBox="0 0 46 26" aria-hidden="true"><path d="M2 13C9 3 37 3 44 13 37 23 9 23 2 13z" fill="none" stroke="#e9d9b8" stroke-width="1.6"/><circle class="pupil" cx="23" cy="13" r="6" fill="#a33a24"/></svg>`;
