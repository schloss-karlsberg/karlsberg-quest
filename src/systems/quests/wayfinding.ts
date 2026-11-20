/**
 * Wayfinding (playtest 2026-11-19: "got stuck at the lake"): where an objective is, what to do
 * there, and when to help. Pure logic, no DOM, no three — tests/wayfinding.test.ts.
 *
 *  - `objectiveTarget` resolves a place for EVERY objective that has one in the world, not only
 *    the ones with `where`: collect → the nearest pickup still lying there, examine / echo → the
 *    clue's place (content packs), talk → where the npc stands, escort → its destination. Before,
 *    examine objectives (the Mauerrest at the dam, the Ehrenhof, the Rondell …) had no marker at
 *    all and the compass pointed at a side quest instead.
 *  - `hintFor` says concretely what to do: the key, the view, the place (distance + direction).
 *  - `StallWatch` fires when the player makes no progress for a while (no objective count change
 *    and not getting closer to the marker).
 */
import type { QuestDef, QuestObjective, QuestPlace } from '../../rpg/types';

export interface WayPoint {
  x: number;
  z: number;
  /** Zone radius (m): inside it the marker fades. */
  r: number;
  era?: string;
  room?: string;
  /** What kind of thing is there (marker icon, hint wording). */
  kind: 'zone' | 'pickup' | 'clue' | 'npc' | 'dest';
  /** Where the floating mark sits when it is not over x/z (a door: in the opening, not over the foot of its steps). */
  mark?: { x: number; y: number; z: number };
}

export interface WayDeps {
  era: string;
  player: { x: number; z: number };
  /** A clue's place (content packs): eras it exists in. */
  clue(id: string): { x: number; z: number; r: number; eras: string[]; scan?: number; anchor?: string } | null;
  /** Where an npc stands now (npc system's placed map). */
  npc(id: string): { x: number; z: number; era: string } | null;
  /** Pickups of a collect objective still lying in the world. */
  pickups(quest: string, objective: string): { x: number; z: number; era?: string }[];
}

const inEra = (p: { era?: string } | undefined, era: string, fallback?: string) => !p || !(p.era ?? fallback) || (p.era ?? fallback) === era;

/** The nearest of several places (in this era first). */
function nearest<T extends { x: number; z: number; era?: string }>(list: T[], d: WayDeps): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const p of list) {
    if (p.era && p.era !== d.era) continue;
    const dd = Math.hypot(p.x - d.player.x, p.z - d.player.z);
    if (dd < bd) {
      bd = dd;
      best = p;
    }
  }
  return best ?? list[0] ?? null;
}

const zone = (p: QuestPlace, kind: WayPoint['kind'] = 'zone', r = 6): WayPoint => ({ x: p.x, z: p.z, r: p.r ?? r, era: p.era, room: p.room, kind });

/**
 * The place of an objective, or null (no marker: `noMarker`, an event like "Q halten", a manual
 * step). The era is the place's own (the caller hides markers of another era).
 */
export function objectiveTarget(q: Pick<QuestDef, 'id' | 'era'>, o: QuestObjective, d: WayDeps): WayPoint | null {
  if (o.noMarker) return null;
  switch (o.type) {
    case 'escort':
      return o.to ? zone(o.to, 'dest') : o.where ? zone(o.where) : null;
    case 'collect': {
      const left = d.pickups(q.id, o.id);
      const p = nearest(left, d);
      if (p) return { x: p.x, z: p.z, r: 1.6, era: p.era ?? o.place?.[0]?.era, kind: 'pickup' };
      if (o.where) return zone(o.where);
      return null;
    }
    case 'talk': {
      const n = o.npc ? d.npc(o.npc) : null;
      if (n) return { x: n.x, z: n.z, r: 2.5, era: n.era, kind: 'npc' };
      return o.where ? zone(o.where) : null;
    }
    case 'examine':
    case 'echo': {
      if (o.where) return zone(o.where, 'clue');
      const c = o.clue ? d.clue(o.clue) : null;
      if (!c) return null;
      // a portable clue (the tablet, the Bussole's page: `anchor: "portable"`) has no place in the
      // world, its `where` is only a nominal spot (in the spring's wall, set by the story). Pointing there sent the player
      // 840 m west in the prologue (playtest round 10, F-25).
      if (c.anchor === 'portable') return null;
      const era = c.eras.includes(d.era) ? d.era : (c.eras[0] ?? q.era);
      // the exact spot: story triggers for clues are 6–9 m, the clue radius (15 m) would hide the mark too soon
      return { x: c.x, z: c.z, r: 4, era, kind: 'clue' };
    }
    default:
      if (o.where) return zone(o.where);
      if (o.place?.length) {
        const p = nearest(o.place, d)!;
        return zone(p);
      }
      return null;
  }
}

/** Is this target shown in the current era (and not inside a palace room)? */
export function targetVisible(t: WayPoint | null, era: string, questEra?: string): t is WayPoint {
  return !!t && !t.room && inEra(t, era, questEra);
}

const DIRS = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];

/** "Nordosten" for a grid bearing (deg, 0 = north / −z). */
export function directionWord(bearing: number): string {
  return DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!;
}

