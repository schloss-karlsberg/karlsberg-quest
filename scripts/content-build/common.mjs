// Shared helpers for the content-pack builders (`node scripts/content-build/build.mjs`).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { centroid } from './terrain.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const rooms = JSON.parse(readFileSync(`${ROOT}/public/data/palace/rooms.json`, 'utf8')).rooms;
const r1 = (v) => Math.round(v * 10) / 10;

/** Room centroid (area centroid of the catalogue v2 polygon) by roomId. */
export function room(roomId) {
  const r = rooms.find((q) => q.roomId === roomId);
  if (!r) throw new Error(`unknown room ${roomId}`);
  const [x, z] = centroid(r.polygon);
  return [r1(x), r1(z)];
}

// ---- sources (07-codex.md, Quellen-Tabelle)
const S = {
  M1910: ['https://archive.org/details/eindeutschermale00mann', 'M1910: Mannlich, Ein deutscher Maler und Hofmann (hg. Stollreither, 1910)'],
  'WP-SK': ['https://de.wikipedia.org/wiki/Schloss_Karlsberg', 'de.wikipedia: Schloss Karlsberg'],
  'WP-K2A': ['https://de.wikipedia.org/wiki/Karl_II._August', 'de.wikipedia: Karl II. August'],
  ADB: ['https://de.wikisource.org/wiki/ADB:Karl_II._(Herzog_von_Pfalz-Zweibr%C3%BCcken)', 'ADB: Karl II. (Herzog von Pfalz-Zweibrücken)'],
  RLS: ['https://www.rosalux.de/news/id/692/der-karlsberg-von-barocker-pracht-zur-baustoffhandlung', 'Rosa-Luxemburg-Stiftung 2015: Der Karlsberg – von barocker Pracht zur Baustoffhandlung'],
  HOM: ['https://www.homburg.de/leben-in-homburg/touristisches/sehenswertes/schloss-karlsberg/', 'Stadt Homburg: Schloss Karlsberg'],
  SBT: ['https://www.homburg.de/media/scllyew0/schlossbergtour.pdf', 'Stadt Homburg: Faltblatt Schlossbergtour'],
  SPT: ['https://www.saarpfalz-touristik.de/attraktionen/baerenzwinger-b8c8db2c7d', 'Saarpfalz-Touristik: Bärenzwinger'],
  US: ['https://www.urlaub.saarland/attraktion/baerenzwinger-1986e52928', 'urlaub.saarland: Bärenzwinger'],
  'EN-KC': ['https://en.wikipedia.org/wiki/Karlsberg_Castle', 'en.wikipedia: Karlsberg Castle'],
  SKD: ['https://schloss-karlsberg.de/schloss-karlsberg-3/', 'schloss-karlsberg.de (Dr. Jutta Schwan)'],
  HIB: ['http://nhp-2000.de/homburg-im-bild/html/body_-_chronologie_schloss_karlsber.html', 'homburg-im-bild (Hobbyseite): Chronologie Schloss Karlsberg'],
  'HIB-VITA': ['http://nhp-2000.de/homburg-im-bild/html/body_-_vita_karl_ii_august_christia.html', 'homburg-im-bild (Hobbyseite): Vita Karl II. August'],
  RP18: ['https://www.rheinpfalz.de/lokal/kreis-suedwestpfalz_artikel,-zerst%C3%B6rte-pracht-jetzt-wieder-sichtbar-_arid,1312894.html', 'Die Rheinpfalz 2018: Zerstörte Pracht jetzt wieder sichtbar'],
  HMS: ['https://www.historisches-museum.org/steinerne-macht', 'Historisches Museum Saar: Steinerne Macht'],
  SCHWAN12: ['https://journals.ub.uni-heidelberg.de/index.php/bus/article/download/53625/47240', 'J. Schwan, Schloss Carlsberg bei Homburg-Saar, Burgen und Schlösser 53 (2012) 4'],
  DA85: ['https://nbn-resolving.org/urn:nbn:de:tuda-tudigit-84275', 'ULB Darmstadt: Mannlich, Plan d[e] la foire … 1785 (CC0)'],
  NDB: ['https://www.deutsche-biographie.de/sfz28384.html', 'Deutsche Biographie: Christian Ludwig Hautt'],
  LIT: ['https://www.literaturland-saar.de/orte/homburg/', 'Literaturland Saar: Homburg'],
  'EN-HB': ['https://en.wikipedia.org/wiki/Hohenburg_Castle_(Homburg)', 'en.wikipedia: Hohenburg Castle (Homburg)'],
  BW: ['https://www.burgenwelt.org/deutschland/hohenburg/burgenwelt-hohenburg-objektseite.pdf', 'Burgenwelt: Hohenburg'],
  'WP-JB': ['https://de.wikipedia.org/wiki/Schloss_J%C3%A4gersburg', 'de.wikipedia: Schloss Jägersburg'],
  'WP-WJ': ['https://de.wikipedia.org/wiki/Wilde_Jagd', 'de.wikipedia: Wilde Jagd'],
  HIST: ['https://geoportal.saarland.de/mapbender/php/mod_showMetadata.php?languageCode=de&resource=wms&id=2597', 'Geoportal Saarland: WMS Historische Karten (dl-de/by-2-0)'],
  LVGL: ['https://www.shop.lvgl.saarland.de/', 'LVGL Saarland: Geobasisdaten (DGM1 2025, offene Daten)'],
  SDSCHG: ['https://umwelt-online.de/recht/bau/laender/saarland/dschg18.htm', 'Saarländisches Denkmalschutzgesetz'],
  'HE-BW': ['https://denkmal.hessen.de/sites/denkmal.hessen.de/files/2022-08/bodendenkmaeler-unter-wald_0.pdf', 'Landesamt für Denkmalpflege Hessen: Bodendenkmäler unter Wald'],
  HP: ['https://schloss-karlsberg.de/hoerpfad-schloss-karlsberg/', 'Hörpfad Schloss Karlsberg'],
  WPK: ['https://www.outdooractive.com/de/poi/saarpfalz-kreis/waldpark-schloss-karlsberg/61542782/', 'WaldPark Schloss Karlsberg (outdooractive)'],
  'OSM-KQ': ['https://www.openstreetmap.org/node/368031320', 'OpenStreetMap: Karlsbergquelle (natural=spring) und Karlsbergbach'],
  'KOMOOT-KQ': ['https://www.komoot.com/highlight/780842', 'komoot-Highlight 780842: Quelle am Karlsberg (Fotos)'],
  // Knigge and the court's access rules (IDEAS-ROUND11 §2.2, research 2026-11-20)
  'KNIGGE-BRIEFE': ['https://www.digitale-sammlungen.de/en/view/bsb10467161', 'Knigge (Hg.): Briefe, auf einer Reise aus Lothringen nach Niedersachsen geschrieben (Hannover 1793)'],
  'KNIGGE-UMGANG-1790': ['https://www.digitale-sammlungen.de/en/view/bsb10041018', 'Knigge: Ueber den Umgang mit Menschen, 3. Aufl., Teil 3 (Hannover 1790)'],
  'ADB-KNIGGE': ['https://de.wikisource.org/wiki/ADB:Knigge,_Adolph_Freiherr', 'ADB: Knigge, Adolph Freiherr (Erich Schmidt, 1882)'],
  'WP-KNIGGE': ['https://de.wikipedia.org/wiki/Adolph_Freiherr_Knigge', 'de.wikipedia: Adolph Freiherr Knigge'],
  'LITSAAR-KNIGGE': ['https://www.literaturland-saar.de/personen/adolph-freiherr-knigge/', 'Literaturland Saar: Adolph Freiherr Knigge'],
  SMZW: ['https://www.zweibruecken.de/de/kultur-tourismus/kultur-erleben/kulturelle-einrichtungen/stadtmuseum/neuigkeiten/', 'Stadtmuseum Zweibrücken: Das Tablett „Le Château de Carlsberg“'],
};
/** LIDAR (own analysis, not public): cited via the open DGM1 data + a note. */
const LIDAR_NOTE = 'LIDAR: eigene Auswertung des DGM1 2025 (Geländeanalyse des Projekts, unveröffentlicht)';

