import { describe, expect, it } from 'vitest';
import { FIND, angleDiff, createFindState, rejoinArc, stepFind, type FindInput } from '../src/systems/walk/find';

/** Run `seconds` of 0.1 s steps at a fixed distance (the guide straight ahead unless given). */
function run(s = createFindState(), seconds: number, i: Partial<FindInput> & { dist: number }) {
  const outs = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.1) outs.push(stepFind(s, { dt: 0.1, bearing: 0, heading: 0, holding: false, ...i }));
  return { s, outs, last: outs[outs.length - 1]! };
}

describe('finding the group (walk/find.ts)', () => {
  it('shows the guide marker beyond markerDist, with hysteresis, and when the guide is behind', () => {
    const s = createFindState();
    expect(run(s, 0.1, { dist: 20 }).last.marker).toBeNull();
    expect(run(s, 0.1, { dist: FIND.markerDist + 1 }).last.marker).toEqual({ bearing: 0, dist: FIND.markerDist + 1 });
    // back to 25 m: still shown (hysteresis), gone within markerHide
    expect(run(s, 0.1, { dist: 25 }).last.marker).not.toBeNull();
    expect(run(s, 0.1, { dist: FIND.markerHide - 1 }).last.marker).toBeNull();
    // 16 m but the guide behind the player (out of the view cone): shown
    const back = run(createFindState(), 0.1, { dist: 16, bearing: 180, heading: 0 }).last;
    expect(back.marker).toEqual({ bearing: 180, dist: 16 });
    // 16 m in view: not
    expect(run(createFindState(), 0.1, { dist: 16, bearing: 30, heading: 0 }).last.marker).toBeNull();
  });

  it('calls out once per stray episode (far, or walking away for awaySeconds)', () => {
    const s = createFindState();
    const far = run(s, 5, { dist: FIND.callDist + 5 });
    expect(far.outs.filter((o) => o.call)).toHaveLength(1);
    // still away: no second call; between episodeEnd and callDist: none either
    expect(run(s, 30, { dist: FIND.callDist + 20 }).outs.some((o) => o.call)).toBe(false);
    expect(run(s, 5, { dist: 30 }).outs.some((o) => o.call)).toBe(false);
    // back with the group ends the episode; the next stray calls again
    run(s, 1, { dist: FIND.episodeEnd - 2 });
    expect(run(s, 1, { dist: FIND.callDist + 1 }).outs.filter((o) => o.call)).toHaveLength(1);
    // walking away slowly (26 → 39 m, never past callDist) calls after awaySeconds
    const w = createFindState();
    let calledAt = -1;
    for (let i = 0; i < 130; i++) {
      const o = stepFind(w, { dt: 0.1, dist: 26 + i * 0.1, bearing: 0, heading: 0, holding: false });
      if (o.call) calledAt = (i + 1) * 0.1;
    }
    expect(calledAt).toBeGreaterThanOrEqual(FIND.awaySeconds - 0.05);
    expect(calledAt).toBeLessThan(FIND.awaySeconds + 0.5);
    // the guide walking off while the player stands still is not „walking away“ (the leash waits)
    const still = createFindState();
    let calls = 0;
    for (let i = 0; i < 130; i++) if (stepFind(still, { dt: 0.1, dist: 26 + i * 0.1, bearing: 0, heading: 0, holding: false, moving: false }).call) calls++;
    expect(calls).toBe(0);
  });

  it('offers „Zur Gruppe“ after rejoinAfter s apart or beyond rejoinDist; the hold rejoins once', () => {
    const s = createFindState();
    expect(run(s, FIND.rejoinAfter - 1, { dist: 45 }).last.prompt).toBe(false);
    expect(run(s, 1.5, { dist: 45 }).last.prompt).toBe(true);
    // a short press does nothing; the hold fills and rejoins once
    expect(run(s, 0.5, { dist: 45, holding: true }).last.rejoin).toBe(false);
    run(s, 0.1, { dist: 45 });
    const held = run(s, FIND.hold + 0.2, { dist: 45, holding: true });
    expect(held.outs.filter((o) => o.rejoin)).toHaveLength(1);
    expect(held.outs.find((o) => o.rejoin)!.prompt).toBe(false);
    // far at once: offered at once
    expect(run(createFindState(), 0.1, { dist: FIND.rejoinDist + 1 }).last.prompt).toBe(true);
    // back within markerHide: the offer goes
    const b = createFindState();
    run(b, 0.1, { dist: FIND.rejoinDist + 1 });
    expect(run(b, 0.1, { dist: FIND.markerHide - 1 }).last.prompt).toBe(false);
  });

  it('keeps quiet in a conversation or cinematic: no call, no prompt, timers pause', () => {
    const s = createFindState();
    const q = run(s, FIND.rejoinAfter + 5, { dist: 60, quiet: true });
    expect(q.outs.some((o) => o.call || o.prompt)).toBe(false);
    expect(s.apart).toBe(0);
    // the marker still shows the way
    expect(q.last.marker).not.toBeNull();
  });

  it('lands behind the tail on the route, never before its start', () => {
    expect(rejoinArc(100, 8)).toBe(100 - 8 - FIND.behind);
    expect(rejoinArc(100, 99)).toBe(100 - FIND.maxTail - FIND.behind);
    expect(rejoinArc(5, 8)).toBe(0);
    expect(angleDiff(350, 10)).toBe(-20);
    expect(angleDiff(10, 350)).toBe(20);
  });
});
