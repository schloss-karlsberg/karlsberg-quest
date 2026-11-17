/**
 * Pack composition (fun pass 2026-11-16, docs/ACTION-RPG.md §5.5): content declares single-kind
 * groups ("six Mahnbriefe"); combat turns the bigger ones into mixed packs.
 *
 *  - **Elite**: a group of three or more (not a boss, not the tutorial present) has one elite
 *    member — the last one to step out of the fog. It counts as one of the group (same kind, same
 *    objective), comes with a name, a glow, more Lebenskraft and an extra move, and does not come
 *    back once undone (`EnemyGroupState.eliteDown`).
 *  - **Escorts**: the same packs bring company of another kind — a Nebelweber that throws frost
 *    from behind the melee, Nebelinge that shield the Irrlichter, Glutlinge round the Raffschatten,
 *    Gruslinge at the Steinfresser's feet. Escorts are not part of the group (they never count for
 *    an objective, they are rebuilt with it) and drift off into the fog once the group is undone.
 *
 * Pure functions; the simulation (sim.ts) calls them when a group materialises.
 */
import type { EnemyGroupState } from '../../rpg/types';

export interface Escort {
  kind: string;
  n: number;
}

/** A group large enough for an elite and escorts: three or more, not a boss, not the present. */
export function packWorthy(g: Pick<EnemyGroupState, 'count' | 'boss' | 'era' | 'tier'>): boolean {
  if (g.boss) return false;
  if (g.era === 'today') return false;
  if ((g.tier ?? 1) <= 0) return false;
  return g.count >= 3;
}

/** Index (in materialisation order 0..count−1) of the elite member, −1 = none. */
export function eliteIndex(g: Pick<EnemyGroupState, 'count' | 'boss' | 'era' | 'tier' | 'eliteDown'>): number {
  if (!packWorthy(g) || g.eliteDown) return -1;
  return g.count - 1;
}

/** Escorts of a group by its kind and size (none for small groups). */
export function escortsOf(g: Pick<EnemyGroupState, 'kind' | 'count' | 'boss' | 'era' | 'tier'>): Escort[] {
  if (!packWorthy(g)) return [];
  const big = g.count >= 5;
  switch (g.kind) {
    case 'nebelling':
      return [{ kind: 'nebelweber', n: 1 }];
    case 'irrlicht':
      return [{ kind: 'nebelling', n: big ? 3 : 2 }];
    case 'streuner':
      // playtest round 4: "Leithund + 2 Streuner + Nebelweber" three times in a row — the company
      // changes with the era: paper in the frost of 1793, fire and shades in July, grit in 1796
      if (g.era === '1793-02') return [{ kind: 'mahnbrief', n: 3 }];
      if (g.era === '1793-07') return [{ kind: 'raffschatten', n: 1 }, { kind: 'glutling', n: 1 }];
      if (g.era === '1796') return [{ kind: 'grusling', n: 3 }];
      return [{ kind: 'nebelweber', n: 1 }];
    case 'mahnbrief':
      return g.count >= 4 ? [{ kind: 'nebelweber', n: 1 }] : [];
    case 'raffschatten':
      return [{ kind: 'glutling', n: 2 }, ...(g.count >= 4 ? [{ kind: 'nebelweber', n: 1 }] : [])];
    case 'glutling':
      return [{ kind: 'raffschatten', n: 1 }];
    case 'grusling':
      return [{ kind: 'nebelweber', n: 1 }];
    case 'steinfresser':
      return [{ kind: 'grusling', n: big ? 4 : 3 }];
    default:
      return [];
  }
}

/** The group an escort belongs to (`<group>+escort`), or null. */
export function escortHost(group: string): string | null {
  return group.endsWith('+escort') ? group.slice(0, -'+escort'.length) : null;
}
