/** Run directly in page.evaluate. Each call to step advances the game and draws once. */
export function sampleRenderWork({ frames, ticksPerFrame }: { frames: number; ticksPerFrame: number }) {
  const k = window.kq!;
  const { perf, renderer } = k.ctx;
  const start = perf.frames;
  let calls = 0;
  let triangles = 0;
  for (let i = 0; i < frames; i++) {
    k.step(ticksPerFrame);
    calls = Math.max(calls, renderer.info.render.calls);
    triangles = Math.max(triangles, renderer.info.render.triangles);
  }
  return { frames: perf.frames - start, calls, triangles };
}
