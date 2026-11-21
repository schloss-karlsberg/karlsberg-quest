/**
 * What may be committed under public/voice/ (owner, 2026-11-20): synthetic MOSS-TTS-v1.5 clips only
 * (Apache-2.0 model, our output CC0), each credited per voice in public/assets/LICENSES.json `voices`.
 * Never ElevenLabs output, never a real person's voice. Enforced by tests/voice-assets.test.ts and,
 * for the pipeline, by `nonCommittableGuard` in generate.mjs.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { VoiceCredit } from '../../src/assets/types.ts';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export type { VoiceCredit };

/** The only provider whose clips may sit in public/voice/. */
export const COMMITTABLE_PROVIDER = 'moss';
/** The only manifest licence allowed in public/voice/. */
export const COMMITTABLE_LICENCE = 'apache-2.0-model';
/** Voice files total: warn above, fail above (MB = 1e6 bytes). ~60 MB is roughly 1.8 h of speech at
 * Opus 24k + AAC 48k; past 80 MB the repo and the Pages deploy get too heavy for a browser game. */
export const VOICE_SIZE_WARN_MB = 60;
export const VOICE_SIZE_FAIL_MB = 80;

const AUDIO_EXT = /\.(webm|m4a|wav|mp3|ogg|opus|flac|aac|aiff?)$/i;
/** names that never belong in the repo (local test renders, private references) */
const FORBIDDEN_NAME = /private|TEST-synthetic/i;

export interface VoiceAssetReport {
  errors: string[];
  warnings: string[];
  totalBytes: number;
}

/** Skipped by the checker: pipeline scratch (`.tmp/`, `*.tmp`, `*.part`), gitignored, never committed. */
const scratch = (rel: string) => rel.startsWith('.tmp/') || /\.(tmp|part)$/.test(rel);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}

/** sha8 + seed from `moss:<speaker>:<sha8>:<seed>`, null if malformed. */
export function parseMossVoiceId(id: string): { speaker: string; sha8: string; seed: number } | null {
  const m = /^moss:([^:]+):([0-9a-f]{8}):(\d+)$/.exec(id);
  return m ? { speaker: m[1]!, sha8: m[2]!, seed: Number(m[3]) } : null;
}

/**
 * Check a voice folder (public/voice/ or a fixture). No folder, or a folder without manifest and
 * clips, passes.
 */
