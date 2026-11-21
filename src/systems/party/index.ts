/**
 * Feature "party" (docs/design/tour/systems.md §6, bible 06-enden §8 "Das Fest", storyboard
 * #25–#28): after every ending the credits play over a party on today's palace plateau (TF-01).
 *
 * Story → party:  'party:set' {variant: museum|burn|keep, at?}, 'party:credits' {lines?},
 *                 'party:clear' {}; also 'story:cue' {id: 'party:set'|'party:credits'|'party:clear', data}.
 * party → world:  'party:ready' {variant}, 'party:spotlight' {who, i} (the story plays the double's
 *                 line on a match), 'credits:start' {seconds}, 'credits:done' {skipped} (exactly once).
 * Uses:           ctx.people (16 people, speakers bound so they stay talkable), 'animal:request'
 *                 (Diane and Bijou: spawn / lie / shine), 'cinematic:play' (the camera way round the
 *                 party, `lockInput: false`, not skippable by any key) and 'cinematic:stop', the
 *                 placeholder set (set.ts, 2 draw calls).
 * Input:          moving or looking during the orbit hands the camera back (0.4 s), the strip runs
 *                 on to its end (credits:done {skipped: false}); Enter or the strip's button
 *                 „Abspann überspringen" ends the credits (skipped: true); Esc pauses; E talks.
 * Persistent:     slice `party` {variant, credits} only: no bodies (the story re-issues party:set on
 *                 resume); credits playing at save time → credits:done {skipped: true} after the load.
 * Dev:            `?party=museum|burn|keep` boots into the party at dusk and rolls the credits.
 * Debug/test API: window.kq.party (PartyHooks).
 */
import type { Mesh, Object3D } from 'three';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { addStrings } from '../../i18n';
import { PARTY_CHECKPOINT, TF01, yawTo } from './placements';
import { PartyRuntime, type PartyBus, CREDITS_CINEMATIC } from './runtime';
import { PlaceholderPartySet, type PartySet } from './set';
import { CreditsStrip } from './strip';
import { PARTY_VARIANTS, type PartySlice, type PartyVariant } from './types';
import './types';

export type { PartyCreditsRequest, PartySetRequest, PartySlice, PartyVariant } from './types';

declare module '../../core/state' {
  interface SystemStates {
    party: PartySlice;
  }
}

/** content/party/credits.json (the story team's; may not exist): `{ "lines": string[] }`. */
export function loadCreditsFile(): unknown {
  const mods = import.meta.glob<unknown>('/content/party/credits.json', { eager: true, import: 'default' });
  return Object.values(mods)[0];
}

/** Draw calls of the visible meshes under a root (stand-ins: one per skinned part). */
function meshCalls(root: Object3D | undefined): number {
  if (!root || !root.visible) return 0;
  let n = 0;
  root.traverseVisible((o) => {
    const m = o as Mesh;
    if (m.isMesh) n += Array.isArray(m.material) ? m.material.length : 1;
  });
  return n;
}

addStrings('de', {
  'party.hint': 'Enter: Abspann überspringen',
  'party.hint.camera': 'Enter: Abspann überspringen · Bewegen: selbst umsehen',
  'party.skip': 'Abspann überspringen',
});

/**
 * The explicit skip of the whole credits (also the strip's button). Esc stays pause; movement and
 * look hand the orbit camera back (runtime), E talks.
 */
const SKIP_KEYS = /^(Enter|NumpadEnter)$/;

class PartySystem {
  readonly rt: PartyRuntime;
  private hooks = false;
  /** The set builder; a 3D pass swaps this for authored meshes. */
  setBuilder: PartySet;