/** Grid bearing from a to b (deg, 0 = north / −z, 90 = east). */
export function bearingTo(ax: number, az: number, bx: number, bz: number): number {
  return ((Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI + 360) % 360;
}

/** "120 m" / "1,2 km". */
export function distanceText(m: number): string {
  if (m < 1000) return `${Math.max(1, Math.round(m / (m < 50 ? 1 : 5)) * (m < 50 ? 1 : 5))} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

const SCAN_NAME: Record<number, string> = { 1: 'Relief-Blick', 2: 'Lokales Relief', 3: 'VAT' };

export interface HintContext {
  target: WayPoint | null;
  /** The target lies in another era than the one the player is in. */
  otherEra?: string | null;
  player: { x: number; z: number };
  /** Scan mode the clue needs (examine). */
  scan?: number;
  /** Name of the npc (talk). */
  npcName?: string;
  /** Name of the item (collect). */
  itemName?: string;
  /** The enemy kind can only be hit after a Bannlicht (the Irrlicht: `needsBann`). */
  needsBann?: boolean;
}

const ERA_NAME: Record<string, string> = { today: 'ins Heute', '1789': 'in den Sommer 1789', '1793-02': 'in den Februar 1793', '1793-07': 'in den Juli 1793', '1796': 'ins Jahr 1796' };

/** "120 m Richtung Nordosten" (or "hier, wo die Markierung ist" when you stand at it). */
export function whereText(t: WayPoint | null, player: { x: number; z: number }): string {
  if (!t) return '';
  const d = Math.hypot(t.x - player.x, t.z - player.z);
  if (d < Math.max(8, t.r)) return 'hier, wo die Markierung ist';
  return `${distanceText(d)} Richtung ${directionWord(bearingTo(player.x, player.z, t.x, t.z))}`;
}

/** The hint for a goal the story sets without a quest objective (its line names the keys). */
export function storyHint(label: string, t: WayPoint | null, player: { x: number; z: number }): string {
  const where = whereText(t, player);
  return where ? `${label}. Die Markierung zeigt hin: ${where}.` : `${label}.`;
}

/**
 * What to do, concretely (a hint after a stall, and the tracker's "Tipp" line). An objective's own
 * `hint_de` wins; otherwise one is built from its type, the place and the keys.
 */
export function hintFor(o: QuestObjective & { hint_de?: string }, h: HintContext): string {
  if (o.hint_de) return o.hint_de;
  const where = whereText(h.target, h.player);
  const go = where ? ` (${where})` : '';
  if (h.otherEra) return `Das liegt in einer anderen Zeit: Q halten, um ${ERA_NAME[h.otherEra] ?? h.otherEra} zu wechseln.`;
  switch (o.type) {
    case 'kill': {
      if (h.needsBann) return `Erst mit dem Bannlicht blenden (Rechtsklick oder G), dann mit dem Stab zuschlagen (Klick oder K)${go}.`;
      return `Zur Markierung gehen${go} und mit dem Stab zuschlagen: Klick oder K, gehalten ein Wuchthieb.`;
    }
    case 'collect':
      return `Der Lichtschein zeigt ${h.itemName ? `„${h.itemName}“` : 'den Gegenstand'}${go}: hingehen, dann E.`;
    case 'talk':
      return `${h.npcName ?? 'Die Person'} wartet${go}: hingehen und E drücken.`;
    case 'examine':
    case 'echo':
      if (h.scan) return `Taste ${h.scan} (${SCAN_NAME[h.scan] ?? 'Relief'}) drücken und zur Markierung gehen${go}. Steht dort „E“, untersuchen.`;
      return `Zur Markierung gehen${go}; steht dort „E“, untersuchen (oder zuhören).`;
    case 'event':
      if (o.event === 'era:change') return 'Q gedrückt halten: der Zeitwechsel.';
      return where ? `Zur Markierung gehen${go}.` : 'Weiter, wie es im Tracker steht.';
    case 'calm':
      return `Ausweichen (Leertaste), bis es müde wird, nicht zuschlagen${go}.`;
    case 'escort':
      return `Vorausgehen, die Person folgt dir${go}.`;
    case 'room':
      return `Den Raum im Schloss finden${go}.`;
    default:
      return where ? `Der Lichtstrahl zeigt das Ziel: ${where}.` : 'Weiter, wie es im Tracker steht.';
  }
}

/**
 * No progress for `limit` seconds → a hint. Progress is an objective count change (the caller
 * changes `key`), or walking a good stretch closer to the marker. After a hint the clock starts
 * again (the next one comes a little later).
 */
export class StallWatch {
  private key = '';
  private t = 0;
  private best = Infinity;
  private shown = 0;

  constructor(readonly limit = 60) {}

  /** Seconds since the last progress (tests). */
  get idle(): number {
    return this.t;
  }

  /** How many hints fired for the current key. */
  get hints(): number {
    return this.shown;
  }

  reset(key = this.key): void {
    this.key = key;
    this.t = 0;
    this.best = Infinity;
    this.shown = 0;
  }

  /** `dt` = 0 while a fight, a conversation or a modal holds the game. True: show a hint now. */
  tick(dt: number, key: string, dist: number | null): boolean {
    if (key !== this.key) this.reset(key);
    if (!key) return false;
    if (dist !== null) {
      if (dist < this.best - 12) {
        // getting closer counts as progress (but the first reading only sets the mark)
        if (this.best !== Infinity) this.t = 0;
        this.best = dist;
      }
    }
    this.t += dt;
    const due = this.limit * (this.shown === 0 ? 1 : 1.5);
    if (this.t >= due) {
      this.t = 0;
      this.shown++;
      return true;
    }
    return false;
  }
}
