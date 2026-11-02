import './styles.css';
import { h } from './dom';
import { Hud } from './hud';
import { ModalManager } from './modal';

/**
 * UI facade on the GameContext (`ctx.ui`):
 *   ctx.ui.hud.prompt('E', 'Lauschen')   ctx.ui.hud.subtitle('Laub', '…')   ctx.ui.toast('…')
 *   ctx.ui.modals.open({ title, body, actions })
 *   ctx.ui.layer('chronik')  → a full-screen container element a feature can fill (kept below modals)
 */
export class UI {
  readonly root: HTMLElement;
  readonly hud = new Hud();
  readonly modals: ModalManager;
  private readonly layers = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.root = h('div.kq-root');
    this.root.append(this.hud.el);
    parent.append(this.root);
    this.modals = new ModalManager(this.root);
  }

  toast(text: string, ms?: number): void {
    this.hud.toast(text, ms);
  }

  /** A named overlay container for a feature (created on first use, hidden by default). */
  layer(id: string): HTMLElement {
    let el = this.layers.get(id);
    if (!el) {
      el = h('div.kq-layer.kq-hidden', { dataset: { layer: id } });
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '15';
      this.root.append(el);
      this.layers.set(id, el);
    }
    return el;
  }

  add(el: HTMLElement): void {
    this.root.append(el);
  }
}
