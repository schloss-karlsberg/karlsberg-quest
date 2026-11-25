import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type CDPSession, type Page, expect, test } from '@playwright/test';
import { QUEST_PLAY } from '../helpers/prolog';
import { openPause } from '../helpers/pause';
import { type MobileUnit, findUnit } from './devices';
import { type UiMeasure, measureUi, sampleFrames, scrollModalToBottom } from './measure';

/**
 * The mobile UI tour (docs/MOBILE-UI-PASS.md): one device/orientation unit per run, real GPU
 * (ANGLE Metal, e2e/mobile/playwright.config.ts), touch emulation, safe-area insets. Walks a fresh
 * player's way (title → new game → the guided tour → the first minutes of K1), screenshots every
 * state into test-results/mobile-tour/<unit>/<NN>-<state>[-<sub>].png and writes findings.json
 * (tap targets, overlaps, text, safe areas, scroll, frame times per shot).
 *
 * Not part of the normal suite (the file is not a *.spec.ts): run through
 *   pnpm exec tsx scripts/dev/mobile-tour.ts --device small-landscape [--states hud,combat]
 * which sets KQ_MOBILE_UNIT / KQ_MOBILE_STATES and uses this folder's config.
 *
 * States reach their moment through window.kq (story.goto, teleport, combat spawn …); what a player
 * does with a finger (open the pause menu, the map, the field book, tabs, lock-on, Hieb, the stick,
 * scrolling a long page) is done with real CDP touch events (`Finger`).
 */

