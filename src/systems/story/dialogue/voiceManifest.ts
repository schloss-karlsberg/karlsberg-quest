/**
 * Recorded voice clips: the manifest contract shared with the offline casting pipeline
 * (scripts/voice/, owned by the pipeline). Pure: types, parse/validate, the text hash, stale
 * detection and "which clip for this line". No DOM, no Web Audio (unit-tested in
 * tests/voice-manifest.test.ts).
 *
 * At runtime the game fetches `voice/manifest.json` relative to the Vite base; a clip's URL is
 * `voice/<file>` (Opus/WebM or AAC/M4A, see `clipCandidates`). A clip plays only while the hash of the line text still matches the
 * entry's `textHash` (otherwise the recording is stale and the line murmurs). The hash is taken
 * over the RAW text before placeholder substitution ({Name}, {jahre:…}); the displayed text is
 * tried as well.
 *
 * Ids: a line's own id (content dialogue, story `say`). Lines without one (quest lines, whose
 * manifest ids are synthetic `quest.<questId>.<field>.<n>`) or with an id the manifest does not
 * know (story `say.variants` → `<id>.v<n>`, `text_by_era` → `<id>.era-<era>`) are found by their
 * text hash instead (`byHash`).
 */

/** A clip's encodings: Opus in WebM (preferred), AAC in M4A (Safari), or a legacy single file. */
export interface VoiceFiles {
  opus?: string;
  aac?: string;
  /** The older `"file"` shape (MP3). */
  legacy?: string;
}

export type VoiceFormat = keyof VoiceFiles;

/**
 * One recorded line, as far as the runtime needs it. The manifest carries more (voiceId, model,
 * date, chars, credits, provider, speechHash, licence …): unknown or extra fields are ignored.
 */
export interface VoiceManifestEntry {
  /** `{"opus": "<id>.<hash>.webm", "aac": "<id>.<hash>.m4a"}`, or the old `"file"` (MP3). */
  files: VoiceFiles;
  /** FNV-1a 32-bit of the normalised raw line text, 8 lowercase hex chars. */
  textHash: string;
  speaker?: string;
  /** Clip length (ms) as measured by the pipeline. */
  durationMs?: number;
}

export interface VoiceManifest {
  version: 1;
  lines: Record<string, VoiceManifestEntry>;
  /** textHash → the line ids (manifest order) with that hash: the id-less fallback. */
  byHash: Map<string, string[]>;
}

/** The text the hash is computed over: NFC, runs of whitespace → one space, trimmed. */
export function normalizeLineText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

const encoder = new TextEncoder();

