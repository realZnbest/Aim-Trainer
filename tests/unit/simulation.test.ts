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
    expect(list.length).toBe(4);
    // 5x5 grid over halfExtents x=6/y=4: snapped lattice points only
    for (const t of list) {
      expect([-6, -3, 0, 3, 6]).toContain(t.position.x);
      expect([-4, -2, 0, 2, 4]).toContain(t.position.y);
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
          log.push(list.map((t) => `${String(t.id)}:${t.position.x.toFixed(3)}`).join('|'));
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

  it('switching duel: exactly one live target, alternating sides on kill', () => {
    const sw = BUILT_IN_SCENARIOS.find((s) => s.id === 'switching');
    if (!sw) throw new Error('missing');
    const sim = new Simulation(scenarioToSpawnConfig(sw), 'duel-seed');
    const act: Parameters<Simulation['collectActive']>[0] = [];
    const aimAt = (t: { position: { x: number; y: number; z: number } }): [number, number] => {
      const { x, y, z } = t.position;
      const dist = Math.hypot(x, y, z);
      return [Math.atan2(-x, -z), Math.asin(Math.max(-1, Math.min(1, y / dist)))];
    };

    // Two targets up, opposite sides, exactly one live.
    let list = sim.collectActive(act);
    expect(list).toHaveLength(2);
    expect(list.filter((t) => !t.dormant)).toHaveLength(1);
    expect(Math.sign(list[0]?.position.x ?? 0)).not.toBe(Math.sign(list[1]?.position.x ?? 0));

    // Shooting the dormant (dim) target is a miss.
    const dormant = list.find((t) => t.dormant);
    if (!dormant) throw new Error('no dormant');
    const [dyaw, dpitch] = aimAt(dormant);
    expect(sim.fire(sim.time, dyaw, dpitch).hit).toBe(false);

    // Kill the live one → the other side wakes, killed side re-arms dormant.
    const live = list.find((t) => !t.dormant);
    if (!live) throw new Error('no live');
    const liveSide = Math.sign(live.position.x);
    const [lyaw, lpitch] = aimAt(live);
    const kill = sim.fire(100, lyaw, lpitch);
    expect(kill.hit).toBe(true);
    expect(kill.killed).toBe(true);
    list = sim.collectActive(act);
    expect(list).toHaveLength(2);
    const nowLive = list.filter((t) => !t.dormant);
    expect(nowLive).toHaveLength(1);
    // The live target switched sides…
    expect(Math.sign(nowLive[0]?.position.x ?? 0)).toBe(-liveSide);
    // …and its clock restarted so reactionMs measures switch time.
    expect(nowLive[0]?.spawnTimeMs).toBe(100);

    // Deterministic duel for the same seed.
    const run = (): string => {
      const s2 = new Simulation(scenarioToSpawnConfig(sw), 'duel-det');
      const a2: Parameters<Simulation['collectActive']>[0] = [];
      const log: string[] = [];
      let yawSweep = 0;
      for (let i = 0; i < 240 * 4; i++) {
        s2.step(1000 / 240);
        yawSweep += 0.002;
        if (i % 20 === 0) {
          const sh = s2.fire(s2.time, yawSweep, 0);
          log.push(`${sh.hit ? '1' : '0'}:${String(s2.collectActive(a2).length)}`);
        }
      }
      return log.join(';');
    };
    expect(run()).toBe(run());
  });

  it('target-switching: replacements land far from the kill (long flicks)', () => {
    const tss = BUILT_IN_SCENARIOS.find((s) => s.id === 'target-switching-speed');
    if (!tss) throw new Error('missing');
    const sim = new Simulation(scenarioToSpawnConfig(tss), 'switch-seed');
    const act: Parameters<Simulation['collectActive']>[0] = [];
    expect(sim.collectActive(act)).toHaveLength(5);

    const gaps: number[] = [];
    for (let k = 0; k < 8; k++) {
      const list = sim.collectActive(act);
      const known = new Set(list.map((t) => t.id));
      const victim = list[0];
      if (!victim) throw new Error('no target');
      const grave = { ...victim.position };
      const { x, y, z } = victim.position;
      const dist = Math.hypot(x, y, z);
      const shot = sim.fire(
        sim.time + k,
        Math.atan2(-x, -z),
        Math.asin(Math.max(-1, Math.min(1, y / dist))),
      );
      expect(shot.hit).toBe(true);
      // Count holds at 5 — the replacement spawned synchronously with the kill.
      const after = sim.collectActive(act);
      expect(after).toHaveLength(5);
      // The newcomer (unknown id) must be far from the kill point.
      const newcomer = after.find((t) => !known.has(t.id));
      if (!newcomer) throw new Error('no replacement');
      gaps.push(
        Math.hypot(
          newcomer.position.x - grave.x,
          newcomer.position.y - grave.y,
          newcomer.position.z - grave.z,
        ),
      );
    }
    // Box is 12m wide: farthest-of-6 candidates must average a long flick.
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(Math.min(...gaps)).toBeGreaterThan(4);
    expect(avg).toBeGreaterThan(7);

    // Deterministic for the same seed.
    const run = (): string => {
      const s2 = new Simulation(scenarioToSpawnConfig(tss), 'switch-det');
      const a2: Parameters<Simulation['collectActive']>[0] = [];
      const log: string[] = [];
      for (let i = 0; i < 240 * 3; i++) {
        s2.step(1000 / 240);
        if (i % 30 === 0) {
          const l = s2.collectActive(a2);
          const v = l[0];
          if (v) {
            const { x, y, z } = v.position;
            const d = Math.hypot(x, y, z);
            s2.fire(s2.time, Math.atan2(-x, -z), Math.asin(Math.max(-1, Math.min(1, y / d))));
          }
          log.push(
            s2
              .collectActive(a2)
              .map((t) => t.position.x.toFixed(2))
              .join(','),
          );
        }
      }
      return log.join(';');
    };
    expect(run()).toBe(run());
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

  it('all spawns share one plane — no front-back layering', () => {
    const act: Parameters<Simulation['collectActive']>[0] = [];
    const planeOf = (s: (typeof BUILT_IN_SCENARIOS)[number]): number =>
      -(s.spawnArea.minDistance + s.spawnArea.maxDistance) / 2;
    for (const s of BUILT_IN_SCENARIOS) {
      for (const movement of [s.movementProfile, 'strafe-ai'] as const) {
        const sim = new Simulation(
          { ...scenarioToSpawnConfig(s), movement, count: Math.min(s.targetCount, 5) },
          `plane-${s.id}-${movement}`,
        );
        // Kill + refill across 5s of ticks: every generation must sit on the plane.
        for (let i = 0; i < 240 * 5; i++) {
          sim.step(1000 / 240);
          const list = sim.collectActive(act);
          for (const t of list) {
            expect(t.position.z).toBe(planeOf(s));
            // Fire at it so refills cycle in (dormant duel targets are unhittable).
            if (!t.dormant) {
              const d = Math.hypot(t.position.x, t.position.y, t.position.z);
              sim.fire(
                sim.time,
                Math.atan2(-t.position.x, -t.position.z),
                Math.asin(Math.max(-1, Math.min(1, t.position.y / d))),
              );
            }
          }
        }
      }
    }
  });

  it('spawns never stack on a live target (min separation)', () => {
    const act: Parameters<Simulation['collectActive']>[0] = [];
    for (const s of BUILT_IN_SCENARIOS) {
      const sim = new Simulation(
        { ...scenarioToSpawnConfig(s), count: Math.min(s.targetCount, 5) },
        `nostack-${s.id}`,
      );
      const seen = new Set<number>();
      for (let i = 0; i < 240 * 5; i++) {
        sim.step(1000 / 240);
        const list = sim.collectActive(act);
        for (const t of list) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            // Fresh spawn: must clear every other live target (no overlap).
            for (const o of list) {
              if (o === t) continue;
              const d = Math.hypot(
                t.position.x - o.position.x,
                t.position.y - o.position.y,
                t.position.z - o.position.z,
              );
              expect(d).toBeGreaterThanOrEqual(t.radius + o.radius);
            }
          }
          if (!t.dormant) {
            const d = Math.hypot(t.position.x, t.position.y, t.position.z);
            sim.fire(
              sim.time,
              Math.atan2(-t.position.x, -t.position.z),
              Math.asin(Math.max(-1, Math.min(1, t.position.y / d))),
            );
          }
        }
      }
    }
  });
});
