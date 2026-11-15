/**
 * Quest file validator (pure). `pnpm validate` (scripts/validate-content.ts) and the vitest suite
 * run it over content/quests/*.quests.json. Shape: src/rpg/types.ts (QuestFile), JSON schema:
 * content/schema/quests.schema.json, design: docs/ACTION-RPG.md §8–§9.
 *
 * Owner: quests track (extend freely; keep the error / warning split: errors break the build,
 * warnings are for content that is written in parallel).
 */
import { ERAS } from '../../core/era';
import type { Issue } from '../../content/validate';
import { ENEMY_IDS, enemyDef } from '../../rpg/enemies';
import { COLLECTION_IDS, ITEM_IDS } from '../../rpg/items';
import { OBJECTIVE_TYPES, type QuestDef, type QuestFile, type QuestLine, type QuestObjective, type QuestPlace } from '../../rpg/types';

export interface QuestRefs {
  speakers?: Set<string>;
  /** Speakers marked historical (their lines need sources). */
  historical?: Set<string>;
  facts?: Set<string>;
  clues?: Set<string>;
  chapters?: Set<string>;
  bounds?: { x0: number; z0: number; x1: number; z1: number };
}

export interface QuestValidation {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: { files: number; quests: number; main: number; side: number; objectives: number; items: number };
  /** Every quest id (for the story validator). */
  questIds: Set<string>;
  /** Items declared by quest files. */
  itemIds: Set<string>;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isEra = (v: unknown) => typeof v === 'string' && (ERAS as readonly string[]).includes(v);
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const QUEST_ID_RE = /^q\.([a-z0-9]+)\.[a-z0-9_-]+$/;
const ITEM_ID_RE = /^item\.([a-z0-9]+)\.[a-z0-9_-]+$/;
const ROOM_RE = /^(KB-[A-Z0-9]+\/)?B[0-9]+\.[0-9]+\.[a-z0-9-]+$/;
const EVENT_RE = /^[a-z]+:[a-z-]+$/;
const SKILLS = new Set(['relief', 'kartograf', 'baumeister', 'roentgen', 'spurenleser']);
const ANIMALS = new Set(['cassowary', 'dromedary', 'jaguar']);
const VOICES = new Set(['laub', 'marlene']);
/** NPCs with a figure in the roster (others become a generic ghost: warning). */
const ROSTER = new Set(['soll', 'hanne', 'jost', 'peter', 'matthes', 'pikeur', 'gaertner', 'diener', 'wache', 'fuhrmann', 'frau', 'mann', 'junge']);

/** Chapter id → the short form used in quest / item ids (prolog → p, enden → end). */
export function chapterKey(chapter: string): string {
  return chapter === 'prolog' ? 'p' : chapter === 'enden' ? 'end' : chapter;
}

export function validateQuests(files: { file: string; data: QuestFile }[], refs: QuestRefs = {}): QuestValidation {
  const issues: Issue[] = [];
  const err = (file: string, id: string | undefined, message: string) => issues.push({ level: 'error', file, id, message });
  const warn = (file: string, id: string | undefined, message: string) => issues.push({ level: 'warning', file, id, message });
  const questIds = new Set<string>();
  const itemIds = new Set<string>();
  const stats = { files: files.length, quests: 0, main: 0, side: 0, objectives: 0, items: 0 };

  // pass 1: ids
  for (const { file, data } of files) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.quests)) {
      err(file, undefined, 'quest file needs { chapter, quests: [] }');
      continue;
    }
    for (const q of data.quests) {
      if (!q || !isStr(q.id)) continue;
      if (questIds.has(q.id)) err(file, q.id, 'duplicate quest id');
      questIds.add(q.id);
    }
    for (const it of data.items ?? []) {
      if (!it || !isStr(it.id)) continue;
      if (itemIds.has(it.id) || ITEM_IDS.has(it.id)) err(file, it.id, 'duplicate item id');
      itemIds.add(it.id);
    }
  }
  const itemKnown = (id: unknown) => isStr(id) && (ITEM_IDS.has(id) || itemIds.has(id));

  for (const { file, data } of files) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.quests)) continue;
    if (!isStr(data.chapter)) err(file, undefined, 'missing "chapter"');
    else if (refs.chapters && !refs.chapters.has(data.chapter)) err(file, undefined, `unknown chapter '${data.chapter}'`);
    const ck = chapterKey(String(data.chapter ?? ''));

    for (const it of data.items ?? []) {
      stats.items++;
      const m = isStr(it?.id) ? ITEM_ID_RE.exec(it.id) : null;
      if (!m) err(file, String(it?.id), "item id must be 'item.<chapter>.<name>'");
      else if (m[1] !== ck) err(file, it.id, `item id chapter '${m[1]}' does not match the file's chapter '${ck}'`);
      if (!['quest', 'lore', 'key', 'consumable', 'charm', 'weapon'].includes(String(it?.kind))) err(file, String(it?.id), `item: unknown kind '${String(it?.kind)}'`);
      if (!isStr(it?.name_de) || !isStr(it?.text_de)) err(file, String(it?.id), 'item needs name_de and text_de');
      if (it?.set !== undefined && !COLLECTION_IDS.has(it.set)) err(file, String(it?.id), `item: unknown collection set '${it.set}' (src/rpg/items.ts COLLECTIONS)`);
      if (it?.fact !== undefined && refs.facts && !refs.facts.has(it.fact)) err(file, String(it?.id), `item: unknown codex fact '${it.fact}'`);
    }

    for (const q of data.quests) {
      if (!q || typeof q !== 'object') {
        err(file, undefined, 'quest must be an object');
        continue;
      }
      stats.quests++;
      const qid = String(q.id);
      const m = QUEST_ID_RE.exec(qid);
      if (!m) err(file, qid, "quest id must be 'q.<chapter>.<name>'");
      else if (m[1] !== ck) err(file, qid, `quest id chapter '${m[1]}' does not match the file's chapter '${ck}'`);
      if (q.kind === 'main') stats.main++;
      else if (q.kind === 'side') stats.side++;
      else err(file, qid, "kind must be 'main' or 'side'");
      if (!isStr(q.title_de)) err(file, qid, 'missing title_de');
      if (!isStr(q.summary_de)) err(file, qid, 'missing summary_de');
      if (q.era !== undefined && !isEra(q.era)) err(file, qid, `unknown era '${String(q.era)}'`);
      checkGiver(q, file, qid, err, warn);
      checkLines(q.offer, 'offer', file, qid, refs, err, warn, true);
      checkLines(q.progress, 'progress', file, qid, refs, err, warn);
      checkLines(q.turnin_lines, 'turnin_lines', file, qid, refs, err, warn);
      checkLines(q.history, 'history', file, qid, refs, err, warn);
      for (const h of q.history ?? []) {
        if (h?.fact !== undefined && refs.facts && !refs.facts.has(h.fact)) err(file, qid, `history: unknown codex fact '${h.fact}'`);
        if (!h?.fact && !(h?.sources ?? []).length) warn(file, qid, 'history line without fact or sources (is it history?)');
      }
      if (q.stance) {
        const s = q.stance;
        if (!isStr(s.id) || !isStr(s.prompt_de) || !isStr(s.flag)) err(file, qid, 'stance needs id, prompt_de and flag');
        if (!Array.isArray(s.options) || s.options.length < 2) err(file, qid, 'stance needs ≥ 2 options');
        else {
          if (!s.options.some((o) => o?.value === 'offen')) err(file, qid, "stance needs an 'offen' option (no reading is a reading)");
          for (const o of s.options) {
            if (!isStr(o?.label_de) || !isStr(o?.value)) err(file, qid, 'stance option needs label_de and value');
            checkLines(o?.reply, 'stance reply', file, qid, refs, err, warn);
          }
        }
      }
      // objectives
      if (!Array.isArray(q.objectives) || q.objectives.length === 0) err(file, qid, 'needs ≥ 1 objective');
      const objIds = new Set<string>();
      for (const o of q.objectives ?? []) {
        if (!o || !isStr(o.id) || !ID_RE.test(o.id)) {
          err(file, qid, `objective with missing or malformed id '${String(o?.id)}'`);
          continue;
        }
        if (objIds.has(o.id)) err(file, qid, `duplicate objective '${o.id}'`);
        objIds.add(o.id);
      }
      if ((q.objectives ?? []).length && (q.objectives ?? []).every((o) => o?.optional)) err(file, qid, 'every objective is optional: the quest could never be ready');
      for (const o of q.objectives ?? []) {
        if (!o || !isStr(o.id)) continue;
        stats.objectives++;
        checkObjective(o, objIds, file, `${qid}/${o.id}`, refs, itemKnown, err, warn);
      }
      // rewards
      const r = q.rewards;
      if (r) {
        if (r.xp !== undefined && (!isNum(r.xp) || r.xp < 0)) err(file, qid, 'rewards.xp must be ≥ 0');
        for (const i of r.items ?? []) if (!itemKnown(i?.item)) err(file, qid, `rewards: unknown item '${String(i?.item)}'`);
        for (const c of r.codex ?? []) if (refs.facts && !refs.facts.has(c)) err(file, qid, `rewards: unknown codex fact '${c}'`);
        for (const s of r.skills ?? []) if (!SKILLS.has(String(s?.id)) || !isNum(s?.tier) || s.tier < 1 || s.tier > 3) err(file, qid, `rewards: bad skill '${String(s?.id)}:${String(s?.tier)}'`);
      } else if (q.kind === 'main') warn(file, qid, 'main quest without rewards');
      if (q.available) {
        for (const a of q.available.after ?? []) if (!questIds.has(a)) err(file, qid, `available.after: unknown quest '${a}'`);
        if (q.available.era !== undefined && !isEra(q.available.era)) err(file, qid, `available.era: unknown era '${String(q.available.era)}'`);
        if (q.kind === 'main') warn(file, qid, 'main quests are offered by the story (`quest` action); `available` is meant for side quests');
      } else if (q.kind === 'side') warn(file, qid, 'side quest without `available`: only a story `quest` action offers it');
      if (q.next !== undefined && !questIds.has(q.next)) err(file, qid, `next: unknown quest '${q.next}'`);
    }
  }
  const errors = issues.filter((i) => i.level === 'error');
  return { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.level === 'warning'), stats, questIds, itemIds };

  function checkPlace(p: QuestPlace | undefined, what: string, file: string, id: string): void {
    if (!p || typeof p !== 'object' || !isNum(p.x) || !isNum(p.z)) {
      err(file, id, `${what} needs numeric x/z`);
      return;
    }
    if (p.r !== undefined && (!isNum(p.r) || p.r <= 0)) err(file, id, `${what}: r must be > 0`);
    if (p.era !== undefined && !isEra(p.era)) err(file, id, `${what}: unknown era '${String(p.era)}'`);
    if (p.room !== undefined && !(isStr(p.room) && ROOM_RE.test(p.room))) err(file, id, `${what}: malformed room id '${String(p.room)}'`);
    const b = refs.bounds;
    if (b && (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1)) err(file, id, `${what} (${p.x}/${p.z}) lies outside the playable area`);
  }

  function checkObjective(o: QuestObjective, objIds: Set<string>, file: string, id: string, refs: QuestRefs, itemKnown: (v: unknown) => boolean, err: Rep, warn: Rep): void {
    if (!(OBJECTIVE_TYPES as readonly string[]).includes(o.type)) {
      err(file, id, `unknown objective type '${String(o.type)}'`);
      return;
    }
    if (!isStr(o.text_de)) err(file, id, 'objective needs text_de');
    if (o.count !== undefined && (!isNum(o.count) || o.count < 1)) err(file, id, 'count must be ≥ 1');
    for (const a of o.after ?? []) if (!objIds.has(a) || a === o.id) err(file, id, `after: unknown objective '${a}'`);
    if (o.where) checkPlace(o.where, 'where', file, id);
    for (const sp of o.spawn ?? []) {
      if (!ENEMY_IDS.has(String(sp?.kind))) err(file, id, `spawn: unknown enemy '${String(sp?.kind)}' (src/rpg/enemies.ts)`);
      checkPlace({ x: sp?.x, z: sp?.z, era: sp?.era } as QuestPlace, 'spawn', file, id);
      if (!isEra(sp?.era)) err(file, id, 'spawn needs an era');
      else {
        const d = enemyDef(String(sp.kind));
        if (d && !d.eras.includes(sp.era)) warn(file, id, `spawn: ${d.id} does not belong to era ${sp.era}`);
      }
      if (sp?.count !== undefined && (!isNum(sp.count) || sp.count < 1)) err(file, id, 'spawn: count must be ≥ 1');
    }
    switch (o.type) {
      case 'kill':
        if (!isStr(o.enemy) && !isStr(o.group) && !(o.spawn ?? []).length) err(file, id, 'kill needs enemy, group or spawn');
        if (o.enemy !== undefined && !ENEMY_IDS.has(o.enemy)) err(file, id, `kill: unknown enemy '${o.enemy}'`);
        break;
      case 'collect':
        if (!itemKnown(o.item)) err(file, id, `collect: unknown item '${String(o.item)}'`);
        for (const p of o.place ?? []) checkPlace(p, 'place', file, id);
        if (o.drop && (!ENEMY_IDS.has(o.drop.enemy) || !isNum(o.drop.chance) || o.drop.chance <= 0 || o.drop.chance > 1)) err(file, id, 'collect.drop needs a known enemy and a chance 0..1');
        if (!(o.place ?? []).length && !o.drop) warn(file, id, 'collect without place or drop: only item:grant / story loot can fill it');
        if ((o.place ?? []).length && (o.place ?? []).length < (o.count ?? 1)) err(file, id, `collect: ${(o.place ?? []).length} places for count ${o.count ?? 1}`);
        break;
      case 'reach':
        if (!o.where) err(file, id, 'reach needs where');
        break;
      case 'talk':
      case 'escort':
        if (!isStr(o.npc)) err(file, id, `${o.type} needs npc`);
        if (o.type === 'escort') checkPlace(o.to, 'escort.to', file, id);
        break;
      case 'room':
        if (!isStr(o.room) || !/^(KB-[A-Z0-9]+|(KB-[A-Z0-9]+\/)?B[0-9]+\.[0-9]+\.[a-z0-9-]+)$/.test(o.room)) err(file, id, `room: malformed room id '${String(o.room)}'`);
        break;
      case 'examine':
      case 'echo':
        if (!isStr(o.clue)) err(file, id, `${o.type} needs clue`);
        else if (refs.clues && !refs.clues.has(o.clue)) err(file, id, `${o.type}: unknown clue '${o.clue}'`);
        break;
      case 'calm':
        if (!isStr(o.animal)) err(file, id, 'calm needs animal (kind or menagerie id)');
        else if (!ANIMALS.has(o.animal)) warn(file, id, `calm: '${o.animal}' is not an animal kind; treated as a menagerie id`);
        break;
      case 'survive':
        if (!isNum(o.seconds) || o.seconds <= 0) err(file, id, 'survive needs seconds');
        break;
      case 'use':
        if (!itemKnown(o.item)) err(file, id, `use: unknown item '${String(o.item)}'`);
        break;
      case 'event':
        if (!isStr(o.event) || !EVENT_RE.test(o.event)) err(file, id, `event: malformed event '${String(o.event)}'`);
        break;
      case 'manual':
        break;
    }
    void warn;
  }

  function checkGiver(q: QuestDef, file: string, qid: string, err: Rep, warn: Rep): void {
    const g = q.giver as unknown as Record<string, unknown> | undefined;
    if (!g || typeof g !== 'object') {
      err(file, qid, 'missing giver');
      return;
    }
    if ('npc' in g) {
      if (!isStr(g.npc)) err(file, qid, 'giver.npc must be an npc id');
      else if (!ROSTER.has(g.npc)) warn(file, qid, `giver '${g.npc}' has no roster figure (generic ghost)`);
    } else if ('voice' in g) {
      if (!VOICES.has(String(g.voice))) err(file, qid, `giver.voice must be laub or marlene`);
    } else err(file, qid, 'giver needs npc or voice');
    const t = q.turnin as unknown;
    if (t !== undefined && t !== 'giver' && t !== 'auto') {
      const o = t as Record<string, unknown>;
      if (!o || typeof o !== 'object' || !(isStr(o.npc) || VOICES.has(String(o.voice)))) err(file, qid, "turnin must be 'giver', 'auto', {npc} or {voice}");
    }
  }
}