/** FNV-1a 32-bit over the UTF-8 bytes of the normalised text, lowercase hex padded to 8. */
export function textHash(text: string): string {
  const bytes = encoder.encode(normalizeLineText(text));
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const HASH_RE = /^[0-9a-f]{8}$/;
/** A plain file name: no directories, no leading dot, no URL syntax. */
const FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*\.(webm|m4a|mp4|aac|mp3|ogg|opus|wav)$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fileName = (v: unknown): string | undefined => (typeof v === 'string' && FILE_RE.test(v) && !v.includes('..') ? v : undefined);

/** One entry, or null when it has no usable file or no valid hash. Bad optional fields are dropped. */
export function parseEntry(v: unknown): VoiceManifestEntry | null {
  if (!isObj(v)) return null;
  const hash = v.textHash;
  if (typeof hash !== 'string' || !HASH_RE.test(hash)) return null;
  const files: VoiceFiles = {};
  if (isObj(v.files)) {
    const opus = fileName(v.files.opus);
    const aac = fileName(v.files.aac);
    if (opus) files.opus = opus;
    if (aac) files.aac = aac;
  }
  const legacy = fileName(v.file);
  if (legacy) files.legacy = legacy;
  if (!files.opus && !files.aac && !files.legacy) return null;
  const e: VoiceManifestEntry = { files, textHash: hash };
  if (typeof v.speaker === 'string') e.speaker = v.speaker;
  if (typeof v.durationMs === 'number' && Number.isFinite(v.durationMs) && v.durationMs > 0) e.durationMs = v.durationMs;
  return e;
}

/** Cache key of an entry's clip (any of its files names it uniquely: id + hash). */
export function entryKey(e: VoiceManifestEntry): string {
  return e.files.opus ?? e.files.aac ?? e.files.legacy ?? '';
}

/**
 * The files to try, in order: Opus when the browser plays it ("probably") and it has not failed
 * to decode before, then AAC, then the legacy file.
 */
export function clipCandidates(e: VoiceManifestEntry, opus: { playable: boolean; broken: boolean }): { format: VoiceFormat; file: string }[] {
  const out: { format: VoiceFormat; file: string }[] = [];
  if (e.files.opus && opus.playable && !opus.broken) out.push({ format: 'opus', file: e.files.opus });
  if (e.files.aac) out.push({ format: 'aac', file: e.files.aac });
  if (e.files.legacy) out.push({ format: 'legacy', file: e.files.legacy });
  // an Opus-only entry in a browser without "probably": still worth one try
  if (!out.length && e.files.opus && !opus.broken) out.push({ format: 'opus', file: e.files.opus });
  return out;
}

/** Does this browser play Opus in WebM for sure? (`canPlayType` must say "probably".) */
export function opusPlayable(canPlayType: ((type: string) => string) | null): boolean {
  try {
    return canPlayType?.('audio/webm; codecs="opus"') === 'probably';
  } catch {
    return false;
  }
}

/**
 * Parse the manifest. Returns null for anything that is not a version-1 manifest (no voices at
 * all); malformed single entries are dropped and the rest are kept.
 */
export function parseVoiceManifest(json: unknown): VoiceManifest | null {
  if (!isObj(json) || json.version !== 1 || !isObj(json.lines)) return null;
  const lines: Record<string, VoiceManifestEntry> = Object.create(null) as Record<string, VoiceManifestEntry>;
  for (const [id, raw] of Object.entries(json.lines)) {
    if (!id) continue;
    const e = parseEntry(raw);
    if (e) lines[id] = e;
  }
  const byHash = new Map<string, string[]>();
  for (const [id, e] of Object.entries(lines)) {
    const list = byHash.get(e.textHash);
    if (list) list.push(id);
    else byHash.set(e.textHash, [id]);
  }
  return { version: 1, lines, byHash };
}

export type ClipLookup = { kind: 'clip'; id: string; entry: VoiceManifestEntry } | { kind: 'none' } | { kind: 'stale'; id: string; entry: VoiceManifestEntry };

/** Texts a line may have been hashed over: raw template first, then the displayed text. */
export type LineTexts = string | readonly string[];

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The clip for a line: by its id when the manifest knows it (a hash mismatch → stale), else by
 * the text hash (id-less quest lines, variant / era ids). `text` may list candidates (the raw
 * template and the displayed text); any match counts. A hash match must also fit the `speaker`
 * when both sides name one (a short „Ja.“ of Laub's is not Marlene's).
 */
export function lookupClip(manifest: VoiceManifest | null, lineId: string | undefined, text: LineTexts, speaker?: string): ClipLookup {
  if (!manifest) return { kind: 'none' };
  const hashes = [...new Set((typeof text === 'string' ? [text] : text).map(textHash))];
  if (lineId && own(manifest.lines, lineId)) {
    const entry = manifest.lines[lineId]!;
    return hashes.includes(entry.textHash) ? { kind: 'clip', id: lineId, entry } : { kind: 'stale', id: lineId, entry };
  }
  const who = speaker ? speakerTail(speaker) : null;
  for (const h of hashes) {
    for (const id of manifest.byHash.get(h) ?? []) {
      const entry = manifest.lines[id]!;
      if (!who || !entry.speaker || speakerTail(entry.speaker) === who) return { kind: 'clip', id, entry };
    }
  }
  return { kind: 'none' };
}

/** "sp.laub" / "Laub" → "laub". */
const speakerTail = (s: string) => s.toLowerCase().split('.').pop() ?? s.toLowerCase();

/** The entry to play for this line, or null (no recording, or a stale one). */
export function clipForLine(manifest: VoiceManifest | null, lineId: string | undefined, text: LineTexts, speaker?: string): VoiceManifestEntry | null {
  const r = lookupClip(manifest, lineId, text, speaker);
  return r.kind === 'clip' ? r.entry : null;
}

/** URL of the manifest under the Vite base (`./` on GitHub Pages). */
export function manifestUrl(base: string): string {
  return `${base.endsWith('/') ? base : base + '/'}voice/manifest.json`;
}

/** URL of a clip file under the Vite base. */
export function clipUrl(base: string, file: string): string {
  return `${base.endsWith('/') ? base : base + '/'}voice/${encodeURIComponent(file)}`;
}

/**
 * The length the typing paces itself to (s): the decoded buffer's when it is known and differs
 * from the manifest by more than 50 ms, else the manifest's.
 */
export function clipSeconds(entry: VoiceManifestEntry | null, decodedSeconds?: number): number {
  const m = entry?.durationMs !== undefined && entry.durationMs > 0 ? entry.durationMs / 1000 : undefined;
  if (decodedSeconds !== undefined && decodedSeconds > 0 && (m === undefined || Math.abs(decodedSeconds - m) > 0.05)) return decodedSeconds;
  return m ?? decodedSeconds ?? 0;
}

/**
 * Line ids of every `say` action inside a story beat (enter, exit, reactions, nested `then` …),
 * in order, without duplicates: the clips to preload when the beat starts.
 */
export function sayLineIds(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) sayLineIds(n, out, depth + 1);
    return out;
  }
  const o = node as Record<string, unknown>;
  if (o.do === 'say') {
    const id = typeof o.id === 'string' ? o.id : typeof o.line === 'string' ? o.line : null;
    const add = (x: string) => {
      if (!out.includes(x)) out.push(x);
    };
    if (id) {
      add(id);
      // the pipeline's ids for running jokes and per-era texts
      if (Array.isArray(o.variants)) o.variants.forEach((_, i) => add(`${id}.v${i + 1}`));
      if (o.text_by_era && typeof o.text_by_era === 'object') for (const era of Object.keys(o.text_by_era)) add(`${id}.era-${era}`);
    }
  }
  for (const v of Object.values(o)) if (v !== null && typeof v === 'object') sayLineIds(v, out, depth + 1);
  return out;
}

/** A tiny LRU map (decoded clips). `get` refreshes; `set` evicts the least recently used. */
export class Lru<K, V> {
  private readonly map = new Map<K, V>();
  constructor(readonly max: number) {}
  get size(): number {
    return this.map.size;
  }
  has(k: K): boolean {
    return this.map.has(k);
  }
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k: K, v: V): void {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }
}
