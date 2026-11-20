#!/usr/bin/env node
/**
 * Voice clips for dialogue lines via ElevenLabs.
 *
 *   pnpm voice:plan                       dry run: the plan, no network spend
 *   pnpm voice:gen                        generate within budget
 *   node scripts/voice/generate.mjs --help
 *
 * Reads ELEVENLABS_API_KEY from the main checkout's .env (override: --env <path>). The key is
 * sent only as the `xi-api-key` header and never printed. Output and manifest go to
 * public/voice/ (gitignored; audio licensing is pending). Contract: scripts/voice/lib.ts.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  CREDITS_PER_CHAR,
  buildPlan,
  clipFile,
  collectLines,
  isPlaceholderVoice,
  loadContent,
  readManifest,
  redact,
  selectLines,
  spendCap,
  writeManifest,
} from './lib.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** The main checkout's .env (worktrees share its git dir; they have no .env of their own). */
const MAIN_ENV = (() => {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return join(dirname(common), '.env');
  } catch {
    return join(REPO, '.env');
  }
})();

const { values: a } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    env: { type: 'string', default: MAIN_ENV },
    model: { type: 'string' },
    budget: { type: 'string', default: '8000' },
    reserve: { type: 'string', default: '1400' },
    ids: { type: 'string' },
    speakers: { type: 'string' },
    out: { type: 'string', default: join(REPO, 'public/voice') },
    content: { type: 'string', default: join(REPO, 'content') },
    voices: { type: 'string', default: join(HERE, 'voices.json') },
    priority: { type: 'string', default: join(HERE, 'priority.json') },
    limit: { type: 'string' },
    force: { type: 'boolean', default: false },
    prune: { type: 'boolean', default: false },
    offline: { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (a.help) {
  console.log(`Usage: node scripts/voice/generate.mjs [options]
  --dry-run            print the plan; no TTS calls, nothing written
  --env <path>         .env holding ELEVENLABS_API_KEY (default: main checkout .env)
  --model <id>         run model (default: voices.json defaultModel = eleven_flash_v2_5); a speaker's own model wins
  --budget <credits>   credits this run may use (default 8000)
  --reserve <credits>  credits kept unspent (default 1400): spend <= min(budget, account remaining) - reserve
  --ids <a,b,glob*>    explicit line ids / globs instead of the priority tiers
  --speakers <a,b>     only these speakers
  --limit <n>          at most n new clips
  --force              regenerate even up-to-date lines
  --prune              (real run) remove manifest entries and clips of lines no longer in content
  --offline            do not ask the account for remaining credits
  --out <dir>          output dir (default public/voice)
  --content, --voices, --priority <path>
  -v, --verbose        list every selected line, also those past the budget`);
  process.exit(0);
}

const dry = a['dry-run'];
const num = (s, name) => {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a non-negative number`);
  return n;
};
const budget = num(a.budget, 'budget');
const reserve = num(a.reserve, 'reserve');
const limit = a.limit === undefined ? Infinity : num(a.limit, 'limit');
const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

let KEY = '';
function fail(msg) {
  console.error(`voice: ${redact(String(msg), KEY)}`);
  process.exit(1);
}

// --- key (never printed) ------------------------------------------------------------------
let keyNote;
try {
  process.loadEnvFile(a.env);
  KEY = (process.env.ELEVENLABS_API_KEY ?? '').trim();
  keyNote = KEY ? 'present' : `no key: ELEVENLABS_API_KEY is empty in ${a.env}`;
} catch (e) {
  keyNote = e && e.code === 'ENOENT' ? `no key: no .env at ${a.env}` : `no key: could not read ${a.env}`;
}
// keep the key out of anything spawned later (ffmpeg)
delete process.env.ELEVENLABS_API_KEY;

if (!dry && !KEY) fail(`${keyNote}. Put ELEVENLABS_API_KEY into that .env (never into the repo) or pass --env <path>. Nothing generated (try --dry-run).`);
if (a.model && !(a.model in CREDITS_PER_CHAR)) fail(`unknown model "${a.model}" (known: ${Object.keys(CREDITS_PER_CHAR).join(', ')})`);

// --- inputs -------------------------------------------------------------------------------
const voices = JSON.parse(readFileSync(a.voices, 'utf8'));
const priority = JSON.parse(readFileSync(a.priority, 'utf8'));
const lines = collectLines(loadContent(a.content));
const manifestPath = join(a.out, 'manifest.json');
const manifest = readManifest(manifestPath);
const fileExists = (f) => existsSync(join(a.out, f));

// in a real run placeholder voice ids are not voices
const runVoices = dry
  ? voices
  : { ...voices, speakers: Object.fromEntries(Object.entries(voices.speakers).filter(([, v]) => !isPlaceholderVoice(v.voiceId))) };

const selected = selectLines(lines, priority, { ids: list(a.ids), speakers: list(a.speakers) });

// --- account ------------------------------------------------------------------------------
let remaining = null;
let accountNote = 'not checked';
if (KEY && !a.offline) {
  const { getSubscription } = await import('./api.ts');
  try {
    const s = await getSubscription(KEY);
    remaining = s.remaining;
    accountNote = `${s.remaining} of ${s.characterLimit} credits left (tier ${s.tier}${s.nextReset ? `, resets ${s.nextReset}` : ''})`;
  } catch (e) {
    if (!dry) fail(`could not read the subscription: ${e.message}`);
    accountNote = `could not read: ${redact(e.message, KEY)}`;
  }
}

const cap = spendCap({ budget, reserve, remaining });
let plan = buildPlan(selected, { voices: runVoices, runModel: a.model, manifest, cap, fileExists, force: a.force });
if (Number.isFinite(limit)) {
  let n = 0;
  let spend = 0;
  for (const r of plan.rows) {
    if (!r.take) continue;
    if (n >= limit) {
      r.take = false;
      continue;
    }
    n++;
    spend += r.credits;
    r.cumulative = spend;
  }
  plan = { ...plan, spend, chars: plan.rows.filter((r) => r.take).reduce((s, r) => s + r.chars, 0) };
}

printPlan(plan);
if (dry) process.exit(0);

// --- real run -----------------------------------------------------------------------------
const todo = plan.rows.filter((r) => r.take);
if (!todo.length) {
  console.log('\nNothing to generate.');
  if (a.prune) prune();
  process.exit(0);
}
const { ffmpegAvailable, processClip } = await import('./audio.ts');
if (!ffmpegAvailable()) fail('ffmpeg/ffprobe not found (set FFMPEG / FFPROBE)');
const { tts } = await import('./api.ts');

mkdirSync(a.out, { recursive: true });
const tmpDir = join(a.out, '.tmp');
mkdirSync(tmpDir, { recursive: true });
let spent = 0;
let done = 0;
for (const [i, r] of todo.entries()) {
  const id = r.line.id;
  process.stdout.write(`[${i + 1}/${todo.length}] ${id} (${r.chars} chars, ~${r.credits} cr) … `);
  let res;
  try {
    res = await tts(KEY, { voiceId: r.voice.voiceId, model: r.voice.model, text: r.tts, voiceSettings: r.voice.voiceSettings }, (s) => console.log(s));
  } catch (e) {
    console.log('failed');
    if (e.status === 401 || e.status === 402 || e.status === 403) fail(`${redact(e.message, KEY)} – stopping`);
    console.error(`  ${redact(e.message, KEY)} – skipped`);
    continue;
  }
  const raw = join(tmpDir, `${id}.raw.mp3`);
  writeFileSync(raw, res.audio);
  const file = clipFile(id, r.hash);
  const tmpOut = join(tmpDir, `${file}.part`);
  let durationMs;
  try {
    durationMs = processClip(raw, tmpOut);
  } catch (e) {
    console.log('ffmpeg failed');
    console.error(`  ${String(e.message).slice(0, 300)} – raw kept at ${raw}`);
    continue;
  }
  renameSync(tmpOut, join(a.out, file));
  unlinkSync(raw);
  const old = manifest.lines[id];
  if (old && old.file !== file && existsSync(join(a.out, old.file))) unlinkSync(join(a.out, old.file));
  const credits = res.billed ?? r.credits;
  manifest.lines[id] = {
    file,
    textHash: r.hash,
    speaker: r.line.speaker,
    voiceId: r.voice.voiceId,
    model: r.voice.model,
    date: new Date().toISOString(),
    chars: r.chars,
    credits,
    durationMs,
  };
  writeManifest(manifestPath, manifest);
  spent += credits;
  done++;
  console.log(`${durationMs} ms`);
}
rmSync(tmpDir, { recursive: true, force: true });
if (a.prune) prune();
console.log(`\nGenerated ${done}/${todo.length} clips, ~${spent} credits. Manifest: ${manifestPath}`);

// ------------------------------------------------------------------------------------------
function prune() {
  const ids = new Set(lines.map((l) => l.id));
  let n = 0;
  for (const [id, e] of Object.entries(manifest.lines)) {
    if (ids.has(id)) continue;
    if (existsSync(join(a.out, e.file))) unlinkSync(join(a.out, e.file));
    delete manifest.lines[id];
    n++;
  }
  if (n) writeManifest(manifestPath, manifest);
  console.log(`Pruned ${n} orphaned entries.`);
}

function printPlan(p) {
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  const models = [...new Set(p.rows.map((r) => r.voice.model))];
  console.log(`Voice plan${dry ? ' (dry run)' : ''} · ${lines.length} lines in content, ${selected.length} selected`);
  console.log(`Key: ${keyNote} · account: ${accountNote}`);
  console.log(`Model(s): ${models.join(', ') || '-'} · budget ${budget} − reserve ${reserve}${remaining != null ? ` (account ${remaining})` : ''} → cap ${p.cap} credits`);
  const placeholders = Object.entries(voices.speakers).filter(([, v]) => isPlaceholderVoice(v.voiceId)).map(([k]) => k);
  if (placeholders.length) console.log(`Placeholder voice ids (${dry ? 'planned, but a real run skips them' : 'skipped'}): ${placeholders.join(', ')}`);
  console.log('');
  const w = Math.max(28, ...p.rows.map((r) => r.line.id.length)) + 1;
  console.log(`${lpad('#', 4)}  ${pad('line id', w)}${pad('speaker', 9)}${pad('tier', 16)}${pad('status', 13)}${lpad('chars', 6)}${lpad('credits', 8)}${lpad('cum.', 7)}`);
  let shown = 0;
  let hidden = 0;
  p.rows.forEach((r, i) => {
    const past = !r.take && r.status !== 'up-to-date';
    if (past && !a.verbose) return void hidden++;
    shown++;
    const st = r.take ? r.status : r.status === 'up-to-date' ? 'up-to-date' : `(${r.status})`;
    const cum = r.take ? r.cumulative : '';
    console.log(`${lpad(i + 1, 4)}  ${pad(r.line.id, w)}${pad(r.line.speaker, 9)}${pad(r.tier, 16)}${pad(st, 13)}${lpad(r.chars, 6)}${lpad(r.status === 'up-to-date' ? 0 : r.credits, 8)}${lpad(cum, 7)}`);
  });
  const taken = p.rows.filter((r) => r.take);
  const upToDate = p.rows.filter((r) => r.status === 'up-to-date');
  const stale = p.rows.filter((r) => r.status.startsWith('stale') || r.status === 'missing-file');
  const rest = p.rows.filter((r) => !r.take && r.status !== 'up-to-date');
  if (hidden) console.log(`   … ${hidden} more selected lines past the budget (-v lists them)`);
  console.log('');
  console.log(`To generate: ${taken.length} lines · ${p.chars} chars · ${p.spend} credits (cap ${p.cap}; reserve ${reserve} kept, ${p.cap - p.spend} of the cap unused)`);
  console.log(`Up to date: ${upToDate.length} · stale (text/voice/model/file changed): ${stale.length} · lines covered after run: ${upToDate.length + taken.length}/${p.rows.length}`);
  if (rest.length) console.log(`Past the budget: ${rest.length} lines · ${rest.reduce((s, r) => s + r.chars, 0)} chars · ${rest.reduce((s, r) => s + r.credits, 0)} credits${p.stoppedAt ? ` (stopped at ${p.stoppedAt.line.id})` : ''}`);
  const byReason = {};
  for (const s of p.skipped) (byReason[s.reason] ??= {})[s.line.speaker] = (byReason[s.reason]?.[s.line.speaker] ?? 0) + 1;
  for (const [reason, sp] of Object.entries(byReason))
    console.log(`Skipped (${reason}): ${Object.entries(sp).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  // what all selected lines would cost per model
  const allChars = p.rows.reduce((s, r) => s + r.chars, 0);
  const tChars = taken.reduce((s, r) => s + r.chars, 0);
  console.log(
    `All ${p.rows.length} selected lines: ${allChars} chars → ` +
      Object.entries(CREDITS_PER_CHAR)
        .map(([m, rate]) => `${m} ${Math.ceil(allChars * rate)}`)
        .join(' · ') +
      ` credits (this run's ${taken.length} lines: ${tChars} chars)`,
  );
  const noVoice = {};
  for (const l of lines) if (!runVoices.speakers[l.speaker]?.voiceId) noVoice[l.speaker] = (noVoice[l.speaker] ?? 0) + 1;
  const nv = Object.entries(noVoice).sort((x, y) => y[1] - x[1]);
  if (nv.length) console.log(`Speakers without a voice id in voices.json (never generated): ${nv.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const orphans = Object.keys(manifest.lines).filter((id) => !lines.some((l) => l.id === id));
  if (orphans.length) console.log(`Orphaned manifest entries (line gone from content; --prune removes): ${orphans.join(', ')}`);
}
