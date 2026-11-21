/** Tour C5: Jost's dogs Diane and Bijou (src/systems/animals/dogs.ts). */
import { describe, expect, it } from 'vitest';
import { DOGS, DOG_SPEEDS, applyDogRequest, createDog, dogSlot, restoreDog, serializeDog, stepDogs, type Dog, type DogTarget } from '../src/systems/animals/dogs';
import { restoreAnimals, serializeAnimals } from '../src/systems/animals/save';
import type { AnimalEvent } from '../src/systems/animals/types';

const DT = 1 / 60;

function setup(): { dogs: Dog[]; jost: DogTarget; player: DogTarget; resolve: (r: string) => DogTarget | null } {
  const jost: DogTarget = { x: 700, z: -640, yaw: 0, speed: 0 };
  const player: DogTarget = { x: 705, z: -630, yaw: Math.PI, speed: 0 };
  const dogs = [
    createDog({ op: 'spawn', id: 'diane', kind: 'hund', look: 'diane', x: 703, z: -636, follow: 'npc:double.jost' }),
    createDog({ op: 'spawn', id: 'bijou', kind: 'hund', look: 'bijou', x: 697, z: -636, follow: 'npc:double.jost' }),
  ];
  const resolve = (r: string) => (r === 'npc:double.jost' ? jost : r === 'player' ? player : null);
  return { dogs, jost, player, resolve };
}

function run(dogs: Dog[], seconds: number, resolve: (r: string) => DogTarget | null, each?: (t: number) => void, log: AnimalEvent[] = []): AnimalEvent[] {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    each?.(i * DT);
    log.push(...stepDogs(dogs, DT, resolve));
  }
  return log;
}

const gap = (d: Dog, t: DogTarget) => {
  const s = dogSlot(t, d.slot, d.spacing);
  return Math.hypot(d.x - s.x, d.z - s.z);
};

describe('dogs: follow', () => {
  it('take their slots beside Jost and sit when he stands still', () => {
    const { dogs, jost, resolve } = setup();
    run(dogs, 6, resolve);
    for (const d of dogs) {
      expect(gap(d, jost)).toBeLessThan(DOGS.AT_SLOT);
      expect(d.state).toBe('sit');
      expect(d.motion.clip).toBe('sit');
    }
    // slots differ (left / right)
    expect(Math.hypot(dogs[0]!.x - dogs[1]!.x, dogs[0]!.z - dogs[1]!.z)).toBeGreaterThan(1);
  });

  it('keep up while Jost walks, using only fauna clips', () => {
    const { dogs, jost, resolve } = setup();
    const clips = new Set<string>();
    run(dogs, 20, resolve, () => {
      jost.speed = 1.6;
      jost.z -= 1.6 * DT;
      for (const d of dogs) clips.add(d.motion.clip);
    });
    for (const d of dogs) expect(gap(d, jost)).toBeLessThan(1.5);
    for (const c of clips) expect(['idle', 'walk', 'run', 'sniff', 'sit']).toContain(c);
    expect(clips.has('sniff')).toBe(true);
  });

  it('uses the fauna v0 speeds', () => {
    const { dogs } = setup();
    expect(dogs[0]!.run).toBe(DOG_SPEEDS.diane.run);
    expect(dogs[1]!.run).toBe(DOG_SPEEDS.bijou.run);
  });
});

describe('dogs: the t5 bolt', () => {
  it('bolt up the slope, bark, return and emit animal:returned exactly once each', () => {
    const { dogs, jost, resolve } = setup();
    run(dogs, 3, resolve);
    const log: AnimalEvent[] = [];
    log.push(...applyDogRequest(dogs[0]!, { op: 'run', id: 'diane', path: [[700, -640], [722, -688], [700, -640]], bark: true, back: true }));
    let far = 0;
    run(dogs, 0.4, resolve, () => (far = Math.max(far, Math.hypot(dogs[0]!.x - jost.x, dogs[0]!.z - jost.z))), log);
    log.push(...applyDogRequest(dogs[1]!, { op: 'run', id: 'bijou', path: [[701, -641], [716, -692], [701, -641]], bark: true, back: true }));
    run(dogs, 40, resolve, () => (far = Math.max(far, Math.hypot(dogs[0]!.x - jost.x, dogs[0]!.z - jost.z))), log);
    expect(far).toBeGreaterThan(45);
    for (const id of ['diane', 'bijou']) {
      expect(log.filter((e) => e.type === 'animal:returned' && e.id === id)).toHaveLength(1);
      expect(log.filter((e) => e.type === 'bark' && e.id === id)).toHaveLength(2); // start + the far point
    }
    for (const d of dogs) {
      expect(['follow', 'sit']).toContain(d.state);
      expect(gap(d, jost)).toBeLessThan(DOGS.RETURN_RADIUS);
    }
    // Diane (7 m/s) is back before Bijou (5 m/s) despite starting first by only 0.4 s
    const order = log.filter((e) => e.type === 'animal:returned').map((e) => e.id);
    expect(order).toEqual(['diane', 'bijou']);
  });

  it('without a follow target the end of the path counts as back', () => {
    const d = createDog({ op: 'spawn', id: 'diane', kind: 'hund', look: 'diane', x: 0, z: 0 });
    const log = applyDogRequest(d, { op: 'run', id: 'diane', path: [[0, 0], [10, 0], [0, 0]], back: true });
    run([d], 5, () => null, undefined, log);
    expect(log).toEqual([{ type: 'animal:returned', id: 'diane' }]);
    expect(d.state).toBe('idle');
  });

  it('save / restore mid-bolt continues and returns once', () => {
    const { dogs, resolve } = setup();
    applyDogRequest(dogs[0]!, { op: 'run', id: 'diane', path: [[700, -640], [722, -688], [700, -640]], bark: true, back: true });
    run(dogs, 3, resolve);
    expect(dogs[0]!.state).toBe('bolt');
    const saved = JSON.parse(JSON.stringify(serializeAnimals([], dogs))) as ReturnType<typeof serializeAnimals>;
    const back = restoreAnimals(saved).dogs;
    expect(back.map(serializeDog)).toEqual(dogs.map(serializeDog));
    const la = run(dogs, 20, resolve);
    const lb = run(back, 20, resolve);
    expect(lb).toEqual(la);
    expect(lb.filter((e) => e.type === 'animal:returned' && e.id === 'diane')).toHaveLength(1);
  });
});

describe('dogs: lie', () => {
  it('lie down at the player\'s feet for the party, then sleep', () => {
    const { dogs, player, resolve } = setup();
    for (const d of dogs) applyDogRequest(d, { op: 'lie', id: d.id, follow: 'player' });
    run(dogs, 30, resolve);
    for (const d of dogs) {
      expect(Math.hypot(d.x - player.x, d.z - player.z)).toBeLessThan(1.3);
      expect(d.motion.clip).toBe('sleep');
    }
    const r = restoreDog(JSON.parse(JSON.stringify(serializeDog(dogs[0]!))));
    expect(r.state).toBe('lie');
    expect(r.lie?.follow).toBe('player');
  });

  it('follow with no target stops following', () => {
    const { dogs, resolve } = setup();
    applyDogRequest(dogs[0]!, { op: 'follow', id: 'diane' });
    run(dogs, 1, resolve);
    expect(dogs[0]!.state).toBe('idle');
  });
});
