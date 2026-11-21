/**
 * Photo targets as data (story contract C3): `content/photo/targets.json`, owned by kq-story;
 * this module types the file, validates it (`pnpm validate`, vitest) and turns an entry into a
 * runtime `PhotoTargetDef` for `registerTarget()`. Pure (no DOM, no three).
 *
 * Anchors: exactly one of `at` (a world point), `npc` or `animal`. A point anchor is static; an
 * npc / animal anchor is followed live: the target stays out of the world (`at()` returns null)
 * until the code that owns the figure attaches a live position with `attachTarget(id, …)`
 * (the animals worker for the deer, src/systems/photo/index.ts).
 */
import type { Era } from '../../core/era';
import type { PhotoGrants, PhotoKind, PhotoTargetDef, Vec3 } from './core';

export interface PhotoTargetData {
  id: string;
  kind: PhotoKind;
  /** The only allowed value is 'today' (no signal in the past). */
  era: Era;
  label_de: string;
  at?: { x: number; z: number; y?: number };
  npc?: string;
  animal?: string;
  /** Bounding-sphere radius (m). */
  r: number;
  frame: {
    minFrac: number;
    centre?: 'third' | 'any';
    maxDist?: number;
    minDist?: number;
    needAll?: string[];
    /** stars 2 | 3 = the fallback shot is good; 1 = never good (validator warns). */
    fallback?: { afterS: number; maxDist: number; stars: 1 | 2 | 3 };
  };
  grants?: PhotoGrants;
  /** Placeholder content shipped by the photo system (kq-story replaces it). */
  placeholder?: boolean;
  /** Free-form note for the content team (not shown). */
  note?: string;
}

/** A photo card (`ph.*`): album-only card back that a good photo unlocks. */
export interface PhotoCardData {
  id: string;
  title_de: string;
  text_de?: string;
  /** Codex card it refers to. */
  refers?: string[];
}

export interface PhotoTargetFile {
  $schema?: string;
  targets: PhotoTargetData[];
  cards?: PhotoCardData[];
}

/** Distance limit when a target's frame gives none (m). */
export const DEFAULT_MAX_DIST = 30;
/** Inscriptions must be legible: at most this far (m). */
export const INSCRIPTION_MAX = 4;

/**
 * A data entry → runtime def. `ground(x, z)` gives the terrain height for a point anchor without
 * `y` (the sphere then rests on the ground: centre = ground + r).
 */
export function targetFromData(d: PhotoTargetData, ground: (x: number, z: number) => number): PhotoTargetDef {
  let at: () => Vec3 | null = () => null;
  if (d.at) {
    const { x, z } = d.at;
    let y = d.at.y;
    at = () => {
      if (y === undefined) {
        const g = ground(x, z);
        if (!Number.isFinite(g)) return null;
        y = g + d.r;
      }
      return { x, y, z };
    };
  }
  const f = d.frame;
  return {
    id: d.id,
    era: d.era,
    kind: d.kind,
    at,
    r: d.r,
    minFrac: f.minFrac,
    maxDist: f.maxDist ?? (d.kind === 'inscription' ? INSCRIPTION_MAX : DEFAULT_MAX_DIST),
    minDist: f.minDist,
    centre: f.centre,
    needAll: f.needAll,
    fallbackDist: f.fallback?.maxDist,
    fallbackAfterS: f.fallback?.afterS,
    fallbackStars: f.fallback?.stars,
    grants: d.grants,
    label_de: d.label_de,
    placeholder: d.placeholder,
  };
}

export interface PhotoIssue {
  level: 'error' | 'warning';
  file: string;
  id?: string;
  message: string;
}

export interface PhotoRefs {
  /** Codex fact ids of the content packs. */
  facts?: Set<string>;
  bounds?: { x0: number; z0: number; x1: number; z1: number };
}