  constructor(private readonly ctx: GameContext) {
    this.setBuilder = new PlaceholderPartySet((x, z) => ctx.world.heightAt(x, z));
    const strip = new CreditsStrip({ hint: ctx.t('party.hint'), hintCamera: ctx.t('party.hint.camera'), button: ctx.t('party.skip') }, () => this.rt.skip());
    this.rt = new PartyRuntime({
      bus: ctx.events as unknown as PartyBus,
      people: () => ctx.people,
      buildSet: (layout, variant) => this.setBuilder.build(ctx.scene, layout, variant),
      world: {
        heightAt: (x, z) => ctx.world.heightAt(x, z),
        player: () => ({ x: ctx.player.position.x, z: ctx.player.position.z, yaw: ctx.player.yaw, pitch: ctx.player.pitch }),
        era: () => ctx.era.current,
      },
      slice: () => this.slice,
      creditsFile: loadCreditsFile,
      reduced: () => ctx.settings.state.reducedMotion === true,
      strip,
      cinematic: {
        available: () => !!ctx.systems.get('cinematic') && !ctx.systems.stats().find((s) => s.id === 'cinematic')?.failed,
      },
    });
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey, true);
    this.devEntry();
  }

  get slice(): PartySlice {
    const s = this.ctx.state.slice('party', () => ({ variant: null, credits: 'none' }));
    if (s.credits !== 'playing' && s.credits !== 'done') s.credits = 'none';
    if (!PARTY_VARIANTS.includes(s.variant as PartyVariant)) s.variant = null;
    return s;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.rt.credits || e.repeat || !SKIP_KEYS.test(e.code) || this.ctx.ui.modals.count > 0) return;
    if (this.rt.userSkip()) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  /** `?party=museum|burn|keep`: era today at the plateau checkpoint, facing the party, dusk, set, credits. */
  private devEntry(): void {
    const v = this.ctx.params.get('party');
    if (!v) return;
    if (!PARTY_VARIANTS.includes(v as PartyVariant)) {
      console.warn(`[party] ?party=${v}: use museum, burn or keep`);
      return;
    }
    const off = this.ctx.events.on('game:start', () => {
      off();
      // after the story's own game:start handler (it starts the prologue on a new game)
      setTimeout(() => {
        const ctx = this.ctx;
        if (ctx.era.current !== 'today') ctx.era.set('today');
        const p = PARTY_CHECKPOINT;
        ctx.player.teleport(p.x, p.z, yawTo(p.x, p.z, TF01.x, TF01.z));
        window.kq?.story?.look('dusk');
        ctx.events.emit('party:set', { variant: v as PartyVariant });
        ctx.events.emit('party:credits', {});
      }, 0);
    });
  }

  update(dt: number): void {
    if (!this.hooks && window.kq) this.installHooks();
    this.rt.update(dt);
  }

  frame(dt: number): void {
    if (!this.hooks && window.kq) this.installHooks();
    this.rt.frame(dt);
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooks = true;
    const rt = this.rt;
    kq.party = {
      set: (variant, at) => rt.set({ variant, at }),
      credits: (lines) => rt.startCredits(lines ? { lines } : {}),
      skip: () => rt.skip(),
      clear: () => rt.clear(),
      state: () => {
        const p = rt.party;
        const c = rt.credits;
        return {
          variant: p?.variant ?? null,
          at: p ? { ...p.layout.centre } : null,
          credits: this.slice.credits,
          t: c?.t ?? 0,
          seconds: c?.plan.seconds ?? 0,
          spotlights: [...rt.spotlights],
          people: (p?.members ?? []).map((m) => ({
            who: m.pl.who,
            spec: m.spec,
            speaker: m.pl.speaker ?? null,
            x: m.person?.root.position.x ?? m.pl.x,
            z: m.person?.root.position.z ?? m.pl.z,
            activity: m.pl.activity,
          })),
          dogs: [...(p?.dogs ?? [])],
        };
      },
      stats: () => {
        const p = rt.party;
        const people = this.ctx.people;
        const roots = (p?.members ?? []).map((m) => (m.person && people?.get(m.person.id)?.root) || undefined);
        const fauna = this.ctx.fauna;
        let dogCalls = 0;
        for (const id of p?.dogs ?? []) {
          const a = fauna?.list().find((b) => b.specId === `dog.${id}`);
          dogCalls += meshCalls(a?.root);
        }
        return {
          bodies: roots.filter(Boolean).length,
          dogs: p?.dogs.length ?? 0,
          setDrawCalls: p?.set?.drawCalls() ?? 0,
          bodyDrawCalls: roots.reduce((n, r) => n + meshCalls(r), 0),
          dogDrawCalls: dogCalls,
        };
      },
    };
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey, true);
    this.rt.dispose();
  }
}

let sys: PartySystem | null = null;

export { CREDITS_CINEMATIC };

export default defineSystem({
  id: 'party',
  after: ['people', 'animals', 'npc', 'cinematic'],
  init(ctx) {
    sys = new PartySystem(ctx);
  },
  update(dt) {
    sys?.update(dt);
  },
  frame(dt) {
    sys?.frame(dt);
  },
  dispose() {
    sys?.dispose();
    sys = null;
  },
});
