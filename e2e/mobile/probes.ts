/** These probes run inside page.evaluate and keep their browser dependencies local. */

export function pauseDialogueHit(button: HTMLElement): 'paper' | 'obstructed' | 'no-dialogue' | 'no-intersection' {
  const paper = button.closest('.kq-modal')!;
  const dialogue = document.querySelector('.kqs-dlg.kqs-show .kqs-dlg-body');
  if (!dialogue?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return 'no-dialogue';
  const a = paper.getBoundingClientRect();
  const b = dialogue.getBoundingClientRect();
  const left = Math.max(a.left, b.left, 0);
  const right = Math.min(a.right, b.right, window.innerWidth);
  const top = Math.max(a.top, b.top, 0);
  const bottom = Math.min(a.bottom, b.bottom, window.innerHeight);
  if (left >= right || top >= bottom) return 'no-intersection';
  const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  return paper.contains(hit) ? 'paper' : 'obstructed';
}

/** Check the text fragments and the settled stamp inside the card's overflow clip. */
export function clippedSkillCardContent(card: HTMLElement): string[] {
  const bounds = card.getBoundingClientRect();
  const style = getComputedStyle(card);
  const clip = {
    left: bounds.left + parseFloat(style.borderLeftWidth),
    top: bounds.top + parseFloat(style.borderTopWidth),
    right: bounds.right - parseFloat(style.borderRightWidth),
    bottom: bounds.bottom - parseFloat(style.borderBottomWidth),
  };
  const inside = (r: DOMRect) => r.left >= clip.left - 1 && r.top >= clip.top - 1 && r.right <= clip.right + 1 && r.bottom <= clip.bottom + 1;
  const problems: string[] = [];
  const stamp = card.querySelector('.kqk-stamp');
  if (!stamp?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) problems.push('missing stamp');
  else if (!inside(stamp.getBoundingClientRect())) problems.push('clipped stamp');

  const body = card.querySelector('.kqk-body');
  if (!body) return [...problems, 'missing text'];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let fragments = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (!text) continue;
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    fragments += rects.length;
    if (rects.some((r) => !inside(r))) problems.push(`clipped text: ${text}`);
  }
  if (!fragments) problems.push('missing text');
  return problems;
}
