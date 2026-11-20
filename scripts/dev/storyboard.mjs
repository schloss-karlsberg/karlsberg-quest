// Storyboard capture: node scripts/dev/storyboard.mjs [baseUrl] [--only id,id] [--out dir] [--quality 72] [--list]
//
// Drives headless Chromium on the REAL GPU (ANGLE Metal) through the `window.kq` debug API and saves
// one JPEG (1280×720) per storyboard shot into docs/storyboard/img/. It builds nothing: build the game,
// serve it (vite preview on a free port), pass the URL. See docs/storyboard/README.md.
//
// Every shot stages its scene directly: era, time of day (`kq.story.look`), a teleport with a third-
// person framing (player in shot, facing the subject), ghosts (`kq.npc`), enemies (`kq.combat`,
// frozen in place), the pack (`kq.hunt`), the menagerie, fx set pieces (era shift, fire, Steinfraß,
// fireworks, K3 stage) and the staged endings. A few shots jump the story to their beat
// (`kq.story.goto`) where that is cheap and sets things up (p1, p3q, k2_1, k3_3, k4_3); between shots
// the story is parked on a quiet beat and switched off, so no beat reacts to the next staging.
// The HUD and debug overlays are hidden unless a shot asks for UI (`ui`: the dialogue card, the
// Bussole, the ending choice). Shot order matters a little: the staged endings run last.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const base = argv.find((a) => /^https?:/.test(a)) ?? 'http://localhost:5370/';
const outDir = resolve(opt('out', resolve(ROOT, 'docs/storyboard/img')));
const quality = Number(opt('quality', '72'));
const only = opt('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const QUERY = '?debug&nosave&fresh&manual&q=high';

// ---------------------------------------------------------------------------------------------
// In-page helpers (installed once per page load as window.__sb). `k` = window.kq.
// ---------------------------------------------------------------------------------------------
const HELPERS = () => {
  const k = window.kq;
  const deg = Math.PI / 180;
  const h = {
    /** Close modals / cards, finish typing. */
    tidy() {
      for (const m of [...(k.ctx.ui.modals.stack || [])]) m.close();
      k.story?.finishTyping();
    },
    /** Game seconds pass in half-second steps (cards closed in between). */
    run(seconds) {
      for (let t = 0; t < seconds; t += 0.5) {
        h.tidy();
        k.step(30);
      }
    },
    /** Compass degrees (0 north, 90 east) from a/b to x/z. */
    bearing(ax, az, x, z) {
      return ((Math.atan2(x - ax, -(z - az)) / deg) % 360 + 360) % 360;
    },
    /** Put the player at x/z in `era`, looking at tx/tz (or `yaw`) turned by `turn` degrees, camera boom `zoom` m. */
    place({ era, x, z, yaw, tx, tz, turn = 0, pitch = -6, zoom = 3.6, fly = 0 }) {
      if (era && k.ctx.era.current !== era) k.setEra(era);
      const p = k.ctx.player;
      p.setFlying(fly > 0);
      const y = (tx !== undefined ? h.bearing(x, z, tx, tz) : (yaw ?? 0)) + turn;
      k.teleport(x, z, y, pitch);
      if (fly > 0) p.position.y = k.ctx.world.heightAt(x, z) + fly;
      p.rig.zoom = zoom;
      k.step(4);
    },
    /** Point x/z `d` m from the player along its view, `a` degrees to the right. */
    ahead(d, a = 0) {
      const p = k.ctx.player;
      const yaw = -p.yaw + a * deg; // compass radians
      return { x: p.position.x + Math.sin(yaw) * d, z: p.position.z - Math.cos(yaw) * d };
    },
    /** Park the story on a quiet beat and switch it off (no beat reacts to the next staging). */
    idle() {
      k.story.goto('k1', 'k1_6');
      k.ctx.state.slice('story').active = false;
    },
    /** Everything the previous shot staged goes away. */
    async reset() {
      // a staged ending gives the camera back
      if (k.story.stage().active) {
        k.story.stageHold(null);
        k.story.stageSkip();
        await h.frames(30);
      }
      h.tidy();
      // the previous shot's enemies are undone first (a story jump would only stash them: they
      // came back later, a boss at full strength)
      const c = k.combat;
      c?.freeze(false);
      const alive = c?.enemies().length ?? 0;
      c?.kill();
      c?.god(true);
      for (let i = 0; i < 12 && c?.enemies().length; i++) {
        c.kill();
        k.step(30);
      }
      // a boss's remains come apart on render frames
      if (alive) await h.frames(150);
      h.idle();
      // a held era shift runs out (its clock is real time), and its afterglow fades
      k.fx?.freeze(false);
      if (k.fx?.state().shift.active) {
        for (let i = 0; i < 600 && k.fx.state().shift.active; i++) await h.frames(1);
        await h.frames(120);
      }
      // a Quelle touch scene ends on game time
      k.quelle?.hold(null);
      for (let i = 0; i < 20 && k.quelle?.info().scene !== null; i++) k.step(30);
      k.npc?.despawn('*');
      k.menagerie?.clear();
      k.hunt?.freeze(false);
      k.hunt?.stop();
      k.fx?.fire(false);
      k.fx?.oblivion(false);
      k.fx?.k3.phase(null);
      k.fx?.k3.torch(null);
      k.stage?.hold(false);
      k.scenery?.fireworks.stop();
      k.setScanMode(0);
      k.survey?.map(0, true);
      void k.tools?.xray(false);
      k.lantern?.toggle(false);
      k.ctx.player.setFlying(false);
      if (k.ctx.player.stance !== 'stand') k.ctx.player.setStance('stand');
      k.story?.look('day');
      for (const e of ['1789', '1793-02', '1793-07', '1796']) k.story?.look('day', e);
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'off' } });
      k.step(30);
      h.tidy();
    },
    /** Spawn a group, freeze it, place its members on an arc in front of the player facing it. */
    enemies(kind, { n = 1, d = 7, spread = 24, a = 0, boss = false, tier, group, era, freeze = true, windup, steps = 30 } = {}) {
      const c = k.combat;
      const g = c.spawn(kind, { dist: d, angle: a, count: n, boss, tier, group: group ?? `sb.${kind}.${Math.random().toString(36).slice(2, 6)}`, era, radius: 2 });
      k.step(steps);
      if (freeze) c.freeze(true);
      const list = c.enemies().filter((e) => e.group === g);
      list.forEach((e, i) => {
        const off = n > 1 ? (i / (n - 1) - 0.5) * spread : 0;
        const at = h.ahead(d + (i % 2) * 0.8, a + off);
        c.place(e.id, at.x, at.z, true);
      });
      if (windup) c.windup(g, windup, 0.6);
      k.step(2);
      return g;
    },
    /** Place ghosts and wait (real frames) until they faded in. */
    async npcs(list) {
      for (const n of list) k.npc.spawn(n);
      for (let i = 0; i < 400 && k.npc.list().some((n) => n.alpha < 0.97); i++) await new Promise((r) => requestAnimationFrame(r));
    },
    /** Real frames pass (things that ease on render frames). */
    async frames(n) {
      for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
    },
    /** A boss at x/z: it notices the player and reveals itself (arms up, flare); held there. */
    boss(kind, x, z, steps = 70) {
      const c = k.combat;
      c.spawn(kind, { x, z, boss: true, group: `sb.boss.${kind}` });
      k.step(steps);
      c.freeze(true);
      k.step(2);
      const b = c.enemies().find((e) => e.group === `sb.boss.${kind}`);
      return b ? { state: b.state, x: Math.round(b.x), z: Math.round(b.z) } : null;
    },
    /** The pack around the player, frozen; spots = [distance, degrees right] per agent (0 = Pikeur if any). */
    hounds(spots, { pikeur = false, seed = 3, steps = 90 } = {}) {
      const p = k.ctx.player.position;
      k.hunt.start({ x: p.x, z: p.z, radius: 140, intensity: 0.5, hounds: spots.length - (pikeur ? 1 : 0), pikeur, seed });
      k.hunt.freeze(true);
      spots.forEach(([d, a], i) => k.hunt.placeInView(i, d, a, true));
      k.step(steps);
      return k.hunt.state()?.agents.length;
    },
    /** A spoken line on the dialogue card (speaker id as in the content packs). */
    async say(speaker, text) {
      k.story.say(speaker, text);
      k.step(6);
      await h.frames(20);
      k.story.finishTyping();
      await h.frames(45);
      k.story.finishTyping();
    },
    /** Time of day: today, or a past era like the story's `look` action. */
    look(time, era) {
      if (era && era !== 'today') k.story.look(time, era);
      else k.story.look(time);
      k.step(2);
    },
    /** Put the player `d` m in front of x/z (on the line from `fx`/`fz`), facing it. */
    faceAt(x, z, d, fx, fz, o = {}) {
      const dx = fx - x;
      const dz = fz - z;
      const l = Math.hypot(dx, dz) || 1;
      h.place({ ...o, x: x + (dx / l) * d, z: z + (dz / l) * d, tx: x, tz: z });
    },
  };
  window.__sb = h;
};

