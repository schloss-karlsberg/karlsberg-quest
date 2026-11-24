import { expect, it } from 'vitest';
import contributors from '../content/credits.json';
import manifest from '../public/assets/LICENSES.json';
import { creditLines, creditSections } from '../src/systems/party/creditContent';

it('credits the approved contributors and closing line in a reusable format', () => {
  expect(contributors.people).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Jan Eric Rippel', role: 'Inspiration der Tour, Stimme des Spielers' }),
    expect.objectContaining({ name: 'Sebastian Heußer', role: 'Idee, Konzept und Entwicklung' }),
  ]));
  expect(contributors.closing).toBe('und alle, die noch kommen');
  for (const person of contributors.people) {
    expect(typeof person.name === 'string' && person.name.trim().length > 0).toBe(true);
    expect(typeof person.role === 'string' && person.role.trim().length > 0).toBe(true);
    if ('links' in person) {
      expect(Array.isArray(person.links)).toBe(true);
      for (const link of person.links as string[]) {
        expect(typeof link).toBe('string');
        expect(['http:', 'https:']).toContain(new URL(link).protocol);
      }
    }
  }
});

it('groups new asset bylines by source, with distinct authors and licences', () => {
  const lines = creditLines(creditSections({
    assets: [
      { source: 'https://polyhaven.com/a/one', author: ' Author A, Author B ', licence: 'CC0-1.0' },
      { source: 'https://www.polyhaven.com/a/two', author: 'Author A, Author C', licence: 'CC0-1.0' },
      { source: 'https://polyhaven.com/a/three', author: 'Author C', licence: 'CC-BY-4.0' },
      { source: 'https://poly.pizza/m/four', author: 'Author A', licence: 'CC0-1.0' },
      { source: 'https://static.makehumancommunity.org/about/license.html', author: 'MakeHuman Community (Author D, Author E), Author F', licence: 'CC0-1.0' },
    ],
  }));
  expect(lines).toContain('Poly Haven (CC0-1.0, CC-BY-4.0): Author A, Author B, Author C');
  expect(lines).toContain('poly.pizza (CC0-1.0): Author A');
  expect(lines).toContain('MakeHuman (CC0-1.0): MakeHuman Community (Author D, Author E), Author F');
});

it('assembles the real credits in reading order and lists the voice model once', () => {
  const lines = creditLines(creditSections(manifest));
  expect(lines[0]).toBe('Karlsberg Quest · Das Land erinnert sich');
  const order = [
    'Mitwirkende',
    'Jan Eric Rippel · Inspiration der Tour, Stimme des Spielers',
    'und alle, die noch kommen',
    'Modelle, Texturen und Stimmen',
    'Werkzeuge und Bibliotheken',
    'three.js (MIT)',
    'Quellen und Datenlizenzen',
    'Danke fürs Spielen',
  ];
  expect(lines.filter((line) => order.includes(line))).toEqual(order);
  expect(lines.filter((line) => line.includes('MOSS-TTS'))).toEqual([
    'Synthetische Stimmen: MOSS-TTS-v1.5 (OpenMOSS) (Apache-2.0), Aufnahmen: CC0-1.0',
  ]);
  const text = lines.join('\n');
  expect(text).toMatch(/GeoBasis-DE\/LVGL-SL/);
  expect(text).toMatch(/OpenStreetMap/);
  expect(text).toMatch(/FIKTION/);
  expect(text).not.toMatch(/@|\/(Users|home)\//);
});

it('includes new contributor links and asset bylines in the sections rendered by the credits page', () => {
  const links = ['https://example.org'];
  const sections = creditSections({
    assets: [{ source: 'https://ambientcg.com/view?id=Test', author: 'Beispielatelier', licence: 'CC0-1.0' }],
  }, {
    people: [{ name: 'Beispielperson', role: 'Übersetzung', links }],
    closing: contributors.closing,
  });
  expect(sections.find(({ title }) => title === 'Mitwirkende')?.rows[0]).toEqual({
    text: 'Beispielperson · Übersetzung', links,
  });
  expect(sections.find(({ title }) => title === 'Modelle, Texturen und Stimmen')?.rows).toEqual([
    { text: 'ambientCG (CC0-1.0): Beispielatelier' },
  ]);
});
