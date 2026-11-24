import './styles.css';
import './hud-restyle.css';
import { h } from './dom';
import { CardDirector } from './cards';
import { Hud } from './hud';
import { LoaderView, LoadingRequests } from './loader';
import { ModalManager } from './modal';

/**
 * UI facade on the GameContext (`ctx.ui`):
 *   ctx.ui.hud.prompt('E', 'Lauschen')   ctx.ui.hud.subtitle('Laub', '…')   ctx.ui.toast('…')
 *   ctx.ui.modals.open({ title, body, actions })
 *   ctx.ui.layer('chronik')  → a full-screen container element a feature can fill (kept below modals)
 *   ctx.ui.cards.claim('reward') / .modal('clue:x', open)  → one card or notice at a time (./cards.ts)
 */
export class UI {
  readonly root: HTMLElement;
  readonly hud = new Hud();
  readonly modals: ModalManager;
  readonly loading: LoadingRequests;
  /** One card or notice at a time, held during fights and conversations (./cards.ts). */
  readonly cards: CardDirector;
  private readonly layers = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement, compass: SVGSVGElement, private readonly requestRender: () => void) {
    this.root = h('div.kq-root');
    const loader = LoaderView.inGame(compass);
    this.loading = new LoadingRequests(loader);
    this.root.append(this.hud.el, loader.el);
    parent.append(this.root);
    this.modals = new ModalManager(this.root);
    this.cards = new CardDirector(this.hud, this.modals);
    this.cards.extraHold = () => !!this.root.querySelector(
      '.kq-title:not(.kq-hidden):not(.fade-out), .kqs-card.kqs-show, .kqs-curtain.kqs-down, .kqs-choice-card.kqs-show',
    );
  }

  toast(text: string, ms?: number): void {
    this.cards.enqueueToast(text, ms);
    this.requestRender();
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
