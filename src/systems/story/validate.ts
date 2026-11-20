/**
 * Story file validator (pure). Used by `pnpm validate` (scripts/validate-content.ts) and the vitest
 * suite. Errors: malformed structure, unknown beat/chapter references, unknown condition/action
 * kinds, missing required fields, bad eras. Warnings: references into ContentDB that do not exist
 * (yet) — the Chronik content is written in parallel, so they must not fail the build.
 */
import { ERAS } from '../../core/era';
import type { Issue } from '../../content/validate';
import { ENEMY_IDS } from '../../rpg/enemies';
import { ITEM_IDS } from '../../rpg/items';
import { normalize as normalizeCinematic } from '../cinematic/keys';
import { checkPath, checkRoute } from '../walk/route';
import type { Route } from '../walk/types';
import { ACTION_KINDS, CONDITION_KEYS, type Action, type AnimalStoryAction, type Condition, type NpcAction, type NpcWalkAction, type StoryFile, isWalkAction } from './types';

export interface StoryValidation {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: { chapters: number; beats: number; lines: number };
}

export interface StoryRefs {
  clues?: Set<string>;
  nouns?: Set<string>;
  speakers?: Set<string>;
  dialogue?: Set<string>;
  /** Quest ids (content/quests/*.quests.json); unknown ids in `quest` actions / conditions are errors when given. */
  quests?: Set<string>;
  /** Items declared by quest files (`items`), in addition to src/rpg/items.ts. */
  items?: Set<string>;
  /** Route files (content/routes/*.json): walk `route` / `to` / warp stops are checked when given. */
  routes?: Map<string, Route>;
  /** Cinematic file ids (content/cinematics/*.json): a `ref` must name one when given. */
  cinematics?: Set<string>;
}

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const isEra = (v: unknown) => typeof v === 'string' && (ERAS as readonly string[]).includes(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const PACK_MODES = new Set(['patrol', 'drive', 'finale', 'parforce', 'follow', 'stand', 'kennel']);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** The court `watch` block of an npc spawn (src/systems/court; NpcWatch in contracts.ts). */
function checkWatch(w: unknown, file: string, where: string, err: Report): void {
  if (!w || typeof w !== 'object') return err(file, where, 'npc watch must be an object {fov, range, …}');
  const o = w as Record<string, unknown>;
  if (!isNum(o.fov) || o.fov <= 0 || o.fov > 360) err(file, where, 'npc watch needs fov (degrees, 0 < fov ≤ 360)');
  if (!isNum(o.range) || o.range <= 0 || o.range > 60) err(file, where, 'npc watch needs range (m, 0 < range ≤ 60)');
  if (o.sweep !== undefined && !(Array.isArray(o.sweep) && o.sweep.length === 2 && o.sweep.every(isNum))) err(file, where, 'npc watch sweep must be [yawA, yawB] (degrees)');
  if (o.period !== undefined && (!isNum(o.period) || o.period <= 0)) err(file, where, 'npc watch period must be > 0 (s)');
  for (const k of ['set', 'zone', 'who'] as const) if (o[k] !== undefined && !isStr(o[k])) err(file, where, `npc watch ${k} must be a string`);
  if (o.inspector !== undefined && typeof o.inspector !== 'boolean') err(file, where, 'npc watch inspector must be true/false');
  const known = new Set(['fov', 'range', 'sweep', 'period', 'set', 'inspector', 'zone', 'who']);
  for (const k of Object.keys(o)) if (!known.has(k)) err(file, where, `npc watch: unknown key '${k}'`);
}
/** Palace room ids: catalogue 'B01.2.og-festsaal', full 'KB-B01/B01.2.og-festsaal' or building 'KB-B01'. */
const ROOM_RE = /^(KB-[A-Z0-9]+|(KB-[A-Z0-9]+\/)?B[0-9]+\.[0-9]+\.[a-z0-9-]+)$/;
const isRoomId = (v: unknown): v is string => isStr(v) && ROOM_RE.test(v);
const THREATS = new Set(['pack', 'fire', 'oblivion']);
/**
 * A spoken line that is (or carries) a stage direction (playtest round 5, rule (a)): a line that is
 * all brackets, a bracketed caption longer than a short sound (30 characters), or a parenthesised
 * direction („(Pause.)“, „(sehr leise)“) inside what someone says. Null when the line is fine.
 */
export function stageDirection(text: string, speaker?: string): string | null {
  const t = text.trim();
  const sfx = speaker === 'geraeusch' || speaker === undefined;
  if (/^\[[^\]]*\]$/.test(t)) {
    if (!sfx || speaker === undefined) return 'the whole line is a bracketed stage direction';
    if (t.length > 32) return `bracketed caption longer than 30 characters (${t.length - 2})`;
    return null;
  }
  for (const m of t.matchAll(/\[([^\]]*)\]/g)) if (m[1]!.length > 30) return `bracketed caption longer than 30 characters (${m[1]!.length})`;
  if (/\((?:Pause|Lange Pause|sehr leise|leise|seufzt|lacht|flüstert|räuspert sich)[^)]*\)/i.test(t)) return 'a parenthesised stage direction inside a spoken line';
  if (/\((?:Er|Sie|Es) [^)]*\.\)/.test(t)) return 'a parenthesised stage direction inside a spoken line';
  return null;
}