/** src('M1910', 'S. 423 · Z') → SourceRef. 'LIDAR' maps to the LVGL data + note. */
export function src(key, note) {
  if (key === 'LIDAR') return { url: S.LVGL[0], label: 'LIDAR (DGM1 2025, LVGL Saarland)', note: note ? `${LIDAR_NOTE}; ${note}` : LIDAR_NOTE };
  const s = S[key];
  if (!s) throw new Error(`unknown source ${key}`);
  const o = { url: s[0], label: s[1] };
  if (note) o.note = note;
  return o;
}
/** Quote markers in dialogue source notes: Z = wörtlich, P = Paraphrase. */
export const Z = (page) => src('M1910', `Z · ${page}`);
export const P = (page) => src('M1910', `P · ${page}`);

// ---- builders
export function clue(id, o) {
  const [x, z] = o.room ? room(o.room) : o.at;
  const c = { id, title_de: o.title, kind: o.kind };
  if (o.text) c.text_de = o.text;
  c.where = { x, z, radius: o.r, era: o.era };
  const anchor = o.anchor ?? o.room;
  if (anchor) c.where.anchor = anchor;
  const reveals = {};
  if (o.nouns?.length) reveals.nouns = o.nouns;
  if (o.facts?.length) reveals.facts = o.facts;
  if (o.flags?.length) reveals.flags = o.flags;
  c.reveals = reveals;
  if (o.req) c.requires = o.req;
  if (o.fiction !== undefined) c.fiction = o.fiction;
  if (o.echoDate) c.echoDate_de = o.echoDate;
  if (o.lantern) c.needsLantern = true;
  if (o.prompt) c.prompt_de = o.prompt;
  c.chapter = o.chapter;
  // the card's relief sketch shows another place than the find spot (a printout of the Ehrenhof …)
  if (o.sketch) c.sketch = { x: o.sketch[0], z: o.sketch[1], ...(o.sketch[2] ? { size: o.sketch[2] } : {}) };
  return c;
}

