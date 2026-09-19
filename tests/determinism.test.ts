import { describe, expect, it } from 'vitest';
import { Simulation } from '@/engine/simulation';
import { scenarioToSpawnConfig } from '@/scenarios/adapters';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';

/**
 * Determinism contract: same seed + same input stream → byte-identical results.
 * This is what makes replays valid.
 */
describe('determinism', () => {
  function run(seed: string): string {
    const gridshot = BUILT_IN_SCENARIOS.find((s) => s.id === 'gridshot');
    if (!gridshot) throw new Error('missing');
    const sim = new Simulation(scenarioToSpawnConfig(gridshot), seed);
    const shots: unknown[] = [];
    let yaw = 0;
    for (let tick = 0; tick < 480; tick++) {
      sim.step(1000 / 240);
      yaw += 0.001; // synthetic deterministic aim sweep
      if (tick % 24 === 0) shots.push(sim.fire(sim.time, yaw, 0));
    }
    return JSON.stringify(shots);
  }

  it('identical seed + inputs → identical shot stream', () => {
    expect(run('replay-seed-42')).toBe(run('replay-seed-42'));
  });

  it('different seed → different stream (sanity)', () => {
    expect(run('seed-a')).not.toBe(run('seed-b'));
  });
});
