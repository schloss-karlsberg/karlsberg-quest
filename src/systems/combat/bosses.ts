/**
 * The four bosses (docs/ACTION-RPG.md §5.2) — pure behaviour helpers used by sim.ts. Each boss has
 * three phases (thresholds in src/rpg/enemies.ts) and one mechanic the player learns:
 *
 *  - Das Schuldbuch: armoured by its seal; the Bannlicht breaks the seal open for 4 s (×1.6).
 *  - Der Pikeur: never undone — at 12 % he blows "verloren" and rides into the fog; his charge
 *    balks at running water (lure him onto the overflow: a long stagger).
 *  - Der Strohmann: hard straw in front, soft at the back where the bundles are tied (×1.6); turns
 *    slowly, so walking round him pays.
 *  - Der Steinbrecher: frontal armour; hits on the joints (side / back) knock blocks loose that fly
 *    west, towards Homburg.
 */
import type { EnemyAttackDef } from '../../rpg/types';
import { isFrontal } from './rules';

export interface BossView {
  kind: string;
  x: number;
  z: number;
  heading: number;
  phase: number;
  sealOpen: number;
  stun: number;
  cd: Record<string, number>;
  attacks: readonly EnemyAttackDef[];
  /** Adds of this boss still standing. */
  adds: number;
}

export const BOSS_TURN: Record<string, number> = { schuldbuch: 1.4, pikeur: 2.6, strohmann: 1.0, steinbrecher: 1.1 };

/** Pick the boss's next attack for the player at distance `d` (null = keep closing in). */
export function chooseBossAttack(b: BossView, d: number): EnemyAttackDef | null {
  const ready = (id: string) => {
    const a = b.attacks.find((x) => x.id === id);
    return a && (b.cd[id] ?? 0) <= 0 ? a : null;
  };
  const maxAdds = b.phase + 1;
  switch (b.kind) {
    case 'schuldbuch':
      if (b.adds < maxAdds && b.phase >= 2) {
        const s = ready('mahnung');
        if (s) return s;
      }
      if (d < 6.5) return ready('seitenschlag') ?? ready('siegel');
      return ready('siegel') ?? (b.adds < maxAdds ? ready('mahnung') : null);
    case 'pikeur':
      if (b.adds < Math.min(3, b.phase) && b.phase >= 2) {
        const s = ready('anblasen');
        if (s) return s;
      }
      if (d < 4.6) return ready('peitsche');
      if (d > 7) return ready('anreiten');
      return null;
    case 'strohmann':
      if (b.adds < maxAdds) {
        const s = ready('glut');
        if (s && b.phase >= 2) return s;
      }
      if (d < 5.2) return ready('garbe') ?? ready('funkenregen');
      return ready('funkenregen');
    case 'steinbrecher':
      if (b.adds < maxAdds + 1 && b.phase >= 2) {
        const s = ready('gruslinge');
        if (s) return s;
      }
      if (d < 6) return ready('beben') ?? ready('quaderwurf');
      return ready('quaderwurf');
    default:
      return null;
  }
}

/** Cooldown multiplier by phase (fights quicken as they go on). */
export function bossCooldown(base: number, phase: number): number {
  return base * (phase >= 3 ? 0.7 : phase === 2 ? 0.85 : 1);
}

/**
 * Damage multiplier of a staff hit on a boss and whether it struck the weak point.
 * `from` = the player.
 */
export function bossHitMul(b: BossView, from: { x: number; z: number }, kind: 'light' | 'heavy'): { mul: number; weak: boolean; armored: boolean } {
  switch (b.kind) {
    case 'schuldbuch':
      if (b.sealOpen > 0) return { mul: 1.6, weak: true, armored: false };
      return { mul: kind === 'heavy' ? 0.5 : 0.3, weak: false, armored: true };
    case 'strohmann': {
      const front = isFrontal(b, from);
      if (!front) return { mul: 1.6, weak: true, armored: false };
      return { mul: kind === 'heavy' ? 0.8 : 0.35, weak: false, armored: kind !== 'heavy' };
    }
    case 'steinbrecher': {
      const front = isFrontal(b, from);
      // the joints are at the sides and the back; from the front even a Wuchthieb mostly bounces
      if (!front) return { mul: 1.3, weak: true, armored: false };
      return { mul: kind === 'heavy' ? 0.35 : 0.25, weak: false, armored: true };
    }
    case 'pikeur':
      return { mul: b.stun > 0 ? 1.5 : 1, weak: b.stun > 0, armored: false };
    default:
      return { mul: 1, weak: false, armored: false };
  }
}

/** What a boss summons (kind and how many) in its phase. */
export function summonOf(kind: string, phase: number): { kind: string; n: number } {
  switch (kind) {
    case 'schuldbuch':
      return { kind: 'mahnbrief', n: 1 + phase };
    case 'pikeur':
      return { kind: 'streuner', n: phase >= 3 ? 2 : 1 };
    case 'strohmann':
      return { kind: 'glutling', n: phase >= 3 ? 3 : 2 };
    case 'steinbrecher':
      return { kind: 'grusling', n: 2 + phase };
    default:
      return { kind: 'nebelling', n: 1 };
  }
}

/** Ground rings of the Strohmann's spark rain around the player (1 / 3 / 5 by phase). */
export function sparkRain(px: number, pz: number, phase: number, seed: number): { x: number; z: number }[] {
  const n = phase >= 3 ? 5 : phase === 2 ? 3 : 1;
  const out = [{ x: px, z: pz }];
  for (let i = 1; i < n; i++) {
    const a = seed * 6.283 + (i / (n - 1)) * Math.PI * 2;
    const r = 4.2 + (i % 2) * 1.6;
    out.push({ x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r });
  }
  return out;
}

/** Number of seal bolts by phase (a fan). */
export function sealBolts(phase: number): number {
  return phase >= 3 ? 5 : phase === 2 ? 3 : 1;
}
