/**
 * Voice pipeline: pure helpers (no network, no ffmpeg). Imported by `generate.mjs` (Node 24 runs
 * this file with built-in type stripping, so only erasable TypeScript here) and by
 * `tests/voice-pipeline.test.ts`.
 *
 * Contract with in-game playback (do not change): manifest `public/voice/manifest.json`
 *   { version: 1, lines: { <lineId>: { file, textHash, speaker, voiceId, model, date, chars, credits, durationMs } } }
 * file = `<lineId>.<textHash>.mp3`; textHash = FNV-1a 32 over UTF-8 of the normalised display text.
 */
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------------------------
// Hash

/** The text the hash is taken over: NFC, whitespace runs collapsed to one space, trimmed. */
export function normalizeForHash(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** FNV-1a 32-bit over the UTF-8 bytes, lowercase hex padded to 8. */
export function fnv1a32(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** textHash of a line's displayed `text_de` (the raw content string, placeholders unfilled). */
export function textHash(text: string): string {
  return fnv1a32(new TextEncoder().encode(normalizeForHash(text)));
}

// ---------------------------------------------------------------------------------------------
// Credits

/** Credits per character by model (ElevenLabs docs, checked 2026-11-20: Flash/Turbo v2.5 are
 * "50% lower price per character" than Multilingual v2 / v3, which cost 1 credit per character). */
export const CREDITS_PER_CHAR: Readonly<Record<string, number>> = {
  eleven_v3: 1.0,
  eleven_multilingual_v2: 1.0,
  eleven_flash_v2_5: 0.5,
  eleven_turbo_v2_5: 0.5,
};

/** Models that take `language_code` (the docs: ignored where unsupported, not supported by multilingual_v2). */
export function supportsLanguageCode(model: string): boolean {
  return model !== 'eleven_multilingual_v2' && !model.startsWith('eleven_monolingual');
}

export function creditsFor(chars: number, model: string): number {
  const rate = CREDITS_PER_CHAR[model];
  if (rate === undefined) throw new Error(`unknown model "${model}": add it to CREDITS_PER_CHAR`);
  return Math.ceil(chars * rate);
}

// ---------------------------------------------------------------------------------------------
// Text prep (what is sent to TTS; never used for the hash)

const STAGE_WORDS = /\((?:[a-zäöüß]+end|Pause|Lange Pause|sehr leise|leise|seufzt|lacht|flüstert|räuspert sich)\)\s*/gi;

/**
 * Turn a displayed line into the text to speak. Returns null when nothing is left to speak
 * (a pure sound caption such as "[Stille]").
 * - "[…]" sound captions are dropped (an editorial "breite[r]" inside a word keeps its letters);
 *   "(hustend)"-style stage directions are dropped.
 * - "{Name}" / "{name}" (the player's name, unknown at build time) is dropped with its comma.
 * - "{jahre:1793}" → "über zweihundert", "{jahr}" → "heute": the game's own year-free fallbacks,
 *   so the clip does not go stale with the calendar.
 */
export function prepareTtsText(text: string): string | null {
  let t = normalizeForHash(text);
  t = t.replace(/(?<=\p{L})\[([^\]\s]*)\]/gu, '$1'); // editorial "breite[r]" → "breiter"
  t = t.replace(/\[[^\]]*\]/g, ' ');
  t = t.replace(STAGE_WORDS, ' ');
  t = t.replace(/\{jahre:(\d{3,4})\}/g, (_m, y: string) => (Number(y) < 1900 ? 'über zweihundert' : 'vielen'));
  t = t.replace(/\{jahr\}/g, 'heute');
  t = t.replace(/\s*,\s*\{[Nn]ame\}/g, '');
  t = t.replace(/\{[Nn]ame\}\s*[,?!.:]?\s*/g, '');
  t = t.replace(/\s+([,.!?:;])/g, '$1').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[,.:;!?–—\s]+/, '');
  if (!/[\p{L}\p{N}]/u.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------------------------
// Collecting lines from content

export type LineSource = 'pack' | 'story' | 'quest';

export interface VoiceLine {
  id: string;
  speaker: string;
  /** displayed text (`text_de` / `text`), hashed as is */
  text: string;
  /** chapter id as in the story files (`prolog`, `k1` … `enden`), null for global packs (barks) */
  chapter: string | null;
  /** `<chapter>:<beatId>` of every beat that speaks it */
  beats: string[];
  source: LineSource;
  /** pack name (`prolog`, `voices`, …), story or quest file name */
  file: string;
  /** quest id for quest lines */
  quest?: string;
  /** global position in play order (story order first, then pack order) */
  order: number;
}

/** story chapter → pack name holding its lines */
export const CHAPTER_PACK: Readonly<Record<string, string>> = {
  prolog: 'prolog',
  k1: 'kapitel-1',
  k2: 'kapitel-2',
  k3: 'kapitel-3',
  k4: 'kapitel-4',
  enden: 'enden',
};

interface PackLine {
  id: string;
  speaker: string;
  text_de: string;
  trigger?: { event?: string; chapter?: string; beat?: string };
}
interface Pack {
  pack: string;
  dialogue?: PackLine[];
}
interface StoryFile {
  chapter: string;
  order: number;
  test?: boolean;
  on?: unknown[];
  beats: { id: string }[];
}
interface QuestFile {
  chapter?: string;
  quests?: { id: string; [k: string]: unknown }[];
}

export interface ContentSet {
  packs: Pack[];
  stories: { file: string; data: StoryFile }[];
  quests: { file: string; data: QuestFile }[];
}

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));

