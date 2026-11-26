import { de } from './de';
import { deContent } from './de.content';

/**
 * Tiny i18n layer. German only for now; English is planned for 1.0.
 *   t('pause.title')                  → 'Pause'
 *   t('title.loading', { pct: 40 })   → 'Gelände wird geladen … 40 %'
 * Unknown keys use the localized fallback and log the missing key once.
 */
export type Locale = 'de';

const tables: Record<Locale, Record<string, string>> = { de: { ...de } };
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

export function t(key: string, params?: Record<string, string | number>): string {
  let s = tables[locale][key];
  if (s === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing string '${key}'`);
    }
    s = de['common.missingText']!;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
  return s;
}

// UI texts from the content bible (09-ui-texte.md); 'ui.*' keys, registered like any feature's strings.
addStrings('de', deContent);