// ---------------------------------------------------------------------------------------------
// The shots. `run(k, h)` is serialised into the page (no closures). `story` starts a story first.
// ---------------------------------------------------------------------------------------------
const SHOTS = [
  // ==== Story: Prologue "Vermessung" (today) =================================================
  {
    id: 'p1-feldstation',
    run: (k, h) => {
      k.story.goto('prolog', 'p1');
      h.place({ era: 'today', x: 763.5, z: -897.5, tx: 760.6, tz: -910.4, pitch: -4, zoom: 4.2 });
      h.run(1);
    },
  },
  {
    id: 'p2-damm',
    run: (k, h) => {
      h.place({ era: 'today', x: 798, z: -896, tx: 819, tz: -875, pitch: -14, zoom: 6, fly: 4 });
      k.setScanMode(2);
      k.step(20);
    },
  },
  {
    // Laub wakes in the Bussole at the Orangerie wall: his first line on the card
    id: 'p3-orangeriemauer',
    ui: '.kqs-dlg, .kqs-bussole',
    run: async (k, h) => {
      h.place({ era: 'today', x: 1214, z: -958, tx: 1237, tz: -966, pitch: 2, zoom: 4.5 });
      k.ctx.state.mutable.flags['story.compass'] = true;
      k.ctx.events.emit('story:cue', { id: 'bussole:jolt', data: { hold: 4 } });
      await h.say('laub', 'Fünf Meter dreißig. Für Orangen.');
    },
  },
  {
    id: 'p3q-quelle',
    run: (k, h) => {
      k.story.goto('prolog', 'p3q');
      h.run(2);
      h.place({ era: 'today', x: 1056.8, z: -831.0, tx: 1061.6, tz: -834.2, pitch: -10, zoom: 3.4 });
      h.run(1);
    },
  },
  {
    id: 'p3q-touch',
    run: (k, h) => {
      h.place({ era: 'today', x: 1058.2, z: -831.4, tx: 1060.6, tz: -834.4, pitch: -16, zoom: 2.6 });
      k.quelle.touch();
      k.step(60);
      k.quelle.hold(1.6);
      k.step(2);
    },
  },
  {
    id: 'p3r-brunnenstube',
    run: (k, h) => {
      h.place({ era: '1789', x: 1055.6, z: -831.6, tx: 1061, tz: -834.5, pitch: -6, zoom: 4.5 });
      k.step(30);
    },
  },
  {
    id: 'p4-ehrenhof',
    run: (k, h) => {
      h.place({ era: 'today', x: 1192, z: -1108, tx: 1262, tz: -1126, pitch: -18, zoom: 6, fly: 5 });
      k.setScanMode(2);
      k.step(20);
    },
  },
  {
    id: 'p5-hohlweg',
    run: (k, h) => {
      h.place({ era: 'today', x: 1172, z: -1220, yaw: 180, pitch: -8, zoom: 4 });
      k.step(20);
    },
  },
  {
    id: 'p6-eiskeller',
    run: (k, h) => {
      h.place({ era: 'today', x: 1501, z: -1287, tx: 1508, tz: -1296, pitch: -14, zoom: 4 });
      h.enemies('nebelling', { n: 4, d: 6, spread: 60, tier: 1 });
    },
  },
  {
    // back at the Ehrenhof the Bussole springs open and a scorched page rises from it
    id: 'p7-punktwolke',
    ui: '.kqs-bussole, .kqs-dlg',
    run: async (k, h) => {
      h.place({ era: 'today', x: 1200, z: -1112, tx: 1262, tz: -1126, pitch: -4, zoom: 4 });
      k.ctx.state.mutable.flags['story.compass'] = true;
      k.ctx.events.emit('story:cue', { id: 'bussole:open' });
      k.step(50);
      await h.say('laub', 'Hunde.');
    },
  },
  {
    id: 'p8-regeln',
    ui: '.kqs-dlg, .kqs-bussole',
    run: async (k, h) => {
      h.place({ era: 'today', x: 1186, z: -1104, tx: 1216, tz: -1114, pitch: -2, zoom: 4.5 });
      k.ctx.state.mutable.flags['story.compass'] = true;
      await h.say('laub', 'Erstens: Sie können nur dort hinüber, wo die Nadel steht. Dort erinnert sich der Boden. Taste Q.');
    },
  },
  {
    id: 'p9-wechsel',
    run: (k, h) => {
      h.place({ era: 'today', x: 1200, z: -1112, tx: 1262, tz: -1126, pitch: 4, zoom: 4 });
      void k.fx.shift('1789');
      k.fx.shiftAt(2.4);
      k.step(2);
    },
  },
  {
    id: 'p9b-sommer-1789',
    run: (k, h) => {
      h.place({ era: '1789', x: 1200, z: -1114, tx: 1262, tz: -1126, pitch: 0, zoom: 3.6 });
      h.enemies('streuner', { n: 2, d: 5, spread: 44, steps: 150 });
    },
  },
  {
    id: 'p10-abend',
    run: (k, h) => {
      h.look('dusk');
      h.place({ era: 'today', x: 765.5, z: -898.5, tx: 760.6, tz: -910.4, pitch: -2, zoom: 4.2 });
      k.lantern.toggle(true);
      k.step(20);
    },
  },
  {
    id: 'p11-nacht',
    run: (k, h) => {
      h.look('night');
      h.place({ era: 'today', x: 764.5, z: -902, tx: 760.6, tz: -910.4, pitch: 0, zoom: 3.6 });
      k.lantern.toggle(true);
      k.stage.cue('frost-breath', { s: 9 });
      k.step(60);
    },
  },

  // ==== Story: Chapter 1 "Der Hof" (summer 1789) =============================================
  {
    id: 'k1-ankunft',
    run: (k, h) => {
      h.place({ era: '1789', x: 1190, z: -1113, tx: 1262, tz: -1124, pitch: -2, zoom: 4.5 });
      k.step(30);
    },
  },
  {
    id: 'k1-registratur',
    run: async (k, h) => {
      h.place({ era: '1789', x: 1200, z: -1140, yaw: 180 });
      k.interiors.enter('B03.1.eg-registratur', { u: 0.25, v: 0.5, toU: 0.75, toV: 0.5 });
      k.step(10);
      const p = k.ctx.player.position;
      const at = h.ahead(3, 26);
      await h.npcs([{ npc: 'soll', x: at.x, z: at.z, era: '1789', yaw: h.bearing(at.x, at.z, p.x, p.z) }]);
      k.ctx.player.rig.zoom = 2.2;
      k.step(20);
    },
  },
  {
    id: 'k1-schuldbuch',
    run: (k, h) => {
      h.place({ era: '1789', x: 1309, z: -1228, tx: 1298, tz: -1231, turn: -14, pitch: 6, zoom: 4.2 });
      return h.boss('schuldbuch', 1298, -1231);
    },
  },
  {
    id: 'k1-zwinger',
    run: async (k, h) => {
      h.look('dusk', '1789');
      h.place({ era: '1789', x: 1166, z: -1566, tx: 1200, tz: -1574, pitch: -2, zoom: 3.2 });
      const p = k.ctx.player.position;
      const at = h.ahead(3.4, 16);
      await h.npcs([{ npc: 'jost', x: at.x, z: at.z, era: '1789', yaw: h.bearing(at.x, at.z, p.x, p.z) }]);
    },
  },
  {
    id: 'k1-karlslust',
    run: (k, h) => {
      h.look('dusk', '1789');
      h.place({ era: '1789', x: 1905, z: 70, tx: 1935, tz: 87, pitch: -4, zoom: 4.5 });
      k.menagerie.spawnInView('cassowary', 4.2, 20, { id: 'kasuar' });
      k.step(30);
      k.menagerie.freeze(true);
    },
  },
  {
    id: 'k1-irrlichter',
    run: (k, h) => {
      h.look('night', '1789');
      h.place({ era: '1789', x: 1842, z: 240, tx: 1852, tz: 248, pitch: 6, zoom: 3.6 });
      k.lantern.toggle(true);
      h.enemies('irrlicht', { n: 5, d: 6, spread: 70, tier: 1 });
    },
  },
  {
    id: 'k1-rondell',
    run: (k, h) => {
      if (k.ctx.era.current !== '1789') k.setEra('1789');
      k.story.look('night', '1789');
      k.step(2);
      k.ctx.events.emit('echo:start', { id: 'clue.k1.feuerwerk' });
      k.teleport(1815, 348, 92, 9);
      k.step(424);
      k.teleport(1872, 350, 92, 26);
      k.ctx.player.rig.zoom = 4;
      k.step(10);
      k.scenery.fireworks.phase('climax');
      k.step(150);
      return k.scenery.fireworks.state();
    },
  },

  // ==== Story: Chapter 2 "Die Flucht" (night of 9/10 February 1793) ===========================
  {
    id: 'k2-parkzaun',
    run: (k, h) => {
      k.story.goto('k2', 'k2_1');
      h.run(1);
      h.place({ era: '1793-02', x: 1677, z: -402, tx: 1672, tz: -408, pitch: -8, zoom: 3.4 });
      k.lantern.toggle(true);
      h.run(1);
    },
  },
  {
    id: 'k2-orangerie',
    run: (k, h) => {
      h.place({ era: '1793-02', x: 1206, z: -960, tx: 1240, tz: -968, pitch: 4, zoom: 4.5 });
      k.lantern.toggle(true);
      k.scenery.windows('KB-B10', true, '1793-02', 1);
      k.step(20);
    },
  },
  {
    id: 'k2-wachhaus',
    run: (k, h) => {
      h.place({ era: '1793-02', x: 1190, z: -1129, tx: 1178, tz: -1122, pitch: 4, zoom: 3.6 });
      k.lantern.toggle(true);
      h.enemies('irrlicht', { n: 4, d: 6, spread: 60, tier: 2 });
    },
  },
  {
    id: 'k2-schloss',
    run: (k, h) => {
      h.place({ era: '1793-02', x: 1222, z: -1120, tx: 1262, tz: -1126, pitch: 6, zoom: 4.2 });
      k.lantern.toggle(true);
      const n = k.scenery.windows('KB-B01', true, '1793-02', 0.35);
      k.step(20);
      return n;
    },
  },
  {
    id: 'k2-abfahrt',
    run: async (k, h) => {
      h.place({ era: '1793-02', x: 1213, z: -1117, tx: 1201, tz: -1114, pitch: 0, zoom: 3 });
      k.lantern.toggle(true);
      const p = k.ctx.player.position;
      const a = h.ahead(3.4, -26);
      const b = h.ahead(3.8, 24);
      await h.npcs([
        { npc: 'hanne', x: a.x, z: a.z, era: '1793-02', yaw: h.bearing(a.x, a.z, p.x, p.z) },
        { npc: 'jost', x: b.x, z: b.z, era: '1793-02', yaw: h.bearing(b.x, b.z, p.x, p.z) },
      ]);
    },
  },
  {
    id: 'k2-pikeur',
    run: (k, h) => {
      h.place({ era: '1793-02', x: 817, z: -877, tx: 826, tz: -868, turn: -16, pitch: 6, zoom: 4 });
      k.lantern.toggle(true);
      return h.boss('pikeur', 826, -868);
    },
  },

  // ==== Story: Chapter 3 "Die Nacht" (Sunday 28 July 1793) ==================================
  // (the fire night's scenery fire is switched off for the shots before the torch)
  {
    id: 'k3-nachmittag',
    run: (k, h) => {
      h.place({ era: '1793-07', x: 1203, z: -1118, yaw: 95, pitch: 2, zoom: 4.2 });
      k.fx.fire(false);
      h.look('dusk', '1793-07');
      k.fx.k3.phase('afternoon');
      k.fx.k3.clock(20);
      k.step(30);
    },
  },
  {
    id: 'k3-galerie',
    run: (k, h) => {
      h.place({ era: '1793-07', x: 1225, z: -1205, yaw: 90 });
      k.fx.fire(false);
      h.look('dusk', '1793-07');
      const ok = k.interiors.enter('B06.1.bildergalerie', { u: 0.08, v: 0.5, toU: 0.9, toV: 0.5 });
      k.ctx.player.rig.zoom = 3;
      k.step(30);
      return ok;
    },
  },
  {
    id: 'k3-strohmann',
    run: (k, h) => {
      h.look('dusk', '1793-07');
      h.place({ era: '1793-07', x: 1203, z: -1105, tx: 1214, tz: -1110, turn: -12, pitch: 10, zoom: 4.5 });
      k.fx.fire(false);
      k.fx.k3.phase('dusk');
      k.step(4);
      return h.boss('strohmann', 1214, -1110);
    },
  },
  {
    id: 'k3-fackel',
    run: (k, h) => {
      h.look('dusk', '1793-07');
      h.place({ era: '1793-07', x: 1214, z: -1108, yaw: 72, pitch: 6, zoom: 4 });
      k.fx.fire(false);
      k.fx.k3.phase('dusk');
      k.fx.k3.torch(-1, 1);
      k.step(10);
      k.fx.k3.torch(3.2);
      k.step(2);
    },
  },
  {
    id: 'k3-festsaal',
    run: (k, h) => {
      k.story.goto('k3', 'k3_3');
      k.setEra('1793-07');
      k.step(4);
      k.ctx.events.emit('threat:configure', { kind: 'fire', active: true, seconds: 300 });
      k.ctx.state.mutable.inventory.clues.push('clue.k3.fackel');
      k.interiors.enter('B01.2.og-festsaal', { u: 0.5, v: 0.3 });
      k.step(6);
      for (let i = 0; i < 40 && !k.interiors.festsaal().active; i++) k.step(30);
      k.step(240);
      k.story.flush();
      const hanne = k.npc.list().find((n) => n.npc === 'hanne');
      if (hanne) {
        const p = k.ctx.player.position;
        k.ctx.player.yaw = Math.atan2(-(hanne.x - p.x), -(hanne.z - p.z));
        k.ctx.player.pitch = -0.1;
        k.ctx.player.rig.zoom = 2.4;
        k.step(4);
      }
      k.ctx.state.slice('story').active = false;
      return { hanne: !!hanne, fest: k.interiors.festsaal().active };
    },
  },
  {
    id: 'k3-garten',
    run: async (k, h) => {
      k.fx.fire(true, { seconds: 300, clock: 60 });
      k.fx.k3.phase('fire');
      h.place({ era: '1793-07', x: 1272, z: -1303, yaw: 180, pitch: 10, zoom: 4.2 });
      k.fx.fireTime(150);
      await h.npcs([
        { npc: 'hanne', x: 1269.5, z: -1297, era: '1793-07', yaw: 0 },
        { npc: 'soll', x: 1274.5, z: -1298, era: '1793-07', yaw: 340 },
      ]);
      k.step(60);
    },
  },
  {
    id: 'k3-zwinger',
    run: (k, h) => {
      k.fx.fire(true, { seconds: 300, clock: 150 });
      h.place({ era: '1793-07', x: 1257, z: -1576, yaw: 0, pitch: 2 });
      k.hunt.configure({
        active: true, mode: 'kennel', hounds: 7, pikeur: false, intensity: 0.4, sight: 14, center: { x: 1222, z: -1572 }, radius: 12,
        target: { x: 1220, z: -1572 }, via: [{ x: 1252, z: -1579 }, { x: 1272, z: -1604 }, { x: 1300, z: -1650 }], seed: 53,
      });
      k.step(20);
      const g = k.hunt.kennel();
      if (g) k.ctx.player.yaw = -Math.atan2(g.x - 1257, -(g.z + 1576));
      k.step(30);
      k.press('KeyE', 1);
      k.step(Math.round(60 * 1.7));
    },
  },

  // ==== Story: Chapter 4 "Der Steinbruch" (1796 → 1840 → today) ==============================
  {
    id: 'k4-taleingang',
    run: (k, h) => {
      h.place({ era: '1796', x: 525, z: -896, tx: 505, tz: -901, pitch: 2, zoom: 4.5 });
      h.enemies('steinfresser', { n: 3, d: 9, spread: 40, tier: 4 });
    },
  },
  {
    id: 'k4-westblick',
    run: (k, h) => {
      k.story.goto('k4', 'k4_3');
      h.run(1);
      h.place({ era: '1796', x: 214, z: -900, yaw: 226, turn: -14, pitch: 2, zoom: 4 });
      h.run(2);
      return { convoy: k.scenery.convoy(), hohenburg: k.scenery.hohenburg() };
    },
  },
  {
    id: 'k4-baumagazin',
    run: async (k, h) => {
      h.place({ era: '1796', x: 486, z: -846, tx: 505, tz: -830, pitch: 2, zoom: 3.6 });
      const p = k.ctx.player.position;
      const a = h.ahead(4.2, -10);
      const b = h.ahead(5, 14);
      await h.npcs([
        { npc: 'soll', x: a.x, z: a.z, era: '1796', yaw: h.bearing(a.x, a.z, p.x, p.z) },
        { npc: 'peter', x: b.x, z: b.z, era: '1796', yaw: h.bearing(b.x, b.z, p.x, p.z) },
      ]);
    },
  },
  {
    id: 'k4-steinbrecher',
    run: (k, h) => {
      h.place({ era: '1796', x: 1206, z: -1111, tx: 1224, tz: -1116, turn: -12, pitch: 8, zoom: 5 });
      return h.boss('steinbrecher', 1224, -1116);
    },
  },
  {
    id: 'k4-steinfrass',
    run: (k, h) => {
      h.place({ era: '1796', x: 1200, z: -1112, yaw: 92, pitch: 2, zoom: 4.2 });
      k.ctx.events.emit('threat:configure', { kind: 'oblivion', active: true, seconds: 120 });
      k.fx.oblivionT(0.45);
      k.step(90);
    },
  },
  {
    id: 'k4-meute',
    run: (k, h) => {
      h.look('night');
      h.place({ era: 'today', x: 1380, z: -1474, yaw: 270, pitch: 0, zoom: 3.6 });
      k.lantern.toggle(true);
      h.hounds([[6, -28], [7, 22], [9, -8], [11, 10], [5.5, 50], [6.5, -55]]);
    },
  },
  {
    id: 'k4-stellen',
    run: (k, h) => {
      h.look('night');
      h.place({ era: 'today', x: 1214, z: -1569, yaw: 30, pitch: -26, zoom: 5.5 });
      k.ctx.player.setStance('prone');
      k.lantern.toggle(true);
      k.ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'lie', n: 6, x: 1214, z: -1569, r: 4.5, face: 30 } });
      k.step(30);
    },
    wait: 3600,
  },
  {
    id: 'k4-jost',
    run: async (k, h) => {
      h.look('dawn');
      h.place({ era: 'today', x: 1213.6, z: -1567.8, tx: 1219, tz: -1566, turn: -14, pitch: 0, zoom: 3 });
      k.ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'rest', n: 5, x: 1216, z: -1571, r: 5, face: 30, near: { x: 1218.4, z: -1565.2 }, nearHeading: 120 } });
      await h.npcs([{ npc: 'pikeur', x: 1219, z: -1566, era: 'today', yaw: 220 }]);
      k.step(60);
    },
  },

  // ==== Places: era variants not already in the story ======================================
  {
    id: 'pl-quelle-1793-02',
    run: (k, h) => {
      h.place({ era: '1793-02', x: 1056.8, z: -831.0, tx: 1061.6, tz: -834.2, pitch: -8, zoom: 3.8 });
      k.lantern.toggle(true);
      k.step(30);
    },
  },
  {
    id: 'pl-quelle-1793-07',
    run: (k, h) => {
      h.place({ era: '1793-07', x: 1056.8, z: -831.0, tx: 1061.6, tz: -834.2, pitch: -8, zoom: 3.8 });
      k.step(30);
    },
  },
  {
    id: 'pl-quelle-1796',
    run: (k, h) => {
      h.place({ era: '1796', x: 1056.8, z: -831.0, tx: 1061.6, tz: -834.2, pitch: -8, zoom: 3.8 });
      k.step(30);
    },
  },
  {
    id: 'pl-orangerie-1789',
    run: (k, h) => {
      h.place({ era: '1789', x: 1276, z: -985, tx: 1245, tz: -968, pitch: 2, zoom: 4.5 });
      k.step(30);
    },
  },
  {
    id: 'pl-eiskeller-1789',
    run: (k, h) => {
      h.place({ era: '1789', x: 1496, z: -1282, tx: 1508, tz: -1296, pitch: -4, zoom: 4.5 });
      k.step(30);
    },
  },

  // ==== Cast & creatures ===================================================================
  {
    id: 'c-marlene',
    ui: '.kqs-dlg',
    run: async (k, h) => {
      h.place({ era: 'today', x: 763.5, z: -897.5, tx: 760.6, tz: -910.4, pitch: -4, zoom: 4.2 });
      await h.say('marlene', 'Ein Trichter, rund, mit Wall? Bleib draußen. Ich hab’s notiert. Nicht reingehen, nicht buddeln, nicht mal reinspucken.');
    },
  },
  {
    id: 'c-geister',
    run: async (k, h) => {
      const ids = ['hanne', 'soll', 'jost', 'pikeur', 'peter', 'matthes', 'gaertner', 'diener', 'mann'];
      h.place({ era: '1789', x: 1289.3, z: -1223.6, yaw: 0, pitch: -6, zoom: 2.6 });
      await h.npcs(ids.map((id, i) => ({ npc: id, x: 1283.5 + i * 1.45, z: -1228.5, era: '1789', yaw: 0 })));
    },
  },
  {
    id: 'c-nebelinge',
    run: (k, h) => {
      h.place({ era: 'today', x: 795, z: -893, tx: 803, tz: -889, pitch: 0, zoom: 3 });
      h.enemies('nebelling', { n: 3, d: 4.5, spread: 72, windup: 'lunge' });
    },
  },
  {
    id: 'c-mahnbriefe',
    run: (k, h) => {
      h.place({ era: '1789', x: 1205, z: -1172, tx: 1212, tz: -1180, pitch: 4, zoom: 3.6 });
      h.enemies('mahnbrief', { n: 5, d: 4.5, spread: 76 });
      h.enemies('foliant', { n: 1, d: 6.5, a: 16 });
    },
  },
  {
    id: 'c-nebelweber',
    run: (k, h) => {
      h.place({ era: '1793-02', x: 1460, z: -600, yaw: 330, pitch: 2, zoom: 3 });
      k.lantern.toggle(true);
      h.enemies('nebelweber', { n: 1, d: 6, a: -12, windup: 'frostkugel' });
      h.enemies('rufer', { n: 1, d: 5.5, a: 16 });
    },
  },
  {
    id: 'c-raffschatten',
    run: (k, h) => {
      h.look('dusk', '1793-07');
      h.place({ era: '1793-07', x: 1216, z: -1172, tx: 1222, tz: -1180, pitch: 4, zoom: 3 });
      h.enemies('raffschatten', { n: 2, d: 4.5, spread: 40, a: -14 });
      h.enemies('glutling', { n: 2, d: 4, spread: 30, a: 22 });
      h.enemies('scherbling', { n: 1, d: 6.5, a: 2 });
    },
  },
  {
    id: 'c-steinfresser',
    run: (k, h) => {
      h.place({ era: '1796', x: 1226, z: -1178, tx: 1236, tz: -1190, pitch: 6, zoom: 4.2 });
      h.enemies('steinfresser', { n: 1, d: 9, a: 16, windup: 'stampfen' });
      h.enemies('grusling', { n: 3, d: 4.5, spread: 60, a: -10 });
    },
  },
  {
    id: 'c-meute',
    run: (k, h) => {
      h.place({ era: '1793-02', x: 1262, z: -1160, yaw: 0, pitch: 2, zoom: 3 });
      k.lantern.toggle(true);
      h.hounds([[13, -6], [6, -16], [7, 12], [9, 2], [10, -26], [11, 24]], { pikeur: true });
    },
  },

  // ==== Story: the endings (last: a staged ending owns the camera) ==========================
  {
    id: 'e1-wahl',
    ui: '.kqs-ending',
    run: async (k, h) => {
      h.look('dawn');
      h.place({ era: 'today', x: 764, z: -899, tx: 760.6, tz: -910.4, pitch: 0, zoom: 3.6 });
      k.story.ending();
      k.step(4);
      await h.frames(60);
    },
  },
  {
    id: 'e-museum',
    run: async (k, h) => {
      h.place({ era: 'today', x: 760, z: -902, yaw: 0, pitch: 0 });
      h.look('dawn');
      k.story.ending('museum', true);
      for (let i = 0; i < 300 && !document.querySelector('[data-testid="ending-stage"]'); i++) await h.frames(1);
      k.story.stageHold(6.5);
    },
    wait: 5000,
  },
  {
    id: 'e-burn',
    run: async (k, h) => {
      h.place({ era: 'today', x: 760, z: -902, yaw: 0, pitch: 0 });
      h.look('night');
      k.story.ending('burn', true);
      for (let i = 0; i < 300 && !document.querySelector('[data-testid="ending-stage"]'); i++) await h.frames(1);
      k.story.stageHold(6.5);
    },
    wait: 5000,
  },
  {
    id: 'e-keep',
    run: async (k, h) => {
      h.place({ era: 'today', x: 760, z: -902, yaw: 0, pitch: 0 });
      h.look('night');
      k.story.ending('keep', true);
      for (let i = 0; i < 300 && !document.querySelector('[data-testid="ending-stage"]'); i++) await h.frames(1);
      k.story.stageHold(8);
    },
    wait: 5000,
  },
];

