/**
 * ffmpeg post-processing: trim silence to ~60 ms at each end, two-pass loudnorm to I=-18 LUFS /
 * TP=-1.5 dBTP, MP3 mono 44.1 kHz 64 kbps; ffprobe for the real duration.
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

/** Process `input` (any audio ffmpeg reads) into `output` (.mp3). Returns durationMs of the result. */
export function processClip(input: string, output: string): number {
  const trimmed = `${output}.trim.wav`;
  try {
    execFileSync(FFMPEG, [...quiet, '-i', input, '-af', TRIM, '-ac', '1', '-ar', '44100', trimmed]);
    const m = measure(trimmed);
    const ln =
      `loudnorm=${LOUD}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:` +
      `measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    execFileSync(FFMPEG, [...quiet, '-i', trimmed, '-af', ln, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', output]);
  } finally {
    if (existsSync(trimmed)) unlinkSync(trimmed);
  }
  return durationMs(output);
}

export function durationMs(file: string): number {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Math.round(Number(out.trim()) * 1000);
}