const SOUNDS = new Set(['howl', 'horn', 'radio', 'beep', 'compass', 'frost', 'match', 'crowbar', 'wind', 'bark']);
// the hub at the Quelle (contract C4) + the field station's old ids as aliases (bed → bench, radio → phone)
const HUB = new Set(['chronik', 'phone', 'shelf', 'drawer', 'map', 'bench', 'bed', 'radio']);
const ENDINGS = ['museum', 'burn', 'keep'] as const;
const NPCS = new Set(['soll', 'hanne', 'jost', 'peter', 'matthes', 'pikeur', 'gaertner', 'diener', 'mann', 'liese', 'hofgaertner', 'gardist', 'gardist-tor', 'lakai']);
/** Speakers that stand as people (the party's guide and doubles, bible 06-enden §8): bound to a live person, no ghost. */
const PEOPLE = new Set(['imhoff', 'herzogd', 'mannd', 'hanned', 'peterd', 'jostd', 'solld', 'liesed', 'mats', 'marlene']);
const METER_FULL = new Set(['return', 'caught', 'none']);
const QUEST_OPS = new Set(['offer', 'start', 'progress', 'complete', 'fail', 'reset']);
const QUEST_COND_STATES = new Set(['offered', 'active', 'ready', 'done', 'failed']);
const QUEST_ID_RE = /^q\.[a-z0-9]+\.[a-z0-9_-]+$/;

export function validateStories(files: { file: string; story: StoryFile }[], refs: StoryRefs = {}): StoryValidation {
  condRefs = refs;
  const issues: Issue[] = [];
  const err = (file: string, id: string | undefined, message: string) => issues.push({ level: 'error', file, id, message });
  const warn = (file: string, id: string | undefined, message: string) => issues.push({ level: 'warning', file, id, message });
  const chapters = new Map<string, string>();
  let beats = 0;
  let lines = 0;

  for (const { file, story } of files) {
    if (!story || typeof story !== 'object') {
      err(file, undefined, 'story file is not an object');
      continue;
    }
    if (!isStr(story.chapter) || !ID_RE.test(story.chapter)) err(file, undefined, 'missing or malformed "chapter" id');
    else if (chapters.has(story.chapter)) err(file, story.chapter, `duplicate chapter (also in ${chapters.get(story.chapter)})`);
    else chapters.set(story.chapter, file);
  }

  for (const { file, story: s } of files) {
    if (!s || typeof s !== 'object') continue;
    const ch = String(s.chapter);
    if (!isNum(s.order)) err(file, ch, '"order" must be a number');
    if (!isStr(s.title_de)) err(file, ch, 'missing title_de');
    if (s.era !== undefined && !isEra(s.era)) err(file, ch, `unknown era '${String(s.era)}'`);
    if (s.next !== undefined && !chapters.has(s.next)) err(file, ch, `next: unknown chapter '${s.next}'`);
    for (const u of s.unlocks ?? []) if (!chapters.has(u)) err(file, ch, `unlocks: unknown chapter '${u}'`);
    if (s.checkpoint) checkPoint(s.checkpoint, file, ch, err);
    if (s.wake !== undefined) {
      checkPoint(s.wake, file, `${ch}:wake`, err);
      if (s.wake.era !== undefined && s.wake.era !== 'today') err(file, ch, 'wake: the curtain always lifts in the present (era today)');
      if (s.wake.text !== undefined && !isStr(s.wake.text)) err(file, ch, 'wake: text must be a string');
    }
    if (!Array.isArray(s.beats) || s.beats.length === 0) {
      err(file, ch, '"beats" must be a non-empty array');
      continue;
    }
    const beatIds = new Set<string>();
    for (const b of s.beats) {
      if (!b || !isStr(b.id) || !ID_RE.test(b.id)) {
        err(file, ch, 'beat with missing or malformed id');
        continue;
      }
      if (beatIds.has(b.id)) err(file, `${ch}/${b.id}`, 'duplicate beat id');
      beatIds.add(b.id);
    }
    if (!beatIds.has(s.start)) err(file, ch, `start: unknown beat '${String(s.start)}'`);
    const chapterReactions = new Set<string>();
    for (const r of s.on ?? []) {
      if (!isStr(r.id)) err(file, ch, 'chapter reaction without id');
      else if (chapterReactions.has(r.id)) err(file, ch, `duplicate reaction id '${r.id}'`);
      else chapterReactions.add(r.id);
      checkCond(r.when, file, `${ch}:on/${r.id}`, err);
      if (r.cooldown !== undefined && (!isNum(r.cooldown) || r.cooldown < 0 || !r.repeat)) err(file, ch, `reaction '${r.id}': cooldown needs repeat and a number ≥ 0`);
      lines += checkActions(r.do, file, `${ch}:on/${r.id}`, err, warn, refs, chapters);
    }
    for (const b of s.beats) {
      if (!b || !isStr(b.id)) continue;
      beats++;
      const where = `${ch}/${b.id}`;
      if (b.next !== undefined && !beatIds.has(b.next)) err(file, where, `next: unknown beat '${b.next}'`);
      if (b.checkpoint !== undefined && !beatIds.has(b.checkpoint)) err(file, where, `checkpoint: unknown beat '${b.checkpoint}'`);
      if (b.wake !== undefined) {
        checkPoint(b.wake, file, `${where}:wake`, err);
        if (b.wake.era !== undefined && b.wake.era !== 'today') err(file, where, 'wake: the curtain always lifts in the present (era today)');
        if (b.wake.text !== undefined && !isStr(b.wake.text)) err(file, where, 'wake: text must be a string');
      }
      if (b.complete === undefined) err(file, where, 'missing "complete" condition');
      else checkCond(b.complete, file, where, err);
      lines += checkActions(b.enter, file, `${where}:enter`, err, warn, refs, chapters);
      lines += checkActions(b.exit, file, `${where}:exit`, err, warn, refs, chapters);
      const rids = new Set<string>();
      for (const r of b.on ?? []) {
        if (!isStr(r.id)) err(file, where, 'reaction without id');
        else if (rids.has(r.id)) err(file, where, `duplicate reaction id '${r.id}'`);
        else rids.add(r.id);
        checkCond(r.when, file, `${where}:on/${r.id}`, err);
        if (r.cooldown !== undefined && (!isNum(r.cooldown) || r.cooldown < 0 || !r.repeat)) err(file, where, `reaction '${r.id}': cooldown needs repeat and a number ≥ 0`);
        lines += checkActions(r.do, file, `${where}:on/${r.id}`, err, warn, refs, chapters);
      }
    }
    if (s.epilogue) {
      const e = s.epilogue;
      for (const k of ENDINGS) {
        if (!isStr(e.intro?.[k])) err(file, ch, `epilogue.intro.${k} missing`);
        if (!isStr(e.outro?.[k])) err(file, ch, `epilogue.outro.${k} missing`);
      }
      for (const r of e.readings ?? []) {
        if (!isStr(r.id)) err(file, ch, 'epilogue reading without id');
        // "offen" (no reading chosen) must exist; it may be empty for add-on sentences (no addition)
        if (!r.text || typeof r.text.offen !== 'string') err(file, ch, `epilogue reading '${r.id}' needs an "offen" entry`);
        if (!r.entry && !(r.flags ?? []).length && !(r.deeds ?? []).length) err(file, ch, `epilogue reading '${r.id}' needs "deeds", "entry" or "flags"`);
        for (const d of r.deeds ?? []) if (!isStr(d.flag) || typeof d.text !== 'string') err(file, ch, `epilogue reading '${r.id}': a deed needs flag and text`);
      }
      for (const [v, per] of Object.entries(e.object?.text ?? {})) for (const k of ENDINGS) if (!isStr(per[k])) err(file, ch, `epilogue.object.${v}.${k} missing`);
    }
  }
  const errors = issues.filter((i) => i.level === 'error');
  return { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.level === 'warning'), stats: { chapters: chapters.size, beats, lines } };
}

