import type { GameContext } from '../../core/context';
import { QuietGate } from '../../core/quiet';
import { BAUWAGEN_DOOR, BAUWAGEN_SET } from './bauwagen';

export const BAUWAGEN_FACT = 'cx.48';
const OWNER = BAUWAGEN_SET.id;
const REACH = 3.4;

/** A local, one-step easter egg. Its Codex card doubles as the saved discovery record. */
export class BauwagenDiscovery {
  private readonly quiet: QuietGate;
  private readonly offEra: () => void;
  private prompting = false;

  constructor(private readonly ctx: GameContext) {
    this.quiet = new QuietGate(ctx.events, () => this.prompt(false));
    this.offEra = ctx.events.on('era:change', () => this.prompt(false));
  }

  update(built: boolean): void {
    if (!built || this.ctx.era.current !== 'today' || this.quiet.quiet) {
      this.prompt(false);
      return;
    }
    const { player, input, ui, state, content, events, save } = this.ctx;
    const fact = content.facts.get(BAUWAGEN_FACT);
    const facts = state.mutable.codex.facts;
    const flags = state.state.flags;
    const canUse = fact && !facts.includes(fact.id) && !player.flying && !player.frozen && input.enabled && ui.modals.count === 0
      && !flags['npc.near'] && !flags['e.owner'];
    this.prompt(!!canUse && this.atDoor(player.position, player.yaw));
    if (!fact || !this.prompting || ui.hud.promptOwner() !== OWNER || !input.wasPressed('listen')) return;

    this.prompt(false);
    facts.push(fact.id);
    events.emit('codex:unlocked', { factId: fact.id, noXp: true });
    events.emit('discovery:found', { title: fact.title_de });
    save.autosave(OWNER, true);
  }

  private atDoor(p: { x: number; y: number; z: number }, yaw: number): boolean {
    const dx = BAUWAGEN_DOOR.x - p.x;
    const dz = BAUWAGEN_DOOR.z - p.z;
    const d = Math.hypot(dx, dz);
    return dz < 0 && d <= REACH && -Math.sin(yaw) * dx - Math.cos(yaw) * dz >= 0.35 * d
      && Math.abs(p.y - this.ctx.world.heightAt(BAUWAGEN_DOOR.x, BAUWAGEN_DOOR.z)) <= 1.6;
  }

  private prompt(show: boolean): void {
    if (show === this.prompting) return;
    this.prompting = show;
    this.ctx.ui.hud.prompt(show ? 'E' : null, show ? this.ctx.t('bauwagen.examine') : undefined, OWNER, { low: true });
  }

  dispose(): void {
    this.offEra();
    this.quiet.dispose();
    this.prompt(false);
  }
}
