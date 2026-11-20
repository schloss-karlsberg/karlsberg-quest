/**
 * ElevenLabs HTTP calls. The key travels only in the `xi-api-key` header; it is never part of a
 * URL, a log line or an error message (every message passes through `redact`).
 */
import { redact, supportsLanguageCode } from './lib.ts';

const BASE = 'https://api.elevenlabs.io';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(key: string, path: string, init: RequestInit, o: { retries?: number; log?: (s: string) => void } = {}): Promise<Response> {
  const retries = o.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(BASE + path, { ...init, headers: { ...(init.headers as Record<string, string>), 'xi-api-key': key } });
    } catch (e) {
      if (attempt >= retries) throw new ApiError(0, redact(`network error on ${path}: ${(e as Error).message}`, key));
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt);
      o.log?.(`  ${res.status} on ${path.split('?')[0]}, retry ${attempt + 1}/${retries} in ${Math.round(wait / 100) / 10} s`);
      await res.body?.cancel();
      await sleep(wait);
      continue;
    }
    const body = (await res.text().catch(() => '')).slice(0, 400);
    throw new ApiError(res.status, redact(`ElevenLabs ${res.status} on ${path.split('?')[0]}: ${body}`, key));
  }
}

const backoff = (attempt: number) => Math.min(60_000, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);

export interface Subscription {
  tier: string;
  characterCount: number;
  characterLimit: number;
  remaining: number;
  nextReset: string | null;
}

/** GET /v1/user/subscription (free): remaining = character_limit − character_count. */
export async function getSubscription(key: string): Promise<Subscription> {
  const res = await call(key, '/v1/user/subscription', { method: 'GET' }, { retries: 2 });
  const j = (await res.json()) as { tier?: string; character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
  const used = j.character_count ?? 0;
  const limit = j.character_limit ?? 0;
  return {
    tier: j.tier ?? '?',
    characterCount: used,
    characterLimit: limit,
    remaining: Math.max(0, limit - used),
    nextReset: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

export interface TtsRequest {
  voiceId: string;
  model: string;
  text: string;
  voiceSettings?: Record<string, number | boolean>;
  outputFormat?: string;
}

/** POST /v1/text-to-speech/{voice_id}; returns the MP3 bytes and the billed characters if reported. */
export async function tts(key: string, r: TtsRequest, log?: (s: string) => void): Promise<{ audio: Buffer; billed: number | null }> {
  const body: Record<string, unknown> = { text: r.text, model_id: r.model };
  if (supportsLanguageCode(r.model)) body.language_code = 'de';
  if (r.voiceSettings) body.voice_settings = r.voiceSettings;
  const path = `/v1/text-to-speech/${encodeURIComponent(r.voiceId)}?output_format=${r.outputFormat ?? 'mp3_44100_64'}`;
  const res = await call(key, path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body) }, { log });
  const billed = Number(res.headers.get('character-cost') ?? res.headers.get('x-character-count'));
  return { audio: Buffer.from(await res.arrayBuffer()), billed: Number.isFinite(billed) && billed > 0 ? billed : null };
}
