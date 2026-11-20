/**
 * TTS providers behind one interface: `synthesize({text, voice, model, lang}) → {audio, billedCredits?}`.
 * Secrets (ELEVENLABS_API_KEY, HF_TOKEN) are passed in by the caller, sent only as auth headers,
 * and redacted from every error message. The local `moss` provider works in batches instead
 * (`batches()`: ≤ 6 lines per model load, inside the heavy lock; see moss.ts).
 */
import { tts } from './api.ts';
import { redact, type ProviderConfig, type ProviderName, type ResolvedVoice } from './lib.ts';
import { mossBatches, type BatchResult, type MossConfig, type MossDeps, type MossItem } from './moss.ts';

export interface SynthRequest {
  text: string;
  voice: ResolvedVoice;
  model: string;
  lang: string;
}
export interface SynthResult {
  /** encoded audio as returned by the provider (any format ffmpeg reads) */
  audio: Uint8Array;
  billedCredits?: number | null;
}
export interface Provider {
  readonly name: ProviderName;
  synthesize(r: SynthRequest): Promise<SynthResult>;
}

/** A provider that renders many lines per process (one model load) into WAV files. */
export interface BatchProvider {
  readonly name: ProviderName;
  batches(reqs: (SynthRequest & { id: string })[]): AsyncGenerator<BatchResult>;
}

// ---------------------------------------------------------------------------------------------
// Local MOSS-TTS-v1.5 (mlx-audio): 0 credits, machine-wide heavy lock, quiet window

export function mossProvider(o: { cfg: MossConfig; repo: string; workDir: string; log?: (s: string) => void }, deps: MossDeps = {}): BatchProvider {
  return {
    name: 'moss',
    batches(reqs) {
      const items: MossItem[] = reqs.map((r) => {
        if (r.voice.provider !== 'moss' || !r.voice.moss) throw new Error(`moss: ${r.id} is not a moss voice`);
        return { id: r.id, text: r.text, moss: r.voice.moss };
      });
      return mossBatches(items, o, deps);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// ElevenLabs

export function elevenLabsProvider(key: string, cfg: ProviderConfig = {}, log?: (s: string) => void): Provider {
  return {
    name: 'elevenlabs',
    async synthesize(r) {
      const res = await tts(key, { voiceId: r.voice.voiceId, model: r.model, text: r.text, voiceSettings: r.voice.voiceSettings, outputFormat: cfg.outputFormat }, log);
      return { audio: res.audio, billedCredits: res.billed };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Hugging Face Gradio Space (e.g. Qwen3-TTS voice design). Not run yet: the owner has not chosen.

/** The part of `@gradio/client` this provider uses. */
export interface GradioApp {
  predict(endpoint: string, data: Record<string, unknown>): Promise<{ data: unknown }>;
}
export type GradioConnect = (space: string, opts: { hf_token?: string }) => Promise<GradioApp>;

/** Loads `@gradio/client` only when an hf-space line is really generated (not a dependency yet:
 * `pnpm add -D @gradio/client` once the owner picks this route). */
export const defaultGradioConnect: GradioConnect = async (space, opts) => {
  const spec = '@gradio/client';
  let mod: { Client: { connect(space: string, o: { hf_token?: string }): Promise<GradioApp> } };
  try {
    mod = (await import(spec)) as typeof mod;
  } catch {
    throw new Error('hf-space provider needs @gradio/client: pnpm add -D @gradio/client');
  }
  return mod.Client.connect(space, opts);
};

/** Fill `$text`, `$voicePrompt`, `$voiceId`, `$model`, `$lang` in the configured params. */
export function fillParams(params: Record<string, unknown>, r: SynthRequest): Record<string, unknown> {
  const vars: Record<string, string> = {
    $text: r.text,
    $voicePrompt: r.voice.voicePrompt ?? '',
    $voiceId: r.voice.voiceId,
    $model: r.model,
    $lang: r.lang,
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === 'string' && v in vars ? vars[v] : v;
  return out;
}

/** The first audio file in a Gradio result: a FileData `{url}` / `{path}` or a URL string. */
export function audioUrl(data: unknown): string | null {
  const items = Array.isArray(data) ? data : [data];
  for (const it of items) {
    if (typeof it === 'string' && /^https?:\/\//.test(it)) return it;
    if (it && typeof it === 'object') {
      const o = it as { url?: unknown; path?: unknown; value?: unknown };
      if (typeof o.url === 'string') return o.url;
      if (o.value) {
        const inner = audioUrl(o.value);
        if (inner) return inner;
      }
    }
  }
  return null;
}

/** The HF token goes only to Hugging Face hosts. */
export function isHfHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'huggingface.co' || h.endsWith('.huggingface.co') || h.endsWith('.hf.space');
  } catch {
    return false;
  }
}

export function hfSpaceProvider(
  token: string,
  cfg: ProviderConfig,
  deps: { connect?: GradioConnect; fetch?: typeof fetch } = {},
): Provider {
  if (!cfg.space || !cfg.apiName || !cfg.params) throw new Error('hf-space: voices.json providers["hf-space"] needs space, apiName and params');
  if (/^PLACEHOLDER/i.test(cfg.apiName)) throw new Error('hf-space: apiName is still a placeholder; look it up in the Space\'s "Use via API" page');
  const connect = deps.connect ?? defaultGradioConnect;
  const get = deps.fetch ?? fetch;
  let app: Promise<GradioApp> | null = null;
  return {
    name: 'hf-space',
    async synthesize(r) {
      try {
        app ??= connect(cfg.space!, token ? { hf_token: token } : {});
        const res = await (await app).predict(cfg.apiName!, fillParams(cfg.params!, r));
        const url = audioUrl(res.data);
        if (!url) throw new Error('no audio file in the Space result');
        const resp = await get(url, { headers: token && isHfHost(url) ? { authorization: `Bearer ${token}` } : {} });
        if (!resp.ok) throw new Error(`audio download ${resp.status}`);
        return { audio: new Uint8Array(await resp.arrayBuffer()), billedCredits: 0 };
      } catch (e) {
        app = null;
        throw new Error(redact(`hf-space ${cfg.space}: ${(e as Error).message}`, token));
      }
    },
  };
}
