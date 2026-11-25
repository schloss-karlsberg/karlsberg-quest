import { type Page, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Recorded voices: a line with a clip in voice/manifest.json plays it (through the speaker's
 * chain) while its subtitle types to the clip's length; a stale text murmurs; Enter stops it.
 * No real audio is committed: the manifest and a tone encoded at test time with ffmpeg (Opus in
 * WebM and AAC in M4A, the two formats of the contract) are served by page.route.
 */
test.describe.configure({ timeout: 300_000 });
test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  },
});

const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!IGNORED.some((r) => r.test(e.message))) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

/** FNV-1a 32-bit over the normalised UTF-8 text (the contract's hash, computed independently). */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(text.normalize('NFC').replace(/\s+/g, ' ').trim(), 'utf8')) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const FFMPEG = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find((p) => existsSync(p));

/** A quiet 220 Hz tone of `seconds`, encoded as Opus/WebM and AAC/M4A. */
function encodeTone(seconds: number): { opus: Buffer; aac: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), 'kq-voice-'));
  try {
    const src = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${seconds}:sample_rate=48000`, '-af', 'volume=0.2', '-ac', '1'];
    execFileSync(FFMPEG!, [...src, '-c:a', 'libopus', '-b:a', '32k', join(dir, 'clip.webm')]);
    execFileSync(FFMPEG!, [...src, '-c:a', 'aac', '-b:a', '64k', join(dir, 'clip.m4a')]);
    return { opus: readFileSync(join(dir, 'clip.webm')), aac: readFileSync(join(dir, 'clip.m4a')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ID = 'e2e.voice.hallo';
const TEXT = 'Grüß Gott. Die Bussole hört zu, und sie spricht jetzt mit eigener Stimme.';
const CLIP_S = 2.4;

const stats = (page: Page) => page.evaluate(() => ({
  ...window.kq!.story!.voice.stats(),
  audioTime: window.kq!.ctx.audio.ctx?.currentTime ?? 0,
  visibility: document.visibilityState,
}));

test('voice: a recorded line plays through its chain, its subtitle shows and types to the clip', async ({ page }) => {
  test.skip(!FFMPEG, 'ffmpeg is needed to encode the test clip');
  const errors = trackErrors(page);
  const hash = fnv(TEXT);
  expect(hash).toMatch(/^[0-9a-f]{8}$/);
  const tone = encodeTone(CLIP_S);
  const files = { opus: `${ID}.${hash}.webm`, aac: `${ID}.${hash}.m4a` };
  let clipRequests = 0;
  await page.route('**/voice/manifest.json', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        lines: {
          [ID]: { files, textHash: hash, speaker: 'laub', durationMs: CLIP_S * 1000, provider: 'e2e', speechHash: 'deadbeef', licence: 'test' },
          'e2e.voice.missing': { files: { opus: 'e2e.voice.missing.00000000.webm' }, textHash: '00000000' },
        },
      }),
    }),
  );
  await page.route(`**/voice/${files.opus}`, (r) => {
    clipRequests++;
    return r.fulfill({ contentType: 'audio/webm', body: tone.opus });
  });
  await page.route(`**/voice/${files.aac}`, (r) => {
    clipRequests++;
    return r.fulfill({ contentType: 'audio/mp4', body: tone.aac });
  });

  // Chromium's silent sink renders the native Web Audio graph without a host output device.
  await page.addInitScript(() => {
    window.AudioContext = class extends AudioContext {
      constructor(options?: AudioContextOptions) {
        const silentOptions = { ...options, sinkId: { type: 'none' } };
        super(silentOptions);
      }
    };
  });
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => !!window.kq?.story, null, { timeout: 180_000 });
  await page.evaluate(() => window.kq!.ctx.audio.unlock());
  await expect.poll(async () => (await stats(page)).ctx).toBe('running');
  await expect.poll(async () => (await stats(page)).manifest).toBe('ok');
  expect((await stats(page)).lines).toBe(2);

  // the presenter idle, the clip decoded ahead (as a beat's preload does)
  await page.evaluate(() => {
    window.kq!.story!.flush();
    window.kq!.step(1);
  });
  await expect.poll(() => page.evaluate(() => (window.kq!.story!.state().dialogue ? 1 : 0) + window.kq!.story!.state().pendingLines), { timeout: 60_000 }).toBe(0);
  await page.evaluate((id) => window.kq!.story!.voice.preload([id]), ID);
  await expect.poll(async () => (await stats(page)).cached).toBe(1);
  // Chromium plays Opus ("probably"): one request, the WebM
  const st = await stats(page);
  expect(st.opus).toBe(true);
  expect(st.lastFormat).toBe('opus');
  expect(clipRequests).toBe(1);

  // the voiced line: the clip starts, the subtitle shows
  const before = await stats(page);
  const { audioStart, started, typed } = await page.evaluate(({ id, text }) => {
    const kq = window.kq!;
    const audioStart = kq.ctx.audio.ctx!.currentTime;
    kq.story!.say('laub', text, id);
    kq.ctx.loop.advance(1);
    const started = kq.story!.voice.stats();
    // Measure a third of the 2.4 s clip's typing in the same task, before a GPU render or locator wait.
    kq.ctx.loop.advance(48);
    return { audioStart, started, typed: document.querySelector('.kqs-typed')?.textContent ?? '' };
  }, { id: ID, text: TEXT });
  expect(started.clips).toBe(before.clips + 1);
  expect(started.lastClip).toBe(ID);
  expect(started.playing).toBe(true);
  expect(typed.length).toBeGreaterThan(TEXT.length * 0.2);
  expect(typed.length).toBeLessThan(TEXT.length * 0.5);
  const dlg = page.getByTestId('dialogue');
  await expect(dlg).toHaveClass(/kqs-show/);
  await expect(dlg).toBeVisible();

  await page.evaluate(() => window.kq!.step(100));
  await expect(page.locator('.kqs-typed')).toHaveText(TEXT);
  await expect(dlg).toContainText(TEXT);

  // With simulation parked, the native source must end on its own. Report the clock and context
  // state on failure so a stalled audio renderer can be distinguished from a missing end event.
  await expect(async () => {
    const { playing, ctx, audioTime, visibility } = await stats(page);
    const elapsed = (audioTime - audioStart).toFixed(3);
    expect({ playing, ctx }, `Web Audio advanced ${elapsed} s while the page was ${visibility}`).toEqual({ playing: false, ctx: 'running' });
  }).toPass({ timeout: 10_000 });

  // a changed text: the recording is stale → the line murmurs
  await page.evaluate(() => {
    window.kq!.step(400);
    window.kq!.story!.say('laub', 'Ein ganz anderer Satz als der aufgenommene.', 'e2e.voice.hallo');
    window.kq!.step(1);
  });
  const s = await stats(page);
  expect(s.stale).toBeGreaterThanOrEqual(1);
  expect(s.clips).toBe(before.clips + 1);
  expect(s.murmured).toBeGreaterThan(before.murmured);
  expect(s.playing).toBe(false);

  // the voiced line again, skipped with Enter: its clip stops
  const replay = await page.evaluate(({ id, text }) => {
    const kq = window.kq!;
    kq.step(400);
    kq.story!.say('laub', text, id);
    kq.ctx.loop.advance(1);
    return kq.story!.voice.stats();
  }, { id: ID, text: TEXT });
  expect(replay.playing).toBe(true);
  expect(replay.clips).toBe(before.clips + 2);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stats(page)).playing).toBe(false);
  await expect(page.locator('.kqs-typed')).toHaveText(TEXT);

  expect(errors).toEqual([]);
});