/** Read packs, story files (test chapters skipped) and quest files under a content root. */
export function loadContent(root: string): ContentSet {
  const list = (dir: string, re: RegExp) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => re.test(f)).sort() : []);
  const packs = list('packs', /\.pack\.json$/).map((f) => readJson(join(root, 'packs', f)) as Pack);
  const stories = list('story', /\.story\.json$/)
    .map((f) => ({ file: f, data: readJson(join(root, 'story', f)) as StoryFile }))
    .filter((s) => !s.data.test)
    .sort((a, b) => a.data.order - b.data.order);
  const quests = list('quests', /\.quests\.json$/)
    .map((f) => ({ file: f, data: readJson(join(root, 'quests', f)) as QuestFile }))
    .filter((q) => !/^9\d-/.test(q.file));
  return { packs, stories, quests };
}

interface SayAction {
  do: 'say';
  id?: string;
  line?: string;
  speaker?: string;
  text?: string;
  variants?: string[];
  text_by_era?: Record<string, string>;
}

function* sayActions(x: unknown): Generator<SayAction> {
  if (Array.isArray(x)) for (const v of x) yield* sayActions(v);
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (o.do === 'say') yield o as unknown as SayAction;
    for (const v of Object.values(o)) yield* sayActions(v);
  }
}

/**
 * All voiceable lines in play order. Line ids are the ids the game speaks them under:
 * pack lines → their `id`; inline story `say` → its `id`; variants of a `say` → `<id>.v<n>`
 * (1-based, n-th run); `text_by_era` → `<id>.era-<era>`; quest lines (no id in the game) →
 * `quest.<questId>.<field>.<n>` (0-based), to be matched by textHash at playback.
 */