// ---------------------------------------------------------------------------------------------

const list = only.length ? SHOTS.filter((s) => only.includes(s.id)) : SHOTS;
if (argv.includes('--list')) {
  for (const s of SHOTS) console.log(s.id);
  process.exit(0);
}
if (!list.length) throw new Error(`no shot matches --only ${only.join(',')}`);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') if (!/GPU stall|toNonIndexed|AudioContext|pointer ?lock/i.test(t)) console.log(`  [${m.type()}] ${t.slice(0, 240)}`);
});
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

async function boot() {
  await page.goto(`${base}${QUERY}`);
  await page.waitForFunction(() => !!window.kq?.ctx && !!window.kq.story && !!window.kq.combat && !!window.kq.npc && !!window.kq.quelle && !!window.kq.fx, null, { timeout: 180_000 });
  await page.addStyleTag({ content: '.kq-debug,.kq-perf{display:none!important} body.sb-clean .kq-root, body.sb-clean > div:not(#app):not(.kq-root){visibility:hidden!important}' });
  await page.evaluate(`(${HELPERS.toString()})()`);
  const gpu = await page.evaluate(() => {
    const gl = window.kq.ctx.renderer.getContext();
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?';
  });
  console.log(`GPU: ${gpu}`);
  if (/swiftshader|software|llvmpipe/i.test(gpu)) console.warn('WARNING: software renderer — the pictures will not match the real look');
  await page.evaluate(() => {
    const k = window.kq;
    k.story.start('Alex');
    k.step(4);
  });
}