type Report = (file: string, id: string | undefined, message: string) => void;

/** Refs for the condition checks (set per validateStories run). */
let condRefs: StoryRefs = {};

function checkPoint(c: { x: unknown; z: unknown; era?: unknown }, file: string, id: string, err: Report): void {
  if (!isNum(c.x) || !isNum(c.z)) err(file, id, 'checkpoint needs numeric x/z');
  if (c.era !== undefined && !isEra(c.era)) err(file, id, `checkpoint: unknown era '${String(c.era)}'`);
}

function checkCond(c: Condition | undefined, file: string, where: string, err: Report): void {
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    err(file, where, 'condition must be an object');
    return;
  }
  const keys = Object.keys(c).filter((k) => (CONDITION_KEYS as readonly string[]).includes(k));
  if (keys.length !== 1) {
    err(file, where, `condition needs exactly one of ${CONDITION_KEYS.join('/')} (got ${Object.keys(c).join(',') || 'nothing'})`);
    return;
  }
  const r = c as unknown as Record<string, unknown>;
  switch (keys[0]) {
    case 'all':
    case 'any':
      if (!Array.isArray(r[keys[0]!]) || (r[keys[0]!] as unknown[]).length === 0) err(file, where, `${keys[0]} needs a non-empty array`);
      else (r[keys[0]!] as Condition[]).forEach((s) => checkCond(s, file, where, err));
      break;
    case 'not':
      checkCond(r.not as Condition, file, where, err);
      break;
    case 'enter':
    case 'leave': {
      const e = r[keys[0]!] as Record<string, unknown>;
      if (!e || !isNum(e.x) || !isNum(e.z) || !isNum(e.r) || (e.r as number) <= 0) err(file, where, `${keys[0]} needs numeric x, z and r > 0`);
      if (e?.era !== undefined && !isEra(e.era)) err(file, where, `${keys[0]}: unknown era '${String(e.era)}'`);
      break;
    }
    case 'event':
      if (!isStr(r.event) || !/^[a-z]+:[a-z-]+$/.test(r.event as string)) err(file, where, `event: malformed event name '${String(r.event)}'`);
      break;
    case 'flag':
      if (!isStr(r.flag)) err(file, where, 'flag needs a name');
      break;
    case 'timer':
      if (!isNum(r.timer) || (r.timer as number) < 0) err(file, where, 'timer needs seconds ≥ 0');
      break;
    case 'era':
      if (!isEra(r.era)) err(file, where, `unknown era '${String(r.era)}'`);
      break;
    case 'have': {
      const h = r.have as Record<string, unknown>;
      if (!h || !(isStr(h.clue) || isStr(h.noun) || isStr(h.item))) err(file, where, 'have needs clue, noun or item');
      break;
    }
    case 'confirmed': {
      const q = r.confirmed as Record<string, unknown>;
      if (!q || !isNum(q.n) || !(isStr(q.case) || isStr(q.prefix))) err(file, where, 'confirmed needs n and case or prefix');
      break;
    }
    case 'caseComplete':
      if (!isStr(r.caseComplete)) err(file, where, 'caseComplete needs a case id');
      break;
    case 'scan':
      if (!isNum(r.scan) || (r.scan as number) < 0 || (r.scan as number) > 3) err(file, where, 'scan must be 0..3');
      break;
    case 'stance':
      if (!['stand', 'crouch', 'prone'].includes(String(r.stance))) err(file, where, `unknown stance '${String(r.stance)}'`);
      break;
    case 'lantern':
      if (typeof r.lantern !== 'boolean') err(file, where, 'lantern must be true/false');
      break;
    case 'hub':
      if (!HUB.has(String(r.hub))) err(file, where, `unknown hub item '${String(r.hub)}'`);
      break;
    case 'room':
      if (!isRoomId(r.room)) err(file, where, `room: malformed room id '${String(r.room)}'`);
      break;
    case 'talked': {
      const q = r.talked as Record<string, unknown>;
      if (!q || typeof q !== 'object' || !isStr(q.npc)) err(file, where, 'talked needs { npc, chapter?, topic? }');
      break;
    }
    case 'speed': {
      const q = r.speed as Record<string, unknown>;
      if (!q || typeof q !== 'object' || (q.gte === undefined && q.lte === undefined) || (q.gte !== undefined && !isNum(q.gte)) || (q.lte !== undefined && !isNum(q.lte))) err(file, where, 'speed needs numeric gte and/or lte');
      break;
    }
    case 'reading':
      if (!isStr(r.reading)) err(file, where, 'reading needs a story flag or entry id');
      if (r.eq !== undefined && !isStr(r.eq)) err(file, where, 'reading: eq must be a string');
      break;
    case 'meter': {
      const m = r.meter as Record<string, unknown>;
      if (!m || !isStr(m.id)) err(file, where, 'meter needs { id, gte? | lte? | full? }');
      else if (m.gte === undefined && m.lte === undefined && m.full !== true) err(file, where, `meter '${String(m.id)}' needs gte, lte or full: true`);
      else for (const k of ['gte', 'lte'] as const) if (m[k] !== undefined && (!isNum(m[k]) || (m[k] as number) < 0 || (m[k] as number) > 1)) err(file, where, `meter ${k} must be 0..1`);
      break;
    }
    case 'chosen':
      if (!isStr(r.chosen)) err(file, where, 'chosen needs a choice id');
      break;
    case 'chapterTimer':
      if (!isNum(r.chapterTimer) || (r.chapterTimer as number) < 0) err(file, where, 'chapterTimer needs seconds ≥ 0');
      break;
    case 'quest': {
      const q = r.quest as Record<string, unknown>;
      if (!q || typeof q !== 'object' || !isStr(q.id) || !QUEST_ID_RE.test(q.id as string)) err(file, where, `quest needs { id: "q.<chapter>.<name>", state? | objective? }`);
      else if (condRefs.quests && !condRefs.quests.has(q.id as string)) err(file, where, `quest: unknown quest '${String(q.id)}'`);
      if (q?.state !== undefined && !QUEST_COND_STATES.has(String(q.state))) err(file, where, `quest: unknown state '${String(q.state)}'`);
      if (q?.objective !== undefined && !isStr(q.objective)) err(file, where, 'quest: objective must be an id');
      if (q?.gte !== undefined && !isNum(q.gte)) err(file, where, 'quest: gte must be a number');
      break;
    }
    case 'level':
      if (!isNum(r.level) || (r.level as number) < 1 || (r.level as number) > 12) err(file, where, 'level must be 1..12');
      break;
    default:
      break;
  }
}

