/**
 * Testing-aid URL flags that replace the start of a new game (CONTRIBUTING.md „Testing aids“):
 * `?kapitel=N` jumps a new game to chapter N (boot), `?party=…` boots into the end-of-game party
 * (src/systems/party). Neither wants the tour's route card on the title, and the party does not
 * want the tour at all.
 */
import type { KqHooks } from '../../debug/hooks';
import { PARTY_VARIANTS, type PartyVariant } from '../party/types';

/** `?kapitel=N`: resolve the displayed chapter number to a K1–K4 index, or null. */
export function kapitelJump(params: URLSearchParams): number | null {
  const n = Number(params.get('kapitel'));
  return Number.isInteger(n) && n >= 2 && n <= 5 ? n - 1 : null;
}

/** `?party=museum|burn|keep`: the party variant to boot into, or null. */
export function partyDevVariant(params: URLSearchParams): PartyVariant | null {
  const v = params.get('party');
  return v && PARTY_VARIANTS.includes(v as PartyVariant) ? (v as PartyVariant) : null;
}

/** The title's new-game flow skips the tour route card. */
export function skipsTourRoute(params: URLSearchParams): boolean {
  return kapitelJump(params) !== null || partyDevVariant(params) !== null;
}

/** Start a fresh game at the given K1–K4 index, resolved by kapitelJump. */
export function startAtChapter(k: Pick<KqHooks, 'ctx' | 'story' | 'skills' | 'progression' | 'quests'> | undefined, n: number): void {
  if (!k?.story || !k.skills || !k.progression || !k.quests) return;
  const skills: [string, number][] = n === 1 ? [['relief', 3], ['kartograf', 1]] : [['relief', 2], ['kartograf', 2]];
  if (n >= 2) skills.push(['baumeister', 1], ['spurenleser', 1]);
  for (const [id, tier] of skills) k.skills.grant(id, tier, true);
  k.progression.level(n * 2 + 1);
  if (n === 1) {
    k.ctx.state.update((s) => {
      s.flags['story.compass'] = true;
      if (!s.inventory.items.includes('item.bussole')) s.inventory.items.push('item.bussole');
    }, 'story');
    k.progression.grant('item.stab.esche', 1, true);
    k.progression.grant('item.p.seite', 1, true);
    k.progression.grant('item.balsam', 4, true);
    k.progression.grant('item.lampenoel', 1, true);
  }
  const earlier = new RegExp(`^q\\.(p|${Array.from({ length: n - 1 }, (_, i) => `k${i + 1}`).join('|')})\\.`);
  for (const id of k.quests.ids()) if (earlier.test(id) && k.quests.state().quests[id]?.state !== 'done') k.quests.reset(id);
  k.story.goto(`k${n}`, `k${n}_0`);
}
