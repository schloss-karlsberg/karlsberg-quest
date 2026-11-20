/**
 * ffmpeg post-processing: optional per-speaker pause cap (voices.json postprocess.maxPauseSec), trim silence to ~60 ms at each end,
 * static gain + gentle peak limiter, re-measured static make-up to I=-18 LUFS (EBU R128, ffmpeg ebur128), mono 24 kHz, then two encodings: Opus 24 kbps (voip) in WebM, and AAC ~48 kbps in
 * .m4a (macOS Safari's Opus support is partial); ffprobe for the real duration.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

export const FFMPEG = process.env.FFMPEG ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
export const FFPROBE = process.env.FFPROBE ?? (existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe');

export const TARGET_I = -18;
const KEEP = 0.06; // seconds of silence kept at each end
const THRESH = '-50dB';

/** silenceremove on both ends (the tail via areverse), keeping KEEP seconds. */
const TRIM =
  `silenceremove=start_periods=1:start_threshold=${THRESH}:start_silence=${KEEP},areverse,` +
  `silenceremove=start_periods=1:start_threshold=${THRESH}:start_silence=${KEEP},areverse`;

const quiet = ['-hide_banner', '-loglevel', 'error', '-y'];

export interface ClipOptions {
  /** shorten internal silences longer than this (seconds) to about this length; undefined/0 = off */
  maxPauseSec?: number;
}

/**
 * Pause cap: `silenceremove` with `stop_periods=-1` acts on every silence after the first sound
 * (the lead is left alone: start_periods=0). In ffmpeg ≥ 6.1 (rewritten filter; Homebrew ships 9)
 * a silence of at least `stop_duration` is cut down to `stop_duration + stop_silence`, shorter ones
 * pass untouched, so stop_duration = cap and stop_silence = 0 caps pauses at the cap (measured on a
 * 1.5 s gap: 0.45 → ~0.47 s kept, a 0.3 s gap unchanged). The tail it leaves is trimmed by TRIM.
 */
export function pauseCapFilter(maxPauseSec?: number): string | null {
  if (maxPauseSec === undefined || maxPauseSec === null) return null;
  if (!Number.isFinite(maxPauseSec) || maxPauseSec <= 0) return null;
  if (maxPauseSec < 0.1 || maxPauseSec > 5) throw new Error(`maxPauseSec ${maxPauseSec} out of range (0.1–5 s)`);
  const d = Number(maxPauseSec.toFixed(3));
  return `silenceremove=stop_periods=-1:stop_duration=${d}:stop_threshold=${THRESH}:stop_silence=0`;
}

/** The `-af` chain of the first pass: optional pause cap, then lead/tail trim. */
export function clipFilter(o: ClipOptions = {}): string {
  const cap = pauseCapFilter(o.maxPauseSec);
  return cap ? `${cap},${TRIM}` : TRIM;
}

/** ffmpeg args of the first pass (pause cap + trim, mono 48 kHz WAV). */
export function trimArgs(input: string, output: string, o: ClipOptions = {}): string[] {
  return [...quiet, '-i', input, '-af', clipFilter(o), '-ac', '1', '-ar', '48000', output];
}