const unit: MobileUnit = findUnit(process.env.KQ_MOBILE_UNIT ?? 'small-landscape');
const FILTER = (process.env.KQ_MOBILE_STATES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = `test-results/mobile-tour/${unit.id}`;
/** Real time each state is left to run before its frame-time sample and shot (ms). */
const SETTLE = Number(process.env.KQ_MOBILE_SETTLE ?? 600);
const SAMPLE = Number(process.env.KQ_MOBILE_SAMPLE ?? 1500);
const ALLOW_SOFT = process.env.KQ_MOBILE_ALLOW_SOFT === '1';
/** Draw the emulated inset zones as dashed outlines into the shots (off by default: shots show what a player sees). */
const MASK = process.env.KQ_MOBILE_MASK === '1';

/** A meadow south of the Apfelallee, clear of NPCs (as e2e/touch.spec.ts). */
const FIELD = { x: 1452, z: -640, yaw: 330 };
/** Hanne's spot in the K1 court (helpers/k1.ts giverShot). */
const HANNE_FROM: [number, number] = [1283.2, -1221.2];

// ---------------------------------------------------------------------------------------------
// touch
// ---------------------------------------------------------------------------------------------

/** Real touch for one finger id (CDP Input.dispatchTouchEvent; the browser makes the pointer events). */
class Finger {
  private static down = new Map<number, { x: number; y: number }>();
  constructor(
    private readonly cdp: CDPSession,
    readonly id: number,
  ) {}
  private points() {
    return [...Finger.down.entries()].map(([id, p]) => ({ ...p, id }));
  }
  async start(x: number, y: number): Promise<void> {
    Finger.down.set(this.id, { x, y });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.points() });
  }
  async move(x: number, y: number, steps = 6): Promise<void> {
    const from = Finger.down.get(this.id)!;
    for (let i = 1; i <= steps; i++) {
      Finger.down.set(this.id, { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps });
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.points() });
    }
  }
  async end(): Promise<void> {
    Finger.down.delete(this.id);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: this.points() });
  }
  async tap(x: number, y: number, holdMs = 70): Promise<void> {
    await this.start(x, y);
    await new Promise((r) => setTimeout(r, holdMs));
    await this.end();
  }
  static reset(): void {
    Finger.down.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------------------------

interface Shot {
  file: string;
  state: string;
  sub: string | null;
  frames: Awaited<ReturnType<typeof sampleFrames>>;
  perf: { fps: number; frameAvg: number; frameP95: number; frameMax: number; cpuAvg: number; gpuAvg: number | null; calls: number } | null;
  ui: UiMeasure;
  note?: string;
}
interface Findings {
  unit: MobileUnit;
  gpu: string;
  safeArea: 'cdp' | 'css-fallback';
  quality: string | null;
  startedAt: string;
  shots: Shot[];
  states: Record<string, { ok: boolean; ms: number; error?: string; na?: string }>;
  /**
   * What the runner had to work around (each one is a finding candidate), tagged with its state:
   * "[journal] …". A full unit run starts empty; a subset run drops the notes of the states it
   * re-shoots (and untagged ones from older runs), so notes no longer pile up across re-runs.
   */
  notes: string[];
}

// ---------------------------------------------------------------------------------------------
// the tour
// ---------------------------------------------------------------------------------------------

interface Ctx {
  page: Page;
  cdp: CDPSession;
  f: Findings;
  /** Screenshot + measurements of the current screen as <NN>-<state>[-<sub>].png. */
  shot(sub?: string, note?: string): Promise<void>;
  /** Tap the centre of a test id (real touch). */
  tap(testid: string, finger?: number): Promise<void>;
  /** Tap the centre of a locator (real touch). */
  tapSel(selector: string, finger?: number): Promise<void>;
  /** Swipe the top modal's content up to its end with a finger, then make sure it is there; shoots "<sub>-bottom". */
  scrollShot(sub: string): Promise<void>;
  /** Close modals, cards, enemies; finish typing. */
  tidy(): Promise<void>;
  /** Mark the state not applicable on this build. */
  na(reason: string): void;
}

interface State {
  id: string;
  /** Needs the title flow (boot without ?notitle). */
  title?: boolean;
  /** Also on phone portrait units (title, menus, the rotate overlay); everything else is landscape-only on phones. */
  portrait?: boolean;
  run(c: Ctx): Promise<void>;
}

const STATES: State[] = [
  // ---- title and new game (real taps) ---------------------------------------------------------
  {
    id: 'title',
    title: true,
    portrait: true,
    run: async (c) => {
      await expect(c.page.getByTestId('title-new')).toBeEnabled({ timeout: 180_000 });
      await c.shot();
      // portrait phones: the rotate overlay already covers the title (touch mode is on from the
      // first frame). Shot as is above; then hidden by the runner so the title, news, settings and
      // new-game screens can still be judged for portrait readability.
      if (unit.phonePortrait && (await c.page.locator('.kq-rotate').isVisible())) {
        c.f.notes.push('portrait phone: the rotate overlay covers the title screen and blocks every tap; the runner hides it for the title-flow states');
        hideRotate = true;
        await c.page.evaluate(NOROTATE);
        await c.shot('no-overlay', 'overlay hidden by the runner');
      }
    },
  },
  {
    id: 'news',
    title: true,
    portrait: true,
    run: async (c) => {
      await c.tap('title-news');
      await expect(c.page.locator('.kq-modal-layer').last()).toBeVisible();
      await c.shot();
      await c.scrollShot('');
      await c.tapSel('.kq-modal-layer button.close');
      await c.tidy();
    },
  },
  {
    id: 'title-settings',
    title: true,
    portrait: true,
    run: async (c) => {
      await c.tap('title-settings');
      await expect(c.page.getByTestId('settings')).toBeVisible();
      for (const sec of ['game', 'controls', 'graphics', 'access', 'audio']) {
        if (!(await c.page.getByTestId(`set-nav-${sec}`).isVisible())) continue;
        await c.tap(`set-nav-${sec}`);
        await c.shot(sec);
        await c.scrollShot(sec);
      }
      await c.tidy();
    },
  },
  {
    id: 'warning',
    title: true,
    portrait: true,
    run: async (c) => {
      await c.tap('title-new');
      await expect(c.page.getByTestId('content-warning')).toBeVisible();
      await c.shot();
    },
  },
  {
    id: 'name',
    title: true,
    portrait: true,
    run: async (c) => {
      await c.tap('warning-accept');
      await expect(c.page.getByTestId('player-name')).toBeVisible();
      await c.shot();
      // a tap in the field focuses it (no on-screen keyboard in emulation: note its height in the doc)
      await c.tap('player-name');
      await c.page.getByTestId('player-name').fill('Alex');
      await c.shot('typed');
    },
  },
  {
    id: 'tour-map',
    title: true,
    portrait: true,
    run: async (c) => {
      await c.tap('name-confirm');
      await expect(c.page.getByTestId('start-tour')).toBeVisible();
      await c.shot();
      await c.tap('start-tour');
      await expect(c.page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
      await c.page.waitForTimeout(1200);
      await c.shot('first-frame', 'the tour chapter card over the first frame');
    },
  },
  // ---- the rotate overlay (phone portrait), else the first HUD ------------------------------------
  {
    id: 'rotate',
    portrait: true,
    run: async (c) => {
      await c.tidy();
      hideRotate = false;
      await c.page.evaluate(() => document.getElementById('kq-tour-norotate')?.remove());
      await c.page.waitForTimeout(200);
      const rotate = await c.page.locator('.kq-rotate').isVisible();
      if (!rotate && unit.phonePortrait) await c.shot('missing', 'expected the rotate overlay on a portrait phone');
      if (!unit.portrait) return c.na('landscape: no rotate overlay');
      await c.shot(rotate ? 'overlay' : 'none');
      // what lies above / below it: a modal opened under the overlay, the touch controls
      await openPause(c.page);
      await c.page.waitForTimeout(400);
      await c.shot('with-pause', 'is a modal above or below the overlay?');
      await c.tidy();
    },
  },
  // ---- tour HUD ----------------------------------------------------------------------------
  {
    id: 'hud-idle',
    run: async (c) => {
      await c.page.evaluate(() => {
        const k = window.kq!;
        const s = k.story!.state();
        if (s.chapter !== 'tour' || s.beat !== 't1') k.story!.goto('tour', 't1');
        k.teleport(532, -783, 330, -6);
        k.story!.flush();
        k.ctx.ui.modals.closeAll();
        k.story!.finishTyping();
      });
      await c.page.waitForTimeout(2500);
      await c.tidy();
      await c.shot('', 'HUD at rest: compass, tracker, vitals, touch controls');
    },
  },
  {
    id: 'toasts',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => {
        const k = window.kq!;
        k.ctx.ui.cards.clearToasts();
        k.ctx.ui.toast('Neuer Fund: Mauerrest am Damm (Relief 2)', 12000);
        k.ctx.ui.toast('Neue Aufgabe: Wasser, das sich erinnert', 12000);
        k.progression!.xp(40, { x: k.ctx.player.position.x, z: k.ctx.player.position.z });
      });
      const toast = c.page.locator('.kq-toast:not(.kq-notice-out)');
      await expect(toast).toHaveText('Neuer Fund: Mauerrest am Damm (Relief 2)');
      await expect(toast).toBeVisible();
      await c.shot('', 'one toast, an XP float, the tracker');
      await c.page.evaluate(() => window.kq!.ctx.ui.cards.clearToasts());
    },
  },
  {
    id: 'touch-stick',
    run: async (c) => {
      await c.tidy();
      const vp = c.page.viewportSize()!;
      const stick = new Finger(c.cdp, 11);
      const sx = vp.width * 0.18;
      const sy = vp.height * 0.7;
      await stick.start(sx, sy);
      await stick.move(sx + 10, sy - 40);
      await c.shot('walk');
      await stick.move(sx + 20, sy - 90);
      await c.shot('sprint');
      // second finger looks while walking
      const look = new Finger(c.cdp, 12);
      await look.start(vp.width * 0.6, vp.height * 0.4);
      await look.move(vp.width * 0.6 + 80, vp.height * 0.4, 6);
      await c.shot('walk-look');
      await look.end();
      await stick.end();
    },
  },
  {
    id: 'touch-buttons',
    run: async (c) => {
      await c.tidy();
      const box = await c.page.getByTestId('touch-attack').boundingBox();
      if (box) {
        const f = new Finger(c.cdp, 13);
        await f.start(box.x + box.width / 2, box.y + box.height / 2);
        await c.page.waitForTimeout(250);
        await c.shot('attack-held', 'pressed state (Wuchthieb charging)');
        await f.end();
      }
      // cue states: an interact prompt lights the Aktion button, a key prompt rings its button
      await c.page.evaluate(() => window.kq!.ctx.ui.hud.prompt('E', 'Mauerrest untersuchen', 'tour'));
      await c.page.waitForTimeout(200);
      await c.shot('cue-interact');
      await c.page.evaluate(() => {
        const hud = window.kq!.ctx.ui.hud;
        hud.prompt(null, undefined, 'tour');
        hud.prompt('Q', 'Epoche wechseln', 'tour');
      });
      await c.page.waitForTimeout(200);
      await c.shot('cue-shift');
      await c.page.evaluate(() => window.kq!.ctx.ui.hud.prompt(null, undefined, 'tour'));
      await c.tap('touch-survey');
      await c.tap('touch-relief');
      await c.page.waitForTimeout(200);
      await c.shot('relief-pop');
      await c.tap('touch-scan0');
    },
  },
  {
    id: 'dialogue',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => {
        const k = window.kq!;
        k.story!.say('laub', 'Hörst du das? Unter dem Hang rauscht Wasser, das älter ist als jede Karte, die du im Wagen liegen hast. Geh hinunter zur Quelle.');
        k.story!.finishTyping();
      });
      await c.page.waitForTimeout(300);
      await c.shot('', 'subtitles + speaker portrait, default size');
      await c.page.evaluate(() => window.kq!.ctx.ui.hud.setSubtitleSize('xl'));
      await c.page.waitForTimeout(200);
      await c.shot('xl', 'largest subtitle size: collisions with the thumb arc?');
      await c.page.evaluate(() => window.kq!.ctx.ui.hud.setSubtitleSize('m'));
      // M-01: with a line up, the top-row buttons still take a real tap (Pause, Handy)
      const say = () =>
        c.page.evaluate(() => {
          const k = window.kq!;
          k.story!.say('laub', 'Hörst du das? Unter dem Hang rauscht Wasser, das älter ist als jede Karte, die du im Wagen liegen hast.');
          k.story!.finishTyping();
        });
      const lineUp = () => c.page.locator('.kqs-dlg.kqs-show').isVisible();
      await say();
      await c.page.waitForTimeout(300);
      const upMenu = await lineUp();
      await c.tap('touch-pause');
      const pause = await c.page
        .waitForFunction(() => window.kq!.ctx.ui.modals.count > 0, null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      c.f.notes.push(`dialogue: a tap on touch-pause while a line shows (line up: ${upMenu}) ${pause ? 'opened' : 'did NOT open'} Pause`);
      if (pause) await c.shot('tap-pause', 'Pause opened by a real tap while a line was up');
      await c.page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
      await c.page.waitForTimeout(300);
      if (await c.page.evaluate(() => 'photo' in (window.kq as object))) {
        await say();
        await c.page.waitForTimeout(300);
        const upP = await lineUp();
        await c.tap('touch-photo');
        await c.page.waitForTimeout(800);
        type Ph = { close(): void; state(): { open: boolean } };
        const photo = await c.page.evaluate(() => (window.kq as unknown as { photo: Ph }).photo.state().open);
        c.f.notes.push(`dialogue: a tap on touch-photo while a line shows (line up: ${upP}) ${photo ? 'opened' : 'did NOT open'} photo mode`);
        if (photo) await c.shot('tap-photo', 'photo mode opened by a real tap while a line was up');
        await c.page.evaluate(() => (window.kq as unknown as { photo: Ph }).photo.close());
      }
      await c.tidy();
    },
  },
  // ---- menus (opened by touch) -------------------------------------------------------------------
  {
    id: 'pause',
    run: async (c) => {
      await c.tidy();
      const probe = (tid: string) =>
        c.page.evaluate((tid) => {
          const el = document.querySelector(`[data-testid=${tid}]`);
          if (!el) return 'missing';
          const b = el.getBoundingClientRect();
          return document
            .elementsFromPoint(b.x + b.width / 2, b.y + b.height / 2)
            .slice(0, 4)
            .map((e) => `${e.tagName}.${(e as HTMLElement).className}[${(e as HTMLElement).dataset.testid ?? ''}]`)
            .join(' > ');
        }, tid);
      const before = await probe('touch-pause');
      const log: string[] = [];
      await c.page.exposeFunction('__kqTourLog', (m: string) => log.push(m)).catch(() => undefined);
      await c.page.evaluate(() => {
        const w = window as unknown as { __kqTourLog(m: string): void };
        for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'click'] as const)
          window.addEventListener(ev, (e) => w.__kqTourLog(`${ev}@${(e.target as HTMLElement).className}`), { capture: true, once: true });
      });
      await c.tap('touch-pause');
      const paused = await c.page
        .getByTestId('resume')
        .waitFor({ state: 'visible', timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (!paused) {
        c.f.notes.push(`pause: a tap on touch-pause did not open the menu (stack before: ${before}; events: ${log.join(', ')}; modals: ${await c.page.evaluate(() => window.kq!.ctx.ui.modals.count)}); opened by Escape`);
        await c.page.evaluate(() => {
          const { cards } = window.kq!.ctx.ui;
          cards.clearToasts();
          cards.dismissNotice();
        });
        await c.page.keyboard.press('Escape');
      }
      await expect(c.page.getByTestId('resume')).toBeVisible();
      await c.shot();
      await c.scrollShot('');
      if (await c.page.getByTestId('pause-controls').isVisible()) {
        await c.tap('pause-controls');
        await c.page.waitForTimeout(300);
        await c.shot('controls');
        await c.scrollShot('controls');
        await c.page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
        await c.tap('touch-pause');
      }
      if (await c.page.getByTestId('asset-licences').isVisible()) {
        await c.tap('asset-licences');
        await c.page.waitForTimeout(300);
        await c.shot('licences');
        await c.scrollShot('licences');
      }
      await c.tidy();
    },
  },
  {
    id: 'settings',
    run: async (c) => {
      await c.tidy();
      await c.tap('touch-pause');
      await c.tap('pause-settings');
      await expect(c.page.getByTestId('settings')).toBeVisible();
      for (const sec of ['game', 'controls', 'graphics', 'access', 'audio']) {
        if (!(await c.page.getByTestId(`set-nav-${sec}`).isVisible())) continue;
        await c.tap(`set-nav-${sec}`);
        await c.shot(sec);
        await c.scrollShot(sec);
      }
      await c.tidy();
    },
  },
  {
    id: 'map',
    run: async (c) => {
      await c.tidy();
      await c.tap('touch-survey');
      await c.tap('touch-map');
      await c.page.waitForTimeout(500);
      await c.shot();
      await c.scrollShot('');
      await c.page.evaluate(() => window.kq!.travel?.map(false));
      await c.tidy();
    },
  },
  {
    id: 'journal',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => {
        const p = window.kq!.progression!;
        p.grant('item.stab.esche', 1, true);
        p.equip('item.stab.esche');
        p.grant('item.balsam', 3, true);
        p.grant('item.lampenoel', 2, true);
      });
      await c.tap('touch-pause');
      await expect(c.page.getByTestId('pause-menu')).toBeVisible();
      const pages = await c.page.getByTestId('pause-menu').locator('.kq-pause-destinations button').evaluateAll(
        (buttons) => buttons.map((button) => (button as HTMLButtonElement).dataset.testid!),
      );
      for (const entry of pages) {
        await c.tap(entry);
        const sub = entry.slice('pause-'.length);
        const panel = c.page.getByTestId(`page-${sub}`);
        await expect(panel).toBeVisible();
        await c.shot(sub, sub === 'codex' ? 'codex' : sub === 'gear' ? 'inventory and equipment' : undefined);
        await c.scrollShot(sub);
        await panel.getByRole('button', { name: 'Zurück', exact: true }).tap();
        await expect(panel).toBeHidden();
      }
      await c.tidy();
    },
  },
  // ---- combat ------------------------------------------------------------------------------------
  {
    id: 'combat',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate((at) => {
        const k = window.kq!;
        k.progression!.grant('item.stab.esche', 1, true);
        k.progression!.equip('item.stab.esche');
        k.teleport(at.x, at.z, at.yaw, -6);
        k.combat!.kill();
        k.combat!.god(true);
        k.combat!.spawn('nebelling', { dist: 5, count: 3, group: 'tour.nebel', radius: 2 });
      }, FIELD);
      await c.page.waitForTimeout(1200);
      await c.shot('approach', 'enemy bars, threat');
      await c.tap('touch-lock');
      await c.page.waitForTimeout(300);
      await c.shot('lock-on');
      await c.tap('touch-bannlicht');
      await c.page.waitForTimeout(250);
      await c.shot('bannlicht');
      await c.tap('touch-attack');
      await c.page.waitForTimeout(250);
      await c.shot('hit', 'damage numbers, hit feedback');
      // abilities: a level that unlocks them, then a skill button
      await c.page.evaluate(() => window.kq!.progression!.level(8));
      await c.page.waitForTimeout(500);
      await c.tidy();
      await c.page.evaluate(() => window.kq!.combat!.spawn('nebelling', { dist: 4, count: 2, group: 'tour.nebel2', radius: 2 }));
      await c.page.waitForTimeout(800);
      await c.shot('skills', 'skill buttons visible');
      if (await c.page.getByTestId('touch-skill1').isVisible()) {
        await c.tap('touch-skill1');
        await c.page.waitForTimeout(300);
        await c.shot('skill-used', 'cooldown state');
      }
      await c.page.evaluate(() => {
        const k = window.kq!;
        k.combat!.kill();
        k.combat!.god(false);
      });
      await c.tidy();
    },
  },
  {
    id: 'level-card',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => {
        const k = window.kq!;
        const lvl = k.progression!.state().level;
        k.progression!.level(lvl + 1);
      });
      await c.page.waitForTimeout(500);
      await c.shot();
      await c.tidy();
    },
  },
  // ---- shift, travel, death ------------------------------------------------------------------------
  {
    id: 'era-shift',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => {
        const k = window.kq!;
        k.teleport(1205, -1119, 90, -4);
        void k.fx!.shift('1789');
      });
      await c.page.waitForTimeout(900);
      await c.shot('mid', 'the shift effect over the HUD');
      await c.page.waitForTimeout(3500);
      await c.tidy();
      await c.shot('1789', 'the past: lantern oil, era label');
      await c.page.evaluate(() => window.kq!.setEra('today'));
      await c.tidy();
    },
  },
  {
    id: 'travel-card',
    run: async (c) => {
      await c.tidy();
      const ok = await c.page.evaluate(() => {
        const t = window.kq!.travel;
        const p = t?.points().find((x) => !x.activated) ?? t?.points()[0];
        if (!t || !p) return false;
        t.activate(p.id);
        return true;
      });
      if (!ok) return c.na('no travel point');
      await c.page.waitForTimeout(400);
      const shown = () => c.page.evaluate(() => !!document.querySelector('.kqt-banner:not(.kqt-aside)'));
      const upAtOnce = await shown();
      await c.shot();
      if (upAtOnce) return c.tidy();
      // the banner waits while another centre card or (on a phone) a line is up: tap the lines
      // away until it shows, then shoot it
      const until = Date.now() + 20_000;
      while (!(await shown()) && Date.now() < until) {
        if (await c.page.evaluate(() => !!document.querySelector('.kqs-dlg.kqs-show'))) await c.tapSel('.kqs-dlg.kqs-show .kqs-dlg-body').catch(() => undefined);
        await c.page.waitForTimeout(700);
      }
      if (await shown()) await c.shot('shown', 'the banner once nothing holds it back');
      else c.f.notes.push('travel-card: the banner did not show within 20 s');
      await c.tidy();
    },
  },
  {
    id: 'death',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => window.kq!.story!.caught('combat', 4000));
      await c.page.waitForTimeout(900);
      await c.shot('curtain');
      await c.page.waitForTimeout(6000);
      await c.shot('wake');
      await c.tidy();
    },
  },
  {
    id: 'photo',
    run: async (c) => {
      const has = await c.page.evaluate(() => 'photo' in (window.kq as object));
      if (!has) return c.na('no kq.photo on this branch');
      type Ph = { open(): boolean; close(): void; state(): { open: boolean } };
      const isOpen = () => c.page.evaluate(() => (window.kq as unknown as { photo: Ph }).photo.state().open);
      await c.tidy();
      await c.page.evaluate(() => window.kq!.teleport(1200, -1140, 0, -2));
      await c.page.waitForTimeout(600);
      await c.shot('hud', 'the top row with the phone button');
      // the top-row phone button (real touch), else the hook
      if (await c.page.getByTestId('touch-photo').isVisible()) await c.tap('touch-photo');
      await c.page.waitForTimeout(800);
      if (!(await isOpen())) {
        c.f.notes.push('photo: a tap on touch-photo did not open photo mode; opened by kq.photo.open()');
        await c.page.evaluate(() => (window.kq as unknown as { photo: Ph }).photo.open());
        await c.page.waitForTimeout(800);
      }
      await c.shot('open', 'photo mode on touch: phone frame, status bar, touch controls');
      // the shutter is the attack button while the phone is up
      if (await c.page.getByTestId('touch-attack').isVisible()) {
        await c.tap('touch-attack');
        await c.page.waitForTimeout(1200);
        await c.shot('shutter', 'after the shutter: the photo card');
      }
      await c.page.evaluate(() => (window.kq as unknown as { photo: Ph }).photo.close());
      await c.tidy();
    },
  },
  // ---- the first minutes of K1 ---------------------------------------------------------------------
  {
    id: 'k1-card',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => {
        const k = window.kq!;
        k.skills!.grant('relief', 2, true);
        k.skills!.grant('kartograf', 1, true);
        k.story!.goto('k1');
      });
      await c.page.waitForTimeout(800);
      await c.shot('', 'chapter card „Der Hof“ at the spring');
      await c.page.waitForTimeout(2500);
      await c.tidy();
      await c.shot('hud', 'K1 opening HUD + tracker');
    },
  },
  {
    id: 'k1-court',
    run: async (c) => {
      await c.tidy();
      await c.page.evaluate(() => {
        const k = window.kq!;
        k.setEra('1789');
        k.teleport(1205, -1150, 180, -4);
      });
      await c.page.waitForTimeout(1500);
      await c.tidy();
      await c.shot('', '1789 court: NPC markers, lantern');
    },
  },
  {
    id: 'npc-talk',
    run: async (c) => {
      await c.tidy();
      const ok = await c.page.evaluate((from) => {
        const k = window.kq!;
        if (k.ctx.era.current !== '1789') k.setEra('1789');
        const n = k.npc!.list().find((f) => f.npc === 'hanne');
        if (!n) return false;
        k.teleport(from[0], from[1], 0, 0);
        const p = k.ctx.player.position;
        k.ctx.player.yaw = Math.atan2(-(n.x - p.x), -(n.z - p.z));
        k.step(2);
        return k.npc!.talk('hanne');
      }, HANNE_FROM);
      if (!ok) return c.na('Hanne not reachable');
      await c.page.waitForTimeout(600);
      await c.shot('line', 'conversation card, first line');
      await c.page.evaluate(() => window.kq!.npc!.drain());
      await c.page.waitForTimeout(300);
      await c.shot('topics', 'the choices (topics)');
      const topic = c.page.locator('[data-testid^="npc-topic-"]').first();
      if (await topic.isVisible()) {
        const b = (await topic.boundingBox())!;
        await new Finger(c.cdp, 21).tap(b.x + b.width / 2, b.y + b.height / 2);
        await c.page.waitForTimeout(500);
        await c.shot('answer');
      }
      await c.page.evaluate(() => window.kq!.npc!.close());
      await c.tidy();
    },
  },
];

