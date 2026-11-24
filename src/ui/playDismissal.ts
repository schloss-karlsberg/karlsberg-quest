interface PlayDismissalDeps {
  dismissCredits(): boolean;
  dismissNotice(): boolean;
  openPause(): void;
}

/** The same dismissal order for Escape and for browsers that report only a pointer-lock exit. */
export function createPlayDismissal({ dismissCredits, dismissNotice, openPause }: PlayDismissalDeps) {
  let hadLock = false;

  function dismiss(pauseIfUnhandled: boolean): boolean {
    if (dismissCredits() || dismissNotice()) return true;
    if (pauseIfUnhandled) openPause();
    return false;
  }

  return {
    escape(): boolean {
      // If the browser reports an unlock after this key, both events came from the same press.
      hadLock = false;
      return dismiss(true);
    },
    pointerLockChanged(locked: boolean, selfRelease: boolean, inPlay: boolean, pauseOnUnlock: boolean): void {
      const lost = hadLock && !locked;
      hadLock = locked;
      if (lost && !selfRelease && inPlay) dismiss(pauseOnUnlock);
    },
  };
}