await boot();
let n = 0;
for (const s of list) {
  const t0 = Date.now();
  try {
    await page.evaluate(() => window.__sb.reset());
    await page.evaluate((ui) => {
      document.body.classList.toggle('sb-clean', !ui);
      document.body.classList.toggle('sb-ui', !!ui);
      let st = document.getElementById('sb-ui-style');
      if (!st) document.head.append((st = Object.assign(document.createElement('style'), { id: 'sb-ui-style' })));
      const sel = ui ? ui.split(',').map((x) => x.trim()) : [];
      st.textContent = ui
        ? `:where(body.sb-ui > *:not(#app), body.sb-ui > *:not(#app) *) { visibility: hidden !important; } ${sel.map((x) => `body.sb-ui ${x}, body.sb-ui ${x} *`).join(', ')} { visibility: visible !important; }`
        : '';
    }, s.ui ?? null);
    const out = await page.evaluate(async (src) => {
      const fn = (0, eval)(`(${src})`);
      return await fn(window.kq, window.__sb);
    }, s.run.toString());
    if (s.wait) await page.waitForTimeout(s.wait);
    await page.evaluate(() => window.kq.screenshotReady());
    await page.screenshot({ path: `${outDir}/${s.id}.jpg`, type: 'jpeg', quality });
    n++;
    console.log(`✓ ${s.id} (${Date.now() - t0} ms)${out !== undefined && out !== null ? ' ' + JSON.stringify(out).slice(0, 300) : ''}`);
  } catch (e) {
    console.log(`✗ ${s.id}: ${String(e.message).split('\n')[0]}`);
    if (s.reload !== false) {
      await boot();
    }
  }
}
await browser.close();
console.log(`${n}/${list.length} shots → ${outDir}`);
