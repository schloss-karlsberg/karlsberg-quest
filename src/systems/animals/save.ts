/** Save / restore of the whole animal core (deer + dogs) as one JSON slice. */
import { restoreDeer, serializeDeer, type Deer } from './deer';
import { restoreDog, serializeDog, type Dog } from './dogs';
import { isRecord } from '../../core/saved';
import type { AnimalSave, DeerSave, DogSave } from './types';

export function serializeAnimals(deer: readonly Deer[], dogs: readonly Dog[]): AnimalSave {
  return { v: 1, deer: deer.map(serializeDeer), dogs: dogs.map(serializeDog) };
}

/** Unknown versions or a missing slice restore as empty (the story re-spawns its animals). */
export function restoreAnimals(s: Partial<AnimalSave> | null | undefined): { deer: Deer[]; dogs: Dog[] } {
  if (!s || s.v !== 1) return { deer: [], dogs: [] };
  // Corrupt entries (not an object, no id) are dropped; the story re-spawns what it needs.
  const herd = (Array.isArray(s.deer) ? s.deer : []).filter((d): d is DeerSave => isRecord(d) && typeof d.id === 'string');
  const pack = (Array.isArray(s.dogs) ? s.dogs : []).filter((d): d is DogSave => isRecord(d) && typeof d.id === 'string');
  return { deer: herd.map((deer) => restoreDeer(deer, herd)), dogs: pack.map(restoreDog) };
}
