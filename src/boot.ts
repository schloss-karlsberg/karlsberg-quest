import { NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { AssetLoader } from './assets/loader';
import { AudioManager } from './audio/audio';
import { loadBundledContent } from './content/db';
import type { EraController, GameContext, PauseController } from './core/context';
import { ERA_INFO, type Era, isEra } from './core/era';
import { EventBus } from './core/events';
import { FixedStepLoop } from './core/loop';
import { SaveManager, SettingsStore, defaultStorage } from './core/save';
import { DEFAULT_SPAWN, GameStateStore, createInitialState } from './core/state';
import { SystemRegistry } from './core/systems';
import { loadGameData } from './data/loader';
import { installDebug } from './debug/hooks';
import { t } from './i18n';
import { AVATAR_MODEL, Avatar } from './player/avatar';
import { Input } from './player/input';
import { Player } from './player/player';
import { PerfMonitor } from './render/perf';
import { PostFX } from './render/post';
import { QualityManager, gpuName, isSoftwareGpu, parseQualityParam, suggestLevel } from './render/quality';
import { EnvLight } from './render/standard';
import { SYSTEM_LOADERS } from './systems';
import { openLicences, openPause, setAssetLicences } from './ui/menus';
import { TitleScreen } from './ui/title';
import { UI } from './ui/ui';
import { World } from './world/world';

/**
 * Wires everything together. main.ts only calls `boot()`.
 * Order: renderer + UI (title visible at once) → data → world → state/save → player →
 * feature systems → loop. Gameplay starts on "Laterne entzünden" (or at once with ?debug).
 */
export async function boot(container: HTMLElement): Promise<GameContext> {
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  // load timeline (ms since navigation start) for docs/PERFORMANCE.md and e2e/perf.spec.ts
  const ready: Record<string, number> = { boot: Math.round(performance.now()) };
  (window as unknown as { __kqReady: Record<string, number> }).__kqReady = ready;
  const mark = (k: string) => (ready[k] = Math.round(performance.now()));
  const skipTitle = debug || params.has('notitle');

  // ---- renderer, scene, camera
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('preserve') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.2, 7000);
  const post = new PostFX(params.has('nomsaa') ? 0 : 4);
  const perf = new PerfMonitor(renderer);
  // CC0 art assets (src/assets): models / textures by id, lazy per area or era
  const assets = new AssetLoader(renderer);
  void assets.licences().then(setAssetLicences);
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    post.setSize(w, h, renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- core services
  const events = new EventBus();
  const storage = defaultStorage();
  const settings = new SettingsStore(storage);
  const state = new GameStateStore(createInitialState());
  const save = new SaveManager(state, storage, events);
  if (params.has('nosave')) save.enabled = false;
  const audio = new AudioManager();
  const ui = new UI(document.body);
  const content = loadBundledContent();
  const systems = new SystemRegistry();

  let started = false;
  let modalOpen = 0;
  const reasons = new Set<string>();
  // the loop is created below; pause needs a late reference
  let loopRef: FixedStepLoop | null = null;
  const pause: PauseController = {
    push(r) {
      reasons.add(r);
      sync();
    },
    pop(r) {
      reasons.delete(r);
      sync();
    },
    get paused() {
      return reasons.size > 0;
    },
    reasons,
  };
  const sync = () => {
    const was = loopRef?.paused ?? false;
    if (loopRef) loopRef.paused = reasons.size > 0;
    if (loopRef && was !== loopRef.paused) {
      events.emit('game:pause', { paused: loopRef.paused });
      audio.setPaused(loopRef.paused);
    }
  };
  pause.push('title');

  // ---- title screen (shown immediately while data loads)
  let ctxRef: GameContext | null = null;
  const title = new TitleScreen({
    onStart: (fresh) => startGame(fresh),
    onLicences: () => openLicences({ modals: ui.modals, attribution: () => ctxRef?.data.attribution.items ?? [] }),
    confirm: (text) => ui.modals.confirm(text),
  });
  if (!skipTitle) ui.add(title.el);

  // ---- data + world
  let data;
  try {
    data = await loadGameData(undefined, (d, n) => title.setProgress(d / n));
  } catch (err) {
    title.setFailed((err as Error).message);
    throw err;
  }
  mark('data');
  const world = new World(data, scene, post);
  mark('world');
  const quality = new QualityManager({
    renderer,
    post,
    world,
    settings,
    resize,
    notify: (level) => ui.toast(t('settings.graphics.auto', { level: t(`settings.graphics.${level}`) }), 5200),
  });
  quality.noMsaa = params.has('nomsaa');
  const gpu = gpuName(renderer.getContext());
  const guess = suggestLevel(gpu, matchMedia('(pointer: coarse)').matches, navigator.hardwareConcurrency ?? 0);
  quality.fallback = guess;
  // session tier: ?q=low|med|high, else a software renderer (SwiftShader in the headless e2e run)
  // always starts on Niedrig (cheap materials, no shadows / bloom / AO); picking a level in the
  // settings clears it
  quality.override = parseQualityParam(params.get('q')) ?? (isSoftwareGpu(gpu) ? 'low' : null);
  if (!settings.state.graphics && !navigator.webdriver && !quality.override) {
    // first run: guess a preset from the GPU (Hoch / Mittel / Niedrig); the auto-downgrade corrects it
    settings.update((d) => (d.graphics = guess), 'graphics');
  }
  quality.listeners.push((p) => world.shadows.configure(p.shadowSize, p.shadowRange, p.shadowTaps));
  // nature track: CC0 ground / bark sets, grass, props and water detail follow the tier
  quality.listeners.push((_p, level) => world.setDetail(level));
  world.attachAssets(assets);
  const env = new EnvLight(world.sky.mesh);
  const shadowFocus = new Vector3();
  const camFwd = new Vector3();
  // never under WebDriver (e2e screenshots stay comparable) or in deterministic ?manual runs
  quality.autoAllowed = !params.has('manual') && (!navigator.webdriver || params.has('autoq'));
  quality.apply();
  const palaceReady = world.loadPalace().catch((err) => console.error('[palace] failed to load', err));

  // ---- input + player
  const input = new Input(renderer.domElement);
  const player = new Player(
    {
      heightAt: (x, z) => world.heightAt(x, z),
      collide: (x, z, r) => world.collider.resolve(x, z, r),
      bounds: () => world.bounds(),
      surfaceAt: (x, z) => world.surfaceAt(x, z),
      coverAt: (x, z) => world.coverAt(x, z),
      canFly: () => ERA_INFO[world.currentEra].spiritView,
      waterDepth: (x, z) => (world.surfaceOverride?.(x, z) ? -Infinity : world.water.depthInside(x, z)),
      // third-person camera collision: footprints, props, interior walls, trunks, room ceilings
      camera: {
        blocked: (x, z, r) => world.collider.resolve(x, z, r).hit,
        trunks: (x, z, r, fn) => world.forest.trunksNear(x, z, r, fn),
        ceiling: (x, z, y) => world.ceilingAt?.(x, z, y) ?? null,
      },
    },
    input,
    events,
  );
  // the player character (third person): rigged CC0 surveyor, staff, belt lantern (src/player/avatar.ts)
  const avatar = new Avatar(scene, player, () => assets.model(AVATAR_MODEL));
  let zoomSaved = 0;
  const applySettings = () => {
    const s = settings.state;
    player.mouseSensitivity = s.mouseSensitivity;
    player.invertY = s.invertY;
    player.invertX = s.invertX === true;
    player.reducedMotion = s.reducedMotion;
    player.cameraMode = params.get('cam') === 'first' ? 'first' : params.get('cam') === 'third' ? 'third' : s.cameraMode === 'first' ? 'first' : 'third';
    if (Math.abs((s.cameraZoom ?? 3.6) - zoomSaved) > 1e-3) player.rig.zoom = zoomSaved = s.cameraZoom ?? 3.6;
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
    audio.setVolumes(s.volume);
    ui.hud.setSubtitleSize(s.subtitleSize);
    input.setBindings(s.bindings ?? {});
    // accessibility switches as root attributes, so every feature's CSS can follow them
    const root = document.documentElement;
    root.toggleAttribute('data-kq-contrast', s.highContrast === true);
    root.toggleAttribute('data-kq-reduced-motion', s.reducedMotion);
    root.toggleAttribute('data-kq-reduced-flash', s.reducedFlash === true);
    root.toggleAttribute('data-kq-colorblind', s.colorblind === true);
    root.style.setProperty('--sub-bg', String(Math.max(0, Math.min(1, s.subtitleBg ?? 0.62))));
    post.uniforms.uFlashScale!.value = s.reducedFlash ? 0.2 : 1;
    world.terrain.uniforms.uPalette!.value = s.colorblind ? 1 : 0;
  };
  settings.subscribe((_, key) => {
    applySettings();
    if (key === 'graphics') quality.override = null;
    if (key === 'graphics' || key === 'resolutionScale') quality.apply();
    events.emit('settings:change', { key });
  });
  applySettings();

  // ---- era controller
  const era: EraController = {
    get current() {
      return world.currentEra;
    },
    get info() {
      return ERA_INFO[world.currentEra];
    },
    set(e: Era) {
      const from = world.currentEra;
      world.setEra(e);
      if (player.flying && !ERA_INFO[e].spiritView) player.setFlying(false);
      // re-ground the player (terrain differs between eras) and step out of buildings
      const p = world.collider.resolve(player.position.x, player.position.z, 0.6);
      player.teleport(p.x, p.z);
      state.mutable.era = e;
      ui.hud.setEraLabel(t(ERA_INFO[e].labelKey));
      if (from !== e) {
        quality.hold();
        events.emit('era:change', { from, to: e });
        if (started) save.autosave('era', true);
      }
    },
  };

  // ---- state: continue a save or start fresh
  const restore = () => {
    const s = state.state;
    era.set(s.era);
    player.readState(s.player);
  };
  if (!params.has('fresh') && save.has()) save.load();
  restore();
  // any later load (e.g. the title's "Ende noch einmal wählen") puts the world where the state is
  events.on('save:loaded', () => restore());
  // URL overrides (debug / e2e / sharing a spot)
  const qEra = params.get('era');
  if (isEra(qEra)) era.set(qEra);
  if (params.has('x') && params.has('z')) player.teleport(Number(params.get('x')), Number(params.get('z')), params.has('yaw') ? (Number(params.get('yaw')) * Math.PI) / 180 : undefined);
  ui.hud.setEraLabel(t(ERA_INFO[world.currentEra].labelKey));

  // ---- loop
  const loop = new FixedStepLoop({
    update: (dt) => {
      // F5: over the shoulder ↔ first person (settings „Kamera“)
      if (input.wasPressed('cameraMode') && !pause.paused) settings.update((d) => (d.cameraMode = player.cameraMode === 'third' ? 'first' : 'third'), 'cameraMode');
      player.update(dt);
      systems.update(dt, ctx);
      player.writeState(state.mutable.player);
      state.mutable.meta.playSeconds += dt;
      input.endStep();
    },
    render: (frameDt, alpha) => {
      perf.begin();
      if (!pause.paused) player.look();
      player.applyCamera(camera, alpha, frameDt);
      cameraOverride?.(camera);
      if (reasons.has('title')) {
        // title backdrop: slow drift of the view
        const tt = performance.now() / 1000;
        camera.rotation.y += Math.sin(tt * 0.07) * 0.08;
        camera.rotation.x = -0.02 + Math.sin(tt * 0.05) * 0.02;
      }
      systems.frame(frameDt, ctx);
      // the character (after the systems: combat's pose of this frame, cut-scene cameras known)
      avatar.frame({ dt: pause.paused && !reasons.has('title') ? 0 : frameDt, time: loop.time, camera, hidden: cameraOverride !== null, reducedMotion: settings.state.reducedMotion, reducedFlash: settings.state.reducedFlash === true });
      // the zoom the player chose stays (saved a moment after the wheel stops)
      if (Math.abs(player.rig.zoom - zoomSaved) > 0.05 && !zoomTimer) zoomTimer = window.setTimeout(() => {
        zoomTimer = 0;
        zoomSaved = player.rig.zoom;
        settings.update((d) => (d.cameraZoom = Math.round(player.rig.zoom * 100) / 100), 'cameraZoom');
      }, 1500);
      // the HUD calm counts real play time (frames), so a fight's linger also ends in ?manual
      if (!pause.paused) ui.hud.tickCalm(frameDt);
      ui.cards.tick(frameDt);
      world.frame(camera, frameDt, loop.time + (reasons.has('title') ? performance.now() / 1000 : 0));
      audio.updateListener(camera);
      ui.hud.setHeading(((-player.yaw * 180) / Math.PI + 360) % 360);
      // sun shadows around the player (box pushed ahead along the view) and the era sky IBL
      camera.getWorldDirection(camFwd);
      camFwd.y = 0;
      if (camFwd.lengthSq() > 1e-6) camFwd.normalize();
      shadowFocus.copy(camera.position).addScaledVector(camFwd, quality.preset.shadowRange * 0.35);
      world.shadows.update(renderer, scene, shadowFocus);
      world.water.renderReflection(renderer, scene, camera);
      env.update(renderer, world.lookVersion);
      post.render(renderer, scene, camera, loop.time);
      perf.end();
      quality.frame(frameDt * 1000, started && !pause.paused && !document.hidden);
      frames++;
    },
  });
  loopRef = loop;
  sync();
  if (params.has('manual')) loop.manual = true;
  let frames = 0;
  let zoomTimer = 0;
  let cameraOverride: ((cam: PerspectiveCamera) => void) | null = null;

  const ctx: GameContext = {
    renderer,
    scene,
    camera,
    post,
    perf,
    assets,
    quality,
    player,
    input,
    world,
    data,
    state,
    settings,
    save,
    events,
    audio,
    ui,
    era,
    content,
    systems,
    loop,
    pause,
    debug,
    params,
    t,
  };
  ctxRef = ctx;

  // ---- HUD wiring for core events
  events.on('player:stance', ({ stance }) => ui.hud.setStance(stance === 'stand' ? '' : t(`stance.${stance}`)));
  events.on('player:fly', ({ flying }) => ui.toast(t(flying ? 'fly.on' : 'fly.off')));
  events.on('ui:toast', ({ text, ms }) => ui.toast(t(text), ms));
  // the character's short reactions (third person)
  events.on('player:damaged', () => avatar.react('hit'));
  for (const ev of ['clue:found', 'item:pickup', 'measure:done'] as const) events.on(ev, () => avatar.react('interact'));
  // art assets that belong to an era stream in when it opens (src/assets, lazy)
  events.on('era:change', ({ to }) => void assets.prefetchEra(to));

  // ---- modals pause the game and free the mouse
  ui.modals.onChange = (n) => {
    modalOpen = n;
    input.enabled = n === 0 && started;
    if (n > 0) {
      pause.push('modal');
      input.releaseLock();
    } else {
      pause.pop('modal');
      if (started) input.requestLock();
      window.setTimeout(() => ui.hud.showClickToPlay(started && !input.locked && modalOpen === 0), 600);
    }
  };

  // ---- pause menu: Escape or losing pointer lock
  const menuDeps = {
    modals: ui.modals,
    settings,
    attribution: () => data.attribution.items,
    save: () => save.save('auto', 'manual'),
    toTitle: () => toTitle(),
  };
  let pauseMenuOpen = false;
  const openPauseMenu = () => {
    if (!started || pauseMenuOpen || modalOpen > 0) return;
    pauseMenuOpen = true;
    openPause(menuDeps, () => (pauseMenuOpen = false));
  };
  document.addEventListener('pointerlockchange', () => {
    if (!input.locked && started && modalOpen === 0 && !debug) openPauseMenu();
    ui.hud.showClickToPlay(started && !input.locked && modalOpen === 0);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && started && modalOpen === 0) openPauseMenu();
  });
  renderer.domElement.addEventListener('click', () => {
    if (started && modalOpen === 0) input.requestLock();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started) save.autosave('hidden', true);
    perf.resetClock();
    quality.hold();
  });
  window.setInterval(() => started && !pause.paused && save.autosave('interval'), 60_000);

  function startGame(fresh: boolean): void {
    audio.unlock();
    if (fresh) {
      save.delete();
      state.replace(createInitialState(), 'new');
      restore();
      player.teleport(DEFAULT_SPAWN.x, DEFAULT_SPAWN.z, DEFAULT_SPAWN.yaw);
    }
    started = true;
    title.hide();
    ui.hud.show(true);
    input.enabled = true;
    pause.pop('title');
    input.requestLock();
    // the first click into the picture takes the mouse (pointer lock): say so until it has it
    // (playtest 2026-11-19: the view did not turn and nothing said why)
    window.setTimeout(() => ui.hud.showClickToPlay(started && !input.locked && modalOpen === 0), 900);
    events.emit('game:start', { resumed: !fresh && state.state.meta.savedAt !== null });
    save.autosave('start', true);
  }

  function toTitle(): void {
    save.autosave('title', true);
    started = false;
    input.enabled = false;
    input.releaseLock();
    ui.hud.show(false);
    pause.push('title');
    if (!title.el.isConnected) ui.add(title.el);
    title.show();
    title.setReady(save.has());
  }

  // ---- feature systems
  for (const load of SYSTEM_LOADERS) {
    try {
      const mod = await load();
      systems.registerSystem(mod.default);
    } catch (err) {
      console.error('[systems] failed to load a system module', err);
    }
  }
  await systems.initAll(ctx);
  mark('systems');

  installDebug(ctx, { frames: () => frames, perf, quality, setCamera: (fn) => (cameraOverride = fn), ready: palaceReady });
  window.kq!.avatar = {
    state: () => ({ ready: avatar.ready, ...avatar.debug, facing: avatar.facing, mode: player.cameraMode, third: player.thirdPerson, distance: player.rig.distance, zoom: player.rig.zoom }),
    setMode: (m) => settings.update((d) => (d.cameraMode = m), 'cameraMode'),
    ready: () => avatar.whenReady(),
  };
  loop.start();

  if (debug) {
    const r = ctx.content.validate(world.bounds());
    if (!r.ok) console.warn('[content] validation errors', r.errors);
  }
  const palaceLoaded = palaceReady.then(() => mark('palace'));
  if (skipTitle) {
    await palaceLoaded;
    startGame(false);
  } else {
    // the title takes input while the palace model (4.5 MB, only shown in the past eras) still
    // streams in: the lantern flow alone takes longer than the download on any usual connection
    title.setReady(save.has());
  }
  mark('ready');
  // shader warm-up while the title is shown: compile every material in the scene in parallel
  // (KHR_parallel_shader_compile), so the first era shift does not hitch. Not under WebDriver
  // (SwiftShader compiles serially; e2e timing stays as it was) unless ?warm.
  if (!navigator.webdriver || params.has('warm')) {
    void palaceLoaded.then(() =>
      window.setTimeout(() => {
        renderer.compileAsync(scene, camera).then(
          () => mark('warm'),
          (err: unknown) => console.warn('[boot] shader warm-up failed', err),
        );
      }, 400),
    );
  }
  return ctx;
}
