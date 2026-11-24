import contributorsFile from '../../../content/credits.json';
import creditsFile from '../../../content/party/credits.json';
import type { LicenceRecord, LicencesFile, VoiceCredit } from '../../assets/types';

interface Contributors {
  people: readonly { name: string; role: string; links?: readonly string[] }[];
  closing: string;
}

interface CreditRow {
  text: string;
  links?: readonly string[];
}

interface CreditSection {
  kind?: 'intro' | 'sources';
  title?: string;
  rows: CreditRow[];
}

type CreditManifest = {
  assets: readonly Pick<LicenceRecord, 'source' | 'author' | 'licence'>[];
  voices?: readonly Pick<VoiceCredit, 'name' | 'realPerson' | 'tool' | 'toolLicence' | 'outputLicence'>[];
  libraries?: LicencesFile['libraries'];
};

const SOURCE_NAMES: Record<string, string> = {
  'polyhaven.com': 'Poly Haven',
  'ambientcg.com': 'ambientCG',
  'kenney.nl': 'Kenney',
  'quaternius.com': 'Quaternius',
  'static.makehumancommunity.org': 'MakeHuman',
};

function assetCredits(assets: CreditManifest['assets']): string[] {
  const sources = new Map<string, { authors: Set<string>; licences: Set<string> }>();
  for (const asset of assets) {
    const source = new URL(asset.source).hostname.replace(/^www\./, '');
    const group = sources.get(source) ?? { authors: new Set<string>(), licences: new Set<string>() };
    // Commas inside parentheses belong to the collective byline, e.g. MakeHuman Community.
    for (const name of asset.author.split(/,(?![^()]*\))/).map((name) => name.trim()).filter(Boolean)) {
      group.authors.add(name);
    }
    group.licences.add(asset.licence);
    sources.set(source, group);
  }
  return Array.from(sources, ([source, { authors, licences }]) =>
    `${SOURCE_NAMES[source] ?? source} (${[...licences].join(', ')}): ${[...authors].join(', ')}`,
  );
}

const rows = (lines: readonly string[]): CreditRow[] => lines.map((text) => ({ text }));

/** The same ordered credits for the party strip and the ending's credits page. */
export function creditSections(manifest: CreditManifest | null, contributors: Contributors = contributorsFile): CreditSection[] {
  const voices = new Set(manifest?.voices?.map(({ name, realPerson, tool, toolLicence, outputLicence }) =>
    realPerson
      ? `${name} · Stimme mit Einwilligung, nur zur Verwendung in Karlsberg Quest.`
      : `Synthetische Stimmen: ${tool} (${toolLicence}), Aufnahmen: ${outputLicence}`,
  ));
  const libraries = manifest?.libraries?.map(({ name, licence }) => `${name.split(' (')[0]} (${licence})`) ?? ['three.js (MIT)'];
  const assets = [...assetCredits(manifest?.assets ?? []), ...voices];
  return [
    { kind: 'intro', title: creditsFile.title, rows: rows([creditsFile.project]) },
    {
      title: 'Mitwirkende',
      rows: [
        ...contributors.people.map(({ name, role, links }) => ({ text: `${name} · ${role}`, links })),
        { text: contributors.closing },
      ],
    },
    ...(assets.length ? [{ title: 'Modelle, Texturen und Stimmen', rows: rows(assets) }] : []),
    { title: 'Werkzeuge und Bibliotheken', rows: rows([...libraries, ...creditsFile.tools]) },
    { kind: 'sources', title: 'Quellen und Datenlizenzen', rows: rows(creditsFile.data) },
    { rows: rows(creditsFile.closing) },
  ];
}

export function creditLines(sections: readonly CreditSection[]): string[] {
  return sections.flatMap(({ title, rows }) => [...(title ? [title] : []), ...rows.map(({ text }) => text)]);
}
