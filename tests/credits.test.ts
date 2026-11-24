import { expect, it } from 'vitest';
import contributors from '../content/credits.json';

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
