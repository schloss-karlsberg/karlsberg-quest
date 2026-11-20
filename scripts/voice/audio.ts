/**
 * ffmpeg post-processing: optional per-speaker pause cap (voices.json postprocess.maxPauseSec), trim silence to ~60 ms at each end, two-pass loudnorm to I=-18 LUFS /
 * TP=-1.5 dBTP, mono 24 kHz, then two encodings: Opus 24 kbps (voip) in WebM, and AAC ~48 kbps in
 * .m4a (macOS Safari's Opus support is partial); ffprobe for the real duration.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

export const FFMPEG = process.env.FFMPEG ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
export const FFPROBE = process.env.FFPROBE ?? (existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe');

const LOUD = `I=-18:TP=-1.5:LRA=11`;
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

interface LoudMeasure {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** loudnorm pass 1 (measure); its JSON report goes to stderr. */
function measure(file: string): LoudMeasure {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', `loudnorm=${LOUD}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`loudnorm measure failed: ${r.stderr.slice(-400)}`);
  const err = r.stderr;
  return JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1)) as LoudMeasure;
}

/**
 * Process `input` (any audio ffmpeg reads) into `opusOut` (WebM/Opus) and `aacOut` (MP4/AAC).
 * Returns durationMs of the Opus file.
 */
export function processClip(input: string, opusOut: string, aacOut: string, o: ClipOptions = {}): number {
  const trimmed = `${opusOut}.trim.wav`;
  const normed = `${opusOut}.norm.wav`;
  try {
    execFileSync(FFMPEG, trimArgs(input, trimmed, o));
    const m = measure(trimmed);
    const ln =
      `loudnorm=${LOUD}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:` +
      `measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    execFileSync(FFMPEG, [...quiet, '-i', trimmed, '-af', ln, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', normed]);
    execFileSync(FFMPEG, [...quiet, '-i', normed, '-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', '-ac', '1', '-f', 'webm', opusOut]);
    execFileSync(FFMPEG, [...quiet, '-i', normed, '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart', '-f', 'mp4', aacOut]);
  } finally {
    for (const f of [trimmed, normed]) if (existsSync(f)) unlinkSync(f);
  }
  return durationMs(opusOut);
}

export function durationMs(file: string): number {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Math.round(Number(out.trim()) * 1000);
}