export function checkVoiceAssets(dir: string, credits: readonly VoiceCredit[]): VoiceAssetReport {
  const r: VoiceAssetReport = { errors: [], warnings: [], totalBytes: 0 };
  if (!existsSync(dir)) return r;
  const files = walk(dir)
    .map((abs) => relative(dir, abs).split(sep).join('/'))
    .filter((rel) => !scratch(rel));
  const credit = new Map(credits.map((c) => [c.speaker, c]));

  for (const rel of files) {
    if (FORBIDDEN_NAME.test(rel)) r.errors.push(`${rel}: file names with "private" / "TEST-synthetic" never go into public/voice`);
    if (/\.wav$/i.test(rel)) r.errors.push(`${rel}: no .wav in public/voice (raw renders and references stay local)`);
    if (rel !== 'manifest.json' && rel !== '.gitkeep' && !AUDIO_EXT.test(rel)) r.errors.push(`${rel}: unexpected file in public/voice (only manifest.json and clips)`);
  }

  const referenced = new Set<string>();
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) {
    let m: { version?: unknown; lines?: Record<string, Record<string, unknown>> } | null = null;
    try {
      m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      r.errors.push(`manifest.json: not valid JSON (${(e as Error).message})`);
    }
    if (m && (m.version !== 1 || !m.lines || typeof m.lines !== 'object')) r.errors.push('manifest.json: not a version-1 voice manifest');
    else if (m?.lines)
      for (const [id, e] of Object.entries(m.lines)) {
        const where = `manifest ${id}`;
        if (e.provider !== COMMITTABLE_PROVIDER) r.errors.push(`${where}: provider "${String(e.provider)}" is not committable (only ${COMMITTABLE_PROVIDER})`);
        if (typeof e.licence === 'string' && e.licence.startsWith('elevenlabs')) r.errors.push(`${where}: ElevenLabs output (${e.licence}) must never enter the repo`);
        else if (e.licence !== COMMITTABLE_LICENCE) r.errors.push(`${where}: licence "${String(e.licence)}" is not allowed (only ${COMMITTABLE_LICENCE})`);
        const c = typeof e.speaker === 'string' ? credit.get(e.speaker) : undefined;
        if (!c) r.errors.push(`${where}: speaker "${String(e.speaker)}" has no voice credit in LICENSES.json voices`);
        else {
          const v = typeof e.voiceId === 'string' ? parseMossVoiceId(e.voiceId) : null;
          if (!v) r.errors.push(`${where}: voiceId "${String(e.voiceId)}" is not moss:<speaker>:<sha8>:<seed>`);
          else {
            if (v.speaker !== c.speaker) r.errors.push(`${where}: voiceId speaker ${v.speaker} != ${c.speaker}`);
            if (v.seed !== c.seed) r.errors.push(`${where}: voiceId seed ${v.seed} != credited seed ${c.seed}`);
            if (v.sha8 !== c.referenceSha256.slice(0, 8)) r.errors.push(`${where}: voiceId reference ${v.sha8} != credited reference ${c.referenceSha256.slice(0, 8)}`);
          }
        }
        const fs = e.files as { opus?: unknown; aac?: unknown } | undefined;
        const list = [fs?.opus, fs?.aac, e.file].filter((f): f is string => typeof f === 'string');
        if (!list.length) r.errors.push(`${where}: no files`);
        for (const f of list) {
          if (f.includes('/') || f.includes('\\') || f.includes('..')) r.errors.push(`${where}: file "${f}" must be a plain name in public/voice`);
          referenced.add(f);
          if (!files.includes(f)) r.errors.push(`${where}: file ${f} is missing`);
        }
      }
  }

  for (const rel of files) {
    if (!AUDIO_EXT.test(rel)) continue;
    r.totalBytes += statSync(join(dir, rel)).size;
    if (!referenced.has(rel)) r.errors.push(`${rel}: audio file not referenced by manifest.json`);
  }
  const mb = r.totalBytes / 1e6;
  if (mb > VOICE_SIZE_FAIL_MB) r.errors.push(`voice files total ${mb.toFixed(1)} MB, over the ${VOICE_SIZE_FAIL_MB} MB limit`);
  else if (mb > VOICE_SIZE_WARN_MB) r.warnings.push(`voice files total ${mb.toFixed(1)} MB, over the ${VOICE_SIZE_WARN_MB} MB warning line (limit ${VOICE_SIZE_FAIL_MB} MB)`);
  return r;
}

/** realpath of `p`, or of its nearest existing ancestor joined with the rest. */
function realish(p: string): string {
  const abs = resolve(p);
  if (existsSync(abs)) return realpathSync(abs);
  const parent = dirname(abs);
  return parent === abs ? abs : join(realish(parent), relative(parent, abs));
}

/** True when `out` is the repo's public/voice/ or inside it. */
export function isCommittableVoiceDir(out: string, repo: string): boolean {
  const rel = relative(realish(join(repo, 'public/voice')), realish(out));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * generate.mjs guard: a run that would write non-moss clips (elevenlabs, hf-space) into the
 * committable public/voice/ is refused unless `--allow-noncommittable` is given. Returns the refusal
 * message, or null when the run may go ahead.
 */
export function nonCommittableGuard(o: { out: string; repo: string; providers: Iterable<string>; allow: boolean }): string | null {
  const bad = [...new Set(o.providers)].filter((p) => p !== COMMITTABLE_PROVIDER).sort();
  if (!bad.length || o.allow || !isCommittableVoiceDir(o.out, o.repo)) return null;
  return (
    `refusing to write ${bad.join(', ')} clips into ${relative(o.repo, resolve(o.out)) || o.out}: public/voice/ is committed and takes synthetic MOSS clips only. ` +
    'Use --out <dir outside public/voice> (e.g. a scratch dir), or pass --allow-noncommittable for a local listening test and never commit the result.'
  );
}
