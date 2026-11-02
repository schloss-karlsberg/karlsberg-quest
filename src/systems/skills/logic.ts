/**
 * Skills (PRD §6.1, bible 00-overview §4): pure rules, no DOM / three.js.
 *
 * Levels live in `state.skills[id]` (numbers, never lowered). Ids and what each tier opens:
 *   relief       1 Schummerung (scan 1) · 2 Lokales Relief (scan 2) · 3 VAT (scan 3)
 *   kartograf    1 Karte 1836–41 (M) · 2 Messtischblatt 1935 (M cycles) · 3 Messen (R)
 *   baumeister   1 Planblatt (B: footprints on the ground, room names in memories)
 *                2 Konfidenzansicht (B cycles: palace in Okabe-Ito confidence colours)
 *                3 Raumfolge (room outlines + names on the plan sheet)
 *   roentgen     1 Röntgenblick (V / 4: ground points under the canopy)
 *   spurenleser  1 horn captions say what the call means · 2 pack routes as faint lines
 *
 * "Free survey": without a running story (sandbox, `?notitle` tests) every tool is open, so the
 * world can be explored and tested; `?skills=all` forces it open, `?skills=strict` forces gating.
 */
export const SKILL_IDS = ['relief', 'kartograf', 'baumeister', 'roentgen', 'spurenleser'] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const SKILL_MAX: Record<SkillId, number> = { relief: 3, kartograf: 3, baumeister: 3, roentgen: 1, spurenleser: 2 };

export type Skills = Readonly<Record<string, number>>;

const ALIASES: Record<string, SkillId> = {
  relief: 'relief',
  reliefblick: 'relief',
  'relief-blick': 'relief',
  kartograf: 'kartograf',
  kartograph: 'kartograf',
  baumeister: 'baumeister',
  roentgen: 'roentgen',
  roentgenblick: 'roentgen',
  röntgen: 'roentgen',
  röntgenblick: 'roentgen',
  xray: 'roentgen',
  spurenleser: 'spurenleser',
  tracker: 'spurenleser',
};

/** Canonical skill id for a name or alias (case-insensitive), or null. */
export function skillId(name: string): SkillId | null {
  return ALIASES[name.trim().toLowerCase()] ?? null;
}

/**
 * Parse a grant / requirement: 'kartograf:3', 'kartograf3', or name + explicit level.
 * Returns null for unknown skills. Levels are clamped to 1..max.
 */
export function parseSkill(spec: string, level?: number): { skill: SkillId; level: number } | null {
  const m = /^\s*([^\d:]+?)\s*:?\s*(\d+)?\s*$/.exec(spec);
  if (!m) return null;
  const id = skillId(m[1]!);
  if (!id) return null;
  const raw = level ?? (m[2] ? Number(m[2]) : 1);
  return { skill: id, level: Math.max(1, Math.min(SKILL_MAX[id], Math.round(raw))) };
}

export function levelOf(skills: Skills, id: SkillId): number {
  const v = skills[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Increases between two skill tables: one entry per skill at its new level (unknown ids ignored). */
export function skillIncreases(prev: Skills, next: Skills): { skill: SkillId; from: number; level: number }[] {
  const out: { skill: SkillId; from: number; level: number }[] = [];
  for (const id of SKILL_IDS) {
    const a = levelOf(prev, id);
    const b = levelOf(next, id);
    if (b > a) out.push({ skill: id, from: a, level: Math.min(b, SKILL_MAX[id]) });
  }
  return out;
}

/** Free survey mode (see header). `param` = the `?skills=` URL value. */
export function isFreeSurvey(storyRunning: boolean, param: string | null): boolean {
  if (param === 'all') return true;
  if (param === 'strict') return false;
  return !storyRunning;
}

export interface Gate {
  skills: Skills;
  free: boolean;
}

const has = (g: Gate, id: SkillId, n: number) => g.free || levelOf(g.skills, id) >= n;

/** Relief scan mode 1–3 needs Relief-Blick ≥ mode (0 = off is always allowed). */
export function scanAllowed(mode: number, g: Gate): boolean {
  return mode <= 0 || has(g, 'relief', mode);
}

export type MapLayer = 0 | 1840 | 1935;

/** Map layers open to the player, in M order. */
export function mapLayers(g: Gate): MapLayer[] {
  const out: MapLayer[] = [];
  if (has(g, 'kartograf', 1)) out.push(1840);
  if (has(g, 'kartograf', 2)) out.push(1935);
  return out;
}

/** M: off → 1840 → 1935 → off (only the layers the Kartograf level opens). null = nothing to show. */
export function nextMap(current: MapLayer, g: Gate): MapLayer | null {
  const layers = mapLayers(g);
  if (!layers.length) return null;
  if (current !== 0 && !layers.includes(current)) return 0;
  const i = current === 0 ? -1 : layers.indexOf(current);
  return i + 1 < layers.length ? layers[i + 1]! : 0;
}

export type PlanView = 'off' | 'plan' | 'conf';

/** B: off → Planblatt (Baumeister 1) → Konfidenz (Baumeister 2) → off. null = locked. */
export function nextPlanView(current: PlanView, g: Gate): PlanView | null {
  const views: PlanView[] = [];
  if (has(g, 'baumeister', 1)) views.push('plan');
  if (has(g, 'baumeister', 2)) views.push('conf');
  if (!views.length) return null;
  if (current !== 'off' && !views.includes(current)) return 'off';
  const i = current === 'off' ? -1 : views.indexOf(current);
  return i + 1 < views.length ? views[i + 1]! : 'off';
}

export const canMeasure = (g: Gate) => has(g, 'kartograf', 3);
export const canXray = (g: Gate) => has(g, 'roentgen', 1);
export const showRoomNames = (g: Gate) => has(g, 'baumeister', 1);
export const showRoomLayout = (g: Gate) => has(g, 'baumeister', 3);
export const showPackRoutes = (g: Gate) => has(g, 'spurenleser', 2);
/** Same rule the hunt uses for its horn captions (gentle mode explains the calls too). */
export const hornMeaning = (skills: Skills, gentle: boolean) => gentle || levelOf(skills, 'spurenleser') >= 1;

/** Roman tier label for cards. */
export const roman = (n: number) => ['', 'I', 'II', 'III', 'IV'][n] ?? String(n);

// ---- the gate every tool checks ----------------------------------------------------------------

let freeOverride: boolean | null = null;
/** Debug: force free survey on/off (null = automatic). */
export function setFreeOverride(v: boolean | null): void {
  freeOverride = v;
}

/**
 * Gate from the game state: skills + free survey (story slice `systems.story.active`, URL
 * `?skills=`). Survey and tools call this with `ctx.state.state` and `ctx.params`.
 */
export function gateFrom(state: { skills: Skills; systems: Readonly<Record<string, unknown>> }, params: { get(k: string): string | null }): Gate {
  const story = state.systems['story'] as { active?: boolean } | undefined;
  const free = freeOverride ?? isFreeSurvey(!!story?.active, params.get('skills'));
  return { skills: state.skills, free };
}