export function noun(id, label, category, plural) {
  const n = { id, label_de: label, category };
  if (plural) n.plural_de = plural;
  return n;
}

/** Dialogue line. trigger = { event, ...conditions }. */
export function say(id, speaker, text, trigger, o = {}) {
  const d = { id, speaker, text_de: text, trigger };
  if (o.once !== undefined) d.once = o.once;
  if (o.priority !== undefined) d.priority = o.priority;
  if (o.src) d.sources = o.src;
  return d;
}

/** Sequence of lines for one echo / beat / talk topic: lines = [[id, speaker, text, src?], ...]. */
export function seq(trigger, lines, o = {}) {
  return lines.map(([id, speaker, text, srcs], i) =>
    say(id, speaker, text, { ...trigger, step: i + 1 }, { once: o.once ?? true, src: srcs }),
  );
}

export function hints(caseId, chapter, texts) {
  const after = [240, 480, 720];
  return texts.map((t, i) => ({ id: `hint.${chapter}.${i + 1}`, caseId, level: i + 1, text_de: t, afterSeconds: after[i] }));
}

export function write(name, pack) {
  mkdirSync(`${ROOT}/content/packs`, { recursive: true });
  const out = { $schema: '../schema/pack.schema.json', ...pack };
  writeFileSync(`${ROOT}/content/packs/${name}.pack.json`, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${name}.pack.json`);
}
