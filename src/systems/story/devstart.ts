/**
 * Testing-aid URL flags that replace the start of a new game (CONTRIBUTING.md „Testing aids“):
 * `?kapitel=N` jumps a new game to chapter N (boot), `?party=…` boots into the end-of-game party
 * (src/systems/party). Neither wants the tour's route card on the title, and the party does not
 * want the tour at all.
 */
import { PARTY_VARIANTS, type PartyVariant } from '../party/types';

/** `?kapitel=N`: the chapter a new game jumps to, or null. */
export function kapitelJump(params: URLSearchParams): number | null {
  const n = Number(params.get('kapitel'));
  return Number.isInteger(n) && n >= 2 && n <= 4 ? n : null;
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