function checkActions(list: Action[] | undefined, file: string, where: string, err: Report, warn: Report, refs: StoryRefs, chapters: Map<string, string>): number {
  if (list === undefined) return 0;
  if (!Array.isArray(list)) {
    err(file, where, 'actions must be an array');
    return 0;
  }
  let lines = 0;
  for (const a of list) {
    if (!a || typeof a !== 'object' || !(ACTION_KINDS as readonly string[]).includes((a as { do?: string }).do ?? '')) {
      err(file, where, `unknown action '${String((a as { do?: unknown })?.do)}'`);
      continue;
    }
    if (a.delay !== undefined && (!isNum(a.delay) || a.delay < 0)) err(file, where, 'delay must be seconds ≥ 0');
    switch (a.do) {
      case 'say':
        lines++;
        if (a.line) {
          if (refs.dialogue && !refs.dialogue.has(a.line)) warn(file, where, `say: dialogue line '${a.line}' not in ContentDB (yet)`);
        } else if (a.variants !== undefined) {
          if (!Array.isArray(a.variants) || !a.variants.length || !a.variants.every(isStr)) err(file, where, 'say: variants must be a non-empty list of texts');
          if (!isStr(a.id)) err(file, where, 'say: variants need an id (the count is kept per id)');
          if (!isStr(a.speaker)) err(file, where, 'say: variants need a speaker');
        } else if (!isStr(a.speaker) || !isStr(a.text)) err(file, where, 'say needs speaker + text, or line');
        if (a.id !== undefined && !ID_RE.test(a.id)) err(file, where, `say: malformed id '${a.id}'`);
        // shown, not told (playtest round 5): a stage direction is an event (sound, cue, staging), never a speaker card
        for (const txt of [a.text, ...(Array.isArray(a.variants) ? a.variants : [])]) {
          if (!isStr(txt)) continue;
          const bad = stageDirection(txt);
          if (bad) err(file, where, `say: ${bad} — stage it (do: sound / cue) instead of writing it`);
        }
        if (a.until !== undefined) checkCond(a.until, file, `${where}:until`, err);
        if (a.text_by_era !== undefined) {
          if (!a.text_by_era || typeof a.text_by_era !== 'object') err(file, where, 'say: text_by_era must be an object');
          else for (const [era, txt] of Object.entries(a.text_by_era)) if (!isEra(era) || !isStr(txt)) err(file, where, `say: text_by_era.${era} needs a known era and text`);
        }
        break;
      case 'objective':
        if (a.text !== undefined && a.text !== null && !isStr(a.text)) err(file, where, 'objective text must be a string or null');
        if ((a.x === undefined) !== (a.z === undefined) || (a.x !== undefined && (!isNum(a.x) || !isNum(a.z)))) err(file, where, 'objective needs both numeric x and z (or neither)');
        break;
      case 'threat':
        if (!THREATS.has(a.kind)) err(file, where, `threat: unknown kind '${String(a.kind)}'`);
        if (typeof a.active !== 'boolean') err(file, where, 'threat needs active: true/false');
        {
          // pack extras declared by the hunt (docs/ARCHITECTURE.md §12): mode + its places
          const x = a as unknown as Record<string, unknown>;
          const pt = (v: unknown) => !!v && typeof v === 'object' && isNum((v as Record<string, unknown>).x) && isNum((v as Record<string, unknown>).z);
          if (x.mode !== undefined && !PACK_MODES.has(String(x.mode))) err(file, where, `threat: unknown pack mode '${String(x.mode)}'`);
          if (x.mode !== undefined && a.kind !== 'pack') err(file, where, 'threat: mode only for kind pack');
          if ((x.mode === 'drive' || x.mode === 'parforce' || x.mode === 'stand' || x.mode === 'kennel') && !pt(x.target)) err(file, where, `threat: mode ${String(x.mode)} needs target {x, z}`);
          for (const k of ['target', 'from', 'center'] as const) if (x[k] !== undefined && !pt(x[k])) err(file, where, `threat: ${k} needs {x, z}`);
          if (x.via !== undefined && (!Array.isArray(x.via) || !x.via.every(pt))) err(file, where, 'threat: via needs [{x, z}, …]');
        }
        break;
      case 'flag':
        if (!a.set || typeof a.set !== 'object') err(file, where, 'flag needs a "set" object');
        break;
      case 'shift':
        if (!isEra(a.to)) err(file, where, `shift: unknown era '${String(a.to)}'`);
        break;
      case 'anchor':
        if (a.to !== null && !isEra(a.to)) err(file, where, `anchor: unknown era '${String(a.to)}'`);
        if (a.to !== null && (!isNum(a.x) || !isNum(a.z))) err(file, where, 'anchor needs x/z');
        break;
      case 'skill':
        if (!isStr(a.id) || !isNum(a.tier)) err(file, where, 'skill needs id and tier');
        break;
      case 'give':
        if (!isStr(a.clue) && !isStr(a.noun) && !isStr(a.item)) err(file, where, 'give needs clue, noun or item');
        if (a.clue && refs.clues && !refs.clues.has(a.clue)) warn(file, where, `give: clue '${a.clue}' not in ContentDB (yet)`);
        if (a.noun && refs.nouns && !refs.nouns.has(a.noun)) warn(file, where, `give: noun '${a.noun}' not in ContentDB (yet)`);
        break;
      case 'toast':
        if (!isStr(a.text)) err(file, where, 'toast needs text');
        break;
      case 'teleport':
        if (!isNum(a.x) || !isNum(a.z)) err(file, where, 'teleport needs x/z');
        break;
      case 'card':
        if (!isStr(a.title)) err(file, where, 'card needs a title');
        break;
      case 'sound':
        if (!SOUNDS.has(a.sound)) err(file, where, `sound: unknown sound '${String(a.sound)}'`);
        // threat sounds must always be captioned (deaf / hard-of-hearing players)
        if (!isStr(a.caption) && (a.sound === 'howl' || a.sound === 'horn')) err(file, where, `threat sound '${a.sound}' needs a caption`);
        else if (!isStr(a.caption) && a.sound !== 'match') warn(file, where, `sound '${a.sound}' has no caption (accessibility)`);
        break;
      case 'look':
        if (!['day', 'dawn', 'dusk', 'night', 'tour'].includes(a.time)) err(file, where, `look: unknown time '${String(a.time)}'`);
        if (a.era !== undefined && !isEra(a.era)) err(file, where, `look: unknown era '${String(a.era)}'`);
        break;
      case 'cue':
        if (!isStr(a.id)) err(file, where, 'cue needs an id');
        break;
      case 'prompt':
        if (a.touch !== undefined) {
          if (!isStr(a.touch)) err(file, where, 'prompt touch must be a text');
          // an interact prompt's text labels the Aktion button on a touch screen
          else if (a.touch.length > 22) warn(file, where, `prompt touch '${a.touch}' is longer than the Aktion button (22 characters)`);
        }
        break;
      case 'choice':
        if (!isStr(a.id) || !isStr(a.prompt) || !Array.isArray(a.options) || a.options.length < 2) err(file, where, 'choice needs id, prompt and ≥ 2 options');
        else
          for (const o of a.options) {
            if (!isStr(o.label) || !o.set || typeof o.set !== 'object') err(file, where, `choice '${a.id}': option needs label and set`);
            if (o.key !== undefined && !ID_RE.test(String(o.key))) err(file, where, `choice '${a.id}': malformed option key '${String(o.key)}'`);
            if (o.when !== undefined) checkCond(o.when, file, `${where}:choice/${a.id}`, err);
            if (o.then !== undefined) lines += checkActions(o.then, file, `${where}:choice/${a.id}`, err, warn, refs, chapters);
          }
        if (a.fallback !== undefined && !(a.fallback >= 0 && a.fallback < (a.options?.length ?? 0))) err(file, where, `choice '${a.id}': fallback out of range`);
        if (a.modal === false && !a.seconds && !(a.options ?? []).some((o) => o.when)) warn(file, where, `inline choice '${a.id}' has neither seconds nor 'when' options: it can only be picked by kq.story.choose`);
        break;
      case 'npc':
        if (isWalkAction(a)) {
          checkWalk(a as NpcWalkAction, file, where, err, warn, refs);
          break;
        }
        if (!isNpcPlacement(a)) break;
        if (a.op !== 'spawn' && a.op !== 'despawn') err(file, where, "npc needs op 'spawn', 'despawn' or a walk op (walk, group, follow, gather, hold, release, warp)");
        if (!isStr(a.npc)) err(file, where, 'npc needs an npc id');
        else if (a.npc !== '*' && !NPCS.has(a.npc) && !PEOPLE.has(a.npc)) warn(file, where, `npc: '${a.npc}' has no roster entry (generic ghost)`);
        if (a.op === 'spawn' && ((a.x === undefined) !== (a.z === undefined) || (a.x !== undefined && (!isNum(a.x) || !isNum(a.z))))) err(file, where, 'npc spawn needs both numeric x and z (or neither: at the player)');
        if (a.era !== undefined && !isEra(a.era)) err(file, where, `npc: unknown era '${String(a.era)}'`);
        if (a.mood !== undefined && !['warm', 'eerie', 'neutral'].includes(a.mood)) err(file, where, `npc: unknown mood '${String(a.mood)}'`);
        if (a.pose !== undefined && a.pose !== 'kneel') err(file, where, `npc: unknown pose '${String(a.pose)}'`);
        if (a.room !== undefined && (!isRoomId(a.room) || !a.room.includes('.'))) err(file, where, `npc: room needs a room id (not a building): '${String(a.room)}'`);
        if (a.watch !== undefined) checkWatch(a.watch, file, where, err);
        break;
      case 'meter':
        if (!isStr(a.id) || !ID_RE.test(a.id)) err(file, where, 'meter needs an id');
        if (typeof a.active !== 'boolean') err(file, where, 'meter needs active: true/false');
        if (a.active && a.id !== 'oil' && !isNum(a.seconds) && a.id !== 'smoke' && a.id !== 'vergessen') err(file, where, `meter '${a.id}' needs seconds`);
        if (a.seconds !== undefined && (!isNum(a.seconds) || a.seconds <= 0)) err(file, where, 'meter seconds must be > 0');
        if (a.full !== undefined && !METER_FULL.has(a.full)) err(file, where, `meter: unknown full '${String(a.full)}'`);
        break;
      case 'echo':
        if (!isStr(a.id)) err(file, where, 'echo needs a clue id');
        else if (refs.clues && !refs.clues.has(a.id)) warn(file, where, `echo: clue '${a.id}' not in ContentDB (yet)`);
        break;
      case 'memorial':
        if (!isStr(a.id)) err(file, where, 'memorial needs an id');
        if (a.active !== false && !isStr(a.room) && (!isNum(a.x) || !isNum(a.z))) err(file, where, 'memorial needs x/z (+ r) or a room');
        if (a.era !== undefined && !isEra(a.era)) err(file, where, `memorial: unknown era '${String(a.era)}'`);
        if (a.room !== undefined && !isRoomId(a.room)) err(file, where, `memorial: malformed room id '${String(a.room)}'`);
        break;
      case 'readings':
        if (a.fill !== 'offen') err(file, where, "readings needs fill: 'offen'");
        break;
      case 'grant':
        if (!isStr(a.clue)) err(file, where, 'grant needs a clue');
        else if (refs.clues && !refs.clues.has(a.clue)) warn(file, where, `grant: clue '${a.clue}' not in ContentDB (yet)`);
        break;
      case 'unlock':
        if (!chapters.has(a.chapter)) err(file, where, `unlock: unknown chapter '${a.chapter}'`);
        break;
      // ---- Action-RPG requests ----
      case 'quest':
        if (!QUEST_OPS.has(a.op)) err(file, where, `quest: unknown op '${String(a.op)}'`);
        if (!isStr(a.id) || !QUEST_ID_RE.test(a.id)) err(file, where, `quest: malformed id '${String(a.id)}' (q.<chapter>.<name>)`);
        else if (refs.quests && !refs.quests.has(a.id)) err(file, where, `quest: unknown quest '${a.id}'`);
        if (a.op === 'progress' && !isStr(a.objective)) err(file, where, 'quest progress needs an objective');
        if (a.n !== undefined && !isNum(a.n)) err(file, where, 'quest: n must be a number');
        break;
      case 'enemy':
        if (a.op !== 'spawn' && a.op !== 'despawn') err(file, where, "enemy needs op 'spawn' or 'despawn'");
        if (!isStr(a.group) || (a.group !== '*' && !ID_RE.test(a.group))) err(file, where, 'enemy needs a group id');
        if (a.op === 'spawn') {
          if (!isStr(a.kind) || !ENEMY_IDS.has(a.kind)) err(file, where, `enemy: unknown kind '${String(a.kind)}' (src/rpg/enemies.ts)`);
          if ((a.x === undefined) !== (a.z === undefined) || (a.x !== undefined && (!isNum(a.x) || !isNum(a.z)))) err(file, where, 'enemy spawn needs both numeric x and z (or neither: at the player)');
          if (a.era !== undefined && !isEra(a.era)) err(file, where, `enemy: unknown era '${String(a.era)}'`);
          if (a.count !== undefined && (!isNum(a.count) || a.count < 1)) err(file, where, 'enemy: count must be ≥ 1');
          if (a.room !== undefined && !isRoomId(a.room)) err(file, where, `enemy: malformed room id '${String(a.room)}'`);
          if (a.time !== undefined && !['any', 'dusk', 'night'].includes(a.time)) err(file, where, `enemy: unknown time '${String(a.time)}'`);
          for (const k of ['escorts', 'wave'] as const) {
            const list = a[k];
            if (list === undefined) continue;
            if (!Array.isArray(list)) err(file, where, `enemy: ${k} must be a list`);
            else for (const x of list) if (!ENEMY_IDS.has(String(x?.kind)) || !isNum(x?.n) || x.n < 1) err(file, where, `enemy: ${k} needs known kinds and n ≥ 1`);
          }
          if (a.near !== undefined && (!isNum(a.near) || a.x === undefined)) err(file, where, 'enemy: near needs a number and x / z to point at');
        }
        break;
      case 'loot':
        if (!isStr(a.id) || !ID_RE.test(a.id)) err(file, where, 'loot needs an id');
        if (!a.clear) {
          if (!isStr(a.item) || !(ITEM_IDS.has(a.item) || refs.items?.has(a.item))) err(file, where, `loot: unknown item '${String(a.item)}'`);
          if ((a.x === undefined) !== (a.z === undefined) || (a.x !== undefined && (!isNum(a.x) || !isNum(a.z)))) err(file, where, 'loot needs both numeric x and z (or neither: at the player)');
          if (a.era !== undefined && !isEra(a.era)) err(file, where, `loot: unknown era '${String(a.era)}'`);
        }
        break;
      case 'xp':
        if (!isNum(a.amount) || a.amount <= 0) err(file, where, 'xp needs an amount > 0');
        break;
      case 'cinematic': {
        if (a.ref !== undefined && a.keys === undefined && a.orbit === undefined) {
          if (!isStr(a.id) || !ID_RE.test(a.id)) err(file, where, 'cinematic needs an id');
          if (refs.cinematics && !refs.cinematics.has(a.ref)) err(file, where, `cinematic: unknown ref '${a.ref}' (content/cinematics/)`);
        } else {
          const n = normalizeCinematic(a);
          if (!n.ok) err(file, where, `cinematic: ${n.error}`);
        }
        break;
      }
      case 'animal':
        checkAnimal(a, file, where, err);
        break;
      case 'fade':
        if (a.to !== 0 && a.to !== 1) err(file, where, 'fade needs to: 0 (back) or 1 (black)');
        if (a.seconds !== undefined && (!isNum(a.seconds) || a.seconds < 0 || a.seconds > 10)) err(file, where, 'fade: seconds must be 0…10');
        break;
      case 'item':
        if (!isStr(a.item) || !(ITEM_IDS.has(a.item) || refs.items?.has(a.item))) err(file, where, `item: unknown item '${String(a.item)}'`);
        if (a.count !== undefined && (!isNum(a.count) || a.count < 1)) err(file, where, 'item: count must be ≥ 1');
        break;
      default:
        break;
    }
  }
  return lines;
}

