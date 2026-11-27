/** Run in page.evaluate. Give queued renders time to finish, then observe without requesting a frame. */
export async function observeRenderFrames({ drain, callbacks }: { drain: number; callbacks: number }) {
  const { loop } = window.kq!.ctx;
  const next = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  for (let i = 0; i < drain; i++) await next();
  const before = loop.drawn;
  for (let i = 0; i < callbacks; i++) await next();
  return { before, after: loop.drawn };
}
