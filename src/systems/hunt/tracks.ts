/**
 * Tracks in the snow (Ch. 2, era 1793-02, "Spur im Raureif"). Pure TypeScript, deterministic.
 *
 * - The player leaves boot prints (one per footstep), the hounds paw prints, the Pikeur's horse
 *   hoof prints. Prints persist `life` seconds and fade (the visuals read `age / life`).
 * - The player's prints form a TRAIL of numbered segments. A segment ends where the ground
 *   takes no print: water, stone (cobbles, stairs, terrace paving, inside a building), a road,
 *   bare rock (steep sandstone). The hounds can follow a segment print by print (tracking, see
 *   sim.ts) but never across a break: that is how you shake them off in the snow.
 * - Reading the pack's prints (Spurenleser): `readPack()` tells kind, age, count and direction.
 *
 * Bible 03-kapitel-2 §9: "Wer läuft, hinterlässt Fußspuren, und die Hunde folgen ihnen genau.
 * Eine Spur endet nur an Wasser, Stein (Treppen, Terrassenbeläge) oder im Inneren eines
 * Gebäudes. Spurenleser 2 zeigt die Fährtenlinien der Hunde im Relief."
 */

export type PrintKind = 'boot' | 'paw' | 'hoof';
/** Why a trail ended at a spot (null = soft snow, a print is laid). */
export type TrailBreak = 'water' | 'stone' | 'road' | 'rock' | null;

export interface Print {
  x: number;
  z: number;
  /** Heading of the walker (player-yaw convention: forward = (−sin h, −cos h)). */
  h: number;
  /** Sim time the print was made. */
  t: number;
  kind: PrintKind;
  /** −1 left, +1 right foot. */
  side: number;
  /** 0..1 how deep (running / galloping = deeper, sneaking = shallow). */
  depth: number;
  /** Player trail: segment id and running number inside the trail (pack prints: −1). */
  seg: number;
  seq: number;
  /** Pack prints: index of the agent that made it. */
  agent: number;
}

export interface TrackOptions {
  /** Seconds a print stays readable (fades towards the end). */
  life?: number;
  /** Maximum prints kept (ring buffer; oldest dropped first). */
  max?: number;
}

/** German compass word for a heading (player-yaw convention). */
export function compassWord(h: number): string {
  // bearing clockwise from north
  const deg = ((((-h * 180) / Math.PI) % 360) + 360) % 360;
  const names = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
  return names[Math.round(deg / 45) % 8]!;
}

export interface PackReading {
  kind: 'paw' | 'hoof';
  /** Seconds since the freshest print near you. */
  age: number;
  /** Distinct animals whose prints lie here. */
  count: number;
  /** Mean heading of the prints (where they went). */
  heading: number;
  hasPikeur: boolean;
  x: number;
  z: number;
}

export class TrackField {
  readonly life: number;
  readonly max: number;
  /** All prints, oldest first (pruned by age and count). */
  prints: Print[] = [];
  /** Player trail state. */
  seg = 0;
  seq = 0;
  /** Where the current segment began / the last one ended (break spot). */
  lastBreak: { x: number; z: number; t: number; why: Exclude<TrailBreak, null> } | null = null;
  private broken = false;
  /** Bumped on every change (visuals upload only when it moved). */
  version = 0;
  /** The field's own clock (s). Advanced by the pack simulation while one runs, else by the system. */
  now = 0;

  constructor(o: TrackOptions = {}) {
    this.life = o.life ?? 240;
    this.max = o.max ?? 1800;
  }

  /** A player footstep. On a break the trail segment ends and no print is laid. */
  addPlayer(x: number, z: number, h: number, t: number, side: number, depth: number, brk: TrailBreak): Print | null {
    if (brk) {
      if (!this.broken) {
        this.broken = true;
        this.lastBreak = { x, z, t, why: brk };
      }
      return null;
    }
    if (this.broken) {
      this.broken = false;
      this.seg++;
    }
    const p: Print = { x, z, h, t, kind: 'boot', side, depth, seg: this.seg, seq: this.seq++, agent: -1 };
    this.push(p);
    return p;
  }

