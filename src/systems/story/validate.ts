/**
 * Story file validator (pure). Used by `pnpm validate` (scripts/validate-content.ts) and the vitest
 * suite. Errors: malformed structure, unknown beat/chapter references, unknown condition/action
 * kinds, missing required fields, bad eras. Warnings: references into ContentDB that do not exist
 * (yet) — the Chronik content is written in parallel, so they must not fail the build.
 */
import { ERAS } from '../../core/era';
import type { Issue } from '../../content/validate';
import { ACTION_KINDS, CONDITION_KEYS, type Action, type Condition, type StoryFile } from './types';

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
}

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const isEra = (v: unknown) => typeof v === 'string' && (ERAS as readonly string[]).includes(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const THREATS = new Set(['pack', 'fire', 'oblivion']);
const SOUNDS = new Set(['howl', 'horn', 'radio', 'beep', 'compass', 'frost', 'match']);
const HUB = new Set(['chronik', 'radio', 'shelf', 'map', 'bed', 'drawer']);
const ENDINGS = ['museum', 'burn', 'keep'] as const;
const NPCS = new Set(['soll', 'hanne', 'jost', 'peter', 'matthes', 'pikeur']);
const METER_FULL = new Set(['return', 'caught', 'none']);

export function validateStories(files: { file: string; story: StoryFile }[], refs: StoryRefs = {}): StoryValidation {
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
      lines += checkActions(r.do, file, `${ch}:on/${r.id}`, err, warn, refs, chapters);
    }
    for (const b of s.beats) {
      if (!b || !isStr(b.id)) continue;
      beats++;
      const where = `${ch}/${b.id}`;
      if (b.next !== undefined && !beatIds.has(b.next)) err(file, where, `next: unknown beat '${b.next}'`);
      if (b.checkpoint !== undefined && !beatIds.has(b.checkpoint)) err(file, where, `checkpoint: unknown beat '${b.checkpoint}'`);
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
        if (!r.entry && !(r.flags ?? []).length) err(file, ch, `epilogue reading '${r.id}' needs "entry" or "flags"`);
      }
      for (const [v, per] of Object.entries(e.object?.text ?? {})) for (const k of ENDINGS) if (!isStr(per[k])) err(file, ch, `epilogue.object.${v}.${k} missing`);
    }
  }
  const errors = issues.filter((i) => i.level === 'error');
  return { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.level === 'warning'), stats: { chapters: chapters.size, beats, lines } };
}

type Report = (file: string, id: string | undefined, message: string) => void;

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
      if (!isStr(r.room) || !/^(KB-[A-Z0-9]+)?(\/?B[0-9]+\.[0-9]+\.[a-z0-9-]+)?$/.test(r.room as string) || !(r.room as string)) err(file, where, `room: malformed room id '${String(r.room)}'`);
      break;
    case 'talked': {
      const q = r.talked as Record<string, unknown>;
      if (!q || typeof q !== 'object' || !isStr(q.npc)) err(file, where, 'talked needs { npc, chapter?, topic? }');
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
        } else if (!isStr(a.speaker) || !isStr(a.text)) err(file, where, 'say needs speaker + text, or line');
        if (a.id !== undefined && !ID_RE.test(a.id)) err(file, where, `say: malformed id '${a.id}'`);
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
        if (!['day', 'dusk', 'night'].includes(a.time)) err(file, where, `look: unknown time '${String(a.time)}'`);
        break;
      case 'cue':
        if (!isStr(a.id)) err(file, where, 'cue needs an id');
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
        if (a.op !== 'spawn' && a.op !== 'despawn') err(file, where, "npc needs op 'spawn' or 'despawn'");
        if (!isStr(a.npc)) err(file, where, 'npc needs an npc id');
        else if (a.npc !== '*' && !NPCS.has(a.npc)) warn(file, where, `npc: '${a.npc}' has no roster entry (generic ghost)`);
        if (a.op === 'spawn' && ((a.x === undefined) !== (a.z === undefined) || (a.x !== undefined && (!isNum(a.x) || !isNum(a.z))))) err(file, where, 'npc spawn needs both numeric x and z (or neither: at the player)');
        if (a.era !== undefined && !isEra(a.era)) err(file, where, `npc: unknown era '${String(a.era)}'`);
        if (a.mood !== undefined && !['warm', 'eerie', 'neutral'].includes(a.mood)) err(file, where, `npc: unknown mood '${String(a.mood)}'`);
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
      default:
        break;
    }
  }
  return lines;
}