export function ffmpegAvailable(): boolean {
  try {
    execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' });
    execFileSync(FFPROBE, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** EBU R128 integrated loudness (LUFS) and true peak (dBTP) via ffmpeg `ebur128`, the meter the
 * clips are checked with. (loudnorm's own measurement reads 0.5–0.7 LU low on short clips, so a
 * loudnorm pass aimed at −18 landed at −17.4 by ebur128.) */
export function measureR128(file: string): { i: number; tp: number } {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-nostdin', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ebur128 measure failed: ${r.stderr.slice(-400)}`);
  return parseR128(r.stderr);
}

/** The summary block of ffmpeg `ebur128` (last `I:` and `Peak:` lines). */
export function parseR128(stderr: string): { i: number; tp: number } {
  const num = (s: string | undefined) => (s === undefined || s === '-inf' ? -Infinity : Number(s));
  return {
    i: num([...stderr.matchAll(/I:\s+(-?[\d.]+|-inf) LUFS/g)].pop()?.[1]),
    tp: num([...stderr.matchAll(/Peak:\s+(-?[\d.]+|-inf) dBFS/g)].pop()?.[1]),
  };
}

/** Pre-limiter ceiling (sample peak, linear): −4.4 dBFS, margin for the make-up gain and codec overshoot. */
export const PRE_LIMIT = 0.6;
/** Opus at 24 kbps voip measures ~0.4–0.5 LU below its source; its encode gets this make-up gain (dB)
 * unless the decoded Opus would then peak above OPUS_MAX_PEAK_DB (then it is re-encoded without). */
export const OPUS_MAKEUP_DB = 0.5;
export const OPUS_MAX_PEAK_DB = -0.5;

const gainTo = (inputI: number | string): number => {
  const i = Number(inputI);
  return Number.isFinite(i) ? Math.max(-30, Math.min(30, TARGET_I - i)) : 0;
};

/**
 * Pre-limit stage: a static gain to the target loudness, then a gentle peak limiter. Speech peaks
 * sit 18–20 dB over its loudness, more than the 16.5 dB the −18 LUFS / −1.5 dBTP target allows, so
 * a linear normalisation alone stops short (MOSS clips: −18.1 to −18.9 LUFS).
 */
export function preLimitFilter(inputI: number | string): string {
  return `volume=${gainTo(inputI).toFixed(2)}dB,alimiter=limit=${PRE_LIMIT}:attack=5:release=50:level=false`;
}

/** Final static make-up to the target (what the limiter took off, typically +0.3…+1 dB), mono 24 kHz. */
export function makeupArgs(limited: string, limitedI: number, normed: string): string[] {
  return [...quiet, '-i', limited, '-af', `volume=${gainTo(limitedI).toFixed(2)}dB`, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', normed];
}

/** Decoded sample peak in dBFS (astats). */
export function samplePeakDb(file: string): number {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-nostdin', '-i', file, '-af', 'astats=measure_overall=Peak_level:measure_perchannel=0', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /Peak level dB:\s*(-?[\d.]+|-inf)/.exec(r.stderr);
  return !m || m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/** The two encodings of the normalised 24 kHz WAV (Opus with `opusGainDb` make-up). */
export function encodeArgs(normed: string, opusOut: string, aacOut: string, opusGainDb: number = OPUS_MAKEUP_DB): { opus: string[]; aac: string[] } {
  return {
    opus: [...quiet, '-i', normed, ...(opusGainDb ? ['-af', `volume=${opusGainDb}dB`] : []), '-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', '-ac', '1', '-f', 'webm', opusOut],
    aac: [...quiet, '-i', normed, '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart', '-f', 'mp4', aacOut],
  };
}

/**
 * Process `input` (any audio ffmpeg reads) into `opusOut` (WebM/Opus) and `aacOut` (MP4/AAC):
 * pause cap + trim, R128 measure, gain + pre-limit, re-measure, static make-up to −18 LUFS, encode.
 * Returns durationMs of the Opus file.
 */
export function processClip(input: string, opusOut: string, aacOut: string, o: ClipOptions = {}): number {
  const trimmed = `${opusOut}.trim.wav`;
  const limited = `${opusOut}.lim.wav`;
  const normed = `${opusOut}.norm.wav`;
  try {
    execFileSync(FFMPEG, trimArgs(input, trimmed, o));
    execFileSync(FFMPEG, [...quiet, '-i', trimmed, '-af', preLimitFilter(measureR128(trimmed).i), '-c:a', 'pcm_f32le', limited]);
    execFileSync(FFMPEG, makeupArgs(limited, measureR128(limited).i, normed));
    const enc = encodeArgs(normed, opusOut, aacOut);
    execFileSync(FFMPEG, enc.opus);
    // the make-up only if it stays clean: a decoded peak near 0 dBFS would clip in integer decoders
    if (samplePeakDb(opusOut) > OPUS_MAX_PEAK_DB) execFileSync(FFMPEG, encodeArgs(normed, opusOut, aacOut, 0).opus);
    execFileSync(FFMPEG, enc.aac);
  } finally {
    for (const f of [trimmed, limited, normed]) if (existsSync(f)) unlinkSync(f);
  }
  return durationMs(opusOut);
}

export function durationMs(file: string): number {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Math.round(Number(out.trim()) * 1000);
}
