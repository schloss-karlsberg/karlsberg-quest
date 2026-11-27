export const isCI = !!process.env.CI;
export const desktopViewport = { width: 1280, height: 720 };

/** Give hosted SwiftShader more wall time without changing local or simulated time. */
export function ciScale(ms: number): number {
  return isCI ? ms * 3 : ms;
}