type Rep = (file: string, id: string | undefined, message: string) => void;

function checkLines(lines: QuestLine[] | undefined, what: string, file: string, qid: string, refs: QuestRefs, err: Rep, warn: Rep, required = false): void {
  if (lines === undefined) {
    if (required) err(file, qid, `missing ${what} lines`);
    return;
  }
  if (!Array.isArray(lines)) {
    err(file, qid, `${what} must be a list of lines`);
    return;
  }
  if (required && !lines.length) err(file, qid, `${what} needs ≥ 1 line`);
  for (const l of lines) {
    if (!l || !isStr(l.speaker) || !isStr(l.text)) {
      err(file, qid, `${what}: line needs speaker and text`);
      continue;
    }
    if (refs.speakers && !refs.speakers.has(l.speaker)) err(file, qid, `${what}: unknown speaker '${l.speaker}'`);
    // historical persons say only what the sources support (PRD §4.4 rule 2)
    if (refs.historical?.has(l.speaker) && !(l.sources ?? []).length) err(file, qid, `${what}: historical speaker '${l.speaker}' needs sources`);
    for (const s of l.sources ?? []) if (!isStr(s?.url) || !/^https?:\/\//.test(s.url) || !isStr(s?.label)) err(file, qid, `${what}: source needs an http(s) url and a label`);
    if (l.text.length > 420) warn(file, qid, `${what}: very long line (${l.text.length} chars) — split it`);
  }
}
