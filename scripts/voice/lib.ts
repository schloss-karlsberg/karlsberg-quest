/**
 * Voice pipeline: pure helpers (no network, no ffmpeg). Imported by `generate.mjs` (Node 24 runs
 * this file with built-in type stripping, so only erasable TypeScript here) and by
 * `tests/voice-pipeline.test.ts`.
 *
 * Contract with in-game playback (do not change): manifest `public/voice/manifest.json`
 *   { version: 1, lines: { <lineId>: { files: { opus, aac }, textHash, speechHash, speaker, provider, voiceId,
 *     model, licence, date, chars, credits, durationMs, attribution?, engine? } } }
 * (`engine` moss only: { model, tokenizer, warmup }; the runtime ignores it)
 * files = `<lineId>.<sha256(bytes)[0..8]>.webm|.m4a` (the runtime reads names only from the manifest);
 * textHash = FNV-1a 32 over UTF-8 of the normalised display text_de (the runtime matches on it).
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

/** Credits per character by model. Measured in casting (2026-11-20) from the `character-cost`
 * response header: flash v2.5 = 0.50 and multilingual v2 = 1.00, exactly. Turbo v2.5 is
 * functionally Flash; v3 bills like Multilingual (docs). */
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

export type ProviderName = 'elevenlabs' | 'hf-space' | 'moss';
export const PROVIDERS: readonly ProviderName[] = ['elevenlabs', 'hf-space', 'moss'];

/** Credits for one line. ElevenLabs bills per character by model; an HF Space costs 0 credits
 * (it spends ZeroGPU minutes instead, guarded by --max-lines); local MOSS costs 0 (machine time,
 * guarded by --max-lines and the heavy lock). */
