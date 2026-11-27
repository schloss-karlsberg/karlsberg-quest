import type { Object3D } from 'three';

interface RenderWork {
  calls: number;
  triangles: number;
}

/** Run directly in page.evaluate to keep each hidden/visible pair in the same render pass. */
export async function sampleRenderWork({ groupIds, frames, ticksPerFrame }: {
  groupIds: string[];
  frames: number;
  ticksPerFrame: number;
}) {
  const k = window.kq!;
  const { perf, renderer, scene, camera } = k.ctx;
  const group = groupIds.map((id) => k.ctx.people!.get(id)!);
  const ready = await Promise.all(group.map((person) => person.ready));
  await k.screenshotReady();

  const owners = new Map<Object3D, string>();
  for (const { id, root } of group) root.traverse((object) => owners.set(object, id));
  const seen = new Set<string>();
  const missing = new Set<string>();
  const zero = (): RenderWork => ({ calls: 0, triangles: 0 });
  const read = (): RenderWork => {
    const { calls, triangles } = renderer.info.render;
    return { calls, triangles };
  };
  const diff = (a: RenderWork, b: RenderWork): RenderWork => ({ calls: a.calls - b.calls, triangles: a.triangles - b.triangles });
  const peak = (a: RenderWork, b: RenderWork): RenderWork => ({ calls: Math.max(a.calls, b.calls), triangles: Math.max(a.triangles, b.triangles) });
  let probe = zero();
  let delta = zero();
  const render = renderer.render;
  const draw = renderer.renderBufferDirect;
  renderer.render = (passScene, passCamera) => {
    if (passScene !== scene) {
      render.call(renderer, passScene, passCamera);
      return;
    }
    const visibility = group.map(({ root }) => root.visible);
    const before = read();
    try {
      for (const { root } of group) root.visible = false;
      render.call(renderer, passScene, passCamera);
    } finally {
      group.forEach(({ root }, i) => { root.visible = visibility[i]!; });
    }
    const afterProbe = read();
    const hidden = diff(afterProbe, before);
    // Leave the real render last, including its shadow map or image.
    render.call(renderer, passScene, passCamera);
    const added = diff(diff(read(), afterProbe), hidden);
    probe.calls += hidden.calls;
    probe.triangles += hidden.triangles;
    delta.calls += added.calls;
    delta.triangles += added.triangles;
  };
  renderer.renderBufferDirect = (...args) => {
    const [passCamera, passScene, , , object] = args;
    const id = passScene === scene && passCamera === camera ? owners.get(object) : undefined;
    const before = renderer.info.render.triangles;
    draw.apply(renderer, args);
    if (id !== undefined && renderer.info.render.triangles > before) seen.add(id);
  };

  const start = perf.frames;
  let empty = zero();
  let populated = zero();
  let added = zero();
  try {
    for (let i = 0; i < frames; i++) {
      seen.clear();
      probe = zero();
      delta = zero();
      k.step(ticksPerFrame, { draw: true }); // every frame drawn: the render work is measured per frame
      const visible = diff(read(), probe); // remove the duplicate hidden draws from the frame total
      populated = peak(populated, visible);
      empty = peak(empty, diff(visible, delta));
      added = peak(added, delta);
      for (const id of groupIds) if (!seen.has(id)) missing.add(id);
    }
  } finally {
    renderer.render = render;
    renderer.renderBufferDirect = draw;
  }
  return { frames: perf.frames - start, empty, populated, added, loaded: ready.filter(Boolean).length, missing: [...missing] };
}
