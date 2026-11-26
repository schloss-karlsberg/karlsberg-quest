/** Run in page.evaluate. Advance the opening presenter up to a fixed simulation-tick budget. */
export function drainDialogue({ chunks, ticksPerChunk }: { chunks: number; ticksPerChunk: number }) {
  const { story, ctx } = window.kq!;
  story!.flush();
  let state = story!.state();
  for (let i = 0; i < chunks && (state.dialogue !== null || state.pendingLines > 0); i++) {
    ctx.loop.advance(ticksPerChunk);
    state = story!.state();
  }
  const { dialogue, pendingLines } = state;
  return { dialogue: dialogue === null ? null : { id: dialogue.id, text: dialogue.text }, pendingLines };
}