// ---------------------------------------------------------------------------------------------

function selected(): State[] {
  const playable = STATES.filter((s) => !unit.phonePortrait || s.portrait);
  if (!FILTER.length) return playable;
  const want = new Set(playable.filter((s) => FILTER.some((f) => s.id === f || s.id.startsWith(f))).map((s) => s.id));
  // the new-game chain cannot start half-way: a later step brings its predecessors
  const chain = ['warning', 'name', 'tour-map'];
  for (let i = chain.length - 1; i > 0; i--) if (want.has(chain[i]!)) want.add(chain[i - 1]!);
  const list = playable.filter((s) => want.has(s.id));
  if (!list.length) throw new Error(`no state matches ${FILTER.join(',')} on ${unit.id}; states: ${playable.map((s) => s.id).join(', ')}`);
  return list;
}

/** Portrait phones: the runner hides the rotate overlay during the title-flow states (see `title`). */
let hideRotate = false;
const NOROTATE = () => {
  const st = document.createElement('style');
  st.id = 'kq-tour-norotate';
  st.textContent = 'html[data-kq-touch] .kq-rotate.kq-rotate{display:none!important}';
  document.head.append(st);
};

const nn = (s: State) => String(STATES.indexOf(s) + 1).padStart(2, '0');

test.use({
  viewport: { width: unit.width, height: unit.height },
  screen: { width: unit.width, height: unit.height },
  deviceScaleFactor: unit.dpr,
  isMobile: true,
  hasTouch: true,
  userAgent: unit.userAgent,
});