export function collectLines(content: ContentSet): VoiceLine[] {
  const out = new Map<string, VoiceLine>();
  const packLine = new Map<string, { line: PackLine; pack: string }>();
  for (const p of content.packs) for (const l of p.dialogue ?? []) if (!packLine.has(l.id)) packLine.set(l.id, { line: l, pack: p.pack });
  const packChapter = new Map(Object.entries(CHAPTER_PACK).map(([c, p]) => [p, c] as const));
  let order = 0;

  const add = (l: Omit<VoiceLine, 'order' | 'beats'>, beat?: string) => {
    let cur = out.get(l.id);
    if (!cur) {
      cur = { ...l, beats: [], order: order++ };
      out.set(l.id, cur);
    }
    if (beat && !cur.beats.includes(beat)) cur.beats.push(beat);
  };
  const addPack = (id: string, beat?: string) => {
    const p = packLine.get(id);
    if (!p) return;
    add({ id, speaker: p.line.speaker, text: p.line.text_de, chapter: packChapter.get(p.pack) ?? null, source: 'pack', file: p.pack }, beat);
  };
  const addSay = (s: SayAction, chapter: string, file: string, beat?: string) => {
    if (s.line) return addPack(s.line, beat);
    if (!s.id || !s.speaker) return;
    const base = { speaker: s.speaker, chapter, source: 'story' as const, file };
    if (typeof s.text === 'string') {
      if (packLine.has(s.id)) addPack(s.id, beat);
      else add({ ...base, id: s.id, text: s.text }, beat);
    }
    (s.variants ?? []).forEach((t, i) => add({ ...base, id: `${s.id}.v${i + 1}`, text: t }, beat));
    for (const [era, t] of Object.entries(s.text_by_era ?? {})) add({ ...base, id: `${s.id}.era-${era}`, text: t }, beat);
  };

  for (const { file, data } of content.stories) {
    const chapter = data.chapter;
    const pack = content.packs.find((p) => p.pack === CHAPTER_PACK[chapter]);
    for (const beat of data.beats) {
      const key = `${chapter}:${beat.id}`;
      for (const s of sayActions(beat)) addSay(s, chapter, file, key);
      for (const l of pack?.dialogue ?? [])
        if (l.trigger?.event === 'story:beat' && l.trigger.beat?.toLowerCase() === beat.id.toLowerCase()) addPack(l.id, key);
    }
    for (const s of sayActions(data.on ?? [])) addSay(s, chapter, file);
    for (const l of pack?.dialogue ?? []) addPack(l.id);
    for (const q of content.quests.filter((x) => x.data.chapter === chapter)) addQuestLines(q, chapter, add);
  }
  for (const p of content.packs) for (const l of p.dialogue ?? []) addPack(l.id);
  for (const q of content.quests) addQuestLines(q, q.data.chapter ?? null, add);
  return [...out.values()];
}

