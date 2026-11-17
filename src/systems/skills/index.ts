/**
 * Skills (PRD §6.1, bible 00-overview §4): Relief-Blick, Kartograf, Baumeister, Röntgenblick,
 * Spurenleser. Levels live in `state.skills` (numbers); the rules are in logic.ts.
 *
 * - `skill:grant {skill, level, quiet?}` (contracts.ts) raises a level (never lowers it). Story's
 *   `{do:'skill'}` action writes `state.skills` directly; both paths end in the same place: this
 *   system watches `state.skills` and shows an unlock card for every increase (not on load / new
 *   game), plays a stamp + chime and lets Laub comment (`dialogue:say`, only once
 *   `flags['story.laub']` is set, or without a running story). Emits `skill:unlocked`.
 * - The gating itself is applied by the tools that use the skills: survey (scan 1–3, M map
 *   layers) and tools (R measure, V/4 Röntgenblick, B plans, pack routes). Hunt reads
 *   `skills.spurenleser` for the horn captions.
 * - Settings rows (Rauhnacht, sound captions, sound indicators, graphics quality) and the key
 *   help entries are registered here (see settings.ts).
 *
 * Debug: window.kq.skills (see SkillsHooks). URL: `?skills=all` (every tool open),
 * `?skills=strict` (gating even without a story).
 */
import './strings';
import './skills.css';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { stampChime } from './audio';
import { UnlockCards } from './card';
import { type Gate, SKILL_IDS, SKILL_MAX, type SkillId, gateFrom, levelOf, parseSkill, roman, setFreeOverride, skillIncreases } from './logic';
import { installSettings } from './settings';

export interface SkillsHooks {
  /** Raise a skill ('kartograf', 3) or ('kartograf:3'); shows the card unless quiet. */
  grant(skill: string, level?: number, quiet?: boolean): void;
  /** Set every skill to its maximum (quiet by default). */
  all(quiet?: boolean): void;
  /** Reset all skills to 0 (debug). */
  reset(): void;
  levels(): Record<string, number>;
  /** Current gate (skills + free survey flag). */
  gate(): Gate;
  /** Force free survey on/off (null = automatic). */
  free(on: boolean | null): void;
  /** The card currently on screen. */
  card(): { skill: string; level: number } | null;
  /** Lines Laub said for unlocks (debug/tests). */
  said(): string[];
}

declare module '../../debug/hooks' {
  interface KqHooks {
    skills?: SkillsHooks;
  }
}

let cards: UnlockCards | null = null;
/** window.kq is installed after the systems' init: hooks go in on the first frame. */
let skillHooks: SkillsHooks | null = null;
let snapshot: Record<string, number> = {};
const said: string[] = [];

/** Is the story running (prologue started, not finished)? */
function storyRunning(ctx: GameContext): boolean {
  const s = (ctx.state.state.systems as Record<string, unknown>)['story'] as { active?: boolean } | undefined;
  return !!s?.active;
}

const skillGate = (ctx: GameContext): Gate => gateFrom(ctx.state.state, ctx.params);

function copySkills(ctx: GameContext): Record<string, number> {
  return { ...ctx.state.state.skills };
}

function grant(ctx: GameContext, spec: string, level?: number, quiet = false): void {
  const g = parseSkill(spec, level);
  if (!g) {
    console.warn(`[skills] unknown skill '${spec}'`);
    return;
  }
  if (levelOf(ctx.state.state.skills, g.skill) >= g.level) return;
  if (quiet) {
    ctx.state.mutable.skills[g.skill] = g.level;
    snapshot = copySkills(ctx);
    ctx.state.notify('skills-quiet');
    return;
  }
  ctx.state.update((st) => (st.skills[g.skill] = g.level), 'skill');
  ctx.save.autosave('skill');
}

function onUnlocked(ctx: GameContext, skill: SkillId, level: number): void {
  cards?.push({ skill, level });
  ctx.events.emit('skill:unlocked', { skill, level });
}