const isNpcPlacement = (a: Action): a is NpcAction => a.do === 'npc' && !isWalkAction(a);

const WALK_MEMBER_RE = /^(imhoff|guide|double\.[a-z_]+|extra\.[a-z0-9_]+|child\.[a-z_]+|[a-z][a-z0-9_]*)$/;

/** The tour group's ops (contract C2, src/systems/walk/types.ts). */
function checkWalk(a: NpcWalkAction, file: string, where: string, err: Report, warn: Report, refs: StoryRefs): void {
  const route = (id: string | undefined, to: string | undefined, what: string) => {
    if (!id || !refs.routes) return;
    const r = refs.routes.get(id);
    if (!r) err(file, where, `${what}: unknown route '${id}'`);
    else if (to !== undefined && !r.stops.some((s) => s.id === to)) err(file, where, `${what}: route '${id}' has no stop '${to}'`);
  };
  switch (a.op) {
    case 'walk': {
      if (!isStr(a.npc)) err(file, where, 'npc walk needs an npc id');
      const hasRoute = a.route !== undefined;
      if (hasRoute === (a.path !== undefined)) err(file, where, 'npc walk needs exactly one of route + to, or path');
      if (hasRoute) {
        if (!isStr(a.to)) err(file, where, 'npc walk: a route needs its stop "to"');
        route(a.route, a.to, 'npc walk');
      }
      if (a.path !== undefined) for (const m of checkPath(a.path)) err(file, where, `npc walk: ${m}`);
      if (a.speed !== undefined && (!isNum(a.speed) || a.speed < 0.5 || a.speed > 4)) err(file, where, 'npc walk: speed must be 0.5…4 m/s');
      if (a.wait !== undefined && (a.wait.for !== 'player' || !isNum(a.wait.r) || a.wait.r < 8 || a.wait.r > 60)) err(file, where, "npc walk: wait needs for: 'player' and r 8…60");
      break;
    }
    case 'group':
      if (!isStr(a.group) || !isStr(a.leader) || !Array.isArray(a.members) || !a.members.length) err(file, where, 'npc group needs group, leader and members');
      else for (const m of a.members) if (!isStr(m) || !WALK_MEMBER_RE.test(m)) err(file, where, `npc group: malformed member id '${String(m)}'`);
      if (a.era !== undefined && a.era !== 'today') err(file, where, "npc group: era must be 'today'");
      break;
    case 'follow':
      if (!isStr(a.leader)) err(file, where, 'npc follow needs a leader');
      if (!isStr(a.group) && !isStr(a.npc)) err(file, where, 'npc follow needs group or npc');
      break;
    case 'gather':
    case 'hold':
    case 'release':
      if (!isStr(a.group)) err(file, where, `npc ${a.op} needs a group`);
      break;
    case 'despawn':
      if (!isStr(a.group)) err(file, where, 'npc despawn (group) needs a group');
      break;
    case 'warp':
      if (!isStr(a.group) || !isStr(a.to)) err(file, where, 'npc warp needs group and to');
      if (a.route) route(a.route, a.to, 'npc warp');
      else if (refs.routes && ![...refs.routes.values()].some((r) => r.stops.some((s) => s.id === a.to))) warn(file, where, `npc warp: no route has a stop '${a.to}'`);
      break;
  }
}