test(`mobile tour: ${unit.label}`, async ({ page }) => {
  const list = selected();
  test.setTimeout(14 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  Finger.reset();

  // ---- safe areas: CDP override if this Chromium has it, else the game's CSS variables ----------
  let safeArea: Findings['safeArea'] = 'cdp';
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { ...unit.insets } });
  } catch {
    safeArea = 'css-fallback';
  }
  const insetCss = () => {
    const i = unit.insets;
    const vars = `--kq-safe-t:${i.top}px!important;--kq-safe-r:${i.right}px!important;--kq-safe-b:${i.bottom}px!important;--kq-safe-l:${i.left}px!important;`;
    const mask = MASK
      ? `body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:2147483647;border-style:dashed;border-color:rgba(255,0,200,.8);border-width:${i.top}px ${i.right}px ${i.bottom}px ${i.left}px;box-sizing:border-box;opacity:.35}`
      : '';
    return `${safeArea === 'css-fallback' ? `:root{${vars}}` : ''}${mask}`;
  };

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // ---- findings (merged with an earlier run of the same unit when re-shooting a subset) ---------
  const file = `${OUT}/findings.json`;
  let prev: Findings | null = null;
  try {
    prev = JSON.parse(readFileSync(file, 'utf8')) as Findings;
  } catch {
    prev = null;
  }
  const f: Findings = { unit, gpu: '?', safeArea, quality: null, startedAt: new Date().toISOString(), shots: [], states: {}, notes: [] };
  const ids = new Set(list.map((s) => s.id));
  if (prev && FILTER.length) {
    f.shots = prev.shots.filter((s) => !ids.has(s.state));
    f.states = Object.fromEntries(Object.entries(prev.states).filter(([k]) => !ids.has(k)));
    f.notes = (prev.notes ?? []).filter((n) => {
      const tag = /^\[([\w-]+)\] /.exec(n)?.[1];
      return !!tag && !ids.has(tag);
    });
  }
  const save = () => writeFileSync(file, JSON.stringify(f, null, 2));

  // ---- boot: the title flow if any title state is wanted, else straight into a new game ---------
  const wantTitle = list.some((s) => s.title);
  const boot = async () => {
    await page.goto(wantTitle ? './?nosave&fresh' : './?notitle&nosave&fresh');
    await page.waitForFunction(() => !!window.kq?.ctx && !!window.kq.story && !!window.kq.quests && !!window.kq.combat && !!window.kq.npc, null, { timeout: 180_000 });
    // did the CDP override reach env(safe-area-inset-*)? (the game reads it as --kq-safe-*)
    if (safeArea === 'cdp') {
      const i = unit.insets;
      const got = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        document.body.append(probe);
        const cs = getComputedStyle(probe);
        const r = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v));
        probe.remove();
        return r;
      });
      if (got.join() !== [i.top, i.right, i.bottom, i.left].join()) {
        console.log(`[${unit.id}] CDP safe-area override not applied (env() = ${got.join('/')}); CSS fallback`);
        safeArea = 'css-fallback';
        f.safeArea = safeArea;
      }
    }
    const css = insetCss();
    if (css) await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: '.kq-debug,.kq-perf,[data-testid=perf-hud],[data-testid=debug-panel]{display:none!important}' });
    await page.evaluate(QUEST_PLAY);
    if (hideRotate) await page.evaluate(NOROTATE);
    f.gpu = await page.evaluate(() => {
      const gl = window.kq!.ctx.renderer.getContext();
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      return e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '?';
    });
    f.quality = await page.evaluate(() => {
      try {
        return String(window.kq!.fx!.state().quality);
      } catch {
        return null;
      }
    });
    console.log(`[${unit.id}] GPU: ${f.gpu} · quality ${f.quality} · safe area ${safeArea}`);
    if (/swiftshader|software|llvmpipe/i.test(f.gpu) && !ALLOW_SOFT) throw new Error(`software renderer (${f.gpu}): not the real GPU; set KQ_MOBILE_ALLOW_SOFT=1 to go on anyway`);
    await page.evaluate(() => {
      window.kq!.ctx.state.mutable.flags['barks.quiet'] = true;
    });
    if (!wantTitle) {
      await page.evaluate(() => {
        const k = window.kq!;
        k.story!.start('Alex');
        k.ctx.ui.modals.closeAll();
      });
    }
  };
  await boot();
  save();

  const c: Ctx = {
    page,
    cdp,
    f,
    shot: async () => undefined,
    tap: async (testid, finger = 1) => {
      const loc = page.getByTestId(testid).first();
      // Scroll the control into reach before tapping.
      await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
      let b = await loc.boundingBox({ timeout: 8000 });
      if (!b) throw new Error(`tap: ${testid} has no box`);
      if (b.y + b.height / 2 > unit.height || b.y + b.height / 2 < 0 || b.x + b.width / 2 > unit.width || b.x + b.width / 2 < 0) {
        f.notes.push(`${testid}: off-screen (centre ${Math.round(b.x + b.width / 2)}/${Math.round(b.y + b.height / 2)} in ${unit.width}×${unit.height}); scrolled into view to tap it`);
        await loc.scrollIntoViewIfNeeded();
        b = (await loc.boundingBox())!;
      }
      await new Finger(cdp, finger).tap(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(150);
    },
    tapSel: async (selector, finger = 1) => {
      const b = await page.locator(selector).last().boundingBox({ timeout: 8000 });
      if (!b) throw new Error(`tap: ${selector} has no box`);
      await new Finger(cdp, finger).tap(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(150);
    },
    scrollShot: async () => undefined,
    tidy: async () => {
      await page.evaluate(() => {
        const k = window.kq!;
        for (const m of [...((k.ctx.ui.modals as unknown as { stack: { close(): void }[] }).stack ?? [])]) m.close();
        k.story?.finishTyping();
        if (k.ctx.pause.paused) k.ctx.ui.modals.closeAll();
      });
      await page.waitForTimeout(120);
    },
    na: () => undefined,
  };

  /** Before the first gameplay state: through the new-game screens if the title is still up. */
  const ensurePlaying = async () => {
    if (!(await page.getByTestId('title').isVisible().catch(() => false))) return;
    for (const tid of ['title-new', 'warning-accept', 'name-confirm', 'start-tour']) {
      const el = page.getByTestId(tid);
      await el.waitFor({ state: 'visible', timeout: 60_000 });
      await c.tap(tid);
    }
    await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
    await page.evaluate(QUEST_PLAY);
  };

  for (const s of list) {
    const t0 = Date.now();
    const notes0 = f.notes.length;
    if (!s.title) await ensurePlaying().catch((e) => console.log(`  ✗ new game: ${String((e as Error).message).split('\n')[0]}`));
    let na: string | undefined;
    let sub = 0;
    c.na = (reason) => {
      na = reason;
    };
    c.shot = async (name?: string, note?: string) => {
      const key = name ? `-${name}` : sub++ ? `-${sub}` : '';
      const png = `${OUT}/${nn(s)}-${s.id}${key}.png`;
      await page.waitForTimeout(SETTLE);
      const frames = await page.evaluate(sampleFrames, SAMPLE);
      const perf = await page.evaluate(() => {
        try {
          const p = window.kq!.perf();
          return { fps: p.fps, frameAvg: p.frameAvg, frameP95: p.frameP95, frameMax: p.frameMax, cpuAvg: p.cpuAvg, gpuAvg: p.gpuAvg, calls: p.calls };
        } catch {
          return null;
        }
      });
      const ui = await page.evaluate(measureUi, unit.insets);
      await page.screenshot({ path: png, timeout: 60_000 });
      f.shots.push({ file: png.replace(`${OUT}/`, ''), state: s.id, sub: name ?? null, frames, perf, ui, note });
      save();
      const worst = ui.issues.filter((i) => i.sev === 'S1').length;
      console.log(`  ${png.split('/').pop()} · p95 ${frames.p95} ms · ${ui.issues.length} issues (${worst} S1)`);
    };
    c.scrollShot = async (name: string) => {
      const layer = page.locator('.kq-modal-layer').last();
      if (!(await layer.isVisible().catch(() => false))) return;
      // a real swipe first: does the page scroll under a finger at all?
      const before = await page.evaluate(() => {
        const top = [...document.querySelectorAll('.kq-modal-layer')].at(-1);
        const sc = top ? [top, ...top.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) : [];
        return sc.map((e) => e.scrollTop);
      });
      if (!before.length) return; // nothing to scroll
      const b = (await page.locator('.kq-modal-layer .kq-modal').last().boundingBox()) ?? { x: 0, y: 0, width: unit.width, height: unit.height };
      const fx = b.x + b.width / 2;
      const f1 = new Finger(cdp, 31);
      for (let i = 0; i < 3; i++) {
        await f1.start(fx, Math.min(unit.height - 8, b.y + b.height * 0.8));
        await f1.move(fx, Math.max(8, b.y + b.height * 0.2), 8);
        await f1.end();
      }
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => {
        const top = [...document.querySelectorAll('.kq-modal-layer')].at(-1);
        const sc = top ? [top, ...top.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) : [];
        return sc.map((e) => e.scrollTop);
      });
      const swiped = after.some((v, i) => v > (before[i] ?? 0) + 4);
      await page.evaluate(scrollModalToBottom);
      await c.shot(`${name ? name + '-' : ''}bottom`, swiped ? 'scrolled by touch' : 'touch swipe did NOT scroll (scroll trap?); scrolled by script');
    };

    try {
      console.log(`[${unit.id}] ${nn(s)} ${s.id}`);
      await s.run(c);
      f.states[s.id] = { ok: true, ms: Date.now() - t0, ...(na ? { na } : {}) };
    } catch (e) {
      const msg = String((e as Error).message).split('\n')[0]!;
      console.log(`  ✗ ${s.id}: ${msg}`);
      f.states[s.id] = { ok: false, ms: Date.now() - t0, error: msg };
      await page.screenshot({ path: `${OUT}/${nn(s)}-${s.id}-error.png` }).catch(() => undefined);
      Finger.reset();
      // the title flow cannot be resumed half-way: later title states would fail anyway
      if (s.title) {
        await boot().catch(() => undefined);
      } else {
        await c.tidy().catch(() => boot());
      }
    }
    // tag this state's notes, so a later subset run can replace them
    for (let i = notes0; i < f.notes.length; i++) if (!f.notes[i]!.startsWith('[')) f.notes[i] = `[${s.id}] ${f.notes[i]}`;
    save();
  }
  if (errors.length) f.states['_pageerrors'] = { ok: false, ms: 0, error: errors.slice(0, 20).join(' | ') };
  save();
  const failed = Object.entries(f.states).filter(([, v]) => !v.ok);
  console.log(`[${unit.id}] ${f.shots.length} shots, ${failed.length} failed states → ${OUT}`);
});
