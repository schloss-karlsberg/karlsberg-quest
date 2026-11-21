/** Save / restore of the whole animal core (deer + dogs) as one JSON slice. */
import { restoreDeer, serializeDeer, type Deer } from './deer';
import { restoreDog, serializeDog, type Dog } from './dogs';
import type { AnimalSave } from './types';

export function serializeAnimals(deer: readonly Deer[], dogs: readonly Dog[]): AnimalSave {
  return { v: 1, deer: deer.map(serializeDeer), dogs: dogs.map(serializeDog) };
}

/** Unknown versions or a missing slice restore as empty (the story re-spawns its animals). */
export function restoreAnimals(s: Partial<AnimalSave> | null | undefined): { deer: Deer[]; dogs: Dog[] } {
  if (!s || s.v !== 1) return { deer: [], dogs: [] };
  return { deer: (s.deer ?? []).map(restoreDeer), dogs: (s.dogs ?? []).map(restoreDog) };
}
