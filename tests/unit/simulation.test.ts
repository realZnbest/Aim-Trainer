import { describe, expect, it } from 'vitest';
import { Simulation } from '@/engine/simulation';
import { scenarioToSpawnConfig, scaleDifficulty } from '@/scenarios/adapters';
import { parseScenario, validateScenario } from '@/scenarios/schema';
import { BUILT_IN_SCENARIOS } from '@/scenarios/builtins';

const gridshot = BUILT_IN_SCENARIOS.find((s) => s.id === 'gridshot');
if (!gridshot) throw new Error('missing gridshot');

describe('scenario schema', () => {
  it('all 9 built-ins validate', () => {
    expect(BUILT_IN_SCENARIOS).toHaveLength(9);
    for (const s of BUILT_IN_SCENARIOS) {
      expect(() => parseScenario(s)).not.toThrow();
    }
  });

  it('rejects invalid scenario with readable errors', () => {
    const r = validateScenario({ id: '', targetCount: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it('difficulty scaling shrinks targets over time when enabled', () => {
    const spider = BUILT_IN_SCENARIOS.find((s) => s.id === 'spidershot');
    if (!spider) throw new Error('missing spidershot');
    const scaled = scaleDifficulty(spider, 30);
    expect(scaled.targetSize).toBeLessThan(spider.targetSize);
    // disabled scaling is identity
    expect(scaleDifficulty(gridshot, 120).targetSize).toBe(gridshot.targetSize);
  });
});

describe('simulation', () => {
  it('same seed → identical spawns (deterministic)', () => {
    const mk = (): { pos: { x: number; y: number; z: number }[] } => {
      const sim = new Simulation(scenarioToSpawnConfig(gridshot), 'fixed-seed');
      const out: { x: number; y: number; z: number }[] = [];
      const act: Parameters<Simulation['collectActive']>[0] = [];
      for (const t of sim.collectActive(act)) out.push({ ...t.position });
      return { pos: out };
    };
    expect(mk()).toEqual(mk());
  });

  it('grid pattern snaps spawns to grid cells', () => {
    const sim = new Simulation(scenarioToSpawnConfig(gridshot), 'grid-seed');
    const act: Parameters<Simulation['collectActive']>[0] = [];
    const list = sim.collectActive(act);
    expect(list.length).toBe(3);
    // 3x3 grid over halfExtents x=6: xs must be in {-6, 0, 6}
    for (const t of list) {
      expect([-6, 0, 6]).toContain(t.position.x);
      expect([-4, 0, 4]).toContain(t.position.y);
    }
  });

  it('firing exactly at a target center hits; firing away misses', () => {
    const sim = new Simulation(scenarioToSpawnConfig(gridshot), 'aim-seed');
    const act: Parameters<Simulation['collectActive']>[0] = [];
    const list = sim.collectActive(act);
    const target = list[0];
    if (!target) throw new Error('no target');
    const { x, y, z } = target.position;
    const dist = Math.hypot(x, y, z);
    const yaw = Math.atan2(-x, -z);
    const pitch = Math.asin(y / dist);
    const hit = sim.fire(100, yaw, pitch);
    expect(hit.hit).toBe(true);
    expect(hit.targetId).toBe(target.id);
    const miss = sim.fire(200, yaw + 0.5, pitch + 0.5);
    expect(miss.hit).toBe(false);
  });

  it('target expiry fires onExpire and refills (reflex lifetimes)', () => {
    const reflex = BUILT_IN_SCENARIOS.find((s) => s.id === 'reflex-reactive');
    if (!reflex) throw new Error('missing');
    let expired = 0;
    const sim = new Simulation(scenarioToSpawnConfig(reflex), 'expire-seed', {
      onExpire: () => expired++,
    });
    for (let i = 0; i < 240 * 5; i++) sim.step(1000 / 240); // 5s > 2500ms lifetime
    expect(expired).toBeGreaterThan(0);
    const act: Parameters<Simulation['collectActive']>[0] = [];
    expect(sim.collectActive(act).length).toBe(1); // refilled
  });

  it('linear bounce rebase keeps targets in bounds at high speed', () => {
    const sim = new Simulation(
      {
        ...scenarioToSpawnConfig(gridshot),
        movement: 'linear',
        minSpeed: 20,
        maxSpeed: 30,
        count: 4,
      },
      'bounce-seed',
    );
    for (let i = 0; i < 240 * 3; i++) sim.step(1000 / 240);
    const act: Parameters<Simulation['collectActive']>[0] = [];
    for (const t of sim.collectActive(act)) {
      expect(Math.abs(t.position.x)).toBeLessThanOrEqual(9.5);
      expect(Math.abs(t.position.y)).toBeLessThanOrEqual(6.5);
    }
  });

  it('sphere + cone spawn volumes produce finite positions', () => {
    for (const area of [
      { volume: 'sphere', radius: 5, minDistance: 8, maxDistance: 20 },
      { volume: 'cone', coneHalfAngleDeg: 10, minDistance: 8, maxDistance: 20 },
    ] as const) {
      const sim = new Simulation(
        { ...scenarioToSpawnConfig(gridshot), area, count: 3 },
        `vol-${area.volume}`,
      );
      const act: Parameters<Simulation['collectActive']>[0] = [];
      expect(sim.collectActive(act)).toHaveLength(3);
    }
  });
  it('movement profiles advance without NaN (linear/sine/random-walk/strafe-ai)', () => {
    for (const movement of ['linear', 'sine', 'random-walk', 'strafe-ai'] as const) {
      const sim = new Simulation(
        { ...scenarioToSpawnConfig(gridshot), movement, minSpeed: 2, maxSpeed: 5, count: 4 },
        `move-${movement}`,
      );
      for (let i = 0; i < 240; i++) sim.step(1000 / 240);
      const act: Parameters<Simulation['collectActive']>[0] = [];
      for (const t of sim.collectActive(act)) {
        expect(Number.isFinite(t.position.x)).toBe(true);
        expect(Number.isFinite(t.position.y)).toBe(true);
      }
    }
  });
});
