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

  it('target expiry fires onExpire and refills after the gap (reflex lifetimes)', () => {
    const reflex = BUILT_IN_SCENARIOS.find((s) => s.id === 'reflex-reactive');
    if (!reflex) throw new Error('missing');
    let expired = 0;
    const sim = new Simulation(scenarioToSpawnConfig(reflex), 'expire-seed', {
      onExpire: () => expired++,
    });
    const act: Parameters<Simulation['collectActive']>[0] = [];
    let maxActive = 0;
    for (let i = 0; i < 240 * 30; i++) {
      sim.step(1000 / 240); // 30s ≫ delay + lifetime cycles
      const n = sim.collectActive(act).length;
      if (n > maxActive) maxActive = n;
    }
    expect(expired).toBeGreaterThan(0);
    expect(maxActive).toBe(1); // replacements keep arriving between silent gaps
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
  it('reflex: replacement arrives after the silent gap, not instantly', () => {
    const reflex = BUILT_IN_SCENARIOS.find((s) => s.id === 'reflex-reactive');
    if (!reflex) throw new Error('missing');
    const sim = new Simulation(scenarioToSpawnConfig(reflex), 'gap-seed');
    const act: Parameters<Simulation['collectActive']>[0] = [];
    // First stimulus is present immediately…
    expect(sim.collectActive(act)).toHaveLength(1);
    // …kill it by firing at its exact position…
    const target = act[0];
    if (!target) throw new Error('no target');
    const { x, y, z } = target.position;
    const dist = Math.hypot(x, y, z);
    const shot = sim.fire(
      sim.time,
      Math.atan2(-x, -z),
      Math.asin(Math.max(-1, Math.min(1, y / dist))),
    );
    expect(shot.hit).toBe(true);
    // …and the screen stays empty through the minimum 800ms gap.
    for (let i = 0; i < 100; i++) sim.step(1000 / 240); // ~417ms
    expect(sim.collectActive(act)).toHaveLength(0);
    // The replacement must arrive inside the [800, 2400]ms window.
    let seenAt = -1;
    for (let i = 0; i < 240 * 4; i++) {
      sim.step(1000 / 240);
      if (seenAt < 0 && sim.collectActive(act).length > 0) seenAt = sim.time;
    }
    expect(seenAt).toBeGreaterThanOrEqual(800);
    expect(seenAt).toBeLessThanOrEqual(2400);
  });

  it('reflex gap schedule is deterministic for the same seed', () => {
    const reflex = BUILT_IN_SCENARIOS.find((s) => s.id === 'reflex-reactive');
    if (!reflex) throw new Error('missing');
    const run = (): string => {
      const sim = new Simulation(scenarioToSpawnConfig(reflex), 'gap-det');
      const act: Parameters<Simulation['collectActive']>[0] = [];
      const log: string[] = [];
      for (let i = 0; i < 240 * 6; i++) {
        sim.step(1000 / 240);
        if (i % 30 === 0) {
          const list = sim.collectActive(act);
          log.push(list.map((t) => `${t.id}:${t.position.x.toFixed(3)}`).join('|'));
        }
      }
      return log.join(';');
    };
    expect(run()).toBe(run());
  });

  it('spidershot refills instantly (no silent gap)', () => {
    const spider = BUILT_IN_SCENARIOS.find((s) => s.id === 'spidershot');
    if (!spider) throw new Error('missing');
    const sim = new Simulation(scenarioToSpawnConfig(spider), 'instant-seed');
    const act: Parameters<Simulation['collectActive']>[0] = [];
    expect(sim.collectActive(act)).toHaveLength(1);
    const target = act[0];
    if (!target) throw new Error('no target');
    const { x, y, z } = target.position;
    const dist = Math.hypot(x, y, z);
    sim.fire(sim.time, Math.atan2(-x, -z), Math.asin(Math.max(-1, Math.min(1, y / dist))));
    sim.step(1000 / 240); // a single tick…
    expect(sim.collectActive(act)).toHaveLength(1); // …and the next is already there
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
