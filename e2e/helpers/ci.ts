export const isCI = !!process.env.CI;
export const desktopViewport = { width: 1280, height: 720 };
/** Default viewport of the hosted e2e run (playwright.config.ts). */
export const ciViewport = { width: 640, height: 360 };

/** Give hosted SwiftShader more wall time without changing local or simulated time. */
export function ciScale(ms: number): number {
  return isCI ? ms * 3 : ms;
}
