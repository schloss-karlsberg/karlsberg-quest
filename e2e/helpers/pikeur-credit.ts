export function setupPikeurCredit(quest: string): void {
  const k = window.kq!;
  k.quests!.offer(quest);
  k.quests!.accept(quest);
  // The earlier Orangerie echo shares Landremont's interaction spot.
  k.ctx.state.mutable.inventory.clues.push('clue.k2.orangerie', 'clue.k2.fackeln');
  // Jump past the chase, then override the chapter checkpoint to start at the dam.
  k.story!.goto('k2', 'k2_11');
  k.setEra('1793-02');
  k.teleport(842, -878, 270, 0);
  k.combat!.god(true);
}
