/**
 * Level curve, talents and derived stats (docs/ACTION-RPG.md §6). Pure; owned by the progression
 * track. combat reads `deriveStats` (same inputs → same numbers in both systems), never the
 * progression system itself.
 */
import { itemDef } from './items';
import type { DerivedStats, ProgressionSlice } from './types';

export const MAX_LEVEL = 12;

/** Total XP needed to REACH level n (index n−1). Level 1 = 0 XP. Tuning starting point. */
export const LEVEL_XP: readonly number[] = [0, 150, 400, 750, 1200, 1800, 2600, 3600, 4800, 6200, 7800, 9600];

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) lvl = i + 1;
  return Math.min(MAX_LEVEL, lvl);
}

/** 0..1 progress towards the next level (1 at the cap). */
export function levelProgress(xp: number): number {
  const lvl = levelForXp(xp);
  if (lvl >= MAX_LEVEL) return 1;
  const a = LEVEL_XP[lvl - 1]!;
  const b = LEVEL_XP[lvl]!;
  return Math.max(0, Math.min(1, (xp - a) / (b - a)));
}

/** Charm slots: 1, from level 6: 2. */
export function charmSlots(level: number): number {
  return level >= 6 ? 2 : 1;
}

export type TalentBranch = 'stab' | 'laterne' | 'feldbuch';

export interface TalentDef {
  id: string;
  branch: TalentBranch;
  name_de: string;
  text_de: string;
  maxRank: number;
  /** Talents of the same branch needed first (any rank ≥ 1). */
  requires?: string[];
  /** Per rank: multiplicative (×) or additive (+) modifiers. */
  perRank: { mul?: Partial<Record<keyof DerivedStats, number>>; add?: Partial<Record<keyof DerivedStats, number>> };
}

/** The small talent tree: three branches, four talents each (11 points over the campaign). */
export const TALENTS: readonly TalentDef[] = [
  { id: 'stab.wucht', branch: 'stab', name_de: 'Wucht', text_de: 'Wuchthiebe treffen härter.', maxRank: 3, perRank: { add: { heavy: 0.25 } } },
  { id: 'stab.dritter', branch: 'stab', name_de: 'Der dritte Hieb', text_de: 'Der dritte Schlag einer Folge wirft Gegner zurück und erschüttert sie.', maxRank: 1, requires: ['stab.wucht'], perRank: { mul: { stagger: 1.2 } } },
  { id: 'stab.standfest', branch: 'stab', name_de: 'Standfest', text_de: 'Mehr Lebenskraft, weniger Stoß.', maxRank: 2, perRank: { add: { maxHp: 15 } } },
  { id: 'stab.konter', branch: 'stab', name_de: 'Konterschritt', text_de: 'Wer im letzten Moment ausweicht, hat einen Atemzug lang die Oberhand: der nächste Hieb zählt doppelt.', maxRank: 1, requires: ['stab.standfest'], perRank: {} },
  { id: 'laterne.weit', branch: 'laterne', name_de: 'Weites Licht', text_de: 'Das Bannlicht reicht weiter und breiter.', maxRank: 2, perRank: { add: { bannRange: 2, bannAngle: 10 } } },
  { id: 'laterne.glut', branch: 'laterne', name_de: 'Lange Glut', text_de: 'Das Bannlicht lädt schneller nach.', maxRank: 2, perRank: { mul: { bannRecharge: 0.85 } } },
  { id: 'laterne.kreis', branch: 'laterne', name_de: 'Lichtkreis', text_de: 'Eine weitere Ladung; Gebannte bleiben länger liegen.', maxRank: 1, requires: ['laterne.weit'], perRank: { add: { bannCharges: 1 }, mul: { bannStun: 1.3 } } },
  { id: 'laterne.waerme', branch: 'laterne', name_de: 'Laternenwärme', text_de: 'Jeder gebannte Gegner gibt ein wenig Lebenskraft zurück.', maxRank: 1, requires: ['laterne.glut'], perRank: {} },
  { id: 'feldbuch.spuersinn', branch: 'feldbuch', name_de: 'Spürsinn', text_de: 'Sammelstücke in der Nähe erscheinen auf der Bussole.', maxRank: 2, perRank: { add: { sense: 40 } } },
  { id: 'feldbuch.kraeuter', branch: 'feldbuch', name_de: 'Kräuterkunde', text_de: 'Balsam heilt mehr; Gegner lassen öfter etwas fallen.', maxRank: 2, perRank: { mul: { healing: 1.2 }, add: { loot: 0.05 } } },
  { id: 'feldbuch.atem', branch: 'feldbuch', name_de: 'Langer Atem', text_de: 'Rennen, Ausweichen und Schlagen kosten weniger Atem.', maxRank: 2, perRank: { mul: { staminaCost: 0.88 }, add: { maxStamina: 10 } } },
  { id: 'feldbuch.gedaechtnis', branch: 'feldbuch', name_de: 'Gedächtnis', text_de: 'Mehr Erfahrung aus Aufgaben und Codexkarten.', maxRank: 1, requires: ['feldbuch.kraeuter'], perRank: { mul: { xp: 1.1 } } },
];

