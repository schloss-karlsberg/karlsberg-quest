/**
 * Journal tab registry (docs/ACTION-RPG.md §8.4). The Journal (J) replaces the Chronik board:
 * one field-book modal with tabs. The quests system owns the modal and its own tabs (Aufgaben,
 * Codex, Sammlungen); other features add tabs here without importing the quests system — the
 * progression system adds "Ausrüstung" and "Talente".
 *
 *   addJournalTab({ id: 'gear', label: 'Ausrüstung', order: 40, render: (el, ctx) => { … } });
 *
 * `render` is called every time the tab is shown (build the DOM fresh into `el`); `badge` returns a
 * small count (e.g. unspent talent points) for the tab label, or 0.
 */
import type { GameContext } from '../core/context';

export interface JournalTab {
  id: string;
  label: string;
  /** Tab order: 10 Aufgaben, 20 Codex, 30 Sammlungen, 35 Funde, 40 Ausrüstung, 50 Talente, 60 Karte. */
  order: number;
  render(el: HTMLElement, ctx: GameContext): void;
  badge?(ctx: GameContext): number;
  /** Called when the journal closes or another tab is chosen. */
  hide?(): void;
}

const tabs: JournalTab[] = [];

/** Register (or replace, by id) a journal tab. */
export function addJournalTab(tab: JournalTab): void {
  const i = tabs.findIndex((t) => t.id === tab.id);
  if (i >= 0) tabs.splice(i, 1, tab);
  else tabs.push(tab);
  tabs.sort((a, b) => a.order - b.order);
}

/** The registered tabs in order (the journal modal renders them). */
export function journalTabs(): readonly JournalTab[] {
  return tabs;
}

/**
 * A section another feature adds to a tab it does not own (e.g. the Fläschchen row on the quests
 * system's "Sammlungen" page). The owner of the tab calls `journalSections(tabId)` and appends each
 * section's element after its own content.
 */
export interface JournalSection {
  id: string;
  tab: string;
  order: number;
  render(): HTMLElement | null;
}

const sections: JournalSection[] = [];

/** Register (or replace, by id) a section of a tab. */
export function addJournalSection(s: JournalSection): void {
  const i = sections.findIndex((x) => x.id === s.id);
  if (i >= 0) sections.splice(i, 1, s);
  else sections.push(s);
  sections.sort((a, b) => a.order - b.order);
}

/** The rendered sections of a tab, in order. */
export function journalSections(tab: string): HTMLElement[] {
  return sections.filter((s) => s.tab === tab).map((s) => s.render()).filter((e): e is HTMLElement => !!e);
}

/**
 * Things a feature puts on the field station's Regal (hub overlay, story system) without importing
 * the story: `render` returns the element or null.
 */
export interface ShelfItem {
  id: string;
  order: number;
  render(): HTMLElement | null;
}

const shelf: ShelfItem[] = [];

export function addShelfItem(s: ShelfItem): void {
  const i = shelf.findIndex((x) => x.id === s.id);
  if (i >= 0) shelf.splice(i, 1, s);
  else shelf.push(s);
  shelf.sort((a, b) => a.order - b.order);
}

export function shelfItems(): HTMLElement[] {
  return shelf.map((s) => s.render()).filter((e): e is HTMLElement => !!e);
}
