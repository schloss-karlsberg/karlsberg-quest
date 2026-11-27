import { de } from './de.ts';
import { deContent } from './de.content.ts';

/**
 * Tiny i18n layer. German only for now; English is planned for 1.0.
 *   t('pause.title')                  → 'Pause'
 *   t('title.loading', { pct: 40 })   → 'Gelände wird geladen … 40 %'
 * Unknown keys use the localized fallback and log the missing key once.
 */
export type Locale = 'de';

const tables: Record<Locale, Record<string, string>> = { de: Object.assign(Object.create(null), de) };
let locale: Locale = 'de';
const warned = new Set<string>();

export function setLocale(l: Locale): void {
  locale = l;
}

export function getLocale(): Locale {
  return locale;
}

/** Feature systems register their own strings (keys should be prefixed with the system id). */
export function addStrings(l: Locale, strings: Record<string, string>): void {
  Object.assign(tables[l], strings);
}

export function hasString(key: string): boolean {
  return key in tables[locale];
}

/**
 * `t` for a line that names keys: in touch mode the `<key>.touch` variant (touch words instead of
 * keys, e.g. „Bewegungsregler“), when one is registered; otherwise the keyboard text.
 */
export function tInput(key: string, touch: boolean, params?: Record<string, string | number>): string {
  return t(touch && hasString(`${key}.touch`) ? `${key}.touch` : key, params);
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = tables[locale][key];
  if (s === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing string '${key}'`);
    }
    s = de['common.missingText']!;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (Object.hasOwn(params, k) ? String(params[k]) : m));
  return s;
}

// UI texts from the content bible (09-ui-texte.md); 'ui.*' keys, registered like any feature's strings.
addStrings('de', deContent);
