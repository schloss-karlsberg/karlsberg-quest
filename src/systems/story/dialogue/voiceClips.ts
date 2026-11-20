/**
 * Recorded voice clips at runtime: loads voice/manifest.json once, preloads (fetch + decode) the
 * clips of upcoming lines with bounded concurrency and keeps the decoded buffers in a small LRU.
 * Never blocks: a clip that is not decoded when its line starts is simply not there (the line
 * murmurs). No manifest (404, network error, invalid file) means murmur everywhere, with one
 * debug line at most.
 *
 * Formats: Opus/WebM when `canPlayType` says "probably", else AAC/M4A (macOS Safari's Opus is
 * partial). An Opus file that fails to decode is retried once as AAC, and Opus is then skipped for
 * the rest of the session; only when every file fails does the line murmur.
 */
import type { AudioManager } from '../../../audio/audio';
import { type LineTexts, type VoiceFormat, type VoiceManifest, type VoiceManifestEntry, Lru, clipCandidates, clipSeconds, clipUrl, entryKey, lookupClip, manifestUrl, opusPlayable, parseVoiceManifest } from './voiceManifest';

/** Decoded clips kept (≈ 1 MB per 5 s of mono speech). */
const CACHE_MAX = 16;
/** Parallel fetch + decode jobs. */
const CONCURRENCY = 3;
/** Waiting jobs beyond this drop the oldest requests (an old beat's lines). */
const QUEUE_MAX = 24;

export interface ReadyClip {
  id: string;
  entry: VoiceManifestEntry;
  buffer: AudioBuffer;
  /** The length the typing paces itself to (s). */
  seconds: number;
}

/** What the presenter needs: a ready clip for a line now, and preloading of upcoming ones. */
export interface ClipProvider {
  take(id: string | undefined, text: LineTexts, speaker?: string): ReadyClip | null;
  preload(lines: readonly PreloadLine[]): void;
}

/** A line to preload: by id, by text (raw template, displayed), or both. */
export interface PreloadLine {
  id?: string;
  text?: LineTexts;
  speaker?: string;
}

export interface VoiceClipStats {
  manifest: 'idle' | 'loading' | 'ok' | 'none';
  lines: number;
  cached: number;
  loading: number;
  queued: number;
  failed: number;
  stale: number;
  /** Opus playable here ("probably") and not failed to decode so far. */
  opus: boolean;
  /** Format of the last decoded clip. */
  lastFormat: VoiceFormat | null;
}

/** Opus support, probed once with an <audio> element (none outside a browser). */
function probeOpus(): boolean {
  if (typeof Audio === 'undefined') return false;
  try {
    const a = new Audio();
    return opusPlayable((t) => a.canPlayType(t));
  } catch {
    return false;
  }
}

export class VoiceClips implements ClipProvider {
  private state: VoiceClipStats['manifest'] = 'idle';
  private manifest: VoiceManifest | null = null;
  private readonly cache = new Lru<string, AudioBuffer>(CACHE_MAX);
  private readonly inflight = new Set<string>();
  private readonly failed = new Set<string>();
  private queue: VoiceManifestEntry[] = [];
  private pending: PreloadLine[] = [];
  private active = 0;
  private stale = 0;
  private logged = false;
  private opusBroken = false;
  private lastFormat: VoiceFormat | null = null;

  constructor(
    private readonly audio: AudioManager,
    private readonly base: string = import.meta.env.BASE_URL,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
    private readonly opus: boolean = probeOpus(),
  ) {}

  /** Load the manifest (once). */
  init(): void {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    void this.loadManifest();
  }

  private debug(msg: string): void {
    if (this.logged) return;
    this.logged = true;
    console.debug(`[voice] ${msg}`);
  }

  private async loadManifest(): Promise<void> {
    try {
      const res = await this.fetchFn(manifestUrl(this.base), { cache: 'no-cache' });
      const json: unknown = res.ok ? await res.json().catch(() => null) : null;
      this.manifest = parseVoiceManifest(json);
    } catch {
      this.manifest = null;
    }
    this.state = this.manifest ? 'ok' : 'none';
    if (!this.manifest) this.debug('no voice manifest: every line murmurs');
    const p = this.pending;
    this.pending = [];
    if (this.manifest) this.preload(p);
  }