  /** A paw / hoof print of the pack (no trail bookkeeping). */
  addPack(kind: 'paw' | 'hoof', agent: number, x: number, z: number, h: number, t: number, side: number, depth: number): void {
    this.push({ x, z, h, t, kind, side, depth, seg: -1, seq: -1, agent });
  }

  private push(p: Print): void {
    this.prints.push(p);
    if (this.prints.length > this.max) this.prints.splice(0, this.prints.length - this.max);
    this.version++;
  }

  /** Advance the clock (and drop old prints now and then). */
  tick(dt: number): void {
    this.now += dt;
    if (this.prints.length && this.now - this.prints[0]!.t > this.life + 5) this.prune(this.now);
  }

  /** Drop prints older than `life`. */
  prune(now: number = this.now): void {
    let i = 0;
    while (i < this.prints.length && now - this.prints[i]!.t > this.life) i++;
    if (i > 0) {
      this.prints.splice(0, i);
      this.version++;
    }
  }

  clear(): void {
    this.prints = [];
    this.seg++;
    this.lastBreak = null;
    this.broken = false;
    this.version++;
  }

  /** Did the player's trail end since `seg`? (A newer segment exists or the walker stands on a break.) */
  segmentEnded(seg: number): boolean {
    return seg < this.seg || (seg === this.seg && this.broken);
  }

  /**
   * Freshest player print within r of x/z (younger than maxAge). Used to pick up a trail: a hound
   * crossing it, or the pack at the spot where it lost you.
   */
  playerPrintNear(x: number, z: number, r: number, now: number, maxAge = this.life): Print | null {
    let best: Print | null = null;
    const r2 = r * r;
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i]!;
      if (now - p.t > maxAge) break; // older from here on
      if (p.kind !== 'boot') continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > r2) continue;
      if (!best || p.seq > best.seq) best = p;
    }
    return best;
  }

  /**
   * Next print to run to when following the player's trail from print number `seq` in segment
   * `seg`: the first print at least `ahead` m further along (smooths the zig-zag of single steps).
   * Null when the segment holds nothing newer (end of the trail: a break, or the walker himself).
   */
  next(seg: number, seq: number, fromX: number, fromZ: number, ahead = 2.5): Print | null {
    let cand: Print | null = null;
    let best: Print | null = null;
    for (const p of this.prints) {
      if (p.kind !== 'boot' || p.seg !== seg || p.seq <= seq) continue;
      cand = p;
      // prints around the follower count as reached: the next goal lies beyond the last of them
      if (Math.hypot(p.x - fromX, p.z - fromZ) < ahead) best = null;
      else best ??= p;
    }
    return best ?? cand;
  }

  /** Newest print of a segment (where it ends). */
  segmentEnd(seg: number): Print | null {
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i]!;
      if (p.kind === 'boot' && p.seg === seg) return p;
    }
    return null;
  }

  /** Spurenleser: what the pack's prints around x/z tell (null if none within r). */
  readPack(x: number, z: number, r: number, now: number): PackReading | null {
    const agents = new Set<number>();
    let fresh: Print | null = null;
    let sx = 0;
    let sz = 0;
    let pik = false;
    let n = 0;
    const r2 = r * r;
    for (const p of this.prints) {
      if (p.kind === 'boot' || (p.x - x) ** 2 + (p.z - z) ** 2 > r2) continue;
      agents.add(p.agent);
      if (p.kind === 'hoof') pik = true;
      sx += -Math.sin(p.h);
      sz += -Math.cos(p.h);
      n++;
      if (!fresh || p.t > fresh.t) fresh = p;
    }
    if (!fresh || n === 0) return null;
    const heading = Math.atan2(-sx, -sz);
    const hounds = [...agents].length - (pik ? 1 : 0);
    return { kind: hounds > 0 ? 'paw' : 'hoof', age: now - fresh.t, count: Math.max(hounds, pik ? 1 : 0), heading, hasPikeur: pik, x: fresh.x, z: fresh.z };
  }
}

/** German age words for a reading (bible tone: short, concrete). */
export function ageWord(age: number): string {
  if (age < 20) return 'ganz frisch';
  if (age < 60) return 'frisch';
  if (age < 150) return 'eine Weile alt';
  return 'alt';
}