function addQuestLines(q: { file: string; data: QuestFile }, chapter: string | null, add: (l: Omit<VoiceLine, 'order' | 'beats'>) => void): void {
  for (const quest of q.data.quests ?? []) {
    for (const [field, v] of Object.entries(quest)) {
      if (!Array.isArray(v)) continue;
      v.forEach((l: unknown, i) => {
        const o = l as { speaker?: unknown; text?: unknown };
        if (typeof o?.speaker === 'string' && typeof o.text === 'string')
          add({ id: `quest.${quest.id}.${field}.${i}`, speaker: o.speaker, text: o.text, chapter, source: 'quest', file: q.file, quest: quest.id });
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Priority selection

/** One selector; all given keys must match (AND). Globs: `*` any run, `?` one char. */
export interface Selector {
  ids?: string[];
  beats?: string[];
  chapter?: string;
  pack?: string;
  source?: LineSource;
  quests?: string[];
  all?: boolean;
}
export interface Tier {
  name: string;
  speakers?: string[];
  select: Selector[];
}
export interface PriorityConfig {
  tiers: Tier[];
}

export function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`);
}
const anyGlob = (globs: string[], s: string) => globs.some((g) => globToRegExp(g).test(s));

export function matches(line: VoiceLine, sel: Selector): boolean {
  if (sel.ids && !anyGlob(sel.ids, line.id)) return false;
  if (sel.beats && !line.beats.some((b) => anyGlob(sel.beats!, b))) return false;
  if (sel.chapter !== undefined && line.chapter !== sel.chapter) return false;
  if (sel.pack !== undefined && !(line.source === 'pack' && line.file === sel.pack)) return false;
  if (sel.source !== undefined && line.source !== sel.source) return false;
  if (sel.quests && !(line.quest && anyGlob(sel.quests, line.quest))) return false;
  if (!sel.ids && !sel.beats && sel.chapter === undefined && !sel.pack && !sel.source && !sel.quests && !sel.all) return false;
  return true;
}

export interface Selected {
  line: VoiceLine;
  tier: string;
}

/**
 * Order lines by tier, then by play order inside a tier. Each line appears once (first tier wins).
 * `ids` (explicit list / globs) replaces the tiers: matching lines in the order of the list.
 */
export function selectLines(lines: VoiceLine[], cfg: PriorityConfig, o: { ids?: string[]; speakers?: string[] } = {}): Selected[] {
  const seen = new Set<string>();
  const out: Selected[] = [];
  const okSpeaker = (l: VoiceLine) => !o.speakers || o.speakers.includes(l.speaker);
  if (o.ids && o.ids.length) {
    for (const g of o.ids) {
      const re = globToRegExp(g);
      for (const l of lines) if (re.test(l.id) && okSpeaker(l) && !seen.has(l.id)) (seen.add(l.id), out.push({ line: l, tier: 'explicit' }));
    }
    return out;
  }
  const sorted = [...lines].sort((a, b) => a.order - b.order);
  for (const tier of cfg.tiers) {
    for (const l of sorted) {
      if (seen.has(l.id) || !okSpeaker(l)) continue;
      if (tier.speakers && !tier.speakers.includes(l.speaker)) continue;
      if (!tier.select.some((s) => matches(l, s))) continue;
      seen.add(l.id);
      out.push({ line: l, tier: tier.name });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Voices

export interface SpeakerVoice {
  voiceId?: string | null;
  model?: string | null;
  voiceSettings?: Record<string, number | boolean>;
}
export interface VoicesConfig {
  defaultModel?: string;
  speakers: Record<string, SpeakerVoice>;
}

export const isPlaceholderVoice = (id: string | null | undefined): boolean => !id || /^(PLACEHOLDER|TODO)/i.test(id);

export interface ResolvedVoice {
  voiceId: string;
  model: string;
  placeholder: boolean;
  voiceSettings?: Record<string, number | boolean>;
}

/** Per-speaker model wins over the run model (`--model`), which wins over `defaultModel`. */
export function resolveVoice(speaker: string, voices: VoicesConfig, runModel?: string): ResolvedVoice | null {
  const v = voices.speakers[speaker];
  if (!v || !v.voiceId) return null;
  const model = v.model || runModel || voices.defaultModel || 'eleven_flash_v2_5';
  return { voiceId: v.voiceId, model, placeholder: isPlaceholderVoice(v.voiceId), voiceSettings: v.voiceSettings };
}

// ---------------------------------------------------------------------------------------------
// Manifest

export interface ManifestEntry {
  file: string;
  textHash: string;
  speaker: string;
  voiceId: string;
  model: string;
  date: string;
  chars: number;
  credits: number;
  durationMs: number;
  /** textHash of the text actually sent to TTS (speech override or auto-prep); regenerate when it changes */
  speechHash?: string;
}
export interface Manifest {
  version: 1;
  lines: Record<string, ManifestEntry>;
}

export const emptyManifest = (): Manifest => ({ version: 1, lines: {} });
export const clipFile = (lineId: string, hash: string): string => `${lineId}.${hash}.mp3`;

export function readManifest(path: string): Manifest {
  if (!existsSync(path)) return emptyManifest();
  const m = readJson(path) as Partial<Manifest>;
  if (m.version !== 1 || !m.lines || typeof m.lines !== 'object') throw new Error(`${path}: not a version-1 voice manifest`);
  return { version: 1, lines: m.lines };
}

/** Write via temp file + rename, so a crash never leaves a half-written manifest. Keys sorted. */
export function writeManifest(path: string, m: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines: Record<string, ManifestEntry> = {};
  for (const k of Object.keys(m.lines).sort()) lines[k] = m.lines[k]!;
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, lines }, null, 2) + '\n');
  renameSync(tmp, path);
}

export type LineStatus = 'new' | 'up-to-date' | 'stale-text' | 'stale-voice' | 'stale-model' | 'stale-speech' | 'missing-file';

/**
 * Does this line need (re)generating? `speechHash` (hash of the TTS text) catches a changed speech
 * override or text prep while the displayed text stayed the same. `fileExists` checks the clip on disk.
 */
export function lineStatus(
  entry: ManifestEntry | undefined,
  hash: string,
  voice: { voiceId: string; model: string },
  fileExists: (f: string) => boolean = () => true,
  speechHash?: string,
): LineStatus {
  if (!entry) return 'new';
  if (entry.textHash !== hash) return 'stale-text';
  if (entry.voiceId !== voice.voiceId) return 'stale-voice';
  if (entry.model !== voice.model) return 'stale-model';
  if (speechHash !== undefined && entry.speechHash !== speechHash) return 'stale-speech';
  if (!fileExists(entry.file)) return 'missing-file';
  return 'up-to-date';
}

// ---------------------------------------------------------------------------------------------
// Speech overrides (scripts/voice/speech.json)

/** Per line: what to speak instead of the auto-prepared text, valid only for one version of the text. */
export interface SpeechOverride {
  /** textHash of the `text_de` this speech was written for */
  forText: string;
  speech: string;
}
export type SpeechOverrides = Record<string, SpeechOverride>;

export interface Speech {
  /** text to send to TTS, null = nothing to speak */
  text: string | null;
  source: 'override' | 'auto';
  /** an override exists but was written for another text version (ignored, auto-prep used) */
  staleOverride: boolean;
}

/** The text to speak for a line: a current override wins; a stale override is never spoken. */
export function speechFor(line: Pick<VoiceLine, 'id' | 'text'>, overrides: SpeechOverrides = {}): Speech {
  const o = overrides[line.id];
  if (o && o.forText === textHash(line.text)) {
    const t = normalizeForHash(o.speech);
    return { text: t || null, source: 'override', staleOverride: false };
  }
  return { text: prepareTtsText(line.text), source: 'auto', staleOverride: !!o };
}

// ---------------------------------------------------------------------------------------------
// Plan + budget

export interface PlanRow {
  line: VoiceLine;
  tier: string;
  voice: ResolvedVoice;
  hash: string;
  tts: string;
  speechHash: string;
  speechSource: 'override' | 'auto';
  chars: number;
  credits: number;
  status: LineStatus;
  /** to generate in this run (within budget) */
  take: boolean;
  /** running total of credits for taken rows */
  cumulative: number;
}
export interface Skipped {
  line: VoiceLine;
  reason: 'no-voice' | 'nothing-to-speak';
}
export interface Plan {
  rows: PlanRow[];
  skipped: Skipped[];
  cap: number;
  spend: number;
  chars: number;
  /** first row that did not fit, if the budget stopped the run */
  stoppedAt: PlanRow | null;
  /** lines whose speech override no longer matches their text (auto-prep used instead) */
  staleOverrides: VoiceLine[];
}

/** Spend cap: min(budget, account remaining) − reserve, never below 0. */
export function spendCap(o: { budget: number; reserve: number; remaining?: number | null }): number {
  const top = o.remaining == null ? o.budget : Math.min(o.budget, o.remaining);
  return Math.max(0, top - o.reserve);
}

/**
 * Walk the selection in order; up-to-date lines cost nothing; stop at the first line that would
 * exceed the cap (no skipping ahead to smaller lines, so priority order holds).
 */
export function buildPlan(
  selected: Selected[],
  o: {
    voices: VoicesConfig;
    runModel?: string;
    manifest: Manifest;
    cap: number;
    fileExists?: (f: string) => boolean;
    force?: boolean;
    speech?: SpeechOverrides;
  },
): Plan {
  const rows: PlanRow[] = [];
  const skipped: Skipped[] = [];
  let spend = 0;
  let chars = 0;
  let stoppedAt: PlanRow | null = null;
  const staleOverrides: VoiceLine[] = [];
  for (const { line, tier } of selected) {
    const voice = resolveVoice(line.speaker, o.voices, o.runModel);
    if (!voice) {
      skipped.push({ line, reason: 'no-voice' });
      continue;
    }
    const sp = speechFor(line, o.speech);
    if (sp.staleOverride) staleOverrides.push(line);
    const tts = sp.text;
    if (tts === null) {
      skipped.push({ line, reason: 'nothing-to-speak' });
      continue;
    }
    const hash = textHash(line.text);
    const speechHash = textHash(tts);
    const status = o.force ? 'stale-text' : lineStatus(o.manifest.lines[line.id], hash, voice, o.fileExists, speechHash);
    const n = [...tts].length;
    const credits = creditsFor(n, voice.model);
    const row: PlanRow = { line, tier, voice, hash, tts, speechHash, speechSource: sp.source, chars: n, credits, status, take: false, cumulative: spend };
    if (status !== 'up-to-date' && !stoppedAt) {
      if (spend + credits <= o.cap) {
        spend += credits;
        chars += n;
        row.take = true;
        row.cumulative = spend;
      } else stoppedAt = row;
    }
    rows.push(row);
  }
  return { rows, skipped, cap: o.cap, spend, chars, stoppedAt, staleOverrides };
}

/** Redact a secret from any string before it is printed. */
export function redact(s: string, secret: string | undefined): string {
  return secret ? s.split(secret).join('[REDACTED]') : s;
}
