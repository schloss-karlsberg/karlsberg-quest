import type { TouchIcon } from '../player/touchMap';

/**
 * Inline SVG icons of the touch controls (drawn for this project, no external assets). 24×24,
 * `currentColor`, so the HUD prompt and the buttons tint them alike.
 */
const S = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const TOUCH_ICONS: Record<TouchIcon | 'skill' | 'up' | 'down' | 'shutter', string> = {
  // an open hand reaching
  interact: S('<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M8 11.5 6.6 10a1.6 1.6 0 0 0-2.4 2.1l3.4 4.7A6 6 0 0 0 12.5 20H13a4 4 0 0 0 4-4v-3"/>'),
  // the surveyor's staff, swung, with a strike mark
  attack: S('<path d="M5 19 17 7"/><path d="M15.5 5.5l3 3"/><path d="M19 13l2 1M17 16.5l1.5 1.5M13.5 18l.5 2"/>'),
  // a swerving roll
  dodge: S('<path d="M4 16c3 0 4-8 9-8 3 0 4.5 2 5 4"/><path d="M15.5 11.5 18 12.5l1-2.6"/><circle cx="6" cy="8" r="1.6"/>'),
  // the lantern with a flare
  bannlicht: S('<path d="M10 4h4M12 2v2M9 6h6l-1 2h-4z"/><path d="M9.5 8v8h5V8M8.5 16h7l-.8 2h-5.4z"/><path d="M3 9l3 1M3 14l3-1M21 9l-3 1M21 14l-3-1"/>'),
  // an hourglass
  shift: S('<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>'),
  // a feather
  fly: S('<path d="M5 19 15 9"/><path d="M8.5 15.5C7 10 11 4 19 4c0 8-6 12-11.5 11.5z"/><path d="M11 13h3.5M13 10.5h3"/>'),
  // a folded map
  map: S('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  // a balm jar
  balm: S('<path d="M8 5h8v3H8z"/><path d="M7 8h10l-.6 11a1.5 1.5 0 0 1-1.5 1.4H9.1a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M12 11v5M9.5 13.5h5"/>'),
  // a target ring
  lock: S('<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  // down
  down: S('<path d="M12 4v15M6 13l6 6 6-6"/>'),
  // a figure crouched low (sneaking)
  crouch: S('<circle cx="14" cy="5.5" r="2"/><path d="M13 8.5 9.5 13l3.5 2-1.5 5"/><path d="M9.5 13 6 14.5M13 15l4.5-1 .5 6"/><path d="M12.5 9.5l3.5 2"/>'),
  // a figure lying flat
  prone: S('<circle cx="18.5" cy="12.5" r="2"/><path d="m3 16 6-1.5h5l3.5 1.5H21M3 20h18"/>'),
  // the lantern's handle, frame and flame
  lantern: S('<path d="M10 5V4a2 2 0 0 1 4 0v1M8 6h8l2 13H6L8 6ZM6 19h12v2H6zM12 10c0 2-2 2.5-2 4a2 2 0 0 0 4 0c0-1.5-2-2-2-4Z"/>'),
  // look / aim has no button: a neutral swipe hint (two arrows apart)
  look: S('<path d="M3.5 12h17M7 8.5 3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5"/>'),
  // up
  up: S('<path d="M12 20V5M6 11l6-6 6 6"/>'),
  // relief contours
  relief: S('<path d="M2 19l6-9 4 5 3-4 7 8z"/><path d="M5.5 15h5M14 15h4"/>'),
  // pause bars
  pause: S('<path d="M9 5v14M15 5v14" stroke-width="2.6"/>'),
  // a smartphone with its camera lens (photo mode, N)
  photo: S('<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><circle cx="12" cy="9.5" r="2.6"/><path d="M10.5 18.5h3"/>'),
  // the shutter: a ring with the aperture blades
  shutter: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5 15 12M20.5 12 12 15M12 20.5 9 12M3.5 12 12 9"/>'),
  // a star burst for the abilities
  skill: S('<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>'),
};
