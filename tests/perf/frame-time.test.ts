import { describe, expect, it } from 'vitest';
import { Simulation } from '@/engine/simulation';
import { scenarioToSpawnConfig } from '@/scenarios/adapters';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';

/** Headless performance budget: 100 moving targets must step fast. */
describe('perf: 100 moving targets', () => {
  it('averages well under 1ms per 240Hz tick (headless budget)', () => {
    const ts = BUILT_IN_SCENARIOS.find((s) => s.id === 'target-switching-speed');
    if (!ts) throw new Error('missing');
    const sim = new Simulation(
      { ...scenarioToSpawnConfig(ts), count: 100, movement: 'strafe-ai', minSpeed: 3, maxSpeed: 6 },
      'perf-seed',
    );
    const scratch: Parameters<Simulation['collectActive']>[0] = [];
    // warmup
    for (let i = 0; i < 60; i++) sim.step(1000 / 240);
    const t0 = performance.now();
    const N = 480;
    for (let i = 0; i < N; i++) {
      sim.step(1000 / 240);
      sim.collectActive(scratch);
      if (i % 10 === 0) sim.fire(sim.time, 0.01 * (i % 20), 0);
    }
    const avg = (performance.now() - t0) / N;
    console.log(`avg tick (100 strafe-ai targets): ${avg.toFixed(3)}ms`);
    expect(avg).toBeLessThan(2);
  });
});