export function creditsFor(chars: number, model: string, provider: ProviderName = 'elevenlabs'): number {
  if (provider === 'hf-space' || provider === 'moss') return 0;
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
// Voices (scripts/voice/voices.json)

export type Licence = 'elevenlabs-free-noncommercial' | 'elevenlabs-paid' | 'apache-2.0-model';
export const LICENCES: readonly Licence[] = ['elevenlabs-free-noncommercial', 'elevenlabs-paid', 'apache-2.0-model'];

export interface ProviderConfig {
  defaultModel?: string;
  /** licence of what this provider generates (manifest `licence`) */
  licence?: Licence;
  /** elevenlabs */
  outputFormat?: string;
  /** hf-space: Space id (`owner/name`), endpoint, and the request params (`$text`, `$voicePrompt`,
   * `$voiceId`, `$model`, `$lang` are filled in; other values are passed as they are) */
  space?: string;
  apiName?: string;
  params?: Record<string, unknown>;
}

/** Post-processing per speaker (any provider). */
export interface PostprocessConfig {
  /** shorten internal silences longer than this to about this length (seconds); lead/tail trim is separate */
  maxPauseSec?: number;
}

export interface SpeakerVoice {
  provider?: ProviderName;
  /** moss: reference WAV file name relative to KQ_MOSS_VOICES (a synthetic casting pick, never an ElevenLabs clip) */
  reference?: string;
  /** moss: fixed seed (mx.random / numpy / random) */
  seed?: number;
  /** moss: MOSS `language` (e.g. "German") */
  language?: string;
  /** moss: MOSS `instruction` (voice description) */
  instruction?: string;
  /** moss: extra mlx-audio generate() params (e.g. max_tokens) */
  params?: Record<string, unknown>;
  postprocess?: PostprocessConfig;
  voiceId?: string | null;
  /** hf-space voice design: a German description of the voice */
  voicePrompt?: string | null;
  model?: string | null;
  licence?: Licence;
  /** ElevenLabs voice_settings for this speaker (stability, similarity_boost, style, speed, …), sent with each request */
  voiceSettings?: Record<string, number | boolean>;
  /** voice name and casting status, for humans (not used by the script) */
  name?: string;
  note?: string;
}
export interface VoicesConfig {
  providers?: Partial<Record<ProviderName, ProviderConfig>>;
  speakers: Record<string, SpeakerVoice>;
}

export const isPlaceholderVoice = (id: string | null | undefined): boolean => !id || /^(PLACEHOLDER|TODO)/i.test(id);

export interface ResolvedVoice {
  provider: ProviderName;
  /** what the manifest records as `voiceId`: the provider's voice id, or `prompt:<hash>` for a designed voice */
  voiceId: string;
  voicePrompt?: string;
  model: string;
  licence: Licence;
  placeholder: boolean;
  voiceSettings?: Record<string, number | boolean>;
  /** moss only: what rendered the audio (manifest `engine`; a different one regenerates) */
  engine?: MossEngine;
  /** moss only */
  moss?: MossVoice;
  postprocess?: PostprocessConfig;
}

/** What the moss runner needs per speaker. */
export interface MossVoice {
  speaker: string;
  /** file name relative to KQ_MOSS_VOICES */
  reference: string;
  /** first 8 hex of sha256 of the reference file, null when the file is missing */
  refSha8: string | null;
  seed: number;
  language: string;
  instruction?: string;
  params: Record<string, unknown>;
}

/** Model id recorded for moss clips (MOSS-TTS-v1.5 at the pinned snapshot revision). */
export const MOSS_MODEL = 'MOSS-TTS-v1.5@cdd3b91';
/** What rendered a moss clip: model and tokenizer at their pinned snapshot revisions (runner.py REV /
 * TOK_REV) plus the warm-up version (runner.py WARMUP, docs/ARCHITECTURE.md "warmup v1"). */
export interface MossEngine {
  model: string;
  tokenizer: string;
  warmup: string;
}
/** Manifest `engine` of moss clips. A moss entry whose `engine` is missing or differs is regenerated
 * (`stale-engine`); bump it together with runner.py (a new warm-up = "v2", kept in step with moss-service). */
export const MOSS_ENGINE: MossEngine = Object.freeze({
  model: 'MOSS-TTS-v1.5@cdd3b911b1585e3f2dbc7775ef10f9926f58850a',
  tokenizer: 'MOSS-Audio-Tokenizer@3cd226ba2947efa357ef453bcad111b6eafba782',
  warmup: 'v1',
});
export const sameEngine = (a: Partial<MossEngine> | null | undefined, b: MossEngine): boolean =>
  !!a && typeof a === 'object' && a.model === b.model && a.tokenizer === b.tokenizer && a.warmup === b.warmup;
/** Attribution for moss clips (manifest `attribution`, credits screen). */
export const MOSS_ATTRIBUTION = 'MOSS-TTS-v1.5, OpenMOSS, Apache-2.0';

/** `moss:<speaker>:<sha8 of reference>:<seed>`: a new reference file or seed regenerates the speaker's lines. */
export function mossVoiceId(speaker: string, refSha8: string | null, seed: number): string {
  return `moss:${speaker}:${refSha8 ?? 'MISSING'}:${seed}`;
}

const DEFAULT_MODEL: Record<ProviderName, string> = { elevenlabs: 'eleven_flash_v2_5', 'hf-space': 'qwen3-tts', moss: MOSS_MODEL };
const DEFAULT_LICENCE: Record<ProviderName, Licence> = { elevenlabs: 'elevenlabs-free-noncommercial', 'hf-space': 'apache-2.0-model', moss: 'apache-2.0-model' };

export interface ResolveOptions {
  /** moss: sha8 of a reference file name (relative to KQ_MOSS_VOICES), null when missing. Without it the
   * reference counts as missing (placeholder: planned in a dry run, skipped in a real run). */
  refSha8?: (reference: string) => string | null;
}

/**
 * Speaker → voice. Model: the speaker's own, else `runModel` (`--model`, ElevenLabs speakers only),
 * else the provider's default. Licence: the speaker's, else the provider's.
 */
export function resolveVoice(speaker: string, voices: VoicesConfig, runModel?: string, ro: ResolveOptions = {}): ResolvedVoice | null {
  const v = voices.speakers[speaker];
  if (!v) return null;
  const provider = v.provider ?? 'elevenlabs';
  if (!PROVIDERS.includes(provider)) throw new Error(`speaker ${speaker}: unknown provider "${provider}"`);
  const pc = voices.providers?.[provider] ?? {};
  let voiceId: string;
  let placeholder: boolean;
  let moss: MossVoice | undefined;
  if (provider === 'moss') {
    if (!v.reference || typeof v.seed !== 'number' || !Number.isInteger(v.seed)) return null;
    if (/[\\/]|^\.\.?$/.test(v.reference)) throw new Error(`speaker ${speaker}: moss reference must be a plain file name inside KQ_MOSS_VOICES`);
    const refSha8 = ro.refSha8?.(v.reference) ?? null;
    moss = { speaker, reference: v.reference, refSha8, seed: v.seed, language: v.language ?? 'German', instruction: v.instruction, params: v.params ?? {} };
    voiceId = mossVoiceId(speaker, refSha8, v.seed);
    placeholder = refSha8 === null;
  } else if (provider === 'hf-space') {
    const prompt = v.voicePrompt ?? '';
    if (!prompt && !v.voiceId) return null;
    voiceId = v.voiceId || `prompt:${textHash(prompt)}`;
    placeholder = v.voiceId ? isPlaceholderVoice(v.voiceId) : isPlaceholderVoice(prompt);
  } else {
    if (!v.voiceId) return null;
    voiceId = v.voiceId;
    placeholder = isPlaceholderVoice(v.voiceId);
  }
  const model = v.model || (provider === 'elevenlabs' ? runModel : undefined) || pc.defaultModel || DEFAULT_MODEL[provider];
  const licence = v.licence ?? pc.licence ?? DEFAULT_LICENCE[provider];
  if (!LICENCES.includes(licence)) throw new Error(`speaker ${speaker}: unknown licence "${licence}"`);
  const r: ResolvedVoice = { provider, voiceId, voicePrompt: v.voicePrompt ?? undefined, model, licence, placeholder, voiceSettings: v.voiceSettings };
  if (moss) {
    r.moss = moss;
    r.engine = { ...MOSS_ENGINE };
  }
  if (v.postprocess) r.postprocess = v.postprocess;
  return r;
}

// ---------------------------------------------------------------------------------------------
// Manifest

export interface ManifestEntry {
  /** Opus 24 kbps mono in WebM, and the AAC fallback (Safari); named `<lineId>.<sha256(bytes)[0..8]>.<ext>` */
  files: { opus: string; aac: string };
  /** FNV-1a of the displayed text_de (the runtime matches on it) */
  textHash: string;
  /** FNV-1a of the text actually spoken (speech override or auto-prep) */
  speechHash: string;
  speaker: string;
  provider: ProviderName;
  voiceId: string;
  model: string;
  licence: Licence;
  date: string;
  chars: number;
  credits: number;
  durationMs: number;
  /** model credit line where the licence asks for one (moss: MOSS_ATTRIBUTION); ignored by the runtime */
  attribution?: string;
  /** moss only: model + tokenizer revisions and warm-up version that rendered the clip; ignored by the runtime */
  engine?: MossEngine;
}
export interface Manifest {
  version: 1;
  lines: Record<string, ManifestEntry>;
}

export const emptyManifest = (): Manifest => ({ version: 1, lines: {} });

/** `<lineId>.<first 8 hex of sha256(bytes)>.<ext>`: every new encoding gets a new URL. */
export function contentFile(lineId: string, sha256hex: string, ext: 'webm' | 'm4a'): string {
  return `${lineId}.${sha256hex.slice(0, 8)}.${ext}`;
}

/** All clip files an entry points at (also an old-shape `file`). */
export function entryFiles(e: Partial<ManifestEntry> & { file?: string }): string[] {
  return [e.files?.opus, e.files?.aac, e.file].filter((f): f is string => typeof f === 'string');
}

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

export type LineStatus = 'new' | 'up-to-date' | 'stale-text' | 'stale-voice' | 'stale-model' | 'stale-engine' | 'stale-speech' | 'missing-file';

/**
 * Does this line need (re)generating? Provider or voice id changed → stale-voice; a voice with an
 * `engine` (moss) whose manifest entry has no or another `engine` → stale-engine; `speechHash`
 * catches a changed speech override / text prep under an unchanged text; both clip files must exist.
 */
export function lineStatus(
  entry: ManifestEntry | undefined,
  hash: string,
  voice: { voiceId: string; model: string; provider?: ProviderName; engine?: MossEngine },
  fileExists: (f: string) => boolean = () => true,
  speechHash?: string,
): LineStatus {
  if (!entry) return 'new';
  if (entry.textHash !== hash) return 'stale-text';
  if (entry.voiceId !== voice.voiceId || (voice.provider && (entry.provider ?? 'elevenlabs') !== voice.provider)) return 'stale-voice';
  if (entry.model !== voice.model) return 'stale-model';
  if (voice.engine && !sameEngine(entry.engine, voice.engine)) return 'stale-engine';
  if (speechHash !== undefined && entry.speechHash !== speechHash) return 'stale-speech';
  if (!entry.files?.opus || !entry.files?.aac || !fileExists(entry.files.opus) || !fileExists(entry.files.aac)) return 'missing-file';
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
  /** to generate in this run (within budget and line limits) */
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
  /** first credit-billed row that did not fit the cap */
  stoppedAt: PlanRow | null;
  /** providers whose --max-lines guard was reached */
  limited: ProviderName[];
  /** lines whose speech override no longer matches their text (auto-prep used instead) */
  staleOverrides: VoiceLine[];
}

/** Spend cap: min(budget, account remaining) − reserve, never below 0. */
export function spendCap(o: { budget: number; reserve: number; remaining?: number | null }): number {
  const top = o.remaining == null ? o.budget : Math.min(o.budget, o.remaining);
  return Math.max(0, top - o.reserve);
}

/**
 * Walk the selection in order. Up-to-date lines cost nothing. The credit cap (ElevenLabs) stops
 * credit-billed lines at the first one that would exceed it (no skipping ahead, so priority order
 * holds); 0-credit providers (hf-space) go on, each limited by `maxLines[provider]`, and `limit`
 * caps new clips overall.
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
    maxLines?: Partial<Record<ProviderName, number>>;
    limit?: number;
    resolve?: ResolveOptions;
  },
): Plan {
  const rows: PlanRow[] = [];
  const skipped: Skipped[] = [];
  let spend = 0;
  let chars = 0;
  let taken = 0;
  let stoppedAt: PlanRow | null = null;
  const perProvider: Partial<Record<ProviderName, number>> = {};
  const limited = new Set<ProviderName>();
  const staleOverrides: VoiceLine[] = [];
  for (const { line, tier } of selected) {
    const voice = resolveVoice(line.speaker, o.voices, o.runModel, o.resolve);
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
    const credits = creditsFor(n, voice.model, voice.provider);
    const row: PlanRow = { line, tier, voice, hash, tts, speechHash, speechSource: sp.source, chars: n, credits, status, take: false, cumulative: spend };
    rows.push(row);
    if (status === 'up-to-date') continue;
    if (taken >= (o.limit ?? Infinity)) continue;
    const used = perProvider[voice.provider] ?? 0;
    if (used >= (o.maxLines?.[voice.provider] ?? Infinity)) {
      limited.add(voice.provider);
      continue;
    }
    if (credits > 0) {
      if (stoppedAt) continue;
      if (spend + credits > o.cap) {
        stoppedAt = row;
        continue;
      }
    }
    spend += credits;
    chars += n;
    taken++;
    perProvider[voice.provider] = used + 1;
    row.take = true;
    row.cumulative = spend;
  }
  return { rows, skipped, cap: o.cap, spend, chars, stoppedAt, limited: [...limited], staleOverrides };
}

// ---------------------------------------------------------------------------------------------
// Size estimate (dry run)

/** Spoken German at the game's pace, characters per second (for the size estimate before audio exists). */
export const CHARS_PER_SECOND = 14;
/** Opus 24 kbps + AAC 48 kbps, plus ~4 % container overhead, in bytes per second of speech. */
export const BYTES_PER_SECOND = ((24_000 + 48_000) / 8) * 1.04;
export const DIST_WARN_MB = 50;

/** Estimated size in MB of both encodings: by duration if known, else by characters. */
export function estimateMB(items: { chars: number; durationMs?: number }[]): number {
  let s = 0;
  for (const i of items) s += i.durationMs ? i.durationMs / 1000 : i.chars / CHARS_PER_SECOND;
  return (s * BYTES_PER_SECOND) / 1e6;
}

/** Redact secrets from any string before it is printed. */
export function redact(s: string, ...secrets: (string | undefined)[]): string {
  for (const secret of secrets) if (secret) s = s.split(secret).join('[REDACTED]');
  return s;
}
