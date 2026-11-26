/**
 * Item glyphs: small engraved SVGs (24×24, stroke = currentColor), procedural — no assets (D-007).
 * One per item family; the HUD, the feed and the Ausrüstung tab share them.
 */
import type { ItemDef } from '../../rpg/types';

const G = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<string, string> = {
  // the ranging pole: banded red / white, iron shoe
  stab: G(`<path d="M5 20L19 4"/><path d="M7.4 17.3l1.8-2M11 13.2l1.8-2M14.6 9.1l1.8-2" stroke-width="3.2" opacity=".55"/><path d="M3.6 21.6l2-1.2" stroke-width="2.6"/><circle cx="19.4" cy="3.6" r="1.1" fill="currentColor"/>`),
  // a coin on a cord
  charm: G(`<path d="M8 3c0 3 1.6 5 4 6M16 3c0 3-1.6 5-4 6"/><circle cx="12" cy="15" r="6"/><circle cx="12" cy="15" r="3.4" opacity=".6"/><path d="M12 12.6v4.8M9.6 15h4.8" opacity=".7"/>`),
  // a jar of balm
  balsam: G(`<path d="M7 9h10v9a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z"/><path d="M6 6.5h12V9H6z"/><path d="M9.5 13.5c1.5-1.4 3.5-1.4 5 0" opacity=".7"/><path d="M12 13v4" opacity=".7"/>`),
  // smelling salts: a stoppered vial
  riechsalz: G(`<path d="M10 3h4v3h-4z"/><path d="M9 6h6l1 4v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9z"/><path d="M9.5 14h5M10 17h4" opacity=".6"/><path d="M17.5 4.5c1 .8 1.4 1.8 1.2 3M19.5 2.8c1.4 1.2 2 2.8 1.7 4.6" opacity=".55"/>`),
  // lamp oil: a drop over a small can
  lampenoel: G(`<path d="M12 2.5c2.4 3.2 3.6 5.2 3.6 6.8a3.6 3.6 0 0 1-7.2 0c0-1.6 1.2-3.6 3.6-6.8z"/><path d="M6 15h12v6H6z"/><path d="M18 16.5l2.5-1.5" /><path d="M9 18h6" opacity=".6"/>`),
  // a pouch of quicklime, dust rising
  kalkstaub: G(`<path d="M7 11c-1.5 2-2 4.6-1 7 1 2.2 3.4 3 6 3s5-.8 6-3c1-2.4.5-5-1-7z"/><path d="M8 11h8M9.5 11c0-1.4.8-2.4 2.5-2.4s2.5 1 2.5 2.4"/><circle cx="9" cy="5" r=".8" fill="currentColor"/><circle cx="13" cy="3.6" r=".8" fill="currentColor"/><circle cx="15.6" cy="6" r=".7" fill="currentColor"/>`),
  // a folded note with a seal
  quest: G(`<path d="M5 4h11l3 3v13H5z"/><path d="M16 4v3h3"/><path d="M8 9h7M8 12h8M8 15h5" opacity=".6"/><circle cx="15.5" cy="17" r="2.2" fill="currentColor" opacity=".85"/>`),
  // a loose page (lore)
  lore: G(`<path d="M6 3.5l10 .8 2.5 3-1 13.4L5 20z"/><path d="M8.5 8.5l7 .4M8.3 11.6l7.5.4M8.1 14.7l5.4.3" opacity=".6"/><path d="M5.6 17.5c2-.6 3.8-.2 5.4.6" opacity=".5"/>`),
  // the hunting horn
  horn: G(`<path d="M3.5 9c6 .5 11-1 15.5-5v10c-4.5-3-9.5-3.4-15.5-2.6z"/><path d="M3.5 8.5v4" stroke-width="2.4"/><path d="M8 11.2c0 3 1.6 5.6 4.4 6.6" opacity=".7"/>`),
  // a tag (dog collar mark)
  marke: G(`<path d="M8 4h8l3 4-7 13L5 8z"/><circle cx="12" cy="8" r="1.4"/><path d="M9.5 12.5l5 0" opacity=".6"/>`),
  // a sweet chestnut: wider than tall, a tassel at the tip, the pale rough base as a dotted band
  kastanie: G(`<path d="M12 6.5c-1 1-2.6 1.8-4.4 2.7C5 10.5 3.5 12.6 3.5 15c0 3.2 3.8 5.5 8.5 5.5s8.5-2.3 8.5-5.5c0-2.4-1.5-4.5-4.1-5.8-1.8-.9-3.4-1.7-4.4-2.7z"/><path d="M12 6.5L11 3.6M12 6.5l1-2.9M12 6.5V3"/><path d="M4.6 16.6c4.6 2 10.2 2 14.8 0"/><path d="M7.5 18.6h.01M10.5 19.2h.01M13.5 19.2h.01M16.5 18.6h.01" stroke-width="1.4"/><path d="M8 11.2c1-.7 2-1.1 3-1.3" opacity=".55"/>`),
  // a marked stone
  stein: G(`<path d="M4 15c0-4.5 3.5-9 8.5-9S20 9.5 20 14c0 3.5-3 6-8 6s-8-1.8-8-5z"/><path d="M9 14l3-4 3 4M10.5 16.5h.01M12 16.5h.01M13.5 16.5h.01" />`),
};

/** The glyph for an item (by id, then by kind / set). */
export function iconFor(id: string, def?: ItemDef): string {
  if (id.startsWith('item.stab.')) return ICONS['stab']!;
  if (id === 'item.horn') return ICONS['horn']!;
  for (const k of ['balsam', 'riechsalz', 'lampenoel', 'kalkstaub', 'kastanie'] as const) if (id === `item.${k}`) return ICONS[k]!;
  if (def?.set === 'hundemarken') return ICONS['marke']!;
  if (def?.set === 'steinzeichen') return ICONS['stein']!;
  switch (def?.kind) {
    case 'weapon':
      return ICONS['stab']!;
    case 'charm':
      return ICONS['charm']!;
    case 'consumable':
      return ICONS['balsam']!;
    case 'lore':
      return ICONS['lore']!;
    case 'key':
      return ICONS['horn']!;
    default:
      return ICONS['quest']!;
  }
}

/** Roman numerals for levels (I … XII). */
export function roman(n: number): string {
  const r: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let v = Math.max(0, Math.floor(n));
  for (const [k, s] of r)
    while (v >= k) {
      out += s;
      v -= k;
    }
  return out;
}
