/**
 * Journal tab registry (docs/ACTION-RPG.md §8.4). The Journal (J / Tab) replaces the Chronik board:
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
  /** Tab order: 10 Aufgaben, 20 Codex, 30 Sammlungen, 40 Ausrüstung, 50 Talente. */
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