const KINDS = new Set<PhotoKind>(['animal', 'detail', 'inscription', 'person']);
const ID_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validate the targets file (C3 rules). */
export function validatePhotoTargets(file: string, data: unknown, refs: PhotoRefs = {}): { ok: boolean; errors: PhotoIssue[]; warnings: PhotoIssue[]; ids: Set<string> } {
  const errors: PhotoIssue[] = [];
  const warnings: PhotoIssue[] = [];
  const ids = new Set<string>();
  const err = (id: string | undefined, message: string) => errors.push({ level: 'error', file, id, message });
  const warn = (id: string | undefined, message: string) => warnings.push({ level: 'warning', file, id, message });
  const f = data as PhotoTargetFile | null;
  if (!f || typeof f !== 'object' || !Array.isArray(f.targets)) {
    err(undefined, 'expected { "targets": [...] }');
    return { ok: false, errors, warnings, ids };
  }
  const cards = new Set<string>();
  for (const c of f.cards ?? []) {
    if (!c || typeof c.id !== 'string' || !c.id) err(undefined, 'card without id');
    else if (cards.has(c.id)) err(c.id, 'duplicate card id');
    else cards.add(c.id);
    if (c && (typeof c.title_de !== 'string' || !c.title_de.trim())) err(c?.id, 'card needs title_de');
  }
  for (const t of f.targets) {
    const id = typeof t?.id === 'string' ? t.id : undefined;
    if (!id || !ID_RE.test(id)) {
      err(id, `malformed target id '${String(id)}' (dotted lower case, e.g. 'photo.p.reh')`);
      continue;
    }
    if (ids.has(id)) err(id, 'duplicate target id');
    ids.add(id);
  }
  for (const t of f.targets) {
    const id = t?.id;
    if (typeof id !== 'string') continue;
    if (!KINDS.has(t.kind)) err(id, `kind must be animal / detail / inscription / person, not '${String(t.kind)}'`);
    if (t.era !== 'today') err(id, `era must be 'today' (no signal in the past), not '${String(t.era)}'`);
    if (typeof t.label_de !== 'string' || !t.label_de.trim()) err(id, 'label_de missing');
    const anchors = [t.at !== undefined, t.npc !== undefined, t.animal !== undefined].filter(Boolean).length;
    if (anchors !== 1) err(id, `exactly one anchor (at / npc / animal), found ${anchors}`);
    if (t.at !== undefined) {
      if (!num(t.at.x) || !num(t.at.z) || (t.at.y !== undefined && !num(t.at.y))) err(id, 'at needs numeric x / z (y optional)');
      else if (refs.bounds) {
        const b = refs.bounds;
        if (t.at.x < b.x0 || t.at.x > b.x1 || t.at.z < b.z0 || t.at.z > b.z1) err(id, `at ${t.at.x}/${t.at.z} lies outside the playable extent`);
      }
    }
    if (t.npc !== undefined && (typeof t.npc !== 'string' || !t.npc)) err(id, 'npc must be an npc id');
    if (t.animal !== undefined && (typeof t.animal !== 'string' || !t.animal)) err(id, 'animal must be an animal id');
    if (!num(t.r) || t.r <= 0) err(id, 'r must be > 0');
    const fr = t.frame;
    if (!fr || typeof fr !== 'object') {
      err(id, 'frame missing');
      continue;
    }
    if (!num(fr.minFrac) || fr.minFrac < 0.02 || fr.minFrac > 1) err(id, 'frame.minFrac must lie between 0.02 and 1');
    if (fr.centre !== undefined && fr.centre !== 'third' && fr.centre !== 'any') err(id, "frame.centre must be 'third' or 'any'");
    if (fr.maxDist !== undefined && (!num(fr.maxDist) || fr.maxDist <= 0)) err(id, 'frame.maxDist must be > 0');
    if (fr.minDist !== undefined && (!num(fr.minDist) || fr.minDist < 0 || (num(fr.maxDist) && fr.minDist >= fr.maxDist))) err(id, 'frame.minDist must be ≥ 0 and below maxDist');
    if (t.kind === 'inscription' && num(fr.maxDist) && fr.maxDist > INSCRIPTION_MAX) err(id, `an inscription needs maxDist ≤ ${INSCRIPTION_MAX} (legible)`);
    for (const n of fr.needAll ?? []) {
      if (n === id) err(id, 'needAll names the target itself');
      else if (!ids.has(n)) err(id, `needAll: unknown target '${n}'`);
    }
    if (fr.fallback !== undefined) {
      const fb = fr.fallback;
      if (!num(fb.afterS) || fb.afterS <= 0 || !num(fb.maxDist) || fb.maxDist <= 0 || (fb.stars !== 1 && fb.stars !== 2 && fb.stars !== 3)) err(id, 'frame.fallback needs afterS > 0, maxDist > 0 and stars 1, 2 or 3');
      else if (fb.stars === 1) warn(id, 'frame.fallback.stars 1: a fallback shot is then never good (good means ≥ 2 stars), so the fallback unlocks nothing');
      else if (fb.maxDist <= (fr.maxDist ?? DEFAULT_MAX_DIST)) warn(id, 'frame.fallback.maxDist is not farther than maxDist: the fallback changes nothing');
    }
    const g = t.grants;
    if (g) {
      if (g.codex !== undefined && (!refs.facts || !refs.facts.has(g.codex))) err(id, `grants.codex: unknown codex card '${g.codex}'`);
      if (g.card !== undefined && !cards.has(g.card)) err(id, `grants.card: '${g.card}' is not in the photo-card list (cards[])`);
      if (g.flag !== undefined && (typeof g.flag !== 'string' || !g.flag)) err(id, 'grants.flag must be a flag name');
    }
    if (t.placeholder) warn(id, 'placeholder target (photo system demo): replace with real content');
  }
  return { ok: errors.length === 0, errors, warnings, ids };
}