const ANIMAL_IDS = new Set(['ricke', 'kitz', 'diane', 'bijou']);
const inExtent = (x: unknown, z: unknown) => isNum(x) && isNum(z) && x >= 150 && x <= 2300 && z >= -2150 && z <= 500;

/** Animals (contract C5, src/systems/animals/types.ts). */
function checkAnimal(a: AnimalStoryAction, file: string, where: string, err: Report): void {
  if (!['spawn', 'despawn', 'run', 'lie', 'follow'].includes(a.op)) err(file, where, `animal: unknown op '${String(a.op)}'`);
  if (!isStr(a.id) || !ID_RE.test(a.id)) err(file, where, 'animal needs an id');
  else if (!ANIMAL_IDS.has(a.id)) err(file, where, `animal: unknown id '${a.id}' (ricke, kitz, diane, bijou)`);
  if (a.era !== undefined && a.era !== 'today') err(file, where, "animal: era must be 'today'");
  if (a.op === 'spawn') {
    if (a.kind !== 'reh' && a.kind !== 'hund') err(file, where, "animal spawn needs kind 'reh' or 'hund'");
    if (a.follow === undefined && !inExtent(a.x, a.z)) err(file, where, 'animal spawn needs x/z inside the map (or follow)');
    if (a.shy && !(a.shy.notice > a.shy.flee && a.shy.flee > 0 && a.shy.settle > 0)) err(file, where, 'animal: shy needs notice > flee > 0 and settle > 0');
  }
  if (a.op === 'run' && (!Array.isArray(a.path) || a.path.length < 2 || !a.path.every((p) => inExtent(p[0], p[1])))) err(file, where, 'animal run needs a path of ≥ 2 points inside the map');
  if (a.follow !== undefined && a.follow !== '' && !/^(player|npc:[a-z0-9._-]+|animal:[a-z0-9._-]+)$/.test(a.follow)) err(file, where, `animal: follow must be player, npc:<id> or animal:<id> (got '${a.follow}')`);
}

/** Route files: every point inside the map, every stop on the line (walk/route.ts checkRoute). */
export function checkRoutes(routes: Map<string, Route>): Issue[] {
  const out: Issue[] = [];
  for (const [id, r] of routes) for (const m of checkRoute(r)) out.push({ level: 'error', file: `content/routes/${id}.json`, id, message: m });
  return out;
}