  stats(): VoiceClipStats {
    return {
      manifest: this.state,
      lines: this.manifest ? Object.keys(this.manifest.lines).length : 0,
      cached: this.cache.size,
      loading: this.inflight.size,
      queued: this.queue.length,
      failed: this.failed.size,
      stale: this.stale,
      opus: this.opus && !this.opusBroken,
      lastFormat: this.lastFormat,
    };
  }

  /**
   * Fetch and decode the clips of these lines in the background. With a text, a stale recording
   * (hash mismatch) is skipped and an id-less line is found by its hash; without one, the id alone
   * decides.
   */
  preload(lines: readonly PreloadLine[]): void {
    if (this.state === 'idle') this.init();
    if (this.state === 'loading') {
      this.pending.push(...lines);
      return;
    }
    const m = this.manifest;
    if (!m) return;
    for (const l of lines) {
      const entry = l.text !== undefined ? clipEntry(lookupClip(m, l.id, l.text, l.speaker)) : l.id && Object.prototype.hasOwnProperty.call(m.lines, l.id) ? m.lines[l.id] : undefined;
      if (entry) this.want(entry, false);
    }
    this.pump();
  }

  /** The decoded clip for this line now, or null (none, stale, or not decoded yet: then it loads). */
  take(id: string | undefined, text: LineTexts, speaker?: string): ReadyClip | null {
    if (!this.manifest) return null;
    const r = lookupClip(this.manifest, id, text, speaker);
    if (r.kind === 'stale') this.stale++;
    if (r.kind !== 'clip') return null;
    const buffer = this.cache.get(entryKey(r.entry));
    if (!buffer) {
      // too late for this line; a repeat of it will have it
      this.want(r.entry, true);
      this.pump();
      return null;
    }
    return { id: r.id, entry: r.entry, buffer, seconds: clipSeconds(r.entry, buffer.duration) };
  }

  private want(entry: VoiceManifestEntry, urgent: boolean): void {
    const f = entryKey(entry);
    if (this.cache.has(f) || this.inflight.has(f) || this.failed.has(f)) return;
    if (this.queue.some((q) => entryKey(q) === f)) return;
    if (urgent) this.queue.unshift(entry);
    else this.queue.push(entry);
    if (this.queue.length > QUEUE_MAX) this.queue.splice(0, this.queue.length - QUEUE_MAX);
  }

  private pump(): void {
    while (this.active < CONCURRENCY && this.queue.length) {
      const entry = this.queue.shift()!;
      this.active++;
      const key = entryKey(entry);
      this.inflight.add(key);
      void this.load(entry).finally(() => {
        this.active--;
        this.inflight.delete(key);
        this.pump();
      });
    }
  }

  /** Fetch + decode the entry's best file; Opus that fails to decode falls back to AAC once. */
  private async load(entry: VoiceManifestEntry): Promise<void> {
    const key = entryKey(entry);
    let lastErr: unknown = new Error('no playable file');
    for (const c of clipCandidates(entry, { playable: this.opus, broken: this.opusBroken })) {
      let data: ArrayBuffer;
      try {
        const res = await this.fetchFn(clipUrl(this.base, c.file));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.arrayBuffer();
      } catch (err) {
        lastErr = err;
        continue;
      }
      try {
        const ctx = await new Promise<AudioContext>((resolve) => this.audio.onUnlock(resolve));
        const buffer = await ctx.decodeAudioData(data);
        this.cache.set(key, buffer);
        this.lastFormat = c.format;
        return;
      } catch (err) {
        lastErr = err;
        // this browser cannot decode our Opus after all: AAC from now on
        if (c.format === 'opus') this.opusBroken = true;
      }
    }
    this.failed.add(key);
    this.debug(`clip ${key} unavailable (${lastErr instanceof Error ? lastErr.message : String(lastErr)}); murmur instead`);
  }
}

function clipEntry(r: ReturnType<typeof lookupClip>): VoiceManifestEntry | undefined {
  return r.kind === 'clip' ? r.entry : undefined;
}