export const BASE_STATS: DerivedStats = {
  maxHp: 100,
  maxStamina: 100,
  damage: 12,
  heavy: 2.2,
  bannCharges: 2,
  bannAngle: 60,
  bannRange: 9,
  bannStun: 1,
  bannRecharge: 11,
  damageTaken: 1,
  staminaCost: 1,
  stagger: 1,
  healing: 1,
  xp: 1,
  loot: 0,
  sense: 0,
};

export interface StatOptions {
  gentle?: boolean;
  rauhnacht?: boolean;
}

/** Derived stats from level, talents, weapon and charms (+ gentle / Rauhnacht). */
export function deriveStats(p: Pick<ProgressionSlice, 'level' | 'talents' | 'equipped'> | null, opt: StatOptions = {}): DerivedStats {
  const s: DerivedStats = { ...BASE_STATS };
  const level = Math.max(1, Math.min(MAX_LEVEL, p?.level ?? 1));
  s.maxHp += (level - 1) * 12;
  s.maxStamina += (level - 1) * 3;
  const weapon = p?.equipped.weapon ? itemDef(p.equipped.weapon) : undefined;
  s.damage = (weapon?.effect?.damage ?? BASE_STATS.damage) * (weapon?.effect?.spectral ?? 1) * (1 + (level - 1) * 0.04);
  for (const t of TALENTS) {
    const rank = Math.min(t.maxRank, p?.talents[t.id] ?? 0);
    for (let i = 0; i < rank; i++) {
      for (const [k, v] of Object.entries(t.perRank.add ?? {})) s[k as keyof DerivedStats] += v as number;
      for (const [k, v] of Object.entries(t.perRank.mul ?? {})) s[k as keyof DerivedStats] *= v as number;
    }
  }
  for (const c of p?.equipped.charms ?? []) {
    for (const [k, v] of Object.entries(itemDef(c)?.effect?.mods ?? {})) {
      const key = k as keyof DerivedStats;
      // loot / sense are additive, everything else multiplies
      if (key === 'loot' || key === 'sense') s[key] += v as number;
      else s[key] *= v as number;
    }
  }
  if (opt.gentle) {
    s.damageTaken *= 0.5;
    s.staminaCost *= 0.7;
  }
  if (opt.rauhnacht) {
    s.damageTaken *= 1.3;
    s.healing *= 0.8;
  }
  return s;
}

/** A talent by id. */
export function talentDef(id: string): TalentDef | undefined {
  return TALENTS.find((t) => t.id === id);
}

/** Why a talent cannot be learned now (null = it can). */
export function talentBlock(p: Pick<ProgressionSlice, 'points' | 'talents'>, id: string): 'unknown' | 'max' | 'points' | 'requires' | null {
  const t = talentDef(id);
  if (!t) return 'unknown';
  if ((p.talents[id] ?? 0) >= t.maxRank) return 'max';
  if ((t.requires ?? []).some((r) => (p.talents[r] ?? 0) < 1)) return 'requires';
  if (p.points < 1) return 'points';
  return null;
}

/** Talent points spent (sum of ranks). */
export function spentPoints(talents: Record<string, number>): number {
  return Object.values(talents).reduce((n, r) => n + Math.max(0, r | 0), 0);
}

/** How strong a weapon is (light-hit damage against spectral enemies; the sweep counts a little). */
export function weaponPower(id: string | null | undefined): number {
  const e = id ? itemDef(id)?.effect : undefined;
  if (!e) return 0;
  return (e.damage ?? 0) * (e.spectral ?? 1) * (e.sweep ? 1.05 : 1);
}
