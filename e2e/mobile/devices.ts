/**
 * The mobile UI pass device matrix (docs/MOBILE-UI-PASS.md). One entry = one runnable unit of the
 * tour (e2e/mobile/tour.pw.ts), small enough to hold the machine-wide heavy lock for ≤ 15 min.
 *
 * Insets are typical values for the device class (CSS px): a notch / island phone in portrait
 * (top + home indicator), the same phone turned (left + right + home indicator), a tablet's status
 * bar. They are emulated per unit (CDP `Emulation.setSafeAreaInsetsOverride`, else a CSS fallback;
 * see the tour) and checked geometrically either way.
 */
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MobileUnit {
  id: string;
  label: string;
  width: number;
  height: number;
  dpr: number;
  portrait: boolean;
  /** Phones are landscape-only for gameplay: the portrait unit shoots the title, menus and the rotate overlay only. */
  phonePortrait: boolean;
  insets: SafeInsets;
  userAgent: string;
}

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const TABLET_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const unit = (id: string, label: string, w: number, h: number, dpr: number, kind: 'phone' | 'tablet', insets: SafeInsets): MobileUnit => ({
  id,
  label,
  width: w,
  height: h,
  dpr,
  portrait: h > w,
  phonePortrait: kind === 'phone' && h > w,
  insets,
  userAgent: kind === 'phone' ? PHONE_UA : TABLET_UA,
});

/** In run order: the small phone landscape first (the tightest playable layout), the tablet last. */
export const MOBILE_UNITS: MobileUnit[] = [
  unit('small-landscape', 'small phone 667×375 landscape', 667, 375, 3, 'phone', { top: 0, right: 47, bottom: 21, left: 47 }),
  unit('small-portrait', 'small phone 375×667 portrait', 375, 667, 3, 'phone', { top: 47, right: 0, bottom: 34, left: 0 }),
  unit('large-landscape', 'large phone 932×430 landscape', 932, 430, 3, 'phone', { top: 0, right: 59, bottom: 21, left: 59 }),
  unit('large-portrait', 'large phone 430×932 portrait', 430, 932, 3, 'phone', { top: 59, right: 0, bottom: 34, left: 0 }),
  unit('tablet-landscape', 'tablet 1180×820 landscape', 1180, 820, 2, 'tablet', { top: 24, right: 0, bottom: 20, left: 0 }),
  unit('tablet-portrait', 'tablet 820×1180 portrait', 820, 1180, 2, 'tablet', { top: 24, right: 0, bottom: 20, left: 0 }),
];

export function findUnit(id: string): MobileUnit {
  const u = MOBILE_UNITS.find((x) => x.id === id);
  if (!u) throw new Error(`unknown mobile unit "${id}"; one of: ${MOBILE_UNITS.map((x) => x.id).join(', ')}`);
  return u;
}
