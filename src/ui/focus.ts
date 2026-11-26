/** Sequential keyboard stops in DOM order, matching native radio and details behavior. */
export function tabStops(root: HTMLElement): HTMLElement[] {
  const candidates = [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') &&
      el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible',
  );
  return candidates.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
    const group = candidates.filter((radio): radio is HTMLInputElement => radio instanceof HTMLInputElement &&
      radio.type === 'radio' && radio.name === el.name && radio.form === el.form);
    return el === (group.find((radio) => radio.checked) ?? group[0]);
  });
}

/** Let the browser handle ordinary Tab navigation, wrapping at the dialog's edges. */
export function wrapTab(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab' || e.defaultPrevented) return;
  const stops = tabStops(root);
  const first = stops[0];
  const last = stops.at(-1);
  const active = document.activeElement;
  if (!root.contains(active) || active === root || active === (e.shiftKey ? first : last) || !first) {
    e.preventDefault();
    (e.shiftKey ? last ?? root : first ?? root).focus();
  }
}

/** Restore a journal control after a rerender, or use the next surviving control. */
export function preserveFocus(root: HTMLElement, render: () => void): void {
  const active = document.activeElement;
  const hadFocus = active instanceof HTMLElement && root.contains(active);
  const before = hadFocus ? tabStops(root) : [];
  render();
  if (!hadFocus || active.isConnected || document.activeElement !== document.body) return;
  const after = tabStops(root);
  const id = active.dataset.testid;
  const match = id ? after.find((el) => el.dataset.testid === id) : undefined;
  (match ?? after[Math.min(Math.max(0, before.indexOf(active)), after.length - 1)] ??
    root.closest<HTMLElement>('[role="dialog"]'))?.focus({ preventScroll: true });
}