function laubLine(ctx: GameContext, skill: SkillId, level: number): void {
  const laubTalks = ctx.state.state.flags['story.laub'] === true || !storyRunning(ctx);
  if (!laubTalks) return;
  const key = `skills.laub.${skill}.${level}`;
  const text = ctx.t(key);
  if (text === key) return;
  said.push(key);
  ctx.events.emit('dialogue:say', { speaker: 'laub', text, id: `laub.skill.${skill}.${level}`, fiction: true });
}

export default defineSystem({
  id: 'skills',
  init(ctx) {
    installSettings(ctx);
    const layer = ctx.ui.layer('skills');
    layer.classList.remove('kq-hidden');
    layer.style.pointerEvents = 'none';
    cards = new UnlockCards(layer);
    cards.onStamp = (req) => {
      stampChime(ctx.audio, req.level);
      laubLine(ctx, req.skill, req.level);
    };
    // a level card coming up takes the waiting unlocks along (one card, not two: src/ui/cards.ts)
    ctx.ui.cards.source('skill', () =>
      (cards?.drain() ?? []).map((req) => {
        laubLine(ctx, req.skill, req.level);
        return {
          name: ctx.t(`skills.name.${req.skill}`),
          tier: roman(req.level),
          key: ctx.t(`skills.key.${req.skill}.${req.level}`),
          desc: ctx.t(`skills.desc.${req.skill}.${req.level}`),
        };
      }),
    );
    snapshot = copySkills(ctx);

    // any writer of state.skills (story action, skill:grant, chronik) → card for each increase
    ctx.state.subscribe((st, reason) => {
      if (reason === 'new' || reason === 'load' || reason === 'replace' || reason === 'skills-quiet') {
        if (reason !== 'skills-quiet') cards?.clear();
        snapshot = { ...st.skills };
        return;
      }
      const ups = skillIncreases(snapshot, st.skills);
      if (!ups.length) return;
      snapshot = { ...st.skills };
      for (const u of ups) onUnlocked(ctx, u.skill, u.level);
    });
    ctx.events.on('skill:grant', ({ skill, level, quiet }) => grant(ctx, skill, level, quiet));
    ctx.events.on('save:loaded', () => {
      snapshot = copySkills(ctx);
      cards?.clear();
    });

    {
      skillHooks = {
        grant: (skill, level, quiet) => grant(ctx, skill, level, quiet),
        all: (quiet = true) => {
          for (const id of SKILL_IDS) grant(ctx, id, SKILL_MAX[id], quiet);
        },
        reset: () => {
          ctx.state.mutable.skills = {};
          snapshot = {};
          cards?.clear();
          ctx.state.notify('skills-quiet');
        },
        levels: () => ({ ...ctx.state.state.skills }),
        gate: () => skillGate(ctx),
        free: (on) => setFreeOverride(on),
        card: () => cards?.showing ?? null,
        said: () => said.slice(),
      };
    }
  },
  frame(dt, ctx) {
    if (skillHooks && typeof window !== 'undefined' && window.kq && window.kq.skills !== skillHooks) window.kq.skills = skillHooks;
    if (!cards) return;
    const storyCard = typeof document !== 'undefined' && !!document.querySelector('.kqs-card.kqs-show, .kqs-curtain.kqs-show, .kqs-choice-card.kqs-show, .kqq-reward:not(.kqq-out)');
    let hold = ctx.ui.modals.count > 0 || ctx.pause.reasons.has('title') || storyCard || ctx.ui.hud.inAction;
    // one centre card at a time (src/ui/cards.ts)
    if (cards.wants && !hold && !ctx.ui.cards.claim('skill')) hold = true;
    // game time: a card on screen waits while the game is paused (modal, menu) instead of running out unseen
    cards.frame(ctx.pause.paused ? 0 : Math.min(dt, 0.1), ctx.settings.state.reducedMotion, hold);
    if (!cards.wants) ctx.ui.cards.release('skill');
  },
  dispose() {
    cards?.clear();
    cards = null;
  },
});
