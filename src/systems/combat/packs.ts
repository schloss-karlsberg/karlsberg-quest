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

/** A group of a prologue quest (`q.p.*`): a lesson, no escorts and no second wave unless content names them. */
export function tutorialGroup(g: Partial<Pick<EnemyGroupState, 'quest'>>): boolean {
  return typeof g.quest === 'string' && g.quest.startsWith('q.p.');
}

/** Index (in materialisation order 0..count−1) of the elite member, −1 = none. */
export function eliteIndex(g: Pick<EnemyGroupState, 'count' | 'boss' | 'era' | 'tier' | 'eliteDown'>): number {
  if (!packWorthy(g) || g.eliteDown) return -1;
  return g.count - 1;
}

/**
 * Escorts of a group by its kind and size (none for small groups). Combat variety pass
 * (2026-11-17): every pack brings one member that asks for a tool rather than more swings — the
 * Foliant (a shield: Wuchthieb or flank), the Scherbling (a mirror: no Bannlicht at it), the Rufer
 * (a summoner: undo it first), the Nebelweber (now also a veil over the others: Bannlicht).
 */
export function escortsOf(g: Pick<EnemyGroupState, 'kind' | 'count' | 'boss' | 'era' | 'tier'> & Partial<Pick<EnemyGroupState, 'escorts' | 'quest'>>): Escort[] {
  // content names the company (playtest round 5: hounds with hounds, paper with paper) …
  if (g.escorts && !g.boss) return g.escorts;
  // … and the prologue's lessons come alone (a "+escort" turned the Eiskeller tutorial into deaths)
  if (tutorialGroup(g)) return [];
  if (!packWorthy(g)) return [];
  const big = g.count >= 5;
  switch (g.kind) {
    case 'nebelling':
      return [{ kind: 'nebelweber', n: 1 }, ...(g.era === '1789' || g.era === '1793-02' ? [{ kind: 'foliant', n: 1 }] : [])];
    case 'irrlicht':
      return [{ kind: 'nebelling', n: big ? 3 : 2 }];
    case 'streuner':
      // playtest round 4: "Leithund + 2 Streuner + Nebelweber" three times in a row, and a robed
      // caster in the K1 stand of hounds — the company changes with the era: the court's unpaid
      // letters behind a folio's covers in 1789, frost mist and a caller in February 1793, a shade
      // and mirror glass in July, grit and a caller in 1796
      if (g.era === '1789') return [{ kind: 'mahnbrief', n: 3 }, { kind: 'foliant', n: 1 }];
      if (g.era === '1793-02') return [{ kind: 'nebelling', n: 1 }, { kind: 'mahnbrief', n: 1 }, { kind: 'rufer', n: 1 }];
      if (g.era === '1793-07') return [{ kind: 'raffschatten', n: 1 }, { kind: 'scherbling', n: 1 }];
      if (g.era === '1796') return [{ kind: 'grusling', n: 2 }, { kind: 'rufer', n: 1 }];
      return [{ kind: 'nebelweber', n: 1 }];
    case 'mahnbrief':
      return g.count >= 4 ? [{ kind: 'nebelweber', n: 1 }, { kind: 'foliant', n: 1 }] : [{ kind: 'foliant', n: 1 }];
    case 'raffschatten':
      return [{ kind: 'glutling', n: 2 }, { kind: 'scherbling', n: 1 }, ...(g.count >= 4 ? [{ kind: 'nebelweber', n: 1 }] : [])];
    case 'glutling':
      return [{ kind: 'raffschatten', n: 1 }, { kind: 'scherbling', n: 1 }];
    case 'grusling':
      return [{ kind: 'nebelweber', n: 1 }, { kind: 'rufer', n: 1 }];
    case 'steinfresser':
      return [{ kind: 'grusling', n: big ? 4 : 3 }, { kind: 'rufer', n: 1 }];
    default:
      return [];
  }
}

/**
 * The second wave (combat variety pass): a pack worth an elite is followed by stragglers that come
 * out of the fog from another side once the fight is on — after the first of the pack falls or
 * `WAVE.after` seconds, whichever comes first. They walk with the escorts (no objective, XP).
 */
export function waveOf(g: Pick<EnemyGroupState, 'kind' | 'count' | 'boss' | 'era' | 'tier'> & Partial<Pick<EnemyGroupState, 'wave' | 'quest'>>): Escort[] {
  if (g.wave && !g.boss) return g.wave;
  if (tutorialGroup(g)) return [];
  // the present's first fight (four Nebelinge, no elite): two more come from behind — turn round
  if (g.era === 'today') return !g.boss && (g.tier ?? 1) > 0 && g.count >= 4 && g.kind === 'nebelling' ? [{ kind: 'nebelling', n: 3 }] : [];
  if (!packWorthy(g)) return [];
  switch (g.kind) {
    case 'streuner':
      // one more hound and what the era sends with it (a second pair of hounds overran the K2 bots;
      // in K2, where the hounds are already tier 2, the wave is the small fry alone)
      if (g.era === '1789') return [{ kind: 'streuner', n: 1 }, { kind: 'mahnbrief', n: 2 }];
      if (g.era === '1793-02') return [{ kind: 'nebelling', n: 2 }, { kind: 'mahnbrief', n: 1 }];
      return [{ kind: 'streuner', n: 1 }, { kind: 'nebelling', n: 2 }];
    case 'nebelling':
      return [{ kind: 'nebelling', n: 2 }];
    case 'irrlicht':
      return [{ kind: 'nebelling', n: 2 }];
    case 'mahnbrief':
      return [{ kind: 'mahnbrief', n: 3 }];
    case 'raffschatten':
      return [{ kind: 'raffschatten', n: 1 }, { kind: 'glutling', n: 2 }];
    case 'glutling':
      return [{ kind: 'glutling', n: 3 }];
    case 'grusling':
      return [{ kind: 'grusling', n: 4 }];
    case 'steinfresser':
      return [{ kind: 'steinfresser', n: 1 }, { kind: 'grusling', n: 2 }];
    default:
      return [];
  }
}

/** What a Rufer calls out of the fog: its pack's kind (small ones), else the era's. */
export function callOf(hostKind: string | undefined, era: string): string {
  // a hound pack's caller calls the small fry, not more hounds
  if (hostKind === 'streuner') return era === '1789' ? 'mahnbrief' : 'nebelling';
  if (hostKind === 'grusling' || hostKind === 'nebelling' || hostKind === 'mahnbrief') return hostKind;
  if (era === '1796') return 'grusling';
  if (era === '1793-07') return 'glutling';
  if (era === '1789') return 'mahnbrief';
  return 'streuner';
}

/** Environmental hazard of a pack fight in an era (null = none): embers falling in the fire, stones from the robbed walls. */
export function hazardOf(era: string): 'fire' | 'stone' | null {
  if (era === '1793-07') return 'fire';
  if (era === '1796') return 'stone';
  return null;
}

/** The group an escort belongs to (`<group>+escort`), or null. */
export function escortHost(group: string): string | null {
  return group.endsWith('+escort') ? group.slice(0, -'+escort'.length) : null;
}
