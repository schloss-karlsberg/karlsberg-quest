/** Hold decorative motion at its resting phase while leaving the gameplay clock alone. */
export function motionTime(time: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : time;
}

/** Scale full-screen flashes and shift colour separation for both accessibility settings. */
export function screenFlashScale(reducedMotion: boolean, reducedFlash: boolean): number {
  return reducedMotion ? 0 : reducedFlash ? 0.2 : 1;
}

/** Keep the fade covering a scene cut while shortening its visual transition. */
export function storyFadeSeconds(seconds: number, reducedMotion: boolean): number {
  return Math.max(0, reducedMotion ? Math.min(seconds, 0.2) : seconds);
}
