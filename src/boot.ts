import { NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { AssetLoader } from './assets/loader';
import { AudioManager } from './audio/audio';
import { loadBundledContent } from './content/db';
import type { EraController, GameContext, PauseController } from './core/context';
import { ERA_INFO, type Era, isEra } from './core/era';
import { EventBus } from './core/events';
import { FixedStepLoop, frameCap, renderRate } from './core/loop';
import { SaveManager, SettingsStore, defaultStorage } from './core/save';
import { DEFAULT_SPAWN, GameStateStore, createInitialState } from './core/state';
import { SystemRegistry } from './core/systems';
import { loadGameData } from './data/loader';
import { installDebug } from './debug/hooks';
import { t } from './i18n';
import { AVATAR_MODELS, Avatar, type AvatarModelId, avatarModelParam } from './player/avatar';
import { cameraHints } from './player/camera';
import { Input, isTyping } from './player/input';
import { Player } from './player/player';
import { actionPose } from './player/pose';
import { applySeeThrough, type SeeInput } from './player/seeThrough';
import { PerfMonitor } from './render/perf';
import { PostFX } from './render/post';
import { QualityManager, gpuName, isSoftwareGpu, parseQualityParam, suggestLevel } from './render/quality';
import { EnvLight } from './render/standard';
import { SYSTEM_LOADERS } from './systems';
import type { BootLoader, LoadingRequest } from './ui/loader';
import { openLicences, openPause, setAssetLicences } from './ui/menus';
import { openNews } from './ui/news';
import { TitleScreen } from './ui/title';
import { TouchControls } from './ui/touch';
import { SKILL_IDS, skillsForLevel } from './systems/combat/rules';
import { CameraTakeover, OverrideSlot } from './systems/cinematic/takeover';
import { mobileLevel } from './render/mobileDefaults';
import { UI } from './ui/ui';
import { atmosphere } from './world/atmosphere';
import { World } from './world/world';

/**
 * Wires everything together. main.ts only calls `boot()`.
 * Order: renderer + UI (title visible at once) → data → world → state/save → player →
 * feature systems → loop. Gameplay starts on "Laterne entzünden" (or at once with ?debug).
 */
export async function boot(container: HTMLElement, loader: BootLoader): Promise<GameContext> {
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  // load timeline (ms since navigation start) for docs/PERFORMANCE.md and e2e/perf.spec.ts
  const ready: Record<string, number> = { boot: Math.round(performance.now()) };
  (window as unknown as { __kqReady: Record<string, number> }).__kqReady = ready;
  const mark = (k: string) => (ready[k] = Math.round(performance.now()));
  const skipTitle = debug || params.has('notitle');
  const storage = defaultStorage();
  const settings = new SettingsStore(storage);
  document.documentElement.toggleAttribute('data-kq-reduced-motion', settings.state.reducedMotion);

  // ---- renderer, scene, camera
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('preserve') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
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
  // the loop is created below; resize and pause need a late reference
  let loopRef: FixedStepLoop | null = null;
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    post.setSize(w, h, renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // a resized canvas is cleared: draw it again even while the view is held (menus, bullet time)
    loopRef?.requestRender();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- core services
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const save = new SaveManager(state, storage, events);
  if (params.has('nosave')) save.enabled = false;
  const audio = new AudioManager();
  const ui = new UI(document.body, loader.compass);
  assets.onAreaLoad = () => ui.loading.begin(t('loader.area'));
  const content = loadBundledContent();
  const systems = new SystemRegistry();

  let started = false;
  let modalOpen = 0;
  /** performance.now() of the last change of the modal stack (render pacing: a live modal settles at the cap). */
  let modalChanged = 0;
  const reasons = new Set<string>();
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
    // a new pause state (title, menu, travel) starts from a fresh frame, then the pacing takes over
    loopRef?.requestRender();
  };
  pause.push('title');

  // ---- title screen (shown immediately while data loads)
  let ctxRef: GameContext | null = null;
  const title = new TitleScreen({
    onStart: (fresh) => startGame(fresh),
    onLicences: () => openLicences({ modals: ui.modals, attribution: () => ctxRef?.data.attribution.items ?? [] }),
    onNews: () => openNews(ui.modals, () => title.refreshNews()),
    confirm: (text) => ui.modals.confirm(text),
  }, skipTitle ? undefined : loader);
  if (!skipTitle) {
    ui.add(title.el);
    title.adoptLoader();
  }

  // ---- data + world
  const data = await loadGameData(undefined, (done, total) => loader.setProgress(done, total));
  loader.show(t('loader.starting'));
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
  const coarse = matchMedia('(pointer: coarse)').matches;
  // phones and tablets (touch, docs/PERF-MOBILE-RESEARCH.md §B): Niedrig on phones, Mittel on big tablets
  const guess = coarse && !isSoftwareGpu(gpu) ? mobileLevel(gpu, Math.min(screen.width, screen.height), navigator.hardwareConcurrency ?? 0) : suggestLevel(gpu, coarse, navigator.hardwareConcurrency ?? 0);
  quality.fallback = guess;
  // session tier: ?q=low|med|high, else a software renderer (SwiftShader in the headless e2e run)
  // always starts on Niedrig (cheap materials, no shadows / bloom / AO); picking a level in the
  // settings clears it
  quality.override = parseQualityParam(params.get('q')) ?? (isSoftwareGpu(gpu) ? 'low' : null);
  if (!settings.state.graphics && !navigator.webdriver && !quality.override) {
    // first run: guess a preset from the GPU (Hoch / Mittel / Niedrig); the auto-downgrade corrects it
    settings.update((d) => (d.graphics = guess), 'graphics');
    // phones (touch, short side < 600 px): Energiesparen on from the start (30 fps, heat, battery)
    if (coarse && Math.min(screen.width, screen.height) < 600) settings.update((d) => (d.powerSave = true), 'powerSave');
  }
  quality.listeners.push((p) => {
    world.shadows.configure(p.shadowSize, p.shadowRange, p.shadowTaps);
    world.shadows.every = p.shadowEvery;
  });
  // nature track: CC0 ground / bark sets, grass, props and water detail follow the tier
  quality.listeners.push((_p, level) => world.setDetail(level));
  world.attachAssets(assets, renderer);
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
      // third-person camera collision: footprints, props, interior walls, walkable spaces (rooms /
      // outdoors), room ceilings, the storey-aware ground; trunks are dithered, not collided
      camera: {
        heightAt: (x, z, y) => world.heightAt(x, z, y),
        blocked: (x, z, r) => world.collider.hits(x, z, r),
        trunks: (x, z, r, fn) => world.forest.trunksNear(x, z, r, fn),
        ceiling: (x, z, y) => world.ceilingAt?.(x, z, y) ?? null,
        space: (x, z, y) => world.spaceAt?.(x, z, y) ?? -1,
      },
    },
    input,
    events,
  );
  // touch controls (phones / tablets, "Touch-Steuerung"): stick, drag look, buttons (src/ui/touch.ts)
  const touch = new TouchControls({
    input,
    settings,
    hud: ui.hud,
    events,
    root: ui.root,
    openPause: () => openPauseMenu(),
    dismissNoticeAt: (x, y) => {
      const rect = ui.hud.noticeDock.getBoundingClientRect();
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) dismissPlayNotice();
    },
    canFly: () => ERA_INFO[world.currentEra].spiritView,
    flying: () => player.flying,
    stance: () => player.stance,
    skillUnlocked: (n) => skillsForLevel(state.state.systems.progression?.level ?? 1).includes(SKILL_IDS[n - 1]!),
  });
  touch.onActiveChange = (on) => {
    if (on) input.releaseLock();
    else if (started && modalOpen === 0) ui.hud.showClickToPlay(!input.locked);
  };
  // the player character (third person): rigged CC0 surveyor, staff, belt lantern (src/player/avatar.ts)
  // the authored MPFB player is the default; ?avatar=surveyor wears the CC0 surveyor (fallback)
  const avatarModel = (id: AvatarModelId) => () => assets.model(AVATAR_MODELS[id].asset);
  const avatarFirst = avatarModelParam(params.get('avatar'));
  const avatar = new Avatar(scene, player, avatarModel(avatarFirst), AVATAR_MODELS[avatarFirst].height);
  let zoomSaved = 0;
  let capFps = 60;
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
    // „Bildrate“ / „Energiesparen“: the render pacing's cap, and the auto-downgrade's slow threshold follows it
    capFps = frameCap(s.fpsCap, s.powerSave);
    quality.capFps = capFps;
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
    if (key === 'graphics' || key === 'resolutionScale' || key === 'powerSave') quality.apply();
    events.emit('settings:change', { key });
    // a held view (pause menu → settings) shows the change at once
    loopRef?.requestRender();
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
      // the first frame after a held view (menu, bullet time), or a bullet-time frame long after
      // the last one: the idle gap is no frame time
      const now = performance.now();
      if (loop.resumed || (loop.manual && holdIdle && now - lastRenderAt > 250)) perf.resetClock();
      lastRenderAt = now;
      perf.begin();
      if (!pause.paused) player.look();
      player.applyCamera(camera, alpha, frameDt);
      cameraOverride.fn?.(camera);
      if (reasons.has('title')) {
        // title backdrop: slow drift of the view
        const tt = performance.now() / 1000;
        camera.rotation.y += Math.sin(tt * 0.07) * 0.08;
        camera.rotation.x = -0.02 + Math.sin(tt * 0.05) * 0.02;
      }
      systems.frame(frameDt, ctx);
      // the character (after the systems: combat's pose of this frame, cut-scene cameras known);
      // a cinematic's takeover keeps it in the picture (showAvatar), the debug camera hides it
      avatar.frame({ dt: pause.paused && !reasons.has('title') ? 0 : frameDt, time: loop.time, camera, hidden: cameraOverride.fn !== null && !takeover.showsAvatar(cameraOverride.fn), reducedMotion: settings.state.reducedMotion, reducedFlash: settings.state.reducedFlash === true });
      // see-through (round 10): trunks, ferns, rocks in front of the character / the target / the
      // speaker, or at the lens, dither away (src/player/seeThrough.ts, SEE_GLSL)
      updateSee();
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
      // the map may stand for one more frame while it is exact (render/shadows.ts); never in
      // ?manual / bullet time, whose frames can lie many simulated steps apart, nor in a fight
      // (lunging enemies, dodges: every caster's shadow on time)
      const fresh = loop.manual || cameraHints.fight.length > 0 || cameraHints.boss > 0;
      const shadowsDrawn = world.shadows.stats.drawn;
      world.shadows.update(renderer, scene, shadowFocus, fresh ? Infinity : frameDt);
      world.water.renderReflection(renderer, scene, camera, world.shadows.stats.drawn !== shadowsDrawn);
      env.update(renderer, world.lookVersion);
      post.render(renderer, scene, camera, loop.time);
      perf.end();
      // (not in bullet time: its frames lie many simulated steps apart and say nothing about speed)
      quality.frame(frameDt * 1000, started && !pause.paused && !document.hidden && !loop.manual);
      frames++;
    },
  });
  loopRef = loop;
  // Render pacing (core/loop.ts `renderRate`, docs/ARCHITECTURE.md §3): the player's cap while
  // playing, ≤ 30 fps on the title, menus at 15 fps or holding their last frame, bullet time only
  // on request, nothing in a hidden tab. Under WebDriver bullet time and still menus keep the
  // e2e behaviour (every frame / 15 fps) unless ?idle.
  const holdIdle = !navigator.webdriver || params.has('idle');
  loop.pace = () =>
    renderRate({
      cap: capFps,
      hidden: document.hidden,
      manual: loop.manual,
      hold: holdIdle,
      title: reasons.has('title'),
      modal: ui.modals.backdrop,
      modalAge: (performance.now() - modalChanged) / 1000,
      paused: pause.paused,
    });
  sync();
  if (params.has('manual')) loop.manual = true;
  let frames = 0;
  let lastRenderAt = 0;
  let zoomTimer = 0;
  // the one camera override slot (debug setCamera, ctx.cinematic.takeCamera); `camera:override
  // { active }` on every change between free and taken (src/systems/cinematic/takeover.ts)
  const cameraOverride = new OverrideSlot(
    (active) => events.emit('camera:override', { active }),
    () => loop.requestRender(),
  );
  const takeover = new CameraTakeover({ slot: cameraOverride, player, events, reducedMotion: () => settings.state.reducedMotion, requestRender: () => loop.requestRender(), titleActive: () => reasons.has('title') });
  const seeChest = { x: 0, y: 0, z: 0 };
  const seeSubject = { x: 0, y: 0, z: 0, w: 0 };
  const see: SeeInput = { on: false, cam: camera.position, chest: seeChest, fight: false, subject: null };
  const updateSee = () => {
    const p = player.renderPos;
    see.on = player.thirdPerson && cameraOverride.fn === null && !reasons.has('title');
    seeChest.x = p.x;
    seeChest.y = p.y + player.eyeHeight * 0.62;
    seeChest.z = p.z;
    see.fight = cameraHints.fight.length > 0 || cameraHints.boss > 0;
    see.subject = null;
    const f = cameraHints.focus;
    const tg = actionPose.target;
    if (f) {
      seeSubject.x = f.x;
      seeSubject.y = f.y - 0.55;
      seeSubject.z = f.z;
      seeSubject.w = 0.45;
      see.subject = seeSubject;
    } else if (see.fight && tg) {
      seeSubject.x = tg.x;
      seeSubject.y = world.heightAt(tg.x, tg.z, p.y) + 0.9;
      seeSubject.z = tg.z;
      seeSubject.w = 0.8;
      see.subject = seeSubject;
    }
    applySeeThrough(see, atmosphere);
  };

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
    cinematic: takeover,
    debug,
    params,
    t,
  };
  ctxRef = ctx;

  // ---- HUD wiring for core events
  events.on('player:stance', ({ stance }) => ui.hud.setStance(stance === 'stand' ? '' : t(`stance.${stance}`)));
  events.on('player:fly', ({ flying }) => {
    ui.toast(t(flying ? 'fly.on' : 'fly.off'));
    // while in the air the controls stay on screen (playtest: the story's "F: Geisterblick" hint
    // did not say what W / Space / C do once you fly, nor how to land)
    ui.hud.prompt(flying ? 'F' : null, flying ? t('fly.prompt') : undefined, 'fly');
  });
  events.on('ui:toast', ({ text, ms }) => ui.toast(t(text), ms));
  // the character's short reactions (third person)
  events.on('player:damaged', () => avatar.react('hit'));
  for (const ev of ['clue:found', 'item:pickup', 'measure:done', 'quelle:dip'] as const) events.on(ev, () => avatar.react('interact'));
  // the character's costume (the story's court disguise) and lantern tint (src/player/avatar.ts)
  events.on('player:costume', ({ costume }) => avatar.setCostume(costume));
  events.on('player:lantern-tint', ({ hex }) => avatar.setLanternTint(hex));
  // The shift already covers its own wait. Only offer a loader for prefetch that outlasts it.
  let shifting = false;
  let eraLoad: { feedback?: LoadingRequest } | undefined;
  const showEraLoad = () => {
    if (eraLoad && !eraLoad.feedback) eraLoad.feedback = ui.loading.begin(t('loader.era'), 1);
  };
  events.on('shift:begin', () => {
    shifting = true;
    ui.loading.setEnabled(false);
    eraLoad?.feedback?.finish();
    if (eraLoad) eraLoad.feedback = undefined;
  });
  events.on('shift:done', () => {
    shifting = false;
    showEraLoad();
    ui.loading.setEnabled(started);
  });
  events.on('era:change', ({ to }) => {
    eraLoad?.feedback?.finish();
    const load: NonNullable<typeof eraLoad> = {};
    eraLoad = load;
    if (!shifting) showEraLoad();
    void assets.prefetchEra(to).finally(() => {
      load.feedback?.finish();
      if (eraLoad === load) eraLoad = undefined;
    });
  });

  // ---- modals pause the game and free the mouse
  ui.modals.onChange = (n) => {
    modalOpen = n;
    modalChanged = performance.now();
    loop.requestRender();
    input.enabled = n === 0 && started;
    touch.setPlaying(n === 0 && started);
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
  const photoOpen = () => document.documentElement.hasAttribute('data-kq-photo');
  const dismissPlayNotice = () => {
    if (!started || pause.paused || photoOpen() || !ui.cards.dismissNotice()) return false;
    loop.requestRender();
    return true;
  };
  // pause only when a lock the player HAD is lost: Chromium also sends an unlocked change for a
  // request that never got the lock (two requests in one frame), and the game's own release (a
  // modal opened) is no reason either, even when that modal has closed again by the time the event
  // arrives (several cards closed in one frame) — both opened a stray pause menu that ate the E
  let hadLock = false;
  document.addEventListener('pointerlockchange', () => {
    const self = input.takeSelfRelease();
    const lost = hadLock && !input.locked;
    hadLock = input.locked;
    // The browser can handle Escape itself and report only an unlock.
    if (lost && !self && started && modalOpen === 0 && !dismissPlayNotice() && !debug) openPauseMenu();
    ui.hud.showClickToPlay(started && !input.locked && modalOpen === 0);
  });
  // Optional dismissal keys must reach gameplay, text entry or the focused control when in use.
  window.addEventListener('keydown', (e) => {
    if (!['Enter', 'NumpadEnter', 'Space', 'KeyE'].includes(e.code) || e.repeat || e.defaultPrevented) return;
    if (!started || pause.paused || photoOpen() || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target instanceof Element ? e.target : document.activeElement;
    if (isTyping(target) || target?.closest('button, a[href], summary, [role="button"], [role="link"]')) return;
    if (Object.values(input.bindings).some((codes) => codes.includes(e.code))) return;
    if (ui.root.querySelector('.kqs-dlg.kqs-show') || !dismissPlayNotice()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  // Modal and photo handlers run in capture. An Escape that reaches play advances one layer.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat || e.defaultPrevented || !started || modalOpen > 0) return;
    // Some browsers also report an unlock after delivering the key. Count it as the same press.
    hadLock = false;
    if (dismissPlayNotice()) {
      e.preventDefault();
      input.releaseLock();
    } else {
      openPauseMenu();
    }
  });
  renderer.domElement.addEventListener('click', () => {
    if (started && modalOpen === 0) input.requestLock();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started) save.autosave('hidden', true);
    perf.resetClock();
    quality.hold();
    // a hidden tab draws nothing (rAF stops anyway) and its sound stops too (HRTF, wind, drones)
    audio.setHidden(document.hidden);
    if (!document.hidden) loop.requestRender();
  });
  // „Energiesparen“: a one-time hint when the game runs on battery (Battery API, Chromium only;
  // never under WebDriver), a while after the start so it does not crowd the opening lines
  events.on('game:start', () => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean }> };
    if (navigator.webdriver || typeof nav.getBattery !== 'function') return;
    window.setTimeout(() => {
      if (!started || settings.state.powerSave || settings.state.powerHint) return;
      void nav
        .getBattery!()
        .then((b) => {
          if (b.charging || settings.state.powerSave || settings.state.powerHint) return;
          settings.update((d) => (d.powerHint = true), 'powerHint');
          ui.toast(t('settings.powerSave.hint'), 8000);
        })
        .catch(() => {});
    }, 15_000);
  });
  // bullet time draws on request only: a real mouse look / key / wheel shows at once
  // (pointer events: touch drags and buttons too, src/ui/touch.ts)
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'pointerdown', 'pointermove', 'pointerup'] as const) window.addEventListener(ev, () => loop.manual && loop.requestRender(), { passive: true });
  window.setInterval(() => started && !pause.paused && save.autosave('interval'), 60_000);

  function startGame(fresh: boolean): void {
    audio.unlock();
    if (fresh) {
      save.delete();
      state.replace(createInitialState(), 'new');
      restore();
      player.teleport(DEFAULT_SPAWN.x, DEFAULT_SPAWN.z, DEFAULT_SPAWN.yaw);
      // „Neues Spiel“ over an old save: every system that rebuilds from the state on a load (walk,
      // animals, npc, quests, court, combat, hunt …) rebuilds from the fresh one now, before
      // game:start starts the story (tour playtest 2026-11-21: the old group and deer stayed)
      events.emit('save:loaded', { slot: 'new' });
    }
    started = true;
    title.hide();
    ui.loading.setEnabled(!shifting);
    ui.hud.show(true);
    input.enabled = true;
    touch.setPlaying(modalOpen === 0);
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
    ui.loading.setEnabled(false);
    input.enabled = false;
    touch.setPlaying(false);
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

  installDebug(ctx, {
    frames: () => frames,
    perf,
    quality,
    setCamera: (fn) => cameraOverride.set(fn),
    ready: palaceReady,
  });

  // Playtesting a later chapter: ?kapitel=2|3|4 turns a NEW game into a start at that chapter,
  // with what the earlier chapters would have left behind (survey skills, a fitting level).
  const kapitel = Number(params.get('kapitel'));
  if (kapitel >= 2 && kapitel <= 4) {
    const offStart = ctx.events.on('game:start', ({ resumed }) => {
      offStart();
      if (resumed) return;
      // after the story system's own game:start handler has started the prologue
      setTimeout(() => startAtChapter(kapitel), 0);
    });
  }
  window.kq!.camera = {
    state: () => ({ ...player.rig.debug, mode: player.cameraMode, third: player.thirdPerson, see: atmosphere.uSeeCam.value.w > 0, seeTarget: atmosphere.uSeeT.value.w > 0, fightHints: cameraHints.fight.length }),
  };
  window.kq!.avatar = {
    state: () => ({ ready: avatar.ready, ...avatar.debug, facing: avatar.facing, mode: player.cameraMode, third: player.thirdPerson, distance: player.rig.distance, zoom: player.rig.zoom, costume: avatar.costume, fadeBounds: { ...avatar.fadeBounds } }),
    setMode: (m) => settings.update((d) => (d.cameraMode = m), 'cameraMode'),
    ready: () => avatar.whenReady(),
    costume: () => avatar.costume,
    setCostume: (c) => events.emit('player:costume', { costume: c }),
    lanternTint: () => avatar.lanternTint,
    useMpfb: (on = true) => {
      const id: AvatarModelId = on ? 'mpfb' : 'surveyor';
      return avatar.useModel(avatarModel(id), AVATAR_MODELS[id].height).finally(() => loop.requestRender(2));
    },
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
    loader.hide();
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
        // with the post target bound: the scene draws there (linear output), and the program key
        // depends on the target (null would compile sRGB-output variants no frame uses; M-17)
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(post.target);
        const warm = renderer.compileAsync(scene, camera);
        renderer.setRenderTarget(prev);
        warm.then(
          () => mark('warm'),
          (err: unknown) => console.warn('[boot] shader warm-up failed', err),
        );
      }, 400),
    );
  }
  return ctx;
}

/** `?kapitel=N`: jump a freshly started game to chapter N (see boot). */
function startAtChapter(n: number): void {
  const k = window.kq;
  if (!k?.story || !k.skills || !k.progression || !k.quests) return;
  const skills: [string, number][] = [['relief', 2], ['kartograf', 2]];
  if (n >= 2) skills.push(['baumeister', 1], ['spurenleser', 1]);
  for (const [id, tier] of skills) k.skills.grant(id, tier, true);
  k.progression.level(n * 2 + 1);
  const earlier = new RegExp(`^q\\.(p|${Array.from({ length: n - 1 }, (_, i) => `k${i + 1}`).join('|')})\\.`);
  for (const id of k.quests.ids()) if (earlier.test(id) && k.quests.state().quests[id]?.state !== 'done') k.quests.reset(id);
  k.story.goto(`k${n}`, `k${n}_0`);
}
